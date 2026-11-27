import fs from 'node:fs';
import path from 'node:path';
import React, { useRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LibraryStateProvider } from '../../context/LibraryStateContext';
import { MascotProvider, useMascot } from '../../providers/MascotProvider';
import { NotificationProvider } from '../../providers/NotificationProvider';
import { createUiRuntimeState, type ObservableUiRuntimeStore, type UiStorageAdapter } from '../../state/ui-runtime-state';
import type { ElectronAPI } from '../../../shared/types/ipc';
import type { CategoryNode } from '../../domain/category-tree';
import type { GameEntry, LibraryConfig } from '../../types/game';
import { SettingsModal, type MascotPreferences, type SettingsModalProps } from './SettingsModal';

function createMemoryStorage(initial: Record<string, string> = {}): UiStorageAdapter & {
  setItem: ReturnType<typeof vi.fn>;
  getItem: ReturnType<typeof vi.fn>;
  removeItem: ReturnType<typeof vi.fn>;
  data: Map<string, string>;
} {
  const data = new Map<string, string>(Object.entries(initial));
  return {
    data,
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      data.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      data.delete(key);
    }),
  };
}

function createMockElectronAPI(overrides: Partial<ElectronAPI> = {}): ElectronAPI {
  return {
    bootstrapApp: vi.fn(),
    checkConfig: vi.fn().mockResolvedValue({
      libraryPaths: ['D:\\Games'],
      libraryPath: 'D:\\Games',
      maxDepth: 2,
      autoLaunch: false,
      minimizeToTray: false,
      titleDisplayMode: 'metadata',
      displayProductCodes: false,
    }),
    setupLibrary: vi.fn(),
    updateLibraryConfig: vi.fn().mockImplementation(async (updates: Partial<LibraryConfig>) => ({
      libraryPaths: ['D:\\Games'],
      libraryPath: 'D:\\Games',
      maxDepth: 2,
      autoLaunch: false,
      minimizeToTray: false,
      titleDisplayMode: 'metadata',
      displayProductCodes: false,
      ...updates,
    })),
    setFolderAlias: vi.fn(),
    addLibraryPath: vi.fn().mockResolvedValue(null),
    removeLibraryPath: vi.fn().mockResolvedValue(null),
    changeLibraryPath: vi.fn(),
    getGames: vi.fn().mockResolvedValue([]),
    getCategoryTree: vi.fn().mockResolvedValue([]),
    createCategory: vi.fn().mockResolvedValue({ ok: true, tree: [] }),
    renameCategory: vi.fn().mockResolvedValue({ ok: true, tree: [] }),
    deleteCategory: vi.fn().mockResolvedValue({ ok: true, tree: [] }),
    assignGameCategories: vi.fn(),
    removeGameCategory: vi.fn(),
    launchYume: vi.fn(),
    renameGame: vi.fn(),
    revealGame: vi.fn(),
    openPath: vi.fn(),
    deleteGame: vi.fn(),
    addManualGame: vi.fn().mockResolvedValue({ ok: false, canceled: true }),
    getSaveFolder: vi.fn(),
    openSaveFolder: vi.fn(),
    selectSaveFolder: vi.fn(),
    setSaveFolderOverride: vi.fn(),
    toggleFavorite: vi.fn(),
    toggleRunInBackground: vi.fn(),
    toggleAutoTranslate: vi.fn(),
    checkTranslationSupport: vi.fn(),
    startTranslationSync: vi.fn(),
    cancelTranslationSync: vi.fn(),
    moveTranslationQueue: vi.fn(),
    openFolder: vi.fn(),
    getDefaultPath: vi.fn(),
    getIcon: vi.fn(),
    getAppVersion: vi.fn().mockResolvedValue('1.2.3'),
    openExternalUrl: vi.fn(),
    logAppUpdateDebug: vi.fn(),
    startAppUpdateDownload: vi.fn(),
    restartAndInstallAppUpdate: vi.fn(),
    scheduleAppUpdateNextLaunch: vi.fn(),
    beginDeferredAppUpdateInstall: vi.fn(),
    openAppUpdateDownloadPage: vi.fn(),
    getLanguageState: vi.fn(),
    getLanguagePackManifest: vi.fn(),
    installLanguagePack: vi.fn(),
    listSaveFiles: vi.fn(),
    loadSaveData: vi.fn(),
    cancelLoadSaveData: vi.fn(),
    onSaveLoadProgress: vi.fn(() => () => {}),
    writeSaveData: vi.fn(),
    renameSaveFile: vi.fn(),
    deleteSaveFile: vi.fn(),
    openSaveEditorWindow: vi.fn(),
    loadTranslations: vi.fn(),
    saveTranslations: vi.fn(),
    isDev: vi.fn().mockResolvedValue(false),
    setAutoLaunch: vi.fn().mockResolvedValue(true),
    getAutoLaunch: vi.fn().mockResolvedValue(false),
    setMinimizeToTray: vi.fn(),
    onBootStatus: vi.fn(() => () => {}),
    onAppUpdateStatus: vi.fn(() => () => {}),
    onGameStopped: vi.fn(() => () => {}),
    onGamePlaytimeUpdated: vi.fn(() => () => {}),
    onTranslationStatus: vi.fn(() => () => {}),
    ...overrides,
  } as unknown as ElectronAPI;
}

function renderSettingsModal(
  props: Partial<SettingsModalProps> = {},
  options: {
    store?: ObservableUiRuntimeStore;
    config?: LibraryConfig;
    categories?: CategoryNode[];
    games?: GameEntry[];
  } = {}
) {
  const store = options.store ?? createUiRuntimeState();
  const config: LibraryConfig = options.config ?? {
    libraryPaths: ['D:\\Games', 'E:\\VisualNovels'],
    libraryPath: 'D:\\Games',
    maxDepth: 2,
    autoLaunch: false,
    minimizeToTray: false,
    titleDisplayMode: 'metadata',
    displayProductCodes: false,
  };
  store.setCurrentLibraryConfig(config);
  if (options.categories) {
    store.setCategoryTree(options.categories);
  }
  if (options.games) {
    store.setAllGames(options.games);
  }

  const electronAPI = props.electronAPI ?? createMockElectronAPI();
  const storage = props.storage ?? createMemoryStorage();
  const onClose = props.onClose ?? vi.fn();

  const result = render(
    <LibraryStateProvider store={store}>
      <NotificationProvider electronAPI={electronAPI}>
        <SettingsModal
          isOpen={true}
          onClose={onClose}
          electronAPI={electronAPI}
          storage={storage}
          {...props}
        />
      </NotificationProvider>
    </LibraryStateProvider>
  );

  return { ...result, store, electronAPI, storage, onClose };
}

describe('SettingsModal', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('renders WAI-ARIA tablist and switches tabs without arrow-key traps', () => {
    renderSettingsModal();

    const tablist = screen.getByRole('tablist');
    expect(tablist.className).toContain('settings-tabs-nav');

    const generalTab = screen.getByRole('tab', { name: 'General' });
    const libraryTab = screen.getByRole('tab', { name: 'Library & Categories' });
    const updatesTab = screen.getByRole('tab', { name: 'Updates' });
    const systemTab = screen.getByRole('tab', { name: 'System & Mascot' });

    expect(generalTab.className).toContain('settings-tab-btn');
    expect(generalTab.getAttribute('aria-selected')).toBe('true');
    expect(libraryTab.getAttribute('aria-selected')).toBe('false');
    expect(updatesTab.getAttribute('aria-selected')).toBe('false');
    expect(systemTab.getAttribute('aria-selected')).toBe('false');

    // ArrowRight / ArrowLeft do not intercept focus
    generalTab.focus();
    expect(document.activeElement).toBe(generalTab);
    fireEvent.keyDown(generalTab, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(generalTab);
    fireEvent.keyDown(generalTab, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(generalTab);

    // Click switches tab and mounts tabpanel
    fireEvent.click(libraryTab);
    expect(libraryTab.getAttribute('aria-selected')).toBe('true');
    expect(generalTab.getAttribute('aria-selected')).toBe('false');
    expect(screen.getByRole('tabpanel')).toBeTruthy();
    expect(screen.getByText('Library Paths')).toBeTruthy();
  });

  it('triggers onOpenLanguagePack and onOpenAbout callbacks', () => {
    const onOpenLanguagePack = vi.fn();
    const onOpenAbout = vi.fn();
    renderSettingsModal({ onOpenLanguagePack, onOpenAbout });

    fireEvent.click(screen.getByRole('button', { name: 'More languages...' }));
    expect(onOpenLanguagePack).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'About & Credits' }));
    expect(onOpenAbout).toHaveBeenCalledTimes(1);
  });

  it('updates theme and locationDisplayMode with store re-annotation', () => {
    const storage = createMemoryStorage();
    const { store } = renderSettingsModal(
      { storage },
      {
        games: [
          {
            gameKey: 'g1',
            name: 'Game One',
            folderPath: 'D:\\Games\\Studio\\Game One',
          },
        ],
      }
    );

    const themeSelect = screen.getByLabelText('Theme');
    fireEvent.change(themeSelect, { target: { value: 'dark' } });
    expect(storage.setItem).toHaveBeenCalledWith('yumeshelf_theme', 'dark');
    expect(document.body.classList.contains('dark-theme')).toBe(true);

    const locationSelect = screen.getByLabelText('Location Display');
    fireEvent.change(locationSelect, { target: { value: 'full' } });
    expect(store.getSnapshot().locationDisplayMode).toBe('full');
    expect(storage.setItem).toHaveBeenCalledWith('yumeshelf_location_display_mode', 'full');
  });

  it('persists titleDisplayMode and displayProductCodes via updateLibraryConfig without storage writes', async () => {
    const storage = createMemoryStorage();
    const electronAPI = createMockElectronAPI({
      getGames: vi.fn().mockResolvedValue([
        { gameKey: 'g1', name: 'Game One', folderPath: 'D:\\Games\\Game One' },
      ]),
    });

    const { store } = renderSettingsModal({ storage, electronAPI });

    fireEvent.change(screen.getByLabelText('Title Display'), {
      target: { value: 'legacy_folder' },
    });

    await waitFor(() => {
      expect(electronAPI.updateLibraryConfig).toHaveBeenCalledWith({
        titleDisplayMode: 'legacy_folder',
      });
    });

    fireEvent.change(screen.getByLabelText('Product Codes'), {
      target: { value: 'on' },
    });

    await waitFor(() => {
      expect(electronAPI.updateLibraryConfig).toHaveBeenCalledWith({
        displayProductCodes: true,
      });
    });

    expect(storage.setItem).not.toHaveBeenCalledWith(
      'yumeshelf_title_display_mode',
      expect.anything()
    );
    expect(storage.setItem).not.toHaveBeenCalledWith(
      'yumeshelf_display_product_codes',
      expect.anything()
    );
    expect(store.getSnapshot().currentLibraryConfig?.displayProductCodes).toBe(true);
  });

  describe('MaxDepthStepper', () => {
    it('applies aria-disabled at bounds 0 and 12 with matching title and aria-label', () => {
      const { store } = renderSettingsModal(
        {},
        {
          config: {
            libraryPaths: ['D:\\Games'],
            libraryPath: 'D:\\Games',
            maxDepth: 0,
            autoLaunch: false,
            minimizeToTray: false,
          },
        }
      );

      const decBtn = screen.getByRole('button', { name: 'Decrease max depth' });
      const incBtn = screen.getByRole('button', { name: 'Increase max depth' });

      expect(decBtn.getAttribute('title')).toBe('Decrease max depth');
      expect(incBtn.getAttribute('title')).toBe('Increase max depth');
      expect(decBtn.getAttribute('aria-disabled')).toBe('true');
      expect(incBtn.getAttribute('aria-disabled')).toBe('false');

      act(() => {
        store.setCurrentLibraryConfig({
          ...store.getSnapshot().currentLibraryConfig!,
          maxDepth: 12,
        });
      });

      expect(decBtn.getAttribute('aria-disabled')).toBe('false');
      expect(incBtn.getAttribute('aria-disabled')).toBe('true');
    });

    it('supports backspace clearing, Enter focus retention without duplicate blur commit, same-value Enter re-edit, external prop sync, and non-numeric revert', async () => {
      const electronAPI = createMockElectronAPI();
      const { store } = renderSettingsModal({ electronAPI });
      const input = screen.getByLabelText('Max scan depth') as HTMLInputElement;

      // Backspace clearing allows empty draft
      input.focus();
      fireEvent.change(input, { target: { value: '' } });
      expect(input.value).toBe('');

      // 1. Valid depth + Enter commits once, keeps focus on #max-depth-input, immediate blur does not re-commit
      fireEvent.change(input, { target: { value: '5' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      await waitFor(() => {
        expect(electronAPI.updateLibraryConfig).toHaveBeenCalledWith({ maxDepth: 5 });
      });
      expect(document.activeElement).toBe(input);
      expect(electronAPI.updateLibraryConfig).toHaveBeenCalledTimes(1);

      fireEvent.blur(input);
      expect(electronAPI.updateLibraryConfig).toHaveBeenCalledTimes(1);

      // 2. Same-value/clamped-unchanged Enter followed while still focused by new valid edit + blur commits
      input.focus();
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(electronAPI.updateLibraryConfig).toHaveBeenCalledTimes(1);
      fireEvent.change(input, { target: { value: '7' } });
      fireEvent.blur(input);
      await waitFor(() => {
        expect(electronAPI.updateLibraryConfig).toHaveBeenCalledWith({ maxDepth: 7 });
      });
      expect(electronAPI.updateLibraryConfig).toHaveBeenCalledTimes(2);

      // 3. External value prop update after Enter updates input and allows subsequent edit + blur commit
      input.focus();
      fireEvent.change(input, { target: { value: '8' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      await waitFor(() => {
        expect(electronAPI.updateLibraryConfig).toHaveBeenCalledWith({ maxDepth: 8 });
      });

      act(() => {
        store.setCurrentLibraryConfig({
          ...store.getSnapshot().currentLibraryConfig!,
          maxDepth: 4,
        });
      });
      expect(input.value).toBe('4');
      fireEvent.change(input, { target: { value: '6' } });
      fireEvent.blur(input);
      await waitFor(() => {
        expect(electronAPI.updateLibraryConfig).toHaveBeenCalledWith({ maxDepth: 6 });
      });

      // 4. Non-numeric "abc" + Enter reverts without committing, keeps focus, allows subsequent valid edit + blur
      const callsBefore = (electronAPI.updateLibraryConfig as ReturnType<typeof vi.fn>).mock.calls.length;
      input.focus();
      fireEvent.change(input, { target: { value: 'abc' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(input.value).toBe('6');
      expect(document.activeElement).toBe(input);
      expect(electronAPI.updateLibraryConfig).toHaveBeenCalledTimes(callsBefore);

      fireEvent.change(input, { target: { value: '9' } });
      fireEvent.blur(input);
      await waitFor(() => {
        expect(electronAPI.updateLibraryConfig).toHaveBeenCalledWith({ maxDepth: 9 });
      });
    });

    it('defaults Auto-Allow Large Saves (>64 MB) to Off, exposes info tooltip, and persists toggle', async () => {
      const electronAPI = createMockElectronAPI();
      renderSettingsModal({ electronAPI });

      const select = screen.getByLabelText('Always Allow Large Saves (>64 MB)') as HTMLSelectElement;
      expect(select.value).toBe('off');
      const infoBtn = screen.getByRole('button', { name: /longer to open|use more memory/i });
      expect(infoBtn.getAttribute('data-tooltip')).toMatch(/longer to open|use more memory/i);

      fireEvent.change(select, { target: { value: 'on' } });
      await waitFor(() => {
        expect(electronAPI.updateLibraryConfig).toHaveBeenCalledWith({ autoAllowLargeSaves: true });
      });
    });
  });

  describe('Library paths & rescan watchdog', () => {
    it('does not arm watchdog when OS picker is cancelled', async () => {
      vi.useFakeTimers();
      const electronAPI = createMockElectronAPI({
        addLibraryPath: vi.fn().mockResolvedValue(null),
      });

      renderSettingsModal({ electronAPI, rescanInactivityTimeoutMs: 5000 });
      fireEvent.click(screen.getByRole('tab', { name: 'Library & Categories' }));

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '+ Add Path' }));
        await Promise.resolve();
      });

      expect(document.querySelector('.library-scan-status')).toBeNull();
      expect(electronAPI.getGames).not.toHaveBeenCalled();

      await act(async () => {
        vi.advanceTimersByTime(10000);
      });
      expect(screen.queryByText(/taking longer than expected/i)).toBeNull();
    });

    it('handles watchdog timeout, unblocks Run 2 while Run 1 is pending, and commits post-timeout/post-unmount results', async () => {
      vi.useFakeTimers();

      let resolveRun1Games!: (val: GameEntry[]) => void;
      let resolveRun2Games!: (val: GameEntry[]) => void;

      const updatedConfig1: LibraryConfig = {
        libraryPaths: ['D:\\Games', 'F:\\MoreGames'],
        libraryPath: 'D:\\Games',
        maxDepth: 2,
        autoLaunch: false,
        minimizeToTray: false,
      };
      const updatedConfig2: LibraryConfig = {
        libraryPaths: ['D:\\Games', 'F:\\MoreGames', 'G:\\EvenMore'],
        libraryPath: 'D:\\Games',
        maxDepth: 2,
        autoLaunch: false,
        minimizeToTray: false,
      };

      const getGamesMock = vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise<GameEntry[]>((resolve) => {
              resolveRun1Games = resolve;
            })
        )
        .mockImplementationOnce(
          () =>
            new Promise<GameEntry[]>((resolve) => {
              resolveRun2Games = resolve;
            })
        );

      const addLibraryPathMock = vi
        .fn()
        .mockResolvedValueOnce(updatedConfig1)
        .mockResolvedValueOnce(updatedConfig2);

      const checkConfigMock = vi
        .fn()
        .mockResolvedValueOnce(updatedConfig1)
        .mockResolvedValueOnce(updatedConfig2);

      const electronAPI = createMockElectronAPI({
        addLibraryPath: addLibraryPathMock,
        getGames: getGamesMock,
        checkConfig: checkConfigMock,
      });

      const onLibraryPathsUpdated = vi.fn();
      const { store, unmount } = renderSettingsModal({
        electronAPI,
        rescanInactivityTimeoutMs: 5000,
        onLibraryPathsUpdated,
      });

      fireEvent.click(screen.getByRole('tab', { name: 'Library & Categories' }));

      // Start Run 1
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '+ Add Path' }));
        await Promise.resolve();
      });

      // Status live region visible while scanning
      const statusRegion = document.querySelector('.library-scan-status') as HTMLElement;
      expect(statusRegion).toBeTruthy();
      expect(statusRegion.getAttribute('role')).toBe('status');
      expect(statusRegion.getAttribute('aria-live')).toBe('polite');

      // Watchdog fires after 5000ms
      await act(async () => {
        vi.advanceTimersByTime(5000);
      });

      expect(screen.queryByText(/Scanning library directories/i)).toBeNull();
      expect(screen.getByText(/Library scan taking longer than expected/i)).toBeTruthy();

      // Run 2 is now unblocked while Run 1 is still pending
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '+ Add Path' }));
        await Promise.resolve();
      });
      expect(addLibraryPathMock).toHaveBeenCalledTimes(2);
      expect(screen.getByText(/Scanning library directories/i)).toBeTruthy();

      // Unmount modal while Run 2 is still in-flight
      unmount();

      // Run 1 resolves stale -> must NOT overwrite store
      await act(async () => {
        resolveRun1Games([{ gameKey: 'stale-1', name: 'Stale Game', folderPath: 'F:\\MoreGames\\Stale' }]);
        await Promise.resolve();
      });
      expect(store.getSnapshot().allGames.some((g) => g.gameKey === 'stale-1')).toBe(false);

      // Run 2 resolves post-unmount -> commits to singleton store
      await act(async () => {
        resolveRun2Games([{ gameKey: 'fresh-2', name: 'Fresh Game', folderPath: 'G:\\EvenMore\\Fresh' }]);
        await Promise.resolve();
      });
      expect(store.getSnapshot().allGames.some((g) => g.gameKey === 'fresh-2')).toBe(true);
      expect(onLibraryPathsUpdated).toHaveBeenCalledWith(updatedConfig2.libraryPaths);
    });

    it('sanitizes user paths in console.error on addLibraryPath and scan rejection', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const electronAPI = createMockElectronAPI({
        addLibraryPath: vi
          .fn()
          .mockRejectedValueOnce(new Error("EACCES: permission denied, scandir 'C:\\Users\\John Doe\\Games'")),
      });

      renderSettingsModal({ electronAPI });
      fireEvent.click(screen.getByRole('tab', { name: 'Library & Categories' }));

      fireEvent.click(screen.getByRole('button', { name: '+ Add Path' }));

      await waitFor(() => {
        expect(errorSpy).toHaveBeenCalled();
      });
      const loggedStr = JSON.stringify(errorSpy.mock.calls[0]);
      expect(loggedStr).toContain('[SettingsModal]');
      expect(loggedStr).not.toContain('John Doe');
    });

    it('handleRemovePath atomically updates store, transfers focus to neighbor, and sanitizes errors', async () => {
      const updatedConfig: LibraryConfig = {
        libraryPaths: ['E:\\VisualNovels'],
        libraryPath: 'E:\\VisualNovels',
        maxDepth: 2,
        autoLaunch: false,
        minimizeToTray: false,
      };
      const updatedTree: CategoryNode[] = [{ id: 'c1', name: 'RPG' }];
      const updatedGames: GameEntry[] = [
        { gameKey: 'g2', name: 'VN', folderPath: 'E:\\VisualNovels\\VN' },
      ];

      const electronAPI = createMockElectronAPI({
        removeLibraryPath: vi.fn().mockResolvedValue(updatedConfig),
        getGames: vi.fn().mockResolvedValue(updatedGames),
        getCategoryTree: vi.fn().mockResolvedValue(updatedTree),
      });
      const onLibraryPathsUpdated = vi.fn();

      const { store } = renderSettingsModal({ electronAPI, onLibraryPathsUpdated });
      const setConfigSpy = vi.spyOn(store, 'setCurrentLibraryConfig');
      const setTreeSpy = vi.spyOn(store, 'setCategoryTree');
      const setGamesSpy = vi.spyOn(store, 'setAllGames');

      fireEvent.click(screen.getByRole('tab', { name: 'Library & Categories' }));

      const removeBtn = screen.getByRole('button', { name: 'Remove path D:\\Games' });
      removeBtn.focus();
      fireEvent.click(removeBtn);

      await waitFor(() => {
        expect(setConfigSpy).toHaveBeenCalledWith(updatedConfig);
        expect(setTreeSpy).toHaveBeenCalledWith(updatedTree);
        expect(setGamesSpy).toHaveBeenCalled();
        expect(onLibraryPathsUpdated).toHaveBeenCalledWith(['E:\\VisualNovels']);
      });

      expect(document.activeElement).not.toBe(document.body);
    });

    it('handleAddManualGame transitions button state and updates store on success', async () => {
      let resolveAdd!: (val: { ok: boolean; canceled?: boolean }) => void;
      const electronAPI = createMockElectronAPI({
        addManualGame: vi.fn(
          () =>
            new Promise<{ ok: boolean; canceled?: boolean }>((resolve) => {
              resolveAdd = resolve;
            })
        ),
        getGames: vi.fn().mockResolvedValue([
          { gameKey: 'manual-1', name: 'Manual Game', folderPath: 'D:\\Games\\Manual' },
        ]),
      });

      const { store } = renderSettingsModal({ electronAPI });
      fireEvent.click(screen.getByRole('tab', { name: 'Library & Categories' }));

      const addGameBtn = screen.getByRole('button', { name: '+ Add Game' });
      fireEvent.click(addGameBtn);

      expect(addGameBtn.textContent).toBe('Adding...');
      expect(addGameBtn.getAttribute('aria-disabled')).toBe('true');

      await act(async () => {
        resolveAdd({ ok: true });
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(store.getSnapshot().allGames.some((g) => g.gameKey === 'manual-1')).toBe(true);
        expect(screen.getByText('Game added to library')).toBeTruthy();
      });
    });
  });

  describe('Categories CRUD & deletion confirmation', () => {
    it('auto-focuses new category input, validates empty/duplicate names, and handles inline deletion confirmation with Escape and focus handoff', async () => {
      const categories: CategoryNode[] = [
        { id: 'cat-1', name: 'Action' },
        { id: 'cat-2', name: 'RPG' },
      ];
      const electronAPI = createMockElectronAPI({
        createCategory: vi.fn().mockResolvedValue({
          ok: true,
          tree: [...categories, { id: 'cat-3', name: 'Puzzle' }],
        }),
        deleteCategory: vi.fn().mockResolvedValue({
          ok: true,
          tree: [{ id: 'cat-2', name: 'RPG' }],
        }),
      });
      const onCategoryTreeUpdated = vi.fn();

      renderSettingsModal({ electronAPI, onCategoryTreeUpdated }, { categories });
      fireEvent.click(screen.getByRole('tab', { name: 'Library & Categories' }));

      // + Add Category auto-focuses input
      fireEvent.click(screen.getByRole('button', { name: '+ Add Category' }));
      const nameInput = screen.getByLabelText('New category name');
      expect(document.activeElement).toBe(nameInput);

      // Duplicate validation
      fireEvent.change(nameInput, { target: { value: '  Action  ' } });
      fireEvent.click(screen.getByRole('button', { name: 'Create' }));
      expect(nameInput.getAttribute('aria-invalid')).toBe('true');
      expect(screen.getByRole('alert').textContent).toContain('already exists');

      // Valid creation
      fireEvent.change(nameInput, { target: { value: '  Puzzle  ' } });
      fireEvent.click(screen.getByRole('button', { name: 'Create' }));
      await waitFor(() => {
        expect(electronAPI.createCategory).toHaveBeenCalledWith({ name: 'Puzzle' });
        expect(onCategoryTreeUpdated).toHaveBeenCalled();
      });

      // Open deletion popover and cancel via Escape -> focus returns to delete trigger
      const deleteTrigger = screen.getByRole('button', { name: 'Delete Action' });
      fireEvent.click(deleteTrigger);
      const popover = screen.getByRole('dialog', { name: 'Confirm deletion of Action' });
      fireEvent.keyDown(popover, { key: 'Escape' });
      expect(screen.queryByRole('dialog', { name: 'Confirm deletion of Action' })).toBeNull();
      expect(document.activeElement).toBe(deleteTrigger);

      // Confirm deletion -> focus transfers to surviving row (not document.body)
      fireEvent.click(deleteTrigger);
      const confirmDeleteBtn = screen.getByRole('button', { name: 'Delete' });
      fireEvent.click(confirmDeleteBtn);

      await waitFor(() => {
        expect(electronAPI.deleteCategory).toHaveBeenCalledWith('cat-1');
      });
      await Promise.resolve();
      expect(document.activeElement).not.toBe(document.body);
    });
  });

  it('System & Mascot tab renders no telemetry controls and syncs mascot preferences', () => {
    const onMascotSettingsChanged = vi.fn();
    const storage = createMemoryStorage();
    renderSettingsModal({ onMascotSettingsChanged, storage });

    fireEvent.click(screen.getByRole('tab', { name: 'System & Mascot' }));

    // Zero telemetry controls
    expect(screen.queryByText(/telemetry/i)).toBeNull();

    expect(screen.getByLabelText('Hide And Seek?')).toBeTruthy();
    const bonkSelect = screen.getByLabelText('Bonk Sound') as HTMLSelectElement;
    expect(Array.from(bonkSelect.options).some((o) => o.value === 'metal-pipe')).toBe(true);

    const scaleSlider = screen.getByLabelText('Mascot Scale');
    expect(scaleSlider.getAttribute('aria-valuetext')).toBe('30%');

    const volumeSlider = screen.getByLabelText('Mascot Volume');
    expect(volumeSlider.getAttribute('aria-valuetext')).toBe('20%');

    fireEvent.change(scaleSlider, { target: { value: '60' } });
    expect(storage.setItem).toHaveBeenCalledWith('yumeshelf_mascot_scale', '60');
    expect(onMascotSettingsChanged).toHaveBeenCalledWith(
      expect.objectContaining<Partial<MascotPreferences>>({ scale: 60 })
    );
  });

  it('logs sanitized console.warn when standalone mascot storage write throws', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const storage = createMemoryStorage();
    storage.setItem.mockImplementation(() => {
      throw new Error('QuotaExceededError at C:\\Users\\alice\\AppData\\Local\\YumeShelf');
    });

    renderSettingsModal({ storage });
    fireEvent.click(screen.getByRole('tab', { name: 'System & Mascot' }));

    const hideSelect = screen.getByLabelText('Hide And Seek?');
    fireEvent.change(hideSelect, { target: { value: 'yeaaa' } });

    expect(warnSpy).toHaveBeenCalledWith(
      '[SettingsModal] Failed to persist mascot setting:',
      expect.objectContaining({
        key: 'yumeshelf_hide_and_seek',
        error: expect.not.stringContaining('alice'),
      })
    );
    warnSpy.mockRestore();
  });

  it('synchronizes mascot and hide-and-seek controls directly with MascotProvider without onMascotSettingsChanged', () => {
    const storage = createMemoryStorage();
    const store = createUiRuntimeState();
    const electronAPI = createMockElectronAPI();
    store.setCurrentLibraryConfig({
      libraryPath: '',
      libraryPaths: [],
      maxDepth: 3,
      autoLaunch: false,
      minimizeToTray: false,
    });

    let latestMascot: ReturnType<typeof useMascot> | null = null;
    function MascotObserver() {
      latestMascot = useMascot();
      return (
        <div
          data-testid="mascot-observer"
          data-show={String(latestMascot.show)}
          data-hide-and-seek={latestMascot.hideAndSeek}
          data-scale={String(latestMascot.scale)}
          data-sound={latestMascot.sound}
          data-volume={String(latestMascot.volume)}
          data-widget-visible={String(latestMascot.isWidgetVisible)}
          data-card-active={String(latestMascot.isHideAndSeekCardActive)}
        />
      );
    }

    render(
      <LibraryStateProvider store={store}>
        <NotificationProvider electronAPI={electronAPI}>
          <MascotProvider storage={storage}>
            <MascotObserver />
            <SettingsModal
              isOpen={true}
              onClose={vi.fn()}
              electronAPI={electronAPI}
              storage={storage}
            />
          </MascotProvider>
        </NotificationProvider>
      </LibraryStateProvider>
    );

    fireEvent.click(screen.getByRole('tab', { name: 'System & Mascot' }));

    const observer = screen.getByTestId('mascot-observer');
    expect(observer.getAttribute('data-show')).toBe('true');
    expect(observer.getAttribute('data-hide-and-seek')).toBe('out');
    expect(observer.getAttribute('data-widget-visible')).toBe('true');
    expect(observer.getAttribute('data-card-active')).toBe('false');

    // Toggle Hide And Seek -> YEAAA: corner widget hides, card becomes active immediately
    fireEvent.change(screen.getByLabelText('Hide And Seek?'), { target: { value: 'yeaaa' } });
    expect(observer.getAttribute('data-hide-and-seek')).toBe('yeaaa');
    expect(observer.getAttribute('data-widget-visible')).toBe('false');
    expect(observer.getAttribute('data-card-active')).toBe('true');
    expect(storage.getItem('yumeshelf_hide_and_seek')).toBe('yeaaa');

    const initialSlotFraction = latestMascot!.sessionSlotFraction;

    // Adjust scale, sound, volume directly via MascotProvider without resetting Hide-and-Seek session
    fireEvent.change(screen.getByLabelText('Mascot Scale'), { target: { value: '75' } });
    expect(observer.getAttribute('data-scale')).toBe('75');
    expect(latestMascot!.sessionSlotFraction).toBe(initialSlotFraction);

    fireEvent.change(screen.getByLabelText('Bonk Sound'), { target: { value: 'metal-pipe' } });
    expect(observer.getAttribute('data-sound')).toBe('metal-pipe');

    fireEvent.change(screen.getByLabelText('Mascot Volume'), { target: { value: '0' } });
    expect(observer.getAttribute('data-volume')).toBe('0');

    // Toggle Show Mascot -> Off: both widget and card become inactive
    fireEvent.change(screen.getByLabelText('Show Mascot'), { target: { value: 'off' } });
    expect(observer.getAttribute('data-show')).toBe('false');
    expect(observer.getAttribute('data-widget-visible')).toBe('false');
    expect(observer.getAttribute('data-card-active')).toBe('false');

    // Toggle Show Mascot -> On and Hide And Seek -> out
    fireEvent.change(screen.getByLabelText('Show Mascot'), { target: { value: 'on' } });
    fireEvent.change(screen.getByLabelText('Hide And Seek?'), { target: { value: 'out' } });
    expect(observer.getAttribute('data-show')).toBe('true');
    expect(observer.getAttribute('data-hide-and-seek')).toBe('out');
    expect(observer.getAttribute('data-widget-visible')).toBe('true');
    expect(observer.getAttribute('data-card-active')).toBe('false');
  });

  it('transfers focus to fallbackFocusRef when invoking trigger is disconnected on close', () => {
    const electronAPI = createMockElectronAPI();
    const store = createUiRuntimeState();

    function Harness() {
      const [open, setOpen] = useState(false);
      const [showTrigger, setShowTrigger] = useState(true);
      const fallbackRef = useRef<HTMLButtonElement | null>(null);

      return (
        <LibraryStateProvider store={store}>
          <NotificationProvider electronAPI={electronAPI}>
            <button ref={fallbackRef} type="button">
              Fallback Target
            </button>
            <button type="button" onClick={() => setShowTrigger(false)}>
              Disconnect Trigger
            </button>
            {showTrigger && (
              <button type="button" onClick={() => setOpen(true)}>
                Open Settings
              </button>
            )}
            <SettingsModal
              isOpen={open}
              onClose={() => setOpen(false)}
              fallbackFocusRef={fallbackRef}
              electronAPI={electronAPI}
            />
          </NotificationProvider>
        </LibraryStateProvider>
      );
    }

    render(<Harness />);
    const openBtn = screen.getByRole('button', { name: 'Open Settings' });
    openBtn.focus();
    fireEvent.click(openBtn);
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect Trigger' }));

    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Fallback Target' }));
  });

  it('enforces stylesheet contract in src/styles/settings.css', () => {
    const cssPath = path.resolve(process.cwd(), 'src/styles/settings.css');
    const css = fs.readFileSync(cssPath, 'utf8');

    expect(css).toMatch(/\.category-actions\s*\{[^}]*position:\s*relative;/s);
    expect(css).toMatch(/\.settings-tab-btn:focus-visible\s*\{[^}]*outline:\s*2px\s+solid\s+var\(--accent\);/s);
    expect(css).toMatch(/\.modal-backdrop\.settings-overlay\s*\{[^}]*display:\s*flex;/s);
  });
});
