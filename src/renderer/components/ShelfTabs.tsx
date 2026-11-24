import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocaleStrings } from '../i18n/locale-strings';
import { normalizeLibraryPath, type FolderSection } from '../library/library-sections';
import type { PlatformInput } from '../../shared/path-subsumption';

export interface ShelfTabsProps {
  readonly sections: readonly FolderSection[];
  readonly activeTabId: string;
  readonly effectiveTabId?: string;
  readonly favoritesCount: number;
  readonly targetPlatform?: PlatformInput;
  readonly onTabSelect: (tabId: string) => void;
}

interface TabDescriptor {
  readonly id: string;
  readonly htmlId: string;
  readonly kind: 'all' | 'fav' | 'folder';
  readonly label: string;
  readonly count?: number;
}

/**
 * Resolves the effective tab ID locally when the coordinator does not pass `effectiveTabId`.
 * Falls back to `'all'` when `activeTabId` is `'fav'` with zero favorites or an unknown path.
 */
function resolveFallbackEffectiveTabId(
  activeTabId: string,
  sections: readonly FolderSection[],
  favoritesCount: number,
  targetPlatform?: PlatformInput
): string {
  if (activeTabId === 'all') {
    return 'all';
  }
  if (activeTabId === 'fav') {
    return favoritesCount > 0 ? 'fav' : 'all';
  }
  const normActive = normalizeLibraryPath(activeTabId, targetPlatform);
  if (!normActive) {
    return 'all';
  }
  const matched = sections.find(
    (section) => normalizeLibraryPath(section.path, targetPlatform) === normActive
  );
  return matched ? matched.path : 'all';
}

/**
 * Pure presentational horizontal segmented shelf tabs bar for Sort by Folder mode.
 */
export const ShelfTabs: React.FC<ShelfTabsProps> = ({
  sections,
  activeTabId,
  effectiveTabId,
  favoritesCount,
  targetPlatform,
  onTabSelect,
}) => {
  const strings = useLocaleStrings();
  const tablistRef = useRef<HTMLDivElement | null>(null);
  const allTabRef = useRef<HTMLButtonElement | null>(null);
  const tabRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());

  const [hasOverflow, setHasOverflow] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const resolvedEffectiveTabId = useMemo(
    () =>
      effectiveTabId ??
      resolveFallbackEffectiveTabId(activeTabId, sections, favoritesCount, targetPlatform),
    [effectiveTabId, activeTabId, sections, favoritesCount, targetPlatform]
  );

  const tabs = useMemo<readonly TabDescriptor[]>(() => {
    const list: TabDescriptor[] = [
      {
        id: 'all',
        htmlId: 'shelf-tab-all',
        kind: 'all',
        label: strings.all_folders,
      },
    ];
    if (favoritesCount > 0) {
      list.push({
        id: 'fav',
        htmlId: 'shelf-tab-fav',
        kind: 'fav',
        label: strings.favorites,
      });
    }
    sections.forEach((section, index) => {
      list.push({
        id: section.path,
        htmlId: `shelf-tab-folder-${index}`,
        kind: 'folder',
        label: section.displayName,
        count: section.games.length,
      });
    });
    return list;
  }, [sections, favoritesCount, strings.all_folders, strings.favorites]);

  const updateScrollState = useCallback(() => {
    const el = tablistRef.current;
    if (!el) return;
    const { scrollWidth, clientWidth, scrollLeft } = el;
    const nextOverflow = scrollWidth > clientWidth;
    const nextLeft = scrollLeft > 1;
    const nextRight = scrollLeft + clientWidth < scrollWidth - 1;

    setHasOverflow((prev) => (prev === nextOverflow ? prev : nextOverflow));
    setCanScrollLeft((prev) => (prev === nextLeft ? prev : nextLeft));
    setCanScrollRight((prev) => (prev === nextRight ? prev : nextRight));
  }, []);

  useEffect(() => {
    updateScrollState();
  }, [sections, favoritesCount, updateScrollState]);

  useEffect(() => {
    const el = tablistRef.current;
    if (!el || typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(() => {
      updateScrollState();
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [updateScrollState]);

  useEffect(() => {
    if (activeTabId === 'fav' && favoritesCount === 0) {
      onTabSelect('all');
      if (!document.activeElement || document.activeElement === document.body) {
        allTabRef.current?.focus();
      }
    }
  }, [activeTabId, favoritesCount, onTabSelect]);

  useEffect(() => {
    const tabEl = tabRefs.current.get(resolvedEffectiveTabId);
    tabEl?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }, [resolvedEffectiveTabId]);

  const handleScrollTabs = useCallback(
    (direction: 'left' | 'right') => {
      const el = tablistRef.current;
      if (!el) return;
      if (direction === 'left' && !canScrollLeft) return;
      if (direction === 'right' && !canScrollRight) return;
      const delta = Math.max(120, Math.floor(el.clientWidth * 0.6));
      el.scrollBy?.({ left: direction === 'left' ? -delta : delta, behavior: 'smooth' });
    },
    [canScrollLeft, canScrollRight]
  );

  const handleTabKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
      if (tabs.length === 0) return;

      let nextIndex: number | null = null;
      if (event.key === 'ArrowRight') {
        nextIndex = (currentIndex + 1) % tabs.length;
      } else if (event.key === 'ArrowLeft') {
        nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      } else if (event.key === 'Home') {
        nextIndex = 0;
      } else if (event.key === 'End') {
        nextIndex = tabs.length - 1;
      }

      if (nextIndex === null) return;
      event.preventDefault();

      const targetTab = tabs[nextIndex];
      if (!targetTab) return;
      onTabSelect(targetTab.id);
      tabRefs.current.get(targetTab.id)?.focus();
    },
    [tabs, onTabSelect]
  );

  return (
    <div className="shelf-tabs-bar" data-has-overflow={hasOverflow ? 'true' : 'false'}>
      <button
        type="button"
        className="shelf-tab-scroll-btn"
        aria-label={strings.scroll_tabs_left}
        data-tooltip={strings.scroll_tabs_left}
        aria-disabled={!canScrollLeft}
        onClick={() => handleScrollTabs('left')}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>

      <div
        ref={tablistRef}
        className="shelf-tabs-list"
        role="tablist"
        aria-label={strings.shelf_folders_aria}
        onScroll={updateScrollState}
      >
        {tabs.map((tab, index) => {
          const isActive = tab.id === resolvedEffectiveTabId;
          return (
            <button
              key={tab.id}
              ref={(node) => {
                tabRefs.current.set(tab.id, node);
                if (tab.kind === 'all') {
                  allTabRef.current = node;
                }
              }}
              id={tab.htmlId}
              type="button"
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              className={`shelf-tab${isActive ? ' is-active' : ''}`}
              onClick={() => onTabSelect(tab.id)}
              onKeyDown={(e) => handleTabKeyDown(e, index)}
            >
              {tab.kind === 'fav' && (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              )}
              <span className="shelf-tab-label">{tab.label}</span>
              {tab.kind === 'folder' && (
                <span className="shelf-tab-count">{tab.count}</span>
              )}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        className="shelf-tab-scroll-btn"
        aria-label={strings.scroll_tabs_right}
        data-tooltip={strings.scroll_tabs_right}
        aria-disabled={!canScrollRight}
        onClick={() => handleScrollTabs('right')}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
    </div>
  );
};
