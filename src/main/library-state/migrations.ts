/// <reference types="node" />
import { isPlainObject, type LibraryConfig } from './scanner';
import type { PlatformInput } from '../../shared/path-subsumption';
import type { LibraryContext } from './index';

export const CURRENT_SCHEMA_VERSION = 1;

export interface StoredGameRecord {
  folderPath: string;
  exePath: string;
  name?: string;
  customName?: boolean;
  folderName?: string;
  gameKey?: string;
  relativePath?: string;
  favorite?: boolean;
  playtime?: number;
  lastPlayed?: number;
  runInBackground?: boolean;
  autoTranslate?: boolean;
  dateAdded?: number;
  engine?: string | null;
  saveFolderOverride?: string;
  manual?: boolean;
  platform?: 'macos' | 'windows' | 'linux';
  sizeBytes?: number;
  sizeMtime?: number;
  [key: string]: any;
}

export interface LibraryDatabase {
  schemaVersion: number;
  config: LibraryConfig;
  games: Record<string, StoredGameRecord>;
  titleResolutionConfig?: {
    titleDisplayMode?: string;
    displayProductCodes?: boolean;
    preferredLocale?: string;
  };
  [key: string]: any;
}

export type StorageMigrationFunction = (
  db: any,
  context: LibraryContext,
  targetPlatform?: PlatformInput
) => Promise<any>;

const BASELINE_MIGRATIONS: Record<number, StorageMigrationFunction> = {};

const MIGRATIONS: Record<number, StorageMigrationFunction> = {
  ...BASELINE_MIGRATIONS
};

export function registerMigrationForTest(
  version: number,
  fn: StorageMigrationFunction
): () => void {
  MIGRATIONS[version] = fn;
  return () => {
    delete MIGRATIONS[version];
  };
}

export function resetMigrationsForTest(): void {
  for (const key of Object.keys(MIGRATIONS)) {
    delete MIGRATIONS[Number(key)];
  }
  Object.assign(MIGRATIONS, BASELINE_MIGRATIONS);
}

export async function runStorageMigrations(
  db: any,
  context: LibraryContext,
  targetPlatform?: PlatformInput,
  targetVersion: number = CURRENT_SCHEMA_VERSION
): Promise<LibraryDatabase> {
  let currentVersion = db?.schemaVersion ?? 0;
  console.info('[STORAGE_MIGRATIONS] Starting storage migrations:', {
    initialVersion: currentVersion,
    targetVersion
  });

  while (currentVersion < targetVersion) {
    const nextVersion = currentVersion + 1;
    const migrationFn = MIGRATIONS[nextVersion];
    if (!migrationFn || typeof migrationFn !== 'function') {
      console.error('[STORAGE_MIGRATIONS] Missing migration function for schema version:', {
        currentVersion,
        nextVersion,
        targetVersion
      });
      throw new Error(`Missing migration step for schema version ${nextVersion}`);
    }

    try {
      const migratedDb = await migrationFn(db, context, targetPlatform);
      if (!isPlainObject(migratedDb)) {
        console.error('[STORAGE_MIGRATIONS] Migration step returned invalid non-plain object database structure:', {
          currentVersion,
          nextVersion
        });
        throw new Error('Migration step returned invalid database structure: expected plain object');
      }
      db = migratedDb;
      console.info('[STORAGE_MIGRATIONS] Applied migration step:', {
        fromVersion: currentVersion,
        toVersion: nextVersion
      });
    } catch (err) {
      console.error('[STORAGE_MIGRATIONS] Migration step execution failed:', {
        fromVersion: currentVersion,
        targetVersion: nextVersion,
        error: err
      });
      throw err;
    }

    db.schemaVersion = nextVersion;
    currentVersion = nextVersion;
  }

  return db;
}
