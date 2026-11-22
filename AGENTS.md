# Agent Guidelines

## Versioning Requirement (Mandatory)

**Always bump the application version before committing any user-facing change** (features, bug fixes, UI/styling updates, or behavior changes) so users can immediately see when a new version of the web app has loaded.

- The displayed app version is injected at build time from `package.json` via `__APP_VERSION__` in `vite.config.js` (rendered in the app footer as `v<version> (<short-sha>)`).
- Follow Semantic Versioning:
  - **Patch** (`npm version patch --no-git-tag-version`): bug fixes, copy/style tweaks, minor improvements.
  - **Minor** (`npm version minor --no-git-tag-version`): new user-facing features or notable UI changes.
  - **Major** (`npm version major --no-git-tag-version`): breaking data/sync changes.
- Always use `npm version <patch|minor|major> --no-git-tag-version` (or update both `package.json` and `package-lock.json` together) so the lockfile stays in sync for `npm ci` in CI.

## Pre-Commit Verification

Before committing or pushing changes, always run:

```bash
npm run lint
npm test
npm run build
```

All checks must pass cleanly.
