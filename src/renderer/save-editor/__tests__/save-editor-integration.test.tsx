import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  NormalizedSaveDto,
  SaveFieldDto,
  SaveUpdatesPayload,
} from '@yumeshelf/engine/types';
import type { ElectronAPI, SaveFolderInfo } from '../../../shared/types/ipc';
import { bootstrapStandaloneSaveEditor, mountStandaloneSaveEditor } from '../../../save-editor';
import { resetLocaleCacheForTests } from '../../i18n/locale-strings';
import { SaveEditorApp } from '../SaveEditorApp';
import { createSaveEditorStore, type ObservableSaveEditorStore } from '../store/save-editor-store';

const flushPromises = async () => {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve();
  }
};

function createCanonicalSaveDto(overrides: Partial<NormalizedSaveDto> = {}): NormalizedSaveDto {
  const variableFields: SaveFieldDto[] = [
    { id: 'variables:1', tabId: 'variables', key: '1', label: 'Gold', value: 500, type: 'number' },
    { id: 'variables:2', tabId: 'variables', key: '2', label: 'Hero Name', value: 'Harold', type: 'string' },
    ...Array.from({ length: 23 }, (_, idx) => {
      const varNum = idx + 3;
      return {
        id: `variables:${varNum}`,
        tabId: 'variables',
        key: String(varNum),
        label: `Variable ${varNum}`,
        value: varNum * 10,
        type: 'number' as const,
      };
    }),
  ];

  const switchFields: SaveFieldDto[] = [
    { id: 'switches:1', tabId: 'switches', key: '1', label: 'Intro Watched', value: true, type: 'boolean' },
    { id: 'switches:2', tabId: 'switches', key: '2', label: 'Boss Cleared', value: false, type: 'boolean' },
  ];

  const fields = overrides.fields ?? [...variableFields, ...switchFields];
  return {
    gameKey: 'test-game',
    fileName: 'save01.sav',
    strategy: 'rpg-maker-mv',
    tabs: overrides.tabs ?? [
      { id: 'variables', label: 'Variables', count: variableFields.length },
      { id: 'switches', label: 'Switches', count: switchFields.length },
    ],
    fields,
    ...overrides,
  };
}

function createMockElectronAPI(overrides: Partial<ElectronAPI> = {}): ElectronAPI {
  const canonicalDto = createCanonicalSaveDto();
  const folderInfo: SaveFolderInfo = {
    path: '/saves/test-game',
    engine: 'rpg-mv-mz',
    confidence: 'high',
    source: 'deterministic',
  };

  return {
    getAppVersion: vi.fn().mockResolvedValue('2.2.9'),
    getSaveFolder: vi.fn().mockResolvedValue(folderInfo),
    selectSaveFolder: vi.fn().mockResolvedValue({ canceled: false, folderPath: '/saves/override' }),
    setSaveFolderOverride: vi.fn().mockResolvedValue({ ok: true, saveFolderOverride: '/saves/override' }),
    listSaveFiles: vi.fn().mockResolvedValue(['save01.sav', 'save02.sav']),
    loadSaveData: vi.fn().mockResolvedValue(canonicalDto),
    cancelLoadSaveData: vi.fn().mockResolvedValue({ cancelled: true }),
    onSaveLoadProgress: vi.fn().mockReturnValue(() => {}),
    writeSaveData: vi.fn().mockImplementation(
      async ({ updates }: { gameKey: string; fileName: string; updates?: SaveUpdatesPayload }) => {
        expect(typeof updates).toBe('object');
        expect(updates).not.toBeNull();
        for (const [k, v] of Object.entries(updates ?? {})) {
          expect(k).toMatch(/^[a-zA-Z0-9_-]+:.+$/);
          expect(['number', 'string', 'boolean']).toContain(typeof v);
        }
        return { ok: true };
      }
    ),
    renameSaveFile: vi.fn().mockResolvedValue({ ok: true, renamed: true, fileName: 'renamed.sav' }),
    deleteSaveFile: vi.fn().mockResolvedValue({ ok: true }),
    loadTranslations: vi.fn().mockResolvedValue({}),
    saveTranslations: vi.fn().mockResolvedValue({ ok: true }),
    translateBatch: vi.fn().mockImplementation(async (texts: string[]) => {
      const translated: Record<string, string> = {};
      for (const text of texts) {
        translated[text] = `[TL] ${text}`;
      }
      return translated;
    }),
    cancelTranslateBatch: vi.fn().mockResolvedValue({ cancelled: true }),
    ...overrides,
  } as unknown as ElectronAPI;
}

describe('Standalone Save Editor Window Cutover & Integration (Ticket 10.1)', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    delete (window as { __IS_STANDALONE_SAVE_EDITOR__?: unknown }).__IS_STANDALONE_SAVE_EDITOR__;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    window.history.replaceState(null, '', '/');
    delete (window as { __IS_STANDALONE_SAVE_EDITOR__?: unknown }).__IS_STANDALONE_SAVE_EDITOR__;
    delete (window as { electronAPI?: unknown }).electronAPI;
    document.body.className = '';
    document.body.innerHTML = '';
  });

  it('enforces CSS isolation, elevation tokens, scrollbar-gutter, .save-editor-error-banner, save-editor.html portal structure, and type-only @yumeshelf/engine imports', () => {
    const cssPath = path.resolve(__dirname, '../../../styles/save-editor.css');
    const cssText = fs.readFileSync(cssPath, 'utf-8');

    expect(cssText).toMatch(/#save-editor-root\s*\{[^}]*isolation:\s*isolate;/s);
    expect(cssText).toMatch(
      /\.save-editor-overlay\s*\{[^}]*z-index:\s*var\(--zIndex-overlay,\s*6000\);[^}]*isolation:\s*isolate;/s
    );
    expect(cssText).toMatch(
      /\.standalone-save-editor\s+\.save-editor-overlay\s*\{[^}]*position:\s*static;[^}]*z-index:\s*auto;[^}]*isolation:\s*isolate;/s
    );
    expect(cssText).toMatch(
      /\.save-editor-popover\s*\{[^}]*z-index:\s*var\(--zIndex-dropdown,\s*1000\);[^}]*isolation:\s*isolate;/s
    );
    expect(cssText).toMatch(
      /\.save-editor-rename-tooltip\s*\{[^}]*z-index:\s*var\(--zIndex-tooltip,\s*10000\);/s
    );
    expect(cssText).toMatch(/\.save-editor-content\s*\{[^}]*scrollbar-gutter:\s*stable;/s);
    expect(cssText).toMatch(/\.save-editor-error-banner\s*\{[^}]*border:\s*1px solid/s);
    expect(cssText).not.toMatch(/z-index:\s*\d{3,}/);

    const themePath = path.resolve(__dirname, '../../../styles/theme.css');
    const themeText = fs.readFileSync(themePath, 'utf-8');
    expect(themeText).toContain('--zIndex-dropdown:');
    expect(themeText).toContain('--zIndex-modal:');
    expect(themeText).toContain('--zIndex-overlay:');
    expect(themeText).toContain('--zIndex-tooltip:');

    const htmlPath = path.resolve(__dirname, '../../../save-editor.html');
    const htmlText = fs.readFileSync(htmlPath, 'utf-8');
    expect(htmlText).toContain('<body class="standalone-save-editor">');
    expect(htmlText).toContain('<div id="save-editor-root" tabindex="-1"></div>');
    expect(htmlText).toContain('<div id="portal-root"></div>');
    expect(htmlText).toContain('<script type="module" src="./save-editor.tsx"></script>');
    expect(htmlText).toContain(
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: game-icon:; connect-src 'self';"
    );
    expect(htmlText).not.toContain('https://translate.googleapis.com');

    // Strictly enforce type-only imports from @yumeshelf/engine across all renderer modules
    const collectTsFiles = (dir: string): string[] => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const out: string[] = [];
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          out.push(...collectTsFiles(full));
        } else if (/\.(ts|tsx)$/.test(entry.name)) {
          out.push(full);
        }
      }
      return out;
    };
    const rendererFiles = [
      path.resolve(__dirname, '../../../save-editor.tsx'),
      ...collectTsFiles(path.resolve(__dirname, '../../')),
    ];
    for (const filePath of rendererFiles) {
      const source = fs.readFileSync(filePath, 'utf-8');
      const engineImports = source.match(/^\s*import\s+(?!type\b).*from\s+['"]@yumeshelf\/engine/gm);
      expect(engineImports, `Non-type @yumeshelf/engine import in ${filePath}`).toBeNull();
    }
  });

  it('mounts standalone React shell into #save-editor-root with sibling #portal-root, expected layout containment, portal popover parity, global error sanitization, and idempotent cleanup', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const rootEl = document.createElement('div');
    rootEl.id = 'save-editor-root';
    rootEl.tabIndex = -1;
    const portalRoot = document.createElement('div');
    portalRoot.id = 'portal-root';
    document.body.appendChild(rootEl);
    document.body.appendChild(portalRoot);

    const mockApi = createMockElectronAPI();
    let dispose!: () => void;

    await act(async () => {
      dispose = await mountStandaloneSaveEditor(rootEl, '?gameKey=yume-nikki&file=save01.sav', {
        electronAPI: mockApi,
      });
    });

    expect(window.__IS_STANDALONE_SAVE_EDITOR__).toBe(true);
    expect(document.body.classList.contains('standalone-save-editor')).toBe(true);
    expect(rootEl.nextElementSibling).toBe(portalRoot);

    // Verify canonical containment hierarchy
    const overlay = rootEl.querySelector(':scope > .save-editor-overlay');
    const panel = overlay?.querySelector(':scope > .save-editor-panel');
    const body = panel?.querySelector(':scope > .save-editor-body');
    const sidebar = body?.querySelector(':scope > .save-editor-sidebar');
    const main = body?.querySelector(':scope > main.save-editor-main');
    const topBar = main?.querySelector(':scope > .save-editor-top-bar');
    const content = main?.querySelector(':scope > .save-editor-content');
    const footer = panel?.querySelector(':scope > .save-editor-footer');

    expect(overlay).not.toBeNull();
    expect(panel).not.toBeNull();
    expect(body).not.toBeNull();
    expect(sidebar).not.toBeNull();
    expect(main).not.toBeNull();
    expect(topBar).not.toBeNull();
    expect(topBar?.querySelector('.save-editor-tabs')).not.toBeNull();
    expect(topBar?.querySelector('.save-editor-search')).not.toBeNull();
    expect(content).not.toBeNull();
    expect(footer).not.toBeNull();

    await waitFor(() => {
      expect(mockApi.loadSaveData).toHaveBeenCalledWith({
        gameKey: 'yume-nikki',
        fileName: 'save01.sav',
      });
    });

    // Editing a field makes standalone beforeunload prevent window closure without unmounting React
    const goldInput = await within(rootEl).findByRole('textbox', { name: 'Gold' });
    fireEvent.change(goldInput, { target: { value: '1234' } });
    fireEvent.keyDown(goldInput, { key: 'Enter' });

    const dirtyBeforeUnload = new Event('beforeunload', { cancelable: true });
    await act(async () => {
      window.dispatchEvent(dirtyBeforeUnload);
      await Promise.resolve();
    });
    expect(dirtyBeforeUnload.defaultPrevented).toBe(true);
    expect(within(rootEl).getByRole('textbox', { name: 'Gold' })).toBeInTheDocument();

    // Trigger Delete popover and confirm it portals into sibling #portal-root
    const deleteBtn = within(rootEl).getByRole('button', { name: 'Delete save01.sav' });
    fireEvent.click(deleteBtn);
    const portaledPopover = portalRoot.querySelector('.save-editor-popover');
    expect(portaledPopover).not.toBeNull();
    expect(portaledPopover).toHaveAttribute('role', 'dialog');

    // Global error + unhandledrejection listeners redact local paths
    window.dispatchEvent(
      new ErrorEvent('error', {
        message: 'Uncaught crash in C:\\Users\\Alice\\save01.sav',
        filename: 'C:\\Users\\Alice\\save-editor.tsx',
        error: new Error('Failure in C:\\Users\\Alice\\save01.sav'),
      })
    );

    const rejectionEvent = new Event('unhandledrejection') as Event & { reason?: unknown };
    rejectionEvent.reason = new Error('Async failure at /home/alice/saves/save01.sav');
    window.dispatchEvent(rejectionEvent);

    const errorLog = consoleErrorSpy.mock.calls.find(
      (c) => c[0] === '[SaveEditor] Uncaught error:'
    );
    const rejectionLog = consoleErrorSpy.mock.calls.find(
      (c) => c[0] === '[SaveEditor] Unhandled rejection:'
    );
    expect(errorLog).toBeDefined();
    expect(rejectionLog).toBeDefined();
    expect(JSON.stringify(errorLog)).toContain('<USER_DIR>');
    expect(JSON.stringify(errorLog)).not.toContain('Alice');
    expect(JSON.stringify(rejectionLog)).toContain('<USER_DIR>');
    expect(JSON.stringify(rejectionLog)).not.toContain('alice');

    // Idempotent disposal unmounts React, removes body class, and unbinds listeners
    act(() => {
      dispose();
      dispose();
    });

    expect(rootEl.innerHTML).toBe('');
    expect(document.body.classList.contains('standalone-save-editor')).toBe(false);

    consoleErrorSpy.mockClear();
    window.dispatchEvent(new ErrorEvent('error', { message: 'Post-dispose error' }));
    const lateRejection = new Event('unhandledrejection') as Event & { reason?: unknown };
    lateRejection.reason = new Error('Post-dispose rejection');
    window.dispatchEvent(lateRejection);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('validates #save-editor-root before registering listeners and sanitizes auto-bootstrap errors', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(document, 'getElementById').mockImplementation(() => {
      const err = new Error('DOM lookup failed at C:\\Users\\Alice\\mount.ts');
      err.stack = 'Error: DOM lookup failed\n    at C:\\Users\\Alice\\mount.ts:12:3';
      throw err;
    });

    await bootstrapStandaloneSaveEditor();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[SaveEditor] Failed to mount standalone save editor:',
      expect.objectContaining({
        error: expect.stringContaining('<USER_DIR>'),
      })
    );
    expect(JSON.stringify(consoleErrorSpy.mock.calls)).not.toContain('Alice');
  });

  it('propagates injected electronAPI hermetically without touching window.electronAPI and resolves URL query params including UTF-8 non-ASCII game keys with zero localStorage popout handoff', async () => {
    const windowApiGetter = vi.fn(() => {
      throw new Error('Global window.electronAPI must not be accessed when electronAPI prop is provided');
    });
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      get: windowApiGetter,
    });

    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

    // 1. Prop seam + initialFile auto-selection
    const propApi = createMockElectronAPI();
    const { unmount: unmountProp } = render(
      <SaveEditorApp
        gameKey="test-game"
        initialFile="save01.sav"
        electronAPI={propApi}
      />
    );

    await waitFor(() => {
      expect(propApi.getSaveFolder).toHaveBeenCalledWith('test-game');
      expect(propApi.listSaveFiles).toHaveBeenCalledWith('test-game');
      expect(propApi.loadSaveData).toHaveBeenCalledWith({
        gameKey: 'test-game',
        fileName: 'save01.sav',
      });
    });
    expect(windowApiGetter).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: 'Gold' })).toHaveValue('500');
    unmountProp();

    // 2. Non-existent initialFile ignored cleanly without error
    const missingFileApi = createMockElectronAPI({
      listSaveFiles: vi.fn().mockResolvedValue(['save01.sav']),
    });
    const { unmount: unmountMissing } = render(
      <SaveEditorApp
        gameKey="test-game"
        initialFile="missing.rpgsave"
        electronAPI={missingFileApi}
      />
    );
    await waitFor(() => {
      expect(missingFileApi.listSaveFiles).toHaveBeenCalledWith('test-game');
    });
    expect(missingFileApi.loadSaveData).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
    unmountMissing();

    // 3. URL query fallback (?gameKey=url-game)
    window.history.replaceState(null, '', '/save-editor.html?gameKey=url-game');
    const urlApi = createMockElectronAPI();
    const { unmount: unmountUrl } = render(<SaveEditorApp electronAPI={urlApi} />);
    await waitFor(() => {
      expect(urlApi.getSaveFolder).toHaveBeenCalledWith('url-game');
      expect(urlApi.listSaveFiles).toHaveBeenCalledWith('url-game');
    });
    unmountUrl();

    // 4. Unicode non-ASCII game key (?gameKey=ゆめ2っき)
    window.history.replaceState(null, '', '/save-editor.html?gameKey=ゆめ2っき');
    const unicodeRawApi = createMockElectronAPI();
    const { unmount: unmountUnicodeRaw } = render(<SaveEditorApp electronAPI={unicodeRawApi} />);
    await waitFor(() => {
      expect(unicodeRawApi.getSaveFolder).toHaveBeenCalledWith('ゆめ2っき');
      expect(unicodeRawApi.listSaveFiles).toHaveBeenCalledWith('ゆめ2っき');
    });
    unmountUnicodeRaw();

    // 5. Percent-encoded UTF-8 game key (?gameKey=%E3%82%86%E3%82%812%E3%81%A3%E3%81%8D)
    window.history.replaceState(
      null,
      '',
      '/save-editor.html?gameKey=%E3%82%86%E3%82%812%E3%81%A3%E3%81%8D'
    );
    const unicodeEncodedApi = createMockElectronAPI();
    const { unmount: unmountUnicodeEncoded } = render(
      <SaveEditorApp electronAPI={unicodeEncodedApi} />
    );
    await waitFor(() => {
      expect(unicodeEncodedApi.getSaveFolder).toHaveBeenCalledWith('ゆめ2っき');
      expect(unicodeEncodedApi.listSaveFiles).toHaveBeenCalledWith('ゆめ2っき');
    });
    unmountUnicodeEncoded();

    // 6. Empty query params and no gameKey -> .save-editor-error-banner
    window.history.replaceState(null, '', '/save-editor.html');
    const { unmount: unmountEmpty } = render(<SaveEditorApp electronAPI={propApi} />);
    const banner = screen.getByRole('alert');
    expect(banner).toHaveClass('save-editor-error-banner');
    expect(banner.textContent).toBe('Missing required gameKey parameter');
    unmountEmpty();

    // 7. Defensive fallback when window.location.search throws still resolves props cleanly
    const origLocation = window.location;
    const throwingLoc = {
      get search(): string {
        throw new Error('Blocked search getter');
      },
    };
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: throwingLoc,
    });
    try {
      const propFallbackApi = createMockElectronAPI();
      render(<SaveEditorApp gameKey="prop-survives" electronAPI={propFallbackApi} />);
      await waitFor(() => {
        expect(propFallbackApi.getSaveFolder).toHaveBeenCalledWith('prop-survives');
      });
    } finally {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: origLocation,
      });
    }

    // Verify zero localStorage popout side-channel usage
    const popoutReads = getItemSpy.mock.calls.filter(([key]) =>
      String(key).includes('yumeshelf_popout_state')
    );
    const popoutWrites = setItemSpy.mock.calls.filter(([key]) =>
      String(key).includes('yumeshelf_popout_state')
    );
    expect(popoutReads).toHaveLength(0);
    expect(popoutWrites).toHaveLength(0);
  });

  it('executes full Save Editor lifecycle: folder detection, decoding, virtualized rows, dirty tracking + beforeunload guard, search filtering, chunked batch translation (BATCH_SIZE=15), and footer save commit', async () => {
    const user = userEvent.setup();
    const mockApi = createMockElectronAPI();
    const store = createSaveEditorStore('test-game');

    const { container } = render(
      <SaveEditorApp gameKey="test-game" store={store} electronAPI={mockApi} />
    );

    // 1. Folder detected and files listed
    await waitFor(() => {
      expect(screen.getByTitle('/saves/test-game')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'save01.sav' })).toBeInTheDocument();
    });

    // Clean state does not prevent beforeunload
    const cleanUnloadEvent = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(cleanUnloadEvent);
    expect(cleanUnloadEvent.defaultPrevented).toBe(false);

    // 2. Click save file -> decode NormalizedSaveDto and populate tabs
    await user.click(screen.getByRole('button', { name: 'save01.sav' }));
    await waitFor(() => {
      expect(mockApi.loadSaveData).toHaveBeenCalledWith({
        gameKey: 'test-game',
        fileName: 'save01.sav',
      });
      const tabsNav = screen.getByRole('navigation', { name: 'Save categories' });
      expect(within(tabsNav).getByRole('button', { name: /^All/i })).toHaveAttribute(
        'aria-current',
        'page'
      );
      expect(within(tabsNav).getByRole('button', { name: /Variables/i })).toBeInTheDocument();
      expect(within(tabsNav).getByRole('button', { name: /Switches/i })).toBeInTheDocument();
    });

    // 3. Verify virtualized row rendering via initialRect { width: 800, height: 600 }
    // 25 variables * 88px = 2200px total height, only viewport + overscan rows mounted
    const renderedRows = container.querySelectorAll('[data-index]');
    expect(renderedRows.length).toBeGreaterThan(0);
    expect(renderedRows.length).toBeLessThan(25);

    // 4. Edit number & string variables -> dirtyKeys updates and beforeunload blocks close
    const goldInput = screen.getByRole('textbox', { name: 'Gold' }) as HTMLInputElement;
    await user.clear(goldInput);
    await user.type(goldInput, '9999{Enter}');
    expect(store.getSnapshot().dirtyKeys.has('variables:1')).toBe(true);
    expect(goldInput.closest('.save-field-row')).toHaveClass('is-dirty');

    const heroInput = screen.getByRole('textbox', { name: 'Hero Name' }) as HTMLInputElement;
    await user.clear(heroInput);
    await user.type(heroInput, 'Madotsuki');
    expect(store.getSnapshot().dirtyKeys.has('variables:2')).toBe(true);

    // Switch tab to Switches and toggle boolean switch
    const tabsNav = screen.getByRole('navigation', { name: 'Save categories' });
    await user.click(within(tabsNav).getByRole('button', { name: /Switches/i }));
    const introSwitch = screen.getByRole('switch', { name: 'Intro Watched' });
    await user.click(introSwitch);
    expect(store.getSnapshot().dirtyKeys.has('switches:1')).toBe(true);

    const dirtyUnloadEvent = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(dirtyUnloadEvent);
    expect(dirtyUnloadEvent.defaultPrevented).toBe(true);

    // 5. Filter variables across labels, keys, and effective scalar values
    await user.click(within(tabsNav).getByRole('button', { name: /Variables/i }));
    const searchInput = screen.getByRole('searchbox', { name: /search variables/i });

    // Filter by label
    fireEvent.change(searchInput, { target: { value: 'Hero Name' } });
    fireEvent.keyDown(searchInput, { key: 'Enter' });
    expect(screen.getByRole('textbox', { name: 'Hero Name' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Gold' })).toBeNull();

    // Filter by key ('24')
    fireEvent.change(searchInput, { target: { value: '24' } });
    fireEvent.keyDown(searchInput, { key: 'Enter' });
    expect(screen.getByRole('textbox', { name: 'Variable 24' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Hero Name' })).toBeNull();

    // Filter by pristine scalar value ('Harold')
    fireEvent.change(searchInput, { target: { value: 'Harold' } });
    fireEvent.keyDown(searchInput, { key: 'Enter' });
    expect(screen.getByRole('textbox', { name: 'Hero Name' })).toBeInTheDocument();

    // Clear search filter
    fireEvent.change(searchInput, { target: { value: '' } });
    fireEvent.keyDown(searchInput, { key: 'Enter' });
    expect(screen.getByRole('textbox', { name: 'Gold' })).toBeInTheDocument();

    // 6. Execute chunked (BATCH_SIZE = 15) batch translation with fake timers
    vi.useFakeTimers();
    const translateBtn = screen.getByRole('button', { name: /translate save fields/i });
    fireEvent.click(translateBtn);

    // 25 variables + 2 switches = 27 unique labels -> Batch 1 (15), Batch 2 (12)
    expect(mockApi.translateBatch).toHaveBeenCalledTimes(1);
    expect((mockApi.translateBatch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toHaveLength(15);
    expect(screen.getByText('Batch 1 of 2')).toBeInTheDocument();

    await act(async () => {
      await flushPromises();
      await vi.advanceTimersByTimeAsync(600);
      await flushPromises();
    });

    expect(mockApi.translateBatch).toHaveBeenCalledTimes(2);
    expect((mockApi.translateBatch as ReturnType<typeof vi.fn>).mock.calls[1][0]).toHaveLength(12);
    expect(mockApi.saveTranslations).toHaveBeenCalledTimes(2);
    expect(screen.getByText('All labels translated')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '[TL] Gold' })).toBeInTheDocument();
    vi.useRealTimers();

    // 7. Commit modified save data via persistent footer
    const saveBtn = screen.getByRole('button', { name: /save changes/i });
    expect(saveBtn).toHaveAttribute('aria-disabled', 'false');

    await act(async () => {
      fireEvent.click(saveBtn);
      await flushPromises();
    });

    expect(mockApi.writeSaveData).toHaveBeenCalledTimes(1);
    expect(mockApi.writeSaveData).toHaveBeenCalledWith({
      gameKey: 'test-game',
      fileName: 'save01.sav',
      updates: {
        'variables:1': 9999,
        'variables:2': 'Madotsuki',
        'switches:1': false,
      },
    });
    expect(store.getSnapshot().dirtyKeys.size).toBe(0);
    expect(store.getSnapshot().saveStatus).toEqual({ state: 'saved' });
    expect(screen.getByText(/^Saved!?$/)).toBeInTheDocument();

    const postSaveUnloadEvent = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(postSaveUnloadEvent);
    expect(postSaveUnloadEvent.defaultPrevented).toBe(false);
  });

  it('recovers from corrupted file errors (Retry & Choose Another File focus transfer), disk write errors, and AppErrorBoundary render crashes with #save-editor-root focus restoration', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();

    const rootEl = document.createElement('div');
    rootEl.id = 'save-editor-root';
    rootEl.tabIndex = -1;
    document.body.appendChild(rootEl);

    let resolveRetryLoad!: (dto: NormalizedSaveDto) => void;
    const mockApi = createMockElectronAPI({
      loadSaveData: vi
        .fn()
        .mockRejectedValueOnce(new Error('Corrupt header in C:\\Users\\Alice\\save01.sav'))
        .mockImplementationOnce(
          () =>
            new Promise<NormalizedSaveDto>((resolve) => {
              resolveRetryLoad = resolve;
            })
        )
        .mockRejectedValueOnce(new Error('Corrupt header in C:\\Users\\Alice\\save02.sav')),
      writeSaveData: vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          error: 'EACCES: disk locked at C:\\Users\\Alice\\save01.sav',
          code: 'EACCES',
        })
        .mockResolvedValueOnce({ ok: true }),
    });

    const baseStore = createSaveEditorStore('test-game');
    let shouldThrowInRender = false;
    const controllableStore: ObservableSaveEditorStore = {
      subscribe: baseStore.subscribe,
      getSnapshot: () => {
        if (shouldThrowInRender) {
          throw new Error('Unhandled component render crash at C:\\Users\\Alice\\SaveEditorShell.tsx');
        }
        return baseStore.getSnapshot();
      },
      setFileLoading: (fileName) => baseStore.setFileLoading(fileName),
      setFileProgress: (fileName, percent) => baseStore.setFileProgress(fileName, percent),
      setFileLoaded: (dto) => baseStore.setFileLoaded(dto),
      setFileError: (fileName, errorMessage) => baseStore.setFileError(fileName, errorMessage),
      setFileIdle: () => baseStore.setFileIdle(),
      renameActiveFile: (newFileName, expected) => baseStore.renameActiveFile(newFileName, expected),
      setMutatingFile: (isMutating) => baseStore.setMutatingFile(isMutating),
      setActiveTab: (tabId) => baseStore.setActiveTab(tabId),
      setSearchQuery: (query) => baseStore.setSearchQuery(query),
      setFilter: (patch) => baseStore.setFilter(patch),
      togglePin: (fieldId) => baseStore.togglePin(fieldId),
      toggleSection: (tabId) => baseStore.toggleSection(tabId),
      expandAllSections: () => baseStore.expandAllSections(),
      collapseAllSections: (tabIds) => baseStore.collapseAllSections(tabIds),
      setTranslations: (t) => baseStore.setTranslations(t),
      hydrateTranslations: (t) => baseStore.hydrateTranslations(t),
      setTranslating: (v) => baseStore.setTranslating(v),
      updateField: (id, v) => baseStore.updateField(id, v),
      resetField: (id) => baseStore.resetField(id),
      clearDirty: () => baseStore.clearDirty(),
      setSaving: () => baseStore.setSaving(),
      setSaved: (updates, fileName) => baseStore.setSaved(updates, fileName),
      setSaveError: (msg, fileName) => baseStore.setSaveError(msg, fileName),
    };

    render(
      <SaveEditorApp gameKey="test-game" store={controllableStore} electronAPI={mockApi} />,
      { container: rootEl }
    );

    await waitFor(() => {
      expect(mockApi.getAppVersion).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: 'save01.sav' })).toBeInTheDocument();
    });

    // 1. Corrupted file load transitions to error state without crashing UI
    await user.click(screen.getByRole('button', { name: 'save01.sav' }));
    const fileErrorAlert = await screen.findByRole('alert');
    expect(baseStore.getSnapshot().fileStatus.state).toBe('error');
    expect(fileErrorAlert.textContent).toContain('<USER_DIR>\\save01.sav');
    expect(fileErrorAlert.textContent).not.toContain('Alice');

    // Retry transitions fileStatus back to 'loading' and re-invokes loadSaveData
    await user.click(within(fileErrorAlert).getByRole('button', { name: 'Retry' }));
    expect(baseStore.getSnapshot().fileStatus).toEqual({
      state: 'loading',
      fileName: 'save01.sav',
    });
    expect(mockApi.loadSaveData).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolveRetryLoad(createCanonicalSaveDto({ fileName: 'save01.sav' }));
      await flushPromises();
    });
    await waitFor(() => {
      expect(baseStore.getSnapshot().fileStatus.state).toBe('loaded');
      expect(screen.getByRole('textbox', { name: 'Gold' })).toHaveValue('500');
    });

    // 2. Disk write error renders footer alert, preserves dirty edits, and recovers on retry
    const goldInput = screen.getByRole('textbox', { name: 'Gold' });
    await user.clear(goldInput);
    await user.type(goldInput, '777{Enter}');

    await user.click(screen.getByRole('button', { name: /save changes/i }));
    const writeErrorAlert = await screen.findByRole('alert');
    expect(writeErrorAlert.textContent).toContain('<USER_DIR>\\save01.sav');
    expect(writeErrorAlert.textContent).not.toContain('Alice');
    expect(baseStore.getSnapshot().dirtyKeys.has('variables:1')).toBe(true);

    await user.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => {
      expect(baseStore.getSnapshot().saveStatus).toEqual({ state: 'saved' });
    });

    // 3. Load corrupted save02.sav -> renders error alert without Choose Another File; sidebar remains accessible to switch slots
    await user.click(screen.getByRole('button', { name: 'save02.sav' }));
    const slot2Alert = await screen.findByRole('alert');
    expect(baseStore.getSnapshot().fileStatus).toEqual({
      state: 'error',
      fileName: 'save02.sav',
      errorMessage: 'Corrupt header in <USER_DIR>\\save02.sav',
    });
    expect(within(slot2Alert).queryByRole('button', { name: 'Choose Another File' })).toBeNull();
    expect(screen.getByTestId('save-file-list')).toBeInTheDocument();

    // 4. AppErrorBoundary catches render crash, propagates electronAPI, scrubs paths, and restores focus on Retry
    shouldThrowInRender = true;
    act(() => {
      baseStore.setSearchQuery('trigger-crash');
    });

    const crashAlert = await screen.findByRole('alert');
    expect(crashAlert).toHaveClass('app-error-boundary-fallback');
    expect(crashAlert.textContent).toContain('<USER_DIR>\\SaveEditorShell.tsx');
    expect(crashAlert.textContent).not.toContain('Alice');

    shouldThrowInRender = false;
    fireEvent.click(within(crashAlert).getByRole('button', { name: 'Retry' }));

    await waitFor(() => {
      expect(screen.getByTestId('save-file-list')).toBeInTheDocument();
    });
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(rootEl);

    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('supports pre-310 filter keyboard shortcuts (e, i, x) and Shift+Enter save when not typing in an input', async () => {
    const qsSpy = vi.spyOn(document, 'querySelector');
    const user = userEvent.setup();
    const mockApi = createMockElectronAPI();
    const store = createSaveEditorStore('test-game');

    render(
      <SaveEditorApp
        gameKey="test-game"
        initialFile="save01.sav"
        store={store}
        electronAPI={mockApi}
      />
    );

    const goldInput = await screen.findByRole('textbox', { name: 'Gold' });

    // Shift+Enter while !isDirty must not preventDefault or invoke writeSaveData
    const cleanShiftEnter = new KeyboardEvent('keydown', {
      key: 'Enter',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.body.dispatchEvent(cleanShiftEnter);
    expect(cleanShiftEnter.defaultPrevented).toBe(false);
    expect(mockApi.writeSaveData).not.toHaveBeenCalled();

    // Single-key shortcuts toggle filters when focus is outside text inputs
    fireEvent.keyDown(document.body, { key: 'e' });
    fireEvent.keyDown(document.body, { key: 'i' });
    fireEvent.keyDown(document.body, { key: 'x' });
    expect(store.getSnapshot().filters).toMatchObject({
      showEmpty: true,
      showImportant: false,
      exactMatch: true,
    });

    // Shortcuts must NOT trigger while typing inside searchbox or field inputs
    const searchInput = screen.getByRole('searchbox', { name: /search variables/i });
    searchInput.focus();
    fireEvent.keyDown(searchInput, { key: 'e' });
    expect(store.getSnapshot().filters.showEmpty).toBe(true);

    // Edit Gold -> blur input -> Shift+Enter saves changes
    await user.clear(goldInput);
    await user.type(goldInput, '888{Enter}');
    expect(store.getSnapshot().dirtyKeys.has('variables:1')).toBe(true);
    fireEvent.blur(goldInput);
    (document.body as HTMLElement).focus();

    await act(async () => {
      fireEvent.keyDown(document.body, { key: 'Enter', shiftKey: true });
      await flushPromises();
    });

    expect(mockApi.writeSaveData).toHaveBeenCalledTimes(1);
    expect(mockApi.writeSaveData).toHaveBeenCalledWith({
      gameKey: 'test-game',
      fileName: 'save01.sav',
      updates: { 'variables:1': 888 },
    });
    expect(qsSpy).not.toHaveBeenCalledWith('input.save-editor-search');
    expect(qsSpy).not.toHaveBeenCalledWith('.save-editor-footer .save-btn');
  });

  it('focuses and selects input.save-editor-search on Ctrl+F / Cmd+F unless inside a dialog', async () => {
    const qsSpy = vi.spyOn(document, 'querySelector');
    const user = userEvent.setup();
    const mockApi = createMockElectronAPI();
    const store = createSaveEditorStore('test-game');

    render(
      <SaveEditorApp
        gameKey="test-game"
        initialFile="save01.sav"
        store={store}
        electronAPI={mockApi}
      />
    );

    const goldInput = await screen.findByRole('textbox', { name: 'Gold' });
    const searchInput = screen.getByRole('searchbox', {
      name: /search variables/i,
    }) as HTMLInputElement;

    // Ctrl+F while typing inside a field input still focuses the search bar
    goldInput.focus();
    expect(document.activeElement).toBe(goldInput);
    fireEvent.keyDown(goldInput, { key: 'f', ctrlKey: true });
    expect(document.activeElement).toBe(searchInput);

    // Cmd+F from outside inputs focuses and selects existing search query
    await user.type(searchInput, 'Gold');
    searchInput.blur();
    (document.body as HTMLElement).focus();
    fireEvent.keyDown(document.body, { key: 'f', metaKey: true });
    expect(document.activeElement).toBe(searchInput);
    expect(searchInput.selectionStart).toBe(0);
    expect(searchInput.selectionEnd).toBe(4);

    // Ctrl+F inside an open [role="dialog"] must not steal focus
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    const dialogInput = document.createElement('input');
    dialog.appendChild(dialogInput);
    document.body.appendChild(dialog);
    try {
      dialogInput.focus();
      expect(document.activeElement).toBe(dialogInput);
      fireEvent.keyDown(dialogInput, { key: 'f', ctrlKey: true });
      expect(document.activeElement).toBe(dialogInput);
    } finally {
      dialog.remove();
    }
    expect(qsSpy).not.toHaveBeenCalledWith('input.save-editor-search');
    expect(qsSpy).not.toHaveBeenCalledWith('.save-editor-footer .save-btn');
  });

  it('renders localized vi strings for sidebar, tabs, filters, search bar, field row pin, and footer', async () => {
    resetLocaleCacheForTests();
    const viPack = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), 'language-packs/packs/vi.json'), 'utf8')
    ) as { strings: Record<string, string> };
    localStorage.setItem('yumeshelf_lang', 'vi');
    const mockApi = createMockElectronAPI({
      getLanguageState: vi.fn().mockResolvedValue({
        builtIn: [],
        installed: [{ code: 'vi', strings: viPack.strings }],
      }),
    });
    const store = createSaveEditorStore('test-game');

    try {
      render(
        <SaveEditorApp
          gameKey="test-game"
          initialFile="save01.sav"
          store={store}
          electronAPI={mockApi}
        />
      );

      await screen.findByRole('textbox', { name: 'Gold' });

      await waitFor(() => {
        expect(screen.getByText('Thư mục lưu')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Chọn thư mục lưu' })).toHaveTextContent('Đổi...');
        expect(screen.getByRole('list', { name: 'Danh sách file save' })).toBeInTheDocument();
        expect(screen.getByRole('navigation', { name: 'Danh mục save' })).toBeInTheDocument();
        expect(screen.getByRole('group', { name: 'Bộ lọc biến save' })).toBeInTheDocument();
        expect(screen.getByRole('searchbox', { name: 'Tìm kiếm biến' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Tải lại từ ổ đĩa' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Dịch các trường save' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Ghim Gold' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Lưu thay đổi' })).toBeInTheDocument();
      });
    } finally {
      localStorage.removeItem('yumeshelf_lang');
      resetLocaleCacheForTests();
    }
  });
});
