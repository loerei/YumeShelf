import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { sanitizeUserPaths } from '../../shared/path-sanitizer';
import type { ElectronAPI } from '../../shared/types/ipc';
import {
  useActiveCategoryId,
  useAllGames,
  useCategoryTree,
  useCurrentSort,
  useLibraryDispatch,
  useLibraryStore,
} from '../hooks/useLibraryState';
import {
  areStringArraysEqual,
  readStoredCustomOrder,
  resolveCustomOrder,
} from '../library-order';
import {
  buildLibraryViewItems,
  findGameEntryByKey,
  patchRunningGameViewItem,
  resolveFavoriteLockKey,
  type LibraryViewItem,
} from '../library-stacks';
import type { UiStorageAdapter } from '../state/ui-runtime-state';
import type { GameEntry } from '../types/game';
import type { CategoryNode } from '../domain/category-tree';
import {
  GameCard,
  type GameCardMenuAction,
  type GameCardMenuPayload,
  type GameCardProps,
} from './GameCard';
import { StackCard, type StackCardProps } from './StackCard';
import { FilteredEmptyState, LibraryEmptyState } from './LibraryEmptyState';

export interface LibraryGridProps {
  electronAPI?: ElectronAPI;
  storage?: UiStorageAdapter;
  containerRef?: React.RefObject<HTMLDivElement | null>;
  customOrder?: readonly string[] | null;
  focusTargetKey?: string | null;
  onFocusHandled?: () => void;
  onOpenStack?: (stack: LibraryViewItem) => void;
  onOpenSaveEditor?: (gameKey: string) => void;
  onLaunch?: (game: GameEntry) => void;
  onMenuAction?: (action: GameCardMenuAction, game: GameEntry, payload?: GameCardMenuPayload) => void;
  onRefreshLibrary?: () => Promise<void> | void;
  onFavoriteError?: (error: Error, gameKey: string) => void;
  inFlightFavoriteKeysRef?: React.MutableRefObject<Set<string>>;
  GameCardComponent?: React.ComponentType<GameCardProps>;
  StackCardComponent?: React.ComponentType<StackCardProps>;
}

function isStructuralChange(
  prevGames: readonly GameEntry[],
  nextGames: readonly GameEntry[]
): boolean {
  if (prevGames.length !== nextGames.length) return true;
  for (let i = 0; i < prevGames.length; i++) {
    const p = prevGames[i];
    const n = nextGames[i];
    if (
      p.gameId !== n.gameId ||
      p.gameKey !== n.gameKey ||
      p.relativePath !== n.relativePath ||
      p.title !== n.title ||
      p.name !== n.name ||
      !areStringArraysEqual(p.categoryIds, n.categoryIds) ||
      p.favorite !== n.favorite ||
      p.lastPlayed !== n.lastPlayed ||
      p.dateAdded !== n.dateAdded ||
      p.instances?.length !== n.instances?.length
    ) {
      return true;
    }
  }
  return false;
}

function areCustomOrdersEqual(
  prev?: readonly string[] | null,
  next?: readonly string[] | null
): boolean {
  if (prev === next) return true;
  if (!prev || !next || prev.length !== next.length) return false;
  for (let i = 0; i < prev.length; i++) {
    if (prev[i] !== next[i]) return false;
  }
  return true;
}

function findCategoryNameById(nodes: readonly CategoryNode[], id: string): string | undefined {
  for (const node of nodes) {
    if (node.id === id) return node.name;
    if (node.children && node.children.length > 0) {
      const found = findCategoryNameById(node.children, id);
      if (found) return found;
    }
  }
  return undefined;
}

export function LibraryGrid({
  electronAPI,
  storage,
  containerRef,
  customOrder,
  focusTargetKey,
  onFocusHandled,
  onOpenStack,
  onOpenSaveEditor,
  onLaunch,
  onMenuAction,
  onRefreshLibrary,
  onFavoriteError,
  inFlightFavoriteKeysRef,
  GameCardComponent,
  StackCardComponent,
}: LibraryGridProps): React.ReactElement {
  const allGames = useAllGames();
  const activeCategoryId = useActiveCategoryId();
  const currentSort = useCurrentSort();
  const categoryTree = useCategoryTree();
  const dispatch = useLibraryDispatch();
  const store = useLibraryStore();

  const api = electronAPI ?? (typeof window !== 'undefined' ? window.electronAPI : undefined);
  const CardComponent = GameCardComponent ?? GameCard;
  const StackComponent = StackCardComponent ?? StackCard;

  const internalContainerRef = useRef<HTMLDivElement | null>(null);
  const resolvedGridContainerRef = containerRef ?? internalContainerRef;
  const cardRefs = useRef(new Map<string, HTMLElement>());
  const cardRefCallbacksRef = useRef(new Map<string, (el: HTMLDivElement | null) => void>());
  const activeToggledKeyRef = useRef<string | null>(null);
  const localInFlightRef = useRef<Set<string>>(new Set());
  const inFlightRef = inFlightFavoriteKeysRef ?? localInFlightRef;

  const committedGamesRef = useRef<readonly GameEntry[]>([]);
  const committedItemsRef = useRef<readonly LibraryViewItem[]>([]);
  const committedSortRef = useRef<string>(currentSort);
  const committedCustomOrderRef = useRef<readonly string[] | null | undefined>(customOrder);
  const committedCustomOrderPropRef = useRef<readonly string[] | null | undefined>(customOrder);
  const committedStorageRef = useRef<UiStorageAdapter | undefined>(storage);
  const hasCommittedRef = useRef<boolean>(false);

  const visibleGames = useMemo(
    () => (activeCategoryId ? allGames.filter((g) => g.categoryIds?.includes(activeCategoryId)) : allGames),
    [allGames, activeCategoryId]
  );

  const { viewItems, resolvedCustomOrder } = useMemo(() => {
    const prevSort = committedSortRef.current;
    const prevGames = committedGamesRef.current;
    const prevItems = committedItemsRef.current;
    const prevCustomOrder = committedCustomOrderRef.current;
    const prevCustomOrderProp = committedCustomOrderPropRef.current;
    const prevStorage = committedStorageRef.current;
    const isInitialized = hasCommittedRef.current;

    const isSortChanged = prevSort !== currentSort;
    const isGamesStructurallyChanged = isStructuralChange(prevGames, visibleGames);
    const isStorageChanged = prevStorage !== storage;
    const isCustomOrderPropChanged =
      (prevCustomOrderProp === undefined) !== (customOrder === undefined) ||
      !areCustomOrdersEqual(prevCustomOrderProp, customOrder);

    // Empty collection fast-path: zero storage reads and zero redundant builds
    if (visibleGames.length === 0) {
      return {
        viewItems: prevItems.length === 0 ? prevItems : ([] as readonly LibraryViewItem[]),
        resolvedCustomOrder: customOrder !== undefined ? customOrder : prevCustomOrder ?? null,
      };
    }

    // Gated Custom Order Resolution: only read storage and compute when custom sort is active AND structural changes or prop/adapter shifts occurred
    let currentResolvedCustomOrder: readonly string[] | null = null;
    let isCustomOrderChanged = false;

    if (customOrder !== undefined) {
      currentResolvedCustomOrder = customOrder;
      isCustomOrderChanged = currentSort === 'custom' && isCustomOrderPropChanged;
    } else if (currentSort === 'custom') {
      if (
        !isInitialized ||
        isSortChanged ||
        isGamesStructurallyChanged ||
        isStorageChanged ||
        isCustomOrderPropChanged ||
        prevCustomOrder == null
      ) {
        currentResolvedCustomOrder = resolveCustomOrder(allGames, readStoredCustomOrder(storage));
        isCustomOrderChanged = !areCustomOrdersEqual(prevCustomOrder, currentResolvedCustomOrder);
      } else {
        // Steady-state non-structural update (playtime tick, isRunning): reuse cached custom order without I/O or sorting
        currentResolvedCustomOrder = prevCustomOrder;
        isCustomOrderChanged = false;
      }
    }

    if (!isInitialized || isSortChanged || isCustomOrderChanged || isGamesStructurallyChanged) {
      const built = buildLibraryViewItems(visibleGames, currentSort, currentResolvedCustomOrder);
      return {
        viewItems: built.items,
        resolvedCustomOrder: currentResolvedCustomOrder,
      };
    }

    // Incremental fast-path: patch updated running/playtime games from previously committed items
    const changedGames = visibleGames.filter((next, i) => prevGames[i] !== next);
    let patched = prevItems;
    for (const changedGame of changedGames) {
      patched = patchRunningGameViewItem(patched, changedGame);
    }
    return {
      viewItems: patched,
      resolvedCustomOrder: currentResolvedCustomOrder,
    };
  }, [visibleGames, allGames, currentSort, customOrder, storage]);

  // Post-commit ref synchronization: purely isolated from render phase
  useEffect(() => {
    committedGamesRef.current = visibleGames;
    committedItemsRef.current = viewItems;
    committedSortRef.current = currentSort;
    committedCustomOrderRef.current = resolvedCustomOrder;
    committedCustomOrderPropRef.current = customOrder;
    committedStorageRef.current = storage;
    hasCommittedRef.current = true;
  }, [visibleGames, viewItems, currentSort, resolvedCustomOrder, customOrder, storage]);

  const getCardRefCallback = useCallback((key: string) => {
    let cb = cardRefCallbacksRef.current.get(key);
    if (!cb) {
      cb = (el: HTMLDivElement | null) => {
        if (el) cardRefs.current.set(key, el);
        else cardRefs.current.delete(key);
      };
      cardRefCallbacksRef.current.set(key, cb);
    }
    return cb;
  }, []);

  // Prune stale per-key ref callbacks post-commit when viewItems changes
  useEffect(() => {
    const activeKeys = new Set<string>();
    for (const item of viewItems) {
      activeKeys.add(item.isStack ? item.groupKey : item.representativeKey);
    }
    for (const cachedKey of cardRefCallbacksRef.current.keys()) {
      if (!activeKeys.has(cachedKey)) {
        cardRefCallbacksRef.current.delete(cachedKey);
      }
    }
  }, [viewItems]);

  const handleToggleFavoriteGame = useCallback(
    async (game: GameEntry) => {
      const key = game.gameKey || game.gameId;
      if (!key) return;
      const currentGames = store.getSnapshot().allGames;
      const lockKey = resolveFavoriteLockKey(key, currentGames) ?? key;
      if (inFlightRef.current.has(lockKey)) return;
      inFlightRef.current.add(lockKey);

      const prevFav = game.favorite;
      const nextFav = !prevFav;
      activeToggledKeyRef.current = key;
      // 1. Optimistic Local Store Toggle (moves card between #unfav-grid and #fav-grid)
      dispatch.updateGame(key, { favorite: nextFav });
      try {
        if (api?.toggleFavorite) {
          const res = await api.toggleFavorite(key, nextFav);
          if (typeof res === 'boolean' && res !== nextFav) {
            console.warn('[LibraryGrid] Backend rejected favorite toggle; rolling back optimistic state:', {
              gameKey: sanitizeUserPaths(key),
              requested: nextFav,
              backendState: res,
            });
            const latestEntry = findGameEntryByKey(store.getSnapshot().allGames, key);
            if (latestEntry && latestEntry.favorite !== res) {
              activeToggledKeyRef.current = key;
              dispatch.updateGame(key, { favorite: res });
            }
            onFavoriteError?.(
              new Error(`Backend desynchronization: requested favorite=${nextFav}, backend returned ${res}`),
              key
            );
          }
        }
      } catch (err) {
        // 2. Transactional Rollback on Rejection
        activeToggledKeyRef.current = key;
        dispatch.updateGame(key, { favorite: prevFav });
        const rawMsg = err instanceof Error ? err.message : String(err);
        console.error('[LibraryGrid] Failed to toggle favorite:', {
          gameKey: sanitizeUserPaths(key),
          error: sanitizeUserPaths(rawMsg),
          stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
        });
        onFavoriteError?.(err instanceof Error ? err : new Error(String(err)), key);
      } finally {
        inFlightRef.current.delete(lockKey);
      }
    },
    [api, dispatch, store, inFlightFavoriteKeysRef, onFavoriteError]
  );

  const handleToggleFavoriteStack = useCallback(
    async (stack: LibraryViewItem) => {
      // Decoupled key resolution: UI store requires groupKey for stack-wide batching;
      // IPC membrane requires authentic storage key (representativeKey) for main process DB resolution.
      const storeTargetKey = stack.groupKey || stack.representativeKey || stack.primaryGame.gameKey;
      const ipcTargetKey = stack.representativeKey || stack.primaryGame.gameKey;
      const currentGames = store.getSnapshot().allGames;
      const lockKey = resolveFavoriteLockKey(storeTargetKey, currentGames) ?? storeTargetKey;
      if (!lockKey || inFlightRef.current.has(lockKey)) return;
      inFlightRef.current.add(lockKey);

      const prevFav = stack.favorite;
      const nextFav = !prevFav;
      activeToggledKeyRef.current = stack.groupKey;

      // 1. Optimistic Local Store Toggle (targeting groupKey updates all instances in stack)
      dispatch.updateGame(storeTargetKey, { favorite: nextFav });
      try {
        if (api?.toggleFavorite) {
          const res = await api.toggleFavorite(ipcTargetKey, nextFav);
          if (typeof res === 'boolean' && res !== nextFav) {
            console.warn('[LibraryGrid] Backend rejected stack favorite toggle; rolling back optimistic state:', {
              ipcTargetKey: sanitizeUserPaths(ipcTargetKey),
              storeTargetKey: sanitizeUserPaths(storeTargetKey),
              groupKey: sanitizeUserPaths(stack.groupKey),
              requested: nextFav,
              backendState: res,
            });
            const latestEntry = findGameEntryByKey(store.getSnapshot().allGames, storeTargetKey);
            if (latestEntry && latestEntry.favorite !== res) {
              activeToggledKeyRef.current = stack.groupKey;
              dispatch.updateGame(storeTargetKey, { favorite: res });
            }
            onFavoriteError?.(
              new Error(`Backend desynchronization on stack: requested favorite=${nextFav}, backend returned ${res}`),
              ipcTargetKey
            );
          }
        }
      } catch (err) {
        // 2. Transactional Rollback on Rejection
        activeToggledKeyRef.current = stack.groupKey;
        dispatch.updateGame(storeTargetKey, { favorite: prevFav });
        const rawMsg = err instanceof Error ? err.message : String(err);
        console.error('[LibraryGrid] Failed to toggle favorite on stack:', {
          storeTargetKey: sanitizeUserPaths(storeTargetKey),
          ipcTargetKey: sanitizeUserPaths(ipcTargetKey),
          groupKey: sanitizeUserPaths(stack.groupKey),
          error: sanitizeUserPaths(rawMsg),
          stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
        });
        onFavoriteError?.(err instanceof Error ? err : new Error(String(err)), ipcTargetKey);
      } finally {
        inFlightRef.current.delete(lockKey);
      }
    },
    [api, dispatch, store, inFlightFavoriteKeysRef, onFavoriteError]
  );

  // Synchronous unmount focus handoff across partition boundaries
  useEffect(() => {
    if (!activeToggledKeyRef.current) return;
    if (document.activeElement?.closest('[role="dialog"]')) return;
    const key = activeToggledKeyRef.current;
    activeToggledKeyRef.current = null;

    // Symmetrical key resolution across raw and "game:" prefixed keys
    const targetEl =
      cardRefs.current.get(key) ??
      (key.startsWith('game:')
        ? cardRefs.current.get(key.slice(5))
        : cardRefs.current.get(`game:${key}`));

    if (targetEl) {
      const favBtn = targetEl.querySelector<HTMLElement>('.fav-btn');
      if (favBtn) {
        favBtn.focus();
      } else {
        targetEl.focus();
      }
    } else {
      // Defensive fallback to resolved grid container if card was filtered out by active category
      resolvedGridContainerRef.current?.focus();
    }
  }, [viewItems, resolvedGridContainerRef]);

  // Declarative focus restoration for focusTargetKey
  useEffect(() => {
    if (!focusTargetKey) return;
    if (focusTargetKey === '__GRID_CONTAINER__') {
      resolvedGridContainerRef.current?.focus();
      onFocusHandled?.();
      return;
    }
    const targetEl = cardRefs.current.get(focusTargetKey);
    if (targetEl) {
      targetEl.focus();
    } else {
      // Resolve adjacent surviving item from rendered viewItems before falling back to container
      const fallbackItem =
        viewItems.find(
          (item) =>
            item.representativeKey === focusTargetKey ||
            item.groupKey === focusTargetKey ||
            item.games.some((g) => (g.gameKey || g.gameId) === focusTargetKey)
        ) ?? viewItems[0];
      const fallbackEl = fallbackItem
        ? cardRefs.current.get(fallbackItem.isStack ? fallbackItem.groupKey : fallbackItem.representativeKey)
        : null;
      if (fallbackEl) {
        fallbackEl.focus();
      } else {
        resolvedGridContainerRef.current?.focus();
      }
    }
    onFocusHandled?.();
  }, [focusTargetKey, viewItems, onFocusHandled, resolvedGridContainerRef]);

  const handleClearFilter = useCallback(() => {
    resolvedGridContainerRef.current?.focus();
    dispatch.setActiveCategoryId(null);
  }, [dispatch, resolvedGridContainerRef]);

  const handleEmptySetupSuccess = useCallback(() => {
    resolvedGridContainerRef.current?.focus();
  }, [resolvedGridContainerRef]);

  const favorites = useMemo(() => viewItems.filter((item) => item.favorite), [viewItems]);
  const nonFavorites = useMemo(() => viewItems.filter((item) => !item.favorite), [viewItems]);

  const activeCategoryName = useMemo(
    () => (activeCategoryId ? findCategoryNameById(categoryTree, activeCategoryId) : undefined),
    [categoryTree, activeCategoryId]
  );

  const renderItem = (item: LibraryViewItem) =>
    item.isStack ? (
      <StackComponent
        key={item.groupKey}
        ref={getCardRefCallback(item.groupKey)}
        stack={item}
        onOpenStack={onOpenStack}
        onToggleFavorite={handleToggleFavoriteStack}
        onMenuAction={onMenuAction}
      />
    ) : (
      <CardComponent
        key={item.representativeKey}
        ref={getCardRefCallback(item.representativeKey)}
        game={item.primaryGame}
        onToggleFavorite={handleToggleFavoriteGame}
        onLaunch={onLaunch}
        onOpenSaveEditor={onOpenSaveEditor}
        onMenuAction={onMenuAction}
      />
    );

  return (
    <div
      ref={resolvedGridContainerRef}
      className="library-grid"
      data-testid="library-grid"
      tabIndex={-1}
    >
      {allGames.length === 0 ? (
        <LibraryEmptyState
          electronAPI={api}
          onRefreshLibrary={onRefreshLibrary}
          onSetupSuccess={handleEmptySetupSuccess}
        />
      ) : viewItems.length === 0 ? (
        <FilteredEmptyState
          onClearFilter={handleClearFilter}
          categoryName={activeCategoryName}
        />
      ) : (
        <>
          <div id="fav-grid" className="grid-section">
            {favorites.map(renderItem)}
          </div>
          {favorites.length > 0 && nonFavorites.length > 0 && (
            <div id="favorites-separator" className="favorites-separator-container">
              <div className="favorites-separator" />
            </div>
          )}
          <div id="unfav-grid" className="grid-section">
            {nonFavorites.map(renderItem)}
          </div>
        </>
      )}
    </div>
  );
}
