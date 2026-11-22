# Shared Shopping List

An offline-first, real-time shared shopping list built with **React**, **Vite**, and **Yjs CRDTs**.

## Features

- **Conflict-free sync (Yjs CRDT):** Items are stored as per-item `Y.Map` records inside a shared `Y.Map` (`shopping-items`) and mutated in atomic transactions—concurrent offline toggles/edits merge cleanly without duplicating items.
- **Offline-first PWA:** Changes persist immediately to **IndexedDB** (`y-indexeddb`), and a service worker (`vite-plugin-pwa`) caches the app shell so it launches even with no mobile signal.
- **Resilient zero-backend sharing:** Share links include both `?room=<id>` and a URL-hash CRDT snapshot (`#state=...`), so even if the default public WebSocket relay restarts while devices are offline, opening a shared link hydrates and merges the full list.
- **Multi-list support:** Remembers your last active list and recent lists in `localStorage`, so reopening the root URL or home-screen icon returns you to your list instead of creating an empty one.
- **Everyday list UX:** Live connected device count (Yjs Awareness), inline item editing, undo/redo (`Y.UndoManager`), clear completed, and mobile Web Share API support.

## Local Development

Requires **Node.js 20.19+ or 22.12+**.

```bash
npm ci
npm run dev
```

### Useful Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Start Vite dev server |
| `npm run lint` | Run ESLint |
| `npm test` | Run Vitest unit & CRDT conflict-resolution tests |
| `npm run build` | Build production bundle + PWA service worker into `dist/` |
| `npm run preview` | Preview the production build locally |

### Environment Variables

Copy [`.env.example`](./.env.example) to `.env.local` if you want to override defaults:

| Variable | Default | Description |
| :--- | :--- | :--- |
| `VITE_WS_URL` | `wss://demos.yjs.dev/ws` | WebSocket server URL for `y-websocket` sync. |
| `VITE_WS_ROOM_PREFIX` | `albertmoreno-shopping-v2` | Namespace prepended to room IDs to avoid collisions on shared relays. |

> **Note about the default relay:** `wss://demos.yjs.dev/ws` is a public, ephemeral Yjs demo server. It is great for trying the app at \$0 with zero setup, but rooms are unauthenticated and may be wiped when the demo server restarts. For durable, private async syncing across devices, follow the **\$0 Cloudflare Workers upgrade guide** below.

---

## Follow-Up Upgrade: Persistent \$0 Sync Backend on Cloudflare Workers

When you want **true durable asynchronous syncing** (Device A edits → closes browser → Device B opens days later and gets every update automatically) at **\$0/month**, deploy a tiny **Cloudflare Worker with SQLite-backed Durable Objects**.

### Why Cloudflare Workers Free Plan?
- **\$0/month**, no credit card required, hard-capped limits (no surprise bills).
- **Never pauses on inactivity** (unlike free managed Postgres tiers).
- **Free limits:** 100,000 requests/day, 13,000 GB-s/day compute, 5 GB SQLite storage, 100,000 SQLite row writes/day, 5M row reads/day — more than enough for personal/family shopping lists.
- Speaks the standard `y-websocket` binary protocol, so **zero frontend code changes** are needed — just set `VITE_WS_URL`.

### Step-by-Step Setup

#### 1. Create a Free Cloudflare Account
Sign up at [dash.cloudflare.com](https://dash.cloudflare.com/) (stay on the **Workers Free** plan).

#### 2. Scaffold the Worker (e.g. in a `worker/` directory)

```bash
mkdir worker && cd worker
npm init -y
npm install yjs partyserver y-partyserver
npm install -D wrangler typescript @cloudflare/workers-types
```

#### 3. Create `worker/wrangler.jsonc`

> **Important:** Use `new_sqlite_classes` (SQLite-backed Durable Objects), which is required for the **Workers Free** plan.

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "p2p-shopping-sync",
  "main": "src/index.ts",
  "compatibility_date": "2026-01-01",
  "compatibility_flags": ["nodejs_compat"],
  "durable_objects": {
    "bindings": [
      {
        "name": "ShoppingRoom",
        "class_name": "ShoppingRoom"
      }
    ]
  },
  "migrations": [
    {
      "tag": "v1",
      "new_sqlite_classes": ["ShoppingRoom"]
    }
  ]
}
```

#### 4. Create `worker/src/index.ts`

Each shopping list room runs in its own Durable Object and persists its compacted Yjs state to its embedded SQLite database:

```ts
import * as Y from 'yjs';
import { routePartykitRequest } from 'partyserver';
import { YServer } from 'y-partyserver';

export class ShoppingRoom extends YServer {
  static options = { hibernate: true };

  private ensureTable() {
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS doc_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        state BLOB NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
  }

  async onLoad() {
    this.ensureTable();
    const rows = this.ctx.storage.sql
      .exec<{ state: ArrayBuffer }>('SELECT state FROM doc_state WHERE id = 1')
      .toArray();

    if (rows.length > 0 && rows[0].state) {
      Y.applyUpdate(this.document, new Uint8Array(rows[0].state));
    }
  }

  async onSave() {
    this.ensureTable();
    const state = Y.encodeStateAsUpdate(this.document);
    this.ctx.storage.sql.exec(
      `INSERT INTO doc_state (id, state, updated_at)
       VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at`,
      state,
      Date.now()
    );
  }
}

export default {
  async fetch(request: Request, env: Record<string, unknown>) {
    const response = await routePartykitRequest(request, env);
    if (response) return response;
    return new Response('Shopping List Sync Server OK', { status: 200 });
  },
};
```

*(Optional security hardening: override `onBeforeConnect` to validate an `Origin` header matching `https://list.albertmoreno.dev`, or add a shared token query parameter.)*

#### 5. Test Locally & Deploy

```bash
# Authenticate Wrangler with your Cloudflare account (opens browser)
npx wrangler login

# Test locally on ws://localhost:8787
npx wrangler dev

# Deploy to Cloudflare Workers Free
npx wrangler deploy
```

Wrangler will output your Worker URL, for example:
`https://p2p-shopping-sync.<your-subdomain>.workers.dev`

Because `partyserver` routes kebab-cased Durable Object bindings at `/parties/<binding-name>/<room>`, your `VITE_WS_URL` will be:
```
wss://p2p-shopping-sync.<your-subdomain>.workers.dev/parties/shopping-room
```

*(Note: `y-websocket` automatically appends `/<namespaced-room>` to `VITE_WS_URL`, matching `/parties/shopping-room/:room`.)*

#### 6. Point the Frontend to Your Worker

- **Locally:** Add to `.env.local` in the repo root and restart `npm run dev`:
  ```env
  VITE_WS_URL=wss://p2p-shopping-sync.<your-subdomain>.workers.dev/parties/shopping-room
  ```
- **Production (GitHub Pages):**
  1. Go to your GitHub repo → **Settings → Secrets and variables → Actions → Variables** tab.
  2. Click **New repository variable**.
  3. Set Name = `VITE_WS_URL` and Value = `wss://p2p-shopping-sync.<your-subdomain>.workers.dev/parties/shopping-room`.
  4. Re-run the **Deploy Shared Shopping List** workflow (or push a commit to `main`). The workflow automatically injects `vars.VITE_WS_URL` into `npm run build`.

#### 7. (Optional) Custom Subdomain
If you later move DNS to Cloudflare or want `sync.albertmoreno.dev`, you can bind a custom domain directly in Cloudflare Workers → **Settings → Domains & Routes**.

---

## Deployment Configuration (GitHub Pages + AWS Route 53)

The app deploys to **GitHub Pages** via [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml). The custom domain is managed in **AWS Route 53** via Terraform (`terraform/`).

- The `check` job runs `npm run lint`, `npm test`, and `npm run build` on both pull requests and pushes to `main`.
- The `deploy` job publishes `dist/` to the `gh-pages` branch without waiting on Terraform.
- The `terraform` job only runs when files under `terraform/` change or when triggered manually via **workflow_dispatch**.

### Required GitHub Secrets

Configure these in **Settings → Secrets and variables → Actions → Secrets**:

| Secret Name | Description | Example |
| :--- | :--- | :--- |
| `AWS_ROLE_ARN` | OIDC IAM role for Terraform to manage Route 53. | `arn:aws:iam::123456789012:role/deployer` |
| `AWS_REGION` | AWS region (defaults to `eu-central-1`). | `eu-central-1` |
| `DOMAIN_NAME` | Custom subdomain (defaults to `list.albertmoreno.dev`). | `list.albertmoreno.dev` |
| `HOSTED_ZONE_ID` | Route 53 Hosted Zone ID. | `Z1234567890ABC` |

### Least-Privilege AWS IAM Policy (for Terraform)

Scope permissions to your specific Hosted Zone and Terraform state bucket rather than using wildcards:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "route53:GetHostedZone",
        "route53:ListResourceRecordSets",
        "route53:ChangeResourceRecordSets"
      ],
      "Resource": "arn:aws:route53:::hostedzone/<HOSTED_ZONE_ID>"
    },
    {
      "Effect": "Allow",
      "Action": "route53:GetChange",
      "Resource": "arn:aws:route53:::change/*"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": "arn:aws:s3:::albertmoreno-tf-state"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::albertmoreno-tf-state/p2p-shopping-list/*"
    }
  ]
}
```
