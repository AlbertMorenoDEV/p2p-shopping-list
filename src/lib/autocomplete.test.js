import { describe, it, expect } from 'vitest';
import {
  normalizeItemText,
  getAutocompleteSuggestions,
  resolveSuggestionSelection,
  resolveItemSubmission,
  splitTextForHighlight,
} from './autocomplete';

const sampleItems = [
  { id: '1', text: 'Milk', isCompleted: false, createdAt: 100, updatedAt: 100 },
  { id: '2', text: 'Oat Milk', isCompleted: true, createdAt: 120, updatedAt: 400 },
  { id: '3', text: 'Almond Milk', isCompleted: true, createdAt: 130, updatedAt: 250 },
  { id: '4', text: 'Bread', isCompleted: true, createdAt: 140, updatedAt: 500 },
  { id: '5', text: 'Milkshake', isCompleted: false, createdAt: 150, updatedAt: 150 },
];

describe('autocomplete helpers', () => {
  it('normalizes whitespace and casing consistently', () => {
    expect(normalizeItemText('  Oat   Milk  ')).toBe('oat milk');
    expect(normalizeItemText('')).toBe('');
    expect(normalizeItemText(null)).toBe('');
  });

  it('lists closed items first and active items second when query is empty', () => {
    const result = getAutocompleteSuggestions(sampleItems, '');
    expect(result.closed.map((i) => i.text)).toEqual(['Bread', 'Oat Milk', 'Almond Milk']);
    expect(result.active.map((i) => i.text)).toEqual(['Milk', 'Milkshake']);
    expect(result.all.map((i) => i.id)).toEqual(['4', '2', '3', '1', '5']);
  });

  it('filters matching items case-insensitively and prioritizes exact/prefix matches per group', () => {
    const result = getAutocompleteSuggestions(sampleItems, 'milk');
    expect(result.closed.map((i) => i.text)).toEqual(['Oat Milk', 'Almond Milk']);
    expect(result.active.map((i) => i.text)).toEqual(['Milk', 'Milkshake']);

    const prefixResult = getAutocompleteSuggestions(sampleItems, 'alm');
    expect(prefixResult.closed.map((i) => i.text)).toEqual(['Almond Milk']);
    expect(prefixResult.active).toEqual([]);
  });

  it('reopens closed items and returns validation error for active items on selection', () => {
    const closedAction = resolveSuggestionSelection(sampleItems[1]);
    expect(closedAction).toEqual({ action: 'reopen', item: sampleItems[1] });

    const activeAction = resolveSuggestionSelection(sampleItems[0]);
    expect(activeAction).toEqual({
      action: 'duplicate',
      item: sampleItems[0],
      error: '"Milk" is already in the list.',
    });
  });

  it('resolves direct form submissions against existing active and closed items', () => {
    expect(resolveItemSubmission(sampleItems, '   ')).toEqual({ action: 'noop' });

    // Exact match with active item -> validation error.
    expect(resolveItemSubmission(sampleItems, '  milk  ')).toEqual({
      action: 'duplicate',
      item: sampleItems[0],
      error: '"Milk" is already in the list.',
    });

    // Exact match with closed item -> reopen instead of creating duplicate.
    expect(resolveItemSubmission(sampleItems, 'oat   milk')).toEqual({
      action: 'reopen',
      item: sampleItems[1],
    });

    // Brand new item -> create.
    expect(resolveItemSubmission(sampleItems, '  Coffee Beans  ')).toEqual({
      action: 'create',
      text: 'Coffee Beans',
    });
  });

  it('splits matching substring segments safely for highlighting', () => {
    expect(splitTextForHighlight('Oat Milk', 'milk')).toEqual([
      { text: 'Oat ', match: false },
      { text: 'Milk', match: true },
    ]);
    expect(splitTextForHighlight('Bread', 'xyz')).toEqual([
      { text: 'Bread', match: false },
    ]);
    expect(splitTextForHighlight('Bread', '')).toEqual([
      { text: 'Bread', match: false },
    ]);
  });
});
