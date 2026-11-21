import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { LibraryGrid } from './LibraryGrid';
import { LibraryEmptyState } from './LibraryEmptyState';
import { LibraryStateProvider } from '../context/LibraryStateContext';
import { createUiRuntimeState, type ObservableUiRuntimeStore, type UiStorageAdapter } from '../state/ui-runtime-state';
import type { GameEntry } from '../types/game';
import type { ElectronAPI } from '../../shared/types/ipc';
import type { GameCardProps } from './GameCard';
import type { StackCardProps } from './StackCard';
import * as libraryOrderModule from '../library-order';
import * as libraryStacksModule from '../library-stacks';

function createMemoryStorage(initial: Record<string, string> = {}): UiStorageAdapter {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    getItem: vi.fn((key: string) => map.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      map.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      map.delete(key);
    }),
  };
}

function makeGame(overrides: Partial<GameEntry> = {}): GameEntry {
  const gameKey = overrides.gameKey ?? overrides.gameId ?? 'game-1';
  return {
    gameId: overrides.gameId ?? gameKey,
    gameKey,
    name: overrides.name ?? `Game ${gameKey}`,
    title: overrides.title ?? overrides.name ?? `Game ${gameKey}`,
    folderName: overrides.folderName ?? gameKey,
    relativePath: overrides.relativePath ?? gameKey,
    favorite: overrides.favorite ?? false,
    dateAdded: overrides.dateAdded ?? 1000,
    lastPlayed: overrides.lastPlayed ?? 0,
    playtime: overrides.playtime ?? 0,
    isRunning: overrides.isRunning ?? false,
    ...overrides,
  };
}

function makeStackGame(gameId: string, favorite = false): GameEntry {
  const inst1 = makeGame({
    gameId,
    gameKey: `${gameId}-inst-1`,
    instanceId: `${gameId}-inst-1`,
    name: `Stack ${gameId}`,
    title: `Stack ${gameId}`,
    relativePath: `a/${gameId}`,
    favorite,
    lastPlayed: 200,
  });
  const inst2 = makeGame({
    gameId,
    gameKey: `${gameId}-inst-2`,
    instanceId: `${gameId}-inst-2`,
    name: `Stack ${gameId}`,
    title: `Stack ${gameId}`,
    relativePath: `b/${gameId}`,
    favorite,
    lastPlayed: 100,
  });
  return makeGame({
    gameId,
    gameKey: `${gameId}-inst-1`,
    name: `Stack ${gameId}`,
    title: `Stack ${gameId}`,
    relativePath: `a/${gameId}`,
    favorite,
    primaryInstance: inst1,
    instances: [inst1, inst2],
  });
}

function createMockElectronAPI(overrides: Partial<ElectronAPI> = {}): ElectronAPI {
  return {
    toggleFavorite: vi.fn(async (_key: string, nextFav: boolean) => nextFav),
    setupLibrary: vi.fn(async () => true),
    ...overrides,
  } as unknown as ElectronAPI;
}

describe('LibraryGrid', () => {
  const originalResizeObserver = globalThis.ResizeObserver;

  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.ResizeObserver = class MockResizeObserver {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    } as unknown as typeof ResizeObserver;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 1200,
      height: 800,
      top: 0,
      left: 0,
      bottom: 800,
      right: 1200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
  });

  afterEach(() => {
    globalThis.ResizeObserver = originalResizeObserver;
  });

  function renderGrid(
    store: ObservableUiRuntimeStore,
    props: React.ComponentProps<typeof LibraryGrid> = {},
    options: { strictMode?: boolean } = {}
  ) {
    const ui = (
      <LibraryStateProvider store={store}>
        <LibraryGrid {...props} />
      </LibraryStateProvider>
    );
    return render(options.strictMode ? <React.StrictMode>{ui}</React.StrictMode> : ui);
  }

  it('groups multi-instance games into StackCard and single-instance games into GameCard with no draggable attributes', () => {
    const store = createUiRuntimeState(createMemoryStorage());
    const single = makeGame({ gameKey: 'solo', name: 'Solo Game' });
    const stack = makeStackGame('dup');
    store.setAllGames([single, stack]);

    const { container } = renderGrid(store);

    const grid = screen.getByTestId('library-grid');
    expect(grid).toBeTruthy();
    expect(grid.getAttribute('tabindex')).toBe('-1');
    expect(screen.getByText('Solo Game')).toBeTruthy();
    expect(screen.getByText('Stack dup')).toBeTruthy();
    expect(container.querySelectorAll('[draggable="true"]').length).toBe(0);
    expect(container.querySelectorAll('.stack-card').length).toBe(1);
    expect(container.querySelectorAll('.game-card:not(.stack-card)').length).toBe(1);
  });

  it('forwards containerRef to the outer library-grid container', () => {
    const store = createUiRuntimeState(createMemoryStorage());
    store.setAllGames([makeGame({ gameKey: 'g1' })]);
    const containerRef = React.createRef<HTMLDivElement | null>();

    renderGrid(store, { containerRef });

    expect(containerRef.current).toBe(screen.getByTestId('library-grid'));
    expect(containerRef.current?.classList.contains('library-grid')).toBe(true);
    expect(containerRef.current?.getAttribute('tabindex')).toBe('-1');
  });

  it('renders #favorites-separator between #fav-grid and #unfav-grid only when both partitions are non-empty', () => {
    const store = createUiRuntimeState(createMemoryStorage());
    store.setAllGames([
      makeGame({ gameKey: 'fav-1', name: 'Fav One', favorite: true }),
      makeGame({ gameKey: 'unfav-1', name: 'Unfav One', favorite: false }),
    ]);

    const { container, rerender } = renderGrid(store);

    const sep = container.querySelector('#favorites-separator');
    expect(sep).toBeTruthy();
    expect(sep?.classList.contains('favorites-separator-container')).toBe(true);
    expect(sep?.querySelector('.favorites-separator')).toBeTruthy();
    expect(container.querySelector('#fav-grid')?.textContent).toContain('Fav One');
    expect(container.querySelector('#unfav-grid')?.textContent).toContain('Unfav One');

    // Only favorites -> separator omitted
    act(() => {
      store.setAllGames([makeGame({ gameKey: 'fav-1', name: 'Fav One', favorite: true })]);
    });
    rerender(
      <LibraryStateProvider store={store}>
        <LibraryGrid />
      </LibraryStateProvider>
    );
    expect(container.querySelector('#favorites-separator')).toBeNull();

    // Only non-favorites -> separator omitted
    act(() => {
      store.setAllGames([makeGame({ gameKey: 'unfav-1', name: 'Unfav One', favorite: false })]);
    });
    expect(container.querySelector('#favorites-separator')).toBeNull();
  });

  it('restores focus via focusTargetKey to card ref, nearest visible sibling, or __GRID_CONTAINER__ and calls onFocusHandled', () => {
    const store = createUiRuntimeState(createMemoryStorage());
    store.setAllGames([
      makeGame({ gameKey: 'g1', name: 'Alpha' }),
      makeGame({ gameKey: 'g2', name: 'Beta' }),
    ]);
    const onFocusHandled = vi.fn();

    const { rerender } = renderGrid(store, { focusTargetKey: 'g2', onFocusHandled });

    expect(onFocusHandled).toHaveBeenCalledTimes(1);
    expect(document.activeElement?.textContent).toContain('Beta');

    rerender(
      <LibraryStateProvider store={store}>
        <LibraryGrid focusTargetKey="__GRID_CONTAINER__" onFocusHandled={onFocusHandled} />
      </LibraryStateProvider>
    );
    expect(onFocusHandled).toHaveBeenCalledTimes(2);
    expect(document.activeElement).toBe(screen.getByTestId('library-grid'));

    // Missing target falls back to nearest visible item before grid container
    rerender(
      <LibraryStateProvider store={store}>
        <LibraryGrid focusTargetKey="deleted-key" onFocusHandled={onFocusHandled} />
      </LibraryStateProvider>
    );
    expect(onFocusHandled).toHaveBeenCalledTimes(3);
    expect(document.activeElement?.textContent).toContain('Alpha');
  });

  it('forwards onMenuAction cleanly to both GameCard and StackCard', () => {
    const store = createUiRuntimeState(createMemoryStorage());
    store.setAllGames([
      makeGame({ gameKey: 'solo', name: 'Solo' }),
      makeStackGame('dup'),
    ]);
    const onMenuAction = vi.fn();
    const capturedGameCardProps: GameCardProps[] = [];
    const capturedStackCardProps: StackCardProps[] = [];

    const SpyGameCard = React.forwardRef<HTMLDivElement, GameCardProps>((props, ref) => {
      capturedGameCardProps.push(props);
      return (
        <div ref={ref} data-testid={`card-${props.game.gameKey}`}>
          <button type="button" onClick={() => props.onMenuAction?.('reveal', props.game)}>
            Reveal Solo
          </button>
        </div>
      );
    });
    const SpyStackCard = React.forwardRef<HTMLDivElement, StackCardProps>((props, ref) => {
      capturedStackCardProps.push(props);
      return (
        <div ref={ref} data-testid={`stack-${props.stack.groupKey}`}>
          <button type="button" onClick={() => props.onMenuAction?.('delete', props.stack.primaryGame)}>
            Delete Stack
          </button>
        </div>
      );
    });

    renderGrid(store, {
      onMenuAction,
      GameCardComponent: SpyGameCard,
      StackCardComponent: SpyStackCard,
    });

    fireEvent.click(screen.getByText('Reveal Solo'));
    fireEvent.click(screen.getByText('Delete Stack'));

    expect(onMenuAction).toHaveBeenCalledWith('reveal', expect.objectContaining({ gameKey: 'solo' }));
    expect(onMenuAction).toHaveBeenCalledWith('delete', expect.objectContaining({ gameKey: 'dup-inst-1' }));
  });

  it('executes optimistic favorite toggle with deferred promise, rollback on rejection, scrubbed console.error, and focus restoration', async () => {
    const store = createUiRuntimeState(createMemoryStorage());
    store.setAllGames([makeGame({ gameKey: 'g1', name: 'Alpha', favorite: false })]);

    let rejectPromise!: (err: Error) => void;
    const toggleFavorite = vi.fn(
      () =>
        new Promise<boolean>((_resolve, reject) => {
          rejectPromise = reject;
        })
    );
    const api = createMockElectronAPI({ toggleFavorite });
    const onFavoriteError = vi.fn();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { container } = renderGrid(store, { electronAPI: api, onFavoriteError });

    const favBtn = container.querySelector('#unfav-grid .fav-btn') as HTMLButtonElement;
    favBtn.focus();
    fireEvent.click(favBtn);

    // Immediate optimistic move to #fav-grid before promise settles
    expect(store.getSnapshot().allGames[0].favorite).toBe(true);
    expect(container.querySelector('#fav-grid .game-card')).toBeTruthy();
    expect(document.activeElement).toBe(container.querySelector('#fav-grid .fav-btn'));

    // Reject with personal path -> rollback, scrubbed log, error callback, focus restored to #unfav-grid
    await act(async () => {
      rejectPromise(new Error("EACCES: permission denied, open 'C:\\Users\\John Doe\\AppData\\Local\\game.db'"));
    });

    expect(store.getSnapshot().allGames[0].favorite).toBe(false);
    expect(container.querySelector('#unfav-grid .game-card')).toBeTruthy();
    expect(document.activeElement).toBe(container.querySelector('#unfav-grid .fav-btn'));
    expect(onFavoriteError).toHaveBeenCalledWith(expect.any(Error), 'g1');
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[LibraryGrid] Failed to toggle favorite:',
      expect.objectContaining({
        gameKey: 'g1',
        error: expect.stringContaining('<USER_DIR>'),
      })
    );
    const loggedPayload = JSON.stringify(consoleErrorSpy.mock.calls[0]);
    expect(loggedPayload).not.toContain('John Doe');
  });

  it('toggles favorite on StackCard using representativeKey for IPC, groupKey for store, and restores focus', async () => {
    const store = createUiRuntimeState(createMemoryStorage());
    store.setAllGames([makeStackGame('dup', false)]);

    const toggleFavorite = vi.fn(async (_key: string, nextFav?: boolean) => Boolean(nextFav));
    const api = createMockElectronAPI({ toggleFavorite });

    const { container } = renderGrid(store, { electronAPI: api });

    const favBtn = container.querySelector('#unfav-grid .fav-btn') as HTMLButtonElement;
    favBtn.focus();
    await act(async () => {
      fireEvent.click(favBtn);
    });

    expect(toggleFavorite).toHaveBeenCalledWith('dup-inst-1', true);
    expect(store.getSnapshot().allGames[0].favorite).toBe(true);
    expect(container.querySelector('#fav-grid .stack-card')).toBeTruthy();
    expect(document.activeElement).toBe(container.querySelector('#fav-grid .fav-btn'));
  });

  it('drops duplicate rapid favorite activations while an IPC request is in-flight', async () => {
    const store = createUiRuntimeState(createMemoryStorage());
    store.setAllGames([makeGame({ gameKey: 'g1', favorite: false })]);

    let resolvePromise!: (val: boolean) => void;
    const toggleFavorite = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolvePromise = resolve;
        })
    );
    const api = createMockElectronAPI({ toggleFavorite });

    const { container } = renderGrid(store, { electronAPI: api });

    const favBtn1 = container.querySelector('.fav-btn') as HTMLButtonElement;
    fireEvent.click(favBtn1);
    const favBtn2 = container.querySelector('.fav-btn') as HTMLButtonElement;
    fireEvent.click(favBtn2);

    expect(toggleFavorite).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolvePromise(true);
    });
    expect(store.getSnapshot().allGames[0].favorite).toBe(true);
  });

  it('rolls back and logs warning when backend returns contradictory favorite state', async () => {
    const store = createUiRuntimeState(createMemoryStorage());
    store.setAllGames([makeGame({ gameKey: 'g1', favorite: false })]);

    const toggleFavorite = vi.fn(async () => false);
    const api = createMockElectronAPI({ toggleFavorite });
    const onFavoriteError = vi.fn();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { container } = renderGrid(store, { electronAPI: api, onFavoriteError });

    await act(async () => {
      fireEvent.click(container.querySelector('.fav-btn') as HTMLButtonElement);
    });

    expect(store.getSnapshot().allGames[0].favorite).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      '[LibraryGrid] Backend rejected favorite toggle; rolling back optimistic state:',
      expect.objectContaining({ gameKey: 'g1', requested: true, backendState: false })
    );
    expect(onFavoriteError).toHaveBeenCalledTimes(1);
  });

  it('preserves memoization stability during 1-second playtime ticks (1 render for running game, 0 for unaffected) under StrictMode', () => {
    const store = createUiRuntimeState(createMemoryStorage());
    store.setAllGames([
      makeGame({ gameKey: 'running', name: 'Running Game', playtime: 1000, isRunning: true }),
      makeGame({ gameKey: 'idle', name: 'Idle Game', playtime: 500, isRunning: false }),
    ]);

    const renderSpy = vi.fn();
    const seenCallbacks = new Map<string, unknown>();
    const seenRefs = new Map<string, unknown>();

    const SpiedGameCard = React.memo(
      React.forwardRef<HTMLDivElement, GameCardProps>((props, ref) => {
        renderSpy(props.game.gameKey);
        if (!seenCallbacks.has(props.game.gameKey)) {
          seenCallbacks.set(props.game.gameKey, props.onToggleFavorite);
          seenRefs.set(props.game.gameKey, ref);
        } else {
          expect(Object.is(seenCallbacks.get(props.game.gameKey), props.onToggleFavorite)).toBe(true);
          expect(Object.is(seenRefs.get(props.game.gameKey), ref)).toBe(true);
        }
        return <div ref={ref}>{props.game.name}: {props.game.playtime}</div>;
      })
    );

    renderGrid(store, { GameCardComponent: SpiedGameCard }, { strictMode: true });
    renderSpy.mockClear();

    act(() => {
      store.updateGame('running', { playtime: 2000 });
    });

    // Under StrictMode React invokes render twice for the single updated card, and 0 times for idle
    expect(renderSpy.mock.calls.filter(([k]) => k === 'idle').length).toBe(0);
    expect(renderSpy.mock.calls.filter(([k]) => k === 'running').length).toBeGreaterThan(0);
    expect(screen.getByText('Running Game: 2000')).toBeTruthy();
  });

  it('preserves structural cache for identical categoryIds arrays and invalidates for sort-affecting fields', () => {
    const store = createUiRuntimeState(createMemoryStorage());
    store.setCurrentSort('az');
    store.setAllGames([
      makeGame({ gameKey: 'a', name: 'Alpha', title: 'Alpha', categoryIds: ['rpg'] }),
      makeGame({ gameKey: 'b', name: 'Beta', title: 'Beta', categoryIds: undefined }),
    ]);

    const buildSpy = vi.spyOn(libraryStacksModule, 'buildLibraryViewItems');
    renderGrid(store);
    const initialCalls = buildSpy.mock.calls.length;

    // Identical categoryIds new array instance and undefined vs [] -> no rebuild
    act(() => {
      store.updateGame('a', { categoryIds: ['rpg'] });
      store.updateGame('b', { categoryIds: [] });
    });
    expect(buildSpy.mock.calls.length).toBe(initialCalls);

    // Sort-affecting field change (title/name under 'az') -> rebuilds
    act(() => {
      store.updateGame('a', { name: 'Zeta', title: 'Zeta' });
    });
    expect(buildSpy.mock.calls.length).toBeGreaterThan(initialCalls);
  });

  it('preserves full instance list and stackSize > 1 on playtime ticks to non-representative child instances', () => {
    const store = createUiRuntimeState(createMemoryStorage());
    store.setAllGames([makeStackGame('dup', false)]);

    const seenStacks: libraryStacksModule.LibraryViewItem[] = [];
    const SpyStackCard = React.memo(
      React.forwardRef<HTMLDivElement, StackCardProps>((props, ref) => {
        seenStacks.push(props.stack);
        return <div ref={ref}>Stack size: {props.stack.stackSize}</div>;
      })
    );

    renderGrid(store, { StackCardComponent: SpyStackCard });
    expect(seenStacks[seenStacks.length - 1].stackSize).toBe(2);

    act(() => {
      store.updateGame('dup-inst-2', { playtime: 5000, isRunning: true });
    });

    const latest = seenStacks[seenStacks.length - 1];
    expect(latest.stackSize).toBe(2);
    expect(latest.games.length).toBe(2);
  });

  it('gates custom order resolution during steady-state playtime ticks and re-resolves on sort/prop/storage transitions', () => {
    const storage1 = createMemoryStorage({
      yumeshelf_custom_order: JSON.stringify({ schemaVersion: 1, order: ['g2', 'g1'] }),
    });
    const storage2 = createMemoryStorage({
      yumeshelf_custom_order: JSON.stringify({ schemaVersion: 1, order: ['g1', 'g2'] }),
    });
    const store = createUiRuntimeState(storage1);
    store.setCurrentSort('custom');
    store.setAllGames([
      makeGame({ gameKey: 'g1', name: 'One' }),
      makeGame({ gameKey: 'g2', name: 'Two' }),
    ]);

    const resolveSpy = vi.spyOn(libraryOrderModule, 'resolveCustomOrder');

    const { container, rerender } = renderGrid(store, { storage: storage1 });

    const getOrder = () =>
      Array.from(container.querySelectorAll('.game-title')).map((el) => el.textContent);

    expect(getOrder()).toEqual(['Two', 'One']);

    resolveSpy.mockClear();
    (storage1.getItem as ReturnType<typeof vi.fn>).mockClear();

    // Steady-state playtime tick -> 0 storage reads, 0 resolveCustomOrder calls, order preserved
    act(() => {
      store.updateGame('g1', { playtime: 1000, isRunning: true });
    });
    expect(storage1.getItem).not.toHaveBeenCalledWith('yumeshelf_custom_order');
    expect(resolveSpy).not.toHaveBeenCalled();
    expect(getOrder()).toEqual(['Two', 'One']);

    // Swapping storage adapter re-reads order from new instance
    rerender(
      <LibraryStateProvider store={store}>
        <LibraryGrid storage={storage2} />
      </LibraryStateProvider>
    );
    expect(getOrder()).toEqual(['One', 'Two']);

    // Explicit customOrder array -> undefined transitions back to storage
    rerender(
      <LibraryStateProvider store={store}>
        <LibraryGrid storage={storage1} customOrder={['g1', 'g2']} />
      </LibraryStateProvider>
    );
    expect(getOrder()).toEqual(['One', 'Two']);

    rerender(
      <LibraryStateProvider store={store}>
        <LibraryGrid storage={storage1} customOrder={undefined} />
      </LibraryStateProvider>
    );
    expect(getOrder()).toEqual(['Two', 'One']);
  });

  it('performs zero storage reads and zero redundant builds for empty collection views', () => {
    const storage = createMemoryStorage();
    const store = createUiRuntimeState(storage);
    store.setCurrentSort('custom');
    store.setAllGames([]);

    const buildSpy = vi.spyOn(libraryStacksModule, 'buildLibraryViewItems');
    (storage.getItem as ReturnType<typeof vi.fn>).mockClear();

    renderGrid(store, { storage });

    expect(storage.getItem).not.toHaveBeenCalledWith('yumeshelf_custom_order');
    expect(buildSpy).not.toHaveBeenCalled();
  });

  it('renders FilteredEmptyState when category filter matches 0 games and transfers focus to grid container on Clear Filter', () => {
    const store = createUiRuntimeState(createMemoryStorage());
    store.setAllGames([makeGame({ gameKey: 'g1', categoryIds: ['cat-a'] })]);
    store.setActiveCategoryId('cat-b');

    renderGrid(store);

    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    const clearBtn = screen.getByRole('button', { name: 'Clear Filter' });
    expect(clearBtn.classList.contains('secondary-btn')).toBe(true);

    clearBtn.focus();
    fireEvent.click(clearBtn);

    expect(store.getSnapshot().activeCategoryId).toBeNull();
    expect(document.activeElement).toBe(screen.getByTestId('library-grid'));
  });

  it('handles LibraryEmptyState 4-state lifecycle: idle, submitting spinner, duplicate suppression, focus handoff on success, and sanitized error + dismiss focus', async () => {
    const store = createUiRuntimeState(createMemoryStorage());
    store.setAllGames([]);

    let resolveSetup!: (val: boolean) => void;
    const setupLibrary = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveSetup = resolve;
        })
    );
    const api = createMockElectronAPI({ setupLibrary });
    const onRefreshLibrary = vi.fn(async () => {
      store.setAllGames([makeGame({ gameKey: 'new-1', name: 'New Game' })]);
    });

    renderGrid(store, { electronAPI: api, onRefreshLibrary });

    const chooseBtn = screen.getByRole('button', { name: 'Choose Folder' });
    chooseBtn.focus();
    fireEvent.click(chooseBtn);

    // Submitting state: loading copy, SVG spinner, aria-disabled="true", duplicate click suppressed
    expect(screen.getByText('Choosing Folder...')).toBeTruthy();
    expect(chooseBtn.getAttribute('aria-disabled')).toBe('true');
    expect(chooseBtn.querySelector('svg.loading-spin')).toBeTruthy();
    fireEvent.click(chooseBtn);
    expect(setupLibrary).toHaveBeenCalledTimes(1);

    // Resolve setup -> focus moves to library-grid before unmount
    await act(async () => {
      resolveSetup(true);
    });
    await waitFor(() => {
      expect(onRefreshLibrary).toHaveBeenCalledTimes(1);
    });
    expect(document.activeElement).toBe(screen.getByTestId('library-grid'));

    // Error state with PII sanitization & dismiss focus restoration
    const failingApi = createMockElectronAPI({
      setupLibrary: vi.fn(async () => {
        throw new Error("EACCES: permission denied, mkdir 'C:\\Users\\John Doe\\YumeShelf'");
      }),
    });
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<LibraryEmptyState electronAPI={failingApi} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Choose Folder' }));
    });

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('<USER_DIR>');
    expect(alert.textContent).not.toContain('John Doe');
    expect(JSON.stringify(consoleErrorSpy.mock.calls)).not.toContain('John Doe');

    const dismissBtn = screen.getByRole('button', { name: 'Dismiss setup error' });
    dismissBtn.focus();
    fireEvent.click(dismissBtn);

    expect(screen.queryByRole('alert')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Choose Folder' }));
  });

  it('enforces stylesheet contracts in base.css, save-editor.css, and game-cards.css', () => {
    const rootDir = resolve(__dirname, '../../..');
    const baseCss = readFileSync(resolve(rootDir, 'src/styles/base.css'), 'utf-8');
    const saveEditorCss = readFileSync(resolve(rootDir, 'src/styles/save-editor.css'), 'utf-8');
    const gameCardsCss = readFileSync(resolve(rootDir, 'src/styles/game-cards.css'), 'utf-8');

    expect(baseCss).toMatch(/\.primary-btn\s*\{[\s\S]*var\(--accent\)/);
    expect(baseCss).toMatch(/\.secondary-btn\s*\{[\s\S]*var\(--border-color\)/);
    expect(baseCss).toMatch(/\.secondary-btn\s*\{[\s\S]*var\(--text-main\)/);
    expect(baseCss).toMatch(/\.secondary-btn:hover\s*\{[\s\S]*var\(--hover-bg\)/);

    expect(saveEditorCss).not.toMatch(/^\s*\.primary-btn\s*\{/m);
    expect(saveEditorCss).not.toMatch(/^\s*\.secondary-btn\s*\{/m);
    expect(saveEditorCss).toMatch(/\.save-editor-panel\s+\.primary-btn[\s\S]*var\(--accent\)/);
    expect(saveEditorCss).toMatch(/\.save-editor-footer\s+\.secondary-btn/);

    expect(gameCardsCss).toMatch(/\.library-empty-state,[\s\S]*\.filtered-empty-state\s*\{[\s\S]*min-height:\s*280px/);
  });

  it('wraps grids in #game-grid-wrapper with .drop-zone, enables showPath/showDuplicateChip/double-launch, and attaches card tooltip attributes', () => {
    const store = createUiRuntimeState();
    const g1 = makeGame({
      gameKey: 'g-1',
      name: 'Alpha Quest',
      favorite: true,
      duplicateCount: 2,
      relativePathDisplay: '/Games/RPG',
      relativePathFullDisplay: 'D:/Games/RPG/Alpha',
    });
    const g2 = makeGame({ gameKey: 'g-2', name: 'Beta Quest', favorite: false });
    store.setAllGames([g1, g2]);

    const onLaunch = vi.fn();
    const { container } = renderGrid(store, { onLaunch });

    const wrapper = container.querySelector('#game-grid-wrapper');
    expect(wrapper).toBeInTheDocument();
    expect(wrapper?.querySelector('#fav-grid')).toHaveClass('game-grid', 'grid-section', 'drop-zone');
    expect(wrapper?.querySelector('#unfav-grid')).toHaveClass('game-grid', 'grid-section', 'drop-zone');

    const favCard = wrapper?.querySelector('#fav-grid .game-card') as HTMLElement;
    expect(favCard.querySelector('.game-duplicate-chip')).toHaveTextContent('2x');
    expect(favCard.querySelector('.game-path')).toHaveTextContent('/Games/RPG');
    expect(favCard).toHaveAttribute('data-tooltip', 'Alpha Quest');
    expect(favCard).toHaveAttribute('data-tooltip-subtitle', 'D:/Games/RPG/Alpha');

    fireEvent.click(favCard);
    expect(onLaunch).not.toHaveBeenCalled();
    fireEvent.doubleClick(favCard);
    expect(onLaunch).toHaveBeenCalledWith(expect.objectContaining({ gameKey: 'g-1' }));
  });
});
