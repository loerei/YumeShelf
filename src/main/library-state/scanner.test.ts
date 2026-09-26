/// <reference types="node" />
// @ts-ignore
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  normalizeLibraryConfigShape,
  WRAPPER_DIRECTORY_NAMES,
  buildGameKey,
  getFolderBaseName,
  getLeafFolderName,
  isPlainObject,
  clampLibraryMaxDepth,
  type LibraryConfig,
} from './scanner';

describe('scanner & normalizeLibraryConfigShape (Ticket 01.4.1.1)', () => {
  let warnSpy: any;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  describe('exports and re-exports', () => {
    it('exports WRAPPER_DIRECTORY_NAMES set containing wrapper folders', () => {
      expect(WRAPPER_DIRECTORY_NAMES).toBeInstanceOf(Set);
      expect(WRAPPER_DIRECTORY_NAMES.has('app')).toBe(true);
      expect(WRAPPER_DIRECTORY_NAMES.has('bin')).toBe(true);
      expect(WRAPPER_DIRECTORY_NAMES.has('game')).toBe(true);
      expect(WRAPPER_DIRECTORY_NAMES.has('win64')).toBe(true);
      expect(WRAPPER_DIRECTORY_NAMES.has('linux64')).toBe(true);
      expect(WRAPPER_DIRECTORY_NAMES.has('x86_64')).toBe(true);
    });

    it('re-exports buildGameKey, getFolderBaseName, and getLeafFolderName matching pure-string signature', () => {
      expect(typeof buildGameKey).toBe('function');
      expect(typeof getFolderBaseName).toBe('function');
      expect(typeof getLeafFolderName).toBe('function');
      expect(getLeafFolderName).toBe(getFolderBaseName);

      expect(buildGameKey('D:/Games', 'D:/Games/Sub/Game1', 'win32')).toBe('Sub/Game1');
      expect(getFolderBaseName('D:/Games/Sub')).toBe('Sub');
      expect(getLeafFolderName('D:/Games/Sub/')).toBe('Sub');
    });
  });

  describe('normalizeLibraryConfigShape default shape & folderAliases guarantee', () => {
    it('guarantees folderAliases is {} when input is empty or omitted', () => {
      const config = normalizeLibraryConfigShape({});
      expect(config.folderAliases).toEqual({});
      expect(config.libraryPaths).toEqual([]);
      expect(config.libraryPath).toBe('');
      expect(config.maxDepth).toBe(5);
      expect(config.autoLaunch).toBe(false);
      expect(config.minimizeToTray).toBe(false);
      expect(config.titleDisplayMode).toBe('metadata');
    });

    it('guarantees folderAliases is {} when input config is null, undefined, or non-object', () => {
      expect(normalizeLibraryConfigShape(null).folderAliases).toEqual({});
      expect(normalizeLibraryConfigShape(undefined).folderAliases).toEqual({});
      expect(normalizeLibraryConfigShape('invalid').folderAliases).toEqual({});
      expect(normalizeLibraryConfigShape(123).folderAliases).toEqual({});
      expect(normalizeLibraryConfigShape([]).folderAliases).toEqual({});
    });

    it('guarantees folderAliases is {} when folderAliases in config is non-object', () => {
      expect(normalizeLibraryConfigShape({ folderAliases: null }).folderAliases).toEqual({});
      expect(normalizeLibraryConfigShape({ folderAliases: 'not-object' }).folderAliases).toEqual({});
      expect(normalizeLibraryConfigShape({ folderAliases: [] }).folderAliases).toEqual({});
      expect(normalizeLibraryConfigShape({ folderAliases: 123 }).folderAliases).toEqual({});
    });
  });

  describe('libraryPaths filtering & deduplication', () => {
    it('filters out canonical filesystem root paths unconditionally and logs structured warning', () => {
      const input = {
        libraryPaths: ['/', 'C:', 'C:/', 'c:\\', 'D:/Games', 'd:\\'],
      };
      const result = normalizeLibraryConfigShape(input, 'win32');
      expect(result.libraryPaths).toEqual(['D:/Games']);
      expect(warnSpy).toHaveBeenCalledWith(
        '[SECURITY][CONFIG] Blocked configuration of filesystem root as library path:',
        expect.objectContaining({ targetPath: expect.any(String) })
      );
    });

    it('filters out POSIX root / on Linux and logs structured warning', () => {
      const input = { libraryPaths: ['/', '/home/user/games'] };
      const result = normalizeLibraryConfigShape(input, 'linux');
      expect(result.libraryPaths).toEqual(['/home/user/games']);
      expect(warnSpy).toHaveBeenCalledWith(
        '[SECURITY][CONFIG] Blocked configuration of filesystem root as library path:',
        { targetPath: '/' }
      );
    });

    it('filters out paths containing illegal control characters or null bytes and logs warning', () => {
      const input = {
        libraryPaths: [
          'D:/Games\0Evil',
          'D:/Games\nLine',
          'D:/Games\rCarriage',
          'D:/Games/Valid',
          '',
          '   ',
          123 as any,
        ],
      };
      const result = normalizeLibraryConfigShape(input, 'win32');
      expect(result.libraryPaths).toEqual(['D:/Games/Valid']);
      expect(warnSpy).toHaveBeenCalledWith(
        '[SECURITY][CONFIG_PATH_INJECTION] Omitted invalid library path containing illegal characters:',
        expect.objectContaining({ path: expect.any(String) })
      );
    });

    it('deduplicates redundant libraryPaths using canonical Set while preserving authentic casing and path separators', () => {
      const input = {
        libraryPaths: [
          'D:\\Games\\Visual Novels\\',
          'd:/games/visual novels',
          'D:\\GAMES\\VISUAL NOVELS///',
          'E:/OtherGames/',
        ],
      };
      const result = normalizeLibraryConfigShape(input, 'win32');
      expect(result.libraryPaths).toEqual([
        'D:\\Games\\Visual Novels',
        'E:/OtherGames',
      ]);
      expect(result.libraryPath).toBe('D:\\Games\\Visual Novels');
    });

    it('falls back to singular libraryPath when libraryPaths is not provided', () => {
      const input = { libraryPath: 'D:\\MyGames\\' };
      const result = normalizeLibraryConfigShape(input, 'win32');
      expect(result.libraryPaths).toEqual(['D:\\MyGames']);
      expect(result.libraryPath).toBe('D:\\MyGames');
    });
  });

  describe('folderAliases prototype pollution sanitization', () => {
    it('rejects raw prototype pollution keys (__proto__, constructor, prototype)', () => {
      const rawObj = JSON.parse(
        '{"__proto__": {"polluted": true}, "constructor": "bad", "prototype": "bad", "D:/Games": "Normal"}'
      );
      const result = normalizeLibraryConfigShape({ folderAliases: rawObj }, 'win32');
      expect(result.folderAliases).toEqual({ 'd:/games': 'Normal' });
      expect((Object.prototype as any).polluted).toBeUndefined();
      expect(Object.prototype.hasOwnProperty.call(result.folderAliases, '__proto__')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(result.folderAliases, 'constructor')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(result.folderAliases, 'prototype')).toBe(false);
    });

    it('rejects relative/case-variant/trailing-slash prototype pollution bypasses (./__proto__, foo/../constructor, __PROTO__, prototype/)', () => {
      const input = {
        folderAliases: {
          './__proto__': 'bad',
          'foo/../constructor': 'bad',
          '__PROTO__': 'bad',
          'prototype/': 'bad',
          'D:/Games/VN': 'Visual Novels',
        },
      };
      const result = normalizeLibraryConfigShape(input, 'win32');
      expect(result.folderAliases).toEqual({ 'd:/games/vn': 'Visual Novels' });
      expect((Object.prototype as any).bad).toBeUndefined();
    });

    it('ignores non-own inherited Object properties', () => {
      const proto = { inheritedAlias: 'should-not-exist' };
      const aliasObj = Object.create(proto);
      aliasObj['D:/Games/Sub'] = 'Custom Sub';

      const result = normalizeLibraryConfigShape({ folderAliases: aliasObj }, 'win32');
      expect(result.folderAliases).toEqual({ 'd:/games/sub': 'Custom Sub' });
      expect(result.folderAliases?.['inheritedalias']).toBeUndefined();
    });
  });

  describe('folderAliases string value sanitization', () => {
    it('bounds alias values to a maximum of 255 characters', () => {
      const longName = 'A'.repeat(300);
      const input = {
        folderAliases: {
          'D:/Games/Sub': longName,
        },
      };
      const result = normalizeLibraryConfigShape(input, 'win32');
      expect(result.folderAliases?.['d:/games/sub']).toBe('A'.repeat(255));
    });

    it('strips non-printable and control characters [\\r\\n\\t\\x00-\\x1f] from alias values', () => {
      const input = {
        folderAliases: {
          'D:/Games/Sub': 'My\r\n\tSpecial\x00Name\x1f!',
        },
      };
      const result = normalizeLibraryConfigShape(input, 'win32');
      expect(result.folderAliases?.['d:/games/sub']).toBe('MySpecialName!');
    });

    it('prunes empty or whitespace-only alias values', () => {
      const input = {
        folderAliases: {
          'D:/Games/Empty': '',
          'D:/Games/Whitespace': '   ',
          'D:/Games/OnlyControl': '\r\n\t\x00',
          'D:/Games/Valid': 'Valid Folder',
        },
      };
      const result = normalizeLibraryConfigShape(input, 'win32');
      expect(result.folderAliases).toEqual({ 'd:/games/valid': 'Valid Folder' });
    });

    it('prunes invalid, empty, or control-character containing keys', () => {
      const input = {
        folderAliases: {
          '': 'Empty Key',
          '   ': 'Whitespace Key',
          'D:/Games/\0bad': 'Null Byte Key',
          'D:/Games/\nbad': 'Newline Key',
          'D:/Games/Valid': 'Valid Folder',
        },
      };
      const result = normalizeLibraryConfigShape(input, 'win32');
      expect(result.folderAliases).toEqual({ 'd:/games/valid': 'Valid Folder' });
    });

    it('defensively prunes non-string values without throwing TypeError', () => {
      const input = {
        folderAliases: {
          'D:/Games/Number': 12345 as any,
          'D:/Games/Boolean': true as any,
          'D:/Games/Null': null as any,
          'D:/Games/Object': { name: 'Nested' } as any,
          'D:/Games/Array': ['Bad'] as any,
          'D:/Games/Valid': 'Good',
        },
      };
      expect(() => {
        const result = normalizeLibraryConfigShape(input, 'win32');
        expect(result.folderAliases).toEqual({ 'd:/games/valid': 'Good' });
      }).not.toThrow();
    });

    it('canonically indexes keys via normalizePathForPlatform stripping non-root trailing slashes', () => {
      const input = {
        folderAliases: {
          'D:\\Games\\SubFolder\\': 'Sub Name',
          '/home/user/games/': 'User Games',
        },
      };
      const resultWin = normalizeLibraryConfigShape(input, 'win32');
      expect(resultWin.folderAliases?.['d:/games/subfolder']).toBe('Sub Name');

      const resultLinux = normalizeLibraryConfigShape(input, 'linux');
      expect(resultLinux.folderAliases?.['/home/user/games']).toBe('User Games');
    });
  });
});
