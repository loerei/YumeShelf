import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ElectronAPI } from '../../shared/types/ipc';
import type { CategoryNode } from '../domain/category-tree';
import { createUiRuntimeState, type UiStorageAdapter } from '../state/ui-runtime-state';
import type { GameEntry, LibraryConfig } from '../types/game';
import { useBootstrapLibrary } from './useBootstrapLibrary';

function createMockStorage(initial: Record<string, string> = {}): UiStorageAdapter & { store: Map<string, string> } {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    store,
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const SAMPLE_CONFIG: LibraryConfig = {
  libraryPath: 'D:\\Games',
  libraryPaths: ['D:\\Games'],
  folderAliases: { 'D:\\Games': 'MainShelf' },
  maxDepth: 3,
  autoLaunch: false,
  minimizeToTray: false,
};

const SAMPLE_GAMES: GameEntry[] = [
  {
    gameKey: 'main::rpg/alpha',
    gameId: 'alpha-id',
    name: 'Alpha Quest',
    folderName: 'Alpha',
    relativePath: 'RPG/Alpha',
    exePath: 'D:\\Games\\RPG\\Alpha\\Game.exe',
  },
];

const SAMPLE_TREE: CategoryNode[] = [
  { id: 'cat-rpg', name: 'RPG', children: [] },
];

function createMockElectronAPI(overrides: Partial<ElectronAPI> = {}): ElectronAPI {
  return {
    bootstrapApp: vi.fn().mockResolvedValue({
      config: SAMPLE_CONFIG,
      games: SAMPLE_GAMES,
      categoryTree: SAMPLE_TREE,
    }),
    checkConfig: vi.fn().mockResolvedValue(SAMPLE_CONFIG),
    getGames: vi.fn().mockResolvedValue(SAMPLE_GAMES),
    getCategoryTree: vi.fn().mockResolvedValue(SAMPLE_TREE),
    beginDeferredAppUpdateInstall: vi.fn().mockResolvedValue({ launched: true }),
    ...overrides,
  } as unknown as ElectronAPI;
}

describe('useBootstrapLibrary', () => {
  beforeEach(() => {
    document.body.className = '';
    vi.restoreAllMocks();
  });

  it('initializes in loading state, applies theme synchronously, and hydrates config, categoryTree, and annotated games', async () => {
    const storage = createMockStorage({ yumeshelf_theme: 'dark' });
    const store = createUiRuntimeState(storage);
    const api = createMockElectronAPI();

    const { result } = renderHook(() => useBootstrapLibrary(store, api, storage));

    expect(result.current.status).toBe('loading');
    expect(document.body.classList.contains('dark-theme')).toBe(true);

    await waitFor(() => {
      expect(result.current.status).toBe('success');
    });

    const snapshot = store.getSnapshot();
    expect(snapshot.currentLibraryConfig).toEqual(SAMPLE_CONFIG);
    expect(snapshot.categoryTree).toEqual(SAMPLE_TREE);
    expect(snapshot.allGames).toHaveLength(1);
    expect(snapshot.allGames[0].locationLabel).toBeTruthy();
    expect(snapshot.allGames[0].parentLocationLabel).toBeTruthy();
  });

  it('fails closed to error state when electronAPI is unavailable without throwing', async () => {
    const storage = createMockStorage();
    const store = createUiRuntimeState(storage);

    const { result } = renderHook(() => useBootstrapLibrary(store, undefined, storage));

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });

    if (result.current.status === 'error') {
      expect(result.current.error.message).toContain('Electron API is unavailable');
    }
  });

  it('logs sanitized Windows and POSIX paths on bootstrap rejection and exposes retry', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const storage = createMockStorage();
    const store = createUiRuntimeState(storage);

    const winErr = new Error('Failed reading C:\\Users\\JaneDoe\\Games\\config.json');
    winErr.stack = 'Error: boom\n    at C:\\Users\\JaneDoe\\app\\boot.ts:10:5';

    const posixErr = new Error('Failed reading /home/janedoe/games/config.json');
    posixErr.stack = 'Error: boom\n    at /home/janedoe/app/boot.ts:10:5';

    const bootstrapApp = vi
      .fn()
      .mockRejectedValueOnce(winErr)
      .mockRejectedValueOnce(posixErr)
      .mockResolvedValueOnce({
        config: SAMPLE_CONFIG,
        games: SAMPLE_GAMES,
        categoryTree: SAMPLE_TREE,
      });

    const api = createMockElectronAPI({ bootstrapApp });
    const { result } = renderHook(() => useBootstrapLibrary(store, api, storage));

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });

    expect(errorSpy).toHaveBeenCalledWith(
      '[useBootstrapLibrary] Bootstrap failed:',
      expect.objectContaining({
        error: expect.stringContaining('<USER_DIR>'),
        stack: expect.stringContaining('<USER_DIR>'),
      })
    );
    const firstLogPayload = errorSpy.mock.calls[0][1] as { error: string; stack: string };
    expect(firstLogPayload.error).not.toContain('JaneDoe');
    expect(firstLogPayload.stack).not.toContain('JaneDoe');

    // Retry -> triggers POSIX error
    if (result.current.status === 'error') {
      const retryFn = result.current.retry;
      act(() => {
        retryFn();
      });
    }

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledTimes(2);
    });
    const secondLogPayload = errorSpy.mock.calls[1][1] as { error: string; stack: string };
    expect(secondLogPayload.error).toContain('<USER_DIR>');
    expect(secondLogPayload.error).not.toContain('janedoe');
    expect(secondLogPayload.stack).toContain('<USER_DIR>');
    expect(secondLogPayload.stack).not.toContain('janedoe');

    // Retry -> succeeds
    if (result.current.status === 'error') {
      const retryFn = result.current.retry;
      act(() => {
        retryFn();
      });
    }

    await waitFor(() => {
      expect(result.current.status).toBe('success');
    });
  });

  it('migrates legacy custom order aliases when storedOrder and annotatedGames are non-empty, and skips when games are empty', async () => {
    const storage = createMockStorage({
      yumeshelf_custom_order: JSON.stringify({ schemaVersion: 1, order: ['Alpha'] }),
    });
    const store = createUiRuntimeState(storage);
    const api = createMockElectronAPI();

    const { result } = renderHook(() => useBootstrapLibrary(store, api, storage));

    await waitFor(() => {
      expect(result.current.status).toBe('success');
    });

    const migratedRaw = storage.getItem('yumeshelf_custom_order');
    expect(migratedRaw).toBeTruthy();
    const migratedParsed = JSON.parse(migratedRaw!) as { schemaVersion: number; order: string[] };
    expect(migratedParsed.order).toEqual(['main::rpg/alpha']);

    // Empty games case: should not overwrite stored order
    const emptyStorage = createMockStorage({
      yumeshelf_custom_order: JSON.stringify({ schemaVersion: 1, order: ['Alpha'] }),
    });
    const setItemSpy = vi.spyOn(emptyStorage, 'setItem');
    const emptyStore = createUiRuntimeState(emptyStorage);
    const emptyApi = createMockElectronAPI({
      bootstrapApp: vi.fn().mockResolvedValue({
        config: SAMPLE_CONFIG,
        games: [],
        categoryTree: [],
      }),
    });

    const { result: emptyResult } = renderHook(() => useBootstrapLibrary(emptyStore, emptyApi, emptyStorage));

    await waitFor(() => {
      expect(emptyResult.current.status).toBe('success');
    });
    expect(setItemSpy).not.toHaveBeenCalledWith('yumeshelf_custom_order', expect.anything());
  });

  it('transitions to installing-update when deferredAppUpdateInstall.pending is true and fails closed if launchResult.launched !== true', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const storage = createMockStorage();
    const store = createUiRuntimeState(storage);
    const beginDeferredAppUpdateInstall = vi.fn().mockResolvedValue({ launched: true });
    const api = createMockElectronAPI({
      bootstrapApp: vi.fn().mockResolvedValue({
        config: null,
        games: [],
        categoryTree: [],
        deferredAppUpdateInstall: {
          pending: true,
          statusText: 'Installing v2.3.0...',
        },
      }),
      beginDeferredAppUpdateInstall,
    });

    const { result } = renderHook(() => useBootstrapLibrary(store, api, storage));

    await waitFor(() => {
      expect(result.current.status).toBe('installing-update');
    });
    expect(beginDeferredAppUpdateInstall).toHaveBeenCalledTimes(1);
    if (result.current.status === 'installing-update') {
      expect(result.current.statusText).toBe('Installing v2.3.0...');
    }

    // Failure case: launched: false
    const failingStore = createUiRuntimeState(createMockStorage());
    const failingApi = createMockElectronAPI({
      bootstrapApp: vi.fn().mockResolvedValue({
        config: null,
        games: [],
        categoryTree: [],
        deferredAppUpdateInstall: { pending: true },
      }),
      beginDeferredAppUpdateInstall: vi.fn().mockResolvedValue({
        launched: false,
        error: 'Installer binary missing',
      }),
    });

    const { result: failResult } = renderHook(() => useBootstrapLibrary(failingStore, failingApi, storage));

    await waitFor(() => {
      expect(failResult.current.status).toBe('error');
    });
    if (failResult.current.status === 'error') {
      expect(failResult.current.error.message).toBe('Installer binary missing');
    }
    expect(errorSpy).toHaveBeenCalled();
  });

  it('guards unmount during pending bootstrap IPC to suppress post-unmount state updates', async () => {
    const deferred = createDeferred<{ config: LibraryConfig; games: GameEntry[]; categoryTree: CategoryNode[] }>();
    const storage = createMockStorage();
    const store = createUiRuntimeState(storage);
    const setAllGamesSpy = vi.spyOn(store, 'setAllGames');
    const api = createMockElectronAPI({
      bootstrapApp: vi.fn().mockReturnValue(deferred.promise),
    });

    const { unmount } = renderHook(() => useBootstrapLibrary(store, api, storage));
    unmount();

    await act(async () => {
      deferred.resolve({
        config: SAMPLE_CONFIG,
        games: SAMPLE_GAMES,
        categoryTree: SAMPLE_TREE,
      });
      await Promise.resolve();
    });

    expect(setAllGamesSpy).not.toHaveBeenCalled();
  });

  it('refresh() re-queries games, tree, and config, respects locationDisplayMode, drops concurrent calls, and preserves success on error', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onRefreshError = vi.fn();
    const storage = createMockStorage();
    const store = createUiRuntimeState(storage);
    store.setLocationDisplayMode('full');

    const refreshedGames: GameEntry[] = [
      ...SAMPLE_GAMES,
      {
        gameKey: 'main::rpg/beta',
        gameId: 'beta-id',
        name: 'Beta Quest',
        folderName: 'Beta',
        relativePath: 'RPG/Beta',
        exePath: 'D:\\Games\\RPG\\Beta\\Game.exe',
      },
    ];
    const refreshedTree: CategoryNode[] = [
      ...SAMPLE_TREE,
      { id: 'cat-sim', name: 'Sim', children: [] },
    ];

    const gamesDeferred = createDeferred<GameEntry[]>();
    const getGames = vi.fn().mockReturnValueOnce(gamesDeferred.promise);
    const getCategoryTree = vi.fn().mockResolvedValue(refreshedTree);
    const checkConfig = vi.fn().mockResolvedValue(SAMPLE_CONFIG);

    const api = createMockElectronAPI({ getGames, getCategoryTree, checkConfig });
    const { result } = renderHook(() => useBootstrapLibrary(store, api, storage, onRefreshError));

    await waitFor(() => {
      expect(result.current.status).toBe('success');
    });

    // Trigger concurrent refresh calls while in-flight
    let refreshPromise1!: Promise<void>;
    let refreshPromise2!: Promise<void>;
    act(() => {
      if (result.current.status === 'success') {
        refreshPromise1 = result.current.refresh();
        refreshPromise2 = result.current.refresh();
      }
    });

    expect(result.current.status).toBe('success');
    if (result.current.status === 'success') {
      expect(result.current.isRefreshing).toBe(true);
    }
    expect(getGames).toHaveBeenCalledTimes(1);

    await act(async () => {
      gamesDeferred.resolve(refreshedGames);
      await Promise.all([refreshPromise1, refreshPromise2]);
    });

    expect(result.current.status).toBe('success');
    if (result.current.status === 'success') {
      expect(result.current.isRefreshing).toBe(false);
    }
    expect(store.getSnapshot().allGames).toHaveLength(2);
    expect(store.getSnapshot().categoryTree).toEqual(refreshedTree);
    expect(store.getSnapshot().allGames[1].locationLabel).toBe(
      store.getSnapshot().allGames[1].fullLocationLabel
    );

    // Error recovery during refresh
    getGames.mockRejectedValueOnce(new Error('Disk read failed at C:\\Users\\JaneDoe\\Games'));
    await act(async () => {
      if (result.current.status === 'success') {
        await result.current.refresh();
      }
    });

    expect(result.current.status).toBe('success');
    if (result.current.status === 'success') {
      expect(result.current.isRefreshing).toBe(false);
    }
    expect(store.getSnapshot().allGames).toHaveLength(2);
    expect(onRefreshError).toHaveBeenCalledTimes(1);
    expect(onRefreshError.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(errorSpy).toHaveBeenCalledWith(
      '[useBootstrapLibrary] Refresh failed:',
      expect.objectContaining({
        error: expect.stringContaining('<USER_DIR>'),
      })
    );
  });

  it('discards store mutations and suppresses state updates when unmounted while refresh() is in-flight', async () => {
    const storage = createMockStorage();
    const store = createUiRuntimeState(storage);
    const gamesDeferred = createDeferred<GameEntry[]>();

    const api = createMockElectronAPI({
      getGames: vi.fn().mockReturnValue(gamesDeferred.promise),
    });

    const { result, unmount } = renderHook(() => useBootstrapLibrary(store, api, storage));

    await waitFor(() => {
      expect(result.current.status).toBe('success');
    });

    const setAllGamesSpy = vi.spyOn(store, 'setAllGames');
    const setCategoryTreeSpy = vi.spyOn(store, 'setCategoryTree');
    const setCurrentLibraryConfigSpy = vi.spyOn(store, 'setCurrentLibraryConfig');
    setAllGamesSpy.mockClear();
    setCategoryTreeSpy.mockClear();
    setCurrentLibraryConfigSpy.mockClear();

    let refreshPromise!: Promise<void>;
    act(() => {
      if (result.current.status === 'success') {
        refreshPromise = result.current.refresh();
      }
    });

    unmount();

    await act(async () => {
      gamesDeferred.resolve(SAMPLE_GAMES);
      await refreshPromise;
    });

    expect(setAllGamesSpy).not.toHaveBeenCalled();
    expect(setCategoryTreeSpy).not.toHaveBeenCalled();
    expect(setCurrentLibraryConfigSpy).not.toHaveBeenCalled();
  });
});
