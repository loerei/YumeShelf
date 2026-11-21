import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { app } from 'electron';
import type { SaveUpdatesPayload } from '@yumeshelf/engine';
import { sanitizeUserPaths } from '../../shared/path-sanitizer';
import { resilientRename, sweepOrphanedSaveTmpFiles } from './fs-utils';
import { SaveDataEngine, type SaveFormatStrategy, type WriteSaveOptions } from './engine';

export type SaveFormat = SaveFormatStrategy;
export type { SaveFormatStrategy, WriteSaveOptions };

export interface WriteSaveDataPayload {
  gameKey: string;
  fileName: string;
  updates?: SaveUpdatesPayload | Record<string, any>;
  data?: any;
  options?: WriteSaveOptions;
}

export interface SaveEditorService {
  listSaveFiles(gameKey: string): Promise<string[]>;
  loadSaveData(gameKey: string, fileName: string, options?: any): Promise<any>;
  writeSaveData(
    gameKeyOrPayload: string | WriteSaveDataPayload,
    fileName?: string,
    updatesOrData?: SaveUpdatesPayload | Record<string, any>,
    options?: WriteSaveOptions
  ): Promise<{ ok: boolean; error?: string; code?: string; bytesWritten?: number }>;
  renameSaveFile(
    gameKey: string,
    oldFileName: string,
    newFileName: string,
    overwrite?: boolean
  ): Promise<{ ok: boolean; renamed?: boolean; fileName?: string; error?: string; message?: string }>;
  deleteSaveFile(gameKey: string, fileName: string): Promise<{ ok: boolean }>;
  loadTranslations(lang?: string): Promise<Record<string, string>>;
  saveTranslations(lang?: string, translations?: Record<string, string>): Promise<{ ok: boolean; error?: string }>;
}

export interface SaveEditorServiceConfig {
  libraryState: any;
  saveFolderResolver: any;
  translationsDir?: string;
  nowProvider?: () => number;
  fsPromises?: typeof fs | typeof fs.promises;
  fs?: typeof fs;
  platform?: NodeJS.Platform;
}

export interface TranslationDiskResult {
  translations: Record<string, string>;
  isFutureVersion: boolean;
  needsMigrationPersist?: boolean;
}

export interface TranslationDiskOptions {
  fsPromises?: typeof fs | typeof fs.promises;
  nowProvider?: () => number;
}

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const translationWriteQueues = new Map<string, Promise<unknown>>();

function resolveFsPromisesImpl(overrideFs?: typeof fs | typeof fs.promises): typeof fs.promises {
  const raw = overrideFs ?? fs;
  return 'promises' in (raw as any) && (raw as any).promises
    ? (raw as any).promises
    : (raw as any);
}

async function exists(p: string, fsImpl: typeof fs.promises): Promise<boolean> {
  try {
    await fsImpl.access(p);
    return true;
  } catch {
    return false;
  }
}

function sanitizeTranslationRecord(raw: Record<string, unknown>): Record<string, string> {
  const clean: Record<string, string> = Object.create(null);
  for (const [k, v] of Object.entries(raw)) {
    if (DANGEROUS_KEYS.has(k)) continue;
    if (typeof v === 'string' && k !== v) {
      clean[k] = v;
    }
  }
  return clean;
}

function queueTranslationWrite<T>(filePath: string, task: () => Promise<T>): Promise<T> {
  const key = path.resolve(filePath);
  const prev = translationWriteQueues.get(key) ?? Promise.resolve();
  const current = prev.catch(() => {}).then(async () => task());
  translationWriteQueues.set(key, current);
  return current.finally(() => {
    if (translationWriteQueues.get(key) === current) {
      translationWriteQueues.delete(key);
    }
  }) as Promise<T>;
}

export async function writeTranslationsDisk(
  filePath: string,
  translations: Record<string, string>,
  options?: TranslationDiskOptions
): Promise<void> {
  const fsImpl = resolveFsPromisesImpl(options?.fsPromises);
  const now = options?.nowProvider ?? Date.now;

  await fsImpl.mkdir(path.dirname(filePath), { recursive: true });

  const filtered: Record<string, string> = Object.create(null);
  for (const [k, v] of Object.entries(translations)) {
    if (DANGEROUS_KEYS.has(k)) continue;
    if (typeof v === 'string' && k !== v) {
      filtered[k] = v;
    }
  }

  const payload = JSON.stringify({ schemaVersion: 1, translations: filtered }, null, 2);
  const tempPath = `${filePath}.tmp.${now()}_${process.pid}_${Math.random().toString(36).slice(2, 8)}`;
  let handle: any = null;

  try {
    try {
      handle = await fsImpl.open(tempPath, 'w');
      await handle.writeFile(payload, 'utf-8');
      if (typeof handle.sync === 'function') {
        await handle.sync();
      }
    } finally {
      if (handle) {
        await handle.close().catch(() => {});
        handle = null;
      }
    }

    await resilientRename(tempPath, filePath, 5, 50, { promises: fsImpl } as unknown as typeof fs);
  } catch (err) {
    await fsImpl.unlink(tempPath).catch(() => {});
    throw err;
  }
}

export async function readTranslationsDisk(
  filePath: string,
  _cleanLang: string,
  options?: TranslationDiskOptions
): Promise<TranslationDiskResult> {
  const fsImpl = resolveFsPromisesImpl(options?.fsPromises);
  const now = options?.nowProvider ?? Date.now;

  let raw: string;
  try {
    raw = await fsImpl.readFile(filePath, 'utf-8');
  } catch (err: any) {
    if (err?.code === 'ENOENT') {
      return { translations: {}, isFutureVersion: false };
    }
    console.warn('[SAVE-EDITOR] Failed to read translation file:', {
      path: sanitizeUserPaths(filePath),
      error: sanitizeUserPaths(err?.message || String(err)),
    });
    return { translations: {}, isFutureVersion: false };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (parseErr: any) {
    const corruptPath = `${filePath}.corrupt.${now()}`;
    console.warn('[SAVE-EDITOR] Quarantining malformed translation JSON:', {
      path: sanitizeUserPaths(filePath),
      corruptPath: sanitizeUserPaths(corruptPath),
      error: sanitizeUserPaths(parseErr?.message || String(parseErr)),
    });
    await resilientRename(filePath, corruptPath, 5, 50, { promises: fsImpl } as unknown as typeof fs).catch(
      (quarantineErr: any) => {
        console.warn('[SAVE-EDITOR] Failed to quarantine malformed translation file:', {
          path: sanitizeUserPaths(filePath),
          error: sanitizeUserPaths(quarantineErr?.message || String(quarantineErr)),
        });
      }
    );
    return { translations: {}, isFutureVersion: false };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    const corruptPath = `${filePath}.corrupt.${now()}`;
    console.warn('[SAVE-EDITOR] Quarantining invalid translation root payload:', {
      path: sanitizeUserPaths(filePath),
      corruptPath: sanitizeUserPaths(corruptPath),
    });
    await resilientRename(filePath, corruptPath, 5, 50, { promises: fsImpl } as unknown as typeof fs).catch(() => {});
    return { translations: {}, isFutureVersion: false };
  }

  const obj = parsed as Record<string, unknown>;
  if (!('schemaVersion' in obj)) {
    return {
      translations: sanitizeTranslationRecord(obj),
      isFutureVersion: false,
      needsMigrationPersist: true,
    };
  }

  const version = obj.schemaVersion;
  if (typeof version === 'number' && version > 1) {
    return { translations: {}, isFutureVersion: true };
  }

  if (
    version !== 1 ||
    typeof obj.translations !== 'object' ||
    obj.translations === null ||
    Array.isArray(obj.translations)
  ) {
    const corruptPath = `${filePath}.corrupt.${now()}`;
    console.warn('[SAVE-EDITOR] Quarantining corrupted schemaVersion=1 translation payload:', {
      path: sanitizeUserPaths(filePath),
      corruptPath: sanitizeUserPaths(corruptPath),
    });
    await resilientRename(filePath, corruptPath, 5, 50, { promises: fsImpl } as unknown as typeof fs).catch(() => {});
    return { translations: {}, isFutureVersion: false };
  }

  return {
    translations: sanitizeTranslationRecord(obj.translations as Record<string, unknown>),
    isFutureVersion: false,
  };
}

async function loadMetadata(
  dataDir: string,
  langDataDir: string | null,
  fsImpl: typeof fs.promises = fs.promises
) {
  const metadata: any = {
    variables: [],
    switches: [],
    items: {},
    weapons: {},
    armors: {},
    gameTitle: '',
  };

  try {
    async function getFilePath(fileName: string) {
      if (langDataDir) {
        const lp = path.join(langDataDir, fileName);
        if (await exists(lp, fsImpl)) return lp;
      }
      return path.join(dataDir, fileName);
    }

    const systemPath = await getFilePath('System.json');
    if (await exists(systemPath, fsImpl)) {
      const system = JSON.parse(await fsImpl.readFile(systemPath, 'utf8'));
      metadata.variables = system.variables || [];
      metadata.switches = system.switches || [];
      metadata.gameTitle = system.gameTitle || '';
    }

    async function loadItemType(fileName: string, target: Record<string, any>) {
      const p = await getFilePath(fileName);
      if (await exists(p, fsImpl)) {
        const list = JSON.parse(await fsImpl.readFile(p, 'utf8'));
        list.forEach((item: any) => {
          if (item?.id) {
            target[item.id] = {
              name: item.name,
              description: item.description,
              iconIndex: item.iconIndex,
            };
          }
        });
      }
    }

    await loadItemType('Items.json', metadata.items);
    await loadItemType('Weapons.json', metadata.weapons);
    await loadItemType('Armors.json', metadata.armors);
  } catch (err: any) {
    console.warn('[SAVE-EDITOR] Failed to load metadata:', sanitizeUserPaths(err?.message || String(err)));
  }

  return metadata;
}

export function createSaveEditorService(config: SaveEditorServiceConfig): SaveEditorService {
  const { libraryState, saveFolderResolver } = config;
  const fsImpl = resolveFsPromisesImpl(config.fsPromises ?? config.fs);
  const translationsDir =
    config.translationsDir ??
    (app?.getPath ? app.getPath('userData') : path.join(os.tmpdir(), 'yumeshelf', 'userData'));

  // Non-blocking startup tmp sweep with sanitized error boundary
  void sweepOrphanedSaveTmpFiles(
    translationsDir,
    24 * 60 * 60 * 1000,
    config.nowProvider,
    { promises: fsImpl } as unknown as typeof fs
  ).catch((sweepErr: unknown) => {
    console.warn('[SAVE-EDITOR] Startup translation temp sweep failed:', {
      translationsDir: sanitizeUserPaths(translationsDir),
      error: sanitizeUserPaths(sweepErr instanceof Error ? sweepErr.message : String(sweepErr)),
    });
  });

  async function getGamePaths(gameKey: string) {
    const record = await libraryState.getGameRecord(gameKey);
    if (!record?.exePath) return null;

    const exeDir = path.dirname(record.exePath);
    const saveInfo = await saveFolderResolver.resolveSaveFolder(record.exePath, record.saveFolderOverride);

    if (!saveInfo?.path || saveInfo.overrideMissing) return null;

    const parentOfSave = path.dirname(saveInfo.path);
    const candidateDataDirs = [
      path.join(parentOfSave, 'data'),
      path.join(exeDir, 'www', 'data'),
      path.join(exeDir, 'data'),
      path.join(exeDir, 'bin', 'www', 'data'),
      path.join(exeDir, 'bin', 'data'),
    ];
    let dataDir = path.join(exeDir, 'www', 'data');
    for (const cand of candidateDataDirs) {
      if (await exists(cand, fsImpl)) {
        dataDir = cand;
        break;
      }
    }

    let langDataDir: string | null = null;
    const langConfigPath = path.join(exeDir, 'www', 'language_config.json');
    if (await exists(langConfigPath, fsImpl)) {
      try {
        const langConfig = JSON.parse(await fsImpl.readFile(langConfigPath, 'utf8'));
        if (langConfig?.lang) {
          const potentialPath = path.join(exeDir, 'www', 'lang_packs', langConfig.lang, 'data');
          if (await exists(potentialPath, fsImpl)) {
            langDataDir = potentialPath;
          }
        }
      } catch (e: any) {
        console.warn('[SAVE-EDITOR] Failed to read language_config.json:', sanitizeUserPaths(e?.message || String(e)));
      }
    }

    return {
      exeDir,
      saveDir: saveInfo.path,
      dataDir,
      langDataDir,
      engine: saveInfo.engine,
    };
  }

  const engine = new SaveDataEngine({
    getGamePaths,
    loadMetadata: (dataDir, langDataDir) => loadMetadata(dataDir, langDataDir, fsImpl),
    platform: config.platform,
    nowProvider: config.nowProvider,
    fs: config.fs,
    fsPromises: fsImpl,
  });

  function getTranslationFilePath(lang = 'en') {
    const cleanLang = (lang || 'en').replace(/[^a-zA-Z0-9_-]/g, '') || 'en';
    return {
      cleanLang,
      filePath: path.join(translationsDir, `save_editor_translations_${cleanLang}.json`),
    };
  }

  async function loadTranslations(lang = 'en'): Promise<Record<string, string>> {
    const { cleanLang, filePath } = getTranslationFilePath(lang);
    const legacyPath = path.join(translationsDir, 'save_editor_translations.json');

    return queueTranslationWrite(filePath, async () => {
      if (cleanLang === 'en' && !(await exists(filePath, fsImpl)) && (await exists(legacyPath, fsImpl))) {
        try {
          await fsImpl.mkdir(path.dirname(filePath), { recursive: true });
          await resilientRename(legacyPath, filePath, 5, 50, { promises: fsImpl } as unknown as typeof fs);
        } catch (e: any) {
          console.warn('[SAVE-EDITOR] Failed to migrate legacy translations:', {
            legacyPath: sanitizeUserPaths(legacyPath),
            error: sanitizeUserPaths(e?.message || String(e)),
          });
        }
      }

      const diskResult = await readTranslationsDisk(filePath, cleanLang, {
        fsPromises: fsImpl,
        nowProvider: config.nowProvider,
      });

      if (diskResult.needsMigrationPersist) {
        try {
          await writeTranslationsDisk(filePath, diskResult.translations, {
            fsPromises: fsImpl,
            nowProvider: config.nowProvider,
          });
        } catch (persistErr: any) {
          console.warn('[SAVE-EDITOR] Non-fatal failure persisting migrated translations:', {
            path: sanitizeUserPaths(filePath),
            error: sanitizeUserPaths(persistErr?.message || String(persistErr)),
          });
        }
      }

      return { ...diskResult.translations };
    });
  }

  async function saveTranslations(
    lang = 'en',
    translations: Record<string, string> = {}
  ): Promise<{ ok: boolean; error?: string }> {
    const { cleanLang, filePath } = getTranslationFilePath(lang);

    return queueTranslationWrite(filePath, async () => {
      const diskResult = await readTranslationsDisk(filePath, cleanLang, {
        fsPromises: fsImpl,
        nowProvider: config.nowProvider,
      });

      if (diskResult.isFutureVersion) {
        return { ok: false, error: 'FUTURE_SCHEMA_VERSION' };
      }

      const merged: Record<string, string> = Object.assign(Object.create(null), diskResult.translations);
      for (const [k, v] of Object.entries(translations)) {
        if (DANGEROUS_KEYS.has(k)) continue;
        if (typeof v === 'string') {
          if (k === v) {
            delete merged[k];
          } else {
            merged[k] = v;
          }
        }
      }

      try {
        await writeTranslationsDisk(filePath, merged, {
          fsPromises: fsImpl,
          nowProvider: config.nowProvider,
        });
        return { ok: true };
      } catch (err: any) {
        console.error('[SAVE-EDITOR] Error writing translations:', {
          path: sanitizeUserPaths(filePath),
          error: sanitizeUserPaths(err?.message || String(err)),
        });
        return { ok: false, error: sanitizeUserPaths(err?.message || String(err)) };
      }
    });
  }

  async function listSaveFiles(gameKey: string): Promise<string[]> {
    try {
      return await engine.listSaveFiles(gameKey);
    } catch (err: unknown) {
      const rawMsg = err instanceof Error ? err.message : String(err);
      console.error('[SAVE-EDITOR] Error listing save files:', {
        gameKey: sanitizeUserPaths(gameKey),
        error: sanitizeUserPaths(rawMsg),
        stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
      });
      throw err;
    }
  }

  async function loadSaveData(gameKey: string, fileName: string, options?: any) {
    try {
      return await engine.loadSave(gameKey, fileName, options);
    } catch (err: unknown) {
      const rawMsg = err instanceof Error ? err.message : String(err);
      console.error('[SAVE-EDITOR] Error loading save data:', {
        gameKey: sanitizeUserPaths(gameKey),
        fileName: sanitizeUserPaths(fileName),
        error: sanitizeUserPaths(rawMsg),
        stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
      });
      throw err;
    }
  }

  async function writeSaveData(
    gameKeyOrPayload: string | WriteSaveDataPayload,
    fileName?: string,
    updatesOrData?: SaveUpdatesPayload | Record<string, any>,
    options?: WriteSaveOptions
  ): Promise<{ ok: boolean; error?: string; code?: string; bytesWritten?: number }> {
    if (typeof gameKeyOrPayload === 'object' && gameKeyOrPayload !== null) {
      const { gameKey, fileName: fName, updates, data, options: opts } = gameKeyOrPayload;
      return await engine.writeSave(gameKey, fName, (updates ?? data)!, opts ?? options);
    }
    return await engine.writeSave(gameKeyOrPayload, fileName!, updatesOrData!, options);
  }

  async function renameSaveFile(
    gameKey: string,
    oldFileName: string,
    newFileName: string,
    overwrite = false
  ) {
    try {
      return await engine.renameSave(gameKey, oldFileName, newFileName, overwrite);
    } catch (err: unknown) {
      const rawMsg = err instanceof Error ? err.message : String(err);
      console.error('[SAVE-EDITOR] Error renaming save file:', {
        gameKey: sanitizeUserPaths(gameKey),
        oldFileName: sanitizeUserPaths(oldFileName),
        newFileName: sanitizeUserPaths(newFileName),
        error: sanitizeUserPaths(rawMsg),
        stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
      });
      throw err;
    }
  }

  async function deleteSaveFile(gameKey: string, fileName: string) {
    try {
      return await engine.deleteSave(gameKey, fileName);
    } catch (err: unknown) {
      const rawMsg = err instanceof Error ? err.message : String(err);
      console.error('[SAVE-EDITOR] Error deleting save file:', {
        gameKey: sanitizeUserPaths(gameKey),
        fileName: sanitizeUserPaths(fileName),
        error: sanitizeUserPaths(rawMsg),
        stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
      });
      throw err;
    }
  }

  return {
    listSaveFiles,
    loadSaveData,
    writeSaveData,
    renameSaveFile,
    deleteSaveFile,
    loadTranslations,
    saveTranslations,
  };
}
