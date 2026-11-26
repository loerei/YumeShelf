import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type * as fs from 'node:fs';
import * as path from 'node:path';
import { YumeEngine } from '@yumeshelf/engine';
import { SaveDataEngine, type SaveDataEngineConfig, type SaveFormatStrategy } from './engine';
import { createSaveEditorService } from './index';

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/mock-userData'),
  },
}));

function makeErrno(code: string, message?: string): NodeJS.ErrnoException {
  const err = new Error(message ?? `${code}: error`) as NodeJS.ErrnoException;
  err.code = code;
  return err;
}

interface VirtualEntry {
  type: 'file' | 'dir' | 'symlink' | 'dangling-symlink';
  content?: Buffer;
  mode?: number;
  target?: string;
}

function createVirtualFs(initialFiles: Record<string, Buffer | string | VirtualEntry> = {}) {
  const entries = new Map<string, VirtualEntry>();
  entries.set(path.resolve('/game/save'), { type: 'dir' });
  entries.set(path.resolve('/game/data'), { type: 'dir' });
  entries.set(path.resolve('/mock-userData/save-mappings'), { type: 'dir' });

  for (const [rawPath, val] of Object.entries(initialFiles)) {
    const norm = path.resolve(rawPath);
    entries.set(path.dirname(norm), { type: 'dir' });
    if (Buffer.isBuffer(val)) {
      entries.set(norm, { type: 'file', content: val, mode: 0o644 });
    } else if (typeof val === 'string') {
      entries.set(norm, { type: 'file', content: Buffer.from(val, 'utf8'), mode: 0o644 });
    } else {
      entries.set(norm, val);
    }
  }

  const mkdir = vi.fn(async (p: string) => {
    entries.set(path.resolve(p), { type: 'dir' });
  });

  const access = vi.fn(async (p: string) => {
    const norm = path.resolve(p);
    if (!entries.has(norm)) throw makeErrno('ENOENT', `ENOENT: ${norm}`);
  });

  const stat = vi.fn(async (p: string) => {
    const norm = path.resolve(p);
    const entry = entries.get(norm);
    if (!entry || entry.type === 'dangling-symlink') {
      throw makeErrno('ENOENT', `ENOENT: ${norm}`);
    }
    const target = entry.type === 'symlink' && entry.target ? entries.get(path.resolve(entry.target)) : entry;
    if (!target) throw makeErrno('ENOENT');
    return {
      isFile: () => target.type === 'file',
      isDirectory: () => target.type === 'dir',
      size: target.content ? target.content.length : 0,
      mode: target.mode ?? 0o644,
      mtimeMs: 1_700_000_000_000,
    };
  });

  const readFile = vi.fn(async (p: string) => {
    const norm = path.resolve(p);
    const entry = entries.get(norm);
    if (!entry || entry.type !== 'file') throw makeErrno('ENOENT', `ENOENT: ${norm}`);
    return entry.content!;
  });

  const copyFile = vi.fn(async (src: string, dest: string) => {
    const s = entries.get(path.resolve(src));
    if (!s || s.type !== 'file') throw makeErrno('ENOENT');
    entries.set(path.resolve(dest), { type: 'file', content: Buffer.from(s.content!), mode: 0o644 });
  });

  const open = vi.fn(async (p: string, flags: string) => {
    const norm = path.resolve(p);
    let written = Buffer.alloc(0);
    if (flags === 'r+' && !entries.has(norm)) throw makeErrno('ENOENT');
    return {
      writeFile: vi.fn(async (data: Buffer | string) => {
        written = Buffer.isBuffer(data) ? Buffer.from(data) : Buffer.from(data, 'utf8');
      }),
      sync: vi.fn(async () => {}),
      close: vi.fn(async () => {
        if (flags === 'w') {
          entries.set(norm, { type: 'file', content: written, mode: 0o644 });
        }
      }),
    };
  });

  const rename = vi.fn(async (src: string, dest: string) => {
    const ns = path.resolve(src);
    const nd = path.resolve(dest);
    const entry = entries.get(ns);
    if (!entry) throw makeErrno('ENOENT');
    entries.delete(ns);
    entries.set(nd, entry);
  });

  const unlink = vi.fn(async (p: string) => {
    const norm = path.resolve(p);
    if (!entries.has(norm)) throw makeErrno('ENOENT');
    entries.delete(norm);
  });

  const chmod = vi.fn(async (p: string, mode: number) => {
    const entry = entries.get(path.resolve(p));
    if (!entry) throw makeErrno('ENOENT');
    entry.mode = mode;
  });

  const readdir = vi.fn(async (dirPath: string, opts?: { withFileTypes?: boolean }) => {
    const normDir = path.resolve(dirPath);
    if (!entries.has(normDir)) throw makeErrno('ENOENT');
    const results: any[] = [];
    for (const [k, v] of entries.entries()) {
      if (k !== normDir && path.dirname(k) === normDir) {
        const name = path.basename(k);
        if (opts?.withFileTypes) {
          results.push({
            name,
            isFile: () => v.type === 'file',
            isDirectory: () => v.type === 'dir',
            isSymbolicLink: () => v.type === 'symlink' || v.type === 'dangling-symlink',
          });
        } else {
          results.push(name);
        }
      }
    }
    return results;
  });

  const promises = {
    mkdir,
    access,
    stat,
    readFile,
    copyFile,
    open,
    rename,
    unlink,
    chmod,
    readdir,
  };

  // Synchronous methods for SaveMappingManager DI
  const syncFiles = new Map<string, string>();
  const customFs = {
    existsSync: vi.fn((p: string) => syncFiles.has(path.resolve(p)) || entries.has(path.resolve(p))),
    mkdirSync: vi.fn((p: string) => {
      entries.set(path.resolve(p), { type: 'dir' });
    }),
    readFileSync: vi.fn((p: string) => syncFiles.get(path.resolve(p)) ?? ''),
    openSync: vi.fn(() => 1),
    writeSync: vi.fn(),
    fsyncSync: vi.fn(),
    closeSync: vi.fn(),
    renameSync: vi.fn(),
    unlinkSync: vi.fn(),
    statSync: vi.fn(() => ({ mode: 0o644 })),
    chmodSync: vi.fn(),
    promises,
  } as unknown as typeof fs;

  return { customFs, promises, entries, syncFiles };
}

function makeConfig(
  customFs: typeof fs,
  overrides: Partial<SaveDataEngineConfig> = {}
): SaveDataEngineConfig {
  return {
    getGamePaths: vi.fn(async () => ({
      exeDir: path.resolve('/game'),
      saveDir: path.resolve('/game/save'),
      dataDir: path.resolve('/game/data'),
      langDataDir: null,
      engine: 'generic',
    })),
    loadMetadata: vi.fn(async () => ({ variables: ['HP'], switches: [] })),
    nowProvider: () => 1700000000000,
    fs: customFs,
    fsPromises: customFs.promises,
    ...overrides,
  };
}

describe('SaveDataEngine', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('loadSave validation, TOCTOU serialization, and schema extraction', () => {
    it('rejects non-regular files, 0-byte files, and files exceeding explicit maxBufferSizeBytes (unlimited by default or on NaN/Infinity/0/-1)', async () => {
      const saveDir = path.resolve('/game/save');
      const { customFs, promises } = createVirtualFs({
        [path.join(saveDir, 'dir.json')]: { type: 'dir' },
        [path.join(saveDir, 'empty.json')]: Buffer.alloc(0),
        [path.join(saveDir, 'big.json')]: Buffer.from('{"gold":1}', 'utf8'),
      });
      const engine = new SaveDataEngine(makeConfig(customFs));

      await expect(engine.loadSave('g1', 'dir.json')).rejects.toThrow(
        'Target save path is not a regular file: dir.json'
      );
      await expect(engine.loadSave('g1', 'empty.json')).rejects.toThrow(
        'Target save file is empty (0 bytes): empty.json'
      );

      // Default (omitted) and invalid maxBufferSizeBytes impose no 64MB ceiling
      promises.stat.mockResolvedValueOnce({
        isFile: () => true,
        isDirectory: () => false,
        size: 64 * 1024 * 1024 + 1,
        mode: 0o644,
        mtimeMs: 0,
      });
      await expect(engine.loadSave('g1', 'big.json')).resolves.toMatchObject({ fileName: 'big.json' });

      for (const badMax of [Number.NaN, Number.POSITIVE_INFINITY, 0, -1]) {
        promises.stat.mockResolvedValueOnce({
          isFile: () => true,
          isDirectory: () => false,
          size: 64 * 1024 * 1024 + 1,
          mode: 0o644,
          mtimeMs: 0,
        });
        await expect(
          engine.loadSave('g1', 'big.json', { maxBufferSizeBytes: badMax })
        ).resolves.toMatchObject({ fileName: 'big.json' });
      }

      // Explicit positive maxBufferSizeBytes still enforces the cap
      await expect(
        engine.loadSave('g1', 'big.json', { maxBufferSizeBytes: 5 })
      ).rejects.toThrow('Save file exceeds maximum allowed size');
    });

    it('serializes loadSave against concurrent writeSave via queueWrite (TOCTOU prevention)', async () => {
      const saveDir = path.resolve('/game/save');
      const saveFile = path.join(saveDir, 'slot1.json');
      const { customFs, promises } = createVirtualFs({
        [saveFile]: JSON.stringify({ gold: 100 }),
      });

      const order: string[] = [];
      let releaseWrite!: () => void;
      const writeBarrier = new Promise<void>((res) => {
        releaseWrite = res;
      });

      const origOpen = promises.open.getMockImplementation()!;
      promises.open.mockImplementationOnce(async (p: string, flags: string) => {
        order.push('write-open');
        await writeBarrier;
        order.push('write-after-barrier');
        return origOpen(p, flags);
      });

      const origStat = promises.stat.getMockImplementation()!;
      promises.stat.mockImplementation(async (p: string) => {
        order.push('load-stat');
        return origStat(p);
      });

      const engine = new SaveDataEngine(makeConfig(customFs));

      const writeP = engine.writeSave('g1', 'slot1.json', { gold: 999 }, { createBackup: false });
      const loadP = engine.loadSave('g1', 'slot1.json');

      await vi.waitFor(() => expect(order).toContain('write-open'));
      expect(order).not.toContain('load-stat');

      releaseWrite();
      await writeP;
      const loaded = await loadP;

      expect(order.indexOf('write-after-barrier')).toBeLessThan(order.indexOf('load-stat'));
      expect(loaded.data.gold).toBe(999);
    });

    it('forwards maxDecompressedBytes, injects _userMappings via DI fs, and returns normalized DTO + data + metadata', async () => {
      const saveDir = path.resolve('/game/save');
      const saveFile = path.join(saveDir, 'save.json');
      const { customFs } = createVirtualFs({
        [saveFile]: JSON.stringify({ gold: 500 }),
      });

      let receivedDecodeCtx: any;
      const customFmt: SaveFormatStrategy = {
        strategy: 'pure-json',
        match: (f) => f.endsWith('.json'),
        decode: vi.fn(async (buf, ctx) => {
          receivedDecodeCtx = ctx;
          return JSON.parse(buf.toString('utf8'));
        }),
        encode: vi.fn(async (d) => Buffer.from(JSON.stringify(d))),
      };

      const extractSpy = vi.spyOn(YumeEngine, 'extractSaveSchema');
      const engine = new SaveDataEngine(makeConfig(customFs), [customFmt]);

      const result = await engine.loadSave('g1', 'save.json', { maxDecompressedBytes: 12345 });

      expect(receivedDecodeCtx.maxDecompressedBytes).toBe(12345);
      expect(Array.isArray(result.data._userMappings)).toBe(true);
      expect(extractSpy).toHaveBeenCalledWith(
        'pure-json',
        result.data,
        expect.objectContaining({ gameKey: 'g1', fileName: 'save.json', metadata: result.metadata })
      );
      expect(result.metadata).toEqual({ variables: ['HP'], switches: [] });
    });
  });

  describe('writeSave mutex, surgical updates, error recovery, and no-op guards', () => {
    it('treats empty updates ({}), null, undefined as no-op and rejects 0-byte Buffer before acquiring locks', async () => {
      const saveDir = path.resolve('/game/save');
      const saveFile = path.join(saveDir, 'slot1.json');
      const initialBuf = Buffer.from('{"gold":50}', 'utf8');
      const { customFs, entries, promises } = createVirtualFs({
        [saveFile]: initialBuf,
      });
      const config = makeConfig(customFs);
      const engine = new SaveDataEngine(config);

      await expect(engine.writeSave('g1', 'slot1.json', Buffer.alloc(0))).rejects.toThrow(
        'Cannot write zero-byte save buffer'
      );

      for (const emptyInput of [{}, null, undefined]) {
        const res = await engine.writeSave('g1', 'slot1.json', emptyInput as any);
        expect(res).toEqual({ ok: true });
      }

      expect(config.getGamePaths).not.toHaveBeenCalled();
      expect(promises.open).not.toHaveBeenCalled();
      expect(entries.get(path.resolve(saveFile))?.content).toEqual(initialBuf);
      expect(entries.has(path.resolve(`${saveFile}.bak`))).toBe(false);
      expect(entries.has(path.join(saveDir, '.yumeshelf-backups', 'slot1.json.bak'))).toBe(false);
    });

    it('isolates predecessor mutex rejections and emits sanitized console.debug in non-production', async () => {
      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      const saveDir = path.resolve('/game/save');
      const { customFs } = createVirtualFs({
        [path.join(saveDir, 'slot1.json')]: '{"gold":1}',
      });
      const failFmt: SaveFormatStrategy = {
        match: () => true,
        decode: async (b) => JSON.parse(b.toString()),
        encode: vi
          .fn()
          .mockRejectedValueOnce(new Error('encode boom at C:\\Users\\alice\\secret'))
          .mockResolvedValueOnce(Buffer.from('{"gold":2}')),
      };

      const engine = new SaveDataEngine(makeConfig(customFs, { platform: 'win32' }), [failFmt]);

      const p1 = engine.writeSave('g1', 'slot1.json', { gold: 1 });
      const p2 = engine.writeSave('g1', 'SLOT1.JSON', { gold: 2 });

      await expect(p1).rejects.toThrow('encode boom');
      await expect(p2).resolves.toEqual({ ok: true });

      expect(debugSpy).toHaveBeenCalled();
      expect(JSON.stringify(debugSpy.mock.calls[0])).not.toContain('alice');
    });

    it('closes handle in inner finally and cleans up .tmp file in outer catch when handle.sync rejects with ENOSPC', async () => {
      const saveDir = path.resolve('/game/save');
      const { customFs, promises, entries } = createVirtualFs();
      const closeMock = vi.fn().mockResolvedValue(undefined);
      promises.open.mockResolvedValueOnce({
        writeFile: vi.fn().mockResolvedValue(undefined),
        sync: vi.fn().mockRejectedValue(makeErrno('ENOSPC', 'No space left')),
        close: closeMock,
      });

      const engine = new SaveDataEngine(makeConfig(customFs));
      await expect(engine.writeSave('g1', 'new.json', { gold: 10 })).rejects.toThrow('No space left');

      expect(closeMock).toHaveBeenCalledTimes(1);
      expect(promises.unlink).toHaveBeenCalledTimes(1);
      const leftoverTmp = [...entries.keys()].filter((k) => k.includes('.tmp.'));
      expect(leftoverTmp).toHaveLength(0);
    });

    it('delegates surgical updates with codecOptions and enforces stat/size/0-byte checks', async () => {
      const saveDir = path.resolve('/game/save');
      const saveFile = path.join(saveDir, 'empty.json');
      const { customFs, entries, promises } = createVirtualFs({
        [saveFile]: Buffer.alloc(0),
        [path.join(saveDir, 'valid.json')]: Buffer.from('{"gold":10}', 'utf8'),
      });

      const engine = new SaveDataEngine(makeConfig(customFs));

      await expect(
        engine.writeSave('g1', 'empty.json', { 'default:gold': 99 }, { isUpdates: true })
      ).rejects.toThrow('Target save file on disk is empty (0 bytes): empty.json');

      promises.stat.mockResolvedValueOnce({
        isFile: () => true,
        isDirectory: () => false,
        size: 64 * 1024 * 1024 + 1,
        mode: 0o644,
        mtimeMs: 0,
      });
      await expect(
        engine.writeSave('g1', 'valid.json', { 'default:gold': 99 }, { maxBufferSizeBytes: 5 })
      ).rejects.toThrow('Save file exceeds maximum allowed size');

      const applySpy = vi
        .spyOn(YumeEngine, 'applySaveUpdates')
        .mockResolvedValueOnce(Buffer.from('{"gold":99}', 'utf8'));

      const res = await engine.writeSave('g1', 'valid.json', { 'default:gold': 99 });
      expect(res).toEqual({ ok: true });
      expect(entries.has(path.join(saveDir, '.yumeshelf-backups', 'valid.json.bak'))).toBe(true);
      expect(entries.has(path.join(saveDir, 'valid.json.bak'))).toBe(false);
      expect(applySpy).toHaveBeenCalledWith(
        'pure-json',
        expect.any(Buffer),
        { 'default:gold': 99 },
        expect.objectContaining({
          exeDir: path.resolve('/game'),
          dataDir: path.resolve('/game/data'),
          fileName: 'valid.json',
          savePath: path.join(saveDir, 'valid.json'),
        })
      );
    });

    it('guards Buffer.isBuffer in sanitizeSaveData so binary buffers are not spread into objects', () => {
      const { customFs } = createVirtualFs();
      const engine = new SaveDataEngine(makeConfig(customFs));
      const buf = Buffer.from([1, 2, 3]);
      expect(engine.sanitizeSaveData(buf)).toBe(buf);
    });
  });

  describe('renameSave deadlock prevention, case-only renames, and backup purging', () => {
    it('handles case-only rename on win32 with single mutex lock without deadlock and migrates .bak in .yumeshelf-backups/', async () => {
      const saveDir = path.resolve('/game/save');
      const backupDir = path.join(saveDir, '.yumeshelf-backups');
      const { customFs, entries } = createVirtualFs({
        [path.join(saveDir, 'slot1.json')]: '{"gold":1}',
        [path.join(backupDir, 'slot1.json.bak')]: '{"gold":0}',
      });
      const engine = new SaveDataEngine(makeConfig(customFs, { platform: 'win32' }));

      const res = await engine.renameSave('g1', 'slot1.json', 'Slot1.json');
      expect(res).toEqual({ ok: true, renamed: true, fileName: 'Slot1.json' });
      expect(entries.has(path.join(saveDir, 'Slot1.json'))).toBe(true);
      expect(entries.has(path.join(backupDir, 'Slot1.json.bak'))).toBe(true);
    });

    it('prevents AB-BA deadlocks via lexicographical lock ordering and purges stale target .bak on overwrite', async () => {
      const saveDir = path.resolve('/game/save');
      const backupDir = path.join(saveDir, '.yumeshelf-backups');
      const { customFs, entries } = createVirtualFs({
        [path.join(saveDir, 'a.json')]: '{"a":1}',
        [path.join(saveDir, 'b.json')]: '{"b":1}',
        [path.join(backupDir, 'b.json.bak')]: '{"b":0}',
      });
      const engine = new SaveDataEngine(makeConfig(customFs, { platform: 'linux' }));

      // Same-name identity
      expect(await engine.renameSave('g1', 'a.json', 'a.json')).toEqual({
        ok: true,
        renamed: false,
        fileName: 'a.json',
      });

      // Collision with overwrite=false
      expect(await engine.renameSave('g1', 'a.json', 'b.json', false)).toEqual({
        ok: false,
        error: 'FILE_EXISTS',
        message: 'Target save file already exists: b.json',
      });

      // Overwrite=true purges stale b.json.bak because a.json.bak does not exist
      const res = await engine.renameSave('g1', 'a.json', 'b.json', true);
      expect(res).toEqual({ ok: true, renamed: true, fileName: 'b.json' });
      expect(entries.has(path.join(backupDir, 'b.json.bak'))).toBe(false);
    });
  });

  describe('listSaveFiles filtering, symlink checks, and non-blocking sweep', () => {
    it('filters directories (including .yumeshelf-backups), dangling symlinks, .tmp., and .corrupt., sorts naturally, and catches sweep EACCES', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const saveDir = path.resolve('/game/save');
      const { customFs, promises } = createVirtualFs({
        [path.join(saveDir, 'save10.json')]: '{}',
        [path.join(saveDir, 'save2.json')]: '{}',
        [path.join(saveDir, 'folder.json')]: { type: 'dir' },
        [path.join(saveDir, '.yumeshelf-backups')]: { type: 'dir' },
        [path.join(saveDir, 'broken.json')]: { type: 'dangling-symlink' },
        [path.join(saveDir, 'save1.json.tmp.123')]: '{}',
        [path.join(saveDir, 'save1.json.corrupt.123')]: '{}',
      });

      // First readdir (withFileTypes: true) succeeds; second readdir (from sweepOrphanedSaveTmpFiles) rejects EACCES
      const origReaddir = promises.readdir.getMockImplementation()!;
      promises.readdir
        .mockImplementationOnce((dir, opts) => origReaddir(dir, opts))
        .mockRejectedValueOnce(makeErrno('EACCES', 'EACCES: C:\\Users\\alice\\save'));

      const engine = new SaveDataEngine(makeConfig(customFs));
      const files = await engine.listSaveFiles('g1');

      expect(files).toEqual(['save2.json', 'save10.json']);
      await expect(engine.lastSweepPromise).resolves.toBeUndefined();
      expect(warnSpy).toHaveBeenCalled();
      expect(JSON.stringify(warnSpy.mock.calls[0])).not.toContain('alice');
    });
  });

  describe('createSaveEditorService(config) direct writeSaveData & sanitized error logging', () => {
    it('unpacks both single-object WriteSaveDataPayload and 4-positional arguments in writeSaveData', async () => {
      const saveDir = path.resolve('/game/save');
      const { customFs } = createVirtualFs({
        [path.join(saveDir, 'slot1.json')]: '{"gold":10}',
      });

      const service = createSaveEditorService({
        libraryState: {
          getGameRecord: vi.fn(async () => ({ exePath: path.resolve('/game/Game.exe') })),
        },
        saveFolderResolver: {
          resolveSaveFolder: vi.fn(async () => ({ path: saveDir, engine: 'generic' })),
        },
        translationsDir: path.resolve('/mock-translations'),
        fsPromises: customFs.promises,
      });

      const res1 = await service.writeSaveData({
        gameKey: 'g1',
        fileName: 'slot1.json',
        data: { gold: 42 },
        options: { createBackup: false },
      });
      expect(res1).toEqual({ ok: true });

      const res2 = await service.writeSaveData('g1', 'slot1.json', { gold: 84 }, { createBackup: false });
      expect(res2).toEqual({ ok: true });

      const applySpy = vi
        .spyOn(YumeEngine, 'applySaveUpdates')
        .mockResolvedValue(Buffer.from('{"gold":128}', 'utf8'));

      const res3 = await service.writeSaveData({
        gameKey: 'g1',
        fileName: 'slot1.json',
        updates: { 'default:gold': 128 },
        options: { createBackup: false },
      });
      expect(res3).toEqual({ ok: true });

      const res4 = await service.writeSaveData('g1', 'slot1.json', { 'default:gold': 256 }, { createBackup: false });
      expect(res4).toEqual({ ok: true });
      expect(applySpy).toHaveBeenCalledTimes(2);
      expect('updateMapping' in service).toBe(false);
    });

    it('scrubs paths/usernames with sanitizeUserPaths in listSaveFiles, renameSaveFile, and deleteSaveFile errors', async () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { customFs } = createVirtualFs();

      const service = createSaveEditorService({
        libraryState: {
          getGameRecord: vi.fn(async () => {
            throw new Error('DB fail at C:\\Users\\alice\\db.json');
          }),
        },
        saveFolderResolver: {
          resolveSaveFolder: vi.fn(),
        },
        translationsDir: path.resolve('/mock-translations'),
        fsPromises: customFs.promises,
      });

      await expect(service.listSaveFiles('C:\\Users\\alice\\game')).rejects.toThrow('DB fail');
      await expect(service.renameSaveFile('g1', 'C:\\Users\\alice\\a.json', 'b.json')).rejects.toThrow('DB fail');
      await expect(service.deleteSaveFile('g1', 'C:\\Users\\alice\\a.json')).rejects.toThrow('DB fail');

      expect(errSpy).toHaveBeenCalledTimes(3);
      for (const call of errSpy.mock.calls) {
        expect(JSON.stringify(call)).not.toContain('alice');
        expect(JSON.stringify(call)).toContain('<USER_DIR>');
      }
    });
  });
});
