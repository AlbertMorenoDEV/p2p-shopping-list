import { useState, useEffect, useRef, useMemo } from 'react';
import { Plus, RotateCcw, CheckCircle2, AlertCircle } from 'lucide-react';
import {
  getAutocompleteSuggestions,
  resolveSuggestionSelection,
  resolveItemSubmission,
  splitTextForHighlight,
} from '../lib/autocomplete';

function HighlightedText({ text, query }) {
  const segments = splitTextForHighlight(text, query);
  return (
    <span className="autocomplete-item-text">
      {segments.map((segment, index) =>
        segment.match ? (
          <mark key={index} className="autocomplete-match">
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        )
      )}
    </span>
  );
}

export function ItemAutocompleteInput({ items, onAddItem, onReopenItem }) {
  const [inputValue, setInputValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [validationError, setValidationError] = useState('');
  const [reopenedNotice, setReopenedNotice] = useState('');

  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const optionRefs = useRef([]);
  const noticeTimeoutRef = useRef(null);

  const suggestions = useMemo(
    () => getAutocompleteSuggestions(items, inputValue),
    [items, inputValue]
  );

  const submissionPreview = useMemo(
    () => resolveItemSubmission(items, inputValue),
    [items, inputValue]
  );

  const activeIndex =
    highlightedIndex >= 0 && highlightedIndex < suggestions.all.length
      ? highlightedIndex
      : -1;

  const showDropdown = isOpen && suggestions.all.length > 0;
  const activeOptionId =
    showDropdown && activeIndex >= 0
      ? `autocomplete-option-${suggestions.all[activeIndex].id}`
      : undefined;

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
        setHighlightedIndex(-1);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      clearTimeout(noticeTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (showDropdown && activeIndex >= 0) {
      optionRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [showDropdown, activeIndex]);

  const triggerReopenedNotice = (itemText) => {
    clearTimeout(noticeTimeoutRef.current);
    setReopenedNotice(`Reopened "${itemText}"`);
    noticeTimeoutRef.current = setTimeout(() => {
      setReopenedNotice('');
    }, 2400);
  };

  const handleSelectSuggestion = (item) => {
    const resolution = resolveSuggestionSelection(item);

    if (resolution.action === 'reopen') {
      onReopenItem(resolution.item.id);
      setInputValue('');
      setValidationError('');
      setIsOpen(false);
      setHighlightedIndex(-1);
      triggerReopenedNotice(resolution.item.text);
      return;
    }

    if (resolution.action === 'duplicate') {
      setInputValue(resolution.item.text);
      setValidationError(resolution.error);
      setReopenedNotice('');
      setIsOpen(false);
      setHighlightedIndex(-1);
      inputRef.current?.focus();
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const resolution = resolveItemSubmission(items, inputValue);

    if (resolution.action === 'noop') return;

    if (resolution.action === 'duplicate') {
      setValidationError(resolution.error);
      setReopenedNotice('');
      setIsOpen(false);
      setHighlightedIndex(-1);
      return;
    }

    if (resolution.action === 'reopen') {
      onReopenItem(resolution.item.id);
      setInputValue('');
      setValidationError('');
      setIsOpen(false);
      setHighlightedIndex(-1);
      triggerReopenedNotice(resolution.item.text);
      return;
    }

    onAddItem(resolution.text);
    setInputValue('');
    setValidationError('');
    setReopenedNotice('');
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  const handleInputChange = (e) => {
    setInputValue(e.target.value);
    setIsOpen(true);
    setHighlightedIndex(-1);
    if (validationError) setValidationError('');
    if (reopenedNotice) setReopenedNotice('');
  };

  const handleKeyDown = (e) => {
    const total = suggestions.all.length;

    if (e.key === 'ArrowDown') {
      if (total === 0) return;
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setHighlightedIndex(0);
      } else {
        setHighlightedIndex((activeIndex + 1) % total);
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      if (total === 0) return;
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setHighlightedIndex(total - 1);
      } else {
        setHighlightedIndex(activeIndex <= 0 ? total - 1 : activeIndex - 1);
      }
      return;
    }

    if (e.key === 'Enter' && showDropdown && activeIndex >= 0) {
      e.preventDefault();
      handleSelectSuggestion(suggestions.all[activeIndex]);
      return;
    }

    if (e.key === 'Escape') {
      if (isOpen) {
        e.preventDefault();
        setIsOpen(false);
        setHighlightedIndex(-1);
      } else if (validationError) {
        setValidationError('');
      }
    }
  };

  const willReopenOnSubmit = submissionPreview.action === 'reopen';
  const closedCount = suggestions.closed.length;

  return (
    <div ref={containerRef} className="add-item-wrapper">
      <form onSubmit={handleSubmit} className="input-group" noValidate>
        <label htmlFor="new-item-input" className="sr-only">
          Add an item to the shopping list
        </label>
        <input
          ref={inputRef}
          id="new-item-input"
          type="text"
          role="combobox"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={showDropdown}
          aria-controls="item-suggestions-listbox"
          aria-activedescendant={activeOptionId}
          aria-invalid={Boolean(validationError)}
          aria-describedby={validationError ? 'add-item-error' : undefined}
          className={validationError ? 'input-invalid' : ''}
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => {
            if (suggestions.all.length > 0) setIsOpen(true);
          }}
          onClick={() => {
            if (suggestions.all.length > 0) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Add an item or search closed items..."
          enterKeyHint="done"
        />
        <button
          type="submit"
          className={`add-btn ${willReopenOnSubmit ? 'reopen-mode' : ''}`}
          aria-label={willReopenOnSubmit ? 'Reopen closed item' : 'Add item'}
          title={willReopenOnSubmit ? 'Reopen closed item' : 'Add item'}
          disabled={!inputValue.trim()}
        >
          {willReopenOnSubmit ? (
            <RotateCcw size={20} aria-hidden="true" />
          ) : (
            <Plus size={22} aria-hidden="true" />
          )}
        </button>
      </form>

      {showDropdown && (
        <div
          id="item-suggestions-listbox"
          role="listbox"
          aria-label="Existing shopping list items"
          className="autocomplete-dropdown"
        >
          {suggestions.closed.length > 0 && (
            <div className="autocomplete-section" role="group" aria-label="Closed items">
              <div className="autocomplete-section-header">
                <span>Closed items</span>
                <span className="autocomplete-section-hint">Select to reopen</span>
              </div>
              {suggestions.closed.map((item, idx) => {
                const isHighlighted = activeIndex === idx;
                return (
                  <button
                    key={item.id}
                    ref={(el) => {
                      optionRefs.current[idx] = el;
                    }}
                    id={`autocomplete-option-${item.id}`}
                    type="button"
                    role="option"
                    aria-selected={isHighlighted}
                    className={`autocomplete-option closed ${isHighlighted ? 'highlighted' : ''}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    onClick={() => handleSelectSuggestion(item)}
                  >
                    <RotateCcw size={15} className="autocomplete-icon reopen" aria-hidden="true" />
                    <HighlightedText text={item.text} query={inputValue} />
                    <span className="autocomplete-badge reopen">Reopen</span>
                  </button>
                );
              })}
            </div>
          )}

          {suggestions.active.length > 0 && (
            <div className="autocomplete-section" role="group" aria-label="Active items">
              <div className="autocomplete-section-header">
                <span>Active items</span>
                <span className="autocomplete-section-hint">Already in list</span>
              </div>
              {suggestions.active.map((item, idx) => {
                const flatIndex = closedCount + idx;
                const isHighlighted = activeIndex === flatIndex;
                return (
                  <button
                    key={item.id}
                    ref={(el) => {
                      optionRefs.current[flatIndex] = el;
                    }}
                    id={`autocomplete-option-${item.id}`}
                    type="button"
                    role="option"
                    aria-selected={isHighlighted}
                    className={`autocomplete-option active ${isHighlighted ? 'highlighted' : ''}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setHighlightedIndex(flatIndex)}
                    onClick={() => handleSelectSuggestion(item)}
                  >
                    <CheckCircle2
                      size={15}
                      className="autocomplete-icon active"
                      aria-hidden="true"
                    />
                    <HighlightedText text={item.text} query={inputValue} />
                    <span className="autocomplete-badge active">In list</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {validationError && (
        <div id="add-item-error" className="input-feedback error" role="alert">
          <AlertCircle size={15} aria-hidden="true" />
          <span>{validationError}</span>
        </div>
      )}

      {!validationError && reopenedNotice && (
        <div className="input-feedback reopened" role="status" aria-live="polite">
          <RotateCcw size={14} aria-hidden="true" />
          <span>{reopenedNotice}</span>
        </div>
      )}
    </div>
  );
}
