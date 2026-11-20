import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ElectronAPI } from '../shared/types/ipc';
import { initRenderer } from '../renderer';
import { App, AppShell } from './App';
import { LibraryGrid, type LibraryGridProps } from './components/LibraryGrid';
import { LibraryStateProvider } from './context/LibraryStateContext';
import { NotificationProvider, useNotification } from './providers/NotificationProvider';
import { OverlayProvider } from './providers/OverlayProvider';
import { TooltipProvider } from './providers/TooltipProvider';
import { createUiRuntimeState, type UiStorageAdapter } from './state/ui-runtime-state';
import type { GameEntry } from './types/game';
import type { ISaveEditorLauncher } from './services/save-editor-launcher';

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
    folderPath: overrides.folderPath !== undefined ? overrides.folderPath : `C:\\Games\\${key}`,
    exePath: overrides.exePath ?? `C:\\Games\\${key}\\Game.exe`,
    favorite: overrides.favorite ?? false,
    playtime: overrides.playtime ?? 0,
    isRunning: overrides.isRunning ?? false,
    runInBackground: overrides.runInBackground ?? false,
    autoTranslate: overrides.autoTranslate ?? false,
    ...overrides,
  };
}

function createMockElectronAPI(overrides: Partial<ElectronAPI> = {}): ElectronAPI {
  return {
    bootstrapApp: vi.fn().mockResolvedValue({
      games: [makeGame({ gameKey: 'g1', name: 'Alpha' }), makeGame({ gameKey: 'g2', name: 'Beta' })],
      libraryConfig: { libraryPaths: ['C:\\Games'], categoryTree: [] },
      categoryTree: [],
    }),
    getGames: vi.fn().mockResolvedValue([
      makeGame({ gameKey: 'g1', name: 'Alpha' }),
      makeGame({ gameKey: 'g2', name: 'Beta' }),
    ]),
    checkConfig: vi.fn().mockResolvedValue({ libraryPaths: ['C:\\Games'], categoryTree: [] }),
    getCategoryTree: vi.fn().mockResolvedValue([]),
    getLibraryConfig: vi.fn().mockResolvedValue({ libraryPaths: ['C:\\Games'], categoryTree: [] }),
    getAppVersion: vi.fn().mockResolvedValue('2.2.9'),
    getLanguageState: vi.fn().mockResolvedValue({
      builtIn: [
        { code: 'en', name: 'English' },
        { code: 'ja', name: 'Japanese' },
      ],
      installed: [],
    }),
    toggleFavorite: vi.fn().mockImplementation(async (_key: string, next: boolean) => next),
    launchYume: vi.fn().mockResolvedValue(undefined),
    renameGame: vi.fn().mockResolvedValue(true),
    revealGame: vi.fn().mockResolvedValue(undefined),
    openSaveFolder: vi.fn().mockResolvedValue({ ok: true }),
    selectSaveFolder: vi.fn().mockResolvedValue({ canceled: false, folderPath: 'C:\\Saves\\g1' }),
    setSaveFolderOverride: vi.fn().mockResolvedValue({ ok: true }),
    toggleAutoTranslate: vi.fn().mockResolvedValue(true),
    startTranslationSync: vi.fn().mockResolvedValue(undefined),
    toggleRunInBackground: vi.fn().mockResolvedValue(true),
    deleteGame: vi.fn().mockResolvedValue({ ok: true }),
    openSaveEditorWindow: vi.fn().mockResolvedValue({ ok: true }),
    onGameStarted: vi.fn().mockReturnValue(() => {}),
    onGameStopped: vi.fn().mockReturnValue(() => {}),
    onPlaytimeUpdated: vi.fn().mockReturnValue(() => {}),
    onAppUpdateStatus: vi.fn().mockReturnValue(() => {}),
    onTranslationStatus: vi.fn().mockReturnValue(() => {}),
    onLibraryUpdated: vi.fn().mockReturnValue(() => {}),
    ...overrides,
  } as unknown as ElectronAPI;
}

describe('Renderer Entrypoint Cutover Integration (07.2.1)', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    if (!document.getElementById('portal-root')) {
      const portal = document.createElement('div');
      portal.id = 'portal-root';
      document.body.appendChild(portal);
    }
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it('initRenderer migrates storage preferences prior to store creation, mounts App into #react-root, registers global error/rejection sanitizers, and disposes cleanly', async () => {
    const container = document.createElement('div');
    container.id = 'react-root';
    container.tabIndex = -1;
    document.body.appendChild(container);

    const storage = createMemoryStorage({
      yumeshelf_sort_pref: 'rj',
    });
    const unbindStopped = vi.fn();
    const api = createMockElectronAPI({
      onGameStopped: vi.fn().mockReturnValue(unbindStopped),
    });
    let dispose: (() => void) | undefined;

    try {
      await act(async () => {
        dispose = initRenderer({
          container,
          storage,
          electronAPI: api,
          targetWindow: window,
        });
      });

      expect(storage.getItem('yumeshelf_sort_pref')).toBe('date');
      expect(storage.getItem('yumeshelf_storage_version')).toBe('1');

      await waitFor(() => {
        expect(within(container).getByText('Alpha')).toBeTruthy();
      });

      // Dispatch an unhandled error event with a personal path
      const errEvent = new ErrorEvent('error', {
        message: 'Crash in C:\\Users\\JaneDoe\\app\\renderer.js',
        filename: 'file:///C:/Users/JaneDoe/app/renderer.js',
        error: new Error('Boom at C:\\Users\\JaneDoe\\secret.txt'),
      });
      window.dispatchEvent(errEvent);

      const sanitizerCall = consoleErrorSpy.mock.calls.find(
        (c: unknown[]) => c[0] === '[Renderer] Uncaught error:'
      );
      expect(sanitizerCall).toBeDefined();
      const serialized = JSON.stringify(sanitizerCall?.[1]);
      expect(serialized).toContain('<USER_DIR>');
      expect(serialized).not.toContain('JaneDoe');

      // Dispatch an unhandledrejection event with a POSIX personal path
      const rejectionEvent = new CustomEvent('unhandledrejection') as CustomEvent & {
        reason?: unknown;
      };
      rejectionEvent.reason = new Error('Async failure at /home/janedoe/games/save.json');
      window.dispatchEvent(rejectionEvent);

      const rejectionCall = consoleErrorSpy.mock.calls.find(
        (c: unknown[]) => c[0] === '[Renderer] Unhandled rejection:'
      );
      expect(rejectionCall).toBeDefined();
      const serializedRejection = JSON.stringify(rejectionCall?.[1]);
      expect(serializedRejection).toContain('<USER_DIR>');
      expect(serializedRejection).not.toContain('janedoe');

      // Verify beforeunload unbinds IPC listeners
      window.dispatchEvent(new Event('beforeunload'));
      expect(unbindStopped).toHaveBeenCalled();
    } finally {
      act(() => {
        dispose?.();
        // Idempotent second call
        dispose?.();
      });
      document.body.removeChild(container);
    }
  });

  it('renders installing-update state with data-mode="update", progress track, and zero spinner, and error state with Retry focus handoff', async () => {
    let resolveBoot: (val: unknown) => void = () => {};
    const pendingBoot = new Promise((res) => {
      resolveBoot = res;
    });
    const api = createMockElectronAPI({
      bootstrapApp: vi
        .fn()
        .mockRejectedValueOnce(new Error('Disk failed at C:\\Users\\Alice\\lib'))
        .mockImplementationOnce(() => pendingBoot),
    });

    render(<App electronAPI={api} storage={createMemoryStorage()} />);

    const retryBtn = await screen.findByRole('button', { name: 'Retry' });
    expect(document.activeElement).toBe(retryBtn);
    const alertOverlay = screen.getByRole('alert');
    expect(alertOverlay.textContent).toContain('<USER_DIR>');
    expect(alertOverlay.textContent).not.toContain('Alice');
    expect(alertOverlay.querySelector('.loading-copy .loading-actions')).toBeTruthy();

    fireEvent.click(retryBtn);

    const loadingStatus = await screen.findByRole('status');
    expect(loadingStatus.className).toContain('loading-overlay');
    expect(document.activeElement).toBe(loadingStatus);

    await act(async () => {
      resolveBoot({
        games: [makeGame({ gameKey: 'g1', name: 'Alpha' })],
        libraryConfig: { libraryPaths: ['C:\\Games'], categoryTree: [] },
        categoryTree: [],
      });
    });

    await waitFor(() => {
      expect(screen.getByText('Alpha')).toBeTruthy();
    });
  });

  it('renders installing-update overlay when bootstrapApp reports update installation', async () => {
    const api = createMockElectronAPI({
      beginDeferredAppUpdateInstall: vi.fn().mockResolvedValue({ launched: true }),
      bootstrapApp: vi.fn().mockResolvedValue({
        games: [],
        config: null,
        categoryTree: [],
        deferredAppUpdateInstall: {
          pending: true,
          statusText: 'Extracting update...',
        },
      }),
    });

    render(<App electronAPI={api} storage={createMemoryStorage()} />);

    await waitFor(() => {
      const statusEl = screen.getByRole('status');
      expect(statusEl.getAttribute('data-mode')).toBe('update');
      expect(statusEl.querySelector('.loading-copy .loading-progress-track')).toBeTruthy();
      expect(statusEl.querySelector('.loading-spinner')).toBeNull();
    });
  });

  it('dispatches error toast when background library refresh fails', async () => {
    const api = createMockElectronAPI({
      getGames: vi
        .fn()
        .mockRejectedValueOnce(new Error('Permission denied on C:\\Users\\Alice\\Games')),
    });

    render(<App electronAPI={api} storage={createMemoryStorage()} />);

    await waitFor(() => {
      expect(screen.getByText('Alpha')).toBeTruthy();
    });

    const refreshBtn = screen.getByRole('button', { name: 'Refresh Library' });
    fireEvent.click(refreshBtn);

    await waitFor(() => {
      const toastText = screen.getByText(/Library refresh failed:/i).textContent ?? '';
      expect(toastText).toContain('<USER_DIR>');
      expect(toastText).not.toContain('Alice');
    });
  });

  it('preserves yumeshelf_mascot_volume = "0" as muted volume 0 instead of defaulting to 20 and cleans up mascot widget on unmount', async () => {
    const storage = createMemoryStorage({
      yumeshelf_mascot_volume: '0',
      yumeshelf_mascot_show: 'on',
    });
    const api = createMockElectronAPI();

    const { unmount } = render(<App electronAPI={api} storage={storage} />);

    await waitFor(() => {
      expect(screen.getByText('Alpha')).toBeTruthy();
    });

    expect(storage.getItem('yumeshelf_mascot_volume')).toBe('0');
    const mascotEl = document.getElementById('mascot-widget-container');
    expect(mascotEl).toBeTruthy();
    expect(document.getElementById('mascot-menu-volume-value')?.textContent).toBe('0%');

    unmount();
    expect(document.getElementById('mascot-widget-container')).toBeNull();
  });

  it('registers gridContainerRef.current via setFallbackFocusTarget on bootstrap success, clears on unmount, and transfers focus to library-grid when UpdateNotificationCard is dismissed', async () => {
    let updateCallback: ((payload: unknown) => void) | undefined;
    const api = createMockElectronAPI({
      bootstrapApp: vi.fn().mockResolvedValue({
        games: [makeGame({ gameKey: 'g1', name: 'Alpha' })],
        libraryConfig: { libraryPaths: ['C:\\Games'], categoryTree: [] },
        categoryTree: [],
        postUpdateNotice: { version: '2.3.0' },
      }),
      onAppUpdateStatus: vi.fn().mockImplementation((cb: (payload: unknown) => void) => {
        updateCallback = cb;
        return () => {};
      }),
    });

    const fallbackTargets: Array<HTMLElement | null> = [];
    function FallbackTracker({ children }: { children: React.ReactNode }) {
      const notif = useNotification();
      const origRef = React.useRef(notif.setFallbackFocusTarget);
      origRef.current = notif.setFallbackFocusTarget;
      React.useLayoutEffect(() => {
        const orig = notif.setFallbackFocusTarget;
        (notif as { setFallbackFocusTarget: (el: HTMLElement | null) => void }).setFallbackFocusTarget = (
          el: HTMLElement | null
        ) => {
          fallbackTargets.push(el);
          orig(el);
        };
      }, [notif]);
      return <>{children}</>;
    }

    const store = createUiRuntimeState();
    const { unmount } = render(
      <LibraryStateProvider store={store}>
        <TooltipProvider>
          <OverlayProvider>
            <NotificationProvider electronAPI={api}>
              <FallbackTracker>
                <AppShell store={store} electronAPI={api} storage={createMemoryStorage()} />
              </FallbackTracker>
            </NotificationProvider>
          </OverlayProvider>
        </TooltipProvider>
      </LibraryStateProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Alpha')).toBeTruthy();
    });

    const gridEl = screen.getByTestId('library-grid');
    expect(fallbackTargets).toContain(gridEl);

    await waitFor(() => {
      expect(screen.getByText(/Application updated to v2\.3\.0/)).toBeTruthy();
    });

    // Trigger an update notification card and dismiss it
    await act(async () => {
      updateCallback?.({ phase: 'update-available', update: { releaseName: 'v2.4.0' } });
    });

    const dismissBtn = await screen.findByRole('button', { name: 'Dismiss update notification' });
    dismissBtn.focus();
    fireEvent.click(dismissBtn);

    await waitFor(() => {
      expect(document.activeElement).toBe(gridEl);
    });

    unmount();
    expect(fallbackTargets[fallbackTargets.length - 1]).toBeNull();
  });

  it('handles Header modal opening/dismissal and Settings -> About / LanguagePack submodal stacking while preserving SettingsModal state and restoring focus', async () => {
    const api = createMockElectronAPI();
    render(<App electronAPI={api} storage={createMemoryStorage()} />);

    await waitFor(() => {
      expect(screen.getByText('Alpha')).toBeTruthy();
    });

    // 1. Open AboutModal directly from Header and dismiss -> focus returns to Header About button
    const headerAboutBtn = screen.getByRole('button', { name: 'About YumeShelf and Credits' });
    headerAboutBtn.focus();
    fireEvent.click(headerAboutBtn);

    expect(await screen.findByRole('dialog')).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(document.activeElement).toBe(headerAboutBtn);
    });

    // 2. Open SettingsModal, then open LanguagePackModal from inside SettingsModal
    const settingsBtn = screen.getByRole('button', { name: 'Settings' });
    settingsBtn.focus();
    fireEvent.click(settingsBtn);

    const langTrigger = await screen.findByRole('button', { name: /more languages/i });
    langTrigger.focus();
    fireEvent.click(langTrigger);

    // Both Settings and LanguagePack dialogs remain mounted in DOM
    const dialogs = await screen.findAllByRole('dialog');
    expect(dialogs.length).toBe(2);

    // Dismiss top LanguagePackModal via its close button -> SettingsModal stays mounted and focus returns to langTrigger
    const closeBtns = screen.getAllByRole('button', { name: 'Close dialog' });
    fireEvent.click(closeBtns[closeBtns.length - 1]);

    await waitFor(() => {
      expect(screen.getAllByRole('dialog').length).toBe(1);
      expect(document.activeElement).toBe(langTrigger);
    });

    // 3. Open AboutModal from inside SettingsModal (General tab -> About & Credits)
    const aboutTrigger = screen.getByRole('button', { name: 'About & Credits' });
    aboutTrigger.focus();
    fireEvent.click(aboutTrigger);

    expect((await screen.findAllByRole('dialog')).length).toBe(2);
    const closeBtnsAfterAbout = screen.getAllByRole('button', { name: 'Close dialog' });
    fireEvent.click(closeBtnsAfterAbout[closeBtnsAfterAbout.length - 1]);

    await waitFor(() => {
      expect(screen.getAllByRole('dialog').length).toBe(1);
      expect(document.activeElement).toBe(aboutTrigger);
    });
  });

  it('executes card context menu actions (rename true/false/reject, reveal, open/set/reset save folder with AC 23 path sanitization, toggle-live-tl, tl-sync BCP-47 fallback & rejection, toggle-bg, launch, save-editor)', async () => {
    const store = createUiRuntimeState();
    const storage = createMemoryStorage({
      yumeshelf_lang: 'invalid_lang_$$',
    });
    const launcher: ISaveEditorLauncher = {
      open: vi.fn().mockRejectedValueOnce(new Error('Launch failed at C:\\Users\\Bob\\save')),
    };

    const api = createMockElectronAPI({
      bootstrapApp: vi.fn().mockResolvedValue({
        games: [
          makeGame({
            gameKey: 'g1',
            name: 'Alpha',
            exePath: 'C:\\Games\\g1\\Alpha.exe',
            runInBackground: true,
            saveFolderOverride: 'C:\\CustomSaves\\g1',
          }),
        ],
        libraryConfig: { libraryPaths: ['C:\\Games'], categoryTree: [] },
        categoryTree: [],
      }),
      renameGame: vi
        .fn()
        .mockResolvedValueOnce(false)
        .mockRejectedValueOnce(
          new Error(
            "EPERM: operation not permitted, rename 'C:\\Users\\John Doe\\Games\\old' -> 'C:\\Users\\John Doe\\Games\\new'"
          )
        )
        .mockResolvedValueOnce(true),
      openSaveFolder: vi.fn().mockResolvedValueOnce({
        ok: false,
        error: "EACCES: permission denied, mkdir 'C:\\Users\\Alice\\AppData\\Local\\Saves'",
      }),
      selectSaveFolder: vi.fn().mockResolvedValue({
        canceled: false,
        folderPath: 'C:\\Users\\Alice\\NewSaves',
      }),
      setSaveFolderOverride: vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          error: "EACCES: permission denied, mkdir 'C:\\Users\\Alice\\AppData\\Local\\Saves'",
        })
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({ ok: true }),
      startTranslationSync: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Network error at /Users/Alice/tl')),
    });

    render(<App store={store} electronAPI={api} launcher={launcher} storage={storage} />);

    await waitFor(() => {
      expect(screen.getByText('Alpha')).toBeTruthy();
    });

    const openCardMenu = () => {
      const menuBtn = screen.getByRole('button', { name: 'Game options' });
      fireEvent.click(menuBtn);
    };

    // 1. Rename returning false -> store unchanged, toast 'Failed to rename game', console.warn logged
    openCardMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
    let renameInput = screen.getByRole('textbox', { name: 'Rename game title' });
    fireEvent.change(renameInput, { target: { value: 'Alpha Renamed 1' } });
    await act(async () => {
      fireEvent.keyDown(renameInput, { key: 'Enter' });
    });

    expect(api.renameGame).toHaveBeenCalledWith({ gameKey: 'g1', newName: 'Alpha Renamed 1' });
    expect(store.getSnapshot().allGames[0]?.name).toBe('Alpha');
    expect(screen.getByText('Failed to rename game')).toBeTruthy();

    // 2. Rename rejecting with personal path -> store unchanged, toast 'Failed to rename game', console.error sanitized
    openCardMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
    renameInput = screen.getByRole('textbox', { name: 'Rename game title' });
    fireEvent.change(renameInput, { target: { value: 'Alpha Renamed 2' } });
    await act(async () => {
      fireEvent.keyDown(renameInput, { key: 'Enter' });
    });

    expect(store.getSnapshot().allGames[0]?.name).toBe('Alpha');
    const renameErrCall = consoleErrorSpy.mock.calls.find((c: unknown[]) =>
      String(c[0]).includes('[AppShell] Error invoking renameGame')
    );
    expect(renameErrCall).toBeDefined();
    expect(JSON.stringify(renameErrCall?.[1])).toContain('<USER_DIR>');
    expect(JSON.stringify(renameErrCall?.[1])).not.toContain('John Doe');

    // 3. Rename returning true -> updates store name and title
    openCardMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
    renameInput = screen.getByRole('textbox', { name: 'Rename game title' });
    fireEvent.change(renameInput, { target: { value: 'Alpha Prime' } });
    await act(async () => {
      fireEvent.keyDown(renameInput, { key: 'Enter' });
    });
    expect(store.getSnapshot().allGames[0]?.name).toBe('Alpha Prime');

    // 4. Reveal in folder
    openCardMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Reveal in Folder' }));
    expect(api.revealGame).toHaveBeenCalledWith('C:\\Games\\g1\\Alpha.exe');

    // 5. Open Save Folder failure (AC 23 path sanitization in toast)
    openCardMenu();
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Open Save Folder' }));
    });
    const openSavesToast = screen.getByText(/Failed to open save folder:/i).textContent ?? '';
    expect(openSavesToast).toContain('<USER_DIR>');
    expect(openSavesToast).not.toContain('Alice');

    // 6. Set Custom Save Folder failure (AC 23 path sanitization in toast) & success
    openCardMenu();
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Set Custom Save Folder' }));
    });
    const setSavesToast = screen.getByText(/Failed to set save folder:/i).textContent ?? '';
    expect(setSavesToast).toContain('<USER_DIR>');
    expect(setSavesToast).not.toContain('Alice');

    openCardMenu();
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Set Custom Save Folder' }));
    });
    expect(store.getSnapshot().allGames[0]?.saveFolderOverride).toBe('C:\\Users\\Alice\\NewSaves');

    // 7. Reset Save Folder
    openCardMenu();
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Reset Save Folder' }));
    });
    expect(store.getSnapshot().allGames[0]?.saveFolderOverride).toBeNull();

    // 8. Live Translation toggle & Run in Background toggle
    openCardMenu();
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Live Translation' }));
    });
    expect(store.getSnapshot().allGames[0]?.autoTranslate).toBe(true);

    openCardMenu();
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Run in Background' }));
    });
    expect(store.getSnapshot().allGames[0]?.runInBackground).toBe(true);

    // 9. Sync Translations (BCP-47 invalid stored lang -> falls back to 'en', then second call rejects -> toast)
    openCardMenu();
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Sync Translations' }));
    });
    expect(api.startTranslationSync).toHaveBeenCalledWith({ gameKey: 'g1', targetLang: 'en' });

    openCardMenu();
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Sync Translations' }));
    });
    expect(screen.getByText('Failed to start translation sync')).toBeTruthy();

    // 10. Save Editor rejection toast
    openCardMenu();
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Save Editor' }));
    });
    expect(launcher.open).toHaveBeenCalledWith('g1');
    const saveEditorToast = screen.getByText(/Failed to open save editor:/i).textContent ?? '';
    expect(saveEditorToast).toContain('<USER_DIR>');
    expect(saveEditorToast).not.toContain('Bob');

    // 11. Card click launches game with runInBackground preference
    const cardEl = screen.getByRole('article');
    fireEvent.click(cardEl);
    expect(api.launchYume).toHaveBeenCalledWith({
      gameKey: 'g1',
      exePath: 'C:\\Games\\g1\\Alpha.exe',
      runInBackground: true,
    });
  });

  it('handles standalone game deletion confirmation, Cancel focus restoration, in-flight focus retention on Delete button, rejection handling, category-filtered neighbor focus, and empty-grid container fallback', async () => {
    let resolveDelete: (val: unknown) => void = () => {};
    const pendingDelete = new Promise((res) => {
      resolveDelete = res;
    });

    const g1 = makeGame({
      gameKey: 'g1',
      name: 'Alpha',
      categoryIds: ['cat-1'],
      folderPath: 'C:\\Games\\g1',
    });
    const g2 = makeGame({
      gameKey: 'g2',
      name: 'Beta',
      categoryIds: ['cat-2'],
      folderPath: 'C:\\Games\\g2',
    });
    const g3 = makeGame({
      gameKey: 'g3',
      name: 'Charlie',
      categoryIds: ['cat-1'],
      folderPath: 'C:\\Games\\g3',
    });

    const store = createUiRuntimeState();
    const api = createMockElectronAPI({
      bootstrapApp: vi.fn().mockResolvedValue({
        games: [g1, g2, g3],
        libraryConfig: { libraryPaths: ['C:\\Games'], categoryTree: [] },
        categoryTree: [
          { id: 'cat-1', name: 'Category X', children: [] },
          { id: 'cat-2', name: 'Category Y', children: [] },
        ],
      }),
      deleteGame: vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          error: 'EPERM locked at C:\\Users\\Alice\\Games\\g1',
        })
        .mockImplementationOnce(() => pendingDelete)
        .mockResolvedValueOnce({ ok: true }),
    });

    render(<App store={store} electronAPI={api} storage={createMemoryStorage()} />);

    await waitFor(() => {
      expect(screen.getByText('Alpha')).toBeTruthy();
    });

    // Filter by Category X ('cat-1') and sort alphabetically ('az')
    act(() => {
      store.setActiveCategoryId('cat-1');
      store.setCurrentSort('az');
    });

    await waitFor(() => {
      expect(screen.queryByText('Beta')).toBeNull();
      expect(screen.getByText('Alpha')).toBeTruthy();
      expect(screen.getByText('Charlie')).toBeTruthy();
    });

    const openDeleteForFirstCard = () => {
      const menuBtns = screen.getAllByRole('button', { name: 'Game options' });
      fireEvent.click(menuBtns[0]);
      fireEvent.click(screen.getByRole('menuitem', { name: 'Delete Game' }));
    };

    // 1. Open Delete modal and Cancel -> restores focus to g1 card in LibraryGrid
    openDeleteForFirstCard();
    const cancelBtn = await screen.findByRole('button', { name: 'Cancel' });
    fireEvent.click(cancelBtn);

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
      const g1Card = document.querySelector('[data-game-key="g1"]');
      expect(document.activeElement).toBe(g1Card);
    });

    // 2. Open Delete modal and trigger rejected deletion -> logs sanitized error, shows toast, preserves g1
    openDeleteForFirstCard();
    const deleteBtn1 = await screen.findByRole('button', { name: 'Delete' });
    await act(async () => {
      fireEvent.click(deleteBtn1);
    });

    expect(screen.getByText('Failed to delete game folder')).toBeTruthy();
    const rejectLog = consoleErrorSpy.mock.calls.find(
      (c: unknown[]) => c[0] === '[AppShell] Game deletion rejected:'
    );
    expect(rejectLog).toBeDefined();
    expect(JSON.stringify(rejectLog?.[1])).toContain('<USER_DIR>');
    expect(JSON.stringify(rejectLog?.[1])).not.toContain('Alice');
    expect(store.getSnapshot().allGames.length).toBe(3);

    // 3. Trigger in-flight deletion -> maintains focus on Delete button with aria-disabled="true"
    const deleteBtn2 = screen.getByRole('button', { name: 'Delete' });
    deleteBtn2.focus();
    fireEvent.click(deleteBtn2);

    const deletingBtn = await screen.findByRole('button', { name: 'Deleting...' });
    expect(deletingBtn.getAttribute('aria-disabled')).toBe('true');
    expect((deletingBtn as HTMLButtonElement).disabled).toBe(false);
    expect(document.activeElement).toBe(deletingBtn);

    // Finish deleting g1 -> focus transfers deterministically to surviving neighbor in Category X (g3 'Charlie'), skipping filtered-out g2
    await act(async () => {
      resolveDelete({ ok: true });
    });

    await waitFor(() => {
      expect(screen.queryByText('Alpha')).toBeNull();
      const g3Card = document.querySelector('[data-game-key="g3"]');
      expect(document.activeElement).toBe(g3Card);
    });

    // 4. Delete last remaining game in Category X (g3) -> focus falls back to library-grid container
    openDeleteForFirstCard();
    const deleteBtn3 = await screen.findByRole('button', { name: 'Delete' });
    await act(async () => {
      fireEvent.click(deleteBtn3);
    });

    await waitFor(() => {
      expect(screen.queryByText('Charlie')).toBeNull();
      expect(document.activeElement).toBe(screen.getByTestId('library-grid'));
    });
  });

  it('handles DuplicateStackModal live store reactivity, multi-instance child deletion retaining focus inside modal, and stack dissolution transferring focus to surviving GameCard in LibraryGrid', async () => {
    const inst1 = makeGame({
      gameId: 'stack-game',
      gameKey: 'inst-1',
      name: 'Stacked RPG',
      relativePath: 'v1/Stacked RPG',
      folderPath: 'C:\\Games\\v1',
    });
    const inst2 = makeGame({
      gameId: 'stack-game',
      gameKey: 'inst-2',
      name: 'Stacked RPG',
      relativePath: 'v2/Stacked RPG',
      folderPath: 'C:\\Games\\v2',
    });
    const inst3 = makeGame({
      gameId: 'stack-game',
      gameKey: 'inst-3',
      name: 'Stacked RPG',
      relativePath: 'v3/Stacked RPG',
      folderPath: 'C:\\Games\\v3',
    });
    const parentStack = makeGame({
      gameId: 'stack-game',
      gameKey: 'inst-1',
      name: 'Stacked RPG',
      instances: [inst1, inst2, inst3],
      primaryInstance: inst1,
      duplicateCount: 3,
    });

    const store = createUiRuntimeState();
    const api = createMockElectronAPI({
      bootstrapApp: vi.fn().mockResolvedValue({
        games: [parentStack],
        libraryConfig: { libraryPaths: ['C:\\Games'], categoryTree: [] },
        categoryTree: [],
      }),
      deleteGame: vi.fn().mockResolvedValue({ ok: true }),
    });

    render(<App store={store} electronAPI={api} storage={createMemoryStorage()} />);

    // Wait for stack card to render in LibraryGrid
    const stackCard = await screen.findByRole('region', { name: /Game stack: Stacked RPG/i });
    fireEvent.click(stackCard);

    // DuplicateStackModal opens in portal with 3 child GameCards
    const modalDialog = await screen.findByRole('dialog');
    expect(within(modalDialog).getByText('3 versions installed')).toBeTruthy();
    expect(within(modalDialog).getAllByRole('article').length).toBe(3);

    // Live reactivity inside DuplicateStackModal: playtime update on inst-1 updates badge immediately
    act(() => {
      store.updateGamePlaytime('inst-1', 120 * 60000);
    });
    await waitFor(() => {
      expect(within(modalDialog).getByText('2h 0m')).toBeTruthy();
    });

    const gridEl = screen.getByTestId('library-grid');
    const gridFocusSpy = vi.spyOn(gridEl, 'focus');

    // Delete inst-1 from inside DuplicateStackModal (3 -> 2 instances: modal stays open, focus moves to inst-2 inside modal, gridEl.focus NOT called)
    const instanceMenus = within(modalDialog).getAllByRole('button', { name: 'Game options' });
    fireEvent.click(instanceMenus[0]);
    fireEvent.click(within(modalDialog).getByRole('menuitem', { name: 'Delete Game' }));

    // Confirm delete dialog is stacked on top of DuplicateStackModal
    const deleteBtn = await screen.findByRole('button', { name: 'Delete' });
    await act(async () => {
      fireEvent.click(deleteBtn);
    });

    await waitFor(() => {
      expect(within(modalDialog).getByText('2 versions installed')).toBeTruthy();
      const survivingInst2 = modalDialog.querySelector('[data-game-key="inst-2"]');
      expect(document.activeElement).toBe(survivingInst2);
    });
    expect(gridFocusSpy).not.toHaveBeenCalled();

    // Now delete inst-2 (2 -> 1 instance: stack dissolves, DuplicateStackModal auto-closes and passes 'inst-3' via onClose(targetKey) to LibraryGrid)
    const remainingMenus = within(modalDialog).getAllByRole('button', { name: 'Game options' });
    fireEvent.click(remainingMenus[0]);
    fireEvent.click(within(modalDialog).getByRole('menuitem', { name: 'Delete Game' }));

    const deleteBtn2 = await screen.findByRole('button', { name: 'Delete' });
    await act(async () => {
      fireEvent.click(deleteBtn2);
    });

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
      const singleCardInGrid = gridEl.querySelector('[data-game-key="inst-3"]');
      expect(singleCardInGrid).toBeTruthy();
      expect(document.activeElement).toBe(singleCardInGrid);
    });
  });

  it('maintains callback prop referential stability across store updates', async () => {
    const store = createUiRuntimeState();
    const api = createMockElectronAPI();

    render(<App store={store} electronAPI={api} storage={createMemoryStorage()} />);

    await waitFor(() => {
      expect(screen.getByText('Alpha')).toBeTruthy();
    });

    const getLibraryGridProps = (): LibraryGridProps => {
      const gridEl = screen.getByTestId('library-grid') as unknown as Record<string, unknown>;
      const fiberKey = Object.keys(gridEl).find((k) => k.startsWith('__reactFiber$'));
      let fiber = (fiberKey ? gridEl[fiberKey] : null) as {
        type?: unknown;
        memoizedProps?: LibraryGridProps;
        return?: unknown;
      } | null;
      while (fiber && fiber.type !== LibraryGrid) {
        fiber = (fiber.return as typeof fiber) ?? null;
      }
      if (!fiber?.memoizedProps) {
        throw new Error('Could not locate LibraryGrid fiber memoizedProps');
      }
      return fiber.memoizedProps;
    };

    const prevProps = getLibraryGridProps();
    expect(typeof prevProps.onOpenStack).toBe('function');
    expect(typeof prevProps.onLaunch).toBe('function');
    expect(typeof prevProps.onOpenSaveEditor).toBe('function');
    expect(typeof prevProps.onMenuAction).toBe('function');
    expect(typeof prevProps.onFavoriteError).toBe('function');

    act(() => {
      store.updateGamePlaytime('g1', 60000);
      store.updateGame('g1', { favorite: true });
    });

    await waitFor(() => {
      expect(screen.getByText('1m')).toBeTruthy();
    });

    const nextProps = getLibraryGridProps();
    expect(Object.is(prevProps.onOpenStack, nextProps.onOpenStack)).toBe(true);
    expect(Object.is(prevProps.onLaunch, nextProps.onLaunch)).toBe(true);
    expect(Object.is(prevProps.onOpenSaveEditor, nextProps.onOpenSaveEditor)).toBe(true);
    expect(Object.is(prevProps.onMenuAction, nextProps.onMenuAction)).toBe(true);
    expect(Object.is(prevProps.onFavoriteError, nextProps.onFavoriteError)).toBe(true);
  });

  it('verifies stylesheet contracts in src/styles/base.css and src/styles/save-editor.css', () => {
    const baseCss = fs.readFileSync(path.resolve(process.cwd(), 'src/styles/base.css'), 'utf8');
    expect(baseCss).toContain('.primary-btn');
    expect(baseCss).toContain('.secondary-btn');
    expect(baseCss).toContain('var(--accent)');
    expect(baseCss).toContain('var(--border-color)');
    expect(baseCss).toContain('var(--text-main)');
    expect(baseCss).toContain('var(--hover-bg)');
    expect(baseCss).toContain('.app-error-boundary-fallback');
    expect(baseCss).toContain('.app-error-boundary-details');

    const saveEditorCss = fs.readFileSync(
      path.resolve(process.cwd(), 'src/styles/save-editor.css'),
      'utf8'
    );
    expect(saveEditorCss).toContain('.save-editor-panel .primary-btn');
    expect(saveEditorCss).toContain('.save-editor-overlay .primary-btn');
    expect(saveEditorCss).toContain('.save-editor-footer .primary-btn');
    expect(saveEditorCss).toContain('.save-editor-panel .secondary-btn');
    expect(saveEditorCss).toContain('.save-editor-overlay .secondary-btn');
    expect(saveEditorCss).toContain('.save-editor-footer .secondary-btn');
    // Zero unscoped top-level .primary-btn { or .secondary-btn {
    expect(saveEditorCss).not.toMatch(/^\s*\.primary-btn\s*\{/m);
    expect(saveEditorCss).not.toMatch(/^\s*\.secondary-btn\s*\{/m);
  });
});
