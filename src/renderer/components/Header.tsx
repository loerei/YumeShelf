import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { CategoryNode } from '../domain/category-tree';
import {
  useActiveCategoryId,
  useCategoryTree,
  useCurrentSort,
  useLibraryDispatch,
  useSearchableGames,
} from '../hooks/useLibraryState';
import type { GameEntry } from '../types/game';
import { CategoryFilter } from './CategoryFilter';
import { SearchBar, type SearchBarGameItem } from './SearchBar';

const SORT_OPTIONS = [
  { id: 'date', label: 'Newest' },
  { id: 'played', label: 'Recently Played' },
  { id: 'az', label: 'Name A-Z' },
  { id: 'custom', label: 'Custom Order' },
] as const;

export interface HeaderProps {
  // Navigation & Search
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  onSelectGame?: (gameKey: string) => void;
  games?: readonly SearchBarGameItem[] | readonly GameEntry[];

  // Category Filter
  categories?: readonly CategoryNode[];
  activeCategoryId?: string | null;
  onSelectCategory?: (categoryId: string | null) => void;

  // Sort Controls
  currentSort?: string;
  onSortChange?: (sort: string) => void;

  // Library Rescan Action
  onRefreshLibrary?: () => void;
  isRefreshing?: boolean;

  // Modal Actions
  onOpenSettings?: () => void;
}

export interface HeaderViewProps extends HeaderProps {}

export function HeaderView({
  searchQuery,
  onSearchChange,
  onSelectGame,
  games = [],
  categories = [],
  activeCategoryId = null,
  onSelectCategory,
  currentSort = 'date',
  onSortChange,
  onRefreshLibrary,
  isRefreshing = false,
  onOpenSettings,
}: HeaderViewProps): React.ReactElement {
  const [internalQuery, setInternalQuery] = useState('');
  const [isSortOpen, setIsSortOpen] = useState(false);

  const sortContainerRef = useRef<HTMLDivElement | null>(null);
  const sortBtnRef = useRef<HTMLButtonElement | null>(null);

  const isSearchControlled = searchQuery !== undefined;
  const resolvedQuery = isSearchControlled ? searchQuery : internalQuery;

  const handleSearchChange = useCallback(
    (nextQuery: string) => {
      if (!isSearchControlled) {
        setInternalQuery(nextQuery);
      }
      onSearchChange?.(nextQuery);
    },
    [isSearchControlled, onSearchChange]
  );

  const handleSelectGame = useCallback(
    (gameKey: string) => {
      if (!isSearchControlled) {
        setInternalQuery('');
      }
      onSelectGame?.(gameKey);
    },
    [isSearchControlled, onSelectGame]
  );

  const handleRefreshClick = () => {
    if (isRefreshing) return;
    onRefreshLibrary?.();
  };

  useEffect(() => {
    if (!isSortOpen) return;

    const handlePointerDown = (e: PointerEvent) => {
      if (sortContainerRef.current && !sortContainerRef.current.contains(e.target as Node)) {
        setIsSortOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsSortOpen(false);
        sortBtnRef.current?.focus();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isSortOpen]);

  const activeSortLabel = SORT_OPTIONS.find((opt) => opt.id === currentSort)?.label ?? 'Newest';

  return (
    <header className="header">
      <h1 id="ui-title">YumeShelf</h1>

      <SearchBar
        query={resolvedQuery}
        onQueryChange={handleSearchChange}
        onSelectGame={handleSelectGame}
        games={games}
      />

      <div className="controls">
        <CategoryFilter
          categories={categories}
          activeCategoryId={activeCategoryId}
          onSelectCategory={(catId) => onSelectCategory?.(catId)}
        />

        <button
          type="button"
          className={`header-icon-btn refresh-library-btn ${isRefreshing ? 'is-refreshing' : ''}`}
          onClick={handleRefreshClick}
          title="Refresh Library"
          aria-label="Refresh Library"
          aria-busy={isRefreshing}
          aria-disabled={isRefreshing}
          style={isRefreshing ? { pointerEvents: 'none' } : undefined}
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
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <path d="M21 3v6h-6" />
          </svg>
        </button>

        <div
          ref={sortContainerRef}
          className="sort-container"
          onBlur={(e) => {
            if (sortContainerRef.current && !sortContainerRef.current.contains(e.relatedTarget as Node | null)) {
              setIsSortOpen(false);
            }
          }}
        >
          <button
            ref={sortBtnRef}
            type="button"
            id="sort-btn"
            className="header-icon-btn sort-btn"
            aria-label="Sort library games"
            title="Sort library games"
            aria-haspopup="menu"
            aria-expanded={isSortOpen}
            onClick={() => setIsSortOpen((prev) => !prev)}
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
              <line x1="4" y1="6" x2="20" y2="6" />
              <line x1="7" y1="12" x2="17" y2="12" />
              <line x1="10" y1="18" x2="14" y2="18" />
            </svg>
            <span id="sort-active-label">{activeSortLabel}</span>
            <svg
              className="sort-caret"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {isSortOpen && (
            <div
              className={`sort-menu ${isSortOpen ? 'show' : ''}`}
              role="menu"
              onMouseDown={(e) => e.preventDefault()}
            >
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  role="menuitem"
                  className={`sort-item ${currentSort === opt.id ? 'active' : ''}`}
                  onClick={() => {
                    sortBtnRef.current?.focus();
                    setIsSortOpen(false);
                    onSortChange?.(opt.id);
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          id="settings-open-btn"
          className="settings-icon-btn header-icon-btn"
          onClick={onOpenSettings}
          title="Settings"
          aria-label="Settings"
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
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>
    </header>
  );
}

export function Header(props: HeaderProps): React.ReactElement {
  const currentSort = useCurrentSort();
  const activeCategoryId = useActiveCategoryId();
  const categoryTree = useCategoryTree();
  const searchableGames = useSearchableGames();
  const dispatch = useLibraryDispatch();

  const handleSortChange = useCallback(
    (sort: string) => {
      if (props.onSortChange) {
        props.onSortChange(sort);
      } else {
        dispatch.setCurrentSort(sort);
      }
    },
    [props.onSortChange, dispatch]
  );

  const handleSelectCategory = useCallback(
    (catId: string | null) => {
      if (props.onSelectCategory) {
        props.onSelectCategory(catId);
      } else {
        dispatch.setActiveCategoryId(catId);
      }
    },
    [props.onSelectCategory, dispatch]
  );

  return (
    <HeaderView
      {...props}
      games={props.games ?? searchableGames}
      currentSort={props.currentSort ?? currentSort}
      activeCategoryId={props.activeCategoryId ?? activeCategoryId}
      categories={props.categories ?? categoryTree}
      onSortChange={handleSortChange}
      onSelectCategory={handleSelectCategory}
    />
  );
}
