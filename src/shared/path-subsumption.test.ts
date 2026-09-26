// @ts-ignore
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  type PlatformInput,
  normalizePlatformInput,
  resolvePlatform,
  normalizePathForPlatform,
  isSubsumedBy,
  subsumeLibraryPaths,
  getFolderBaseName,
  buildGameKey,
  reorderLibraryPathsWithSubsumption,
} from './path-subsumption';

declare const process: any;

describe('path-subsumption', () => {
  describe('normalizePlatformInput & resolvePlatform', () => {
    const originalPlatform = process.platform;

    afterEach(() => {
      vi.unstubAllGlobals();
      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
        configurable: true,
        writable: true,
      });
    });

    it('normalizes explicit PlatformInput correctly', () => {
      expect(normalizePlatformInput('windows')).toBe('win32');
      expect(normalizePlatformInput('win32')).toBe('win32');
      expect(normalizePlatformInput('macos')).toBe('darwin');
      expect(normalizePlatformInput('darwin')).toBe('darwin');
      expect(normalizePlatformInput('linux')).toBe('linux');
    });

    it('resolves explicit targetPlatform parameter', () => {
      expect(resolvePlatform('windows')).toBe('win32');
      expect(resolvePlatform('macos')).toBe('darwin');
      expect(resolvePlatform('linux')).toBe('linux');
      expect(resolvePlatform('win32')).toBe('win32');
      expect(resolvePlatform('darwin')).toBe('darwin');
    });

    it('falls back to process.platform when targetPlatform is undefined', () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        configurable: true,
        writable: true,
      });
      expect(resolvePlatform()).toBe('darwin');

      Object.defineProperty(process, 'platform', {
        value: 'linux',
        configurable: true,
        writable: true,
      });
      expect(resolvePlatform()).toBe('linux');

      Object.defineProperty(process, 'platform', {
        value: 'win32',
        configurable: true,
        writable: true,
      });
      expect(resolvePlatform()).toBe('win32');
    });

    it('falls back to navigator.userAgent when process is undefined', () => {
      vi.stubGlobal('process', undefined);

      vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' });
      expect(resolvePlatform()).toBe('darwin');

      vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' });
      expect(resolvePlatform()).toBe('linux');

      vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' });
      expect(resolvePlatform()).toBe('win32');
    });

    it('defaults to win32 when neither process nor navigator indicates otherwise', () => {
      vi.stubGlobal('process', undefined);
      vi.stubGlobal('navigator', undefined);
      expect(resolvePlatform()).toBe('win32');
    });
  });

  describe('normalizePathForPlatform', () => {
    it('rejects invalid types, empty, and whitespace-only inputs returning strictly ""', () => {
      expect(normalizePathForPlatform('')).toBe('');
      expect(normalizePathForPlatform('   ')).toBe('');
      expect(normalizePathForPlatform(null as any)).toBe('');
      expect(normalizePathForPlatform(undefined as any)).toBe('');
      expect(normalizePathForPlatform(123 as any)).toBe('');
    });

    it('rejects illegal control characters and null bytes returning strictly ""', () => {
      expect(normalizePathForPlatform('D:/Games/\0bad')).toBe('');
      expect(normalizePathForPlatform('D:/Games/\nbad')).toBe('');
      expect(normalizePathForPlatform('D:/Games/\rbad')).toBe('');
      expect(normalizePathForPlatform('/var/log/\0audit', 'linux')).toBe('');
      expect(normalizePathForPlatform('/var/log/\nline', 'linux')).toBe('');
    });

    it('converts backslashes to canonical forward slashes', () => {
      expect(normalizePathForPlatform('D:\\Games\\Visual Novel', 'win32')).toBe('d:/games/visual novel');
    });

    it('normalizes bare Windows drive inputs to append trailing root slash', () => {
      expect(normalizePathForPlatform('C:', 'win32')).toBe('c:/');
      expect(normalizePathForPlatform('d:', 'win32')).toBe('d:/');
      expect(normalizePathForPlatform('C:/', 'win32')).toBe('c:/');
      expect(normalizePathForPlatform('C:\\', 'win32')).toBe('c:/');
    });

    it('preserves POSIX root slash', () => {
      expect(normalizePathForPlatform('/', 'linux')).toBe('/');
      expect(normalizePathForPlatform('///', 'linux')).toBe('/');
      expect(normalizePathForPlatform('/home/user', 'linux')).toBe('/home/user');
    });

    it('strips trailing slashes from all non-root paths', () => {
      expect(normalizePathForPlatform('D:/Games/Sub/', 'win32')).toBe('d:/games/sub');
      expect(normalizePathForPlatform('/home/user/games/', 'linux')).toBe('/home/user/games');
      expect(normalizePathForPlatform('C:/', 'win32')).toBe('c:/');
      expect(normalizePathForPlatform('/', 'linux')).toBe('/');
    });

    it('resolves relative . and .. segments defensively using stack disallowing escaping above root', () => {
      expect(normalizePathForPlatform('D:/Games/./Sub/../VN', 'win32')).toBe('d:/games/vn');
      expect(normalizePathForPlatform('D:/Games/../../Windows/calc.exe', 'win32')).toBe('d:/windows/calc.exe');
      expect(normalizePathForPlatform('/home/user/../../var/log', 'linux')).toBe('/var/log');
      expect(normalizePathForPlatform('C:/..', 'win32')).toBe('c:/');
      expect(normalizePathForPlatform('/..', 'linux')).toBe('/');
      expect(normalizePathForPlatform('..', 'win32')).toBe('');
      expect(normalizePathForPlatform('../..', 'win32')).toBe('');
    });

    it('removes duplicate slashes', () => {
      expect(normalizePathForPlatform('D://Games///Visual Novel////', 'win32')).toBe('d:/games/visual novel');
      expect(normalizePathForPlatform('///var///log///', 'linux')).toBe('/var/log');
    });

    it('applies lowercase normalization on Windows and macOS while preserving case on Linux', () => {
      expect(normalizePathForPlatform('C:/Games/VisualNovel', 'win32')).toBe('c:/games/visualnovel');
      expect(normalizePathForPlatform('C:/Games/VisualNovel', 'windows')).toBe('c:/games/visualnovel');
      expect(normalizePathForPlatform('/Applications/VisualNovel', 'darwin')).toBe('/applications/visualnovel');
      expect(normalizePathForPlatform('/Applications/VisualNovel', 'macos')).toBe('/applications/visualnovel');
      expect(normalizePathForPlatform('/Home/User/Games', 'linux')).toBe('/Home/User/Games');
    });
  });

  describe('isSubsumedBy', () => {
    it('subsumes on Windows with separator and case variations', () => {
      expect(isSubsumedBy('D:\\Games\\Visual Novel', 'D:/Games', 'win32')).toBe(true);
      expect(isSubsumedBy('d:/games/sub', 'D:\\GAMES', 'win32')).toBe(true);
      expect(isSubsumedBy('D:/Games', 'D:/Games', 'win32')).toBe(true);
    });

    it('enforces boundary delimiter: rejects partial directory prefix matches (/Games vs /Games2)', () => {
      expect(isSubsumedBy('/Games2', '/Games', 'linux')).toBe(false);
      expect(isSubsumedBy('D:/Games2', 'D:/Games', 'win32')).toBe(false);
      expect(isSubsumedBy('/Games-Copy', '/Games', 'darwin')).toBe(false);
    });

    it('authorizes children under root drives and trailing-slash paths', () => {
      expect(isSubsumedBy('C:', 'C:/', 'win32')).toBe(true);
      expect(isSubsumedBy('C:/game.exe', 'C:', 'win32')).toBe(true);
      expect(isSubsumedBy('C:/game.exe', 'C:/', 'win32')).toBe(true);
      expect(isSubsumedBy('D:/Games/Sub', 'D:/Games/', 'win32')).toBe(true);
      expect(isSubsumedBy('/games/sub', '/', 'linux')).toBe(true);
      expect(isSubsumedBy('/', '/', 'linux')).toBe(true);
    });

    it('returns strictly false if either input is empty or whitespace-only', () => {
      expect(isSubsumedBy('/any/path', '', 'linux')).toBe(false);
      expect(isSubsumedBy('', '/any/path', 'linux')).toBe(false);
      expect(isSubsumedBy('', '', 'linux')).toBe(false);
      expect(isSubsumedBy('/any/path', '   ', 'win32')).toBe(false);
      expect(isSubsumedBy('   ', '/any/path', 'win32')).toBe(false);
      expect(isSubsumedBy('/any/path', null as any, 'darwin')).toBe(false);
      expect(isSubsumedBy(undefined as any, '/any/path', 'darwin')).toBe(false);
    });

    it('normalizes relative traversal sequences and rejects escaping children', () => {
      expect(isSubsumedBy('D:/Games/../../Windows/calc.exe', 'D:/Games', 'win32')).toBe(false);
      expect(isSubsumedBy('/home/user/../../etc/passwd', '/home/user', 'linux')).toBe(false);
    });

    it('enforces case insensitivity on Windows/macOS and case sensitivity on Linux', () => {
      expect(isSubsumedBy('C:/GAMES/SUB', 'c:/games', 'win32')).toBe(true);
      expect(isSubsumedBy('/Users/Dev/Games', '/users/dev', 'darwin')).toBe(true);
      expect(isSubsumedBy('/home/user/Games', '/home/user/games', 'linux')).toBe(false);
      expect(isSubsumedBy('/home/user/Games', '/home/user/Games', 'linux')).toBe(true);
    });
  });

  describe('subsumeLibraryPaths', () => {
    it('sanitizes empty, non-string, and whitespace-only elements', () => {
      const result = subsumeLibraryPaths(['', '   ', null as any, 'D:/Games', undefined as any], 'win32');
      expect(result).toEqual(['D:/Games']);
    });

    it('absorbs child paths across both standard and inverted input sequence orderings', () => {
      expect(subsumeLibraryPaths(['D:/Games', 'D:/Games/VN'], 'win32')).toEqual(['D:/Games']);
      expect(subsumeLibraryPaths(['D:/Games/VN', 'D:/Games'], 'win32')).toEqual(['D:/Games']);
      expect(subsumeLibraryPaths(['/a/b/c', '/a/b', '/a'], 'linux')).toEqual(['/a']);
      expect(subsumeLibraryPaths(['/a', '/a/b', '/a/b/c'], 'linux')).toEqual(['/a']);
    });

    it('preserves roots against case and trailing-slash variants without mutual elimination', () => {
      expect(subsumeLibraryPaths(['D:/Games', 'd:/games', 'D:/Games/'], 'win32')).toEqual(['D:/Games']);
      expect(subsumeLibraryPaths(['D:/Games/', 'd:/games', 'D:/Games'], 'windows')).toEqual(['D:/Games/']);
    });

    it('preserves distinct roots in relative order', () => {
      const paths = ['D:/Games/VN', 'E:/VisualNovels', 'D:/Games', 'F:/Other/Sub', 'F:/Other'];
      expect(subsumeLibraryPaths(paths, 'win32')).toEqual(['E:/VisualNovels', 'D:/Games', 'F:/Other']);
    });
  });

  describe('getFolderBaseName', () => {
    it('extracts leaf folder name across Windows and POSIX path strings', () => {
      expect(getFolderBaseName('D:/Games/Visual Novel')).toBe('Visual Novel');
      expect(getFolderBaseName('D:\\Games\\Visual Novel')).toBe('Visual Novel');
      expect(getFolderBaseName('/home/user/games')).toBe('games');
      expect(getFolderBaseName('just-a-name')).toBe('just-a-name');
    });

    it('handles trailing slashes cleanly', () => {
      expect(getFolderBaseName('D:/Games/Sub/')).toBe('Sub');
      expect(getFolderBaseName('D:\\Games\\Sub\\\\')).toBe('Sub');
      expect(getFolderBaseName('/home/user/games/')).toBe('games');
    });

    it('handles root boundaries cleanly returning C: for C:/ and / for /', () => {
      expect(getFolderBaseName('C:/')).toBe('C:');
      expect(getFolderBaseName('C:')).toBe('C:');
      expect(getFolderBaseName('d:\\')).toBe('d:');
      expect(getFolderBaseName('/')).toBe('/');
      expect(getFolderBaseName('///')).toBe('/');
    });

    it('returns strictly "" for empty, non-string, or whitespace-only inputs', () => {
      expect(getFolderBaseName('')).toBe('');
      expect(getFolderBaseName('   ')).toBe('');
      expect(getFolderBaseName(null as any)).toBe('');
      expect(getFolderBaseName(undefined as any)).toBe('');
      expect(getFolderBaseName(123 as any)).toBe('');
    });
  });

  describe('buildGameKey', () => {
    it('1. nested Windows backslash subpaths preserve authentic casing', () => {
      expect(
        buildGameKey('D:\\Games', 'D:\\Games\\Visual Novels\\Steins Gate', 'win32')
      ).toBe('Visual Novels/Steins Gate');
    });

    it('2. case-insensitive root matching on Windows/macOS', () => {
      expect(
        buildGameKey('d:/games', 'D:/Games/Sub/My Game', 'win32')
      ).toBe('Sub/My Game');
      expect(
        buildGameKey('/users/dev/games', '/Users/Dev/Games/Sub/My Game', 'darwin')
      ).toBe('Sub/My Game');
    });

    it('3. identical library path and folder path fallback to getFolderBaseName across case- and slash-variant representations', () => {
      expect(buildGameKey('D:/Games', 'd:/games', 'win32')).toBe('games');
      expect(buildGameKey('D:/Games/', 'd:/games', 'win32')).toBe('games');
      expect(buildGameKey('D:\\Games\\', 'd:/games', 'win32')).toBe('games');
    });

    it('4. disjoint/uncontained folder path fallback to getFolderBaseName', () => {
      expect(buildGameKey('D:/Games', 'E:/Other/MyGame', 'win32')).toBe('MyGame');
      expect(buildGameKey('/home/user/games', '/var/data/mygame', 'linux')).toBe('mygame');
    });

    it('5. segment-safe relative subpath derivation with redundant slashes and trailing slashes', () => {
      expect(
        buildGameKey('D:/Games/', 'D://Games///SubFolder//MyGame///', 'win32')
      ).toBe('SubFolder/MyGame');
    });

    it('6. deterministic cross-platform execution on Linux CI via targetPlatform seam', () => {
      expect(
        buildGameKey('C:\\Games', 'C:\\Games\\Category\\Game1', 'win32')
      ).toBe('Category/Game1');
      expect(
        buildGameKey('C:\\Games', 'C:\\Games\\Category\\Game1', 'windows')
      ).toBe('Category/Game1');
    });

    it('7. POSIX relative key derivation on Linux', () => {
      expect(
        buildGameKey('/home/user/games', '/home/user/games/VN/Game1', 'linux')
      ).toBe('VN/Game1');
    });

    it('8. Windows bare drive root derivation without dropping top-level directory segments across win32 and windows platform inputs', () => {
      expect(buildGameKey('C:', 'C:/Games/Game1', 'win32')).toBe('Games/Game1');
      expect(buildGameKey('C:/', 'C:/Games/Game1', 'windows')).toBe('Games/Game1');
      expect(buildGameKey('d:', 'D:\\VisualNovels\\Fate', 'win32')).toBe('VisualNovels/Fate');
    });
  });

  describe('reorderLibraryPathsWithSubsumption', () => {
    it('clusters subsumed child paths immediately beneath their respective parent root', () => {
      const allConfigured = [
        'D:/Games/Sub',
        'E:/VisualNovels',
        'D:/Games',
        'E:/VisualNovels/TypeMoon',
      ];
      const reorderedRoots = ['E:/VisualNovels', 'D:/Games'];

      const result = reorderLibraryPathsWithSubsumption(allConfigured, reorderedRoots, 'win32');
      expect(result).toEqual([
        'E:/VisualNovels',
        'E:/VisualNovels/TypeMoon',
        'D:/Games',
        'D:/Games/Sub',
      ]);
    });

    it('skips alien/unmatched roots not present in allConfiguredPaths', () => {
      const allConfigured = ['D:/Games', 'D:/Games/Sub'];
      const reorderedRoots = ['Z:/AlienPath', 'D:/Games'];

      const result = reorderLibraryPathsWithSubsumption(allConfigured, reorderedRoots, 'win32');
      expect(result).toEqual(['D:/Games', 'D:/Games/Sub']);
    });

    it('skips already-emitted subsumed roots in reorderedRootPaths iteration', () => {
      const allConfigured = ['D:/Games', 'D:/Games/Sub'];
      const reorderedRoots = ['D:/Games', 'D:/Games/Sub'];

      const result = reorderLibraryPathsWithSubsumption(allConfigured, reorderedRoots, 'win32');
      expect(result).toEqual(['D:/Games', 'D:/Games/Sub']);
    });

    it('preserves authentic configured casing from allConfiguredPaths', () => {
      const allConfigured = ['d:\\GAMES', 'd:\\GAMES\\SubDir'];
      const reorderedRoots = ['D:/games'];

      const result = reorderLibraryPathsWithSubsumption(allConfigured, reorderedRoots, 'win32');
      expect(result).toEqual(['d:\\GAMES', 'd:\\GAMES\\SubDir']);
    });

    it('retains unmentioned and offline paths at the end guaranteeing bijective permutation', () => {
      const allConfigured = [
        'D:/Games',
        'F:/OfflineLibrary',
        'D:/Games/Sub',
        'G:/Unmentioned',
      ];
      const reorderedRoots = ['D:/Games'];

      const result = reorderLibraryPathsWithSubsumption(allConfigured, reorderedRoots, 'win32');
      expect(result).toEqual([
        'D:/Games',
        'D:/Games/Sub',
        'F:/OfflineLibrary',
        'G:/Unmentioned',
      ]);
    });
  });

  describe('folder alias lifecycle independence', () => {
    it('operates independently of folder alias presence without mutating alias dictionaries', () => {
      const folderAliases: Record<string, string> = Object.freeze({
        'd:/games/sub': 'My Custom Sub Name',
        'f:/disconnected': 'Offline Tombstone',
      });

      const paths = ['D:/Games', 'D:/Games/Sub'];
      const subsumed = subsumeLibraryPaths(paths, 'win32');
      expect(subsumed).toEqual(['D:/Games']);

      expect(isSubsumedBy('D:/Games/Sub', 'D:/Games', 'win32')).toBe(true);

      // Verify alias dictionary is completely unmodified and retains all entries
      expect(folderAliases['d:/games/sub']).toBe('My Custom Sub Name');
      expect(folderAliases['f:/disconnected']).toBe('Offline Tombstone');
    });
  });
});
