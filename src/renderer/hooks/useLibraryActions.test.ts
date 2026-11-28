import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ElectronAPI } from '../../shared/types/ipc';
import type { OverlayContextValue } from '../providers/OverlayProvider';
import { createUiRuntimeState, type UiStorageAdapter } from '../state/ui-runtime-state';
import type { GameEntry } from '../types/game';
import {
  recalculateAfterGameDeletion,
  useLibraryActions,
  type UseLibraryActionsOptions,
} from './useLibraryActions';

function createMemoryStorage(initial: Record<string, string> = {}): UiStorageAdapter & {
  store: Map<string, string>;
} {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    store,
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
}

function makeGame(overrides: Partial<GameEntry> = {}): GameEntry {
  const key = overrides.gameKey ?? overrides.gameId ?? 'game-1';
  return {
    gameId: key,
    gameKey: key,
    name: overrides.name ?? 'Alpha Game',
    title: overrides.title ?? overrides.name ?? 'Alpha Game',
    folderPath: overrides.folderPath ?? `C:\\Users\\alice\\Games\\${key}`,
    exePath: overrides.exePath ?? `C:\\Users\\alice\\Games\\${key}\\Game.exe`,
    favorite: overrides.favorite ?? false,
    playtime: overrides.playtime ?? 0,
    isRunning: overrides.isRunning ?? false,
    runInBackground: overrides.runInBackground ?? false,
    autoTranslate: overrides.autoTranslate ?? false,
    ...overrides,
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

function createMockElectronAPI(overrides: Partial<ElectronAPI> = {}): ElectronAPI {
  return {
    toggleFavorite: vi.fn().mockResolvedValue(true),
    launchYume: vi.fn(),
    renameGame: vi.fn().mockResolvedValue(true),
    revealGame: vi.fn(),
    openSaveFolder: vi.fn().mockResolvedValue({ ok: true }),
    selectSaveFolder: vi.fn().mockResolvedValue({ canceled: false, folderPath: 'C:\\Saves\\g1' }),
    setSaveFolderOverride: vi.fn().mockResolvedValue({ ok: true }),
    toggleAutoTranslate: vi.fn().mockResolvedValue(true),
    getLanguageState: vi.fn().mockResolvedValue({
      builtIn: [{ code: 'en', name: 'English' }],
      installed: [{ code: 'ja', name: 'Japanese' }],
    }),
    startTranslationSync: vi.fn().mockResolvedValue(undefined),
    toggleRunInBackground: vi.fn().mockResolvedValue(true),
    deleteGame: vi.fn().mockResolvedValue({ ok: true }),
    openSaveEditorWindow: vi.fn().mockResolvedValue({ ok: true }),
    ...overrides,
  } as unknown as ElectronAPI;
}

describe('recalculateAfterGameDeletion', () => {
  it('reduces a 3-instance stack to 2 instances and selects neighbor instance focus', () => {
    const inst1 = makeGame({ gameKey: 'inst-1', name: 'Shared', folderPath: 'D:\\G\\1' });
    const inst2 = makeGame({ gameKey: 'inst-2', name: 'Shared', folderPath: 'D:\\G\\2' });
    const inst3 = makeGame({ gameKey: 'inst-3', name: 'Shared', folderPath: 'D:\\G\\3' });
    const stackEntry: GameEntry = {
      ...inst1,
      instances: [inst1, inst2, inst3],
      primaryInstance: inst1,
      duplicateCount: 3,
    };

    const result = recalculateAfterGameDeletion({
      allGames: [stackEntry],
      deletedGame: inst1,
      activeCategoryId: null,
      currentSort: 'name',
    });

    expect(result.survivingFocusKey).toBe('inst-2');
    expect(result.nextGames).toHaveLength(1);
    expect(result.nextGames[0].instances).toHaveLength(2);
    expect(result.nextGames[0].duplicateCount).toBe(2);
  });

  it('dissolves a 2-instance stack into a single surviving entry and focuses it', () => {
    const inst1 = makeGame({ gameKey: 'inst-1', name: 'Shared', folderPath: 'D:\\G\\1' });
    const inst2 = makeGame({ gameKey: 'inst-2', name: 'Shared', folderPath: 'D:\\G\\2' });
    const stackEntry: GameEntry = {
      ...inst1,
      instances: [inst1, inst2],
      primaryInstance: inst1,
      duplicateCount: 2,
    };

    const result = recalculateAfterGameDeletion({
      allGames: [stackEntry],
      deletedGame: inst1,
      activeCategoryId: null,
      currentSort: 'name',
    });

    expect(result.survivingFocusKey).toBe('inst-2');
    expect(result.nextGames).toHaveLength(1);
    expect(result.nextGames[0].gameKey).toBe('inst-2');
    expect(result.nextGames[0].duplicateCount).toBe(0);
  });

  it('respects activeCategoryId when selecting neighbor focus after standalone deletion', () => {
    const g1 = makeGame({ gameKey: 'g1', name: 'Alpha', categoryIds: ['cat-a'] });
    const g2 = makeGame({ gameKey: 'g2', name: 'Beta', categoryIds: ['cat-b'] });
    const g3 = makeGame({ gameKey: 'g3', name: 'Gamma', categoryIds: ['cat-a'] });

    const result = recalculateAfterGameDeletion({
      allGames: [g1, g2, g3],
      deletedGame: g1,
      activeCategoryId: 'cat-a',
      currentSort: 'name',
    });

    expect(result.survivingFocusKey).toBe('g3');
    expect(result.nextGames.map((g) => g.gameKey)).toEqual(['g2', 'g3']);
  });
});

describe('useLibraryActions', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function setupHook(overrides: Partial<UseLibraryActionsOptions> = {}) {
    const store = overrides.store ?? createUiRuntimeState();
    const electronAPI = overrides.electronAPI ?? createMockElectronAPI();
    const storage = overrides.storage ?? createMemoryStorage();
    const showToast = overrides.showToast ?? vi.fn();
    const openModal = (overrides.openModal ?? vi.fn()) as OverlayContextValue['openModal'];
    const closeModal = (overrides.closeModal ?? vi.fn()) as OverlayContextValue['closeModal'];
    const isModalOpen = (overrides.isModalOpen ?? vi.fn(() => false)) as OverlayContextValue['isModalOpen'];
    const getModalPayload = (overrides.getModalPayload ?? vi.fn(() => undefined)) as OverlayContextValue['getModalPayload'];
    const onTargetFocusGameKey = overrides.onTargetFocusGameKey ?? vi.fn();

    const hook = renderHook(
      (props: UseLibraryActionsOptions) => useLibraryActions(props),
      {
        initialProps: {
          store,
          electronAPI,
          storage,
          showToast,
          openModal,
          closeModal,
          isModalOpen,
          getModalPayload,
          onTargetFocusGameKey,
          ...overrides,
        },
      }
    );

    return {
      ...hook,
      store,
      electronAPI,
      storage,
      showToast,
      openModal,
      closeModal,
      isModalOpen,
      getModalPayload,
      onTargetFocusGameKey,
    };
  }

  it('rolls back optimistic favorite state and logs sanitized diagnostics on failure', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const game = makeGame({ gameKey: 'C:\\Users\\alice\\Games\\g1', favorite: false });
    const store = createUiRuntimeState();
    store.setAllGames([game]);

    const electronAPI = createMockElectronAPI({
      toggleFavorite: vi.fn().mockRejectedValue(new Error('Disk error at C:\\Users\\alice\\config.json')),
    });
    const showToast = vi.fn();

    const { result } = setupHook({ store, electronAPI, showToast });

    await act(async () => {
      await result.current.handleToggleFavorite(game);
    });

    expect(store.getSnapshot().allGames[0].favorite).toBe(false);
    expect(showToast).toHaveBeenCalledWith('Failed to update favorite status');
    expect(errorSpy).toHaveBeenCalledWith(
      '[AppShell] Failed to toggle favorite:',
      expect.objectContaining({
        gameKey: expect.not.stringContaining('alice'),
        error: expect.not.stringContaining('alice'),
      })
    );
  });

  it('uses yumeshelf_lang from storage as tl-sync fallback when targetLang payload is omitted', async () => {
    const game = makeGame({ gameKey: 'g1' });
    const store = createUiRuntimeState();
    store.setAllGames([game]);
    const storage = createMemoryStorage({ yumeshelf_lang: 'ja' });
    const electronAPI = createMockElectronAPI();

    const { result } = setupHook({ store, electronAPI, storage });

    await act(async () => {
      await result.current.handleMenuAction('tl-sync', game);
    });

    expect(electronAPI.startTranslationSync).toHaveBeenCalledWith({
      gameKey: 'g1',
      targetLang: 'ja',
    });
  });

  it('blocks re-entrant handleConfirmDelete and handleCloseDeleteModal in the same tick', async () => {
    const deferred = createDeferred<{ ok: boolean }>();
    const game1 = makeGame({ gameKey: 'g1', folderPath: 'C:\\Users\\alice\\Games\\g1' });
    const game2 = makeGame({ gameKey: 'g2', folderPath: 'C:\\Users\\alice\\Games\\g2' });
    const store = createUiRuntimeState();
    store.setAllGames([game1, game2]);

    const electronAPI = createMockElectronAPI({
      deleteGame: vi.fn().mockReturnValue(deferred.promise),
    });
    const closeModal = vi.fn();
    const onTargetFocusGameKey = vi.fn();
    const getModalPayload = vi.fn((type) =>
      type === 'delete-game' ? { game: game1 } : undefined
    ) as OverlayContextValue['getModalPayload'];

    const { result } = setupHook({
      store,
      electronAPI,
      closeModal,
      getModalPayload,
      onTargetFocusGameKey,
    });

    let firstPromise!: Promise<void>;
    let secondPromise!: Promise<void>;
    act(() => {
      firstPromise = result.current.handleConfirmDelete();
      secondPromise = result.current.handleConfirmDelete();
      result.current.handleCloseDeleteModal();
    });

    expect(electronAPI.deleteGame).toHaveBeenCalledTimes(1);
    expect(closeModal).not.toHaveBeenCalled();

    await act(async () => {
      deferred.resolve({ ok: true });
      await Promise.all([firstPromise, secondPromise]);
    });

    expect(store.getSnapshot().allGames.map((g) => g.gameKey)).toEqual(['g2']);
    expect(onTargetFocusGameKey).toHaveBeenCalledWith('g2');
    expect(closeModal).toHaveBeenCalledWith('delete-game');
  });

  it('logs sanitized [AppShell] error and shows toast when deleteGame returns ok: false', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const game = makeGame({
      gameKey: 'C:\\Users\\alice\\Games\\g1',
      folderPath: 'C:\\Users\\alice\\Games\\g1',
    });
    const store = createUiRuntimeState();
    store.setAllGames([game]);
    const showToast = vi.fn();
    const electronAPI = createMockElectronAPI({
      deleteGame: vi.fn().mockResolvedValue({
        ok: false,
        error: 'EPERM: C:\\Users\\alice\\Games\\g1\\Game.exe',
      }),
    });
    const getModalPayload = vi.fn((type) =>
      type === 'delete-game' ? { game } : undefined
    ) as OverlayContextValue['getModalPayload'];

    const { result } = setupHook({ store, electronAPI, showToast, getModalPayload });

    await act(async () => {
      await result.current.handleConfirmDelete();
    });

    expect(showToast).toHaveBeenCalledWith('Failed to delete game folder');
    expect(errorSpy).toHaveBeenCalledWith(
      '[AppShell] Game deletion rejected:',
      expect.objectContaining({
        gameKey: expect.not.stringContaining('alice'),
        folderPath: expect.not.stringContaining('alice'),
        error: expect.not.stringContaining('alice'),
      })
    );
  });

  it('maintains callback referential stability across store allGames updates', () => {
    const store = createUiRuntimeState();
    store.setAllGames([makeGame({ gameKey: 'g1' })]);

    const stableOpts: UseLibraryActionsOptions = {
      store,
      showToast: vi.fn(),
      openModal: vi.fn() as OverlayContextValue['openModal'],
      closeModal: vi.fn() as OverlayContextValue['closeModal'],
      isModalOpen: vi.fn(() => false) as OverlayContextValue['isModalOpen'],
      getModalPayload: vi.fn(() => undefined) as OverlayContextValue['getModalPayload'],
      onTargetFocusGameKey: vi.fn(),
    };
    const { result, rerender } = renderHook(
      (props: UseLibraryActionsOptions) => useLibraryActions(props),
      { initialProps: stableOpts }
    );
    const refA = result.current;
    act(() => {
      store.setAllGames([makeGame({ gameKey: 'g3' })]);
    });
    rerender(stableOpts);
    const refB = result.current;

    expect(Object.is(refA.handleMenuAction, refB.handleMenuAction)).toBe(true);
    expect(Object.is(refA.handleToggleFavorite, refB.handleToggleFavorite)).toBe(true);
    expect(Object.is(refA.handleFavoriteError, refB.handleFavoriteError)).toBe(true);
    expect(Object.is(refA.handleLaunch, refB.handleLaunch)).toBe(true);
    expect(Object.is(refA.handleOpenSaveEditor, refB.handleOpenSaveEditor)).toBe(true);
  });
});
