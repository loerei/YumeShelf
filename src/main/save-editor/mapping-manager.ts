import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { app } from 'electron';
import { sanitizeUserPaths } from '../../shared/path-sanitizer';
import {
  ensureWritable,
  ensureWritableSync,
  resilientRename,
  resilientRenameSync,
} from './fs-utils';

export interface MappingEntry {
  name: string;
  offset: number;
  dataType: string;
}

export interface MappingFilePayload {
  schemaVersion: number;
  variables: MappingEntry[];
}

export interface SaveMappingManagerOptions {
  customMappingDir?: string;
  nowProvider?: () => number;
  fs?: typeof fs;
  maxRetries?: number;
  initialBackoffMs?: number;
}

const MAX_MAPPING_ENTRIES = 5000;
const SAFE_FILENAME_REGEX = /^(?!(?:CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])(?:\..*)?$)[^\\/:*?"<>|\x00-\x1f]+(?<![. ])$/i;
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const ALLOWED_DATA_TYPES = new Set([
  'int32',
  'int16',
  'int8',
  'uint32',
  'uint16',
  'uint8',
  'float32',
  'float64',
  'string',
  'boolean',
]);

const mappingWriteMutexes = new Map<string, Promise<void>>();

function sanitizeMappingEntries(raw: unknown): MappingEntry[] {
  if (!raw || typeof raw !== 'object') return [];
  const entries: unknown[] = Array.isArray((raw as any).variables)
    ? (raw as any).variables
    : Array.isArray(raw)
      ? (raw as unknown[])
      : [];

  const sanitized: MappingEntry[] = [];
  for (const item of entries.slice(0, MAX_MAPPING_ENTRIES)) {
    if (!item || typeof item !== 'object') continue;
    const entry = item as Record<string, unknown>;
    const rawName = typeof entry.name === 'string' ? entry.name.trim().normalize('NFC') : '';
    if (!rawName || DANGEROUS_KEYS.has(rawName)) continue;

    const offset =
      typeof entry.offset === 'number' && Number.isFinite(entry.offset) && entry.offset >= 0
        ? Math.trunc(entry.offset)
        : null;
    if (offset === null) continue;

    const rawType = typeof entry.dataType === 'string' ? entry.dataType.toLowerCase().trim() : 'int32';
    const dataType = ALLOWED_DATA_TYPES.has(rawType) ? rawType : 'int32';

    sanitized.push({ name: rawName, offset, dataType });
  }
  return sanitized;
}

export default class SaveMappingManager {
  gameId: string;
  mappingDir: string;
  mappingPath: string;
  mappings!: MappingFilePayload;
  public isReadOnlyFutureVersion = false;

  private readonly customFs: typeof fs;
  private readonly nowProvider: () => number;
  private readonly maxRetries?: number;
  private readonly initialBackoffMs?: number;

  constructor(gameId: string, options: SaveMappingManagerOptions = {}) {
    const normalizedId = typeof gameId === 'string' ? gameId.trim().normalize('NFC') : '';
    if (!normalizedId) {
      throw new Error('SaveMappingManager requires a non-empty gameId');
    }
    this.gameId = normalizedId;
    this.customFs = options.fs ?? fs;
    this.nowProvider = options.nowProvider ?? Date.now;
    this.maxRetries = options.maxRetries;
    this.initialBackoffMs = options.initialBackoffMs;

    if (options.customMappingDir) {
      this.mappingDir = options.customMappingDir;
    } else {
      const userDataPath = app?.getPath
        ? app.getPath('userData')
        : path.join(os.tmpdir(), 'yumeshelf', 'userData');
      this.mappingDir = path.join(userDataPath, 'save-mappings');
    }

    const hash = crypto.createHash('sha256').update(this.gameId).digest('hex');
    this.mappingPath = path.join(this.mappingDir, `${hash}.json`);
    this.load();
  }

  load(): void {
    this.isReadOnlyFutureVersion = false;

    if (!this.customFs.existsSync(this.mappingDir)) {
      this.customFs.mkdirSync(this.mappingDir, { recursive: true });
    }

    // Phase 1: Backward-compatible legacy migration
    const isSafeLegacyName = SAFE_FILENAME_REGEX.test(this.gameId);
    const resolvedMappingDir = path.resolve(this.mappingDir);
    const resolvedLegacyPath = path.resolve(this.mappingDir, `${this.gameId}.json`);
    const relPath = path.relative(resolvedMappingDir, resolvedLegacyPath);
    const isContained = !relPath.startsWith('..') && !path.isAbsolute(relPath);

    if (isSafeLegacyName && isContained && this.customFs.existsSync(resolvedLegacyPath)) {
      try {
        const legacyRaw = this.customFs.readFileSync(resolvedLegacyPath, 'utf-8');
        const parsed = JSON.parse(legacyRaw);
        const sanitizedEntries = sanitizeMappingEntries(parsed);

        // Modern mapping preservation invariant: DO NOT overwrite modern file if already present on disk
        if (!this.customFs.existsSync(this.mappingPath)) {
          this.mappings = { schemaVersion: 1, variables: sanitizedEntries };
          this.save();
        }

        // Commit rename of legacy file to .migrated using resilient locking
        resilientRenameSync(
          resolvedLegacyPath,
          `${resolvedLegacyPath}.migrated`,
          3,
          25,
          this.customFs
        );
      } catch (err) {
        console.warn('[SaveMappingManager] Legacy mapping migration skipped:', {
          gameId: sanitizeUserPaths(this.gameId),
          error: sanitizeUserPaths((err as Error)?.message || String(err)),
        });
      }
    }

    // Phase 2: Steady-state read
    if (!this.customFs.existsSync(this.mappingPath)) {
      this.mappings = { schemaVersion: 1, variables: [] };
      return;
    }

    let rawContent: string;
    try {
      rawContent = this.customFs.readFileSync(this.mappingPath, 'utf-8');
    } catch (readErr) {
      // Transient read errors (e.g. EBUSY/EACCES) preserve existing file intact without quarantine
      console.warn('[SaveMappingManager] Failed to read mapping file (preserving existing file):', {
        path: sanitizeUserPaths(this.mappingPath),
        error: sanitizeUserPaths((readErr as Error)?.message || String(readErr)),
      });
      this.mappings = { schemaVersion: 1, variables: [] };
      return;
    }

    try {
      const parsed = JSON.parse(rawContent);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Malformed mapping payload: expected JSON object');
      }

      const version = (parsed as Record<string, unknown>).schemaVersion;
      if (typeof version === 'number' && version > 1) {
        this.isReadOnlyFutureVersion = true;
        this.mappings = {
          schemaVersion: version,
          variables: sanitizeMappingEntries(parsed),
        };
        return;
      }

      this.mappings = {
        schemaVersion: 1,
        variables: sanitizeMappingEntries(parsed),
      };
    } catch (parseErr) {
      const corruptPath = `${this.mappingPath}.corrupt.${this.nowProvider()}`;
      console.warn('[SaveMappingManager] Quarantining malformed mapping file:', {
        path: sanitizeUserPaths(this.mappingPath),
        corruptPath: sanitizeUserPaths(corruptPath),
        error: sanitizeUserPaths((parseErr as Error)?.message || String(parseErr)),
      });
      try {
        resilientRenameSync(this.mappingPath, corruptPath, 3, 25, this.customFs);
      } catch (quarantineErr) {
        console.warn('[SaveMappingManager] Failed to quarantine malformed mapping file:', {
          path: sanitizeUserPaths(this.mappingPath),
          error: sanitizeUserPaths((quarantineErr as Error)?.message || String(quarantineErr)),
        });
      }
      this.mappings = { schemaVersion: 1, variables: [] };
    }
  }

  save(): void {
    if (this.isReadOnlyFutureVersion) {
      throw new Error('SaveMappingManager: Cannot modify read-only future version');
    }

    if (!this.customFs.existsSync(this.mappingDir)) {
      this.customFs.mkdirSync(this.mappingDir, { recursive: true });
    }

    const tmpPath = `${this.mappingPath}.tmp.${this.nowProvider()}_${process.pid}_${Math.random().toString(36).slice(2, 8)}`;
    const payload = JSON.stringify(this.mappings, null, 2);
    let fd: number | null = null;

    try {
      fd = this.customFs.openSync(tmpPath, 'w');
      this.customFs.writeSync(fd, payload, 0, 'utf-8');
      this.customFs.fsyncSync(fd);
      this.customFs.closeSync(fd);
      fd = null;

      resilientRenameSync(
        tmpPath,
        this.mappingPath,
        this.maxRetries ?? 3,
        this.initialBackoffMs ?? 25,
        this.customFs
      );
    } catch (err) {
      if (fd !== null) {
        try {
          this.customFs.closeSync(fd);
        } catch {
          // Ignore close error during recovery
        }
      }
      try {
        if (this.customFs.existsSync(tmpPath)) {
          ensureWritableSync(tmpPath, this.customFs);
          this.customFs.unlinkSync(tmpPath);
        }
      } catch {
        // Ignore unlink error during recovery
      }
      throw err;
    }
  }

  async saveAsync(): Promise<void> {
    if (this.isReadOnlyFutureVersion) {
      throw new Error('SaveMappingManager: Cannot modify read-only future version');
    }

    const lockKey = path.resolve(this.mappingPath);
    const prev = mappingWriteMutexes.get(lockKey) ?? Promise.resolve();

    const run = async (): Promise<void> => {
      await this.customFs.promises.mkdir(this.mappingDir, { recursive: true });

      const tmpPath = `${this.mappingPath}.tmp.${this.nowProvider()}_${process.pid}_${Math.random().toString(36).slice(2, 8)}`;
      const payload = JSON.stringify(this.mappings, null, 2);
      let handle: fs.promises.FileHandle | null = null;

      try {
        handle = await this.customFs.promises.open(tmpPath, 'w');
        await handle.writeFile(payload, 'utf-8');
        await handle.sync();
        await handle.close();
        handle = null;

        await resilientRename(
          tmpPath,
          this.mappingPath,
          this.maxRetries ?? 5,
          this.initialBackoffMs ?? 50,
          this.customFs
        );
      } catch (err) {
        if (handle !== null) {
          try {
            await handle.close();
          } catch {
            // Ignore close error during recovery
          }
        }
        await ensureWritable(tmpPath, this.customFs.promises);
        await this.customFs.promises.unlink(tmpPath).catch(() => {});
        throw err;
      }
    };

    const currentPromise = prev.catch(() => {}).then(run);
    mappingWriteMutexes.set(lockKey, currentPromise);

    try {
      await currentPromise;
    } finally {
      if (mappingWriteMutexes.get(lockKey) === currentPromise) {
        mappingWriteMutexes.delete(lockKey);
      }
    }
  }

  private validateAndUpsertMapping(name: string, offset: number, dataType?: string): void {
    if (this.isReadOnlyFutureVersion) {
      throw new Error('SaveMappingManager: Cannot modify read-only future version');
    }

    const rawName = typeof name === 'string' ? name.trim().normalize('NFC') : '';
    if (!rawName) {
      throw new Error('SaveMappingManager: Mapping name must be a non-empty string');
    }
    if (DANGEROUS_KEYS.has(rawName)) {
      throw new Error(`SaveMappingManager: Invalid mapping name "${rawName}"`);
    }

    if (typeof offset !== 'number' || !Number.isFinite(offset) || offset < 0) {
      throw new Error('SaveMappingManager: Mapping offset must be a non-negative finite number');
    }
    const cleanOffset = Math.trunc(offset);

    let cleanType = 'int32';
    if (dataType !== undefined) {
      if (typeof dataType !== 'string') {
        throw new Error('SaveMappingManager: Invalid dataType');
      }
      cleanType = dataType.toLowerCase().trim();
      if (!ALLOWED_DATA_TYPES.has(cleanType)) {
        throw new Error(`SaveMappingManager: Unsupported dataType "${cleanType}"`);
      }
    }

    const existingIndex = this.mappings.variables.findIndex((entry) => entry.name === rawName);
    if (existingIndex !== -1) {
      this.mappings.variables[existingIndex] = {
        name: rawName,
        offset: cleanOffset,
        dataType: cleanType,
      };
    } else {
      if (this.mappings.variables.length >= MAX_MAPPING_ENTRIES) {
        throw new Error('SaveMappingManager: Maximum mapping capacity (5000 entries) reached');
      }
      this.mappings.variables.push({
        name: rawName,
        offset: cleanOffset,
        dataType: cleanType,
      });
    }
  }

  addMapping(name: string, offset: number, dataType?: string): void {
    this.validateAndUpsertMapping(name, offset, dataType);
    this.save();
  }

  async addMappingAsync(name: string, offset: number, dataType?: string): Promise<void> {
    this.validateAndUpsertMapping(name, offset, dataType);
    await this.saveAsync();
  }
}
