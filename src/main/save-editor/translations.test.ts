import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type * as fs from 'node:fs';
import * as path from 'node:path';

vi.mock('electron', () => ({
  app: undefined,
}));

import {
  createSaveEditorService,
  readTranslationsDisk,
  writeTranslationsDisk,
} from './index';

function makeErrno(code: string, message?: string): NodeJS.ErrnoException {
  const err = new Error(message ?? `${code}: error`) as NodeJS.ErrnoException;
  err.code = code;
  return err;
}

function createMockTranslationFs(initialFiles: Record<string, string> = {}) {
  const files = new Map<string, string>();
  const dirs = new Set<string>();

  for (const [k, v] of Object.entries(initialFiles)) {
    const norm = path.resolve(k);
    files.set(norm, v);
    dirs.add(path.dirname(norm));
  }

  const mkdir = vi.fn(async (p: string) => {
    dirs.add(path.resolve(p));
  });

  const access = vi.fn(async (p: string) => {
    const norm = path.resolve(p);
    if (!files.has(norm) && !dirs.has(norm)) throw makeErrno('ENOENT');
  });

  const readFile = vi.fn(async (p: string) => {
    const norm = path.resolve(p);
    if (!files.has(norm)) throw makeErrno('ENOENT', `ENOENT: ${norm}`);
    return files.get(norm)!;
  });

  const open = vi.fn(async (p: string, flags: string) => {
    const norm = path.resolve(p);
    let written = '';
    if (flags === 'r+' && !files.has(norm)) throw makeErrno('ENOENT');
    return {
      writeFile: vi.fn(async (data: string) => {
        written = data;
      }),
      sync: vi.fn(async () => {}),
      close: vi.fn(async () => {
        if (flags === 'w') {
          files.set(norm, written);
        }
      }),
    };
  });

  const rename = vi.fn(async (src: string, dest: string) => {
    const ns = path.resolve(src);
    const nd = path.resolve(dest);
    if (!files.has(ns)) throw makeErrno('ENOENT');
    const content = files.get(ns)!;
    files.delete(ns);
    files.set(nd, content);
  });

  const unlink = vi.fn(async (p: string) => {
    const norm = path.resolve(p);
    if (!files.has(norm)) throw makeErrno('ENOENT');
    files.delete(norm);
  });

  const stat = vi.fn(async (p: string) => {
    const norm = path.resolve(p);
    if (!files.has(norm)) throw makeErrno('ENOENT');
    return { isFile: () => true, mtimeMs: 0, mode: 0o644 };
  });

  const chmod = vi.fn(async () => {});
  const readdir = vi.fn(async (p: string) => {
    const norm = path.resolve(p);
    if (!dirs.has(norm)) throw makeErrno('ENOENT');
    return [...files.keys()]
      .filter((k) => path.dirname(k) === norm)
      .map((k) => path.basename(k));
  });

  const promises = {
    mkdir,
    access,
    readFile,
    open,
    rename,
    unlink,
    stat,
    chmod,
    readdir,
  } as unknown as typeof fs.promises;

  const fullFs = { promises } as unknown as typeof fs;

  return { files, dirs, promises, fullFs };
}

describe('SaveEditorService Translation Persistence', () => {
  const fixedNow = () => 1700000000000;
  const translationsDir = path.resolve('/mock-translations');

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('writeTranslationsDisk', () => {
    it('creates parent directories recursively, strips key===value entries, and accepts both node:fs and node:fs/promises', async () => {
      const { files, dirs, promises, fullFs } = createMockTranslationFs();
      const targetA = path.join('/nested/a', 'save_editor_translations_en.json');
      const targetB = path.join('/nested/b', 'save_editor_translations_ja.json');

      await writeTranslationsDisk(
        targetA,
        { HP: 'Health', Same: 'Same', MP: 'Mana' },
        { fsPromises: promises, nowProvider: fixedNow }
      );
      await writeTranslationsDisk(
        targetB,
        { Gold: 'お金' },
        { fsPromises: fullFs, nowProvider: fixedNow }
      );

      expect(dirs.has(path.resolve('/nested/a'))).toBe(true);
      expect(dirs.has(path.resolve('/nested/b'))).toBe(true);

      const parsedA = JSON.parse(files.get(path.resolve(targetA))!);
      expect(parsedA).toEqual({
        schemaVersion: 1,
        translations: { HP: 'Health', MP: 'Mana' },
      });
    });

    it('closes handle in inner finally and unlinks temp file in outer catch on sync/rename failure', async () => {
      const { files, promises } = createMockTranslationFs();
      const closeMock = vi.fn().mockResolvedValue(undefined);
      (promises.open as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        writeFile: vi.fn().mockResolvedValue(undefined),
        sync: vi.fn().mockRejectedValue(makeErrno('ENOSPC')),
        close: closeMock,
      });

      const target = path.join(translationsDir, 'save_editor_translations_en.json');
      await expect(
        writeTranslationsDisk(target, { a: 'b' }, { fsPromises: promises, nowProvider: fixedNow })
      ).rejects.toThrow('ENOSPC');

      expect(closeMock).toHaveBeenCalledTimes(1);
      expect(promises.unlink).toHaveBeenCalledTimes(1);
      expect([...files.keys()].some((k) => k.includes('.tmp.'))).toBe(false);
    });
  });

  describe('readTranslationsDisk', () => {
    it('returns empty on ENOENT silently, logs sanitized warning on EACCES, and quarantines SyntaxError/invalid root', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const missingPath = path.join(translationsDir, 'missing.json');
      const eaccesPath = path.join(translationsDir, 'locked.json');
      const corruptPath = path.join(translationsDir, 'corrupt.json');
      const arrayPath = path.join(translationsDir, 'array.json');

      const { files, promises } = createMockTranslationFs({
        [corruptPath]: '{ broken',
        [arrayPath]: '["not", "an", "object"]',
      });

      expect(await readTranslationsDisk(missingPath, 'en', { fsPromises: promises, nowProvider: fixedNow })).toEqual({
        translations: {},
        isFutureVersion: false,
      });
      expect(warnSpy).not.toHaveBeenCalled();

      (promises.readFile as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        makeErrno('EACCES', 'EACCES at C:\\Users\\alice\\locked.json')
      );
      expect(await readTranslationsDisk(eaccesPath, 'en', { fsPromises: promises, nowProvider: fixedNow })).toEqual({
        translations: {},
        isFutureVersion: false,
      });
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(warnSpy.mock.calls[0])).not.toContain('alice');

      expect(await readTranslationsDisk(corruptPath, 'en', { fsPromises: promises, nowProvider: fixedNow })).toEqual({
        translations: {},
        isFutureVersion: false,
      });
      expect(files.has(path.resolve(`${corruptPath}.corrupt.1700000000000`))).toBe(true);

      expect(await readTranslationsDisk(arrayPath, 'en', { fsPromises: promises, nowProvider: fixedNow })).toEqual({
        translations: {},
        isFutureVersion: false,
      });
      expect(files.has(path.resolve(`${arrayPath}.corrupt.1700000000000`))).toBe(true);
    });

    it('detects unversioned legacy dictionary with needsMigrationPersist=true and flags future schemaVersion > 1', async () => {
      const legacyPath = path.join(translationsDir, 'legacy.json');
      const futurePath = path.join(translationsDir, 'future.json');
      const { promises } = createMockTranslationFs({
        [legacyPath]: JSON.stringify({ HP: 'Health', Same: 'Same' }),
        [futurePath]: JSON.stringify({ schemaVersion: 2, translations: { HP: 'Health' } }),
      });

      const legacyRes = await readTranslationsDisk(legacyPath, 'en', { fsPromises: promises });
      expect(legacyRes).toEqual({
        translations: { HP: 'Health' },
        isFutureVersion: false,
        needsMigrationPersist: true,
      });

      const futureRes = await readTranslationsDisk(futurePath, 'en', { fsPromises: promises });
      expect(futureRes).toEqual({
        translations: {},
        isFutureVersion: true,
      });
    });
  });

  describe('createSaveEditorService translation lifecycle', () => {
    it('falls back to os.tmpdir() when app is unavailable and translationsDir is omitted, and handles startup sweep EACCES', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { promises } = createMockTranslationFs();
      (promises.readdir as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        makeErrno('EACCES', 'EACCES: C:\\Users\\alice\\tmp')
      );

      const service = createSaveEditorService({
        libraryState: { getGameRecord: vi.fn() },
        saveFolderResolver: { resolveSaveFolder: vi.fn() },
        fsPromises: promises,
        nowProvider: fixedNow,
      });

      await vi.waitFor(() => expect(warnSpy).toHaveBeenCalled());
      expect(JSON.stringify(warnSpy.mock.calls[0])).not.toContain('alice');
      expect(await service.loadTranslations('en')).toEqual({});
    });

    it('migrates legacy unversioned dictionary via non-reentrant write-back without deadlock and degrades gracefully on read-only FS', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const enPath = path.join(translationsDir, 'save_editor_translations_en.json');
      const { files, promises } = createMockTranslationFs({
        [enPath]: JSON.stringify({ Gold: 'Coins' }),
      });

      const service = createSaveEditorService({
        libraryState: { getGameRecord: vi.fn() },
        saveFolderResolver: { resolveSaveFolder: vi.fn() },
        translationsDir,
        fsPromises: promises,
        nowProvider: fixedNow,
      });

      const loaded = await service.loadTranslations('en');
      expect(loaded).toEqual({ Gold: 'Coins' });

      const persisted = JSON.parse(files.get(path.resolve(enPath))!);
      expect(persisted).toEqual({ schemaVersion: 1, translations: { Gold: 'Coins' } });

      // Non-fatal degradation when write-back fails (e.g., read-only filesystem)
      const roPath = path.join(translationsDir, 'save_editor_translations_fr.json');
      files.set(path.resolve(roPath), JSON.stringify({ Vie: 'Life' }));
      (promises.open as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        makeErrno('EROFS', 'EROFS at C:\\Users\\alice\\ro')
      );

      const roLoaded = await service.loadTranslations('fr');
      expect(roLoaded).toEqual({ Vie: 'Life' });
      expect(warnSpy).toHaveBeenCalled();
    });

    it('aborts saveTranslations with FUTURE_SCHEMA_VERSION on schemaVersion > 1 and serializes concurrent writes', async () => {
      const futurePath = path.join(translationsDir, 'save_editor_translations_de.json');
      const enPath = path.join(translationsDir, 'save_editor_translations_en.json');
      const { files, promises } = createMockTranslationFs({
        [futurePath]: JSON.stringify({ schemaVersion: 3, translations: { A: 'B' } }),
      });

      const service = createSaveEditorService({
        libraryState: { getGameRecord: vi.fn() },
        saveFolderResolver: { resolveSaveFolder: vi.fn() },
        translationsDir,
        fsPromises: promises,
        nowProvider: fixedNow,
      });

      const futureRes = await service.saveTranslations('de', { C: 'D' });
      expect(futureRes).toEqual({ ok: false, error: 'FUTURE_SCHEMA_VERSION' });

      // Concurrent writes serialize and merge cleanly
      await Promise.all([
        service.saveTranslations('en', { Key1: 'Val1' }),
        service.saveTranslations('en', { Key2: 'Val2' }),
      ]);

      const finalEn = JSON.parse(files.get(path.resolve(enPath))!);
      expect(finalEn).toEqual({
        schemaVersion: 1,
        translations: { Key1: 'Val1', Key2: 'Val2' },
      });
    });
  });
});
