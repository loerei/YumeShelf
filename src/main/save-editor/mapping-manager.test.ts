import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as crypto from 'node:crypto';
import type * as fs from 'node:fs';
import * as path from 'node:path';

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/mock-electron-userData'),
  },
}));

import SaveMappingManager from './mapping-manager';

function makeErrno(code: string, message?: string): NodeJS.ErrnoException {
  const err = new Error(message ?? `${code}: error`) as NodeJS.ErrnoException;
  err.code = code;
  return err;
}

interface MockFsState {
  files: Map<string, { content: string; mode: number }>;
  dirs: Set<string>;
}

function createMockFs(initialFiles: Record<string, string | { content: string; mode?: number }> = {}) {
  const state: MockFsState = {
    files: new Map(),
    dirs: new Set(['/mappings']),
  };

  for (const [k, v] of Object.entries(initialFiles)) {
    const norm = path.resolve(k);
    if (typeof v === 'string') {
      state.files.set(norm, { content: v, mode: 0o644 });
    } else {
      state.files.set(norm, { content: v.content, mode: v.mode ?? 0o644 });
    }
    state.dirs.add(path.dirname(norm));
  }

  let nextFd = 100;
  const openBuffers = new Map<number, { path: string; chunks: string[] }>();

  const existsSync = vi.fn((p: string) => {
    const norm = path.resolve(p);
    return state.files.has(norm) || state.dirs.has(norm);
  });

  const mkdirSync = vi.fn((p: string) => {
    state.dirs.add(path.resolve(p));
  });

  const readFileSync = vi.fn((p: string) => {
    const norm = path.resolve(p);
    const entry = state.files.get(norm);
    if (!entry) throw makeErrno('ENOENT', `ENOENT: ${norm}`);
    return entry.content;
  });

  const openSync = vi.fn((p: string, flags: string) => {
    const norm = path.resolve(p);
    if (flags === 'w') {
      const fd = nextFd++;
      openBuffers.set(fd, { path: norm, chunks: [] });
      return fd;
    }
    if (!state.files.has(norm)) throw makeErrno('ENOENT');
    return nextFd++;
  });

  const writeSync = vi.fn((fd: number, data: string) => {
    const buf = openBuffers.get(fd);
    if (buf) {
      buf.chunks.push(data);
    }
    return data.length;
  });

  const fsyncSync = vi.fn();

  const closeSync = vi.fn((fd: number) => {
    const buf = openBuffers.get(fd);
    if (buf) {
      state.files.set(buf.path, { content: buf.chunks.join(''), mode: 0o644 });
      openBuffers.delete(fd);
    }
  });

  const renameSync = vi.fn((src: string, dest: string) => {
    const normSrc = path.resolve(src);
    const normDest = path.resolve(dest);
    const entry = state.files.get(normSrc);
    if (!entry) throw makeErrno('ENOENT');
    state.files.delete(normSrc);
    state.files.set(normDest, entry);
  });

  const unlinkSync = vi.fn((p: string) => {
    const norm = path.resolve(p);
    if (!state.files.has(norm)) throw makeErrno('ENOENT');
    state.files.delete(norm);
  });

  const statSync = vi.fn((p: string) => {
    const norm = path.resolve(p);
    const entry = state.files.get(norm);
    if (!entry) throw makeErrno('ENOENT');
    return { mode: entry.mode };
  });

  const chmodSync = vi.fn((p: string, mode: number) => {
    const norm = path.resolve(p);
    const entry = state.files.get(norm);
    if (!entry) throw makeErrno('ENOENT');
    entry.mode = mode;
  });

  const promises = {
    mkdir: vi.fn(async (p: string) => {
      state.dirs.add(path.resolve(p));
    }),
    open: vi.fn(async (p: string, flags: string) => {
      const norm = path.resolve(p);
      let written = '';
      if (flags === 'r+' && !state.files.has(norm)) throw makeErrno('ENOENT');
      return {
        writeFile: vi.fn(async (data: string) => {
          written = data;
        }),
        sync: vi.fn(async () => {}),
        close: vi.fn(async () => {
          if (flags === 'w') {
            state.files.set(norm, { content: written, mode: 0o644 });
          }
        }),
      };
    }),
    rename: vi.fn(async (src: string, dest: string) => {
      renameSync(src, dest);
    }),
    unlink: vi.fn(async (p: string) => {
      unlinkSync(p);
    }),
    stat: vi.fn(async (p: string) => statSync(p)),
    chmod: vi.fn(async (p: string, mode: number) => chmodSync(p, mode)),
  };

  const mockFs = {
    existsSync,
    mkdirSync,
    readFileSync,
    openSync,
    writeSync,
    fsyncSync,
    closeSync,
    renameSync,
    unlinkSync,
    statSync,
    chmodSync,
    promises,
  } as unknown as typeof fs;

  return { mockFs, state };
}

describe('SaveMappingManager', () => {
  const fixedNow = () => 1700000000000;
  const mappingDir = path.resolve('/mappings');

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor, gameId validation, SHA-256 flat path, and DI seam', () => {
    it('throws on empty, whitespace-only, or non-string gameId', () => {
      const { mockFs } = createMockFs();
      expect(() => new SaveMappingManager('', { customMappingDir: mappingDir, fs: mockFs })).toThrow(
        'SaveMappingManager requires a non-empty gameId'
      );
      expect(() => new SaveMappingManager('   ', { customMappingDir: mappingDir, fs: mockFs })).toThrow(
        'SaveMappingManager requires a non-empty gameId'
      );
      expect(() => new SaveMappingManager(null as unknown as string, { customMappingDir: mappingDir, fs: mockFs })).toThrow(
        'SaveMappingManager requires a non-empty gameId'
      );
    });

    it('normalizes gameId (trim + NFC) and resolves flat SHA-256 filename strictly within mappingDir using customFs', () => {
      const { mockFs } = createMockFs();
      const nfdGameId = '  cafe\u0301-game  ';
      const expectedNormalized = 'caf\u00e9-game';
      const expectedHash = crypto.createHash('sha256').update(expectedNormalized).digest('hex');

      const mgr = new SaveMappingManager(nfdGameId, {
        customMappingDir: mappingDir,
        nowProvider: fixedNow,
        fs: mockFs,
      });

      expect(mgr.gameId).toBe(expectedNormalized);
      expect(mgr.mappingPath).toBe(path.join(mappingDir, `${expectedHash}.json`));
      expect(mgr.mappings).toEqual({ schemaVersion: 1, variables: [] });
      expect(mockFs.existsSync).toHaveBeenCalled();
    });
  });

  describe('schemaVersion, ingress validation, upsert, and 5000-entry cap', () => {
    it('validates and normalizes name/offset/dataType, defaults omitted dataType to int32, and upserts in-place', () => {
      const { mockFs, state } = createMockFs();
      const mgr = new SaveMappingManager('my-game', {
        customMappingDir: mappingDir,
        nowProvider: fixedNow,
        fs: mockFs,
      });

      mgr.addMapping('  gold\u0065\u0301  ', 128.9);
      expect(mgr.mappings.variables).toEqual([
        { name: 'gold\u00e9', offset: 128, dataType: 'int32' },
      ]);

      mgr.addMapping('gold\u00e9', 256, '  FLOAT64 ');
      expect(mgr.mappings.variables).toHaveLength(1);
      expect(mgr.mappings.variables[0]).toEqual({
        name: 'gold\u00e9',
        offset: 256,
        dataType: 'float64',
      });

      const persisted = JSON.parse(state.files.get(path.resolve(mgr.mappingPath))!.content);
      expect(persisted).toEqual({
        schemaVersion: 1,
        variables: [{ name: 'gold\u00e9', offset: 256, dataType: 'float64' }],
      });
    });

    it('rejects empty names, prototype-polluting keys, invalid offsets, and unsupported dataTypes', () => {
      const { mockFs } = createMockFs();
      const mgr = new SaveMappingManager('my-game', {
        customMappingDir: mappingDir,
        nowProvider: fixedNow,
        fs: mockFs,
      });

      expect(() => mgr.addMapping('', 10)).toThrow();
      expect(() => mgr.addMapping('   ', 10)).toThrow();
      expect(() => mgr.addMapping('__proto__', 10)).toThrow();
      expect(() => mgr.addMapping('constructor', 10)).toThrow();
      expect(() => mgr.addMapping('prototype', 10)).toThrow();
      expect(() => mgr.addMapping('hp', -1)).toThrow();
      expect(() => mgr.addMapping('hp', Number.NaN)).toThrow();
      expect(() => mgr.addMapping('hp', Number.POSITIVE_INFINITY)).toThrow();
      expect(() => mgr.addMapping('hp', 10, 'bigint128')).toThrow();
    });

    it('enforces 5000-entry cap on new entries while still allowing in-place upsert at cap', () => {
      const { mockFs } = createMockFs();
      const mgr = new SaveMappingManager('cap-game', {
        customMappingDir: mappingDir,
        nowProvider: fixedNow,
        fs: mockFs,
      });

      mgr.mappings.variables = Array.from({ length: 5000 }, (_, i) => ({
        name: `var_${i}`,
        offset: i * 4,
        dataType: 'int32',
      }));

      expect(() => mgr.addMapping('var_5000', 20000)).toThrow('Maximum mapping capacity (5000 entries) reached');
      mgr.addMapping('var_0', 999, 'uint32');
      expect(mgr.mappings.variables).toHaveLength(5000);
      expect(mgr.mappings.variables[0]).toEqual({ name: 'var_0', offset: 999, dataType: 'uint32' });
    });
  });

  describe('corrupt file quarantine, transient read error preservation, and future schema defense', () => {
    it('quarantines malformed JSON to .corrupt.<timestamp> using nowProvider without throwing', () => {
      const hash = crypto.createHash('sha256').update('corrupt-game').digest('hex');
      const mappingPath = path.join(mappingDir, `${hash}.json`);
      const { mockFs, state } = createMockFs({
        [mappingPath]: '{ broken json !!!',
      });
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const mgr = new SaveMappingManager('corrupt-game', {
        customMappingDir: mappingDir,
        nowProvider: fixedNow,
        fs: mockFs,
      });

      expect(mgr.mappings).toEqual({ schemaVersion: 1, variables: [] });
      expect(state.files.has(path.resolve(mappingPath))).toBe(false);
      expect(state.files.get(path.resolve(`${mappingPath}.corrupt.1700000000000`))?.content).toBe('{ broken json !!!');
      expect(warnSpy).toHaveBeenCalled();
    });

    it('preserves valid mapping file intact when readFileSync fails with transient EBUSY', () => {
      const hash = crypto.createHash('sha256').update('busy-game').digest('hex');
      const mappingPath = path.join(mappingDir, `${hash}.json`);
      const validContent = JSON.stringify({ schemaVersion: 1, variables: [{ name: 'hp', offset: 4, dataType: 'int32' }] });
      const { mockFs, state } = createMockFs({
        [mappingPath]: validContent,
      });
      (mockFs.readFileSync as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
        throw makeErrno('EBUSY', 'EBUSY: C:\\Users\\alice\\busy');
      });
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const mgr = new SaveMappingManager('busy-game', {
        customMappingDir: mappingDir,
        nowProvider: fixedNow,
        fs: mockFs,
      });

      expect(mgr.mappings).toEqual({ schemaVersion: 1, variables: [] });
      expect(state.files.get(path.resolve(mappingPath))?.content).toBe(validContent);
      expect(state.files.has(path.resolve(`${mappingPath}.corrupt.1700000000000`))).toBe(false);
      expect(JSON.stringify(warnSpy.mock.calls[0])).not.toContain('alice');
    });

    it('preserves future schemaVersion > 1 without quarantine, sets isReadOnlyFutureVersion=true, and guards mutations', async () => {
      const hash = crypto.createHash('sha256').update('future-game').digest('hex');
      const mappingPath = path.join(mappingDir, `${hash}.json`);
      const futureContent = JSON.stringify({
        schemaVersion: 2,
        variables: [{ name: 'mp', offset: 8, dataType: 'int32' }],
      });
      const { mockFs, state } = createMockFs({
        [mappingPath]: futureContent,
      });

      const mgr = new SaveMappingManager('future-game', {
        customMappingDir: mappingDir,
        nowProvider: fixedNow,
        fs: mockFs,
      });

      expect(mgr.isReadOnlyFutureVersion).toBe(true);
      expect(mgr.mappings.schemaVersion).toBe(2);
      expect(() => mgr.save()).toThrow('SaveMappingManager: Cannot modify read-only future version');
      await expect(mgr.saveAsync()).rejects.toThrow('SaveMappingManager: Cannot modify read-only future version');
      expect(() => mgr.addMapping('', -1)).toThrow('SaveMappingManager: Cannot modify read-only future version');
      await expect(mgr.addMappingAsync('', -1)).rejects.toThrow('SaveMappingManager: Cannot modify read-only future version');
      expect(state.files.get(path.resolve(mappingPath))?.content).toBe(futureContent);

      // Reset on load() when file is downgraded or removed
      state.files.delete(path.resolve(mappingPath));
      mgr.load();
      expect(mgr.isReadOnlyFutureVersion).toBe(false);
    });
  });

  describe('save() sync atomic persistence & saveAsync() path-keyed mutex', () => {
    it('commits save() atomically via fsyncSync and resilientRenameSync', () => {
      const { mockFs } = createMockFs();
      const mgr = new SaveMappingManager('sync-save', {
        customMappingDir: mappingDir,
        nowProvider: fixedNow,
        fs: mockFs,
      });

      mgr.addMapping('coins', 16, 'uint32');

      expect(mockFs.openSync).toHaveBeenCalled();
      expect(mockFs.fsyncSync).toHaveBeenCalled();
      expect(mockFs.closeSync).toHaveBeenCalled();
      expect(mockFs.renameSync).toHaveBeenCalled();
    });

    it('serializes concurrent saveAsync() calls via path-keyed mutex and cleans up temp files on failure', async () => {
      const { mockFs, state } = createMockFs();
      const order: string[] = [];

      let callCount = 0;
      (mockFs.promises.open as ReturnType<typeof vi.fn>).mockImplementation(async (p: string) => {
        const idx = ++callCount;
        order.push(`open-${idx}`);
        let written = '';
        return {
          writeFile: vi.fn(async (data: string) => {
            written = data;
          }),
          sync: vi.fn(async () => {
            if (idx === 1) {
              await new Promise((r) => setTimeout(r, 20));
            }
          }),
          close: vi.fn(async () => {
            order.push(`close-${idx}`);
            state.files.set(path.resolve(p), { content: written, mode: 0o644 });
          }),
        };
      });

      const mgr = new SaveMappingManager('async-mutex', {
        customMappingDir: mappingDir,
        nowProvider: fixedNow,
        fs: mockFs,
      });

      await Promise.all([
        mgr.addMappingAsync('a', 1),
        mgr.addMappingAsync('b', 2),
      ]);

      // Strict serialization: 1 must close before 2 opens
      expect(order).toEqual(['open-1', 'close-1', 'open-2', 'close-2']);

      // Verify cleanup on rejection
      (mockFs.promises.rename as ReturnType<typeof vi.fn>).mockRejectedValueOnce(makeErrno('EIO'));
      await expect(mgr.saveAsync()).rejects.toThrow('EIO');
      expect(mockFs.promises.unlink).toHaveBeenCalled();
    });
  });

  describe('Phase 1 legacy migration & path traversal defense', () => {
    it('migrates valid legacy <gameId>.json, strips prototype-polluting keys, and renames legacy to .migrated', () => {
      const legacyPath = path.join(mappingDir, 'legacy-game.json');
      const rawLegacy =
        '{"variables":[{"name":"__proto__","offset":0,"dataType":"int32"},{"name":"constructor","offset":4},{"name":"hp","offset":12.8,"dataType":"UNKNOWN"},{"name":"mp","offset":-5,"dataType":"int32"}]}';

      const { mockFs, state } = createMockFs({
        [legacyPath]: rawLegacy,
      });

      const mgr = new SaveMappingManager('legacy-game', {
        customMappingDir: mappingDir,
        nowProvider: fixedNow,
        fs: mockFs,
      });

      expect(mgr.mappings).toEqual({
        schemaVersion: 1,
        variables: [{ name: 'hp', offset: 12, dataType: 'int32' }],
      });
      expect(state.files.has(path.resolve(mgr.mappingPath))).toBe(true);
      expect(state.files.has(path.resolve(`${legacyPath}.migrated`))).toBe(true);
      expect(state.files.has(path.resolve(legacyPath))).toBe(false);
    });

    it('preserves existing modern mapping file without overwriting during legacy migration', () => {
      const hash = crypto.createHash('sha256').update('dual-game').digest('hex');
      const modernPath = path.join(mappingDir, `${hash}.json`);
      const legacyPath = path.join(mappingDir, 'dual-game.json');

      const modernContent = JSON.stringify({
        schemaVersion: 1,
        variables: [{ name: 'modern_var', offset: 99, dataType: 'float32' }],
      });
      const legacyContent = JSON.stringify({
        variables: [{ name: 'old_var', offset: 1, dataType: 'int32' }],
      });

      const { mockFs, state } = createMockFs({
        [modernPath]: modernContent,
        [legacyPath]: legacyContent,
      });

      const mgr = new SaveMappingManager('dual-game', {
        customMappingDir: mappingDir,
        nowProvider: fixedNow,
        fs: mockFs,
      });

      expect(mgr.mappings.variables).toEqual([{ name: 'modern_var', offset: 99, dataType: 'float32' }]);
      expect(state.files.get(path.resolve(modernPath))?.content).toBe(modernContent);
      expect(state.files.has(path.resolve(`${legacyPath}.migrated`))).toBe(true);
    });

    it('bypasses legacy probing for ../traversal, CON, and steam:12345 and writes safely to flat SHA-256 path', () => {
      for (const unsafeId of ['../traversal', 'CON', 'steam:12345']) {
        const { mockFs } = createMockFs();
        const mgr = new SaveMappingManager(unsafeId, {
          customMappingDir: mappingDir,
          nowProvider: fixedNow,
          fs: mockFs,
        });

        const rel = path.relative(mappingDir, mgr.mappingPath);
        expect(rel.startsWith('..')).toBe(false);
        expect(path.isAbsolute(rel)).toBe(false);
        expect(path.dirname(mgr.mappingPath)).toBe(mappingDir);

        // Should never probe legacy path for unsafe IDs
        const probedPaths = (mockFs.existsSync as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
        expect(probedPaths.some((p: string) => p.includes(unsafeId))).toBe(false);

        expect(() => mgr.addMapping('score', 42)).not.toThrow();
      }
    });
  });
});
