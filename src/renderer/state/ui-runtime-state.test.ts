import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  CANONICAL_SORT_OPTIONS,
  createUiRuntimeState,
  selectSearchableGames,
  type UiStorageAdapter,
} from './ui-runtime-state';
import type { GameEntry, LibraryConfig } from '../types/game';
import type { CategoryNode } from '../domain/category-tree';

function createMemoryStorage(
  initial: Record<string, string> = {}
): UiStorageAdapter & { data: Map<string, string>; setItemSpy: ReturnType<typeof vi.fn>; removeItemSpy: ReturnType<typeof vi.fn> } {
  const data = new Map<string, string>(Object.entries(initial));
  const setItemSpy = vi.fn((key: string, value: string) => {
    data.set(key, value);
  });
  const removeItemSpy = vi.fn((key: string) => {
    data.delete(key);
  });
  return {
    data,
    setItemSpy,
    removeItemSpy,
    getItem(key: string): string | null {
      return data.has(key) ? data.get(key)! : null;
    },
    setItem: setItemSpy,
    removeItem: removeItemSpy,
  };
}

function makeSingleGame(overrides: Partial<GameEntry> = {}): GameEntry {
  return {
    gameKey: 'g1',
    gameId: '1001',
    name: 'Game One',
    playtime: 1000,
    favorite: false,
    isRunning: false,
    ...overrides,
  };
}

function makeMultiInstanceStack(): GameEntry {
  const inst1: GameEntry = {
    gameKey: 'stack-inst-1',
    instanceId: 'inst-1',
    gameId: '5000',
    name: 'Stack Primary',
    playtime: 500,
    favorite: false,
    isRunning: false,
  };
  const inst2: GameEntry = {
    gameKey: 'stack-inst-2',
    instanceId: 'inst-2',
    gameId: '5000',
    name: 'Stack Secondary',
    playtime: 300,
    favorite: false,
    isRunning: false,
  };
  return {
    gameKey: 'stack-root',
    gameId: '5000',
    name: 'Stack Primary',
    playtime: 800,
    favorite: false,
    isRunning: false,
    primaryInstance: inst1,
    instances: [inst1, inst2],
  };
}

describe('ObservableUiRuntimeStore (createUiRuntimeState)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('preserves snapshot referential stability across consecutive getSnapshot calls and no-op updates', () => {
    const storage = createMemoryStorage();
    const store = createUiRuntimeState(storage);
    const listener = vi.fn();
    store.subscribe(listener);

    const s1 = store.getSnapshot();
    const s2 = store.getSnapshot();
    expect(Object.is(s1, s2)).toBe(true);

    store.setAllGames([makeSingleGame()]);
    const s3 = store.getSnapshot();
    expect(Object.is(s1, s3)).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);

    // Non-matching key updateGame is a no-op
    store.updateGame('non-existent', { name: 'Nope' });
    expect(Object.is(store.getSnapshot(), s3)).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);

    // Falsy/non-string keys or invalid patch objects are dropped
    store.updateGame('', { name: 'Empty' });
    store.updateGame(null as unknown as string, { name: 'Null' });
    store.updateGame('g1', null as unknown as Partial<GameEntry>);
    store.setGameRunning('', true);
    store.setGameRunning(undefined as unknown as string, true);
    expect(Object.is(store.getSnapshot(), s3)).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('notifies subscribers on every state mutator and detaches on unsubscribe', () => {
    const storage = createMemoryStorage();
    const store = createUiRuntimeState(storage);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.setAllGames([makeSingleGame()]);
    store.setCategoryTree([{ id: 'c1', name: 'Cat 1' }]);
    store.setActiveCategoryId('c1');
    store.setCurrentSort('az');
    store.setCurrentLibraryConfig({
      libraryPaths: ['D:/Games'],
      libraryPath: 'D:/Games',
      maxDepth: 2,
      autoLaunch: false,
      minimizeToTray: false,
    } satisfies LibraryConfig);
    store.setLocationDisplayMode('full');
    store.updateGame('g1', { favorite: true });
    store.setGameRunning('g1', true);
    store.updateGamePlaytime('g1', 500);

    expect(listener).toHaveBeenCalledTimes(9);

    unsubscribe();
    store.setCurrentSort('played');
    expect(listener).toHaveBeenCalledTimes(9);
  });

  it('computes selectSearchableGames purely from snapshot without denormalized state on UiRuntimeSnapshot', () => {
    const store = createUiRuntimeState(createMemoryStorage());
    const g1 = makeSingleGame({ gameKey: 'g1', name: 'Alpha', iconUrl: 'icon://a' });
    store.setAllGames([g1]);

    const snap1 = store.getSnapshot();
    expect('searchableGames' in snap1).toBe(false);
    expect(selectSearchableGames(snap1)).toEqual([
      { gameKey: 'g1', name: 'Alpha', iconUrl: 'icon://a' },
    ]);

    store.updateGame('g1', { name: 'Alpha Updated' });
    const snap2 = store.getSnapshot();
    expect(snap2.categoryTree).toBe(snap1.categoryTree);
    expect(selectSearchableGames(snap2)).toEqual([
      { gameKey: 'g1', name: 'Alpha Updated', iconUrl: 'icon://a' },
    ]);
  });

  it('setAllGames preserves active running state and basePlaytime, evicts removed keys, and preserves untouched element identity', () => {
    const store = createUiRuntimeState(createMemoryStorage());
    const g1 = makeSingleGame({ gameKey: 'g1', gameId: '101', playtime: 1000 });
    const g2 = makeSingleGame({ gameKey: 'g2', gameId: '102', playtime: 2000 });
    store.setAllGames([g1, g2]);

    store.updateGamePlaytime('g1', 500);
    expect(store.getSnapshot().allGames[0].isRunning).toBe(true);
    expect(store.getSnapshot().allGames[0].basePlaytime).toBe(1000);

    // Reload with reordered & reduced list: g2 moved to index 0, g1 kept at index 1, g3 added
    const g1Reloaded = makeSingleGame({ gameKey: 'g1', gameId: '101', playtime: 1000 });
    store.setAllGames([g2, g1Reloaded]);

    const snapAfterReload = store.getSnapshot();
    expect(Object.is(snapAfterReload.allGames[0], g2)).toBe(true);
    expect(snapAfterReload.allGames[1].isRunning).toBe(true);
    expect(snapAfterReload.allGames[1].basePlaytime).toBe(1000);

    // Move g2 update works at new index 0
    store.updateGame('g2', { favorite: true });
    expect(store.getSnapshot().allGames[0].favorite).toBe(true);

    // Remove g2 completely -> g2 key is evicted from index map
    store.setAllGames([g1Reloaded]);
    const snapRemoved = store.getSnapshot();
    const listener = vi.fn();
    store.subscribe(listener);
    store.updateGame('g2', { name: 'Should Not Match' });
    store.setGameRunning('g2', true);
    expect(Object.is(store.getSnapshot(), snapRemoved)).toBe(true);
    expect(listener).toHaveBeenCalledTimes(0);
  });

  it('updateGame isolates child instance name updates in multi-instance stacks while propagating favorite across all siblings', () => {
    const store = createUiRuntimeState(createMemoryStorage());
    store.setAllGames([makeMultiInstanceStack()]);

    // Rename primary child instance -> only targeted instance changes
    store.updateGame('stack-inst-1', { name: 'Renamed Primary Child' });
    const afterRename = store.getSnapshot().allGames[0];
    expect(afterRename.instances?.[0].name).toBe('Renamed Primary Child');
    expect(afterRename.instances?.[1].name).toBe('Stack Secondary');
    expect(afterRename.primaryInstance?.name).toBe('Renamed Primary Child');

    // Toggle favorite on child instance -> propagates across all siblings and parent
    store.updateGame('stack-inst-2', { favorite: true });
    const afterFav = store.getSnapshot().allGames[0];
    expect(afterFav.favorite).toBe(true);
    expect(afterFav.instances?.[0].favorite).toBe(true);
    expect(afterFav.instances?.[1].favorite).toBe(true);
    expect(afterFav.primaryInstance?.favorite).toBe(true);
  });

  it('supports synthetic group keys (game:12345) when gameKey is empty or unassigned', () => {
    const store = createUiRuntimeState(createMemoryStorage());
    store.setAllGames([
      makeSingleGame({ gameKey: '', gameId: '12345', isRunning: false, favorite: false }),
    ]);

    store.updateGame('game:12345', { favorite: true });
    expect(store.getSnapshot().allGames[0].favorite).toBe(true);

    store.setGameRunning('game:12345', true);
    expect(store.getSnapshot().allGames[0].isRunning).toBe(true);
  });

  it('setGameRunning synchronizes multi-instance parent aggregates, single-instance wrappers, and clears basePlaytime on stop', () => {
    const store = createUiRuntimeState(createMemoryStorage());
    const stack = makeMultiInstanceStack();
    const singleWrapped: GameEntry = {
      gameKey: '',
      gameId: '12345',
      name: 'Single Wrapped',
      playtime: 100,
      isRunning: false,
      primaryInstance: { gameKey: 'sw-1', gameId: '12345', name: 'Single Wrapped', isRunning: false },
      instances: [{ gameKey: 'sw-1', gameId: '12345', name: 'Single Wrapped', isRunning: false }],
    };
    store.setAllGames([stack, singleWrapped]);

    // Calling setGameRunning with stack.gameId on multi-instance stack does NOT mark primaryInstance running
    store.setGameRunning('5000', true);
    expect(store.getSnapshot().allGames[0].primaryInstance?.isRunning).toBe(false);
    expect(store.getSnapshot().allGames[0].isRunning).toBe(false);

    // Start child 1 and child 2
    store.setGameRunning('stack-inst-1', true);
    expect(store.getSnapshot().allGames[0].isRunning).toBe(true);
    expect(store.getSnapshot().allGames[0].instances?.[0].isRunning).toBe(true);
    expect(store.getSnapshot().allGames[0].primaryInstance?.isRunning).toBe(true);

    store.setGameRunning('stack-inst-2', true);
    // Stop child 1 while child 2 is still running -> parent stays running
    store.setGameRunning('stack-inst-1', false);
    expect(store.getSnapshot().allGames[0].isRunning).toBe(true);
    expect(store.getSnapshot().allGames[0].instances?.[0].isRunning).toBe(false);

    // Stop child 2 -> parent transitions to false and clears basePlaytime
    store.setGameRunning('stack-inst-2', false);
    expect(store.getSnapshot().allGames[0].isRunning).toBe(false);
    expect(store.getSnapshot().allGames[0].basePlaytime).toBeUndefined();

    // Single-instance wrapped record via synthetic group key
    store.setGameRunning('game:12345', true);
    expect(store.getSnapshot().allGames[1].isRunning).toBe(true);
    expect(store.getSnapshot().allGames[1].primaryInstance?.isRunning).toBe(true);
    expect(store.getSnapshot().allGames[1].instances?.[0].isRunning).toBe(true);

    store.setGameRunning('game:12345', false);
    expect(store.getSnapshot().allGames[1].isRunning).toBe(false);
    expect(store.getSnapshot().allGames[1].primaryInstance?.isRunning).toBe(false);
    expect(store.getSnapshot().allGames[1].instances?.[0].isRunning).toBe(false);
  });

  it('updateGamePlaytime calculates non-drifting basePlaytime + accruedMs, transitions non-running games to running, and does not mutate lastPlayed', () => {
    const store = createUiRuntimeState(createMemoryStorage());
    const singleInst: GameEntry = {
      gameKey: 'single-1',
      gameId: '700',
      name: 'Single',
      playtime: 1000,
      lastPlayed: 99999,
      isRunning: false,
      primaryInstance: { gameKey: 'single-1', name: 'Single', playtime: 1000, isRunning: false },
      instances: [{ gameKey: 'single-1', name: 'Single', playtime: 1000, isRunning: false }],
    };
    const stack = makeMultiInstanceStack();
    store.setAllGames([singleInst, stack]);

    // First tick from non-running state
    store.updateGamePlaytime('single-1', 250);
    let g0 = store.getSnapshot().allGames[0];
    expect(g0.isRunning).toBe(true);
    expect(g0.basePlaytime).toBe(1000);
    expect(g0.playtime).toBe(1250);
    expect(g0.lastPlayed).toBe(99999);
    expect(g0.instances?.[0].playtime).toBe(1250);
    expect(g0.primaryInstance?.playtime).toBe(1250);

    // Second tick: cumulative accruedMs = 600 -> 1000 + 600 = 1600 (no drift!)
    store.updateGamePlaytime('single-1', 600);
    g0 = store.getSnapshot().allGames[0];
    expect(g0.playtime).toBe(1600);
    expect(g0.basePlaytime).toBe(1000);

    // Multi-instance child playtime update
    store.updateGamePlaytime('stack-inst-2', 400);
    const g1 = store.getSnapshot().allGames[1];
    expect(g1.instances?.[1].playtime).toBe(700);
    expect(g1.instances?.[1].isRunning).toBe(true);
    expect(g1.playtime).toBe(500 + 700);
    expect(g1.isRunning).toBe(true);
  });

  it('validates setCategoryTree relational integrity with activeCategoryId and persists category/sort/location prefs via UiStorageAdapter', () => {
    const storage = createMemoryStorage({
      yumeshelf_active_category_id: '   ',
      yumeshelf_sort_pref: 'invalid_sort',
      yumeshelf_location_display_mode: 'full',
    });

    const store = createUiRuntimeState(storage);
    expect(CANONICAL_SORT_OPTIONS.has('az')).toBe(true);
    expect(store.getSnapshot().activeCategoryId).toBeNull();
    expect(store.getSnapshot().currentSort).toBe('date');
    expect(store.getSnapshot().locationDisplayMode).toBe('full');
    expect(storage.setItemSpy).not.toHaveBeenCalled();

    const tree: CategoryNode[] = [
      { id: 'root', name: 'Root', children: [{ id: 'child-1', name: 'Child 1' }] },
    ];
    store.setCategoryTree(tree);
    store.setActiveCategoryId('child-1');
    expect(storage.getItem('yumeshelf_active_category_id')).toBe('child-1');

    // Tree containing child-1 preserves activeCategoryId without touching storage
    storage.removeItemSpy.mockClear();
    store.setCategoryTree([{ id: 'root', name: 'Root', children: [{ id: 'child-1', name: 'Child 1' }] }]);
    expect(store.getSnapshot().activeCategoryId).toBe('child-1');
    expect(storage.removeItemSpy).not.toHaveBeenCalled();

    // Tree without child-1 resets activeCategoryId to null and removes from storage
    store.setCategoryTree([{ id: 'other', name: 'Other' }]);
    expect(store.getSnapshot().activeCategoryId).toBeNull();
    expect(storage.getItem('yumeshelf_active_category_id')).toBeNull();

    store.setCurrentSort('played');
    expect(storage.getItem('yumeshelf_sort_pref')).toBe('played');

    store.setLocationDisplayMode('parent');
    expect(storage.getItem('yumeshelf_location_display_mode')).toBe('parent');
  });

  it('handles throwing UiStorageAdapter gracefully across all storage-interacting mutators', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const throwingStorage: UiStorageAdapter = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('QuotaExceededError');
      },
      removeItem: () => {
        throw new DOMException('QuotaExceededError');
      },
    };

    const store = createUiRuntimeState(throwingStorage);
    const listener = vi.fn();
    store.subscribe(listener);

    // 1. setActiveCategoryId (setItem throws)
    const s0 = store.getSnapshot();
    expect(() => store.setActiveCategoryId('cat-x')).not.toThrow();
    const s1 = store.getSnapshot();
    expect(s1.activeCategoryId).toBe('cat-x');
    expect(Object.is(s0, s1)).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);

    // 2. setCurrentSort (setItem throws)
    expect(() => store.setCurrentSort('az')).not.toThrow();
    const s2 = store.getSnapshot();
    expect(s2.currentSort).toBe('az');
    expect(Object.is(s1, s2)).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);

    // 3. setLocationDisplayMode (setItem throws)
    expect(() => store.setLocationDisplayMode('full')).not.toThrow();
    const s3 = store.getSnapshot();
    expect(s3.locationDisplayMode).toBe('full');
    expect(Object.is(s2, s3)).toBe(false);
    expect(listener).toHaveBeenCalledTimes(3);

    // 4. setCategoryTree mismatch reset (removeItem throws)
    expect(() => store.setCategoryTree([{ id: 'other', name: 'Other' }])).not.toThrow();
    const s4 = store.getSnapshot();
    expect(s4.activeCategoryId).toBeNull();
    expect(Object.is(s3, s4)).toBe(false);
    expect(listener).toHaveBeenCalledTimes(4);

    expect(warnSpy).toHaveBeenCalledTimes(4);
    for (const call of warnSpy.mock.calls) {
      expect(call[0]).toContain('[ObservableUiRuntimeStore]');
    }
  });

  it('provides LegacyUiRuntimeShim getters and drag no-op stubs', () => {
    const store = createUiRuntimeState(createMemoryStorage());
    store.setAllGames([makeSingleGame()]);
    expect(store.getAllGames()).toHaveLength(1);
    expect(store.getActiveCategoryId()).toBeNull();
    expect(store.getCurrentSort()).toBe('date');
    expect(store.getCategoryTree()).toEqual([]);
    expect(store.getCurrentLibraryConfig()).toBeNull();
    expect(store.getDraggedGameFolder()).toBeNull();
    store.setDraggedGameFolder('foo');
    expect(store.getDraggedGameFolder()).toBeNull();
    expect(store.getDragTargetInfo()).toBeNull();
    store.setDragTargetInfo({ id: '1' });
    expect(store.getDragTargetInfo()).toBeNull();
  });
});
