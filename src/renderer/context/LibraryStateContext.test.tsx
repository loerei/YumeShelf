import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { LibraryStateProvider } from './LibraryStateContext';
import {
  areSearchableGamesEqual,
  selectSearchableGames,
  useActiveCategoryId,
  useAllGames,
  useCategoryTree,
  useCurrentSort,
  useLibraryDispatch,
  useLibrarySelector,
  useLibraryState,
  useLibraryStore,
  useLocationDisplayMode,
  useSearchableGames,
} from '../hooks/useLibraryState';
import {
  createUiRuntimeState,
  type ObservableUiRuntimeStore,
  type SearchableGameItem,
  type UiRuntimeSnapshot,
  type UiStorageAdapter,
} from '../state/ui-runtime-state';
import type { GameEntry } from '../types/game';

function createMemoryStorage(): UiStorageAdapter {
  const map = new Map<string, string>();
  return {
    getItem: (key) => (map.has(key) ? map.get(key)! : null),
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

function makeGame(overrides: Partial<GameEntry> = {}): GameEntry {
  return {
    gameKey: 'game-1',
    name: 'Test Game',
    playtime: 0,
    favorite: false,
    ...overrides,
  };
}

describe('LibraryStateContext and useLibraryState hooks', () => {
  it('re-renders components subscribed to useLibraryState on store updates including updateGame', () => {
    const store = createUiRuntimeState(createMemoryStorage());
    store.setAllGames([makeGame({ gameKey: 'game-1', name: 'Original Name', favorite: false })]);

    function Consumer() {
      const state = useLibraryState();
      const game = state.allGames[0];
      return (
        <div>
          <span data-testid="game-name">{game?.name ?? 'none'}</span>
          <span data-testid="game-fav">{String(Boolean(game?.favorite))}</span>
          <span data-testid="sort">{state.currentSort}</span>
        </div>
      );
    }

    render(
      <LibraryStateProvider store={store}>
        <Consumer />
      </LibraryStateProvider>
    );

    expect(screen.getByTestId('game-name')).toHaveTextContent('Original Name');
    expect(screen.getByTestId('game-fav')).toHaveTextContent('false');

    act(() => {
      store.updateGame('game-1', { name: 'Updated Name', favorite: true });
    });

    expect(screen.getByTestId('game-name')).toHaveTextContent('Updated Name');
    expect(screen.getByTestId('game-fav')).toHaveTextContent('true');

    act(() => {
      store.setCurrentSort('az');
    });

    expect(screen.getByTestId('sort')).toHaveTextContent('az');
  });

  it('preserves snapshot referential stability across consecutive renders without store mutations', () => {
    const store = createUiRuntimeState(createMemoryStorage());
    const observedSnapshots: UiRuntimeSnapshot[] = [];

    function SnapshotReader({ tick }: { tick: number }) {
      const snapshot = useLibrarySelector((s) => s);
      observedSnapshots.push(snapshot);
      return <div data-testid="tick">{tick}</div>;
    }

    const { rerender } = render(
      <LibraryStateProvider store={store}>
        <SnapshotReader tick={1} />
      </LibraryStateProvider>
    );

    rerender(
      <LibraryStateProvider store={store}>
        <SnapshotReader tick={2} />
      </LibraryStateProvider>
    );

    expect(observedSnapshots.length).toBeGreaterThanOrEqual(2);
    expect(Object.is(observedSnapshots[0], observedSnapshots[observedSnapshots.length - 1])).toBe(true);
  });

  it('supports hermetic test isolation via injected mock store and preserves default store when omitted', () => {
    const mockStore = createUiRuntimeState(createMemoryStorage());
    mockStore.setAllGames([makeGame({ gameKey: 'isolated-1', name: 'Hermetic Game' })]);

    const observedStores: ObservableUiRuntimeStore[] = [];

    function StoreSpy() {
      const store = useLibraryStore();
      const games = useAllGames();
      observedStores.push(store);
      return <div data-testid="isolated-name">{games[0]?.name ?? 'empty'}</div>;
    }

    render(
      <LibraryStateProvider store={mockStore}>
        <StoreSpy />
      </LibraryStateProvider>
    );

    expect(screen.getByTestId('isolated-name')).toHaveTextContent('Hermetic Game');
    expect(observedStores[0]).toBe(mockStore);

    observedStores.length = 0;

    function DefaultStoreSpy({ label }: { label: string }) {
      const store = useLibraryStore();
      observedStores.push(store);
      return <div data-testid="default-label">{label}</div>;
    }

    const { rerender } = render(
      <LibraryStateProvider>
        <DefaultStoreSpy label="first" />
      </LibraryStateProvider>
    );

    rerender(
      <LibraryStateProvider>
        <DefaultStoreSpy label="second" />
      </LibraryStateProvider>
    );

    expect(observedStores.length).toBeGreaterThanOrEqual(2);
    expect(observedStores[0]).toBe(observedStores[observedStores.length - 1]);
  });

  it('detaches store subscribers cleanly on unmount with zero leaks', () => {
    const baseStore = createUiRuntimeState(createMemoryStorage());
    const activeListeners = new Set<() => void>();
    const unsubscribeSpies: Array<ReturnType<typeof vi.fn>> = [];

    const trackedStore: ObservableUiRuntimeStore = {
      ...baseStore,
      subscribe(listener) {
        activeListeners.add(listener);
        const baseUnsub = baseStore.subscribe(listener);
        const unsubSpy = vi.fn(() => {
          activeListeners.delete(listener);
          baseUnsub();
        });
        unsubscribeSpies.push(unsubSpy);
        return unsubSpy;
      },
      getSnapshot: () => baseStore.getSnapshot(),
    };

    function Subscriber() {
      const sort = useCurrentSort();
      const games = useAllGames();
      return (
        <div>
          {sort}:{games.length}
        </div>
      );
    }

    const { unmount } = render(
      <LibraryStateProvider store={trackedStore}>
        <Subscriber />
      </LibraryStateProvider>
    );

    expect(activeListeners.size).toBeGreaterThan(0);

    unmount();

    expect(activeListeners.size).toBe(0);
    for (const spy of unsubscribeSpies) {
      expect(spy).toHaveBeenCalledTimes(1);
    }
  });

  it('causes 0 re-renders and 0 selector reference changes across 60 consecutive 1s playtime ticks in unrelated granular selectors', () => {
    const store = createUiRuntimeState(createMemoryStorage());
    store.setAllGames([
      makeGame({
        gameKey: 'game-1',
        name: 'Visual Novel',
        iconUrl: 'yume-icon://game-1',
        playtime: 0,
        isRunning: true,
      }),
    ]);

    let sortRenders = 0;
    let categoryRenders = 0;
    let searchableRenders = 0;
    let dispatchRenders = 0;

    const observedSearchableRefs: Array<readonly SearchableGameItem[]> = [];
    const observedDispatchRefs: Array<ReturnType<typeof useLibraryDispatch>> = [];

    function SortConsumer() {
      sortRenders += 1;
      const sort = useCurrentSort();
      return <span data-testid="sort-val">{sort}</span>;
    }

    function CategoryConsumer() {
      categoryRenders += 1;
      const activeId = useActiveCategoryId();
      return <span data-testid="cat-val">{activeId ?? 'all'}</span>;
    }

    function SearchableConsumer() {
      searchableRenders += 1;
      const items = useSearchableGames();
      observedSearchableRefs.push(items);
      return <span data-testid="search-count">{items.length}</span>;
    }

    function DispatchConsumer() {
      dispatchRenders += 1;
      const dispatch = useLibraryDispatch();
      observedDispatchRefs.push(dispatch);
      return <span data-testid="dispatch-ok">ok</span>;
    }

    render(
      <LibraryStateProvider store={store}>
        <SortConsumer />
        <CategoryConsumer />
        <SearchableConsumer />
        <DispatchConsumer />
      </LibraryStateProvider>
    );

    expect(sortRenders).toBe(1);
    expect(categoryRenders).toBe(1);
    expect(searchableRenders).toBe(1);
    expect(dispatchRenders).toBe(1);

    const initialSearchableRef = observedSearchableRefs[0];
    const initialDispatchRef = observedDispatchRefs[0];

    act(() => {
      for (let tick = 0; tick < 60; tick++) {
        store.updateGamePlaytime('game-1', (tick + 1) * 1000);
      }
    });

    expect(store.getSnapshot().allGames[0].playtime).toBe(60000);
    expect(sortRenders).toBe(1);
    expect(categoryRenders).toBe(1);
    expect(searchableRenders).toBe(1);
    expect(dispatchRenders).toBe(1);
    expect(observedSearchableRefs).toHaveLength(1);
    expect(observedSearchableRefs[0]).toBe(initialSearchableRef);
    expect(observedDispatchRefs[0]).toBe(initialDispatchRef);
  });

  it('re-renders granular selectors only when their subscribed slice changes', () => {
    const store = createUiRuntimeState(createMemoryStorage());
    store.setAllGames([makeGame({ gameKey: 'g1', name: 'Alpha', iconUrl: 'icon://a' })]);

    function GranularView() {
      const categoryTree = useCategoryTree();
      const activeCategoryId = useActiveCategoryId();
      const locationMode = useLocationDisplayMode();
      const searchable = useSearchableGames();
      const dispatch = useLibraryDispatch();

      return (
        <div>
          <span data-testid="tree-len">{categoryTree.length}</span>
          <span data-testid="active-cat">{activeCategoryId ?? 'none'}</span>
          <span data-testid="loc-mode">{locationMode}</span>
          <span data-testid="search-name">{searchable[0]?.name ?? ''}</span>
          <button
            type="button"
            onClick={() => dispatch.setLocationDisplayMode('full')}
          >
            toggle-loc
          </button>
        </div>
      );
    }

    render(
      <LibraryStateProvider store={store}>
        <GranularView />
      </LibraryStateProvider>
    );

    expect(screen.getByTestId('tree-len')).toHaveTextContent('0');
    expect(screen.getByTestId('active-cat')).toHaveTextContent('none');
    expect(screen.getByTestId('loc-mode')).toHaveTextContent('parent');
    expect(screen.getByTestId('search-name')).toHaveTextContent('Alpha');

    act(() => {
      store.setCategoryTree([{ id: 'cat-1', name: 'RPG' }]);
      store.setActiveCategoryId('cat-1');
      store.updateGame('g1', { name: 'Beta' });
      store.setLocationDisplayMode('full');
    });

    expect(screen.getByTestId('tree-len')).toHaveTextContent('1');
    expect(screen.getByTestId('active-cat')).toHaveTextContent('cat-1');
    expect(screen.getByTestId('loc-mode')).toHaveTextContent('full');
    expect(screen.getByTestId('search-name')).toHaveTextContent('Beta');
  });

  it('throws descriptive errors when hooks are used outside LibraryStateProvider', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    function OutsideStore() {
      useLibraryStore();
      return null;
    }

    function OutsideDispatch() {
      useLibraryDispatch();
      return null;
    }

    expect(() => render(<OutsideStore />)).toThrow(
      'useLibraryStore must be used within LibraryStateProvider'
    );
    expect(() => render(<OutsideDispatch />)).toThrow(
      'useLibraryDispatch must be used within LibraryStateProvider'
    );

    consoleErrorSpy.mockRestore();
  });

  it('compares SearchableGameItem arrays structurally in areSearchableGamesEqual and re-exports selectSearchableGames', () => {
    const store = createUiRuntimeState(createMemoryStorage());
    store.setAllGames([makeGame({ gameKey: 'g1', name: 'One', iconUrl: 'icon://1' })]);
    const listA = selectSearchableGames(store.getSnapshot());
    const listB = selectSearchableGames(store.getSnapshot());

    expect(areSearchableGamesEqual(listA, listA)).toBe(true);
    expect(areSearchableGamesEqual(listA, listB)).toBe(true);
    expect(
      areSearchableGamesEqual(listA, [{ gameKey: 'g1', name: 'Two', iconUrl: 'icon://1' }])
    ).toBe(false);
    expect(
      areSearchableGamesEqual(listA, [{ gameKey: 'g2', name: 'One', iconUrl: 'icon://1' }])
    ).toBe(false);
    expect(
      areSearchableGamesEqual(listA, [{ gameKey: 'g1', name: 'One', iconUrl: 'icon://2' }])
    ).toBe(false);
    expect(areSearchableGamesEqual(listA, [])).toBe(false);
  });
});
