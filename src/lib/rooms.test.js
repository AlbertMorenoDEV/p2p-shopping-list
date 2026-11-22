import { describe, it, expect } from 'vitest';
import {
  generateRoomId,
  sanitizeRoomId,
  getNamespacedRoom,
  recordRoomVisit,
  getRecentRooms,
  getSavedLastRoom,
  removeRecentRoom,
  resolveInitialRoom,
  extractSnapshotFromHash,
} from './rooms';

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
}

describe('Room ID & persistence utilities', () => {
  it('generates high-entropy URL-safe room IDs', () => {
    const a = generateRoomId();
    const b = generateRoomId();
    expect(a).toMatch(/^list-[a-z2-9]{10}$/);
    expect(b).toMatch(/^list-[a-z2-9]{10}$/);
    expect(a).not.toBe(b);
  });

  it('sanitizes room IDs and rejects overly short inputs', () => {
    expect(sanitizeRoomId('  My_List-01!  ')).toBe('my_list-01');
    expect(sanitizeRoomId('ab')).toBeNull();
    expect(sanitizeRoomId('')).toBeNull();
    expect(sanitizeRoomId(null)).toBeNull();
  });

  it('namespaces room IDs for relay isolation', () => {
    expect(getNamespacedRoom('list-abc123')).toMatch(/:list-abc123$/);
  });

  it('persists last room and recent rooms in storage', () => {
    const storage = createMemoryStorage();
    recordRoomVisit('list-alpha', storage, 100);
    recordRoomVisit('list-beta', storage, 200);
    recordRoomVisit('list-alpha', storage, 300);

    expect(getSavedLastRoom(storage)).toBe('list-alpha');
    expect(getRecentRooms(storage).map((r) => r.id)).toEqual(['list-alpha', 'list-beta']);

    removeRecentRoom('list-alpha', storage);
    expect(getSavedLastRoom(storage)).toBe('list-beta');
    expect(getRecentRooms(storage).map((r) => r.id)).toEqual(['list-beta']);
  });

  it('resolves initial room from URL first, then localStorage, then generates new', () => {
    const storage = createMemoryStorage();
    recordRoomVisit('list-saved', storage, 100);

    expect(resolveInitialRoom('?room=list-fromurl', storage)).toBe('list-fromurl');
    expect(resolveInitialRoom('', storage)).toBe('list-saved');
    expect(resolveInitialRoom('', createMemoryStorage())).toMatch(/^list-[a-z2-9]{10}$/);
  });

  it('extracts snapshot parameter from URL hash', () => {
    expect(extractSnapshotFromHash('#state=abc_123-XYZ')).toBe('abc_123-XYZ');
    expect(extractSnapshotFromHash('#other=1')).toBeNull();
    expect(extractSnapshotFromHash('')).toBeNull();
  });
});
