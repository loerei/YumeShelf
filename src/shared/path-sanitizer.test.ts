import { describe, it, expect, vi } from 'vitest';
import {
  sanitizeUserPaths,
  sanitizeLoneSurrogates,
  extractSanitizedCauseChain,
  registerGlobalErrorSanitizer,
} from './path-sanitizer';

describe('sanitizeUserPaths', () => {
  it('handles nullish, non-string, prototype-less, and throwing inputs safely', () => {
    expect(sanitizeUserPaths(null)).toBe('');
    expect(sanitizeUserPaths(undefined)).toBe('');
    expect(sanitizeUserPaths(12345)).toBe('12345');
    expect(sanitizeUserPaths(Object.create(null))).toBe('');
    const throwingObj = {
      toString() {
        throw new Error('boom');
      },
    };
    expect(sanitizeUserPaths(throwingObj)).toBe('');
  });

  it('redacts Windows, macOS, and Linux user directories', () => {
    expect(sanitizeUserPaths('C:\\Users\\alice\\Documents\\save.dat')).toBe(
      '<USER_DIR>\\Documents\\save.dat'
    );
    expect(sanitizeUserPaths('D:/Users/Alice Smith/AppData/Local/Game')).toBe(
      '<USER_DIR>/AppData/Local/Game'
    );
    expect(sanitizeUserPaths('C:\\Documents and Settings\\bob\\save')).toBe(
      '<USER_DIR>\\save'
    );
    expect(sanitizeUserPaths('/Users/alice/Library/Application Support/Game')).toBe(
      '<USER_DIR>/Library/Application Support/Game'
    );
    expect(sanitizeUserPaths('/users/alice/documents')).toBe('<USER_DIR>/documents');
    expect(sanitizeUserPaths('/home/alice/.local/share/game')).toBe(
      '<USER_DIR>/.local/share/game'
    );
  });

  it('redacts JSON-escaped paths and colon/comma/semicolon delimited error strings', () => {
    expect(sanitizeUserPaths('{"path":"C:\\\\Users\\\\alice\\\\save.json"}')).toBe(
      '{"path":"<USER_DIR>\\\\save.json"}'
    );
    expect(sanitizeUserPaths('EACCES: open /home/alice: permission denied')).toBe(
      'EACCES: open <USER_DIR>: permission denied'
    );
    expect(sanitizeUserPaths('Failed at /home/alice, retrying in 50ms')).toBe(
      'Failed at <USER_DIR>, retrying in 50ms'
    );
    expect(sanitizeUserPaths('Path=/Users/bob; status=ok')).toBe(
      'Path=<USER_DIR>; status=ok'
    );
  });
});

describe('sanitizeLoneSurrogates', () => {
  it('preserves BMP characters and valid surrogate pairs', () => {
    const valid = 'Hello 世界 🌸🚀';
    expect(sanitizeLoneSurrogates(valid)).toBe(valid);
    expect(() => encodeURIComponent(sanitizeLoneSurrogates(valid))).not.toThrow();
  });

  it('replaces lone high and low surrogates with U+FFFD so encodeURIComponent never throws', () => {
    const loneHigh = 'abc\uD800def';
    const loneLow = 'abc\uDC00def';
    const truncated = '🌸'.slice(0, 1);

    expect(sanitizeLoneSurrogates(loneHigh)).toBe('abc\uFFFDdef');
    expect(sanitizeLoneSurrogates(loneLow)).toBe('abc\uFFFDdef');
    expect(sanitizeLoneSurrogates(truncated)).toBe('\uFFFD');

    expect(() => encodeURIComponent(sanitizeLoneSurrogates(loneHigh))).not.toThrow();
    expect(() => encodeURIComponent(sanitizeLoneSurrogates(loneLow))).not.toThrow();
    expect(() => encodeURIComponent(sanitizeLoneSurrogates(truncated))).not.toThrow();
  });
});

describe('extractSanitizedCauseChain', () => {
  it('traverses nested causes up to maxDepth, stops on cycles, and handles null-prototype/symbol causes', () => {
    const root = new Error('fail C:\\Users\\alice\\db.json');
    const mid = new Error('mid /home/bob/app', { cause: root });
    const top = new Error('top', { cause: mid });
    const chain = extractSanitizedCauseChain(top);
    expect(chain).toHaveLength(3);
    expect(chain[2].message).toBe('fail <USER_DIR>\\db.json');
    expect(chain[1].message).toBe('mid <USER_DIR>/app');

    const cyclic: any = new Error('cycle C:\\Users\\alice\\x');
    cyclic.cause = cyclic;
    expect(extractSanitizedCauseChain(cyclic)).toHaveLength(1);

    const nullProtoErr = new Error('outer', { cause: Object.create(null) });
    expect(extractSanitizedCauseChain(nullProtoErr)).toEqual([
      expect.objectContaining({ message: 'outer' }),
      { message: 'Unknown error' },
    ]);

    const symErr = new Error('outer-sym', { cause: Symbol('secret') });
    expect(extractSanitizedCauseChain(symErr)).toEqual([
      expect.objectContaining({ message: 'outer-sym' }),
      { message: 'Symbol(secret)' },
    ]);
  });
});

describe('registerGlobalErrorSanitizer', () => {
  it('logs sanitized error and unhandledrejection events and detaches listeners on teardown', () => {
    const listeners = new Map<string, Set<(e: any) => void>>();
    const mockWin = {
      addEventListener: vi.fn((type: string, fn: (e: any) => void) => {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(fn);
      }),
      removeEventListener: vi.fn((type: string, fn: (e: any) => void) => {
        listeners.get(type)?.delete(fn);
      }),
    };
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const unregister = registerGlobalErrorSanitizer(mockWin, '[TestRenderer]');
    const causeErr = new Error('cause /Users/alice/secret.dat');
    const mainErr = new Error('crash C:\\Users\\alice\\game.exe', { cause: causeErr });

    for (const fn of listeners.get('error') ?? []) {
      fn({
        message: 'Uncaught at C:\\Users\\alice\\index.ts',
        filename: 'C:\\Users\\alice\\index.ts',
        lineno: 10,
        colno: 2,
        error: mainErr,
      });
    }
    for (const fn of listeners.get('unhandledrejection') ?? []) {
      fn({ reason: mainErr });
    }

    expect(errSpy).toHaveBeenCalledTimes(2);
    const serializedCalls = JSON.stringify(errSpy.mock.calls);
    expect(serializedCalls).not.toContain('alice');
    expect(serializedCalls).toContain('<USER_DIR>');

    unregister();
    expect(listeners.get('error')?.size).toBe(0);
    expect(listeners.get('unhandledrejection')?.size).toBe(0);
    errSpy.mockRestore();
  });
});
