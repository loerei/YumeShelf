import React, { createContext, useMemo } from 'react';
import {
  createUiRuntimeState,
  type ObservableUiRuntimeStore,
} from '../state/ui-runtime-state';
import type { CategoryNode } from '../domain/category-tree';
import type { GameEntry, LibraryConfig } from '../types/game';

export interface LibraryActionDispatchers {
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

export const LibraryStoreContext = createContext<ObservableUiRuntimeStore | null>(null);
export const LibraryDispatchContext = createContext<LibraryActionDispatchers | null>(null);

function bindDispatchers(store: ObservableUiRuntimeStore): LibraryActionDispatchers {
  return {
    setAllGames: (games) => store.setAllGames(games),
    updateGame: (gameKey, patch) => store.updateGame(gameKey, patch),
    setGameRunning: (gameKey, isRunning) => store.setGameRunning(gameKey, isRunning),
    updateGamePlaytime: (gameKey, accruedMs) => store.updateGamePlaytime(gameKey, accruedMs),
    setCategoryTree: (tree) => store.setCategoryTree(tree),
    setActiveCategoryId: (id) => store.setActiveCategoryId(id),
    setCurrentSort: (sort) => store.setCurrentSort(sort),
    setCurrentLibraryConfig: (config) => store.setCurrentLibraryConfig(config),
    setLocationDisplayMode: (mode) => store.setLocationDisplayMode(mode),
  };
}

export interface LibraryStateProviderProps {
  store?: ObservableUiRuntimeStore;
  children: React.ReactNode;
}

export function LibraryStateProvider({ store, children }: LibraryStateProviderProps): React.JSX.Element {
  const resolvedStore = useMemo(() => store ?? createUiRuntimeState(), [store]);
  const dispatchers = useMemo(() => bindDispatchers(resolvedStore), [resolvedStore]);

  return (
    <LibraryStoreContext.Provider value={resolvedStore}>
      <LibraryDispatchContext.Provider value={dispatchers}>
        {children}
      </LibraryDispatchContext.Provider>
    </LibraryStoreContext.Provider>
  );
}
