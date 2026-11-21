import { useContext, useMemo } from 'react';
import { useSyncExternalStoreWithSelector } from 'use-sync-external-store/with-selector';
import {
  selectSearchableGames,
  type ObservableUiRuntimeStore,
  type UiRuntimeSnapshot,
  type SearchableGameItem,
} from '../state/ui-runtime-state';
import type { CategoryNode } from '../domain/category-tree';
import type { GameEntry } from '../types/game';
import {
  LibraryStoreContext,
  LibraryDispatchContext,
  type LibraryActionDispatchers,
} from '../context/LibraryStateContext';

export { selectSearchableGames };
export type { LibraryActionDispatchers };

export function useLibraryStore(): ObservableUiRuntimeStore {
  const store = useContext(LibraryStoreContext);
  if (!store) throw new Error('useLibraryStore must be used within LibraryStateProvider');
  return store;
}

export function useLibrarySelector<T>(
  selector: (snapshot: UiRuntimeSnapshot) => T,
  isEqual: (a: T, b: T) => boolean = Object.is
): T {
  const store = useLibraryStore();
  return useSyncExternalStoreWithSelector(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
    selector,
    isEqual
  );
}

export function useActiveCategoryId(): string | null {
  return useLibrarySelector((s) => s.activeCategoryId);
}

export function useCurrentSort(): string {
  return useLibrarySelector((s) => s.currentSort);
}

export function useCategoryTree(): readonly CategoryNode[] {
  return useLibrarySelector((s) => s.categoryTree);
}

export function useAllGames(): readonly GameEntry[] {
  return useLibrarySelector((s) => s.allGames);
}

export function areSearchableGamesEqual(
  prev: readonly SearchableGameItem[],
  next: readonly SearchableGameItem[]
): boolean {
  if (Object.is(prev, next)) return true;
  if (!prev || !next || prev.length !== next.length) return false;
  for (let i = 0; i < prev.length; i++) {
    const p = prev[i];
    const n = next[i];
    if (
      p.gameKey !== n.gameKey ||
      p.name !== n.name ||
      p.iconUrl !== n.iconUrl ||
      p.iconData !== n.iconData ||
      p.iconFit !== n.iconFit ||
      p.iconSource !== n.iconSource ||
      p.exePath !== n.exePath ||
      p.folderName !== n.folderName ||
      p.relativePath !== n.relativePath ||
      p.relativePathDisplay !== n.relativePathDisplay ||
      p.relativePathFullDisplay !== n.relativePathFullDisplay ||
      p.engine !== n.engine ||
      p.sizeBytes !== n.sizeBytes
    ) {
      return false;
    }
  }
  return true;
}

export function useSearchableGames(): readonly SearchableGameItem[] {
  return useLibrarySelector(selectSearchableGames, areSearchableGamesEqual);
}

export function useLocationDisplayMode(): 'parent' | 'full' {
  return useLibrarySelector((s) => s.locationDisplayMode);
}

export function useLibraryDispatch(): LibraryActionDispatchers {
  const dispatch = useContext(LibraryDispatchContext);
  if (!dispatch) throw new Error('useLibraryDispatch must be used within LibraryStateProvider');
  return dispatch;
}

export type LibraryStateContextValue = UiRuntimeSnapshot & LibraryActionDispatchers;

/**
 * Transitional Phase 1 hook aggregating the full snapshot and dispatchers.
 * Prefer granular selector hooks and useLibraryDispatch in new components.
 */
export function useLibraryState(): LibraryStateContextValue {
  const snapshot = useLibrarySelector((s) => s);
  const dispatchers = useLibraryDispatch();
  return useMemo(() => ({ ...snapshot, ...dispatchers }), [snapshot, dispatchers]);
}
