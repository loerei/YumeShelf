import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { sanitizeUserPaths } from '../../shared/path-sanitizer';
import { useLocaleStrings } from '../i18n/locale-strings';
import { normalizeLibraryPath, type FolderSection } from '../library/library-sections';
import type { PlatformInput } from '../../shared/path-subsumption';
import { SortableTabItem } from './SortableTabItem';

export interface ShelfTabsProps {
  readonly sections: readonly FolderSection[];
  readonly activeTabId: string;
  readonly effectiveTabId?: string;
  readonly favoritesCount: number;
  readonly targetPlatform?: PlatformInput;
  readonly onTabSelect: (tabId: string) => void;
  readonly onTabReorder?: (
    oldOrder: readonly string[],
    newOrder: readonly string[],
    movedPath?: string
  ) => Promise<void> | void;
  readonly onShowToast?: (message: string) => void;
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
  onTabReorder,
  onShowToast,
}) => {
  const strings = useLocaleStrings();
  const tablistRef = useRef<HTMLDivElement | null>(null);
  const allTabRef = useRef<HTMLButtonElement | null>(null);
  const tabRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());

  const [hasOverflow, setHasOverflow] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const [activeDragTabId, setActiveDragTabId] = useState<string | null>(null);
  const isDraggingTab = activeDragTabId !== null;
  const [optimisticOrder, setOptimisticOrder] = useState<readonly string[] | null>(null);
  const commitSeqRef = useRef(0);
  const pendingCommitsRef = useRef(0);
  const needsPropSyncRef = useRef(false);
  const sectionsOrderKey = sections.map((s) => s.path).join('\0');

  useEffect(() => {
    if (pendingCommitsRef.current === 0) {
      needsPropSyncRef.current = false;
      setOptimisticOrder(null);
    } else {
      needsPropSyncRef.current = true;
    }
  }, [sectionsOrderKey]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const displayedSections = useMemo<readonly FolderSection[]>(() => {
    if (!optimisticOrder) {
      return sections;
    }
    const sectionMap = new Map(sections.map((s) => [s.path, s]));
    const result: FolderSection[] = [];
    const seen = new Set<string>();
    for (const path of optimisticOrder) {
      const sec = sectionMap.get(path);
      if (sec && !seen.has(path)) {
        result.push(sec);
        seen.add(path);
      }
    }
    for (const sec of sections) {
      if (!seen.has(sec.path)) {
        result.push(sec);
        seen.add(sec.path);
      }
    }
    return result;
  }, [sections, optimisticOrder]);

  const folderTabIds = useMemo(
    () => displayedSections.map((s) => s.path),
    [displayedSections]
  );

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
    displayedSections.forEach((section, index) => {
      list.push({
        id: section.path,
        htmlId: `shelf-tab-folder-${index}`,
        kind: 'folder',
        label: section.displayName,
        count: section.games.length,
      });
    });
    return list;
  }, [displayedSections, favoritesCount, strings.all_folders, strings.favorites]);

  const activeDragTab = useMemo(
    () => (activeDragTabId ? tabs.find((t) => t.kind === 'folder' && t.id === activeDragTabId) ?? null : null),
    [activeDragTabId, tabs]
  );

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
      if (event.defaultPrevented || isDraggingTab) return;
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
    [tabs, onTabSelect, isDraggingTab]
  );

  const handleDragStart = useCallback(({ active }: DragStartEvent) => {
    setActiveDragTabId(String(active.id));
  }, []);

  const handleDragCancel = useCallback(() => {
    setActiveDragTabId(null);
  }, []);

  const handleDragEnd = useCallback(
    async ({ active, over }: DragEndEvent) => {
      setActiveDragTabId(null);
      if (!over || active.id === over.id) return;
      const oldOrder = folderTabIds;
      const oldIndex = oldOrder.indexOf(String(active.id));
      const newIndex = oldOrder.indexOf(String(over.id));
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

      const newOrder = arrayMove([...oldOrder], oldIndex, newIndex);
      const movedPath = String(active.id);

      const seq = ++commitSeqRef.current;
      pendingCommitsRef.current += 1;
      needsPropSyncRef.current = false;
      setOptimisticOrder(newOrder);
      try {
        await onTabReorder?.(oldOrder, newOrder, movedPath);
      } catch (err) {
        console.error('[ShelfTabs] Failed to reorder folder tabs:', {
          movedPath: sanitizeUserPaths(movedPath ?? ''),
          error: sanitizeUserPaths(err instanceof Error ? err.message : String(err)),
          stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
        });
        if (seq === commitSeqRef.current) {
          setOptimisticOrder(null);
          onShowToast?.(strings.toast_tab_reorder_failed);
        }
      } finally {
        pendingCommitsRef.current -= 1;
        if (pendingCommitsRef.current === 0 && needsPropSyncRef.current) {
          needsPropSyncRef.current = false;
          setOptimisticOrder(null);
        }
      }
    },
    [folderTabIds, onTabReorder, onShowToast, strings.toast_tab_reorder_failed]
  );

  const pinnedTabs = useMemo(() => tabs.filter((t) => t.kind !== 'folder'), [tabs]);
  const folderTabs = useMemo(() => tabs.filter((t) => t.kind === 'folder'), [tabs]);

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

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div
          ref={tablistRef}
          className="shelf-tabs-list"
          role="tablist"
          aria-label={strings.shelf_folders_aria}
          onScroll={updateScrollState}
        >
          {pinnedTabs.map((tab, index) => {
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
              </button>
            );
          })}

          <SortableContext items={folderTabIds} strategy={horizontalListSortingStrategy}>
            {folderTabs.map((tab, folderIndex) => {
              const index = pinnedTabs.length + folderIndex;
              const isActive = tab.id === resolvedEffectiveTabId;
              return (
                <SortableTabItem
                  key={tab.id}
                  ref={(node) => {
                    if (node) {
                      tabRefs.current.set(tab.id, node);
                    } else {
                      tabRefs.current.delete(tab.id);
                    }
                  }}
                  id={tab.id}
                  htmlId={tab.htmlId}
                  label={tab.label}
                  count={tab.count}
                  isActive={isActive}
                  index={index}
                  onSelect={onTabSelect}
                  onTabKeyDown={handleTabKeyDown}
                />
              );
            })}
          </SortableContext>
        </div>

        <DragOverlay
          style={{
            zIndex: 'var(--zIndex-tab-drag, 500)' as unknown as number,
            pointerEvents: 'none',
          }}
        >
          {activeDragTab ? (
            <div
              className={`shelf-tab is-drag-overlay${
                activeDragTab.id === resolvedEffectiveTabId ? ' is-active' : ''
              }`}
            >
              <span className="shelf-tab-label">{activeDragTab.label}</span>
              {activeDragTab.count !== undefined && (
                <span className="shelf-tab-count">{activeDragTab.count}</span>
              )}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

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
