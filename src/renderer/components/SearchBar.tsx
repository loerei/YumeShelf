import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { GameEntry } from '../types/game';

export const MAX_DROPDOWN_RESULTS = 50;

const DEFAULT_PLACEHOLDERS = [
  'Search library games...',
  'Filter by game title...',
];

export interface SearchBarGameItem {
  gameKey: string;
  name: string;
  iconUrl?: string;
}

export interface SearchBarProps {
  query: string;
  onQueryChange: (query: string) => void;
  onSelectGame: (gameKey: string) => void;
  debounceMs?: number;
  onSearch?: (debouncedQuery: string) => void;
  games?: readonly SearchBarGameItem[] | readonly GameEntry[];
  placeholderList?: string[];
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildHighlightRegex(query: string): RegExp | null {
  const trimmedQuery = query ? query.trim().normalize('NFC') : '';
  if (!trimmedQuery) return null;
  const tokens = trimmedQuery.split(/\s+/).filter(Boolean).map(escapeRegex);
  if (tokens.length === 0) return null;
  return new RegExp(`(${tokens.join('\\s+')})`, 'giu');
}

export function HighlightedText({
  text,
  highlightRegex,
}: {
  text: string;
  highlightRegex: RegExp | null;
}): React.ReactElement {
  const safeText = (text || '').normalize('NFC');
  if (!highlightRegex || !safeText) return <span>{safeText}</span>;

  highlightRegex.lastIndex = 0;
  const parts = safeText.split(highlightRegex);

  return (
    <span>
      {parts.map((part, i) => {
        if (!part) return null;
        highlightRegex.lastIndex = 0;
        const isMatch = highlightRegex.test(part);
        highlightRegex.lastIndex = 0;
        return isMatch ? (
          <mark key={i} className="search-match" style={{ background: 'transparent' }}>
            {part}
          </mark>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        );
      })}
    </span>
  );
}

export function useRotatingPlaceholder(
  placeholderList: readonly string[] = DEFAULT_PLACEHOLDERS,
  intervalMs = 3500
): string {
  const list = placeholderList.length > 0 ? placeholderList : DEFAULT_PLACEHOLDERS;
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion || list.length <= 1) {
      setIndex(0);
      return;
    }

    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % list.length);
    }, intervalMs);

    return () => {
      clearInterval(timer);
    };
  }, [list, intervalMs]);

  return list[index % list.length] ?? DEFAULT_PLACEHOLDERS[0];
}

interface SearchDropdownProps {
  isOpen: boolean;
  debouncedQuery: string;
  visibleMatches: readonly SearchBarGameItem[];
  selectedIndex: number;
  onSelect: (gameKey: string) => void;
}

function SearchDropdown({
  isOpen,
  debouncedQuery,
  visibleMatches,
  selectedIndex,
  onSelect,
}: SearchDropdownProps): React.ReactElement {
  const highlightRegex = useMemo(() => buildHighlightRegex(debouncedQuery), [debouncedQuery]);

  return (
    <div className={`search-dropdown ${isOpen ? 'show' : ''}`}>
      {visibleMatches.length === 0 ? (
        <div className="search-item empty-search" role="status" aria-live="polite">
          No matching games found
        </div>
      ) : (
        <div role="list">
          {visibleMatches.map((item, i) => (
            <div
              key={item.gameKey}
              role="listitem"
              className={`search-item ${selectedIndex === i ? 'active' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onSelect(item.gameKey)}
            >
              <div className="search-item-info">
                <div className="search-item-icon">
                  {item.iconUrl ? <img src={item.iconUrl} alt="" /> : null}
                </div>
                <div className="search-item-title-container">
                  <div className="search-item-title">
                    <HighlightedText text={item.name} highlightRegex={highlightRegex} />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function SearchBar({
  query,
  onQueryChange,
  onSelectGame,
  debounceMs = 150,
  onSearch,
  games = [],
  placeholderList,
}: SearchBarProps): React.ReactElement {
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedQueryRef = useRef(debouncedQuery);
  debouncedQueryRef.current = debouncedQuery;
  const suppressFocusReopenRef = useRef(false);

  const placeholderText = useRotatingPlaceholder(placeholderList);

  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    if (query.trim().length === 0) {
      debouncedQueryRef.current = '';
      setDebouncedQuery('');
      setIsOpen(false);
      setSelectedIndex(-1);
      return;
    }

    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      debouncedQueryRef.current = query;
      setDebouncedQuery(query);
      setIsOpen(true);
      setSelectedIndex(-1);
      onSearch?.(query);
    }, debounceMs);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [query, debounceMs, onSearch]);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [isOpen]);

  const visibleMatches = useMemo(() => {
    const normalizedQuery = debouncedQuery.trim().toLowerCase().normalize('NFC');
    if (!normalizedQuery) return [];
    const matched: SearchBarGameItem[] = [];
    for (const g of games) {
      if ((g.name || '').normalize('NFC').toLowerCase().includes(normalizedQuery)) {
        matched.push(g);
        if (matched.length >= MAX_DROPDOWN_RESULTS) break;
      }
    }
    return matched;
  }, [games, debouncedQuery]);

  const handleFocus = () => {
    if (suppressFocusReopenRef.current) {
      suppressFocusReopenRef.current = false;
      return;
    }
    if (debouncedQueryRef.current.trim().length > 0) {
      setIsOpen(true);
    }
  };

  const handleSelect = (gameKey: string) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    debouncedQueryRef.current = '';
    setDebouncedQuery('');
    setSelectedIndex(-1);
    onQueryChange('');
    inputRef.current?.focus();
    setIsOpen(false);
    onSelectGame(gameKey);
  };

  const handleClear = () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    debouncedQueryRef.current = '';
    setDebouncedQuery('');
    setSelectedIndex(-1);
    onQueryChange('');
    inputRef.current?.focus();
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      if (isOpen) {
        e.preventDefault();
        setIsOpen(false);
        setSelectedIndex(-1);
        if (document.activeElement !== inputRef.current) {
          suppressFocusReopenRef.current = true;
          inputRef.current?.focus();
        }
      }
      return;
    }

    if (!isOpen || visibleMatches.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < 0 ? 0 : Math.min(prev + 1, visibleMatches.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev <= 0 ? 0 : prev - 1));
    } else if (e.key === 'Enter') {
      const targetIndex = selectedIndex >= 0 ? selectedIndex : 0;
      const target = visibleMatches[targetIndex];
      if (target) {
        e.preventDefault();
        handleSelect(target.gameKey);
      }
    }
  };

  const showDropdown = isOpen && debouncedQuery.trim().length > 0;

  return (
    <div ref={containerRef} className="search-container">
      <div className="search-input-wrapper">
        <input
          ref={inputRef}
          type="text"
          className="search-input"
          aria-label="Search library games"
          placeholder={query.length === 0 ? placeholderText : ''}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
        />
        {query.length > 0 && (
          <button
            type="button"
            className="search-clear-btn"
            aria-label="Clear search input"
            title="Clear search (Esc)"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleClear}
          >
            <svg
              className="icon-svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>
      {showDropdown && (
        <SearchDropdown
          isOpen={isOpen}
          debouncedQuery={debouncedQuery}
          visibleMatches={visibleMatches}
          selectedIndex={selectedIndex}
          onSelect={handleSelect}
        />
      )}
    </div>
  );
}
