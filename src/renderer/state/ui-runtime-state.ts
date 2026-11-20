import { GameEntry, LibraryConfig } from '../types/game';
import { CategoryNode } from '../domain/category-tree';
import { sanitizeUserPaths } from '../../shared/path-sanitizer';

export interface UiStorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SearchableGameItem {
  readonly gameKey: string;
  readonly name: string;
  readonly iconUrl?: string;
}

export interface UiRuntimeSnapshot {
  readonly allGames: readonly GameEntry[];
  readonly categoryTree: readonly CategoryNode[];
  readonly activeCategoryId: string | null;
  readonly currentSort: string;
  readonly currentLibraryConfig: LibraryConfig | null;
  readonly locationDisplayMode: 'parent' | 'full';
}

export interface ObservableUiRuntimeStore {
  subscribe(listener: () => void): () => void;
  getSnapshot(): UiRuntimeSnapshot;
  setAllGames(games: GameEntry[]): void;
  updateGame(gameKey: string, patch: Partial<GameEntry>): void;
  setGameRunning(gameKey: string, isRunning: boolean): void;
  updateGamePlaytime(gameKey: string, accruedMs: number): void;
  setCategoryTree(tree: CategoryNode[]): void;
  setActiveCategoryId(id: string | null): void;
  setCurrentSort(sort: string): void;
  setCurrentLibraryConfig(config: LibraryConfig | null): void;
  setLocationDisplayMode(mode: 'parent' | 'full'): void;
}

export const CANONICAL_SORT_OPTIONS = new Set(['az', 'date', 'played', 'custom']);

export function selectSearchableGames(snapshot: UiRuntimeSnapshot): readonly SearchableGameItem[] {
  return snapshot.allGames.map((g) => ({
    gameKey: g.primaryInstance?.gameKey || g.gameKey,
    name: g.name,
    iconUrl: g.iconUrl,
  }));
}

function createInMemoryStorage(): UiStorageAdapter {
  const store = new Map<string, string>();
  return {
    getItem(key: string): string | null {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string): void {
      store.set(key, value);
    },
    removeItem(key: string): void {
      store.delete(key);
    },
  };
}

function collectCategoryIds(tree: readonly CategoryNode[], validIds: Set<string>, depth = 0): void {
  if (depth > 32 || !Array.isArray(tree)) return;
  for (const node of tree) {
    if (!node || typeof node.id !== 'string' || !node.id || validIds.has(node.id)) {
      continue;
    }
    validIds.add(node.id);
    if (Array.isArray(node.children) && node.children.length > 0) {
      collectCategoryIds(node.children, validIds, depth + 1);
    }
  }
}

export function createUiRuntimeState(
  storage?: UiStorageAdapter
): ObservableUiRuntimeStore {
  const resolvedStorage: UiStorageAdapter =
    storage ?? (typeof localStorage !== 'undefined' ? localStorage : createInMemoryStorage());

  const listeners = new Set<() => void>();
  const allGamesIndexMap = new Map<string, number>();

  let allGames: GameEntry[] = [];
  let categoryTree: CategoryNode[] = [];

  const rawActiveCat = resolvedStorage.getItem('yumeshelf_active_category_id')?.trim();
  let activeCategoryId: string | null = rawActiveCat ? rawActiveCat : null;

  const rawSort = resolvedStorage.getItem('yumeshelf_sort_pref') ?? 'date';
  let currentSort: string = CANONICAL_SORT_OPTIONS.has(rawSort) ? rawSort : 'date';

  let currentLibraryConfig: LibraryConfig | null = null;

  const rawLocationMode = resolvedStorage.getItem('yumeshelf_location_display_mode');
  let locationDisplayMode: 'parent' | 'full' = rawLocationMode === 'full' ? 'full' : 'parent';

  function buildSnapshot(): UiRuntimeSnapshot {
    return {
      allGames,
      categoryTree,
      activeCategoryId,
      currentSort,
      currentLibraryConfig,
      locationDisplayMode,
    };
  }

  let currentSnapshot: UiRuntimeSnapshot = buildSnapshot();

  console.debug('[createUiRuntimeState] Initialized store with listener set and storage adapter');

  function invalidateSnapshot(): void {
    currentSnapshot = buildSnapshot();
    for (const listener of listeners) {
      listener();
    }
  }

  function setIndexKey(key: unknown, idx: number): void {
    if (typeof key === 'string' && key.length > 0) {
      allGamesIndexMap.set(key, idx);
    }
  }

  function rebuildAllGamesIndexMap(games: readonly GameEntry[]): void {
    allGamesIndexMap.clear();
    for (let idx = 0; idx < games.length; idx++) {
      const game = games[idx];
      setIndexKey(game.gameKey, idx);
      setIndexKey(game.gameId, idx);
      setIndexKey(game.instanceId, idx);
      if (typeof game.gameKey === 'string' && game.gameKey.length > 0) {
        allGamesIndexMap.set('game:' + game.gameKey, idx);
      }
      if (typeof game.gameId === 'string' && game.gameId.length > 0) {
        allGamesIndexMap.set('game:' + game.gameId, idx);
      }
      if (Array.isArray(game.instances)) {
        for (const inst of game.instances) {
          setIndexKey(inst.gameKey, idx);
          setIndexKey(inst.gameId, idx);
          setIndexKey(inst.instanceId, idx);
        }
      }
    }
  }

  function findRunningStateForEntry(
    entry: GameEntry,
    runningMap: Map<string, number | undefined>
  ): { matched: boolean; basePlaytime: number | undefined } {
    const keys = [entry.gameKey, entry.instanceId, entry.gameId];
    for (const k of keys) {
      if (typeof k === 'string' && k.length > 0 && runningMap.has(k)) {
        return { matched: true, basePlaytime: runningMap.get(k) };
      }
    }
    return { matched: false, basePlaytime: undefined };
  }

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    getSnapshot(): UiRuntimeSnapshot {
      return currentSnapshot;
    },

    setAllGames(games: GameEntry[]): void {
      const runningMap = new Map<string, number | undefined>();
      for (const existing of allGames) {
        if (Array.isArray(existing.instances) && existing.instances.length > 0) {
          for (const inst of existing.instances) {
            if (inst.isRunning) {
              if (inst.gameKey) runningMap.set(inst.gameKey, inst.basePlaytime);
              if (inst.instanceId) runningMap.set(inst.instanceId, inst.basePlaytime);
              if (inst.gameId && existing.instances.length === 1) {
                runningMap.set(inst.gameId, inst.basePlaytime);
              }
            }
          }
        } else if (existing.isRunning) {
          if (existing.gameKey) runningMap.set(existing.gameKey, existing.basePlaytime);
          if (existing.instanceId) runningMap.set(existing.instanceId, existing.basePlaytime);
          if (existing.gameId) runningMap.set(existing.gameId, existing.basePlaytime);
        }
      }

      const incoming = Array.isArray(games) ? games : [];
      if (runningMap.size === 0) {
        allGames = incoming.slice();
      } else {
        allGames = incoming.map((game) => {
          if (Array.isArray(game.instances) && game.instances.length > 0) {
            let anyInstanceMatched = false;
            const isSingleInstance = game.instances.length === 1;
            const nextInstances = game.instances.map((inst) => {
              const instMatch = findRunningStateForEntry(inst, runningMap);
              const singleTopMatch =
                !instMatch.matched && isSingleInstance
                  ? findRunningStateForEntry(game, runningMap)
                  : { matched: false, basePlaytime: undefined };
              if (instMatch.matched || singleTopMatch.matched) {
                anyInstanceMatched = true;
                const bp = instMatch.matched ? instMatch.basePlaytime : singleTopMatch.basePlaytime;
                return {
                  ...inst,
                  isRunning: true,
                  ...(bp !== undefined ? { basePlaytime: bp } : {}),
                };
              }
              return inst;
            });

            if (!anyInstanceMatched) {
              return game;
            }

            const nextPrimaryInstance = game.primaryInstance
              ? (() => {
                  const pm = findRunningStateForEntry(game.primaryInstance, runningMap);
                  const singleTopMatch =
                    !pm.matched && isSingleInstance
                      ? findRunningStateForEntry(game, runningMap)
                      : { matched: false, basePlaytime: undefined };
                  if (pm.matched || singleTopMatch.matched) {
                    const bp = pm.matched ? pm.basePlaytime : singleTopMatch.basePlaytime;
                    return {
                      ...game.primaryInstance,
                      isRunning: true,
                      ...(bp !== undefined ? { basePlaytime: bp } : {}),
                    };
                  }
                  return game.primaryInstance;
                })()
              : game.primaryInstance;

            const aggregateRunning = nextInstances.some((i) => Boolean(i.isRunning));
            const singleBp = isSingleInstance ? nextInstances[0].basePlaytime : undefined;

            return {
              ...game,
              instances: nextInstances,
              primaryInstance: nextPrimaryInstance,
              isRunning: aggregateRunning,
              ...(singleBp !== undefined ? { basePlaytime: singleBp } : {}),
            };
          }

          const topMatch = findRunningStateForEntry(game, runningMap);
          if (!topMatch.matched) {
            return game;
          }
          return {
            ...game,
            isRunning: true,
            ...(topMatch.basePlaytime !== undefined ? { basePlaytime: topMatch.basePlaytime } : {}),
          };
        });
      }

      rebuildAllGamesIndexMap(allGames);
      invalidateSnapshot();
    },

    updateGame(gameKey: string, patch: Partial<GameEntry>): void {
      if (!gameKey || typeof gameKey !== 'string' || !patch || typeof patch !== 'object') {
        return;
      }

      const idx = allGamesIndexMap.get(gameKey);
      if (idx === undefined) return;
      const game = allGames[idx];
      if (!game) return;

      const isDomainGroupProperty = 'favorite' in patch;
      const isGroupWideMetadata = 'name' in patch || 'title' in patch;
      const isMultiInstance = Array.isArray(game.instances) && game.instances.length > 1;

      const matchesTopLevel =
        (!isMultiInstance && Boolean(game.gameKey) && game.gameKey === gameKey) ||
        (Boolean(game.gameId) && game.gameId === gameKey) ||
        (Boolean(game.gameKey) && 'game:' + game.gameKey === gameKey) ||
        (Boolean(game.gameId) && 'game:' + game.gameId === gameKey);

      const matchesInstance =
        Array.isArray(game.instances) &&
        game.instances.some(
          (inst) => inst.gameKey === gameKey || inst.gameId === gameKey || inst.instanceId === gameKey
        );

      if (!matchesTopLevel && !matchesInstance) {
        return;
      }

      const applyToAllInstances = isDomainGroupProperty || (matchesTopLevel && isGroupWideMetadata);

      const nextInstances = Array.isArray(game.instances)
        ? game.instances.map((inst) =>
            applyToAllInstances ||
            inst.gameKey === gameKey ||
            inst.gameId === gameKey ||
            inst.instanceId === gameKey
              ? { ...inst, ...patch }
              : inst
          )
        : game.instances;

      const nextPrimaryInstance = game.primaryInstance
        ? applyToAllInstances ||
          (matchesTopLevel && !game.primaryInstance.gameKey) ||
          game.primaryInstance.gameKey === gameKey ||
          game.primaryInstance.gameId === gameKey ||
          game.primaryInstance.instanceId === gameKey
          ? { ...game.primaryInstance, ...patch }
          : game.primaryInstance
        : game.primaryInstance;

      const nextTopLevel =
        matchesTopLevel || isDomainGroupProperty
          ? { ...game, ...patch }
          : {
              ...game,
              ...(Array.isArray(nextInstances)
                ? {
                    favorite: nextInstances.some((i) => Boolean(i.favorite)),
                    playtime: nextInstances.reduce((sum, i) => sum + (i.playtime || 0), 0),
                    isRunning: nextInstances.some((i) => Boolean(i.isRunning)),
                    ...(nextPrimaryInstance &&
                    (nextPrimaryInstance.gameKey === gameKey ||
                      nextPrimaryInstance.instanceId === gameKey)
                      ? {
                          name: nextPrimaryInstance.name ?? game.name,
                          title: nextPrimaryInstance.title ?? game.title,
                          iconUrl: nextPrimaryInstance.iconUrl ?? game.iconUrl,
                        }
                      : {}),
                  }
                : {}),
            };

      const updatedGame: GameEntry = {
        ...nextTopLevel,
        instances: nextInstances,
        primaryInstance: nextPrimaryInstance,
      };

      const nextGames = allGames.slice();
      nextGames[idx] = updatedGame;
      allGames = nextGames;

      invalidateSnapshot();
    },

    setGameRunning(gameKey: string, isRunning: boolean): void {
      if (!gameKey || typeof gameKey !== 'string') return;

      const idx = allGamesIndexMap.get(gameKey);
      if (idx === undefined) return;
      const game = allGames[idx];
      if (!game) return;

      const isMultiInstance = Array.isArray(game.instances) && game.instances.length > 1;
      const matchesTopLevel =
        !isMultiInstance &&
        ((Boolean(game.gameKey) && game.gameKey === gameKey) ||
          (Boolean(game.gameId) && game.gameId === gameKey) ||
          (Boolean(game.gameKey) && 'game:' + game.gameKey === gameKey) ||
          (Boolean(game.gameId) && 'game:' + game.gameId === gameKey));

      const matchesInstance =
        Array.isArray(game.instances) &&
        game.instances.some((inst) => inst.gameKey === gameKey || inst.instanceId === gameKey);

      if (!matchesTopLevel && !matchesInstance) {
        return;
      }

      const patch = {
        isRunning,
        ...(isRunning ? {} : { basePlaytime: undefined }),
      };

      const nextInstances = Array.isArray(game.instances)
        ? game.instances.map((inst) =>
            (!isMultiInstance && matchesTopLevel) ||
            inst.gameKey === gameKey ||
            inst.instanceId === gameKey
              ? { ...inst, ...patch }
              : inst
          )
        : game.instances;

      const nextPrimaryInstance = game.primaryInstance
        ? isMultiInstance
          ? nextInstances?.find((inst) =>
              game.primaryInstance
                ? inst.gameKey === game.primaryInstance.gameKey ||
                  (Boolean(game.primaryInstance.instanceId) &&
                    inst.instanceId === game.primaryInstance.instanceId)
                : false
            ) ?? game.primaryInstance
          : matchesTopLevel ||
              game.primaryInstance.gameKey === gameKey ||
              game.primaryInstance.instanceId === gameKey
            ? { ...game.primaryInstance, ...patch }
            : game.primaryInstance
        : game.primaryInstance;

      const anyChildRunning =
        Array.isArray(nextInstances) && nextInstances.some((i) => Boolean(i.isRunning));
      const aggregateRunning = isMultiInstance ? anyChildRunning : isRunning;

      const nextTopLevel = {
        ...game,
        ...(matchesTopLevel ? patch : {}),
        ...(Array.isArray(nextInstances) ? { isRunning: aggregateRunning } : {}),
        ...(aggregateRunning ? {} : { basePlaytime: undefined }),
      };

      const updatedGame: GameEntry = {
        ...nextTopLevel,
        instances: nextInstances,
        primaryInstance: nextPrimaryInstance,
      };

      const nextGames = allGames.slice();
      nextGames[idx] = updatedGame;
      allGames = nextGames;
      invalidateSnapshot();
    },

    updateGamePlaytime(gameKey: string, accruedMs: number): void {
      if (!gameKey || typeof gameKey !== 'string') return;
      if (!Number.isFinite(accruedMs) || accruedMs < 0) return;
      const validAccruedMs = Math.max(0, accruedMs);

      const idx = allGamesIndexMap.get(gameKey);
      if (idx === undefined) return;
      const game = allGames[idx];
      if (!game) return;

      const hasInstances = Array.isArray(game.instances) && game.instances.length > 0;
      let updatedGame: GameEntry;

      if (hasInstances) {
        const instances = game.instances!;
        const isMultiInstance = instances.length > 1;
        let targetIndex = -1;

        if (!isMultiInstance) {
          targetIndex = instances.findIndex(
            (inst) => inst.gameKey === gameKey || inst.gameId === gameKey || inst.instanceId === gameKey
          );
          if (
            targetIndex === -1 &&
            ((Boolean(game.gameKey) && game.gameKey === gameKey) ||
              (Boolean(game.gameId) && game.gameId === gameKey) ||
              (Boolean(game.instanceId) && game.instanceId === gameKey) ||
              (Boolean(game.gameKey) && 'game:' + game.gameKey === gameKey) ||
              (Boolean(game.gameId) && 'game:' + game.gameId === gameKey))
          ) {
            targetIndex = 0;
          }
        } else {
          targetIndex = instances.findIndex(
            (inst) => inst.gameKey === gameKey || inst.instanceId === gameKey
          );
          if (
            targetIndex === -1 &&
            ((Boolean(game.gameId) && game.gameId === gameKey) ||
              (Boolean(game.gameKey) && game.gameKey === gameKey) ||
              (Boolean(game.gameKey) && 'game:' + game.gameKey === gameKey) ||
              (Boolean(game.gameId) && 'game:' + game.gameId === gameKey))
          ) {
            const targetPrimaryInstKey = game.primaryInstance?.gameKey ?? instances[0]?.gameKey;
            if (targetPrimaryInstKey) {
              targetIndex = instances.findIndex((inst) => inst.gameKey === targetPrimaryInstKey);
            }
          }
        }

        if (targetIndex === -1) {
          return;
        }

        const matchingRecord = instances[targetIndex];
        const base = matchingRecord.basePlaytime ?? matchingRecord.playtime ?? 0;
        const updatedPlaytime = base + validAccruedMs;

        const nextInstances = instances.map((inst, i) =>
          i === targetIndex
            ? {
                ...inst,
                basePlaytime: base,
                playtime: updatedPlaytime,
                isRunning: true,
              }
            : inst
        );

        const primaryMatches =
          game.primaryInstance !== undefined &&
          (game.primaryInstance === matchingRecord ||
            (Boolean(matchingRecord.gameKey) &&
              game.primaryInstance.gameKey === matchingRecord.gameKey) ||
            (Boolean(matchingRecord.instanceId) &&
              game.primaryInstance.instanceId === matchingRecord.instanceId));

        const nextPrimaryInstance = game.primaryInstance
          ? primaryMatches
            ? {
                ...game.primaryInstance,
                basePlaytime: base,
                playtime: updatedPlaytime,
                isRunning: true,
              }
            : game.primaryInstance
          : game.primaryInstance;

        const aggregatePlaytime = nextInstances.reduce((sum, inst) => sum + (inst.playtime || 0), 0);
        const aggregateBasePlaytime =
          nextInstances.length === 1
            ? base
            : nextInstances.reduce((sum, inst) => sum + (inst.basePlaytime ?? inst.playtime ?? 0), 0);
        const aggregateIsRunning = nextInstances.some((inst) => Boolean(inst.isRunning));

        updatedGame = {
          ...game,
          instances: nextInstances,
          primaryInstance: nextPrimaryInstance,
          basePlaytime: aggregateBasePlaytime,
          playtime: aggregatePlaytime,
          isRunning: aggregateIsRunning,
        };
      } else {
        const matchesTopLevel =
          (Boolean(game.gameKey) && game.gameKey === gameKey) ||
          (Boolean(game.gameId) && game.gameId === gameKey) ||
          (Boolean(game.instanceId) && game.instanceId === gameKey) ||
          (Boolean(game.gameKey) && 'game:' + game.gameKey === gameKey) ||
          (Boolean(game.gameId) && 'game:' + game.gameId === gameKey);

        if (!matchesTopLevel) {
          return;
        }

        const base = game.basePlaytime ?? game.playtime ?? 0;
        const updatedPlaytime = base + validAccruedMs;

        updatedGame = {
          ...game,
          basePlaytime: base,
          playtime: updatedPlaytime,
          isRunning: true,
        };
      }

      const nextGames = allGames.slice();
      nextGames[idx] = updatedGame;
      allGames = nextGames;
      invalidateSnapshot();
    },

    setCategoryTree(tree: CategoryNode[]): void {
      const nextTree = Array.isArray(tree) ? tree : [];
      const validIds = new Set<string>();
      collectCategoryIds(nextTree, validIds);

      if (activeCategoryId !== null && !validIds.has(activeCategoryId)) {
        activeCategoryId = null;
        try {
          resolvedStorage.removeItem('yumeshelf_active_category_id');
        } catch (err) {
          console.warn('[ObservableUiRuntimeStore] Failed to remove activeCategoryId from storage:', {
            error: sanitizeUserPaths(err instanceof Error ? err.message : String(err)),
          });
        }
      }

      categoryTree = nextTree;
      invalidateSnapshot();
    },

    setActiveCategoryId(id: string | null): void {
      activeCategoryId = id;
      try {
        if (id !== null) {
          resolvedStorage.setItem('yumeshelf_active_category_id', id);
        } else {
          resolvedStorage.removeItem('yumeshelf_active_category_id');
        }
      } catch (err) {
        console.warn('[ObservableUiRuntimeStore] Failed to persist activeCategoryId to storage:', {
          error: sanitizeUserPaths(err instanceof Error ? err.message : String(err)),
        });
      }
      invalidateSnapshot();
    },

    setCurrentSort(sort: string): void {
      currentSort = sort;
      try {
        resolvedStorage.setItem('yumeshelf_sort_pref', sort);
      } catch (err) {
        console.warn('[ObservableUiRuntimeStore] Failed to persist currentSort to storage:', {
          error: sanitizeUserPaths(err instanceof Error ? err.message : String(err)),
        });
      }
      invalidateSnapshot();
    },

    setCurrentLibraryConfig(config: LibraryConfig | null): void {
      currentLibraryConfig = config;
      invalidateSnapshot();
    },

    setLocationDisplayMode(mode: 'parent' | 'full'): void {
      locationDisplayMode = mode === 'full' ? 'full' : 'parent';
      try {
        resolvedStorage.setItem('yumeshelf_location_display_mode', locationDisplayMode);
      } catch (err) {
        console.warn('[ObservableUiRuntimeStore] Failed to persist locationDisplayMode to storage:', {
          error: sanitizeUserPaths(err instanceof Error ? err.message : String(err)),
        });
      }
      invalidateSnapshot();
    },
  };
}
