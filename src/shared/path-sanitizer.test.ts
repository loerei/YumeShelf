import { describe, it, expect } from 'vitest';
import { sanitizeUserPaths, sanitizeLoneSurrogates } from './path-sanitizer';

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
