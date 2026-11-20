import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { GameEntry } from './types/game';
import type { UiStorageAdapter } from './state/ui-runtime-state';
import {
  getGameKey,
  readStoredCustomOrder,
  writeCustomOrder,
  resolveCustomOrder,
  areStringArraysEqual,
  migrateStoredCustomOrderAliases,
} from './library-order';

function createMockStorage(initial: Record<string, string> = {}): UiStorageAdapter & { store: Map<string, string> } {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    store,
    getItem: vi.fn((key: string) => (store.has(key) ? store.get(key)! : null)),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
  };
}

function makeGame(overrides: Partial<GameEntry> & { gameKey: string }): GameEntry {
  return {
    name: overrides.name ?? overrides.gameKey,
    ...overrides,
  };
}

describe('library-order', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getGameKey', () => {
    it('returns empty string for null or undefined', () => {
      expect(getGameKey(null)).toBe('');
      expect(getGameKey(undefined)).toBe('');
    });

    it('prioritizes canonical gameKey before legacy gameId', () => {
      expect(getGameKey({ gameKey: 'canonical-1', gameId: 'legacy-1', folderName: 'Folder' })).toBe('canonical-1');
    });

    it('falls back to gameId, relativePath, and folderName for non-instance entries', () => {
      expect(getGameKey({ gameId: 'legacy-1', relativePath: 'rel/a', folderName: 'Folder' })).toBe('legacy-1');
      expect(getGameKey({ relativePath: 'rel/a', folderName: 'Folder' })).toBe('rel/a');
      expect(getGameKey({ folderName: 'Folder' })).toBe('Folder');
      expect(getGameKey({})).toBe('');
    });

    it('uses instanceId before relativePath/folderName for standalone child instances', () => {
      expect(
        getGameKey({
          instanceId: 'inst-1',
          gameId: 'legacy-parent',
          relativePath: 'rel/inst',
          folderName: 'Folder',
        })
      ).toBe('inst-1');
      expect(
        getGameKey({
          gameKey: 'inst-key',
          instanceId: 'inst-1',
          gameId: 'legacy-parent',
        })
      ).toBe('inst-key');
    });
  });

  describe('readStoredCustomOrder', () => {
    it('returns empty array when storage key is missing', () => {
      const storage = createMockStorage();
      expect(readStoredCustomOrder(storage)).toEqual([]);
    });

    it('decodes canonical schemaVersion 1 envelope and filters invalid/blank entries', () => {
      const storage = createMockStorage({
        yumeshelf_custom_order: JSON.stringify({
          schemaVersion: 1,
          order: ['game-a', '  ', '', 42, null, 'game-b'],
        }),
      });
      expect(readStoredCustomOrder(storage)).toEqual(['game-a', 'game-b']);
    });

    it('supports legacy raw string[] array and allows subsequent versioned write-back (Given-When-Then)', () => {
      // Given a legacy unversioned array in storage
      const storage = createMockStorage({
        yumeshelf_custom_order: JSON.stringify(['game-a', '   ', 123, 'game-b']),
      });

      // When reading and subsequently writing back
      const readOrder = readStoredCustomOrder(storage);
      expect(readOrder).toEqual(['game-a', 'game-b']);

      writeCustomOrder(readOrder, storage);

      // Then storage is upgraded to canonical schemaVersion 1 envelope
      expect(JSON.parse(storage.store.get('yumeshelf_custom_order')!)).toEqual({
        schemaVersion: 1,
        order: ['game-a', 'game-b'],
      });
    });

    it('returns empty array without quarantining or evicting when schemaVersion > 1', () => {
      const payload = JSON.stringify({ schemaVersion: 2, order: ['game-a'], extra: true });
      const storage = createMockStorage({ yumeshelf_custom_order: payload });

      expect(readStoredCustomOrder(storage)).toEqual([]);
      expect(storage.removeItem).not.toHaveBeenCalled();
      expect(storage.setItem).not.toHaveBeenCalled();
      expect(storage.store.get('yumeshelf_custom_order')).toBe(payload);
    });

    it('quarantines malformed JSON to timestamped key, removes main key, and logs sanitized warning', () => {
      const raw = '{corrupt json at C:\\Users\\John Doe\\AppData\\Local\\order.json';
      const storage = createMockStorage({ yumeshelf_custom_order: raw });
      const nowProvider = () => 1700000000123;

      const result = readStoredCustomOrder(storage, nowProvider);

      expect(result).toEqual([]);
      expect(storage.setItem).toHaveBeenCalledWith('yumeshelf_custom_order_corrupt_1700000000123', raw);
      expect(storage.removeItem).toHaveBeenCalledWith('yumeshelf_custom_order');
      expect(storage.store.has('yumeshelf_custom_order')).toBe(false);
      expect(console.warn).toHaveBeenCalledWith(
        '[LIBRARY-ORDER] Corrupt custom order payload encountered; quarantining:',
        expect.objectContaining({ error: expect.any(String) })
      );
    });

    it('quarantines non-array or invalid schema structure payloads', () => {
      const storage = createMockStorage({
        yumeshelf_custom_order: JSON.stringify({ schemaVersion: 1, order: 'not-an-array' }),
      });
      const result = readStoredCustomOrder(storage, () => 999);

      expect(result).toEqual([]);
      expect(storage.setItem).toHaveBeenCalledWith(
        'yumeshelf_custom_order_corrupt_999',
        JSON.stringify({ schemaVersion: 1, order: 'not-an-array' })
      );
      expect(storage.removeItem).toHaveBeenCalledWith('yumeshelf_custom_order');
    });

    it('logs sanitized diagnostic warning when storage.getItem throws unexpected exception', () => {
      const storage = createMockStorage();
      vi.mocked(storage.getItem).mockImplementation(() => {
        throw new Error('SecurityError reading /Users/alice/Library/Application Support/yumeshelf');
      });

      const result = readStoredCustomOrder(storage);

      expect(result).toEqual([]);
      expect(storage.setItem).not.toHaveBeenCalled();
      expect(storage.removeItem).not.toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalledWith(
        '[LIBRARY-ORDER] Failed to read custom order from storage:',
        expect.objectContaining({
          error: expect.stringContaining('<USER_DIR>'),
        })
      );
      const logged = vi.mocked(console.warn).mock.calls[0][1] as { error: string; stack?: string };
      expect(logged.error).not.toContain('alice');
    });

    it('executes removeItem in finally even when quarantine setItem throws QuotaExceededError and sanitizes paths', () => {
      const storage = createMockStorage({ yumeshelf_custom_order: '{bad' });
      vi.mocked(storage.setItem).mockImplementation(() => {
        throw new Error('QuotaExceededError at C:\\Users\\John Doe\\storage');
      });

      const result = readStoredCustomOrder(storage, () => 12345);

      expect(result).toEqual([]);
      expect(storage.removeItem).toHaveBeenCalledWith('yumeshelf_custom_order');
      expect(console.warn).toHaveBeenCalledWith(
        '[LIBRARY-ORDER] Failed during corrupt custom order recovery:',
        expect.objectContaining({
          error: expect.stringContaining('<USER_DIR>'),
        })
      );
      const recoveryLog = vi.mocked(console.warn).mock.calls[1][1] as { error: string };
      expect(recoveryLog.error).not.toContain('John Doe');
    });

    it('logs sanitized warning if removeItem throws during quarantine', () => {
      const storage = createMockStorage({ yumeshelf_custom_order: '{bad' });
      vi.mocked(storage.removeItem).mockImplementation(() => {
        throw new Error('Remove failed at /Users/alice/storage');
      });

      const result = readStoredCustomOrder(storage, () => 12345);

      expect(result).toEqual([]);
      expect(console.warn).toHaveBeenCalledWith(
        '[LIBRARY-ORDER] Failed to remove corrupt custom order key:',
        expect.objectContaining({
          error: expect.stringContaining('<USER_DIR>'),
        })
      );
      const removeLog = vi.mocked(console.warn).mock.calls[1][1] as { error: string };
      expect(removeLog.error).not.toContain('alice');
    });
  });

  describe('writeCustomOrder', () => {
    it('writes sanitized canonical schemaVersion 1 envelope', () => {
      const storage = createMockStorage();
      writeCustomOrder(['g1', '', '  ', 'g2'], storage);

      expect(JSON.parse(storage.store.get('yumeshelf_custom_order')!)).toEqual({
        schemaVersion: 1,
        order: ['g1', 'g2'],
      });
    });

    it('aborts write and preserves existing storage when schemaVersion > 1', () => {
      const futurePayload = JSON.stringify({ schemaVersion: 3, order: ['future-1'] });
      const storage = createMockStorage({ yumeshelf_custom_order: futurePayload });

      writeCustomOrder(['g1', 'g2'], storage);

      expect(storage.setItem).not.toHaveBeenCalled();
      expect(storage.store.get('yumeshelf_custom_order')).toBe(futurePayload);
      expect(console.warn).toHaveBeenCalledWith(
        '[LIBRARY-ORDER] Aborting write: custom order schema version is newer than supported version:',
        {
          existingVersion: 3,
          maxSupportedVersion: 1,
          internal_outcome: 'ABORTED',
          abort_reason: 'FUTURE_SCHEMA_VERSION',
        }
      );
    });

    it('logs sanitized error when storage.setItem throws', () => {
      const storage = createMockStorage();
      vi.mocked(storage.setItem).mockImplementation(() => {
        throw new Error('Disk full at C:\\Users\\John Doe\\LocalStorage');
      });

      writeCustomOrder(['g1'], storage);

      expect(console.warn).toHaveBeenCalledWith(
        '[LIBRARY-ORDER] Failed to persist custom order:',
        expect.objectContaining({
          error: expect.stringContaining('<USER_DIR>'),
        })
      );
      const logged = vi.mocked(console.warn).mock.calls[0][1] as { error: string };
      expect(logged.error).not.toContain('John Doe');
    });
  });

  describe('resolveCustomOrder', () => {
    it('reconciles aliases, discards deleted entries, deduplicates, and appends new games without mutating storage', () => {
      const games: GameEntry[] = [
        makeGame({ gameKey: 'key-1', folderName: 'FolderOne' }),
        makeGame({ gameKey: 'key-2', gameId: 'legacy-id-2' }),
        makeGame({ gameKey: 'key-3', primaryInstance: makeGame({ gameKey: 'inst-primary-3' }) }),
        makeGame({ gameKey: 'key-4' }),
      ];

      const stored = ['inst-primary-3', 'deleted-game', 'FolderOne', 'legacy-id-2', 'key-1'];
      const resolved = resolveCustomOrder(games, stored);

      expect(resolved).toEqual(['key-3', 'key-1', 'key-2', 'key-4']);
    });
  });

  describe('areStringArraysEqual', () => {
    it('handles identical, null/undefined, empty, and differing arrays', () => {
      const arr = ['a', 'b'];
      expect(areStringArraysEqual(arr, arr)).toBe(true);
      expect(areStringArraysEqual([], [])).toBe(true);
      expect(areStringArraysEqual(null, [])).toBe(true);
      expect(areStringArraysEqual(undefined, null)).toBe(true);
      expect(areStringArraysEqual(['a', 'b'], ['a', 'b'])).toBe(true);
      expect(areStringArraysEqual(['a', 'b'], ['a', 'c'])).toBe(false);
      expect(areStringArraysEqual(['a'], ['a', 'b'])).toBe(false);
    });
  });

  describe('migrateStoredCustomOrderAliases', () => {
    it('returns null for empty inputs or when no aliases need migration', () => {
      const games = [makeGame({ gameKey: 'k1' }), makeGame({ gameKey: 'k2' })];
      expect(migrateStoredCustomOrderAliases([], ['k1'])).toBeNull();
      expect(migrateStoredCustomOrderAliases(games, [])).toBeNull();
      expect(migrateStoredCustomOrderAliases(games, ['k1', 'k2'])).toBeNull();
    });

    it('enforces canonical key precedence even if another game has matching alias', () => {
      const games = [
        makeGame({ gameKey: 'SharedName' }),
        makeGame({ gameKey: 'k2', folderName: 'SharedName' }),
      ];
      expect(migrateStoredCustomOrderAliases(games, ['SharedName'])).toBeNull();
    });

    it('migrates unambiguous 1:1 aliases while preserving ambiguous (>1) and unknown (0) keys intact', () => {
      const games = [
        makeGame({ gameKey: 'k1', folderName: 'UniqueFolder' }),
        makeGame({ gameKey: 'k2', folderName: 'AmbiguousFolder' }),
        makeGame({ gameKey: 'k3', folderName: 'AmbiguousFolder' }),
      ];

      const result = migrateStoredCustomOrderAliases(games, [
        'UniqueFolder',
        'AmbiguousFolder',
        'disconnected-drive-key',
      ]);

      expect(result).toEqual(['k1', 'AmbiguousFolder', 'disconnected-drive-key']);
    });

    it('deduplicates migrated keys when alias and canonical key both appear', () => {
      const games = [makeGame({ gameKey: 'k1', folderName: 'FolderOne' })];
      expect(migrateStoredCustomOrderAliases(games, ['FolderOne', 'k1'])).toEqual(['k1']);
    });
  });
});
