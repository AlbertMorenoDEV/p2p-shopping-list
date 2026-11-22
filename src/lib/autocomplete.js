export function normalizeItemText(text) {
  if (typeof text !== 'string') return '';
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

function getMatchScore(normalizedText, query) {
  if (!query) return 0;
  if (normalizedText === query) return 0;
  if (normalizedText.startsWith(query)) return 1;
  return 2;
}

/**
 * Filter and rank existing shopping list items for the autocomplete dropdown.
 * Closed (completed) items appear first so users can quickly reopen them,
 * followed by active items so users can see items already on the list.
 */
export function getAutocompleteSuggestions(items, rawQuery = '') {
  const query = normalizeItemText(rawQuery);
  const closed = [];
  const active = [];

  for (const item of items) {
    const normalized = normalizeItemText(item.text);
    if (query && !normalized.includes(query)) continue;

    if (item.isCompleted) {
      closed.push(item);
    } else {
      active.push(item);
    }
  }

  closed.sort((a, b) => {
    const scoreDiff =
      getMatchScore(normalizeItemText(a.text), query) -
      getMatchScore(normalizeItemText(b.text), query);
    if (scoreDiff !== 0) return scoreDiff;
    return (b.updatedAt || 0) - (a.updatedAt || 0) || a.text.localeCompare(b.text);
  });

  active.sort((a, b) => {
    const scoreDiff =
      getMatchScore(normalizeItemText(a.text), query) -
      getMatchScore(normalizeItemText(b.text), query);
    if (scoreDiff !== 0) return scoreDiff;
    return (a.createdAt || 0) - (b.createdAt || 0) || a.text.localeCompare(b.text);
  });

  return {
    closed,
    active,
    all: [...closed, ...active],
  };
}

export function buildDuplicateError(itemText) {
  return `"${itemText}" is already in the list.`;
}

/**
 * Decide what happens when the user selects a specific item from the dropdown.
 */
export function resolveSuggestionSelection(item) {
  if (!item) return { action: 'noop' };

  if (item.isCompleted) {
    return { action: 'reopen', item };
  }

  return {
    action: 'duplicate',
    item,
    error: buildDuplicateError(item.text),
  };
}

/**
 * Decide what happens when the user submits the add-item input directly
 * (via Enter or the Add button):
 * - Matches an active item -> validation error (already in list)
 * - Matches a closed item -> reopen existing item instead of creating a new one
 * - No exact match -> create a new item
 */
export function resolveItemSubmission(items, rawText) {
  const trimmed = typeof rawText === 'string' ? rawText.trim() : '';
  const normalized = normalizeItemText(trimmed);
  if (!normalized) return { action: 'noop' };

  let matchedClosed = null;

  for (const item of items) {
    if (normalizeItemText(item.text) !== normalized) continue;

    if (!item.isCompleted) {
      return {
        action: 'duplicate',
        item,
        error: buildDuplicateError(item.text),
      };
    }

    if (!matchedClosed || (item.updatedAt || 0) > (matchedClosed.updatedAt || 0)) {
      matchedClosed = item;
    }
  }

  if (matchedClosed) {
    return { action: 'reopen', item: matchedClosed };
  }

  return { action: 'create', text: trimmed };
}

/**
 * Split item text into segments for safe inline highlighting of the typed query.
 */
export function splitTextForHighlight(text, rawQuery) {
  const query = typeof rawQuery === 'string' ? rawQuery.trim() : '';
  if (!query) return [{ text, match: false }];

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const matchIndex = lowerText.indexOf(lowerQuery);
  if (matchIndex === -1) return [{ text, match: false }];

  const segments = [];
  if (matchIndex > 0) {
    segments.push({ text: text.slice(0, matchIndex), match: false });
  }
  segments.push({
    text: text.slice(matchIndex, matchIndex + query.length),
    match: true,
  });
  if (matchIndex + query.length < text.length) {
    segments.push({ text: text.slice(matchIndex + query.length), match: false });
  }
  return segments;
}
