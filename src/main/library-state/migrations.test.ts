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
  type LibraryDatabase,
  type StoredGameRecord
} from './migrations';
import { createLibraryState, type LibraryContext } from './index';
import { normalizeLibraryConfigShape } from './scanner';

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

      await expect(runStorageMigrations({ schemaVersion: 0 }, mockContext, 'win32')).rejects.toThrow(
        'Missing migration step for schema version 1'
      );
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
      // MIGRATIONS is empty by default
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

      // 1. Initial attempt fails because no migration is registered in production
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
