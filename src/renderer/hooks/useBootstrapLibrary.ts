import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { sanitizeUserPaths } from '../../shared/path-sanitizer';
import type { ElectronAPI } from '../../shared/types/ipc';
import { LibraryStoreContext } from '../context/LibraryStateContext';
import type { CategoryNode } from '../domain/category-tree';
import { annotateGamesForDisplay } from '../game-annotations';
import {
  migrateStoredCustomOrderAliases,
  readStoredCustomOrder,
  writeCustomOrder,
} from '../library-order';
import type { ObservableUiRuntimeStore, UiStorageAdapter } from '../state/ui-runtime-state';
import type { GameEntry, LibraryConfig } from '../types/game';
import { applyTheme } from '../utils/theme';

export interface AppBootstrapResult {
  readonly config: LibraryConfig | null;
  readonly games: readonly GameEntry[];
  readonly categoryTree: readonly CategoryNode[];
  readonly postUpdateNotice?: {
    readonly version?: string;
    readonly fromVersion?: string;
    readonly installed?: boolean;
  } | null;
  readonly deferredAppUpdateInstall?: {
    readonly pending: boolean;
    readonly update?: unknown;
    readonly statusText?: string;
  } | null;
}

export type BootstrapState =
  | { readonly status: 'loading' }
  | { readonly status: 'installing-update'; readonly update?: unknown; readonly statusText?: string }
  | {
      readonly status: 'success';
      readonly data: AppBootstrapResult;
      readonly refresh: () => Promise<void>;
      readonly isRefreshing: boolean;
    }
  | { readonly status: 'error'; readonly error: Error; readonly retry: () => void };

type InternalBootstrapState =
  | { readonly status: 'loading' }
  | { readonly status: 'installing-update'; readonly update?: unknown; readonly statusText?: string }
  | { readonly status: 'success'; readonly data: AppBootstrapResult }
  | { readonly status: 'error'; readonly error: Error; readonly retry: () => void };

function hasBootstrapMethods(api: ElectronAPI | undefined): api is ElectronAPI {
  if (!api) return false;
  if (typeof api.bootstrapApp === 'function') return true;
  return (
    typeof api.checkConfig === 'function' &&
    typeof api.getGames === 'function' &&
    typeof api.getCategoryTree === 'function'
  );
}

export function useBootstrapLibrary(
  store?: ObservableUiRuntimeStore,
  electronAPI?: ElectronAPI,
  storage?: UiStorageAdapter,
  onRefreshError?: (error: Error) => void
): BootstrapState {
  const contextStore = useContext(LibraryStoreContext);
  const resolvedStore = store ?? contextStore;
  const api = electronAPI ?? (typeof window !== 'undefined' ? window.electronAPI : undefined);

  const themeAppliedRef = useRef(false);
  if (!themeAppliedRef.current) {
    themeAppliedRef.current = true;
    applyTheme(undefined, storage);
  }

  const [bootstrapState, setBootstrapState] = useState<InternalBootstrapState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const isRefreshingRef = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const retry = useCallback(() => {
    setBootstrapState({ status: 'loading' });
    setAttempt((prev) => prev + 1);
  }, []);

  const refresh = useCallback(async () => {
    if (isRefreshingRef.current || !api || !resolvedStore) return;
    isRefreshingRef.current = true;
    setIsRefreshing(true);
    try {
      const [games, tree, config] = await Promise.all([
        api.getGames(),
        api.getCategoryTree(),
        api.checkConfig(),
      ]);
      if (!isMountedRef.current) return;

      const { locationDisplayMode } = resolvedStore.getSnapshot();
      const rawGames = Array.isArray(games) ? (games as GameEntry[]) : [];
      const rawTree = Array.isArray(tree) ? (tree as CategoryNode[]) : [];
      const resolvedConfig = (config ?? null) as LibraryConfig | null;

      const annotatedGames = annotateGamesForDisplay(rawGames, resolvedConfig ?? '', locationDisplayMode);
      resolvedStore.setCurrentLibraryConfig(resolvedConfig);
      resolvedStore.setCategoryTree(rawTree);
      resolvedStore.setAllGames(annotatedGames);
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      console.error('[useBootstrapLibrary] Refresh failed:', {
        error: sanitizeUserPaths(err instanceof Error ? err.message : String(err)),
        stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
      });
      onRefreshError?.(err instanceof Error ? err : new Error(String(err)));
    } finally {
      isRefreshingRef.current = false;
      if (isMountedRef.current) {
        setIsRefreshing(false);
      }
    }
  }, [api, resolvedStore, onRefreshError]);

  useEffect(() => {
    let isCancelled = false;

    const runBootstrap = async () => {
      if (!hasBootstrapMethods(api)) {
        setBootstrapState({
          status: 'error',
          error: new Error('Electron API is unavailable in current environment'),
          retry,
        });
        return;
      }

      if (!resolvedStore) {
        setBootstrapState({
          status: 'error',
          error: new Error('Library store is unavailable in current environment'),
          retry,
        });
        return;
      }

      try {
        let result: AppBootstrapResult;
        if (typeof api.bootstrapApp === 'function') {
          result = (await api.bootstrapApp({})) as AppBootstrapResult;
        } else {
          const [config, games, categoryTree] = await Promise.all([
            api.checkConfig(),
            api.getGames(),
            api.getCategoryTree(),
          ]);
          result = {
            config: (config ?? null) as LibraryConfig | null,
            games: Array.isArray(games) ? (games as GameEntry[]) : [],
            categoryTree: Array.isArray(categoryTree) ? (categoryTree as CategoryNode[]) : [],
          };
        }

        if (isCancelled) return;

        if (result?.deferredAppUpdateInstall?.pending) {
          setBootstrapState({
            status: 'installing-update',
            update: result.deferredAppUpdateInstall.update,
            statusText: result.deferredAppUpdateInstall.statusText ?? 'Applying update package...',
          });

          const launchResult = await api.beginDeferredAppUpdateInstall?.();
          if (isCancelled) return;

          if (!launchResult || launchResult.launched !== true) {
            throw new Error(
              launchResult?.error ||
                launchResult?.reason ||
                'Deferred update installer failed to launch or is unsupported on this platform.'
            );
          }
          return;
        }

        const rawGames = Array.isArray(result?.games) ? (result.games as GameEntry[]) : [];
        const rawTree = Array.isArray(result?.categoryTree) ? (result.categoryTree as CategoryNode[]) : [];
        const config = (result?.config ?? null) as LibraryConfig | null;
        const { locationDisplayMode } = resolvedStore.getSnapshot();
        const annotatedGames = annotateGamesForDisplay(rawGames, config ?? '', locationDisplayMode);

        resolvedStore.setCurrentLibraryConfig(config);
        resolvedStore.setCategoryTree(rawTree);
        resolvedStore.setAllGames(annotatedGames);

        const storedOrder = readStoredCustomOrder(storage);
        if (storedOrder.length > 0 && annotatedGames.length > 0) {
          const migratedOrder = migrateStoredCustomOrderAliases(annotatedGames, storedOrder);
          if (migratedOrder !== null) {
            writeCustomOrder(migratedOrder, storage);
          }
        }

        const hydratedResult: AppBootstrapResult = {
          ...result,
          config,
          games: annotatedGames,
          categoryTree: rawTree,
        };

        setBootstrapState({
          status: 'success',
          data: hydratedResult,
        });
      } catch (err: unknown) {
        if (isCancelled) return;
        const rawErrorMsg = err instanceof Error ? err.message : String(err);
        const rawStack = err instanceof Error && err.stack ? err.stack : '';
        console.error('[useBootstrapLibrary] Bootstrap failed:', {
          error: sanitizeUserPaths(rawErrorMsg),
          stack: sanitizeUserPaths(rawStack),
        });
        setBootstrapState({
          status: 'error',
          error: err instanceof Error ? err : new Error(String(err)),
          retry,
        });
      }
    };

    void runBootstrap();

    return () => {
      isCancelled = true;
    };
  }, [api, resolvedStore, storage, retry, attempt]);

  return useMemo<BootstrapState>(() => {
    if (bootstrapState.status === 'success') {
      return {
        status: 'success',
        data: bootstrapState.data,
        refresh,
        isRefreshing,
      };
    }
    return bootstrapState;
  }, [bootstrapState, refresh, isRefreshing]);
}
