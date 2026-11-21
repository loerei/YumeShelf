import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type * as fs from 'node:fs';
import * as path from 'node:path';
import {
  ensureWritable,
  ensureWritableSync,
  syncSleep,
  resilientRename,
  resilientRenameSync,
  sweepOrphanedSaveTmpFiles,
} from './fs-utils';

function makeErrno(code: string, message?: string): NodeJS.ErrnoException {
  const err = new Error(message ?? `${code}: operation failed`) as NodeJS.ErrnoException;
  err.code = code;
  return err;
}

describe('fs-utils', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('ensureWritable & ensureWritableSync', () => {
    it('clears read-only attribute via chmod when write bits are missing (async)', async () => {
      const chmod = vi.fn().mockResolvedValue(undefined);
      const stat = vi.fn().mockResolvedValue({ mode: 0o444 });
      const mockPromises = { stat, chmod } as unknown as typeof fs.promises;

      await ensureWritable('C:\\Users\\alice\\save.dat', mockPromises);

      expect(stat).toHaveBeenCalledWith('C:\\Users\\alice\\save.dat');
      expect(chmod).toHaveBeenCalledWith('C:\\Users\\alice\\save.dat', 0o444 | 0o666);
    });

    it('does not call chmod when file already has write bits (async)', async () => {
      const chmod = vi.fn();
      const stat = vi.fn().mockResolvedValue({ mode: 0o644 });
      const mockPromises = { stat, chmod } as unknown as typeof fs.promises;

      await ensureWritable('/tmp/save.dat', mockPromises);

      expect(chmod).not.toHaveBeenCalled();
    });

    it('ignores ENOENT on stat (async & sync)', async () => {
      const stat = vi.fn().mockRejectedValue(makeErrno('ENOENT'));
      const chmod = vi.fn();
      await expect(
        ensureWritable('/missing', { stat, chmod } as unknown as typeof fs.promises)
      ).resolves.toBeUndefined();
      expect(chmod).not.toHaveBeenCalled();

      const statSync = vi.fn().mockImplementation(() => {
        throw makeErrno('ENOENT');
      });
      const chmodSync = vi.fn();
      expect(() =>
        ensureWritableSync('/missing', { statSync, chmodSync } as unknown as typeof fs)
      ).not.toThrow();
      expect(chmodSync).not.toHaveBeenCalled();
    });

    it('clears read-only attribute via chmodSync when write bits are missing (sync)', () => {
      const statSync = vi.fn().mockReturnValue({ mode: 0o444 });
      const chmodSync = vi.fn();
      const mockFs = { statSync, chmodSync } as unknown as typeof fs;

      ensureWritableSync('/tmp/readonly.json', mockFs);

      expect(chmodSync).toHaveBeenCalledWith('/tmp/readonly.json', 0o444 | 0o666);
    });
  });

  describe('syncSleep', () => {
    it('returns early for non-positive or non-finite values without calling Atomics.wait', () => {
      const waitSpy = vi.spyOn(Atomics, 'wait').mockReturnValue('timed-out');
      syncSleep(0);
      syncSleep(-10);
      syncSleep(Number.NaN);
      syncSleep(Number.POSITIVE_INFINITY);
      expect(waitSpy).not.toHaveBeenCalled();
    });

    it('delegates positive finite durations to Atomics.wait', () => {
      const waitSpy = vi.spyOn(Atomics, 'wait').mockReturnValue('timed-out');
      syncSleep(15);
      expect(waitSpy).toHaveBeenCalledTimes(1);
      expect(waitSpy.mock.calls[0][3]).toBe(15);
    });
  });

  describe('resilientRename (async)', () => {
    it('succeeds immediately when rename does not fail', async () => {
      const rename = vi.fn().mockResolvedValue(undefined);
      const mockFs = { promises: { rename } } as unknown as typeof fs;

      await resilientRename('/a.tmp', '/a.json', 5, 50, mockFs, () => 0);
      expect(rename).toHaveBeenCalledTimes(1);
      expect(rename).toHaveBeenCalledWith('/a.tmp', '/a.json');
    });

    it('retries on transient EBUSY/EACCES with exponential backoff and jitter', async () => {
      vi.useFakeTimers();
      let calls = 0;
      const rename = vi.fn().mockImplementation(async () => {
        calls++;
        if (calls < 3) {
          throw makeErrno(calls === 1 ? 'EBUSY' : 'EACCES');
        }
      });
      const mockFs = { promises: { rename } } as unknown as typeof fs;
      const jitterFn = vi.fn().mockReturnValue(5);

      const promise = resilientRename('/a.tmp', '/a.json', 5, 20, mockFs, jitterFn);

      await vi.advanceTimersByTimeAsync(25); // 20 + 5
      await vi.advanceTimersByTimeAsync(45); // 40 + 5
      await promise;

      expect(rename).toHaveBeenCalledTimes(3);
      expect(jitterFn).toHaveBeenCalledTimes(2);
    });

    it('clamps maxRetries=0 to 1 attempt and NaN to 5 attempts', async () => {
      vi.useFakeTimers();

      const renameZero = vi.fn().mockRejectedValue(makeErrno('EBUSY'));
      const mockFsZero = { promises: { rename: renameZero } } as unknown as typeof fs;
      await expect(resilientRename('/a.tmp', '/a.json', 0, 10, mockFsZero, () => 0)).rejects.toThrow();
      expect(renameZero).toHaveBeenCalledTimes(1);

      const renameNaN = vi.fn().mockRejectedValue(makeErrno('EBUSY'));
      const mockFsNaN = { promises: { rename: renameNaN } } as unknown as typeof fs;
      const pNaN = resilientRename('/a.tmp', '/a.json', Number.NaN, 10, mockFsNaN, () => 0);
      const caught = pNaN.catch((e) => e);
      await vi.runAllTimersAsync();
      const err = await caught;
      expect((err as NodeJS.ErrnoException).code).toBe('EBUSY');
      expect(renameNaN).toHaveBeenCalledTimes(5);
    });

    it('clears read-only destination on EPERM via chmod and replaces without exhausting retry budget', async () => {
      let destMode = 0o444;
      let attempts = 0;
      const rename = vi.fn().mockImplementation(async () => {
        attempts++;
        if ((destMode & 0o222) === 0) {
          throw makeErrno('EPERM', 'EPERM: operation not permitted');
        }
      });
      const stat = vi.fn().mockImplementation(async () => ({ mode: destMode }));
      const chmod = vi.fn().mockImplementation(async (_p: string, newMode: number) => {
        destMode = newMode;
      });
      const mockFs = { promises: { rename, stat, chmod } } as unknown as typeof fs;

      await resilientRename('/a.tmp', '/dest.json', 5, 10, mockFs, () => 0);

      expect(chmod).toHaveBeenCalledWith('/dest.json', 0o444 | 0o666);
      expect(attempts).toBe(2);
    });

    it('handles EXDEV with staging copy, ensureWritable on staging/dest/src, r+ open/sync/close, and source unlink', async () => {
      vi.useFakeTimers();
      let stagingMode = 0o444;
      let destMode = 0o444;
      let srcMode = 0o444;
      let destRenameCalls = 0;

      const handle = {
        sync: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      };

      const callOrder: string[] = [];
      const rename = vi.fn().mockImplementation(async (s: string, d: string) => {
        if (s === '/src/a.tmp') {
          throw makeErrno('EXDEV');
        }
        destRenameCalls++;
        if (destRenameCalls === 1) {
          throw makeErrno('EBUSY');
        }
        if ((destMode & 0o222) === 0) {
          throw makeErrno('EPERM');
        }
        callOrder.push(`rename:${d}`);
      });
      const copyFile = vi.fn().mockImplementation(async () => {
        callOrder.push('copyFile');
      });
      const stat = vi.fn().mockImplementation(async (p: string) => {
        if (p.includes('.tmp.')) return { mode: stagingMode };
        if (p === '/dest/a.json') return { mode: destMode };
        return { mode: srcMode };
      });
      const chmod = vi.fn().mockImplementation(async (p: string, mode: number) => {
        callOrder.push(`chmod:${p}`);
        if (p.includes('.tmp.')) stagingMode = mode;
        else if (p === '/dest/a.json') destMode = mode;
        else srcMode = mode;
      });
      const open = vi.fn().mockImplementation(async (p: string, flags: string) => {
        expect(flags).toBe('r+');
        expect((stagingMode & 0o222) !== 0).toBe(true);
        callOrder.push(`open:${p}`);
        return handle;
      });
      const unlink = vi.fn().mockImplementation(async (p: string) => {
        expect((srcMode & 0o222) !== 0).toBe(true);
        callOrder.push(`unlink:${p}`);
      });

      const mockFs = {
        promises: { rename, copyFile, stat, chmod, open, unlink },
      } as unknown as typeof fs;

      const p = resilientRename('/src/a.tmp', '/dest/a.json', 5, Number.NaN, mockFs, () => 0);
      await vi.runAllTimersAsync();
      await p;

      expect(handle.sync).toHaveBeenCalledTimes(1);
      expect(handle.close).toHaveBeenCalledTimes(1);
      expect(unlink).toHaveBeenCalledWith('/src/a.tmp');
      expect(destRenameCalls).toBe(3); // EBUSY (clamped >=1ms) -> EPERM (chmod dest) -> success
      expect(callOrder[0]).toBe('copyFile');
    });

    it('closes staging handle and unlinks staging file on EXDEV error recovery', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const handle = {
        sync: vi.fn().mockRejectedValue(new Error('EIO at C:\\Users\\bob\\disk')),
        close: vi.fn().mockResolvedValue(undefined),
      };
      const rename = vi.fn().mockRejectedValue(makeErrno('EXDEV'));
      const copyFile = vi.fn().mockResolvedValue(undefined);
      const stat = vi.fn().mockResolvedValue({ mode: 0o644 });
      const chmod = vi.fn();
      const open = vi.fn().mockResolvedValue(handle);
      const unlink = vi.fn().mockResolvedValue(undefined);

      const mockFs = {
        promises: { rename, copyFile, stat, chmod, open, unlink },
      } as unknown as typeof fs;

      await expect(
        resilientRename('/src/a.tmp', '/dest/a.json', 3, 10, mockFs, () => 0)
      ).rejects.toThrow('EIO');

      expect(handle.close).toHaveBeenCalledTimes(1);
      expect(unlink).toHaveBeenCalledTimes(1);
      expect(unlink.mock.calls[0][0]).toContain('/dest/a.json.tmp.');
      warnSpy.mockRestore();
    });
  });

  describe('resilientRenameSync', () => {
    it('retries with bounded syncSleepFn and enforces <= 75ms total stall budget', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const sleepCalls: number[] = [];
      const renameSync = vi.fn().mockImplementation(() => {
        throw makeErrno('EBUSY', 'EBUSY on C:\\Users\\alice\\save.json');
      });
      const mockFs = { renameSync } as unknown as typeof fs;

      expect(() =>
        resilientRenameSync(
          'C:\\Users\\alice\\a.tmp',
          'C:\\Users\\alice\\a.json',
          10, // clamped to 3
          100, // clamped to 25
          mockFs,
          (ms) => sleepCalls.push(ms)
        )
      ).toThrow('EBUSY');

      expect(renameSync).toHaveBeenCalledTimes(3);
      expect(sleepCalls).toEqual([25, 25]);
      expect(sleepCalls.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(75);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      const logged = JSON.stringify(warnSpy.mock.calls[0]);
      expect(logged).not.toContain('alice');
      expect(logged).toContain('<USER_DIR>');
    });

    it('clears read-only destination on EPERM via chmodSync without exhausting retry budget', () => {
      let destMode = 0o444;
      let attempts = 0;
      const renameSync = vi.fn().mockImplementation(() => {
        attempts++;
        if ((destMode & 0o222) === 0) {
          throw makeErrno('EPERM');
        }
      });
      const statSync = vi.fn().mockImplementation(() => ({ mode: destMode }));
      const chmodSync = vi.fn().mockImplementation((_p: string, m: number) => {
        destMode = m;
      });
      const mockFs = { renameSync, statSync, chmodSync } as unknown as typeof fs;

      resilientRenameSync('/a.tmp', '/dest.json', 3, 10, mockFs, () => {});
      expect(chmodSync).toHaveBeenCalledWith('/dest.json', 0o444 | 0o666);
      expect(attempts).toBe(2);
    });

    it('handles EXDEV synchronously with staging chmod, r+ openSync, fsyncSync, closeSync, and source unlink', () => {
      let stagingMode = 0o444;
      let destMode = 0o444;
      let srcMode = 0o444;
      let destRenameCalls = 0;

      const renameSync = vi.fn().mockImplementation((s: string) => {
        if (s === '/src/a.tmp') throw makeErrno('EXDEV');
        destRenameCalls++;
        if ((destMode & 0o222) === 0) throw makeErrno('EPERM');
      });
      const copyFileSync = vi.fn();
      const statSync = vi.fn().mockImplementation((p: string) => {
        if (p.includes('.tmp.')) return { mode: stagingMode };
        if (p === '/dest/a.json') return { mode: destMode };
        return { mode: srcMode };
      });
      const chmodSync = vi.fn().mockImplementation((p: string, m: number) => {
        if (p.includes('.tmp.')) stagingMode = m;
        else if (p === '/dest/a.json') destMode = m;
        else srcMode = m;
      });
      const openSync = vi.fn().mockImplementation((_p: string, flags: string) => {
        expect(flags).toBe('r+');
        expect((stagingMode & 0o222) !== 0).toBe(true);
        return 42;
      });
      const fsyncSync = vi.fn();
      const closeSync = vi.fn();
      const unlinkSync = vi.fn().mockImplementation(() => {
        expect((srcMode & 0o222) !== 0).toBe(true);
      });
      const existsSync = vi.fn().mockReturnValue(false);

      const mockFs = {
        renameSync,
        copyFileSync,
        statSync,
        chmodSync,
        openSync,
        fsyncSync,
        closeSync,
        unlinkSync,
        existsSync,
      } as unknown as typeof fs;

      resilientRenameSync('/src/a.tmp', '/dest/a.json', Number.NaN, -5, mockFs, () => {});

      expect(openSync).toHaveBeenCalledTimes(1);
      expect(fsyncSync).toHaveBeenCalledWith(42);
      expect(closeSync).toHaveBeenCalledWith(42);
      expect(unlinkSync).toHaveBeenCalledWith('/src/a.tmp');
      expect(destRenameCalls).toBe(2);
    });
  });

  describe('sweepOrphanedSaveTmpFiles', () => {
    it('resolves cleanly when saveDir does not exist (ENOENT)', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const readdir = vi.fn().mockRejectedValue(makeErrno('ENOENT'));
      const mockFs = { promises: { readdir } } as unknown as typeof fs;

      await expect(sweepOrphanedSaveTmpFiles('/missing/dir', 1000, Date.now, mockFs)).resolves.toBeUndefined();
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('unlinks expired .tmp. files, ignores fresh files, non-tmp files, directories, and concurrent ENOENT', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const nowMs = 1_700_000_000_000;
      const maxAge = 24 * 60 * 60 * 1000;

      const entries = [
        'save1.json.tmp.123',
        'save2.json.tmp.fresh',
        'save3.json',
        'dir.tmp.123',
        'vanished.tmp.999',
        'unlinked-race.tmp.888',
      ];
      const readdir = vi.fn().mockResolvedValue(entries);
      const stat = vi.fn().mockImplementation(async (p: string) => {
        const base = path.basename(p);
        if (base === 'save1.json.tmp.123') return { isFile: () => true, mtimeMs: nowMs - maxAge - 1000 };
        if (base === 'save2.json.tmp.fresh') return { isFile: () => true, mtimeMs: nowMs - 1000 };
        if (base === 'dir.tmp.123') return { isFile: () => false, mtimeMs: nowMs - maxAge - 1000 };
        if (base === 'vanished.tmp.999') throw makeErrno('ENOENT');
        if (base === 'unlinked-race.tmp.888') return { isFile: () => true, mtimeMs: nowMs - maxAge - 1000 };
        return { isFile: () => true, mtimeMs: 0 };
      });
      const unlink = vi.fn().mockImplementation(async (p: string) => {
        if (path.basename(p) === 'unlinked-race.tmp.888') {
          throw makeErrno('ENOENT');
        }
      });

      const mockFs = { promises: { readdir, stat, unlink } } as unknown as typeof fs;
      await sweepOrphanedSaveTmpFiles('/saves', maxAge, () => nowMs, mockFs);

      expect(unlink).toHaveBeenCalledTimes(2);
      expect(unlink).toHaveBeenCalledWith(path.join('/saves', 'save1.json.tmp.123'));
      expect(unlink).toHaveBeenCalledWith(path.join('/saves', 'unlinked-race.tmp.888'));
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('falls back to Date.now when now parameter is nullish', async () => {
      const readdir = vi.fn().mockResolvedValue(['old.tmp.1']);
      const stat = vi.fn().mockResolvedValue({ isFile: () => true, mtimeMs: 0 });
      const unlink = vi.fn().mockResolvedValue(undefined);
      const mockFs = { promises: { readdir, stat, unlink } } as unknown as typeof fs;

      await sweepOrphanedSaveTmpFiles('/saves', 1000, null as unknown as () => number, mockFs);
      expect(unlink).toHaveBeenCalledTimes(1);
    });
  });
});
