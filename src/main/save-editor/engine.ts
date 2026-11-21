import * as fs from 'node:fs';
import * as path from 'node:path';
import { YumeEngine, normalizeSaveStrategy, type SaveCodecOptions } from '@yumeshelf/engine';
import { sanitizeUserPaths } from '../../shared/path-sanitizer';
import SaveMappingManager from './mapping-manager';
import { resilientRename, sweepOrphanedSaveTmpFiles } from './fs-utils';

// Import all format strategies
import rpgMakerMz from './formats/rpg-maker-mz';
import rpgMakerMv from './formats/rpg-maker-mv';
import rpgWolfSav from './formats/rpg-wolf-sav';
import unityMonoBin from './formats/unity-mono-bin';
import renpy from './formats/renpy';
import tincDoubleAesJson from './formats/tinc-double-aes-json';
import simpleKeyedJson from './formats/simple-keyed-json';
import pureJson from './formats/pure-json';
import bakinSgs from './formats/bakin-sgs';

export type WriteSaveOptions = SaveCodecOptions & {
  isUpdates?: boolean;
  createBackup?: boolean;
  preserveBackup?: boolean;
  maxBackups?: number;
  maxBufferSizeBytes?: number;
  fsPromises?: typeof fs | typeof fs.promises;
};

export interface SaveFormatStrategy {
  strategy?: string;
  match(fileName: string, rawData?: Buffer, jsonData?: any, options?: any): boolean;
  decode(rawData: Buffer, paths?: any, fileName?: string): Promise<any>;
  encode(jsonData: any, paths?: any, fileName?: string): Promise<Buffer>;
  metadata?(jsonData: any, paths?: any, fileName?: string): Promise<any>;
}

export interface GamePaths {
  exeDir: string;
  saveDir: string;
  dataDir: string;
  langDataDir: string | null;
  engine?: string;
}

export interface SaveDataEngineConfig {
  getGamePaths(gameKey: string): Promise<GamePaths | null>;
  loadMetadata(dataDir: string, langDataDir: string | null): Promise<any>;
  platform?: NodeJS.Platform;
  nowProvider?: () => number;
  fs?: typeof fs;
  fsPromises?: typeof fs | typeof fs.promises;
}

function resolveMaxBufferSizeBytes(raw?: unknown): number {
  const DEFAULT_MAX_BYTES = 64 * 1024 * 1024;
  return typeof raw === 'number' && Number.isFinite(raw) && raw > 0
    ? Math.trunc(raw)
    : DEFAULT_MAX_BYTES;
}

export class SaveDataEngine {
  private readonly formats: SaveFormatStrategy[];
  private readonly config: SaveDataEngineConfig;
  public lastSweepPromise: Promise<void> | null = null;
  private readonly writeQueues = new Map<string, Promise<unknown>>();
  private tempCounter = 0;

  constructor(config: SaveDataEngineConfig, customFormats?: SaveFormatStrategy[]) {
    this.config = config;
    this.formats = customFormats || [
      rpgMakerMz,
      rpgMakerMv,
      rpgWolfSav,
      unityMonoBin,
      renpy,
      tincDoubleAesJson,
      simpleKeyedJson,
      pureJson,
      bakinSgs,
    ];
  }

  private resolveFsPromises(overrideFs?: typeof fs | typeof fs.promises): typeof fs.promises {
    const raw = overrideFs ?? this.config.fsPromises ?? this.config.fs ?? fs;
    return 'promises' in (raw as any) && (raw as any).promises
      ? (raw as any).promises
      : (raw as any);
  }

  private normalizeMutexKey(p: string): string {
    const resolved = path.resolve(p);
    const targetPlatform = this.config.platform ?? process.platform;
    return targetPlatform === 'win32' || targetPlatform === 'darwin'
      ? resolved.toLowerCase()
      : resolved;
  }

  private queueWrite<T>(savePath: string, task: () => Promise<T>): Promise<T> {
    const key = this.normalizeMutexKey(savePath);
    const prev = this.writeQueues.get(key) ?? Promise.resolve();
    const current = prev
      .catch((prevErr) => {
        // Isolate predecessor rejection to prevent queue deadlock while retaining debug trace
        if (process.env.NODE_ENV !== 'production' && prevErr) {
          console.debug('[Mutex] Predecessor queue task rejected; isolating pipeline queue:', {
            key: sanitizeUserPaths(key),
            error: sanitizeUserPaths(prevErr instanceof Error ? prevErr.message : String(prevErr)),
            cause:
              prevErr instanceof Error && prevErr.cause
                ? sanitizeUserPaths((prevErr.cause as Error).message || String(prevErr.cause))
                : undefined,
          });
        }
      })
      .then(async () => task());
    this.writeQueues.set(key, current);

    return current.finally(() => {
      if (this.writeQueues.get(key) === current) {
        this.writeQueues.delete(key);
      }
    }) as Promise<T>;
  }

  findFormat(fileName: string, rawData?: Buffer, jsonData?: any, options?: any): SaveFormatStrategy {
    const matched = this.formats.find((f) => f.match(fileName, rawData, jsonData, options));
    if (!matched) {
      throw new Error(`Unsupported save file format for file: ${fileName}`);
    }
    return matched;
  }

  async listSaveFiles(gameKey: string): Promise<string[]> {
    const paths = await this.config.getGamePaths(gameKey);
    const fsImpl = this.resolveFsPromises();
    if (!paths || !(await this.exists(paths.saveDir, fsImpl))) return [];

    const entries = await fsImpl.readdir(paths.saveDir, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      const name = typeof entry === 'string' ? entry : entry.name;
      if (name.includes('.tmp.') || name.includes('.corrupt.')) {
        continue;
      }

      if (typeof entry !== 'string') {
        if (entry.isFile()) {
          // regular file
        } else if (entry.isSymbolicLink()) {
          try {
            const linkStat = await fsImpl.stat(path.join(paths.saveDir, name));
            if (!linkStat.isFile()) continue;
          } catch {
            // Exclude broken or dangling symlinks cleanly
            continue;
          }
        } else {
          continue;
        }
      }

      if (this.formats.some((fmt) => fmt.match(name))) {
        files.push(name);
      }
    }

    this.lastSweepPromise = sweepOrphanedSaveTmpFiles(
      paths.saveDir,
      24 * 60 * 60 * 1000,
      this.config.nowProvider,
      { promises: fsImpl } as unknown as typeof fs
    ).catch((sweepErr: unknown) => {
      console.warn('[SaveDataEngine] Background temp file sweep failed:', {
        saveDir: sanitizeUserPaths(paths.saveDir),
        error: sanitizeUserPaths(sweepErr instanceof Error ? sweepErr.message : String(sweepErr)),
      });
    });

    return files.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  }

  async loadSave(gameKey: string, fileName: string, options?: any) {
    const paths = await this.config.getGamePaths(gameKey);
    if (!paths) throw new Error('Could not resolve game paths');

    const savePath = this.resolveSafePath(paths.saveDir, fileName);

    return this.queueWrite(savePath, async () => {
      const fsImpl = this.resolveFsPromises(options?.fsPromises);
      const stat = await fsImpl.stat(savePath);
      if (!stat.isFile()) {
        throw new Error(`Target save path is not a regular file: ${fileName}`);
      }
      if (stat.size === 0) {
        throw new Error(`Target save file is empty (0 bytes): ${fileName}`);
      }

      const maxBytes = resolveMaxBufferSizeBytes(options?.maxBufferSizeBytes);
      if (stat.size > maxBytes) {
        throw new Error(`Save file exceeds maximum allowed size (${stat.size} > ${maxBytes})`);
      }

      const rawData = await fsImpl.readFile(savePath);
      if (rawData.length === 0) {
        throw new Error(`Target save file is empty (0 bytes): ${fileName}`);
      }

      const format = this.findFormat(fileName, rawData, undefined, options);
      const decodeContext = options ? { ...options, ...paths } : paths;
      const decodedData = await format.decode(rawData, decodeContext, fileName);

      // Inject user variable mappings without leaking host OS disk I/O
      const raw =
        (options as any)?.fs ?? options?.fsPromises ?? this.config.fs ?? this.config.fsPromises ?? fs;
      const rawFs = raw && typeof (raw as any).existsSync === 'function' ? (raw as typeof fs) : undefined;
      const mappingMgr = new SaveMappingManager(gameKey, {
        fs: rawFs,
        nowProvider: this.config.nowProvider,
      });

      if (decodedData && typeof decodedData === 'object') {
        decodedData._userMappings = mappingMgr.mappings.variables;
        if (process.env.NODE_ENV !== 'production' && mappingMgr.mappings.variables.length > 0) {
          console.debug('[SaveDataEngine] Injected user variable mappings into save schema extraction', {
            gameKey: sanitizeUserPaths(gameKey),
            count: mappingMgr.mappings.variables.length,
          });
        }
      }

      const metadata =
        typeof format.metadata === 'function'
          ? await format.metadata(decodedData, paths, fileName)
          : await this.config.loadMetadata(paths.dataDir, paths.langDataDir);

      const detected = YumeEngine.detectSaveStrategy(fileName, rawData, decodedData, options);
      const resolvedStrategy = normalizeSaveStrategy(format.strategy || detected || fileName);
      const normalizedDto = YumeEngine.extractSaveSchema(resolvedStrategy, decodedData, {
        ...options,
        gameKey,
        fileName,
        metadata,
      });

      return { ...normalizedDto, data: decodedData, metadata };
    });
  }

  async writeSave(
    gameKey: string,
    fileName: string,
    updatesOrData: Record<string, unknown> | Buffer,
    options?: WriteSaveOptions
  ): Promise<{ ok: boolean; error?: string }> {
    // Immediate guard against invalid zero-byte buffer inputs before acquiring locks
    if (Buffer.isBuffer(updatesOrData) && updatesOrData.length === 0) {
      throw new Error('Cannot write zero-byte save buffer');
    }

    if (options?.isUpdates === true) {
      if (
        !updatesOrData ||
        typeof updatesOrData !== 'object' ||
        Buffer.isBuffer(updatesOrData) ||
        Array.isArray(updatesOrData)
      ) {
        throw new Error('isUpdates option requires a plain object record');
      }
    }

    // Immediate entry guard: empty update objects, null, or undefined resolve as a safe no-op
    if (
      !updatesOrData ||
      (typeof updatesOrData === 'object' &&
        !Buffer.isBuffer(updatesOrData) &&
        Object.keys(updatesOrData).length === 0)
    ) {
      return { ok: true };
    }

    const paths = await this.config.getGamePaths(gameKey);
    if (!paths) throw new Error('Could not resolve game paths');
    const savePath = this.resolveSafePath(paths.saveDir, fileName);

    return this.queueWrite(savePath, async () => {
      let outputBuffer: Buffer;
      const fsImpl = this.resolveFsPromises(options?.fsPromises);

      const isSurgicalUpdates =
        typeof options?.isUpdates === 'boolean'
          ? options.isUpdates
          : updatesOrData !== null &&
            typeof updatesOrData === 'object' &&
            !Buffer.isBuffer(updatesOrData) &&
            Object.keys(updatesOrData).some((k) => k.includes(':'));

      if (isSurgicalUpdates) {
        const stat = await fsImpl.stat(savePath);
        if (!stat.isFile()) {
          throw new Error(`Target save path is not a regular file: ${fileName}`);
        }
        const maxBytes = resolveMaxBufferSizeBytes(options?.maxBufferSizeBytes);
        if (stat.size > maxBytes) {
          throw new Error(`Save file exceeds maximum allowed size (${stat.size} > ${maxBytes})`);
        }
        const rawBuffer = await fsImpl.readFile(savePath);
        if (rawBuffer.length === 0) {
          throw new Error(`Target save file on disk is empty (0 bytes): ${fileName}`);
        }
        const format = this.findFormat(fileName, rawBuffer, undefined, options);
        const detectedStrategy =
          format.strategy ||
          YumeEngine.detectSaveStrategy(fileName, rawBuffer, undefined, options) ||
          fileName;
        const resolvedStrategy = normalizeSaveStrategy(detectedStrategy);

        const codecOptions: SaveCodecOptions = {
          ...options,
          ...paths,
          langDataDir: paths.langDataDir ?? undefined,
          paths: {
            ...paths,
            langDataDir: paths.langDataDir ?? undefined,
          },
          fileName,
          savePath,
        };

        outputBuffer = await YumeEngine.applySaveUpdates(
          resolvedStrategy,
          rawBuffer,
          updatesOrData as Record<string, any>,
          codecOptions
        );
      } else {
        const encodeContext = options ? { ...options, ...paths } : paths;
        const format = this.findFormat(fileName, undefined, updatesOrData, encodeContext);
        const cleanData = this.sanitizeSaveData(updatesOrData);
        outputBuffer = await format.encode(cleanData, encodeContext, fileName);
      }

      if (!outputBuffer || outputBuffer.length === 0) {
        throw new Error('Engine generated zero-byte save buffer; aborting write');
      }

      const nowMs = this.config.nowProvider ? this.config.nowProvider() : Date.now();
      const tempPath = `${savePath}.tmp.${nowMs}_${process.pid}_${++this.tempCounter}_${Math.random().toString(36).slice(2, 8)}`;
      let handle: any = null;

      // Ensure parent directory exists recursively before allocating temporary staging file
      await fsImpl.mkdir(path.dirname(savePath), { recursive: true });

      try {
        try {
          handle = await fsImpl.open(tempPath, 'w');
          await handle.writeFile(outputBuffer);
          if (typeof handle.sync === 'function') {
            await handle.sync();
          }
        } finally {
          if (handle) {
            await handle.close().catch(() => {});
            handle = null;
          }
        }

        // Backup creation before atomic replacement:
        if (options?.createBackup !== false && (await this.exists(savePath, fsImpl))) {
          await fsImpl.copyFile(savePath, `${savePath}.bak`).catch((err: any) => {
            console.warn('[SaveDataEngine] Failed to create backup file:', sanitizeUserPaths(err?.message || String(err)));
          });
        }

        await resilientRename(tempPath, savePath, 5, 50, { promises: fsImpl } as unknown as typeof fs);
      } catch (err) {
        await fsImpl.unlink(tempPath).catch(() => {});
        throw err;
      }

      return { ok: true };
    });
  }

  async renameSave(
    gameKey: string,
    oldFileName: string,
    newFileName: string,
    overwrite = false
  ): Promise<{ ok: boolean; renamed?: boolean; fileName?: string; error?: string; message?: string }> {
    if (!newFileName || typeof newFileName !== 'string') {
      throw new Error('New save file name cannot be empty');
    }
    const trimmedNewName = newFileName.trim();
    if (!trimmedNewName) {
      throw new Error('New save file name cannot be empty');
    }
    this.findFormat(trimmedNewName);

    const paths = await this.config.getGamePaths(gameKey);
    if (!paths) throw new Error('Could not resolve game paths');

    const oldPath = this.resolveSafePath(paths.saveDir, oldFileName);
    const newPath = this.resolveSafePath(paths.saveDir, trimmedNewName);
    const fsImpl = this.resolveFsPromises();

    // Same-name identity no-op (preserves legacy test expectation: renamed: false)
    if (oldPath === newPath) {
      return { ok: true, renamed: false, fileName: trimmedNewName };
    }

    const normOld = this.normalizeMutexKey(oldPath);
    const normNew = this.normalizeMutexKey(newPath);
    const isCaseOnlyRename = normOld === normNew;

    if (isCaseOnlyRename) {
      // Single mutex lock acquisition for case-only rename to prevent self-deadlock
      return this.queueWrite(oldPath, async () => {
        if (!(await this.exists(oldPath, fsImpl))) {
          throw new Error(`Original save file does not exist: ${oldFileName}`);
        }
        await resilientRename(oldPath, newPath, 5, 50, { promises: fsImpl } as unknown as typeof fs);
        const oldBak = `${oldPath}.bak`;
        const newBak = `${newPath}.bak`;
        if (await this.exists(oldBak, fsImpl)) {
          await resilientRename(oldBak, newBak, 5, 50, { promises: fsImpl } as unknown as typeof fs).catch(() => {});
        }
        return { ok: true, renamed: true, fileName: trimmedNewName };
      });
    }

    // Distinct path rename: establish deterministic total lock ordering lexicographically
    const [firstPath, secondPath] = [oldPath, newPath].sort((a, b) =>
      this.normalizeMutexKey(a).localeCompare(this.normalizeMutexKey(b))
    );

    return this.queueWrite(firstPath, () =>
      this.queueWrite(secondPath, async () => {
        if (!(await this.exists(oldPath, fsImpl))) {
          throw new Error(`Original save file does not exist: ${oldFileName}`);
        }
        const targetExists = await this.exists(newPath, fsImpl);
        if (targetExists) {
          if (!overwrite) {
            return {
              ok: false,
              error: 'FILE_EXISTS',
              message: `Target save file already exists: ${trimmedNewName}`,
            };
          }
          const oldBakExists = await this.exists(`${oldPath}.bak`, fsImpl);
          const newBakExists = await this.exists(`${newPath}.bak`, fsImpl);
          if (!oldBakExists && newBakExists) {
            await fsImpl.unlink(`${newPath}.bak`).catch(() => {});
          }
        }
        await resilientRename(oldPath, newPath, 5, 50, { promises: fsImpl } as unknown as typeof fs);
        if (await this.exists(`${oldPath}.bak`, fsImpl)) {
          await resilientRename(
            `${oldPath}.bak`,
            `${newPath}.bak`,
            5,
            50,
            { promises: fsImpl } as unknown as typeof fs
          ).catch(() => {});
        }
        return { ok: true, renamed: true, fileName: trimmedNewName };
      })
    );
  }

  async deleteSave(gameKey: string, fileName: string) {
    const paths = await this.config.getGamePaths(gameKey);
    if (!paths) throw new Error('Could not resolve game paths');

    const savePath = this.resolveSafePath(paths.saveDir, fileName);
    const fsImpl = this.resolveFsPromises();

    return this.queueWrite(savePath, async () => {
      if (await this.exists(savePath, fsImpl)) {
        await fsImpl.unlink(savePath);
      }

      const bakPath = `${savePath}.bak`;
      try {
        if (await this.exists(bakPath, fsImpl)) {
          await fsImpl.unlink(bakPath);
        }
      } catch (err: any) {
        console.warn('[SaveDataEngine] Failed to unlink backup file:', sanitizeUserPaths(err?.message || String(err)));
      }

      return { ok: true };
    });
  }

  sanitizeSaveData(data: any): any {
    if (Buffer.isBuffer(data)) return data;
    if (!data || typeof data !== 'object') return data;
    const clean = { ...data };
    delete clean._userMappings;
    return clean;
  }

  private resolveSafePath(baseDir: string, fileName: string): string {
    if (!fileName || fileName.includes('/') || fileName.includes('\\') || path.basename(fileName) !== fileName) {
      throw new Error('Invalid save file path: Path traversal detected');
    }
    const targetPath = path.join(baseDir, fileName);
    const resolvedPath = path.resolve(targetPath);
    const resolvedBase = path.resolve(baseDir);

    if (!resolvedPath.startsWith(resolvedBase + path.sep) && resolvedPath !== resolvedBase) {
      throw new Error('Invalid save file path: Path traversal detected');
    }
    return targetPath;
  }

  private async exists(p: string, customFs?: typeof fs | typeof fs.promises): Promise<boolean> {
    try {
      const fsTarget = this.resolveFsPromises(customFs);
      await fsTarget.access(p);
      return true;
    } catch {
      return false;
    }
  }
}
