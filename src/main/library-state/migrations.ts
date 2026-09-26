/// <reference types="node" />
import {
  isPlainObject,
  normalizeLibraryConfigShape,
  WRAPPER_DIRECTORY_NAMES,
  type LibraryConfig
} from './scanner';
import {
  type PlatformInput,
  normalizePathForPlatform,
  subsumeLibraryPaths,
  buildGameKey,
  isSubsumedBy,
  getFolderBaseName
} from '../../shared/path-subsumption';
import { buildLogicalGameId } from './continuity';
import { resolveBundleRoot } from '@yumeshelf/engine';
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

export interface CanonicalizeOptions {
  isBootstrapMigration?: boolean;
  purgeOrphans?: boolean;
}

export async function canonicalizeStoredGames(
  db: LibraryDatabase,
  categoryState: any,
  libraryPaths: string[],
  targetPlatform?: PlatformInput,
  options?: CanonicalizeOptions
): Promise<{ migratedCount: number }> {
  const subsumedRoots = subsumeLibraryPaths(libraryPaths || [], targetPlatform);

  let catState: any = null;
  if (typeof categoryState?.loadCategoryState === 'function') {
    catState = await categoryState.loadCategoryState();
  }

  if (categoryState?.isDegraded?.() === true) {
    console.error(
      '[STORAGE_CANONICALIZE] Category state is in degraded state after load, aborting canonicalization:',
      { isBootstrapMigration: options?.isBootstrapMigration }
    );
    throw new Error('Category state is in degraded state');
  }

  const originalEntries = Object.entries(db.games || {});
  const initialAssignments: Record<string, string[]> = catState?.assignments
    ? JSON.parse(JSON.stringify(catState.assignments))
    : {};
  const stationaryIds = new Set<string>();
  const remappedOldIds = new Set<string>();
  const pendingCategoryMerges = new Map<string, Set<string>>();
  const nextGames: Record<string, any> = {};
  const uncontainedEntries: Array<[string, any]> = [];
  const survivingLogicalIds = new Set<string>();
  let catMutated = false;
  let migratedCount = 0;

  // Pass 1: Contained Games Indexing & NextGames Accumulation
  for (const [legacyKey, record] of originalEntries) {
    if (
      !record ||
      typeof record !== 'object' ||
      typeof record.folderPath !== 'string' ||
      !record.folderPath.trim()
    ) {
      console.warn(
        '[STORAGE_CANONICALIZE] Skipping malformed stored game record with missing or invalid folderPath:',
        { legacyKey, record }
      );
      continue;
    }

    if (
      legacyKey === '__proto__' ||
      legacyKey === 'constructor' ||
      legacyKey === 'prototype'
    ) {
      console.warn('[STORAGE_CANONICALIZE] Blocked prototype pollution legacy key:', {
        legacyKey
      });
      continue;
    }

    const matchingRoot = subsumedRoots.find((root) =>
      isSubsumedBy(record.folderPath, root, targetPlatform)
    );

    if (matchingRoot) {
      if (
        normalizePathForPlatform(record.folderPath, targetPlatform) ===
        normalizePathForPlatform(matchingRoot, targetPlatform)
      ) {
        console.warn(
          '[STORAGE_CANONICALIZE] Blocked root-level stored game record without dedicated game folder:',
          { legacyKey, folderPath: record.folderPath, matchingRoot }
        );
        uncontainedEntries.push([legacyKey, record]);
        continue;
      }

      const canonicalGameKey = buildGameKey(
        matchingRoot,
        record.folderPath,
        targetPlatform
      );

      if (
        typeof canonicalGameKey !== 'string' ||
        !canonicalGameKey.trim() ||
        canonicalGameKey === '__proto__' ||
        canonicalGameKey === 'constructor' ||
        canonicalGameKey === 'prototype'
      ) {
        console.warn('[STORAGE_CANONICALIZE] Blocked unsafe canonical game key:', {
          legacyKey,
          canonicalGameKey,
          folderPath: record.folderPath
        });
        continue;
      }

      const fallbackOldId = buildLogicalGameId({
        ...record,
        gameKey: legacyKey,
        relativePath: record.relativePath || legacyKey
      });
      const canonicalId = buildLogicalGameId({
        ...record,
        gameKey: canonicalGameKey,
        relativePath: canonicalGameKey
      });
      survivingLogicalIds.add(fallbackOldId);
      survivingLogicalIds.add(canonicalId);

      const existing = Object.prototype.hasOwnProperty.call(nextGames, canonicalGameKey)
        ? nextGames[canonicalGameKey]
        : undefined;

      if (existing) {
        nextGames[canonicalGameKey] = {
          ...existing,
          ...record,
          gameKey: canonicalGameKey,
          relativePath: canonicalGameKey,
          favorite: !!(existing.favorite || record.favorite),
          manual: !!(existing.manual || record.manual),
          autoTranslate: !!(existing.autoTranslate || record.autoTranslate),
          runInBackground: !!(existing.runInBackground || record.runInBackground),
          engine: existing.engine || record.engine || null,
          platform: existing.platform || record.platform,
          exePath: existing.manual
            ? existing.exePath
            : record.manual
            ? record.exePath
            : existing.exePath || record.exePath,
          folderPath: existing.folderPath || record.folderPath,
          folderName: existing.folderName || record.folderName,
          sizeBytes:
            typeof existing.sizeBytes === 'number'
              ? existing.sizeBytes
              : record.sizeBytes,
          sizeMtime:
            typeof existing.sizeMtime === 'number'
              ? existing.sizeMtime
              : record.sizeMtime,
          playtime: Math.max(existing.playtime || 0, record.playtime || 0),
          lastPlayed: Math.max(existing.lastPlayed || 0, record.lastPlayed || 0),
          name: existing.customName
            ? existing.name
            : record.customName
            ? record.name
            : existing.name || record.name,
          customName: !!(existing.customName || record.customName),
          saveFolderOverride:
            existing.saveFolderOverride || record.saveFolderOverride,
          dateAdded: Math.min(
            existing.dateAdded || Date.now(),
            record.dateAdded || Date.now()
          )
        };
      } else {
        nextGames[canonicalGameKey] = {
          ...record,
          gameKey: canonicalGameKey,
          relativePath: canonicalGameKey
        };
      }
      delete nextGames[canonicalGameKey]?.migratedFromGameKey;

      if (canonicalGameKey !== legacyKey) {
        migratedCount++;
      }

      const newGameId = buildLogicalGameId(nextGames[canonicalGameKey]);
      survivingLogicalIds.add(newGameId);

      if (newGameId === fallbackOldId) {
        stationaryIds.add(newGameId);
      } else {
        remappedOldIds.add(fallbackOldId);
        if (
          Array.isArray(initialAssignments[fallbackOldId]) &&
          initialAssignments[fallbackOldId].length > 0
        ) {
          let mergeSet = pendingCategoryMerges.get(newGameId);
          if (!mergeSet) {
            mergeSet = new Set<string>();
            pendingCategoryMerges.set(newGameId, mergeSet);
          }
          for (const cat of initialAssignments[fallbackOldId]) {
            mergeSet.add(cat);
          }
        }
      }
    } else {
      uncontainedEntries.push([legacyKey, record]);
    }
  }

  // Pass 1B: Uncontained Records Retention Sweep
  if (options?.purgeOrphans !== true) {
    for (const [legacyKey, record] of uncontainedEntries) {
      if (Object.prototype.hasOwnProperty.call(nextGames, legacyKey)) {
        const existing = nextGames[legacyKey];
        nextGames[legacyKey] = {
          ...existing,
          playtime: Math.max(existing.playtime || 0, record.playtime || 0),
          lastPlayed: Math.max(existing.lastPlayed || 0, record.lastPlayed || 0),
          favorite: !!(existing.favorite || record.favorite),
          autoTranslate: !!(existing.autoTranslate || record.autoTranslate),
          runInBackground: !!(existing.runInBackground || record.runInBackground),
          customName: !!(existing.customName || record.customName),
          name: existing.customName
            ? existing.name
            : record.customName
            ? record.name
            : existing.name || record.name,
          saveFolderOverride:
            existing.saveFolderOverride || record.saveFolderOverride,
          dateAdded: Math.min(
            existing.dateAdded || Date.now(),
            record.dateAdded || Date.now()
          )
        };

        const newGameId = buildLogicalGameId(nextGames[legacyKey]);
        const fallbackOldId = buildLogicalGameId({
          ...record,
          gameKey: legacyKey,
          relativePath: record.relativePath || legacyKey
        });

        if (newGameId === fallbackOldId) {
          stationaryIds.add(newGameId);
        } else {
          remappedOldIds.add(fallbackOldId);
          if (
            Array.isArray(initialAssignments[fallbackOldId]) &&
            initialAssignments[fallbackOldId].length > 0
          ) {
            let mergeSet = pendingCategoryMerges.get(newGameId);
            if (!mergeSet) {
              mergeSet = new Set<string>();
              pendingCategoryMerges.set(newGameId, mergeSet);
            }
            for (const cat of initialAssignments[fallbackOldId]) {
              mergeSet.add(cat);
            }
          }
        }

        survivingLogicalIds.add(newGameId);
        survivingLogicalIds.add(fallbackOldId);
      } else {
        nextGames[legacyKey] = {
          ...record,
          gameKey: legacyKey,
          relativePath: record.relativePath
            ? record.relativePath.replace(/\\/g, '/')
            : legacyKey
        };
        const retainedId = buildLogicalGameId(nextGames[legacyKey]);
        stationaryIds.add(retainedId);
        survivingLogicalIds.add(retainedId);
      }
    }
  }

  // Category Assignment Two-Phase Reconciliation (Post-Pass 1B, Pre-Pass 2)
  if (categoryState && catState?.assignments) {
    try {
      // Phase A (Vacated Source Cleanup)
      for (const oldId of remappedOldIds) {
        if (
          !stationaryIds.has(oldId) &&
          Object.prototype.hasOwnProperty.call(catState.assignments, oldId)
        ) {
          delete catState.assignments[oldId];
          catMutated = true;
        }
      }

      // Phase B (Target Merge Commit)
      for (const [targetId, incomingCategories] of pendingCategoryMerges.entries()) {
        const existingTags = Array.isArray(catState.assignments[targetId])
          ? catState.assignments[targetId]
          : [];
        catState.assignments[targetId] = Array.from(
          new Set([...existingTags, ...incomingCategories])
        );
        catMutated = true;
      }
    } catch (err) {
      console.error(
        '[STORAGE_CANONICALIZE] Failed to migrate category assignments:',
        { error: err }
      );
      throw err;
    }
  }

  // Pass 2: Orphan Evaluation & Category Purge Sweep
  if (options?.purgeOrphans === true) {
    let purgedGamesCount = 0;
    let purgedCategoriesCount = 0;
    for (const [legacyKey, record] of uncontainedEntries) {
      const orphanId = buildLogicalGameId({
        ...record,
        gameKey: legacyKey,
        relativePath: record.relativePath || legacyKey
      });
      if (!survivingLogicalIds.has(orphanId)) {
        if (
          catState?.assignments &&
          Object.prototype.hasOwnProperty.call(catState.assignments, orphanId)
        ) {
          delete catState.assignments[orphanId];
          purgedCategoriesCount++;
          catMutated = true;
        }
      }
      purgedGamesCount++;
      console.info(
        '[STORAGE_CANONICALIZE] Purged orphaned stored game and category assignments:',
        { legacyKey, orphanId, folderPath: record.folderPath }
      );
    }
    console.info('[STORAGE_CANONICALIZE] Orphan purge sweep completed:', {
      purgedGamesCount,
      purgedCategoriesCount
    });
  }

  db.games = nextGames;

  for (const key of Object.keys(db.games)) {
    delete (db.games[key] as any).migratedFromGameKey;
  }

  if (catMutated && categoryState) {
    if (categoryState?.isDegraded?.() === true) {
      console.error(
        '[STORAGE_CANONICALIZE] Category state is in degraded state during persistence, aborting canonicalization:',
        { isBootstrapMigration: options?.isBootstrapMigration }
      );
      throw new Error('Category state is in degraded state');
    }

    if (typeof categoryState?.saveCategoryState === 'function') {
      await categoryState.saveCategoryState(catState);
    }

    if (categoryState?.isDegraded?.() === true) {
      console.error(
        '[STORAGE_CANONICALIZE] Category state is in degraded state during persistence, aborting canonicalization:',
        { isBootstrapMigration: options?.isBootstrapMigration }
      );
      throw new Error('Category state is in degraded state');
    }
  }

  return { migratedCount };
}

export const migrationM0to1: StorageMigrationFunction = async (
  db: any,
  context: LibraryContext,
  targetPlatform?: PlatformInput
): Promise<LibraryDatabase> => {
  // 1. Initialize db.games
  db.games = isPlainObject(db.games) ? db.games : {};

  // 2. Normalize db.config
  const normalizedConfig = normalizeLibraryConfigShape(db.config, targetPlatform);
  if (!normalizedConfig.libraryPaths || normalizedConfig.libraryPaths.length === 0) {
    const defaultGamesDir = context.defaultGamesDir;
    if (
      typeof defaultGamesDir === 'string' &&
      defaultGamesDir.trim().length > 0 &&
      !/\0|\r|\n/.test(defaultGamesDir)
    ) {
      const canonicalDefault = normalizePathForPlatform(defaultGamesDir.trim(), targetPlatform);
      if (
        canonicalDefault !== '/' &&
        !/^[A-Za-z]:\/?$/.test(canonicalDefault) &&
        Boolean(context.fsSync?.existsSync?.(defaultGamesDir))
      ) {
        normalizedConfig.libraryPaths = [defaultGamesDir];
      } else {
        normalizedConfig.libraryPaths = [];
      }
    } else {
      normalizedConfig.libraryPaths = [];
    }
  }
  db.config = normalizedConfig;

  const candidateRoots = subsumeLibraryPaths(db.config.libraryPaths, targetPlatform);

  // 3. Scan root db envelope for unversioned top-level legacy game records
  const rootKeys = Object.keys(db);
  for (const key of rootKeys) {
    if (!Object.prototype.hasOwnProperty.call(db, key)) {
      continue;
    }
    if (
      key === '__proto__' ||
      key === 'constructor' ||
      key === 'prototype' ||
      key === 'config' ||
      key === 'games' ||
      key === 'schemaVersion' ||
      key === 'titleResolutionConfig'
    ) {
      continue;
    }
    const val = db[key];
    if (
      typeof val === 'object' &&
      val !== null &&
      typeof val.folderPath === 'string' &&
      val.folderPath.trim().length > 0 &&
      typeof val.exePath === 'string' &&
      val.exePath.trim().length > 0
    ) {
      const record = val;
      // 4. Resolve effectiveFolder
      let effectiveFolder = record.folderPath;
      if (
        record.folderPath?.toLowerCase().endsWith('.app') ||
        Boolean(resolveBundleRoot(record.exePath || record.folderPath))
      ) {
        effectiveFolder =
          resolveBundleRoot(record.exePath || record.folderPath) || record.folderPath;
      } else if (record.exePath) {
        const normExe = normalizePathForPlatform(record.exePath, targetPlatform);
        const normExeDir = normExe.includes('/')
          ? normExe.slice(0, normExe.lastIndexOf('/')) || '/'
          : normExe;
        const normFolder = normalizePathForPlatform(record.folderPath, targetPlatform);

        if (
          isSubsumedBy(normExeDir, normFolder, targetPlatform) &&
          normExeDir !== normFolder
        ) {
          let currentDir = record.exePath.replace(/\\/g, '/');
          currentDir = currentDir.includes('/')
            ? currentDir.slice(0, currentDir.lastIndexOf('/')) || '/'
            : currentDir;

          while (
            normalizePathForPlatform(currentDir, targetPlatform) !== normFolder &&
            isSubsumedBy(
              normalizePathForPlatform(currentDir, targetPlatform),
              normFolder,
              targetPlatform
            )
          ) {
            if (currentDir === '/' || /^[A-Za-z]:\/?$/.test(currentDir)) {
              break;
            }
            const leaf = getFolderBaseName(currentDir).toLowerCase();
            if (WRAPPER_DIRECTORY_NAMES.has(leaf)) {
              let parentDir = currentDir.includes('/')
                ? currentDir.slice(0, currentDir.lastIndexOf('/')) || '/'
                : '/';
              if (/^[A-Za-z]:$/.test(parentDir)) {
                parentDir = `${parentDir}/`;
              }
              const normParent = normalizePathForPlatform(parentDir, targetPlatform);
              if (
                isSubsumedBy(normParent, normFolder, targetPlatform) &&
                !candidateRoots.some(
                  (root: string) =>
                    normParent === normalizePathForPlatform(root, targetPlatform)
                )
              ) {
                currentDir = parentDir;
              } else {
                break;
              }
            } else {
              break;
            }
          }
          effectiveFolder = currentDir;
        }
      }

      record.folderPath = effectiveFolder;
      record.folderName =
        getFolderBaseName(effectiveFolder) ||
        record.folderName ||
        getFolderBaseName(effectiveFolder);

      if (Object.prototype.hasOwnProperty.call(db.games, key)) {
        const existingRecord = db.games[key];
        db.games[key] = {
          ...existingRecord,
          ...record,
          folderPath: effectiveFolder,
          folderName: record.folderName || existingRecord.folderName,
          gameKey: key,
          relativePath: key,
          playtime: Math.max(existingRecord.playtime || 0, record.playtime || 0),
          lastPlayed: Math.max(existingRecord.lastPlayed || 0, record.lastPlayed || 0),
          favorite: Boolean(existingRecord.favorite || record.favorite),
          manual: Boolean(existingRecord.manual || record.manual),
          autoTranslate: Boolean(existingRecord.autoTranslate || record.autoTranslate),
          runInBackground: Boolean(
            existingRecord.runInBackground || record.runInBackground
          ),
          engine: existingRecord.engine || record.engine || null,
          platform: existingRecord.platform || record.platform,
          exePath: existingRecord.manual
            ? existingRecord.exePath
            : record.manual
            ? record.exePath
            : existingRecord.exePath || record.exePath,
          sizeBytes:
            typeof existingRecord.sizeBytes === 'number'
              ? existingRecord.sizeBytes
              : record.sizeBytes,
          sizeMtime:
            typeof existingRecord.sizeMtime === 'number'
              ? existingRecord.sizeMtime
              : record.sizeMtime,
          name: existingRecord.customName
            ? existingRecord.name
            : record.customName
            ? record.name
            : existingRecord.name || record.name,
          customName: Boolean(existingRecord.customName || record.customName),
          saveFolderOverride:
            existingRecord.saveFolderOverride || record.saveFolderOverride,
          dateAdded: Math.min(
            existingRecord.dateAdded || Date.now(),
            record.dateAdded || Date.now()
          )
        };
      } else {
        db.games[key] = {
          ...record,
          folderPath: effectiveFolder,
          folderName: record.folderName,
          gameKey: key,
          relativePath: key
        };
      }
      delete db[key];
    }
  }

  // 5. Delegate storage and category re-keying
  await canonicalizeStoredGames(
    db,
    context.categoryState,
    db.config.libraryPaths,
    targetPlatform,
    { isBootstrapMigration: true }
  );

  return db;
};

const BASELINE_MIGRATIONS: Record<number, StorageMigrationFunction> = {
  1: migrationM0to1
};

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
