import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import {
  USER_ORIGIN,
  LEGACY_LIST_KEY,
  getItemsMap,
  addItem,
  toggleItem,
  updateItemText,
  deleteItem,
  clearCompletedItems,
  readItems,
  migrateLegacyArray,
  encodeDocSnapshot,
  applyDocSnapshot,
} from './crdt';

function syncDocs(docA, docB) {
  const updateA = Y.encodeStateAsUpdate(docA);
  const updateB = Y.encodeStateAsUpdate(docB);
  Y.applyUpdate(docA, updateB);
  Y.applyUpdate(docB, updateA);
}

describe('CRDT shopping list operations', () => {
  it('adds, edits, toggles, orders, and deletes items', () => {
    const doc = new Y.Doc();

    const milkId = addItem(doc, '  Milk  ', 100);
    const breadId = addItem(doc, 'Bread', 200);
    expect(addItem(doc, '   ')).toBeNull();

    expect(readItems(doc).map((i) => i.text)).toEqual(['Milk', 'Bread']);

    expect(updateItemText(doc, milkId, 'Oat Milk', 250)).toBe(true);
    expect(toggleItem(doc, milkId, 300)).toBe(true);

    // Active items stay above completed items.
    const afterToggle = readItems(doc);
    expect(afterToggle.map((i) => [i.text, i.isCompleted])).toEqual([
      ['Bread', false],
      ['Oat Milk', true],
    ]);

    expect(deleteItem(doc, breadId)).toBe(true);
    expect(readItems(doc).map((i) => i.id)).toEqual([milkId]);
  });

  it('never duplicates items on concurrent offline toggles and edits', () => {
    const deviceA = new Y.Doc();
    const deviceB = new Y.Doc();

    const id = addItem(deviceA, 'Apples', 100);
    syncDocs(deviceA, deviceB);

    // Both devices go offline and modify the same item concurrently.
    toggleItem(deviceA, id, 200);
    updateItemText(deviceB, id, 'Green Apples', 210);
    toggleItem(deviceB, id, 220);

    // Reconnect and sync both ways.
    syncDocs(deviceA, deviceB);

    const itemsA = readItems(deviceA);
    const itemsB = readItems(deviceB);

    expect(itemsA).toHaveLength(1);
    expect(itemsB).toHaveLength(1);
    expect(itemsA[0].id).toBe(id);
    expect(itemsA[0].text).toBe('Green Apples');
    expect(itemsA[0].isCompleted).toBe(true);
    expect(itemsA).toEqual(itemsB);
  });

  it('clears completed items atomically and supports Y.UndoManager undo/redo', () => {
    const doc = new Y.Doc();
    const undoManager = new Y.UndoManager(getItemsMap(doc), {
      trackedOrigins: new Set([USER_ORIGIN]),
    });

    const id1 = addItem(doc, 'Eggs', 100);
    const id2 = addItem(doc, 'Coffee', 200);
    toggleItem(doc, id1, 300);

    undoManager.stopCapturing();
    const removed = clearCompletedItems(doc);
    expect(removed).toBe(1);
    expect(readItems(doc).map((i) => i.id)).toEqual([id2]);

    undoManager.undo();
    expect(readItems(doc).map((i) => i.id)).toEqual([id2, id1]);

    undoManager.redo();
    expect(readItems(doc).map((i) => i.id)).toEqual([id2]);
  });

  it('migrates legacy Y.Array plain-object items without data loss', () => {
    const doc = new Y.Doc();
    const legacy = doc.getArray(LEGACY_LIST_KEY);
    legacy.push([
      { id: 'legacy-1', text: 'Pasta', isCompleted: false, timestamp: 1000 },
      { id: 'legacy-2', text: 'Tomatoes', isCompleted: true, timestamp: 1100 },
    ]);

    expect(migrateLegacyArray(doc)).toBe(true);
    expect(legacy.length).toBe(0);
    expect(readItems(doc)).toEqual([
      {
        id: 'legacy-1',
        text: 'Pasta',
        isCompleted: false,
        createdAt: 1000,
        updatedAt: 1000,
      },
      {
        id: 'legacy-2',
        text: 'Tomatoes',
        isCompleted: true,
        createdAt: 1100,
        updatedAt: 1100,
      },
    ]);

    // Idempotent second run.
    expect(migrateLegacyArray(doc)).toBe(false);
  });

  it('encodes and merges URL snapshots idempotently across offline devices', () => {
    const sender = new Y.Doc();
    addItem(sender, 'Cheese', 100);
    addItem(sender, 'Olive Oil', 200);

    const snapshot = encodeDocSnapshot(sender);
    expect(snapshot).toBeTruthy();

    const receiver = new Y.Doc();
    addItem(receiver, 'Bananas', 150);

    expect(applyDocSnapshot(receiver, snapshot)).toBe(true);
    // Applying the same snapshot again should not create duplicates.
    expect(applyDocSnapshot(receiver, snapshot)).toBe(true);

    expect(readItems(receiver).map((i) => i.text)).toEqual([
      'Cheese',
      'Bananas',
      'Olive Oil',
    ]);
  });

  it('returns null for empty snapshot and false for malformed snapshot input', () => {
    const emptyDoc = new Y.Doc();
    expect(encodeDocSnapshot(emptyDoc)).toBeNull();
    expect(applyDocSnapshot(emptyDoc, '!!!not-valid-base64!!!')).toBe(false);
    expect(applyDocSnapshot(emptyDoc, '')).toBe(false);
  });
});
