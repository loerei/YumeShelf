import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sanitizeUserPaths } from '../../shared/path-sanitizer';
import {
  reorderLibraryPathsWithSubsumption,
  type PlatformInput,
} from '../../shared/path-subsumption';
import type { ElectronAPI } from '../../shared/types/ipc';
import {
  useActiveCategoryId,
  useAllGames,
  useCategoryTree,
  useCurrentSort,
  useLibraryDispatch,
  useLibrarySelector,
  useLibraryStore,
} from '../hooks/useLibraryState';
import {
  projectLibrarySections,
  selectFolderTabProjection,
  type FolderSection as FolderSectionModel,
  type LibrarySectionsProjection,
} from '../library/library-sections';
import { annotateGamesForDisplay } from '../game-annotations';
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
import { ShelfTabs } from './ShelfTabs';
import { FolderAccordion } from './FolderAccordion';
import { FolderTitle } from './FolderTitle';
import { EmptyFolderPrompt } from './EmptyFolderPrompt';
import { SortableGameCard } from './SortableGameCard';
import { GameDndContext } from '../dnd/GameDndContext';
import { useStableItemIds } from '../hooks/useStableItemIds';
import { useCardLayoutFlip } from '../hooks/useCardLayoutFlip';

const ACTIVE_FOLDER_TAB_KEY = 'yumeshelf_active_folder_tab';

const defaultStorage: UiStorageAdapter =
  typeof localStorage !== 'undefined'
    ? localStorage
    : {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      };

const formatSanitizedError = (err: unknown) => ({
  error: sanitizeUserPaths(err instanceof Error ? err.message : err),
  stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
});

function readActiveFolderTab(storage: UiStorageAdapter): string {
  try {
    return storage.getItem(ACTIVE_FOLDER_TAB_KEY)?.trim() || 'all';
  } catch (err) {
    console.warn('[LibraryGrid] Failed to read active folder tab from storage:', formatSanitizedError(err));
    return 'all';
  }
}

function writeActiveFolderTab(tabId: string, storage: UiStorageAdapter): void {
  try {
    storage.setItem(ACTIVE_FOLDER_TAB_KEY, tabId);
  } catch (err) {
    console.warn('[LibraryGrid] Failed to persist active folder tab:', formatSanitizedError(err));
  }
}

const isFocusableCardElement = (el: HTMLElement | null | undefined): el is HTMLElement =>
  Boolean(el && el.isConnected && !el.closest('[inert]'));

export interface LibraryGridProps {
  electronAPI?: ElectronAPI;
  storage?: UiStorageAdapter;
  targetPlatform?: PlatformInput;
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
  onShowToast?: (message: string) => void;
  onCustomOrderChange?: (nextOrder: readonly string[]) => void;
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

function areFolderAliasesEqual(
  prev?: Readonly<Record<string, string>>,
  next?: Readonly<Record<string, string>>
): boolean {
  if (prev === next) return true;
  if (!prev || !next) return false;
  const prevKeys = Object.keys(prev);
  const nextKeys = Object.keys(next);
  if (prevKeys.length !== nextKeys.length) return false;
  for (const key of prevKeys) {
    if (prev[key] !== next[key]) return false;
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
  targetPlatform,
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
  onShowToast,
  onCustomOrderChange,
  inFlightFavoriteKeysRef,
  GameCardComponent,
  StackCardComponent,
}: LibraryGridProps): React.ReactElement {
  const allGames = useAllGames();
  const activeCategoryId = useActiveCategoryId();
  const currentSort = useCurrentSort();
  const categoryTree = useCategoryTree();
  const currentLibraryConfig = useLibrarySelector((s) => s.currentLibraryConfig);
  const dispatch = useLibraryDispatch();
  const store = useLibraryStore();

  const resolvedStorage: UiStorageAdapter = storage ?? defaultStorage;
  const [activeTabId, setActiveTabId] = useState<string>(() => readActiveFolderTab(resolvedStorage));
  const [isDraggingCard, setIsDraggingCard] = useState(false);
  const [customOrderRevision, setCustomOrderRevision] = useState(0);
  const committedCustomOrderRevisionRef = useRef(customOrderRevision);

  const rootPaths = useMemo(
    () =>
      currentLibraryConfig?.libraryPaths?.length
        ? currentLibraryConfig.libraryPaths
        : currentLibraryConfig?.libraryPath
          ? [currentLibraryConfig.libraryPath]
          : [],
    [currentLibraryConfig]
  );
  const folderAliases = currentLibraryConfig?.folderAliases;

  const api = electronAPI ?? (typeof window !== 'undefined' ? window.electronAPI : undefined);
  const CardComponent = GameCardComponent ?? GameCard;
  const StackComponent = StackCardComponent ?? StackCard;

  const internalContainerRef = useRef<HTMLDivElement | null>(null);
  const resolvedGridContainerRef = containerRef ?? internalContainerRef;
  const cardRefs = useRef(new Map<string, HTMLElement>());
  const cardRefCallbacksRef = useRef(new Map<string, (el: HTMLDivElement | null) => void>());
  const cardRawKeysRef = useRef(new Map<string, string>());
  const activeToggledKeyRef = useRef<string | null>(null);
  const pendingFocusKeyRef = useRef<string | null>(null);
  const reorderSeqRef = useRef(0);
  const localInFlightRef = useRef<Set<string>>(new Set());
  const inFlightRef = inFlightFavoriteKeysRef ?? localInFlightRef;

  const committedGamesRef = useRef<readonly GameEntry[]>([]);
  const committedItemsRef = useRef<readonly LibraryViewItem[]>([]);
  const committedSortRef = useRef<string>(currentSort);
  const committedCustomOrderRef = useRef<readonly string[] | null | undefined>(customOrder);
  const committedCustomOrderPropRef = useRef<readonly string[] | null | undefined>(customOrder);
  const committedStorageRef = useRef<UiStorageAdapter | undefined>(storage);
  const committedTabIdRef = useRef<string>(activeTabId);
  const committedCategoryIdRef = useRef<string | null>(activeCategoryId);
  const committedRootPathsRef = useRef<readonly string[]>(rootPaths);
  const committedFolderAliasesRef = useRef<Readonly<Record<string, string>> | undefined>(folderAliases);
  const committedStructuralLayoutRevisionRef = useRef<number>(0);
  const hasCommittedRef = useRef<boolean>(false);

  const visibleGames = useMemo(
    () => (activeCategoryId ? allGames.filter((g) => g.categoryIds?.includes(activeCategoryId)) : allGames),
    [allGames, activeCategoryId]
  );

  const { viewItems, resolvedCustomOrder, didRebuildViewItems } = useMemo(() => {
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
    const isRevisionChanged = committedCustomOrderRevisionRef.current !== customOrderRevision;
    const isCustomOrderPropChanged =
      (prevCustomOrderProp === undefined) !== (customOrder === undefined) ||
      !areCustomOrdersEqual(prevCustomOrderProp, customOrder);

    // Empty collection fast-path: zero storage reads and zero redundant builds
    if (visibleGames.length === 0) {
      return {
        viewItems: prevItems.length === 0 ? prevItems : ([] as readonly LibraryViewItem[]),
        resolvedCustomOrder: customOrder !== undefined ? customOrder : prevCustomOrder ?? null,
        didRebuildViewItems: prevItems.length !== 0,
      };
    }

    // Gated Custom Order Resolution: only read storage and compute when custom or folder sort is active AND structural changes or prop/adapter shifts occurred
    let currentResolvedCustomOrder: readonly string[] | null = null;
    let isCustomOrderChanged = false;
    const usesCustomOrder = currentSort === 'custom' || currentSort === 'folder';

    if (customOrder !== undefined) {
      currentResolvedCustomOrder = customOrder;
      isCustomOrderChanged = usesCustomOrder && isCustomOrderPropChanged;
    } else if (usesCustomOrder) {
      if (
        !isInitialized ||
        isSortChanged ||
        isGamesStructurallyChanged ||
        isStorageChanged ||
        isCustomOrderPropChanged ||
        isRevisionChanged ||
        prevCustomOrder == null
      ) {
        currentResolvedCustomOrder = resolveCustomOrder(allGames, readStoredCustomOrder(resolvedStorage));
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
        didRebuildViewItems: true,
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
      didRebuildViewItems: false,
    };
  }, [visibleGames, allGames, currentSort, customOrder, storage, resolvedStorage, customOrderRevision]);

  const structuralLayoutRevision = useMemo(() => {
    if (!hasCommittedRef.current) {
      return committedStructuralLayoutRevisionRef.current;
    }
    const layoutChanged =
      didRebuildViewItems ||
      committedSortRef.current !== currentSort ||
      committedTabIdRef.current !== activeTabId ||
      committedCategoryIdRef.current !== activeCategoryId ||
      !areStringArraysEqual(committedRootPathsRef.current, rootPaths) ||
      !areFolderAliasesEqual(committedFolderAliasesRef.current, folderAliases) ||
      committedCustomOrderRevisionRef.current !== customOrderRevision;
    return committedStructuralLayoutRevisionRef.current + (layoutChanged ? 1 : 0);
  }, [
    viewItems,
    didRebuildViewItems,
    currentSort,
    activeTabId,
    activeCategoryId,
    rootPaths,
    folderAliases,
    customOrderRevision,
  ]);

  useCardLayoutFlip({
    cardRefs,
    structuralLayoutRevision,
    isDragging: isDraggingCard,
    currentSort,
  });

  // Post-commit ref synchronization: purely isolated from render phase
  useEffect(() => {
    committedGamesRef.current = visibleGames;
    committedItemsRef.current = viewItems;
    committedSortRef.current = currentSort;
    committedCustomOrderRef.current = resolvedCustomOrder;
    committedCustomOrderPropRef.current = customOrder;
    committedStorageRef.current = storage;
    committedCustomOrderRevisionRef.current = customOrderRevision;
    committedTabIdRef.current = activeTabId;
    committedCategoryIdRef.current = activeCategoryId;
    committedRootPathsRef.current = rootPaths;
    committedFolderAliasesRef.current = folderAliases;
    committedStructuralLayoutRevisionRef.current = structuralLayoutRevision;
    hasCommittedRef.current = true;
  }, [
    visibleGames,
    viewItems,
    currentSort,
    resolvedCustomOrder,
    customOrder,
    storage,
    customOrderRevision,
    activeTabId,
    activeCategoryId,
    rootPaths,
    folderAliases,
    structuralLayoutRevision,
  ]);

  const getCardRefCallback = useCallback((key: string, sectionScope = 'flat') => {
    const scopedKey = `${sectionScope}::${key}`;
    let cb = cardRefCallbacksRef.current.get(scopedKey);
    if (!cb) {
      cb = (el: HTMLDivElement | null) => {
        if (el) cardRefs.current.set(scopedKey, el);
        else cardRefs.current.delete(scopedKey);
      };
      cardRefCallbacksRef.current.set(scopedKey, cb);
      cardRawKeysRef.current.set(scopedKey, key);
    }
    return cb;
  }, []);

  const resolveConnectedCardElement = useCallback(
    (key: string): HTMLElement | null => {
      const candidateKeys = [
        key,
        key.startsWith('game:') ? key.slice(5) : `game:${key}`,
      ];
      for (const candidateKey of candidateKeys) {
        for (const [scopedKey, el] of cardRefs.current.entries()) {
          const rawKey = cardRawKeysRef.current.get(scopedKey) ?? scopedKey;
          if (rawKey === candidateKey && isFocusableCardElement(el)) {
            return el;
          }
        }
      }

      const matchedItem = viewItems.find(
        (item) =>
          item.representativeKey === key ||
          item.groupKey === key ||
          item.games.some((g) => (g.gameKey || g.gameId) === key)
      );
      if (matchedItem) {
        const targetKey = matchedItem.isStack ? matchedItem.groupKey : matchedItem.representativeKey;
        for (const [scopedKey, el] of cardRefs.current.entries()) {
          const rawKey = cardRawKeysRef.current.get(scopedKey) ?? scopedKey;
          if (rawKey === targetKey && isFocusableCardElement(el)) {
            return el;
          }
        }
      }

      return null;
    },
    [viewItems]
  );

  // Prune stale per-key ref callbacks post-commit when viewItems changes
  useEffect(() => {
    const activeKeys = new Set<string>();
    for (const item of viewItems) {
      activeKeys.add(item.isStack ? item.groupKey : item.representativeKey);
    }
    for (const cachedKey of cardRefCallbacksRef.current.keys()) {
      const rawKey = cardRawKeysRef.current.get(cachedKey) ?? cachedKey;
      if (!activeKeys.has(rawKey)) {
        cardRefCallbacksRef.current.delete(cachedKey);
        cardRawKeysRef.current.delete(cachedKey);
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

  const handleCommitFavoriteToggle = useCallback(
    async (
      item: LibraryViewItem,
      targetFavorite: boolean
    ): Promise<'committed' | 'skipped' | 'failed'> => {
      const storeTargetKey = item.isStack
        ? item.groupKey || item.representativeKey
        : item.representativeKey || item.primaryGame.gameKey;
      const ipcTargetKey = item.representativeKey || item.primaryGame.gameKey;
      if (!storeTargetKey || !ipcTargetKey) return 'failed';
      if (item.favorite === targetFavorite) return 'committed';

      const currentGames = store.getSnapshot().allGames;
      const lockKey = resolveFavoriteLockKey(storeTargetKey, currentGames) ?? storeTargetKey;
      if (inFlightRef.current.has(lockKey)) return 'skipped';
      inFlightRef.current.add(lockKey);

      const prevFav = item.favorite;
      dispatch.updateGame(storeTargetKey, { favorite: targetFavorite });
      try {
        if (api?.toggleFavorite) {
          const res = await api.toggleFavorite(ipcTargetKey, targetFavorite);
          if (typeof res === 'boolean' && res !== targetFavorite) {
            console.warn('[LibraryGrid] Backend rejected drag favorite toggle; rolling back:', {
              storeTargetKey: sanitizeUserPaths(storeTargetKey),
              ipcTargetKey: sanitizeUserPaths(ipcTargetKey),
              requested: targetFavorite,
              backendState: res,
            });
            const latestEntry = findGameEntryByKey(store.getSnapshot().allGames, storeTargetKey);
            if (latestEntry && latestEntry.favorite !== res) {
              dispatch.updateGame(storeTargetKey, { favorite: res });
            }
            return 'failed';
          }
        }
        return 'committed';
      } catch (err) {
        console.error('[LibraryGrid] Failed to commit drag favorite toggle:', {
          storeTargetKey: sanitizeUserPaths(storeTargetKey),
          ipcTargetKey: sanitizeUserPaths(ipcTargetKey),
          error: sanitizeUserPaths(err instanceof Error ? err.message : String(err)),
          stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
        });
        dispatch.updateGame(storeTargetKey, { favorite: prevFav });
        return 'failed';
      } finally {
        inFlightRef.current.delete(lockKey);
      }
    },
    [api, dispatch, store, inFlightRef]
  );

  const handleCustomOrderChange = useCallback(
    (nextOrder: readonly string[]) => {
      setCustomOrderRevision((r) => r + 1);
      onCustomOrderChange?.(nextOrder);
    },
    [onCustomOrderChange]
  );

  const handleSetSort = useCallback(
    (sort: string) => {
      dispatch.setCurrentSort(sort);
    },
    [dispatch]
  );

  // Synchronous unmount focus handoff across partition boundaries
  useEffect(() => {
    if (!activeToggledKeyRef.current) return;
    if (document.activeElement?.closest('[role="dialog"]')) return;
    const key = activeToggledKeyRef.current;
    activeToggledKeyRef.current = null;

    const targetEl = resolveConnectedCardElement(key);

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
  }, [viewItems, resolvedGridContainerRef, resolveConnectedCardElement]);

  // Declarative focus restoration for focusTargetKey
  useEffect(() => {
    if (!focusTargetKey) return;
    if (focusTargetKey === '__GRID_CONTAINER__') {
      resolvedGridContainerRef.current?.focus();
      onFocusHandled?.();
      return;
    }
    const targetEl = resolveConnectedCardElement(focusTargetKey);
    if (targetEl) {
      targetEl.focus();
    } else {
      // Resolve adjacent surviving item from rendered viewItems before falling back to container
      const fallbackItem = viewItems[0];
      const fallbackEl = fallbackItem
        ? resolveConnectedCardElement(fallbackItem.isStack ? fallbackItem.groupKey : fallbackItem.representativeKey)
        : null;
      if (fallbackEl) {
        fallbackEl.focus();
      } else {
        resolvedGridContainerRef.current?.focus();
      }
    }
    onFocusHandled?.();
  }, [focusTargetKey, viewItems, onFocusHandled, resolvedGridContainerRef, resolveConnectedCardElement]);

  // Post-commit focus handoff for manually added games
  useEffect(() => {
    if (!pendingFocusKeyRef.current) return;
    const key = pendingFocusKeyRef.current;
    pendingFocusKeyRef.current = null;
    const targetEl = resolveConnectedCardElement(key);
    if (targetEl) {
      targetEl.focus();
    }
  }, [viewItems, resolveConnectedCardElement]);

  const handleRenameFolder = useCallback(
    async (folderPath: string, trimmedValue: string): Promise<{ ok: boolean; error?: string }> => {
      if (!api?.setFolderAlias) {
        return { ok: false, error: 'unavailable' };
      }
      try {
        const res = await api.setFolderAlias(folderPath, trimmedValue);
        if (!res?.ok) {
          console.warn('[LibraryGrid] Failed to rename folder:', {
            folderPath: sanitizeUserPaths(folderPath),
            error: sanitizeUserPaths(res?.error ?? 'unknown'),
          });
          return { ok: false, error: res?.error };
        }
        if (res.config) {
          dispatch.setCurrentLibraryConfig(res.config);
        }
        return { ok: true };
      } catch (err) {
        console.error('[LibraryGrid] Error invoking setFolderAlias:', {
          folderPath: sanitizeUserPaths(folderPath),
          error: sanitizeUserPaths(err instanceof Error ? err.message : String(err)),
          stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
        });
        return { ok: false, error: 'unavailable' };
      }
    },
    [api, dispatch]
  );

  const handleAddManualGame = useCallback(
    async (
      folderPath: string
    ): Promise<{ ok: boolean; game?: GameEntry; canceled?: boolean; error?: string }> => {
      if (!api?.addManualGame) {
        return { ok: false, error: 'unavailable' };
      }
      let res: { ok: boolean; game?: GameEntry; canceled?: boolean; error?: string };
      try {
        res = await api.addManualGame({ folderPath });
      } catch (err) {
        console.error('[LibraryGrid] Error invoking addManualGame:', {
          folderPath: sanitizeUserPaths(folderPath),
          error: sanitizeUserPaths(err instanceof Error ? err.message : String(err)),
          stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
        });
        return { ok: false, error: 'unavailable' };
      }
      if (!res?.ok) {
        if (!res?.canceled) {
          console.warn('[LibraryGrid] Failed to add manual game:', {
            folderPath: sanitizeUserPaths(folderPath),
            error: sanitizeUserPaths(res?.error ?? 'unknown'),
          });
        }
        return res ?? { ok: false, error: 'unknown' };
      }

      let games: GameEntry[] | undefined;
      try {
        games = await api.getGames?.();
      } catch (err) {
        console.warn('[LibraryGrid] Failed to refresh games after manual add; falling back to added entry:', {
          folderPath: sanitizeUserPaths(folderPath),
          hasFallbackGame: Boolean(res.game),
          error: sanitizeUserPaths(err instanceof Error ? err.message : err),
          stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
        });
        games = undefined;
      }
      if (games !== undefined && !Array.isArray(games)) {
        console.warn('[LibraryGrid] Unexpected non-array response from getGames after manual add; falling back to added entry:', {
          folderPath: sanitizeUserPaths(folderPath),
          hasFallbackGame: Boolean(res.game),
        });
      }

      const snapshot = store.getSnapshot();
      const nextGames = Array.isArray(games)
        ? games
        : res.game
          ? [...snapshot.allGames, res.game]
          : null;
      const focusKey = res.game?.gameKey || res.game?.gameId;

      if (nextGames !== null) {
        const annotated = annotateGamesForDisplay(
          nextGames,
          snapshot.currentLibraryConfig ?? '',
          snapshot.locationDisplayMode
        );
        const visibleAfterUpdate = snapshot.activeCategoryId
          ? annotated.filter((g) => g.categoryIds?.includes(snapshot.activeCategoryId!))
          : annotated;
        const willRebuildViewItems = isStructuralChange(committedGamesRef.current, visibleAfterUpdate);
        if (focusKey && willRebuildViewItems) {
          pendingFocusKeyRef.current = focusKey;
        }
        dispatch.setAllGames(annotated);
        if (focusKey && !willRebuildViewItems) {
          pendingFocusKeyRef.current = null;
          resolveConnectedCardElement(focusKey)?.focus();
        }
      } else if (focusKey) {
        resolveConnectedCardElement(focusKey)?.focus();
      }

      return res;
    },
    [api, dispatch, store, resolveConnectedCardElement]
  );

  const renderTitle = useCallback(
    (section: FolderSectionModel) => (
      <FolderTitle
        folderPath={section.path}
        displayName={section.displayName}
        onRenameFolder={handleRenameFolder}
        onShowToast={onShowToast}
      />
    ),
    [handleRenameFolder, onShowToast]
  );

  const renderEmptyFolder = useCallback(
    (section: FolderSectionModel) => (
      <EmptyFolderPrompt
        folderPath={section.path}
        onAddManualGame={handleAddManualGame}
        onShowToast={onShowToast}
      />
    ),
    [handleAddManualGame, onShowToast]
  );

  const handleClearFilter = useCallback(() => {
    resolvedGridContainerRef.current?.focus();
    dispatch.setActiveCategoryId(null);
  }, [dispatch, resolvedGridContainerRef]);

  const handleEmptySetupSuccess = useCallback(() => {
    resolvedGridContainerRef.current?.focus();
  }, [resolvedGridContainerRef]);

  const favorites = useMemo(() => viewItems.filter((item) => item.favorite), [viewItems]);
  const nonFavorites = useMemo(() => viewItems.filter((item) => !item.favorite), [viewItems]);
  const favoritesCount = favorites.length;

  const isFolderViewActive = currentSort === 'folder' && rootPaths.length > 0;

  useEffect(() => {
    if (isFolderViewActive && activeTabId === 'fav' && favoritesCount === 0) {
      setActiveTabId('all');
      writeActiveFolderTab('all', resolvedStorage);
    }
  }, [isFolderViewActive, activeTabId, favoritesCount, resolvedStorage]);

  const baseProjection = useMemo<LibrarySectionsProjection | null>(() => {
    if (!isFolderViewActive) return null;
    return projectLibrarySections({
      items: viewItems,
      currentSort,
      activeTabId: 'all',
      rootPaths,
      folderAliases,
      targetPlatform,
    });
  }, [isFolderViewActive, viewItems, currentSort, rootPaths, folderAliases, targetPlatform]);

  const projection = useMemo<LibrarySectionsProjection | null>(() => {
    if (!baseProjection) return null;
    return selectFolderTabProjection(baseProjection, activeTabId, targetPlatform);
  }, [baseProjection, activeTabId, targetPlatform]);

  const handleTabSelect = useCallback(
    (tabId: string) => {
      setActiveTabId(tabId);
      writeActiveFolderTab(tabId, resolvedStorage);
    },
    [resolvedStorage]
  );

  const handleTabReorder = useCallback(
    async (_oldOrder: readonly string[], newOrder: readonly string[]) => {
      const seq = ++reorderSeqRef.current;
      const nextLibraryPaths = reorderLibraryPathsWithSubsumption(
        [...rootPaths],
        [...newOrder],
        targetPlatform
      );
      const updatedConfig = await api?.updateLibraryConfig?.({ libraryPaths: nextLibraryPaths });
      const latestConfig = store.getSnapshot().currentLibraryConfig;
      if (seq === reorderSeqRef.current) {
        const nextConfig =
          updatedConfig ?? (latestConfig ? { ...latestConfig, libraryPaths: nextLibraryPaths } : null);
        if (nextConfig) {
          dispatch.setCurrentLibraryConfig(nextConfig);
        }
      }
    },
    [rootPaths, targetPlatform, api, store, dispatch]
  );

  const activeCategoryName = useMemo(
    () => (activeCategoryId ? findCategoryNameById(categoryTree, activeCategoryId) : undefined),
    [categoryTree, activeCategoryId]
  );

  const flatFavItemIds = useStableItemIds(favorites, 'fav');
  const flatUnfavItemIds = useStableItemIds(nonFavorites, 'unfav');

  const knownContainerIds = useMemo<readonly string[]>(() => {
    if (isFolderViewActive && projection) {
      const folderPaths = (projection.folderSections ?? []).map((s) => s.path);
      return ['fav', ...folderPaths];
    }
    return ['fav', 'unfav'];
  }, [isFolderViewActive, projection]);

  const renderItem = useCallback(
    (item: LibraryViewItem, sectionScope = 'flat') => {
      const canonicalKey = item.isStack ? item.groupKey : item.representativeKey;
      const scopedId = `${sectionScope}::${canonicalKey}`;
      return (
        <SortableGameCard
          key={canonicalKey}
          ref={getCardRefCallback(canonicalKey, sectionScope)}
          id={scopedId}
          item={item}
          CardComponent={CardComponent}
          StackComponent={StackComponent}
          onToggleFavoriteGame={handleToggleFavoriteGame}
          onToggleFavoriteStack={handleToggleFavoriteStack}
          onLaunch={onLaunch}
          onOpenStack={onOpenStack}
          onOpenSaveEditor={onOpenSaveEditor}
          onMenuAction={onMenuAction}
        />
      );
    },
    [
      getCardRefCallback,
      CardComponent,
      StackComponent,
      handleToggleFavoriteGame,
      handleToggleFavoriteStack,
      onLaunch,
      onOpenStack,
      onOpenSaveEditor,
      onMenuAction,
    ]
  );

  return (
    <div
      ref={resolvedGridContainerRef}
      className="library-grid"
      data-testid="library-grid"
      tabIndex={-1}
    >
      {isFolderViewActive && projection ? (
        <>
          <ShelfTabs
            sections={projection.allFolderSections ?? []}
            activeTabId={activeTabId}
            effectiveTabId={projection.effectiveTabId}
            favoritesCount={favoritesCount}
            targetPlatform={targetPlatform}
            onTabSelect={handleTabSelect}
            onTabReorder={handleTabReorder}
            onShowToast={onShowToast}
          />
          <GameDndContext
            currentSort={currentSort}
            viewItems={viewItems}
            favorites={favorites}
            resolvedCustomOrder={resolvedCustomOrder}
            knownContainerIds={knownContainerIds}
            storage={resolvedStorage}
            targetPlatform={targetPlatform}
            onDragStateChange={setIsDraggingCard}
            onCommitFavoriteToggle={handleCommitFavoriteToggle}
            onCustomOrderChange={handleCustomOrderChange}
            onSetSort={handleSetSort}
            onShowToast={onShowToast}
            CardComponent={CardComponent}
            StackComponent={StackComponent}
          >
            {({ renderSectionContainer }) => (
              <FolderAccordion
                projection={projection}
                storage={resolvedStorage}
                isFiltered={Boolean(activeCategoryId)}
                isDragActive={isDraggingCard}
                renderItem={renderItem}
                renderTitle={renderTitle}
                renderEmptyFolder={renderEmptyFolder}
                renderSectionContainer={renderSectionContainer}
              />
            )}
          </GameDndContext>
        </>
      ) : allGames.length === 0 ? (
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
        <GameDndContext
          currentSort={currentSort}
          viewItems={viewItems}
          favorites={favorites}
          resolvedCustomOrder={resolvedCustomOrder}
          knownContainerIds={knownContainerIds}
          storage={resolvedStorage}
          targetPlatform={targetPlatform}
          onDragStateChange={setIsDraggingCard}
          onCommitFavoriteToggle={handleCommitFavoriteToggle}
          onCustomOrderChange={handleCustomOrderChange}
          onSetSort={handleSetSort}
          onShowToast={onShowToast}
          CardComponent={CardComponent}
          StackComponent={StackComponent}
        >
          {({ renderSectionContainer }) => (
            <div id="game-grid-wrapper">
              {renderSectionContainer('fav', flatFavItemIds, (droppableRef, isOver) => (
                <div
                  ref={droppableRef}
                  id="fav-grid"
                  className={`game-grid grid-section drop-zone${isOver ? ' drag-over' : ''}`}
                >
                  {favorites.map((item) => renderItem(item, 'fav'))}
                </div>
              ))}
              {favorites.length > 0 && nonFavorites.length > 0 && (
                <div id="favorites-separator" className="favorites-separator-container">
                  <div className="favorites-separator" />
                </div>
              )}
              {renderSectionContainer('unfav', flatUnfavItemIds, (droppableRef, isOver) => (
                <div
                  ref={droppableRef}
                  id="unfav-grid"
                  className={`game-grid grid-section drop-zone${isOver ? ' drag-over' : ''}`}
                >
                  {nonFavorites.map((item) => renderItem(item, 'unfav'))}
                </div>
              ))}
            </div>
          )}
        </GameDndContext>
      )}
    </div>
  );
}
