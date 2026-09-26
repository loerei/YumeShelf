/// <reference types="node" />
// @ts-ignore
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import {
  CURRENT_SCHEMA_VERSION,
  runStorageMigrations,
  registerMigrationForTest,
  resetMigrationsForTest,
  canonicalizeStoredGames,
  migrationM0to1,
  type LibraryDatabase,
  type StoredGameRecord
} from './migrations';
import { createLibraryState, type LibraryContext } from './index';
import { normalizeLibraryConfigShape } from './scanner';
import { buildLogicalGameId } from './continuity';

describe('Storage Schema Versioning & Migration Runner (Ticket 01.4.3.1.1)', () => {
  let logInfoSpy: any;
  let logErrorSpy: any;
  let logWarnSpy: any;
  let tempDirs: string[] = [];

  async function createTempDir(): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'yumeshelf-migration-test-'));
    tempDirs.push(dir);
    return dir;
  }

  beforeEach(() => {
    logInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    logErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(async () => {
    resetMigrationsForTest();
    logInfoSpy.mockRestore();
    logErrorSpy.mockRestore();
    logWarnSpy.mockRestore();

    for (const dir of tempDirs) {
      try {
        await fs.rm(dir, { recursive: true, force: true });
      } catch {
        // ignore cleanup error
      }
    }
    tempDirs = [];
  });

  describe('schema version register & test seams', () => {
    it('declares CURRENT_SCHEMA_VERSION as 1', () => {
      expect(CURRENT_SCHEMA_VERSION).toBe(1);
    });

    it('registerMigrationForTest registers a migration and returns an unregister callback', async () => {
      const mockContext: any = {};
      const unregister = registerMigrationForTest(1, async (db: any) => ({ ...db, migrated: true }));

      const initialDb = { schemaVersion: 0 };
      const migrated = await runStorageMigrations(initialDb, mockContext, 'win32');
      expect(migrated.schemaVersion).toBe(1);
      expect((migrated as any).migrated).toBe(true);

      unregister();

      // After unregistering, running on v0 should fail fast
      await expect(runStorageMigrations({ schemaVersion: 0 }, mockContext, 'win32')).rejects.toThrow(
        'Missing migration step for schema version 1'
      );
    });

    it('resetMigrationsForTest restores baseline migrations and cleans up registered test migrations', async () => {
      const mockContext: any = {};
      registerMigrationForTest(1, async (db: any) => ({ ...db, test: 1 }));
      registerMigrationForTest(2, async (db: any) => ({ ...db, test: 2 }));

      resetMigrationsForTest();

      await expect(runStorageMigrations({ schemaVersion: 1 }, mockContext, 'win32', 2)).rejects.toThrow(
        'Missing migration step for schema version 2'
      );

      const res = await runStorageMigrations({ schemaVersion: 0, config: { libraryPaths: [] } }, mockContext, 'win32', 1);
      expect(res.schemaVersion).toBe(1);
      expect((res as any).test).toBeUndefined();
    });
  });

  describe('runStorageMigrations sequential runner', () => {
    it('upgrades unversioned database (undefined or schemaVersion 0) to schemaVersion 1 with mock migration', async () => {
      const mockContext: any = {};
      registerMigrationForTest(1, async (db: any) => {
        return {
          ...db,
          games: { gameA: { name: 'Game A', folderPath: '/a', exePath: '/a/game.exe' } }
        };
      });

      // Test with undefined schemaVersion
      const dbUnversioned: any = { config: { libraryPaths: [] } };
      const res1 = await runStorageMigrations(dbUnversioned, mockContext, 'win32');
      expect(res1.schemaVersion).toBe(1);
      expect(res1.games.gameA.name).toBe('Game A');

      // Test with schemaVersion 0
      const dbV0: any = { schemaVersion: 0, config: { libraryPaths: [] } };
      const res2 = await runStorageMigrations(dbV0, mockContext, 'win32');
      expect(res2.schemaVersion).toBe(1);
      expect(res2.games.gameA.name).toBe('Game A');

      expect(logInfoSpy).toHaveBeenCalledWith(
        '[STORAGE_MIGRATIONS] Starting storage migrations:',
        expect.objectContaining({ initialVersion: 0, targetVersion: 1 })
      );
      expect(logInfoSpy).toHaveBeenCalledWith(
        '[STORAGE_MIGRATIONS] Applied migration step:',
        expect.objectContaining({ fromVersion: 0, toVersion: 1 })
      );
    });

    it('executes sequential multi-step migrations linearly', async () => {
      const mockContext: any = {};
      const executionOrder: number[] = [];

      registerMigrationForTest(1, async (db: any) => {
        executionOrder.push(1);
        return { ...db, step1: true };
      });
      registerMigrationForTest(2, async (db: any) => {
        executionOrder.push(2);
        return { ...db, step2: true };
      });

      const initialDb = { schemaVersion: 0 };
      const result = await runStorageMigrations(initialDb, mockContext, 'win32', 2);

      expect(executionOrder).toEqual([1, 2]);
      expect(result.schemaVersion).toBe(2);
      expect((result as any).step1).toBe(true);
      expect((result as any).step2).toBe(true);
    });

    it('throws structured error if intermediate migration step is missing', async () => {
      const mockContext: any = {};
      // Register step 1 but omit step 2
      registerMigrationForTest(1, async (db: any) => ({ ...db, step1: true }));

      const initialDb = { schemaVersion: 0 };
      await expect(runStorageMigrations(initialDb, mockContext, 'win32', 2)).rejects.toThrow(
        'Missing migration step for schema version 2'
      );

      expect(logErrorSpy).toHaveBeenCalledWith(
        '[STORAGE_MIGRATIONS] Missing migration function for schema version:',
        expect.objectContaining({ currentVersion: 1, nextVersion: 2, targetVersion: 2 })
      );
    });

    it('in production, running on unversioned v0 store without registered migration fails fast with Missing migration step', async () => {
      const mockContext: any = {};
      const unregister = registerMigrationForTest(1, async (db: any) => db);
      unregister();

      await expect(runStorageMigrations({ schemaVersion: 0 }, mockContext, 'win32')).rejects.toThrow(
        'Missing migration step for schema version 1'
      );

      expect(logErrorSpy).toHaveBeenCalledWith(
        '[STORAGE_MIGRATIONS] Missing migration function for schema version:',
        expect.objectContaining({ currentVersion: 0, nextVersion: 1, targetVersion: 1 })
      );
    });

    it('throws structured error and logs when migration returns non-plain object (array, null, primitive)', async () => {
      const mockContext: any = {};

      // 1. Array return
      registerMigrationForTest(1, async () => []);
      await expect(runStorageMigrations({ schemaVersion: 0 }, mockContext, 'win32')).rejects.toThrow(
        'Migration step returned invalid database structure: expected plain object'
      );
      expect(logErrorSpy).toHaveBeenCalledWith(
        '[STORAGE_MIGRATIONS] Migration step returned invalid non-plain object database structure:',
        expect.objectContaining({ currentVersion: 0, nextVersion: 1 })
      );

      // 2. null return
      registerMigrationForTest(1, async () => null);
      await expect(runStorageMigrations({ schemaVersion: 0 }, mockContext, 'win32')).rejects.toThrow(
        'Migration step returned invalid database structure: expected plain object'
      );

      // 3. primitive return
      registerMigrationForTest(1, async () => 'corrupted');
      await expect(runStorageMigrations({ schemaVersion: 0 }, mockContext, 'win32')).rejects.toThrow(
        'Migration step returned invalid database structure: expected plain object'
      );
    });

    it('skips migrations when schemaVersion >= targetVersion (crash idempotency)', async () => {
      const mockContext: any = {};
      const migrationSpy = vi.fn().mockImplementation(async (db: any) => db);
      registerMigrationForTest(1, migrationSpy);

      const dbAlreadyV1 = { schemaVersion: 1, games: {} };
      const res = await runStorageMigrations(dbAlreadyV1, mockContext, 'win32', 1);

      expect(migrationSpy).not.toHaveBeenCalled();
      expect(res).toBe(dbAlreadyV1);
    });
  });

  describe('createLibraryState bootstrap isolation & degraded circuit breaker', () => {
    it('isDegraded() returns false when neither dbFilePath nor loadDB is configured', () => {
      const state = createLibraryState({
        categoryState: null,
        defaultGamesDir: '/games',
        dialog: null,
        fs: null,
        fsSync: null,
        dbFilePath: ''
      });

      expect(state.isDegraded()).toBe(false);
    });

    it('isDegraded() reports degraded state when loadDB is provided', async () => {
      const state = createLibraryState({
        categoryState: null,
        defaultGamesDir: '/games',
        dialog: null,
        fs: null,
        fsSync: null,
        dbFilePath: '',
        loadDB: async () => {
          throw new Error('Load failed');
        }
      });

      expect(state.isDegraded()).toBe(false);
      await state.loadDB();
      expect(state.isDegraded()).toBe(true);
    });

    it('persistDbDirectly and saveDB throw and log structured warning when database is in degraded state', async () => {
      const dir = await createTempDir();
      const dbPath = path.join(dir, 'library_db.json');
      await fs.writeFile(dbPath, ''); // 0-byte file -> degraded

      const state = createLibraryState({
        categoryState: null,
        defaultGamesDir: dir,
        dialog: null,
        fs,
        fsSync,
        dbFilePath: dbPath
      });

      await state.loadDB();
      expect(state.isDegraded()).toBe(true);

      await expect(state.saveDB({ test: true })).rejects.toThrow('Database is in degraded state');
      expect(logWarnSpy).toHaveBeenCalledWith(
        '[LIBRARY_STATE] Persistence aborted: database is in DEGRADED state.',
        expect.objectContaining({ dbFilePath: dbPath })
      );
    });

    it('fresh install ENOENT returns canonical schemaVersion 1 without running migrations across stat and readJsonWithRetry', async () => {
      const dir = await createTempDir();
      const dbPath = path.join(dir, 'non_existent_db.json');

      const migrationSpy = vi.fn().mockImplementation(async (db: any) => db);
      registerMigrationForTest(1, migrationSpy);

      const state = createLibraryState({
        categoryState: null,
        defaultGamesDir: dir,
        dialog: null,
        fs,
        fsSync,
        dbFilePath: dbPath
      });

      const db = await state.loadDB();
      expect(db.schemaVersion).toBe(1);
      expect(db.games).toEqual({});
      expect(db.config).toEqual(normalizeLibraryConfigShape({}, process.platform as any));
      expect(state.isDegraded()).toBe(false);
      expect(migrationSpy).not.toHaveBeenCalled();

      // Invariant: cachedDb must NOT be assigned on ENOENT (remains null until persisted)
      // Simulate subsequent 0-byte file without persistence -> loadDB returns cachedDb || {} which is {}
      await fs.writeFile(dbPath, '');
      const loadedTruncated = await state.loadDB();
      expect(loadedTruncated).toEqual({});
      expect(state.isDegraded()).toBe(true);
    });

    it('trips circuit breaker on 0-byte file and logs structured error', async () => {
      const dir = await createTempDir();
      const dbPath = path.join(dir, 'empty_db.json');
      await fs.writeFile(dbPath, '');

      const state = createLibraryState({
        categoryState: null,
        defaultGamesDir: dir,
        dialog: null,
        fs,
        fsSync,
        dbFilePath: dbPath
      });

      const res = await state.loadDB();
      expect(state.isDegraded()).toBe(true);
      expect(res).toEqual({});
      expect(logErrorSpy).toHaveBeenCalledWith(
        '[LIBRARY_STATE] Storage load failed, entering degraded state:',
        expect.objectContaining({ dbFilePath: dbPath, reason: 'zero-byte-file' })
      );
    });

    it('trips circuit breaker on invalid non-plain object root database structure', async () => {
      const dir = await createTempDir();
      const dbPath = path.join(dir, 'array_db.json');
      await fs.writeFile(dbPath, JSON.stringify([1, 2, 3]));

      const state = createLibraryState({
        categoryState: null,
        defaultGamesDir: dir,
        dialog: null,
        fs,
        fsSync,
        dbFilePath: dbPath
      });

      const res = await state.loadDB();
      expect(state.isDegraded()).toBe(true);
      expect(res).toEqual({});
      expect(logErrorSpy).toHaveBeenCalledWith(
        '[LIBRARY_STATE] Storage load failed, entering degraded state: invalid root database structure: expected plain object',
        expect.objectContaining({ dbFilePath: dbPath })
      );
    });

    it('trips circuit breaker on unsupported future schemaVersion > CURRENT_SCHEMA_VERSION', async () => {
      const dir = await createTempDir();
      const dbPath = path.join(dir, 'future_db.json');
      const futurePayload = {
        schemaVersion: 999,
        config: { libraryPaths: [] },
        games: {}
      };
      await fs.writeFile(dbPath, JSON.stringify(futurePayload));

      const state = createLibraryState({
        categoryState: null,
        defaultGamesDir: dir,
        dialog: null,
        fs,
        fsSync,
        dbFilePath: dbPath
      });

      const res = await state.loadDB();
      expect(state.isDegraded()).toBe(true);
      expect(res.schemaVersion).toBe(999);
      expect(logErrorSpy).toHaveBeenCalledWith(
        '[STORAGE_MIGRATIONS] Database schema version is newer than supported version, entering degraded state:',
        expect.objectContaining({
          dbFilePath: dbPath,
          databaseVersion: 999,
          maxSupportedVersion: CURRENT_SCHEMA_VERSION
        })
      );
    });

    it('preserves prior healthy cachedDb snapshot on degraded transitions', async () => {
      const dir = await createTempDir();
      const dbPath = path.join(dir, 'healthy_db.json');
      const healthyDb = {
        schemaVersion: 1,
        config: { libraryPaths: [], folderAliases: {} },
        games: { gameA: { name: 'Healthy Game', folderPath: '/a', exePath: '/a/game.exe' } }
      };
      await fs.writeFile(dbPath, JSON.stringify(healthyDb));

      const state = createLibraryState({
        categoryState: null,
        defaultGamesDir: dir,
        dialog: null,
        fs,
        fsSync,
        dbFilePath: dbPath
      });

      // 1. Initial healthy load
      const initial = await state.loadDB();
      expect(state.isDegraded()).toBe(false);
      expect(initial.games.gameA.name).toBe('Healthy Game');

      // 2. Corrupt the file with invalid JSON
      await fs.writeFile(dbPath, '{ invalid json');

      // 3. Second load fails -> degraded state trips, but returns prior cachedDb
      const degradedRes = await state.loadDB();
      expect(state.isDegraded()).toBe(true);
      expect(degradedRes.games.gameA.name).toBe('Healthy Game');

      // 4. Overwriting with 0-byte file -> also returns prior cachedDb
      await fs.writeFile(dbPath, '');
      const zeroByteRes = await state.loadDB();
      expect(state.isDegraded()).toBe(true);
      expect(zeroByteRes.games.gameA.name).toBe('Healthy Game');
    });

    it('recovers (DEGRADED -> HEALTHY) when restored canonical schemaVersion 1 database is loaded', async () => {
      const dir = await createTempDir();
      const dbPath = path.join(dir, 'recovery_db.json');
      await fs.writeFile(dbPath, ''); // start degraded

      const state = createLibraryState({
        categoryState: null,
        defaultGamesDir: dir,
        dialog: null,
        fs,
        fsSync,
        dbFilePath: dbPath
      });

      await state.loadDB();
      expect(state.isDegraded()).toBe(true);

      // Restore canonical database
      const canonicalDb = {
        schemaVersion: 1,
        config: { libraryPaths: [], folderAliases: {} },
        games: { restored: { name: 'Restored' } }
      };
      await fs.writeFile(dbPath, JSON.stringify(canonicalDb));

      const recovered = await state.loadDB();
      expect(state.isDegraded()).toBe(false);
      expect(recovered.schemaVersion).toBe(1);
      expect((recovered.games as any).restored.name).toBe('Restored');

      // Writes succeed
      await state.saveDB({ ...canonicalDb, updated: true });
      expect(state.isDegraded()).toBe(false);
      const onDisk = JSON.parse(await fs.readFile(dbPath, 'utf8'));
      expect(onDisk.updated).toBe(true);
    });

    it('recovers (DEGRADED -> HEALTHY) when restored unversioned legacy database is loaded with registered migration', async () => {
      const dir = await createTempDir();
      const dbPath = path.join(dir, 'legacy_recovery_db.json');
      const legacyDb = {
        config: { libraryPaths: [] },
        games: { oldGame: { name: 'Old Game' } }
      };
      await fs.writeFile(dbPath, JSON.stringify(legacyDb));

      const state = createLibraryState({
        categoryState: null,
        defaultGamesDir: dir,
        dialog: null,
        fs,
        fsSync,
        dbFilePath: dbPath
      });

      // 1. Initial attempt fails because migration fails
      registerMigrationForTest(1, async () => {
        throw new Error('Initial migration failure');
      });

      const failed = await state.loadDB();
      expect(state.isDegraded()).toBe(true);

      // 2. Register mock migration for schema version 1
      registerMigrationForTest(1, async (db: any) => ({
        ...db,
        schemaVersion: 1,
        games: { ...db.games, migrated: true }
      }));

      // 3. Load again -> migration executes, persists schemaVersion: 1 to disk, recovers
      const recovered = await state.loadDB();
      expect(state.isDegraded()).toBe(false);
      expect(recovered.schemaVersion).toBe(1);
      expect((recovered.games as any).migrated).toBe(true);

      // Verify file on disk was persisted with schemaVersion 1
      const fileOnDisk = JSON.parse(await fs.readFile(dbPath, 'utf8'));
      expect(fileOnDisk.schemaVersion).toBe(1);

      // Subsequent saveDB succeeds
      await state.saveDB({ ...recovered, savedAgain: true });
      const finalDisk = JSON.parse(await fs.readFile(dbPath, 'utf8'));
      expect(finalDisk.savedAgain).toBe(true);
    });

    it('joins in-flight migration under concurrent loadDB invocations and executes migration only once', async () => {
      let migrationCount = 0;
      registerMigrationForTest(1, async (db: any) => {
        migrationCount++;
        // Small delay to simulate async migration work
        await new Promise((resolve) => setTimeout(resolve, 30));
        return { ...db, schemaVersion: 1, migrated: true };
      });

      let storedDb: any = { schemaVersion: 0, games: {} };
      const state = createLibraryState({
        categoryState: null,
        defaultGamesDir: '/games',
        dialog: null,
        fs: null,
        fsSync: null,
        dbFilePath: '',
        loadDB: async () => JSON.parse(JSON.stringify(storedDb)),
        saveDB: async (nextDb: any) => {
          storedDb = JSON.parse(JSON.stringify(nextDb));
        }
      });

      // Launch 5 concurrent loadDB operations
      const results = await Promise.all([
        state.loadDB(),
        state.loadDB(),
        state.loadDB(),
        state.loadDB(),
        state.loadDB()
      ]);

      expect(migrationCount).toBe(1);
      for (const res of results) {
        expect(res.schemaVersion).toBe(1);
        expect((res as any).migrated).toBe(true);
      }
      expect(state.isDegraded()).toBe(false);
    });

    it('evaluates double-checked locking: aborts secondary migration if preceding task failed or completed', async () => {
      let migrationCalls = 0;
      registerMigrationForTest(1, async () => {
        migrationCalls++;
        throw new Error('Migration task failed');
      });

      let storedDb: any = { schemaVersion: 0 };
      const state = createLibraryState({
        categoryState: null,
        defaultGamesDir: '/games',
        dialog: null,
        fs: null,
        fsSync: null,
        dbFilePath: '',
        loadDB: async () => JSON.parse(JSON.stringify(storedDb)),
        saveDB: async () => {}
      });

      const res = await state.loadDB();
      expect(state.isDegraded()).toBe(true);
      expect(migrationCalls).toBe(1);
    });

    it('snapshots category state before migration and executes category rollback if migration fails', async () => {
      let currentCategories = { tree: ['Cat1'], assignments: { game1: ['Cat1'] } };
      let savedCategorySnapshot: any = null;

      const mockCategoryState = {
        async loadCategoryState() {
          return JSON.parse(JSON.stringify(currentCategories));
        },
        async saveCategoryState(snapshot: any) {
          savedCategorySnapshot = JSON.parse(JSON.stringify(snapshot));
          currentCategories = JSON.parse(JSON.stringify(snapshot));
        }
      };

      registerMigrationForTest(1, async () => {
        // Mutate category state during migration
        currentCategories.tree.push('CorruptedCat');
        throw new Error('Migration failed unexpectedly');
      });

      const state = createLibraryState({
        categoryState: mockCategoryState,
        defaultGamesDir: '/games',
        dialog: null,
        fs: null,
        fsSync: null,
        dbFilePath: '',
        loadDB: async () => ({ schemaVersion: 0 }),
        saveDB: async () => {}
      });

      await state.loadDB();
      expect(state.isDegraded()).toBe(true);
      expect(savedCategorySnapshot).toEqual({ tree: ['Cat1'], assignments: { game1: ['Cat1'] } });
      expect(currentCategories.tree).toEqual(['Cat1']);
    });

    it('handles secondary category rollback failure gracefully without unhandled rejection', async () => {
      const mockCategoryState = {
        async loadCategoryState() {
          return { tree: ['Cat1'] };
        },
        async saveCategoryState() {
          throw new Error('Rollback persistence failed');
        }
      };

      registerMigrationForTest(1, async () => {
        throw new Error('Migration failure');
      });

      const state = createLibraryState({
        categoryState: mockCategoryState,
        defaultGamesDir: '/games',
        dialog: null,
        fs: null,
        fsSync: null,
        dbFilePath: '',
        loadDB: async () => ({ schemaVersion: 0 }),
        saveDB: async () => {}
      });

      await state.loadDB();
      expect(state.isDegraded()).toBe(true);
      expect(logErrorSpy).toHaveBeenCalledWith(
        '[STORAGE_MIGRATIONS] Secondary category rollback failed:',
        expect.objectContaining({ rollbackErr: expect.any(Error), originalError: expect.any(Error) })
      );
    });
  });
});

describe('canonicalizeStoredGames (Ticket 01.4.3.1.2)', () => {
  let logInfoSpy: any;
  let logErrorSpy: any;
  let logWarnSpy: any;

  beforeEach(() => {
    logInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    logErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    logInfoSpy.mockRestore();
    logErrorSpy.mockRestore();
    logWarnSpy.mockRestore();
  });

  it('re-keys stored games under subsumed paths to canonical keys and removes legacy keys', async () => {
    const db: any = {
      schemaVersion: 1,
      config: { libraryPaths: ['C:/Games'] },
      games: {
        'old_game_a': {
          folderPath: 'C:/Games/RPG/GameA',
          exePath: 'C:/Games/RPG/GameA/game.exe',
          name: 'Game A',
          relativePath: 'old_game_a'
        },
        'old_game_b': {
          folderPath: 'C:/Games/Action/GameB',
          exePath: 'C:/Games/Action/GameB/game.exe',
          name: 'Game B'
        }
      }
    };

    const result = await canonicalizeStoredGames(db, null, ['C:/Games'], 'win32');

    expect(result.migratedCount).toBe(2);
    expect(db.games['old_game_a']).toBeUndefined();
    expect(db.games['old_game_b']).toBeUndefined();
    expect(db.games['RPG/GameA']).toBeDefined();
    expect(db.games['RPG/GameA'].gameKey).toBe('RPG/GameA');
    expect(db.games['RPG/GameA'].relativePath).toBe('RPG/GameA');
    expect(db.games['Action/GameB']).toBeDefined();
    expect(db.games['Action/GameB'].gameKey).toBe('Action/GameB');
  });

  it('executes non-destructive user state merging on key collision for contained records', async () => {
    const db: any = {
      schemaVersion: 1,
      config: { libraryPaths: ['C:/Games'] },
      games: {
        'dup_one': {
          folderPath: 'C:/Games/RPG/GameA',
          exePath: 'C:/Games/RPG/GameA/bin/game.exe',
          name: 'Original Title',
          favorite: false,
          manual: false,
          playtime: 50,
          lastPlayed: 100,
          dateAdded: 200,
          engine: null
        },
        'dup_two': {
          folderPath: 'C:/Games/RPG/GameA',
          exePath: 'C:/Games/RPG/GameA/custom.exe',
          name: 'Custom Name',
          customName: true,
          favorite: true,
          manual: true,
          autoTranslate: true,
          runInBackground: true,
          playtime: 80,
          lastPlayed: 90,
          dateAdded: 150,
          engine: 'rpgmaker',
          platform: 'windows',
          saveFolderOverride: 'C:/Saves',
          sizeBytes: 1024,
          sizeMtime: 5000
        }
      }
    };

    const result = await canonicalizeStoredGames(db, null, ['C:/Games'], 'win32');

    expect(result.migratedCount).toBe(2);
    const merged = db.games['RPG/GameA'];
    expect(merged).toBeDefined();
    expect(merged.name).toBe('Custom Name');
    expect(merged.customName).toBe(true);
    expect(merged.favorite).toBe(true);
    expect(merged.manual).toBe(true);
    expect(merged.autoTranslate).toBe(true);
    expect(merged.runInBackground).toBe(true);
    expect(merged.exePath).toBe('C:/Games/RPG/GameA/custom.exe');
    expect(merged.playtime).toBe(80);
    expect(merged.lastPlayed).toBe(100);
    expect(merged.dateAdded).toBe(150);
    expect(merged.engine).toBe('rpgmaker');
    expect(merged.platform).toBe('windows');
    expect(merged.saveFolderOverride).toBe('C:/Saves');
    expect(merged.sizeBytes).toBe(1024);
    expect(merged.sizeMtime).toBe(5000);
  });

  it('blocks prototype pollution keys and skips malformed records in both purgeOrphans true and false modes', async () => {
    for (const purgeOrphans of [false, true]) {
      const db: any = {
        schemaVersion: 1,
        config: { libraryPaths: ['C:/Games'] },
        games: {
          '__proto__': { folderPath: 'C:/Games/Exploit', exePath: 'C:/Games/Exploit/game.exe' },
          'constructor': { folderPath: 'C:/Games/Exploit2', exePath: 'C:/Games/Exploit2/game.exe' },
          'prototype': { folderPath: 'C:/Games/Exploit3', exePath: 'C:/Games/Exploit3/game.exe' },
          'nullRecord': null,
          'stringRecord': 'malformed',
          'noFolderPath': { exePath: 'C:/Games/Valid/game.exe' },
          'emptyFolderPath': { folderPath: '   ', exePath: 'C:/Games/Valid/game.exe' },
          'valid': { folderPath: 'C:/Games/ValidGame', exePath: 'C:/Games/ValidGame/game.exe' }
        }
      };

      const result = await canonicalizeStoredGames(db, null, ['C:/Games'], 'win32', { purgeOrphans });

      expect(db.games['ValidGame']).toBeDefined();
      expect(Object.prototype.hasOwnProperty.call(db.games, '__proto__')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(db.games, 'constructor')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(db.games, 'prototype')).toBe(false);
      expect(db.games['nullRecord']).toBeUndefined();
      expect(db.games['stringRecord']).toBeUndefined();
      expect(db.games['noFolderPath']).toBeUndefined();
      expect(db.games['emptyFolderPath']).toBeUndefined();

      expect(logWarnSpy).toHaveBeenCalledWith(
        '[STORAGE_CANONICALIZE] Blocked prototype pollution legacy key:',
        expect.objectContaining({ legacyKey: expect.stringMatching(/__proto__|constructor|prototype/) })
      );
      expect(logWarnSpy).toHaveBeenCalledWith(
        '[STORAGE_CANONICALIZE] Skipping malformed stored game record with missing or invalid folderPath:',
        expect.objectContaining({ legacyKey: expect.any(String) })
      );
    }
  });

  it('blocks root-level stored game record whose folderPath equals matchingRoot and routes to uncontainedEntries', async () => {
    // When purgeOrphans is true -> purged
    const dbPurge: any = {
      schemaVersion: 1,
      config: { libraryPaths: ['C:/Games'] },
      games: {
        'root_key': {
          folderPath: 'C:/Games',
          exePath: 'C:/Games/Game.exe',
          name: 'Root Level Game'
        },
        'nested_key': {
          folderPath: 'C:/Games/DedicatedFolder',
          exePath: 'C:/Games/DedicatedFolder/Game.exe',
          name: 'Dedicated Game'
        }
      }
    };

    await canonicalizeStoredGames(dbPurge, null, ['C:/Games'], 'win32', { purgeOrphans: true });

    expect(logWarnSpy).toHaveBeenCalledWith(
      '[STORAGE_CANONICALIZE] Blocked root-level stored game record without dedicated game folder:',
      expect.objectContaining({
        legacyKey: 'root_key',
        folderPath: 'C:/Games',
        matchingRoot: 'C:/Games'
      })
    );
    expect(dbPurge.games['Games']).toBeUndefined();
    expect(dbPurge.games['root_key']).toBeUndefined();
    expect(dbPurge.games['DedicatedFolder']).toBeDefined();

    // When purgeOrphans is false -> retained under legacyKey, not under 'Games'
    const dbRetain: any = {
      schemaVersion: 1,
      config: { libraryPaths: ['C:/Games'] },
      games: {
        'root_key': {
          folderPath: 'C:/Games',
          exePath: 'C:/Games/Game.exe',
          name: 'Root Level Game'
        }
      }
    };

    await canonicalizeStoredGames(dbRetain, null, ['C:/Games'], 'win32', { purgeOrphans: false });

    expect(dbRetain.games['Games']).toBeUndefined();
    expect(dbRetain.games['root_key']).toBeDefined();
    expect(dbRetain.games['root_key'].folderPath).toBe('C:/Games');
  });

  it('retains uncontained games when purgeOrphans is false and merges metadata on key collisions', async () => {
    const db: any = {
      schemaVersion: 1,
      config: { libraryPaths: ['C:/Games'] },
      games: {
        // Contained record re-keys to 'SharedKey'
        'legacyContained': {
          folderPath: 'C:/Games/SharedKey',
          exePath: 'C:/Games/SharedKey/game.exe',
          name: 'Contained Name',
          playtime: 10,
          favorite: false
        },
        // Uncontained record already at key 'SharedKey'
        'SharedKey': {
          folderPath: 'D:/External/SharedKey',
          exePath: 'D:/External/SharedKey/game.exe',
          name: 'External Name',
          customName: true,
          playtime: 90,
          favorite: true,
          dateAdded: 100
        },
        // Other uncontained record without collision
        'uncontainedOther': {
          folderPath: 'D:/External/OtherGame',
          exePath: 'D:/External/OtherGame/game.exe',
          name: 'Other Uncontained',
          relativePath: 'external\\other'
        }
      }
    };

    await canonicalizeStoredGames(db, null, ['C:/Games'], 'win32', { purgeOrphans: false });

    expect(db.games['SharedKey']).toBeDefined();
    // Contained record remains authoritative for physical coordinates
    expect(db.games['SharedKey'].folderPath).toBe('C:/Games/SharedKey');
    // User curation merged
    expect(db.games['SharedKey'].playtime).toBe(90);
    expect(db.games['SharedKey'].favorite).toBe(true);
    expect(db.games['SharedKey'].name).toBe('External Name');
    expect(db.games['SharedKey'].customName).toBe(true);

    // Uncontained without collision retained and relativePath normalized
    expect(db.games['uncontainedOther']).toBeDefined();
    expect(db.games['uncontainedOther'].relativePath).toBe('external/other');
  });

  it('purges orphaned uncontained games and category assignments when purgeOrphans is true, while preserving multi-instance categories', async () => {
    let savedCatState: any = null;
    const mockCatState = {
      assignments: {
        'path:orphan_game': ['TagOrphan'],
        'game:id:RJ12345678': ['TagMulti']
      }
    };
    const mockCategoryService = {
      isDegraded: () => false,
      loadCategoryState: async () => JSON.parse(JSON.stringify(mockCatState)),
      saveCategoryState: async (state: any) => {
        savedCatState = JSON.parse(JSON.stringify(state));
      }
    };

    const db: any = {
      schemaVersion: 1,
      config: { libraryPaths: ['C:/Games'] },
      games: {
        // Contained game
        'contained': {
          folderPath: 'C:/Games/ActiveGame',
          exePath: 'C:/Games/ActiveGame/game.exe'
        },
        // Uncontained game (orphan)
        'orphan_game': {
          folderPath: 'D:/Offline/Orphan',
          exePath: 'D:/Offline/Orphan/g.exe',
          relativePath: 'orphan_game'
        },
        // Multi-instance contained copy
        'multi_active': {
          folderPath: 'C:/Games/MultiGame RJ12345678',
          exePath: 'C:/Games/MultiGame RJ12345678/game.exe',
          folderName: 'MultiGame RJ12345678'
        },
        // Multi-instance uncontained copy
        'multi_offline': {
          folderPath: 'D:/Offline/MultiGame RJ12345678',
          exePath: 'D:/Offline/MultiGame RJ12345678/game.exe',
          folderName: 'MultiGame RJ12345678'
        }
      }
    };

    await canonicalizeStoredGames(db, mockCategoryService, ['C:/Games'], 'win32', { purgeOrphans: true });

    // Stored games dictionary: orphan removed, multi_active canonicalized, multi_offline purged
    expect(db.games['orphan_game']).toBeUndefined();
    expect(db.games['multi_offline']).toBeUndefined();
    expect(db.games['ActiveGame']).toBeDefined();
    expect(db.games['MultiGame RJ12345678']).toBeDefined();

    // Category assignments: orphan_game purged, but multi RJ12345678 preserved because surviving copy exists
    expect(savedCatState.assignments['path:orphan_game']).toBeUndefined();
    expect(savedCatState.assignments['game:id:RJ12345678']).toEqual(['TagMulti']);

    expect(logInfoSpy).toHaveBeenCalledWith(
      '[STORAGE_CANONICALIZE] Purged orphaned stored game and category assignments:',
      expect.objectContaining({ legacyKey: 'orphan_game', folderPath: 'D:/Offline/Orphan' })
    );
    expect(logInfoSpy).toHaveBeenCalledWith(
      '[STORAGE_CANONICALIZE] Orphan purge sweep completed:',
      expect.objectContaining({ purgedGamesCount: 2, purgedCategoriesCount: 1 })
    );
  });

  it('executes order-independent two-phase category reconciliation without category loss or cross-contamination across both entry orders', async () => {
    // Record A re-keys from 'path:gamex' to 'path:sub/gamex'
    // Record B re-keys from 'path:other/gamex' to 'path:gamex'
    const recordA = {
      folderPath: 'C:/Games/sub/gamex',
      exePath: 'C:/Games/sub/gamex/g.exe',
      relativePath: 'gamex',
      folderName: 'gamex'
    };
    const recordB = {
      folderPath: 'C:/Games/gamex',
      exePath: 'C:/Games/gamex/g.exe',
      relativePath: 'other/gamex',
      folderName: 'gamex'
    };

    // Test Order 1: [A, B]
    {
      let savedCatState: any = null;
      const mockCategoryService = {
        isDegraded: () => false,
        loadCategoryState: async () => ({
          assignments: {
            'path:gamex': ['CatForRecordA'],
            'path:other/gamex': ['CatForRecordB']
          }
        }),
        saveCategoryState: async (state: any) => {
          savedCatState = JSON.parse(JSON.stringify(state));
        }
      };

      const db1: any = {
        schemaVersion: 1,
        config: { libraryPaths: ['C:/Games'] },
        games: {
          'gamex': { ...recordA },
          'other_gamex': { ...recordB }
        }
      };

      await canonicalizeStoredGames(db1, mockCategoryService, ['C:/Games'], 'win32');

      expect(savedCatState.assignments['path:sub/gamex']).toEqual(['CatForRecordA']);
      expect(savedCatState.assignments['path:gamex']).toEqual(['CatForRecordB']);
      expect(savedCatState.assignments['path:other/gamex']).toBeUndefined();
    }

    // Test Order 2: [B, A]
    {
      let savedCatState: any = null;
      const mockCategoryService = {
        isDegraded: () => false,
        loadCategoryState: async () => ({
          assignments: {
            'path:gamex': ['CatForRecordA'],
            'path:other/gamex': ['CatForRecordB']
          }
        }),
        saveCategoryState: async (state: any) => {
          savedCatState = JSON.parse(JSON.stringify(state));
        }
      };

      const db2: any = {
        schemaVersion: 1,
        config: { libraryPaths: ['C:/Games'] },
        games: {
          'other_gamex': { ...recordB },
          'gamex': { ...recordA }
        }
      };

      await canonicalizeStoredGames(db2, mockCategoryService, ['C:/Games'], 'win32');

      expect(savedCatState.assignments['path:sub/gamex']).toEqual(['CatForRecordA']);
      expect(savedCatState.assignments['path:gamex']).toEqual(['CatForRecordB']);
      expect(savedCatState.assignments['path:other/gamex']).toBeUndefined();
    }
  });

  it('audits categoryState degraded state after load and throws', async () => {
    const degradedCategoryService = {
      isDegraded: () => true,
      loadCategoryState: async () => ({ assignments: {} })
    };

    const db: any = {
      schemaVersion: 1,
      games: { g1: { folderPath: 'C:/Games/G1', exePath: 'C:/Games/G1/g.exe' } }
    };

    await expect(
      canonicalizeStoredGames(db, degradedCategoryService, ['C:/Games'], 'win32')
    ).rejects.toThrow('Category state is in degraded state');

    expect(logErrorSpy).toHaveBeenCalledWith(
      '[STORAGE_CANONICALIZE] Category state is in degraded state after load, aborting canonicalization:',
      expect.objectContaining({ isBootstrapMigration: undefined })
    );
  });

  it('re-throws categoryState.loadCategoryState rejection immediately', async () => {
    const failingCategoryService = {
      isDegraded: () => false,
      loadCategoryState: async () => {
        throw new Error('Disk read failure');
      }
    };

    const db: any = { schemaVersion: 1, games: {} };

    await expect(
      canonicalizeStoredGames(db, failingCategoryService, ['C:/Games'], 'win32')
    ).rejects.toThrow('Disk read failure');
  });

  it('re-throws error thrown during category reconciliation without committing partial category state', async () => {
    const saveCategorySpy = vi.fn();
    const throwingAssignments = new Proxy({ 'path:g1': ['Cat1'] }, {
      deleteProperty() {
        throw new Error('Reconciliation corruption');
      }
    });

    const categoryState = {
      isDegraded: () => false,
      loadCategoryState: async () => ({ assignments: throwingAssignments }),
      saveCategoryState: saveCategorySpy
    };

    const db: any = {
      schemaVersion: 1,
      config: { libraryPaths: ['C:/Games'] },
      games: {
        'g1': {
          folderPath: 'C:/Games/sub/g1',
          exePath: 'C:/Games/sub/g1/g.exe',
          relativePath: 'g1'
        }
      }
    };

    await expect(
      canonicalizeStoredGames(db, categoryState, ['C:/Games'], 'win32')
    ).rejects.toThrow('Reconciliation corruption');

    expect(logErrorSpy).toHaveBeenCalledWith(
      '[STORAGE_CANONICALIZE] Failed to migrate category assignments:',
      expect.objectContaining({ error: expect.any(Error) })
    );
    expect(saveCategorySpy).not.toHaveBeenCalled();
  });

  it('audits categoryState degraded state during persistence and throws', async () => {
    let callCount = 0;
    const categoryState = {
      isDegraded: () => {
        callCount++;
        // First check after load is false, second check prior to save is true
        return callCount > 1;
      },
      loadCategoryState: async () => ({
        assignments: { 'path:old_key': ['Cat1'] }
      }),
      saveCategoryState: vi.fn()
    };

    const db: any = {
      schemaVersion: 1,
      config: { libraryPaths: ['C:/Games'] },
      games: {
        'old_key': {
          folderPath: 'C:/Games/NewFolder',
          exePath: 'C:/Games/NewFolder/g.exe',
          relativePath: 'old_key'
        }
      }
    };

    await expect(
      canonicalizeStoredGames(db, categoryState, ['C:/Games'], 'win32')
    ).rejects.toThrow('Category state is in degraded state');

    expect(logErrorSpy).toHaveBeenCalledWith(
      '[STORAGE_CANONICALIZE] Category state is in degraded state during persistence, aborting canonicalization:',
      expect.objectContaining({ isBootstrapMigration: undefined })
    );
    expect(categoryState.saveCategoryState).not.toHaveBeenCalled();
  });

  it('re-throws categoryState.saveCategoryState rejection immediately', async () => {
    const categoryState = {
      isDegraded: () => false,
      loadCategoryState: async () => ({
        assignments: { 'path:old_key': ['Cat1'] }
      }),
      saveCategoryState: async () => {
        throw new Error('Save permission denied');
      }
    };

    const db: any = {
      schemaVersion: 1,
      config: { libraryPaths: ['C:/Games'] },
      games: {
        'old_key': {
          folderPath: 'C:/Games/NewFolder',
          exePath: 'C:/Games/NewFolder/g.exe',
          relativePath: 'old_key'
        }
      }
    };

    await expect(
      canonicalizeStoredGames(db, categoryState, ['C:/Games'], 'win32')
    ).rejects.toThrow('Save permission denied');
  });
});

describe('Migration M0->1: Bootstrap Migration (Ticket 01.4.3.1.2)', () => {
  let logInfoSpy: any;
  let logErrorSpy: any;
  let logWarnSpy: any;
  let tempDirs: string[] = [];

  async function createTempDir(): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'yumeshelf-m01-test-'));
    tempDirs.push(dir);
    return dir;
  }

  beforeEach(() => {
    logInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    logErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(async () => {
    resetMigrationsForTest();
    logInfoSpy.mockRestore();
    logErrorSpy.mockRestore();
    logWarnSpy.mockRestore();

    for (const dir of tempDirs) {
      try {
        await fs.rm(dir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
    tempDirs = [];
  });

  it('adopts unversioned top-level legacy game records into db.games and deletes root envelope properties', async () => {
    const db: any = {
      schemaVersion: 0,
      config: { libraryPaths: ['C:/Games'] },
      games: {},
      'TopLevelA': {
        name: 'Top Level A',
        folderPath: 'C:/Games/TopLevelA',
        exePath: 'C:/Games/TopLevelA/game.exe',
        favorite: true,
        playtime: 120
      },
      'TopLevelB': {
        name: 'Top Level B',
        folderPath: 'C:/Games/TopLevelB',
        exePath: 'C:/Games/TopLevelB/game.exe',
        dateAdded: 500
      }
    };

    const mockContext: any = {
      categoryState: null,
      defaultGamesDir: 'C:/Games',
      fsSync
    };

    const result = await migrationM0to1(db, mockContext, 'win32');

    expect(result.games['TopLevelA']).toBeDefined();
    expect(result.games['TopLevelA'].name).toBe('Top Level A');
    expect(result.games['TopLevelA'].favorite).toBe(true);
    expect(result.games['TopLevelA'].playtime).toBe(120);
    expect(result.games['TopLevelB']).toBeDefined();
    expect(result['TopLevelA']).toBeUndefined();
    expect(result['TopLevelB']).toBeUndefined();
  });

  it('merges user curation metadata non-destructively when adopting legacy top-level record into existing db.games[key]', async () => {
    const db: any = {
      schemaVersion: 0,
      config: { libraryPaths: ['C:/Games'] },
      games: {
        'GameA': {
          folderPath: 'C:/Games/GameA',
          exePath: 'C:/Games/GameA/bin/game.exe',
          name: 'Existing Title',
          playtime: 200,
          favorite: false,
          manual: false,
          dateAdded: 300
        }
      },
      'GameA': {
        folderPath: 'C:/Games/GameA',
        exePath: 'C:/Games/GameA/custom.exe',
        name: 'Custom User Title',
        customName: true,
        playtime: 150,
        favorite: true,
        manual: true,
        autoTranslate: true,
        runInBackground: true,
        dateAdded: 100,
        engine: 'unity',
        platform: 'windows'
      }
    };

    const mockContext: any = {
      categoryState: null,
      defaultGamesDir: 'C:/Games',
      fsSync
    };

    const result = await migrationM0to1(db, mockContext, 'win32');

    const game = result.games['GameA'];
    expect(game).toBeDefined();
    expect(game.name).toBe('Custom User Title');
    expect(game.customName).toBe(true);
    expect(game.favorite).toBe(true);
    expect(game.manual).toBe(true);
    expect(game.autoTranslate).toBe(true);
    expect(game.runInBackground).toBe(true);
    expect(game.playtime).toBe(200);
    expect(game.dateAdded).toBe(100);
    expect(game.engine).toBe('unity');
    expect(game.platform).toBe('windows');
    expect(game.exePath).toBe('C:/Games/GameA/custom.exe');
    expect(result['GameA']).toBeUndefined();
  });

  it('resolves effectiveFolder across nested wrapper directories and preserves non-wrapper descendants', async () => {
    const db: any = {
      schemaVersion: 0,
      config: { libraryPaths: ['C:/Games'] },
      games: {},
      // Case 1: Multiple nested wrapper folders unwrapped to topmost folder
      'GameWrapper': {
        name: 'Game Wrapper',
        folderPath: 'C:/Games/GameWrapper',
        exePath: 'C:/Games/GameWrapper/bin/win64/Game.exe'
      },
      // Case 2: Non-wrapper subfolder (e.g. Version 1) preserved
      'GameVersion': {
        name: 'Game Version',
        folderPath: 'C:/Games/GameVersion',
        exePath: 'C:/Games/GameVersion/Version 1/Game.exe'
      },
      // Case 3: Wrapper folder inside non-wrapper folder (bin unwrapped to Season 1)
      'GameNested': {
        name: 'Game Nested',
        folderPath: 'C:/Games/GameNested',
        exePath: 'C:/Games/GameNested/Season 1/bin/Game.exe'
      }
    };

    const mockContext: any = {
      categoryState: null,
      defaultGamesDir: 'C:/Games',
      fsSync
    };

    const result = await migrationM0to1(db, mockContext, 'win32');

    expect(result.games['GameWrapper']).toBeDefined();
    expect(result.games['GameWrapper'].folderPath).toBe('C:/Games/GameWrapper');

    expect(result.games['GameVersion/Version 1']).toBeDefined();
    expect(result.games['GameVersion/Version 1'].folderPath).toBe('C:/Games/GameVersion/Version 1');

    expect(result.games['GameNested/Season 1']).toBeDefined();
    expect(result.games['GameNested/Season 1'].folderPath).toBe('C:/Games/GameNested/Season 1');
  });

  it('resolves effectiveFolder for macOS .app bundles via resolveBundleRoot', async () => {
    const db: any = {
      schemaVersion: 0,
      config: { libraryPaths: ['/Games'] },
      games: {},
      'MacGame': {
        name: 'Mac Game',
        folderPath: '/Games/MacGame',
        exePath: '/Games/MacGame/Game.app/Contents/MacOS/Game'
      }
    };

    const mockContext: any = {
      categoryState: null,
      defaultGamesDir: '/Games',
      fsSync
    };

    const result = await migrationM0to1(db, mockContext, 'darwin');

    expect(result.games['MacGame/Game.app']).toBeDefined();
    expect(result.games['MacGame/Game.app'].folderPath).toBe('/Games/MacGame/Game.app');
  });

  it('validates context.defaultGamesDir and adopts it when valid and existing, leaving empty otherwise', async () => {
    const validDir = await createTempDir();

    // 1. Valid existing directory -> adopted
    {
      const db: any = { schemaVersion: 0, config: { libraryPaths: [] } };
      const ctx: any = { defaultGamesDir: validDir, fsSync };
      const res = await migrationM0to1(db, ctx, 'win32');
      expect(res.config.libraryPaths).toEqual([validDir]);
    }

    // 2. Non-existent directory -> empty
    {
      const db: any = { schemaVersion: 0, config: { libraryPaths: [] } };
      const ctx: any = { defaultGamesDir: path.join(validDir, 'non_existent'), fsSync };
      const res = await migrationM0to1(db, ctx, 'win32');
      expect(res.config.libraryPaths).toEqual([]);
    }

    // 3. Illegal control characters or null bytes -> empty
    {
      const db: any = { schemaVersion: 0, config: { libraryPaths: [] } };
      const ctx: any = { defaultGamesDir: `${validDir}\0illegal`, fsSync };
      const res = await migrationM0to1(db, ctx, 'win32');
      expect(res.config.libraryPaths).toEqual([]);
    }

    // 4. Filesystem root -> empty
    {
      const db: any = { schemaVersion: 0, config: { libraryPaths: [] } };
      const ctx: any = { defaultGamesDir: 'C:/', fsSync };
      const res = await migrationM0to1(db, ctx, 'win32');
      expect(res.config.libraryPaths).toEqual([]);
    }
  });

  it('rejects prototype pollution keys on root db envelope', async () => {
    const db: any = {
      schemaVersion: 0,
      config: { libraryPaths: ['C:/Games'] },
      games: {},
      '__proto__': { folderPath: 'C:/Games/Proto', exePath: 'C:/Games/Proto/game.exe' },
      'constructor': { folderPath: 'C:/Games/Ctor', exePath: 'C:/Games/Ctor/game.exe' },
      'prototype': { folderPath: 'C:/Games/Proto2', exePath: 'C:/Games/Proto2/game.exe' }
    };

    const mockContext: any = { categoryState: null, defaultGamesDir: 'C:/Games', fsSync };

    const result = await migrationM0to1(db, mockContext, 'win32');
    expect(result.games['Proto']).toBeUndefined();
    expect(result.games['Ctor']).toBeUndefined();
    expect(result.games['Proto2']).toBeUndefined();
  });

  it('re-throws category state failure during bootstrap migration to trip degraded circuit-breaker in loadDB()', async () => {
    const dir = await createTempDir();
    const dbPath = path.join(dir, 'category_fail_db.json');
    const legacyDb = {
      schemaVersion: 0,
      config: { libraryPaths: [dir] },
      games: {
        'old_game': {
          folderPath: path.join(dir, 'GameA'),
          exePath: path.join(dir, 'GameA', 'game.exe')
        }
      }
    };
    await fs.writeFile(dbPath, JSON.stringify(legacyDb));

    const failingCategoryState = {
      isDegraded: () => false,
      loadCategoryState: async () => {
        throw new Error('Category store corrupted');
      }
    };

    const state = createLibraryState({
      categoryState: failingCategoryState,
      defaultGamesDir: dir,
      dialog: null,
      fs,
      fsSync,
      dbFilePath: dbPath
    });

    await state.loadDB();
    expect(state.isDegraded()).toBe(true);
    expect(logErrorSpy).toHaveBeenCalledWith(
      '[STORAGE_MIGRATIONS] Migration runner failed, entering degraded state:',
      expect.objectContaining({ initialVersion: 0, targetVersion: 1, error: expect.any(Error) })
    );
  });
});
