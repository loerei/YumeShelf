import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import yumeBonked from '../../../assets/yume_bonked.png';
import yumeBonkedTooMuch from '../../../assets/yume_bonkedtoomuch.png';
import yumeSmug from '../../../assets/yume_smug.png';
import type { GameEntry } from '../types/game';
import { GameIcon } from './GameIcon';
import { useLocaleStrings } from '../i18n/locale-strings';
import { MASCOT_CARD_KEY, type MascotExpression } from '../mascot/mascot-domain';
import { useOptionalMascotSearch } from '../providers/MascotProvider';

const MASCOT_SEARCH_IMAGES: Record<MascotExpression, string> = {
  smug: yumeSmug,
  bonked: yumeBonked,
  bonkedTooMuch: yumeBonkedTooMuch,
};
import { formatBytes } from '../utils/formatting';
import { useFindShortcut } from '../hooks/useFindShortcut';

const EMPTY_CLOSE_GRACE_MS = 50;

export const MAX_DROPDOWN_RESULTS = 50;
export const PLACEHOLDER_ROTATION_MS = 60000;

export interface SearchBarGameItem {
  gameKey: string;
  name: string;
  iconUrl?: string;
  iconData?: string;
  iconFit?: string;
  iconSource?: string;
  exePath?: string;
  folderName?: string;
  subtitle?: string;
  relativePath?: string;
  relativePathDisplay?: string;
  relativePathFullDisplay?: string;
  engine?: string;
  sizeBytes?: number;
}

export interface SearchBarProps {
  query: string;
  onQueryChange: (query: string) => void;
  onSelectGame: (gameKey: string) => void;
  onLocateGame?: (gameKey: string) => void;
  debounceMs?: number;
  onSearch?: (debouncedQuery: string) => void;
  games?: readonly SearchBarGameItem[] | readonly GameEntry[];
  placeholderList?: string[];
  temporaryPlaceholder?: string | null;
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
  placeholderList: readonly string[],
  intervalMs = PLACEHOLDER_ROTATION_MS,
  paused = false
): { text: string; isFadingOut: boolean } {
  const list = placeholderList;
  const [index, setIndex] = useState(() => {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion || list.length <= 1) return 0;
    return Math.floor(Math.random() * list.length);
  });
  const [isFadingOut, setIsFadingOut] = useState(false);

  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion || list.length <= 1 || paused) {
      setIsFadingOut(false);
      if (prefersReducedMotion || list.length <= 1) {
        setIndex(0);
      }
      return;
    }

    let fadeTimer: ReturnType<typeof setTimeout> | null = null;
    const timer = setInterval(() => {
      setIsFadingOut(true);
      fadeTimer = setTimeout(() => {
        setIndex((prev) => (prev + 1) % list.length);
        setIsFadingOut(false);
      }, 2000);
    }, intervalMs);

    return () => {
      clearInterval(timer);
      if (fadeTimer) clearTimeout(fadeTimer);
    };
  }, [list, intervalMs, paused]);

  return {
    text: list[index % list.length] ?? '',
    isFadingOut,
  };
}

interface SearchDropdownProps {
  isOpen: boolean;
  debouncedQuery: string;
  visibleMatches: readonly SearchBarGameItem[];
  selectedIndex: number;
  clickedGameKey: string | null;
  clickPulseSeq: number;
  noResultsText: string;
  onItemClick: (gameKey: string, index: number) => void;
  onItemDoubleClick: (gameKey: string, index: number) => void;
  onLocate: (gameKey: string) => void;
}

function SearchDropdown({
  isOpen,
  debouncedQuery,
  visibleMatches,
  selectedIndex,
  clickedGameKey,
  clickPulseSeq,
  noResultsText,
  onItemClick,
  onItemDoubleClick,
  onLocate,
}: SearchDropdownProps): React.ReactElement {
  const highlightRegex = useMemo(() => buildHighlightRegex(debouncedQuery), [debouncedQuery]);

  return (
    <div className={`search-dropdown ${isOpen ? 'show' : ''}`}>
      {visibleMatches.length === 0 ? (
        <div className="search-item empty-search" role="status" aria-live="polite">
          {noResultsText}
        </div>
      ) : (
        <div role="list">
          {visibleMatches.map((item, i) => {
            const sizeLabel = item.sizeBytes ? formatBytes(item.sizeBytes) : undefined;
            const tooltipMeta =
              [item.engine, sizeLabel].filter(Boolean).join(' • ') || undefined;
            const tooltipSubtitle =
              item.subtitle ||
              item.relativePathFullDisplay ||
              item.relativePathDisplay ||
              item.relativePath ||
              undefined;
            const isClicked = clickedGameKey === item.gameKey;
            const clickedAltClass =
              isClicked && clickPulseSeq % 2 === 1 ? ' is-clicked-alt' : '';
            return (
              <div
                key={item.gameKey}
                role="listitem"
                className={`search-item ${selectedIndex === i ? 'active' : ''}${isClicked ? ` is-clicked${clickedAltClass}` : ''}`}
                data-click-seq={isClicked ? clickPulseSeq : undefined}
                data-tooltip={item.name}
                data-tooltip-meta={tooltipMeta}
                data-tooltip-subtitle={tooltipSubtitle}
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  if ((e.target as HTMLElement | null)?.closest('.search-launch-icon-wrapper')) {
                    return;
                  }
                  onItemClick(item.gameKey, i);
                }}
                onDoubleClick={(e) => {
                  if ((e.target as HTMLElement | null)?.closest('.search-launch-icon-wrapper')) {
                    return;
                  }
                  e.stopPropagation();
                  onItemDoubleClick(item.gameKey, i);
                }}
              >
                <div className="search-item-info">
                  <GameIcon game={item} className="search-item-icon" />
                  <div className="search-item-title-container">
                    <div className="search-item-title">
                      <HighlightedText text={item.name} highlightRegex={highlightRegex} />
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className="search-launch-icon-wrapper"
                  aria-label={`Locate ${item.name} in library`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onLocate(item.gameKey);
                  }}
                >
                  <svg
                    className="search-launch-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M15 10l5 5-5 5" />
                    <path d="M4 4v7a4 4 0 0 0 4 4h12" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function SearchBar({
  query,
  onQueryChange,
  onSelectGame,
  onLocateGame,
  debounceMs = 150,
  onSearch,
  games = [],
  placeholderList,
  temporaryPlaceholder,
}: SearchBarProps): React.ReactElement {
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedGameKey, setSelectedGameKey] = useState<string | null>(null);
  const [clickedPulse, setClickedPulse] = useState<{ gameKey: string; seq: number } | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clickedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isComposingRef = useRef(false);
  const debouncedQueryRef = useRef(debouncedQuery);
  debouncedQueryRef.current = debouncedQuery;

  useEffect(() => {
    return () => {
      if (clickedTimerRef.current) {
        clearTimeout(clickedTimerRef.current);
        clickedTimerRef.current = null;
      }
    };
  }, []);

  useFindShortcut(() => inputRef.current);
  const suppressFocusReopenRef = useRef(false);

  const localeStrings = useLocaleStrings();
  const effectivePlaceholders =
    placeholderList && placeholderList.length > 0
      ? placeholderList
      : localeStrings.placeholders;

  const mascotSearch = useOptionalMascotSearch();
  const activeOverridePlaceholder = temporaryPlaceholder ?? mascotSearch?.activeBonkQuote ?? null;
  const { text: placeholderText, isFadingOut } = useRotatingPlaceholder(
    effectivePlaceholders,
    PLACEHOLDER_ROTATION_MS,
    Boolean(activeOverridePlaceholder) || query.trim().length > 0
  );

  const resetOnEmpty = useCallback(() => {
    debouncedQueryRef.current = '';
    setDebouncedQuery('');
    setIsOpen(false);
    setSelectedGameKey(null);
    if (clickedTimerRef.current) {
      clearTimeout(clickedTimerRef.current);
      clickedTimerRef.current = null;
    }
    setClickedPulse(null);
  }, []);

  const scheduleEmptyClose = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (debouncedQueryRef.current.trim().length === 0) {
      resetOnEmpty();
      return;
    }
    // Guard against transient 1 -> 0 -> 1 query flashes from IME composition resets (e.g. Windows TSF).
    const graceMs = Math.min(debounceMs, EMPTY_CLOSE_GRACE_MS);
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      if (!isComposingRef.current) {
        resetOnEmpty();
      }
    }, graceMs);
  }, [debounceMs, resetOnEmpty]);

  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    if (query.trim().length === 0) {
      if (isComposingRef.current) {
        return;
      }
      scheduleEmptyClose();
      return () => {
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = null;
        }
      };
    }

    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      const unchanged = debouncedQueryRef.current === query;
      debouncedQueryRef.current = query;
      setDebouncedQuery(query);
      setIsOpen(true);
      if (!unchanged) {
        setSelectedGameKey(null);
        onSearch?.(query);
      }
    }, debounceMs);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [query, debounceMs, onSearch, scheduleEmptyClose]);

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

  const searchableGames = useMemo<readonly SearchBarGameItem[]>(() => {
    if (!mascotSearch?.isHideAndSeekCardActive || games.length === 0) {
      return games;
    }
    const mascotItem: SearchBarGameItem = {
      gameKey: MASCOT_CARD_KEY,
      name: mascotSearch.getMascotCardTitle(localeStrings),
      iconUrl: MASCOT_SEARCH_IMAGES[mascotSearch.expression],
      iconFit: 'contain',
    };
    return [...games, mascotItem];
  }, [games, mascotSearch, localeStrings]);

  const visibleMatches = useMemo(() => {
    const normalizedQuery = debouncedQuery.trim().toLowerCase().normalize('NFC');
    if (!normalizedQuery) return [];
    const matched: SearchBarGameItem[] = [];
    for (const g of searchableGames) {
      const name = (g.name || '').normalize('NFC').toLowerCase();
      const folderName = (g.folderName || '').normalize('NFC').toLowerCase();
      const relativePath = String(g.relativePath || '').normalize('NFC').toLowerCase();
      if (
        name.includes(normalizedQuery) ||
        folderName.includes(normalizedQuery) ||
        relativePath.includes(normalizedQuery)
      ) {
        matched.push(g);
        if (matched.length >= MAX_DROPDOWN_RESULTS) break;
      }
    }
    return matched;
  }, [searchableGames, debouncedQuery]);

  const selectedIndex = useMemo(
    () => (selectedGameKey ? visibleMatches.findIndex((m) => m.gameKey === selectedGameKey) : -1),
    [selectedGameKey, visibleMatches]
  );

  const handleFocus = () => {
    if (suppressFocusReopenRef.current) {
      suppressFocusReopenRef.current = false;
      return;
    }
    if (debouncedQueryRef.current.trim().length > 0) {
      setIsOpen(true);
    }
  };

  const triggerClickFeedback = (gameKey: string, _index: number) => {
    setSelectedGameKey(gameKey);
    setClickedPulse((prev) => ({ gameKey, seq: (prev?.seq ?? 0) + 1 }));
    if (clickedTimerRef.current) {
      clearTimeout(clickedTimerRef.current);
    }
    clickedTimerRef.current = setTimeout(() => {
      clickedTimerRef.current = null;
      setClickedPulse(null);
    }, 280);
  };

  const handleItemClick = (gameKey: string, index: number) => {
    triggerClickFeedback(gameKey, index);
  };

  const handleLaunchSelected = (gameKey: string, index: number) => {
    triggerClickFeedback(gameKey, index);
    if (gameKey === MASCOT_CARD_KEY) {
      handleLocate(MASCOT_CARD_KEY);
      return;
    }
    onSelectGame(gameKey);
  };

  const handleLocate = (gameKey: string) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    debouncedQueryRef.current = '';
    setDebouncedQuery('');
    setSelectedGameKey(null);
    onQueryChange('');
    setIsOpen(false);
    if (onLocateGame) {
      onLocateGame(gameKey);
      return;
    }
    if (typeof document !== 'undefined') {
      const cards = document.querySelectorAll<HTMLElement>('.game-card[data-game-key]');
      const card = Array.from(cards).find((el) => el.dataset.gameKey === gameKey);
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.classList.add('glow');
        setTimeout(() => card.classList.remove('glow'), 2000);
      }
    }
  };

  const handleClear = () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    debouncedQueryRef.current = '';
    setDebouncedQuery('');
    setSelectedGameKey(null);
    if (clickedTimerRef.current) {
      clearTimeout(clickedTimerRef.current);
      clickedTimerRef.current = null;
    }
    setClickedPulse(null);
    onQueryChange('');
    inputRef.current?.focus();
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing || isComposingRef.current) {
      return;
    }

    if (e.key === 'Escape') {
      if (isOpen) {
        e.preventDefault();
        setIsOpen(false);
        setSelectedGameKey(null);
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
      const nextIdx = selectedIndex < 0 ? 0 : Math.min(selectedIndex + 1, visibleMatches.length - 1);
      setSelectedGameKey(visibleMatches[nextIdx]?.gameKey ?? null);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const nextIdx = selectedIndex <= 0 ? 0 : selectedIndex - 1;
      setSelectedGameKey(visibleMatches[nextIdx]?.gameKey ?? null);
    } else if (e.key === 'Enter') {
      if (e.repeat) return;
      const targetIndex = selectedIndex >= 0 ? selectedIndex : 0;
      const target = visibleMatches[targetIndex];
      if (target) {
        e.preventDefault();
        handleLaunchSelected(target.gameKey, targetIndex);
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
          id="search-input"
          className="search-input"
          aria-label="Search library games"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onCompositionStart={() => {
            isComposingRef.current = true;
          }}
          onCompositionEnd={(e) => {
            isComposingRef.current = false;
            if (e.currentTarget.value.trim().length === 0) {
              scheduleEmptyClose();
            }
          }}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
        />
        <div
          id="search-placeholder"
          className="search-placeholder"
          aria-hidden="true"
          style={{
            display: query.trim().length > 0 ? 'none' : 'block',
            opacity: activeOverridePlaceholder ? 0.75 : isFadingOut ? 0 : 0.5,
          }}
        >
          {activeOverridePlaceholder ?? placeholderText}
        </div>
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
          clickedGameKey={clickedPulse?.gameKey ?? null}
          clickPulseSeq={clickedPulse?.seq ?? 0}
          noResultsText={localeStrings.no_results}
          onItemClick={handleItemClick}
          onItemDoubleClick={handleLaunchSelected}
          onLocate={handleLocate}
        />
      )}
    </div>
  );
}
