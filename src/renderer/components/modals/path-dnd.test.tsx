import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { PathReorderList } from './PathReorderList';
import { SettingsModal } from './SettingsModal';
import { LibraryGrid } from '../LibraryGrid';
import { LibraryStateProvider } from '../../context/LibraryStateContext';
import { NotificationProvider } from '../../providers/NotificationProvider';
import { createUiRuntimeState, type UiStorageAdapter } from '../../state/ui-runtime-state';
import enLocale from '../../../locales/builtins/en.json';
import type { LocaleStrings } from '../../i18n/locale-strings';
import type { ElectronAPI } from '../../../shared/types/ipc';
import type { GameEntry, LibraryConfig } from '../../types/game';

const strings = enLocale.strings as LocaleStrings;

function createMemoryStorage(initial: Record<string, string> = {}): UiStorageAdapter {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
  };
}

function makeDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeRect(top: number, height = 40): DOMRect {
  return {
    left: 0,
    top,
    right: 400,
    bottom: top + height,
    width: 400,
    height,
    x: 0,
    y: top,
    toJSON: () => ({}),
  };
}

function installRowRectMocks(paths: readonly string[]) {
  Element.prototype.getBoundingClientRect = vi.fn(function (this: HTMLElement) {
    if (this.classList.contains('library-path-entry')) {
      const link = this.querySelector('.library-path-link');
      const text = link?.textContent ?? '';
      const idx = paths.indexOf(text);
      if (idx !== -1) {
        return makeRect(idx * 48, 40);
      }
    }
    return makeRect(0, 400);
  });
}

async function keyboardDrag(handle: HTMLElement, direction: 'ArrowDown' | 'ArrowUp' = 'ArrowDown') {
  await act(async () => {
    handle.focus();
    fireEvent.keyDown(handle, { key: ' ', code: 'Space' });
    await Promise.resolve();
  });
  await act(async () => {
    fireEvent.keyDown(handle, { key: direction, code: direction });
    await Promise.resolve();
  });
  await act(async () => {
    fireEvent.keyDown(handle, { key: ' ', code: 'Space' });
    await Promise.resolve();
  });
}

function createMockElectronAPI(overrides: Partial<ElectronAPI> = {}): ElectronAPI {
  return {
    getAppVersion: vi.fn().mockResolvedValue('2.2.9'),
    getLanguageState: vi.fn().mockResolvedValue({ builtIn: [{ code: 'en', nativeName: 'English' }], installed: [] }),
    updateLibraryConfig: vi.fn(async (partial) => ({
      libraryPaths: partial.libraryPaths ?? [],
      libraryPath: partial.libraryPaths?.[0] ?? '',
      maxDepth: 5,
      autoLaunch: false,
      minimizeToTray: false,
    })),
    openPath: vi.fn(),
    changeLibraryPath: vi.fn(),
    removeLibraryPath: vi.fn(),
    addLibraryPath: vi.fn(),
    getGames: vi.fn().mockResolvedValue([]),
    getCategoryTree: vi.fn().mockResolvedValue([]),
    checkConfig: vi.fn().mockResolvedValue(null),
    ...overrides,
  } as unknown as ElectronAPI;
}

describe('PathReorderList & SettingsModal path DnD', () => {
  const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
  const originalResizeObserver = globalThis.ResizeObserver;

  beforeEach(() => {
    globalThis.ResizeObserver = class MockResizeObserver {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    } as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    globalThis.ResizeObserver = originalResizeObserver;
  });

  it('reorders paths via keyboard DnD, calls updateLibraryConfig, updates store, syncs LibraryGrid FolderSection order, and preserves .change-btn / .library-path-link', async () => {
    const initialPaths = ['D:\\GamesA', 'D:\\GamesB', 'D:\\GamesC'];
    installRowRectMocks(initialPaths);

    const store = createUiRuntimeState(createMemoryStorage());
    const baseConfig: LibraryConfig = {
      libraryPaths: initialPaths,
      libraryPath: initialPaths[0],
      maxDepth: 5,
      autoLaunch: false,
      minimizeToTray: false,
    };
    store.setCurrentLibraryConfig(baseConfig);
    store.setCurrentSort('folder');

    const games: GameEntry[] = [
      { gameId: 'gA', gameKey: 'gA', name: 'Game A', folderName: 'GameA', relativePath: 'GameA', folderPath: 'D:\\GamesA\\GameA', favorite: false, dateAdded: 1, lastPlayed: 0, playtime: 0 },
      { gameId: 'gB', gameKey: 'gB', name: 'Game B', folderName: 'GameB', relativePath: 'GameB', folderPath: 'D:\\GamesB\\GameB', favorite: false, dateAdded: 1, lastPlayed: 0, playtime: 0 },
      { gameId: 'gC', gameKey: 'gC', name: 'Game C', folderName: 'GameC', relativePath: 'GameC', folderPath: 'D:\\GamesC\\GameC', favorite: false, dateAdded: 1, lastPlayed: 0, playtime: 0 },
    ];
    store.setAllGames(games);

    const updateLibraryConfig = vi.fn(async (partial: Partial<LibraryConfig>) => ({
      ...baseConfig,
      ...partial,
      libraryPath: partial.libraryPaths?.[0] ?? baseConfig.libraryPath,
    }));
    const api = createMockElectronAPI({ updateLibraryConfig });
    const onLibraryPathsUpdated = vi.fn();

    const { container } = render(
      <LibraryStateProvider store={store}>
        <NotificationProvider>
          <SettingsModal
            isOpen={true}
            onClose={vi.fn()}
            electronAPI={api}
            storage={createMemoryStorage()}
            targetPlatform="win32"
            onLibraryPathsUpdated={onLibraryPathsUpdated}
          />
          <LibraryGrid electronAPI={api} storage={createMemoryStorage()} targetPlatform="win32" />
        </NotificationProvider>
      </LibraryStateProvider>
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Library & Categories' }));

    const handles = Array.from(document.querySelectorAll('.grip-handle')) as HTMLButtonElement[];
    expect(handles).toHaveLength(3);
    expect(handles[0].getAttribute('aria-label')).toBe(strings.reorder_library_path);
    expect(handles[0].getAttribute('data-tooltip')).toBe(strings.drag_to_reorder);

    vi.useFakeTimers();
    try {
      await act(async () => {
        handles[0].focus();
        fireEvent.keyDown(handles[0], { key: ' ', code: 'Space' });
        vi.advanceTimersByTime(0);
      });
      await act(async () => {
        fireEvent.keyDown(handles[0], { key: 'ArrowDown', code: 'ArrowDown' });
        vi.advanceTimersByTime(0);
      });
      await act(async () => {
        fireEvent.keyDown(handles[0], { key: ' ', code: 'Space' });
        vi.advanceTimersByTime(0);
        await Promise.resolve();
      });
    } finally {
      vi.useRealTimers();
    }

    const expectedOrder = ['D:\\GamesB', 'D:\\GamesA', 'D:\\GamesC'];
    expect(updateLibraryConfig).toHaveBeenCalledWith({ libraryPaths: expectedOrder });
    expect(store.getSnapshot().currentLibraryConfig?.libraryPaths).toEqual(expectedOrder);
    expect(onLibraryPathsUpdated).toHaveBeenCalledWith(expectedOrder);

    // LibraryGrid FolderSection order updates immediately
    const sectionTitles = Array.from(container.querySelectorAll('.folder-section-title, .folder-title-text')).map(
      (el) => el.textContent?.trim()
    );
    expect(sectionTitles.filter(Boolean)).toEqual(['GamesB', 'GamesA', 'GamesC']);

    // .library-path-link and .change-btn still work
    const firstLink = document.querySelector('.library-path-link') as HTMLButtonElement;
    fireEvent.click(firstLink);
    expect(api.openPath).toHaveBeenCalledWith('D:\\GamesB');
    const changeBtns = document.querySelectorAll('.change-btn');
    expect(changeBtns.length).toBe(3);
  });

  it('renders DragOverlay during drag, dims stationary source row with opacity 0.4, and clears on drop or Escape cancel', async () => {
    const paths = ['D:\\One', 'D:\\Two'];
    installRowRectMocks(paths);
    const onReorderPaths = vi.fn().mockResolvedValue(undefined);

    const { container } = render(
      <PathReorderList
        paths={paths}
        disabled={false}
        strings={strings}
        pathListContainerRef={React.createRef()}
        pathItemRefs={{ current: new Map() }}
        onOpenPath={vi.fn()}
        onChangePath={vi.fn()}
        onRemovePath={vi.fn()}
        onReorderPaths={onReorderPaths}
      />
    );

    const handles = Array.from(container.querySelectorAll('.grip-handle')) as HTMLButtonElement[];

    // Start keyboard drag
    await act(async () => {
      handles[0].focus();
      fireEvent.keyDown(handles[0], { key: ' ', code: 'Space' });
      await Promise.resolve();
    });

    // Stationary source row dimmed
    const sourceRows = Array.from(
      container.querySelectorAll('.library-path-entry:not(.is-drag-overlay)')
    ) as HTMLElement[];
    expect(sourceRows[0].style.opacity).toBe('0.4');
    // DragOverlay renders preview
    expect(document.querySelector('.library-path-entry.is-drag-overlay')).toBeTruthy();

    // Cancel with Escape (over === null / onDragCancel)
    await act(async () => {
      fireEvent.keyDown(handles[0], { key: 'Escape', code: 'Escape' });
      await Promise.resolve();
    });

    expect(document.querySelector('.library-path-entry.is-drag-overlay')).toBeNull();
    expect(sourceRows[0].style.opacity).toBe('');
    expect(onReorderPaths).not.toHaveBeenCalled();
  });

  it('rolls back order, calls onShowToast, and logs sanitized console.error on rejected onReorderPaths', async () => {
    const paths = ['C:\\Users\\Alice\\Games1', 'C:\\Users\\Alice\\Games2'];
    installRowRectMocks(paths);
    const onReorderPaths = vi.fn().mockRejectedValue(new Error('Failed at C:\\Users\\Alice\\Games1'));
    const onShowToast = vi.fn();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { container, rerender } = render(
      <PathReorderList
        paths={paths}
        disabled={false}
        strings={strings}
        pathListContainerRef={React.createRef()}
        pathItemRefs={{ current: new Map() }}
        onOpenPath={vi.fn()}
        onChangePath={vi.fn()}
        onRemovePath={vi.fn()}
        onReorderPaths={onReorderPaths}
        onShowToast={onShowToast}
      />
    );

    const handles = Array.from(container.querySelectorAll('.grip-handle')) as HTMLButtonElement[];
    await keyboardDrag(handles[0], 'ArrowDown');

    // Rolled back to original order
    const links = Array.from(
      container.querySelectorAll('.library-path-entry:not(.is-drag-overlay) .library-path-link')
    ).map((el) => el.textContent);
    expect(links).toEqual(paths);
    expect(onShowToast).toHaveBeenCalledWith(strings.toast_path_reorder_failed);
    expect(errorSpy).toHaveBeenCalled();
    const loggedPayload = JSON.stringify(errorSpy.mock.calls[0]);
    expect(loggedPayload).not.toContain('Alice');

    // External paths prop syncs cleanly
    const nextPaths = ['D:\\New1', 'D:\\New2'];
    rerender(
      <PathReorderList
        paths={nextPaths}
        disabled={false}
        strings={strings}
        pathListContainerRef={React.createRef()}
        pathItemRefs={{ current: new Map() }}
        onOpenPath={vi.fn()}
        onChangePath={vi.fn()}
        onRemovePath={vi.fn()}
        onReorderPaths={onReorderPaths}
        onShowToast={onShowToast}
      />
    );
    const updatedLinks = Array.from(container.querySelectorAll('.library-path-link')).map((el) => el.textContent);
    expect(updatedLinks).toEqual(nextPaths);
  });

  it('preserves Drag #2 order and suppresses superseded Drag #1 toast when Drag #1 rejects after Drag #2 resolves', async () => {
    const paths = ['D:\\A', 'D:\\B', 'D:\\C'];
    installRowRectMocks(paths);

    const d1 = makeDeferred<void>();
    const d2 = makeDeferred<void>();
    const onReorderPaths = vi
      .fn()
      .mockImplementationOnce(() => d1.promise)
      .mockImplementationOnce(() => d2.promise);
    const onShowToast = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { container } = render(
      <PathReorderList
        paths={paths}
        disabled={false}
        strings={strings}
        pathListContainerRef={React.createRef()}
        pathItemRefs={{ current: new Map() }}
        onOpenPath={vi.fn()}
        onChangePath={vi.fn()}
        onRemovePath={vi.fn()}
        onReorderPaths={onReorderPaths}
        onShowToast={onShowToast}
      />
    );

    // Drag #1: move A -> B
    let handles = Array.from(container.querySelectorAll('.grip-handle')) as HTMLButtonElement[];
    await keyboardDrag(handles[0], 'ArrowDown');

    // Drag #2: move C -> B (while Drag #1 is still pending)
    const afterDrag1 = ['D:\\B', 'D:\\A', 'D:\\C'];
    installRowRectMocks(afterDrag1);
    handles = Array.from(container.querySelectorAll('.grip-handle')) as HTMLButtonElement[];
    await keyboardDrag(handles[2], 'ArrowUp');

    // Drag #2 resolves first
    await act(async () => {
      d2.resolve();
      await Promise.resolve();
    });

    // Drag #1 rejects afterwards -> must NOT roll back Drag #2 or show toast
    await act(async () => {
      d1.reject(new Error('Network timeout'));
      await Promise.resolve();
    });

    const links = Array.from(
      container.querySelectorAll('.library-path-entry:not(.is-drag-overlay) .library-path-link')
    ).map((el) => el.textContent);
    expect(links).toEqual(['D:\\B', 'D:\\C', 'D:\\A']);
    expect(onShowToast).not.toHaveBeenCalled();
  });

  it('retains focus on .grip-handle with aria-disabled="true" during pending reorder and blocks drag when isMutating/isScanning is true', async () => {
    const paths = ['D:\\GamesA', 'D:\\GamesB'];
    installRowRectMocks(paths);

    const deferredUpdate = makeDeferred<LibraryConfig>();
    const store = createUiRuntimeState(createMemoryStorage());
    const baseConfig: LibraryConfig = {
      libraryPaths: paths,
      libraryPath: paths[0],
      maxDepth: 5,
      autoLaunch: false,
      minimizeToTray: false,
    };
    store.setCurrentLibraryConfig(baseConfig);

    const api = createMockElectronAPI({
      updateLibraryConfig: vi.fn().mockImplementation(() => deferredUpdate.promise),
    });

    const { container } = render(
      <LibraryStateProvider store={store}>
        <NotificationProvider>
          <SettingsModal
            isOpen={true}
            onClose={vi.fn()}
            electronAPI={api}
            storage={createMemoryStorage()}
            targetPlatform="win32"
          />
        </NotificationProvider>
      </LibraryStateProvider>
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Library & Categories' }));

    const handle = document.querySelector('.grip-handle') as HTMLButtonElement;
    await keyboardDrag(handle, 'ArrowDown');

    // While updateLibraryConfig is pending, isMutating is true -> aria-disabled="true", NOT native disabled, focus retained
    expect(handle.getAttribute('aria-disabled')).toBe('true');
    expect(handle.hasAttribute('disabled')).toBe(false);
    expect(document.activeElement).toBe(handle);

    // Resolve pending update
    await act(async () => {
      deferredUpdate.resolve({ ...baseConfig, libraryPaths: ['D:\\GamesB', 'D:\\GamesA'] });
      await Promise.resolve();
    });

    expect(handle.getAttribute('aria-disabled')).toBe('false');
  });

  it('resolves folderAliases using normalized targetPlatform="win32" paths and omits blank/whitespace aliases', () => {
    const paths = ['C:\\Games\\VN', 'D:\\Other'];
    const { container } = render(
      <PathReorderList
        paths={paths}
        disabled={false}
        strings={strings}
        folderAliases={{
          'c:/games/vn': 'Visual Novels',
          'D:\\Other': '   ',
        }}
        targetPlatform="win32"
        pathListContainerRef={React.createRef()}
        pathItemRefs={{ current: new Map() }}
        onOpenPath={vi.fn()}
        onChangePath={vi.fn()}
        onRemovePath={vi.fn()}
      />
    );

    const aliases = Array.from(container.querySelectorAll('.library-path-alias'));
    expect(aliases).toHaveLength(1);
    expect(aliases[0].textContent).toBe('Visual Novels');
    expect(aliases[0].getAttribute('data-tooltip')).toBe('Visual Novels');
  });
});
