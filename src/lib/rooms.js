const LAST_ROOM_STORAGE_KEY = 'p2p-shopping:last-room';
const RECENT_ROOMS_STORAGE_KEY = 'p2p-shopping:recent-rooms';
const MAX_RECENT_ROOMS = 8;

// Unambiguous lowercase alphabet (excludes 0/o, 1/l/i) for easier manual typing.
const ROOM_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const ROOM_ID_LENGTH = 10;

export const DEFAULT_WS_URL = 'wss://demos.yjs.dev/ws';
const DEFAULT_ROOM_NAMESPACE = 'albertmoreno-shopping-v2';

export function getSyncServerUrl() {
  const configured = import.meta.env?.VITE_WS_URL?.trim();
  return configured || DEFAULT_WS_URL;
}

export function isUsingPublicDemoServer(url = getSyncServerUrl()) {
  return url.includes('demos.yjs.dev');
}

export function getNamespacedRoom(roomId) {
  const prefix = import.meta.env?.VITE_WS_ROOM_PREFIX?.trim() || DEFAULT_ROOM_NAMESPACE;
  return `${prefix}:${roomId}`;
}

export function sanitizeRoomId(raw) {
  if (typeof raw !== 'string') return null;
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '')
    .slice(0, 48);
  return cleaned.length >= 3 ? cleaned : null;
}

export function generateRoomId() {
  const bytes = new Uint8Array(ROOM_ID_LENGTH);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < ROOM_ID_LENGTH; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  let suffix = '';
  for (let i = 0; i < ROOM_ID_LENGTH; i++) {
    suffix += ROOM_ALPHABET[bytes[i] % ROOM_ALPHABET.length];
  }
  return `list-${suffix}`;
}

export function getSavedLastRoom(storage = globalThis.localStorage) {
  try {
    return sanitizeRoomId(storage?.getItem(LAST_ROOM_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function getRecentRooms(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(RECENT_ROOMS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => {
        if (typeof entry === 'string') {
          const id = sanitizeRoomId(entry);
          return id ? { id, lastVisited: 0 } : null;
        }
        if (entry && typeof entry === 'object') {
          const id = sanitizeRoomId(entry.id);
          return id ? { id, lastVisited: Number(entry.lastVisited) || 0 } : null;
        }
        return null;
      })
      .filter(Boolean)
      .slice(0, MAX_RECENT_ROOMS);
  } catch {
    return [];
  }
}

export function recordRoomVisit(roomId, storage = globalThis.localStorage, now = Date.now()) {
  const cleanId = sanitizeRoomId(roomId);
  if (!cleanId) return getRecentRooms(storage);

  const existing = getRecentRooms(storage).filter((entry) => entry.id !== cleanId);
  const updated = [{ id: cleanId, lastVisited: now }, ...existing].slice(0, MAX_RECENT_ROOMS);

  try {
    storage?.setItem(LAST_ROOM_STORAGE_KEY, cleanId);
    storage?.setItem(RECENT_ROOMS_STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Ignore storage quota/private mode errors.
  }

  return updated;
}

export function removeRecentRoom(roomId, storage = globalThis.localStorage) {
  const cleanId = sanitizeRoomId(roomId);
  const updated = getRecentRooms(storage).filter((entry) => entry.id !== cleanId);

  try {
    storage?.setItem(RECENT_ROOMS_STORAGE_KEY, JSON.stringify(updated));
    if (getSavedLastRoom(storage) === cleanId) {
      if (updated[0]) {
        storage?.setItem(LAST_ROOM_STORAGE_KEY, updated[0].id);
      } else {
        storage?.removeItem(LAST_ROOM_STORAGE_KEY);
      }
    }
  } catch {
    // Ignore storage errors.
  }

  return updated;
}

/**
 * Resolve initial room from URL `?room=...`, falling back to last visited room
 * in localStorage, and finally generating a new high-entropy room ID.
 */
export function resolveInitialRoom(search = window.location.search, storage = globalThis.localStorage) {
  const urlParams = new URLSearchParams(search);
  const fromUrl = sanitizeRoomId(urlParams.get('room'));
  if (fromUrl) return fromUrl;

  const fromStorage = getSavedLastRoom(storage);
  if (fromStorage) return fromStorage;

  return generateRoomId();
}

export function extractSnapshotFromHash(hash = window.location.hash) {
  if (!hash || !hash.startsWith('#')) return null;
  const params = new URLSearchParams(hash.slice(1));
  return params.get('state');
}

export function syncUrlWithRoom(roomId, { preserveHash = false } = {}) {
  const url = new URL(window.location.href);
  url.searchParams.set('room', roomId);
  if (!preserveHash) {
    url.hash = '';
  }
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

export function buildShareUrl(roomId, snapshot = null) {
  const url = new URL(window.location.href);
  url.searchParams.set('room', roomId);
  url.hash = snapshot ? `state=${snapshot}` : '';
  return url.toString();
}
