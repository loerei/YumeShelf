import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { GameEntry } from './types/game';
import type { UiStorageAdapter } from './state/ui-runtime-state';
import { writeCustomOrder } from './library-order';
import {
  buildGroupKey,
  buildLibraryViewItems,
  findGameEntryByKey,
  patchRunningGameViewItem,
  resolveFavoriteLockKey,
  resolveStackByGroupKey,
} from './library-stacks';

function makeGame(overrides: Partial<GameEntry> & { gameKey: string }): GameEntry {
  return {
    name: overrides.name ?? overrides.gameKey,
    ...overrides,
  };
}

describe('library-stacks', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('buildGroupKey', () => {
    it('prefixes unprefixed keys and avoids double-prefixing game: keys', () => {
      expect(buildGroupKey(makeGame({ gameKey: 'abc' }))).toBe('game:abc');
      expect(buildGroupKey(makeGame({ gameKey: 'game:abc' }))).toBe('game:abc');
    });
  });

  describe('buildLibraryViewItems', () => {
    it('returns single and stack items with favorite flags without mutating input domain records', () => {
      const inst1 = makeGame({
        gameKey: 'g1::a',
        instanceId: 'g1::a',
        name: 'Game One',
        relativePath: 'sub/deep/GameOne',
        lastPlayed: 100,
      });
      const inst2 = makeGame({
        gameKey: 'g1::b',
        instanceId: 'g1::b',
        name: 'Game One',
        relativePath: 'GameOne',
        lastPlayed: 500,
      });
      const stackedGame = makeGame({
        gameKey: 'g1',
        name: 'Game One',
        favorite: true,
        instances: [inst1, inst2],
      });
      const singleGame = makeGame({
        gameKey: 'g2',
        name: 'Game Two',
        favorite: false,
      });

      Object.freeze(stackedGame);
      Object.freeze(singleGame);

      const result = buildLibraryViewItems([stackedGame, singleGame], 'az');

      expect(result.customOrder).toBeNull();
      expect(result.items).toHaveLength(2);

      const stackItem = result.items[0];
      expect(stackItem.type).toBe('stack');
      expect(stackItem.isStack).toBe(true);
      expect(stackItem.stackSize).toBe(2);
      expect(stackItem.favorite).toBe(true);
      expect(stackItem.primaryGame).toBe(inst2);
      expect(stackItem.games).toEqual([inst2, inst1]);
      expect(stackedGame.primaryInstance).toBeUndefined();

      const singleItem = result.items[1];
      expect(singleItem.type).toBe('single');
      expect(singleItem.isStack).toBe(false);
      expect(singleItem.stackSize).toBe(1);
      expect(singleItem.favorite).toBe(false);
      expect(singleItem.games).toEqual([singleGame]);
    });

    it('falls back to orderedGames[0] when unplayed and preserves explicit primaryInstance', () => {
      const shallow = makeGame({
        gameKey: 'g::shallow',
        instanceId: 'g::shallow',
        relativePath: 'Game',
      });
      const deep = makeGame({
        gameKey: 'g::deep',
        instanceId: 'g::deep',
        relativePath: 'sub/Game',
      });

      const unplayedStack = makeGame({
        gameKey: 'g-unplayed',
        name: 'Alpha',
        instances: [deep, shallow],
      });
      const explicitStack = makeGame({
        gameKey: 'g-explicit',
        name: 'Beta',
        primaryInstance: deep,
        instances: [deep, shallow],
      });

      const { items } = buildLibraryViewItems([unplayedStack, explicitStack], 'az');
      expect(items[0].primaryGame).toBe(shallow);
      expect(items[1].primaryGame).toBe(deep);
    });

    it('sorts using canonical az, date, played, and custom options', () => {
      const gA = makeGame({ gameKey: 'a', name: 'Alpha', dateAdded: 10, lastPlayed: 300 });
      const gB = makeGame({ gameKey: 'b', name: 'Beta', dateAdded: 30, lastPlayed: 100 });
      const gC = makeGame({ gameKey: 'c', name: 'Gamma', dateAdded: 20, lastPlayed: 200 });

      expect(buildLibraryViewItems([gC, gA, gB], 'az').items.map((i) => i.representativeKey)).toEqual(['a', 'b', 'c']);
      expect(buildLibraryViewItems([gC, gA, gB], 'date').items.map((i) => i.representativeKey)).toEqual(['b', 'c', 'a']);
      expect(buildLibraryViewItems([gC, gA, gB], 'played').items.map((i) => i.representativeKey)).toEqual(['a', 'c', 'b']);

      const customResult = buildLibraryViewItems([gA, gB, gC], 'custom', ['c', 'a', 'b']);
      expect(customResult.customOrder).toEqual(['c', 'a', 'b']);
      expect(customResult.items.map((i) => i.representativeKey)).toEqual(['c', 'a', 'b']);
    });

    it('handles N = 2,000 synthetic games efficiently with Map-indexed custom sort and multi-instance stacks', () => {
      const games: GameEntry[] = [];
      const order: string[] = [];
      for (let i = 0; i < 2000; i++) {
        const key = `game-${i}`;
        order.unshift(key);
        if (i % 10 === 0) {
          const c1 = makeGame({ gameKey: `${key}::1`, instanceId: `${key}::1`, relativePath: 'b/game', lastPlayed: 10 });
          const c2 = makeGame({ gameKey: `${key}::2`, instanceId: `${key}::2`, relativePath: 'game', lastPlayed: 50 });
          games.push(makeGame({ gameKey: key, name: `Game ${i}`, instances: [c1, c2] }));
        } else {
          games.push(makeGame({ gameKey: key, name: `Game ${i}` }));
        }
      }

      const start = performance.now();
      const { items } = buildLibraryViewItems(games, 'custom', order);
      const elapsed = performance.now() - start;

      expect(items).toHaveLength(2000);
      expect(items[0].representativeKey).toBe('game-1999');
      expect(items[1999].representativeKey).toBe('game-0');
      expect(items[1999].isStack).toBe(true);
      expect(items[1999].primaryGame.gameKey).toBe('game-0::2');
      expect(elapsed).toBeLessThan(1000);
    });
  });

  describe('resolveStackByGroupKey', () => {
    it('matches symmetrically across gameId, gameKey, buildGroupKey, and instance keys', () => {
      const inst1 = makeGame({ gameKey: 'k::1', instanceId: 'inst-1', relativePath: 'sub/a', lastPlayed: 50 });
      const inst2 = makeGame({ gameKey: 'k::2', instanceId: 'inst-2', relativePath: 'a', lastPlayed: 200 });
      const stacked = makeGame({
        gameKey: 'canonical-k',
        gameId: 'legacy-id',
        favorite: true,
        instances: [inst1, inst2],
      });
      const single = makeGame({ gameKey: 'single-k' });
      const games = [stacked, single];

      expect(resolveStackByGroupKey(games, 'game:canonical-k')?.primaryGame).toBe(inst2);
      expect(resolveStackByGroupKey(games, 'canonical-k')?.stackSize).toBe(2);
      expect(resolveStackByGroupKey(games, 'legacy-id')?.groupKey).toBe('game:canonical-k');
      expect(resolveStackByGroupKey(games, 'inst-1')?.favorite).toBe(true);
      expect(resolveStackByGroupKey(games, 'k::2')?.games).toEqual([inst2, inst1]);

      expect(resolveStackByGroupKey(games, 'single-k')).toBeNull();
      expect(resolveStackByGroupKey(games, 'missing')).toBeNull();
      expect(resolveStackByGroupKey(games, '')).toBeNull();
    });
  });

  describe('patchRunningGameViewItem', () => {
    it('updates single item and preserves referential identity for untouched items', () => {
      const g1 = makeGame({ gameKey: 'g1', isRunning: false });
      const g2 = makeGame({ gameKey: 'g2', isRunning: false });
      const { items } = buildLibraryViewItems([g1, g2], 'az');

      const updatedG1 = makeGame({ gameKey: 'g1', isRunning: true, playtime: 120 });
      const next = patchRunningGameViewItem(items, updatedG1);

      expect(next).not.toBe(items);
      expect(next[0].primaryGame).toBe(updatedG1);
      expect(next[0].games).toEqual([updatedG1]);
      expect(Object.is(next[1], items[1])).toBe(true);
    });

    it('updates matching child instances when passed a parent GameEntry with instances without structural corruption', () => {
      const c1 = makeGame({ gameKey: 'g1::1', instanceId: 'g1::1', relativePath: 'a', playtime: 10, isRunning: false });
      const c2 = makeGame({ gameKey: 'g1::2', instanceId: 'g1::2', relativePath: 'b', playtime: 20, isRunning: false });
      const parent = makeGame({ gameKey: 'g1', instances: [c1, c2] });
      const { items } = buildLibraryViewItems([parent], 'az');

      const updatedC1 = makeGame({
        gameKey: 'g1::1',
        instanceId: 'g1::1',
        relativePath: 'a',
        playtime: 99,
        isRunning: true,
        lastPlayed: 9999,
      });
      const updatedParent = makeGame({
        gameKey: 'g1',
        instances: [updatedC1, c2],
      });

      const next = patchRunningGameViewItem(items, updatedParent);
      const stack = next[0];
      expect(stack.type).toBe('stack');
      expect(stack.games[0]).toBe(updatedC1);
      expect(stack.games[0].instances).toBeUndefined();
      expect(stack.games[1]).toBe(c2);
      expect(stack.primaryGame).toBe(updatedC1);
    });

    it('updates a specific child instance when passed an individual child GameEntry and recalculates primaryGame', () => {
      const c1 = makeGame({ gameKey: 'g1::1', instanceId: 'g1::1', relativePath: 'a', lastPlayed: 100 });
      const c2 = makeGame({ gameKey: 'g1::2', instanceId: 'g1::2', relativePath: 'b', lastPlayed: 50 });
      const parent = makeGame({ gameKey: 'g1', instances: [c1, c2] });
      const { items } = buildLibraryViewItems([parent], 'az');

      const updatedC2 = makeGame({
        gameKey: 'g1::2',
        instanceId: 'g1::2',
        relativePath: 'b',
        lastPlayed: 500,
        isRunning: true,
      });

      const next = patchRunningGameViewItem(items, updatedC2);
      expect(next[0].games[1]).toBe(updatedC2);
      expect(next[0].primaryGame).toBe(updatedC2);
    });

    it('preserves prevItems reference when no item matches or input is null/invalid', () => {
      const { items } = buildLibraryViewItems([makeGame({ gameKey: 'g1' })], 'az');

      expect(Object.is(patchRunningGameViewItem(items, makeGame({ gameKey: 'other' })), items)).toBe(true);
      expect(Object.is(patchRunningGameViewItem(items, null as unknown as GameEntry), items)).toBe(true);
      expect(Object.is(patchRunningGameViewItem(items, makeGame({ gameKey: '' })), items)).toBe(true);
    });
  });

  describe('findGameEntryByKey and resolveFavoriteLockKey', () => {
    it('locates entries by canonical key, gameId, game: prefix, or child instance and resolves lock key', () => {
      const inst = makeGame({ gameKey: 'inst-key', instanceId: 'inst-id' });
      const parent = makeGame({ gameKey: 'p-key', gameId: 'legacy-123', instances: [inst] });
      const noGameId = makeGame({ gameKey: 'solo-key' });
      const games = [parent, noGameId];

      expect(findGameEntryByKey(games, 'p-key')).toBe(parent);
      expect(findGameEntryByKey(games, 'game:p-key')).toBe(parent);
      expect(findGameEntryByKey(games, 'legacy-123')).toBe(parent);
      expect(findGameEntryByKey(games, 'game:legacy-123')).toBe(parent);
      expect(findGameEntryByKey(games, 'inst-id')).toBe(parent);

      expect(resolveFavoriteLockKey('inst-id', games)).toBe('game:legacy-123');
      expect(resolveFavoriteLockKey('solo-key', games)).toBe('solo-key');
      expect(resolveFavoriteLockKey('unknown-key', games)).toBe('unknown-key');
    });
  });

  describe('writeCustomOrder future schema guard', () => {
    it('aborts write and preserves storage intact when existing schemaVersion > 1', () => {
      const futurePayload = JSON.stringify({ schemaVersion: 2, order: ['a'] });
      const store = new Map<string, string>([['yumeshelf_custom_order', futurePayload]]);
      const storage: UiStorageAdapter = {
        getItem: (k) => store.get(k) ?? null,
        setItem: vi.fn((k, v) => {
          store.set(k, v);
        }),
        removeItem: (k) => {
          store.delete(k);
        },
      };

      writeCustomOrder(['b'], storage);
      expect(storage.setItem).not.toHaveBeenCalled();
      expect(store.get('yumeshelf_custom_order')).toBe(futurePayload);
    });
  });
});
