import * as Y from 'yjs';

export const ITEMS_MAP_KEY = 'shopping-items';
export const LEGACY_LIST_KEY = 'shopping-list';
export const USER_ORIGIN = 'user-action';
export const MAX_SNAPSHOT_URL_LENGTH = 4000;

/**
 * Generate a collision-resistant item ID that works in both secure (HTTPS/localhost)
 * and insecure (LAN HTTP) browser contexts.
 */
export function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getItemsMap(ydoc) {
  return ydoc.getMap(ITEMS_MAP_KEY);
}

/**
 * One-way migration from the legacy Y.Array('shopping-list') of plain objects
 * to Y.Map('shopping-items') of nested Y.Map entries. Safe to run repeatedly.
 */
export function migrateLegacyArray(ydoc) {
  const legacyList = ydoc.getArray(LEGACY_LIST_KEY);
  if (legacyList.length === 0) return false;

  const itemsMap = getItemsMap(ydoc);
  ydoc.transact(() => {
    const legacyItems = legacyList.toArray();
    for (const raw of legacyItems) {
      if (!raw || typeof raw !== 'object') continue;
      const text = typeof raw.text === 'string' ? raw.text.trim() : '';
      if (!text) continue;

      const id = typeof raw.id === 'string' && raw.id ? raw.id : generateId();
      if (!itemsMap.has(id)) {
        const createdAt = typeof raw.timestamp === 'number' ? raw.timestamp : Date.now();
        const itemMap = new Y.Map();
        itemMap.set('id', id);
        itemMap.set('text', text);
        itemMap.set('isCompleted', Boolean(raw.isCompleted));
        itemMap.set('createdAt', createdAt);
        itemMap.set('updatedAt', createdAt);
        itemsMap.set(id, itemMap);
      }
    }
    if (legacyList.length > 0) {
      legacyList.delete(0, legacyList.length);
    }
  }, 'migration');

  return true;
}

/**
 * Read all items as plain JS objects, ordered with active items first (oldest first)
 * followed by completed items (most recently updated first).
 */
export function readItems(ydoc) {
  const itemsMap = getItemsMap(ydoc);
  const items = [];

  itemsMap.forEach((value, key) => {
    if (value instanceof Y.Map) {
      const text = value.get('text');
      if (typeof text !== 'string') return;
      items.push({
        id: value.get('id') || key,
        text,
        isCompleted: Boolean(value.get('isCompleted')),
        createdAt: Number(value.get('createdAt')) || 0,
        updatedAt: Number(value.get('updatedAt')) || 0,
      });
    } else if (value && typeof value === 'object' && typeof value.text === 'string') {
      items.push({
        id: value.id || key,
        text: value.text,
        isCompleted: Boolean(value.isCompleted),
        createdAt: Number(value.createdAt ?? value.timestamp) || 0,
        updatedAt: Number(value.updatedAt ?? value.timestamp) || 0,
      });
    }
  });

  items.sort((a, b) => {
    if (a.isCompleted !== b.isCompleted) {
      return a.isCompleted ? 1 : -1;
    }
    if (a.isCompleted) {
      return b.updatedAt - a.updatedAt || a.id.localeCompare(b.id);
    }
    return a.createdAt - b.createdAt || a.id.localeCompare(b.id);
  });

  return items;
}

export function addItem(ydoc, rawText, now = Date.now()) {
  const text = rawText.trim();
  if (!text) return null;

  const id = generateId();
  const itemsMap = getItemsMap(ydoc);

  ydoc.transact(() => {
    const itemMap = new Y.Map();
    itemMap.set('id', id);
    itemMap.set('text', text);
    itemMap.set('isCompleted', false);
    itemMap.set('createdAt', now);
    itemMap.set('updatedAt', now);
    itemsMap.set(id, itemMap);
  }, USER_ORIGIN);

  return id;
}

export function toggleItem(ydoc, id, now = Date.now()) {
  const itemsMap = getItemsMap(ydoc);
  const itemMap = itemsMap.get(id);
  if (!(itemMap instanceof Y.Map)) return false;

  ydoc.transact(() => {
    const current = Boolean(itemMap.get('isCompleted'));
    itemMap.set('isCompleted', !current);
    itemMap.set('updatedAt', now);
  }, USER_ORIGIN);

  return true;
}

export function updateItemText(ydoc, id, rawText, now = Date.now()) {
  const text = rawText.trim();
  if (!text) return false;

  const itemsMap = getItemsMap(ydoc);
  const itemMap = itemsMap.get(id);
  if (!(itemMap instanceof Y.Map)) return false;
  if (itemMap.get('text') === text) return false;

  ydoc.transact(() => {
    itemMap.set('text', text);
    itemMap.set('updatedAt', now);
  }, USER_ORIGIN);

  return true;
}

export function deleteItem(ydoc, id) {
  const itemsMap = getItemsMap(ydoc);
  if (!itemsMap.has(id)) return false;

  ydoc.transact(() => {
    itemsMap.delete(id);
  }, USER_ORIGIN);

  return true;
}

export function clearCompletedItems(ydoc) {
  const itemsMap = getItemsMap(ydoc);
  const idsToDelete = [];

  itemsMap.forEach((value, key) => {
    if (value instanceof Y.Map && Boolean(value.get('isCompleted'))) {
      idsToDelete.push(key);
    }
  });

  if (idsToDelete.length === 0) return 0;

  ydoc.transact(() => {
    for (const id of idsToDelete) {
      itemsMap.delete(id);
    }
  }, USER_ORIGIN);

  return idsToDelete.length;
}

function bytesToBase64Url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(encoded) {
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Encode the current Yjs document state as a URL-safe base64 snapshot so sharing
 * a link transfers the list even if the public relay restarted while devices were offline.
 * Returns null if the document is empty or exceeds the safe URL size limit.
 */
export function encodeDocSnapshot(ydoc, maxLength = MAX_SNAPSHOT_URL_LENGTH) {
  if (getItemsMap(ydoc).size === 0) return null;
  const update = Y.encodeStateAsUpdate(ydoc);
  const encoded = bytesToBase64Url(update);
  if (encoded.length > maxLength) return null;
  return encoded;
}

/**
 * Merge an encoded CRDT snapshot into an existing Y.Doc. Idempotent and conflict-free.
 */
export function applyDocSnapshot(ydoc, encoded) {
  if (!encoded || typeof encoded !== 'string') return false;
  try {
    const update = base64UrlToBytes(encoded);
    if (update.length === 0) return false;
    Y.applyUpdate(ydoc, update, 'snapshot');
    migrateLegacyArray(ydoc);
    return true;
  } catch {
    return false;
  }
}
