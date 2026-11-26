import fs from 'node:fs';
import path from 'node:path';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ElectronAPI } from '../shared/types/ipc';
import type { CategoryNode } from './domain/category-tree';
import { createUiRuntimeState, type UiStorageAdapter } from './state/ui-runtime-state';
import type { GameEntry, LibraryConfig } from './types/game';
import enLocale from '../locales/builtins/en.json';
import { App } from './App';

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

describe('App root shell', () => {
  beforeEach(() => {
    document.body.className = '';
    vi.restoreAllMocks();
  });

  it('migrates legacy unversioned preferences prior to store instantiation and applies theme synchronously', async () => {
    const storage = createMockStorage({
      yumeshelf_sort_pref: 'rj',
      yumeshelf_theme: 'light',
    });
    const api = createMockElectronAPI();

    render(<App electronAPI={api} storage={storage} />);

    expect(storage.getItem('yumeshelf_sort_pref')).toBe('date');
    expect(storage.getItem('yumeshelf_storage_version')).toBe('1');
    expect(document.body.classList.contains('light-theme')).toBe(true);

    await waitFor(() => {
      expect(screen.getByRole('banner')).toBeInTheDocument();
    });
  });

  it('renders loading overlay on initial frame and transitions to hydrated Header on success', async () => {
    const deferred = createDeferred<{ config: LibraryConfig; games: GameEntry[]; categoryTree: CategoryNode[] }>();
    const storage = createMockStorage();
    const store = createUiRuntimeState(storage);
    const api = createMockElectronAPI({
      bootstrapApp: vi.fn().mockReturnValue(deferred.promise),
    });

    const { container } = render(<App store={store} electronAPI={api} storage={storage} />);

    const loadingOverlay = screen.getByRole('status');
    expect(loadingOverlay).toHaveClass('loading-overlay');
    expect(loadingOverlay).toHaveAttribute('tabindex', '-1');
    expect(document.activeElement).toBe(loadingOverlay);
    expect(container.querySelector('.loading-panel')).toBeInTheDocument();
    expect(container.querySelector('.loading-copy .loading-title')).toHaveTextContent('Starting YumeShelf');
    expect(container.querySelector('.app-loading-skeleton')).not.toBeInTheDocument();

    deferred.resolve({
      config: SAMPLE_CONFIG,
      games: SAMPLE_GAMES,
      categoryTree: SAMPLE_TREE,
    });

    await waitFor(() => {
      expect(screen.getByRole('banner')).toBeInTheDocument();
    });
    expect(store.getSnapshot().allGames).toHaveLength(1);
  });

  it('renders installing-update overlay with data-mode="update" and .loading-progress-track inside .loading-copy', async () => {
    const storage = createMockStorage();
    const api = createMockElectronAPI({
      bootstrapApp: vi.fn().mockResolvedValue({
        config: null,
        games: [],
        categoryTree: [],
        deferredAppUpdateInstall: {
          pending: true,
          statusText: 'Extracting update files...',
        },
      }),
      beginDeferredAppUpdateInstall: vi.fn().mockResolvedValue({ launched: true }),
    });

    const { container } = render(<App electronAPI={api} storage={storage} />);

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveAttribute('data-mode', 'update');
    });

    const copyEl = container.querySelector('.loading-copy');
    expect(copyEl).toBeInTheDocument();
    expect(copyEl?.querySelector('.loading-title')).toHaveTextContent('Installing Update');
    expect(copyEl?.querySelector('.loading-status')).toHaveTextContent('Extracting update files...');
    expect(copyEl?.querySelector('.loading-progress-track .loading-progress-bar')).toBeInTheDocument();
  });

  it('renders sanitized Windows and POSIX error messages, auto-focuses Retry, and reclaims focus on loading overlay after Retry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const storage = createMockStorage();
    const retryDeferred = createDeferred<{ config: LibraryConfig; games: GameEntry[]; categoryTree: CategoryNode[] }>();

    const bootstrapApp = vi
      .fn()
      .mockRejectedValueOnce(new Error('Cannot read C:\\Users\\JaneDoe\\Documents\\shelf.json'))
      .mockReturnValueOnce(retryDeferred.promise);

    const api = createMockElectronAPI({ bootstrapApp });
    const { container } = render(<App electronAPI={api} storage={storage} />);

    const alertEl = await screen.findByRole('alert');
    expect(alertEl).toHaveClass('loading-overlay');
    const copyEl = container.querySelector('.loading-copy');
    expect(copyEl?.querySelector('.loading-title')).toHaveTextContent('Startup Failed');
    expect(copyEl?.querySelector('.loading-status')).toHaveTextContent('<USER_DIR>');
    expect(copyEl?.querySelector('.loading-status')?.textContent).not.toContain('JaneDoe');

    const retryBtn = copyEl?.querySelector('.loading-actions button.primary-btn') as HTMLButtonElement;
    expect(retryBtn).toBeInTheDocument();
    expect(document.activeElement).toBe(retryBtn);

    fireEvent.click(retryBtn);

    await waitFor(() => {
      const loadingOverlay = screen.getByRole('status');
      expect(document.activeElement).toBe(loadingOverlay);
    });

    // Also verify POSIX path sanitization
    const posixApi = createMockElectronAPI({
      bootstrapApp: vi.fn().mockRejectedValue(new Error('Cannot read /home/janedoe/games/shelf.json')),
    });
    const { container: posixContainer } = render(<App electronAPI={posixApi} storage={createMockStorage()} />);
    await waitFor(() => {
      const statusText = posixContainer.querySelector('.loading-status')?.textContent ?? '';
      expect(statusText).toContain('<USER_DIR>');
      expect(statusText).not.toContain('janedoe');
    });
  });

  it('forwards onRefreshLibrary and isRefreshing to Header and invokes onRefreshError on rescan rejection', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const onRefreshError = vi.fn();
    const storage = createMockStorage();
    const api = createMockElectronAPI({
      getGames: vi.fn().mockRejectedValue(new Error('Rescan I/O failure')),
    });

    render(<App electronAPI={api} storage={storage} onRefreshError={onRefreshError} />);

    await waitFor(() => {
      expect(screen.getByRole('banner')).toBeInTheDocument();
    });

    const refreshBtn = screen.getByRole('button', { name: /refresh library/i });
    fireEvent.click(refreshBtn);

    await waitFor(() => {
      expect(onRefreshError).toHaveBeenCalledTimes(1);
    });
    expect(onRefreshError.mock.calls[0][0].message).toBe('Rescan I/O failure');
  });

  it('satisfies stylesheet contracts in base.css, boot.css, and save-editor.css', () => {
    const rootDir = path.resolve(__dirname, '../..');
    const baseCss = fs.readFileSync(path.join(rootDir, 'src/styles/base.css'), 'utf8');
    const bootCss = fs.readFileSync(path.join(rootDir, 'src/styles/boot.css'), 'utf8');
    const saveEditorCss = fs.readFileSync(path.join(rootDir, 'src/styles/save-editor.css'), 'utf8');

    // base.css contracts
    expect(baseCss).toContain('.primary-btn');
    expect(baseCss).toContain('.secondary-btn');
    expect(baseCss).toContain('var(--accent)');
    expect(baseCss).toContain('var(--border-color)');
    expect(baseCss).toContain('var(--text-main)');
    expect(baseCss).toContain('var(--hover-bg)');

    // save-editor.css contracts: scoped button rules, no unscoped top-level .primary-btn { / .secondary-btn {, no --accent-color inside those button rules
    const primaryBtnBlockMatch = saveEditorCss.match(/\.save-editor-panel\s+\.primary-btn[\s\S]*?\}/);
    expect(primaryBtnBlockMatch).not.toBeNull();
    expect(primaryBtnBlockMatch![0]).toContain('var(--accent)');
    expect(primaryBtnBlockMatch![0]).not.toContain('--accent-color');
    expect(saveEditorCss).toMatch(/\.save-editor-overlay\s+\.primary-btn/);
    expect(saveEditorCss).toMatch(/\.save-editor-footer\s+\.primary-btn/);
    expect(saveEditorCss).not.toMatch(/^\.primary-btn\s*\{/m);
    expect(saveEditorCss).not.toMatch(/^\.secondary-btn\s*\{/m);

    // boot.css contracts: reduced motion suppression
    expect(bootCss).toContain('.loading-actions');
    expect(bootCss).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
    expect(bootCss).toMatch(/\.loading-spinner[\s\S]*?\.loading-progress-bar[\s\S]*?animation:\s*none/);
  });

  it('displays localized ToastPill via NotificationProvider when folder rename returns outside-library in folder sort mode', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const storage = createMockStorage({ yumeshelf_sort_pref: 'folder' });
    const api = createMockElectronAPI({
      bootstrapApp: vi.fn().mockResolvedValue({
        config: {
          ...SAMPLE_CONFIG,
          libraryPath: 'D:\\Games',
          libraryPaths: ['D:\\Games'],
        },
        games: [
          {
            ...SAMPLE_GAMES[0],
            folderPath: 'D:\\Games\\RPG\\Alpha',
          },
        ],
        categoryTree: SAMPLE_TREE,
      }),
      setFolderAlias: vi.fn().mockResolvedValue({ ok: false, error: 'outside-library' }),
    });

    render(<App electronAPI={api} storage={storage} />);

    const heading = await screen.findByRole('heading', { level: 3, name: 'Games' });
    fireEvent.click(heading);

    const input = document.querySelector<HTMLInputElement>('.rename-input')!;
    fireEvent.change(input, { target: { value: 'My Games' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent(enLocale.strings.error_outside_library);
  });

  it('shows Launching ToastPill for both main library card double-click and search dropdown double-click without closing search dropdown', async () => {
    const launchYume = vi.fn();
    const api = createMockElectronAPI({ launchYume });
    const storage = createMockStorage();

    const { container } = render(<App electronAPI={api} storage={storage} />);

    // 1. Main library card double-click triggers launchYume + Launching toast
    const card = await screen.findByRole('article');
    fireEvent.doubleClick(card);

    expect(launchYume).toHaveBeenCalledTimes(1);
    expect(launchYume).toHaveBeenCalledWith({
      gameKey: 'main::rpg/alpha',
      exePath: 'D:\\Games\\RPG\\Alpha\\Game.exe',
      runInBackground: undefined,
    });
    const expectedToast = enLocale.strings.launching_game.replace('{name}', 'Alpha Quest');
    expect((await screen.findByText(expectedToast)).closest('[role="status"]')).toBeTruthy();

    // Dismiss first toast so search-launch toast is verified independently
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    expect(screen.queryByText(expectedToast)).toBeNull();

    // 2. Search dropdown: single-click animates without launching; double-click launches + shows toast while keeping dropdown open
    const searchInput = screen.getByRole('textbox', { name: 'Search library games' }) as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: 'Alpha' } });

    const searchItem = await screen.findByRole('listitem');
    fireEvent.click(searchItem);
    expect(launchYume).toHaveBeenCalledTimes(1);
    expect(searchItem.classList.contains('is-clicked')).toBe(true);
    expect(container.querySelector('.search-dropdown.show')).toBeTruthy();

    fireEvent.doubleClick(searchItem);
    expect(launchYume).toHaveBeenCalledTimes(2);
    expect(searchInput.value).toBe('Alpha');
    expect(container.querySelector('.search-dropdown.show')).toBeTruthy();
    expect((await screen.findByText(expectedToast)).closest('[role="status"]')).toBeTruthy();
  });
});
