/// <reference types="node" />
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  findLocalGameImage,
  findLocalGameImageSync,
  getImageMimeType,
  LOCAL_IMAGE_CANDIDATE_PATTERNS,
  LOCAL_IMAGE_EXTENSIONS,
  DEFAULT_MAX_ARTWORK_SIZE,
} from '../dist/index.js';
// @ts-ignore
import { MockFileSystemProvider } from './fixtures/mock-fs-provider.ts';

describe('Folder Artwork Search & Desktop Entry Fallback (@yumeshelf/engine)', () => {
  describe('Constants & Exports', () => {
    it('exports canonical constants and 6 candidate patterns (36 combinations)', () => {
      assert.strictEqual(DEFAULT_MAX_ARTWORK_SIZE, 32 * 1024 * 1024);
      assert.strictEqual(LOCAL_IMAGE_CANDIDATE_PATTERNS.length, 6);
      assert.strictEqual(LOCAL_IMAGE_EXTENSIONS.length, 6);
      assert.deepStrictEqual(LOCAL_IMAGE_EXTENSIONS, ['png', 'jpg', 'jpeg', 'webp', 'svg', 'ico']);

      // 6 patterns * 6 extensions = 36 total candidate combinations
      const dummyDir = '/games/dummy';
      const combinations: string[] = [];
      for (const pattern of LOCAL_IMAGE_CANDIDATE_PATTERNS) {
        for (const ext of LOCAL_IMAGE_EXTENSIONS) {
          combinations.push(pattern(dummyDir, ext));
        }
      }
      assert.strictEqual(combinations.length, 36);
    });
  });

  describe('getImageMimeType', () => {
    it('supports bare extensions, dotted extensions, and full file paths', () => {
      // Bare extensions
      assert.strictEqual(getImageMimeType('png'), 'image/png');
      assert.strictEqual(getImageMimeType('jpg'), 'image/jpeg');
      assert.strictEqual(getImageMimeType('jpeg'), 'image/jpeg');
      assert.strictEqual(getImageMimeType('webp'), 'image/webp');
      assert.strictEqual(getImageMimeType('svg'), 'image/svg+xml');
      assert.strictEqual(getImageMimeType('ico'), 'image/x-icon');

      // Dotted extensions
      assert.strictEqual(getImageMimeType('.png'), 'image/png');
      assert.strictEqual(getImageMimeType('.jpg'), 'image/jpeg');
      assert.strictEqual(getImageMimeType('.jpeg'), 'image/jpeg');
      assert.strictEqual(getImageMimeType('.webp'), 'image/webp');
      assert.strictEqual(getImageMimeType('.svg'), 'image/svg+xml');
      assert.strictEqual(getImageMimeType('.ico'), 'image/x-icon');

      // Full file paths
      assert.strictEqual(getImageMimeType('/home/user/games/icon.png'), 'image/png');
      assert.strictEqual(getImageMimeType('C:\\Games\\cover.JPEG'), 'image/jpeg');
      assert.strictEqual(getImageMimeType('relative/path/folder.svg'), 'image/svg+xml');
      assert.strictEqual(getImageMimeType('/games/game/icon/icon.ico'), 'image/x-icon');
      assert.strictEqual(getImageMimeType('banner.WEBP'), 'image/webp');

      // Fallback / invalid inputs
      assert.strictEqual(getImageMimeType('unknown.ext'), 'image/png');
      assert.strictEqual(getImageMimeType(''), 'image/png');
      assert.strictEqual(getImageMimeType(null as any), 'image/png');
      assert.strictEqual(getImageMimeType(undefined as any), 'image/png');
    });
  });

  describe('findLocalGameImage & Pattern Discovery', () => {
    it('1. discovers artwork across all 6 candidate pattern structures', async () => {
      const mockFs = new MockFileSystemProvider();
      const baseDir = '/games/MyGame';

      // Pattern 1: icon.ext
      mockFs.writeFile(path.join(baseDir, 'icon.png'), Buffer.alloc(100));
      const res1 = await findLocalGameImage(baseDir, { fs: mockFs });
      assert.strictEqual(res1?.imgPath, path.join(baseDir, 'icon.png'));
      assert.strictEqual(res1?.ext, 'png');
      assert.strictEqual(res1?.source, 'local-image');

      // Pattern 2: cover.ext
      const mockFs2 = new MockFileSystemProvider();
      mockFs2.writeFile(path.join(baseDir, 'cover.jpg'), Buffer.alloc(100));
      const res2 = await findLocalGameImage(baseDir, { fs: mockFs2 });
      assert.strictEqual(res2?.imgPath, path.join(baseDir, 'cover.jpg'));
      assert.strictEqual(res2?.ext, 'jpg');
      assert.strictEqual(res2?.source, 'local-image');

      // Pattern 3: folder.ext
      const mockFs3 = new MockFileSystemProvider();
      mockFs3.writeFile(path.join(baseDir, 'folder.webp'), Buffer.alloc(100));
      const res3 = await findLocalGameImage(baseDir, { fs: mockFs3 });
      assert.strictEqual(res3?.imgPath, path.join(baseDir, 'folder.webp'));
      assert.strictEqual(res3?.ext, 'webp');
      assert.strictEqual(res3?.source, 'local-image');

      // Pattern 4: icon/icon.ext
      const mockFs4 = new MockFileSystemProvider();
      mockFs4.writeFile(path.join(baseDir, 'icon', 'icon.ico'), Buffer.alloc(100));
      const res4 = await findLocalGameImage(baseDir, { fs: mockFs4 });
      assert.strictEqual(res4?.imgPath, path.join(baseDir, 'icon', 'icon.ico'));
      assert.strictEqual(res4?.ext, 'ico');
      assert.strictEqual(res4?.source, 'local-image');

      // Pattern 5: icon/cover.ext
      const mockFs5 = new MockFileSystemProvider();
      mockFs5.writeFile(path.join(baseDir, 'icon', 'cover.png'), Buffer.alloc(100));
      const res5 = await findLocalGameImage(baseDir, { fs: mockFs5 });
      assert.strictEqual(res5?.imgPath, path.join(baseDir, 'icon', 'cover.png'));
      assert.strictEqual(res5?.ext, 'png');
      assert.strictEqual(res5?.source, 'local-image');

      // Pattern 6: www/icon/icon.ext (RPG Maker style)
      const mockFs6 = new MockFileSystemProvider();
      mockFs6.writeFile(path.join(baseDir, 'www', 'icon', 'icon.png'), Buffer.alloc(100));
      const res6 = await findLocalGameImage(baseDir, { fs: mockFs6 });
      assert.strictEqual(res6?.imgPath, path.join(baseDir, 'www', 'icon', 'icon.png'));
      assert.strictEqual(res6?.ext, 'png');
      assert.strictEqual(res6?.source, 'local-image');
    });

    it('1b. respects pattern hierarchy (icon.* precedes cover.*, png precedes jpg)', async () => {
      const mockFs = new MockFileSystemProvider();
      const baseDir = '/games/HierarchyGame';

      // Both icon.jpg and icon.png exist -> icon.png wins (higher extension priority)
      mockFs.writeFile(path.join(baseDir, 'icon.jpg'), Buffer.alloc(100));
      mockFs.writeFile(path.join(baseDir, 'icon.png'), Buffer.alloc(100));
      const resExt = await findLocalGameImage(baseDir, { fs: mockFs });
      assert.strictEqual(resExt?.imgPath, path.join(baseDir, 'icon.png'));

      // Both cover.png and folder.png exist -> cover.png wins (higher pattern priority)
      const mockFsPattern = new MockFileSystemProvider();
      mockFsPattern.writeFile(path.join(baseDir, 'folder.png'), Buffer.alloc(100));
      mockFsPattern.writeFile(path.join(baseDir, 'cover.png'), Buffer.alloc(100));
      const resPattern = await findLocalGameImage(baseDir, { fs: mockFsPattern });
      assert.strictEqual(resPattern?.imgPath, path.join(baseDir, 'cover.png'));
    });

    it('2. candidate absence tolerance: missing files skipped cleanly without throwing ENOENT', async () => {
      const mockFs = new MockFileSystemProvider();
      const emptyDir = '/games/EmptyGame';

      const result = await findLocalGameImage(emptyDir, { fs: mockFs });
      assert.strictEqual(result, null);

      const nonExistentDir = '/games/DoesNotExist';
      const resNonExistent = await findLocalGameImage(nonExistentDir, { fs: mockFs });
      assert.strictEqual(resNonExistent, null);
    });

    it('3. pre-read file size check: rejects empty (0-byte) and oversized files', async () => {
      const mockFs = new MockFileSystemProvider();
      const baseDir = '/games/SizeTest';

      // icon.png is 0-byte (corrupt / empty), but cover.png is valid
      mockFs.writeFile(path.join(baseDir, 'icon.png'), Buffer.alloc(0));
      mockFs.writeFile(path.join(baseDir, 'cover.png'), Buffer.alloc(500));

      const resEmpty = await findLocalGameImage(baseDir, { fs: mockFs });
      assert.strictEqual(resEmpty?.imgPath, path.join(baseDir, 'cover.png'));

      // icon.png is oversized (> default 32MB), cover.png is valid
      const mockFsOver = new MockFileSystemProvider();
      mockFsOver.writeFile(path.join(baseDir, 'icon.png'), Buffer.alloc(35 * 1024 * 1024));
      mockFsOver.writeFile(path.join(baseDir, 'cover.png'), Buffer.alloc(1024));

      const resOversized = await findLocalGameImage(baseDir, { fs: mockFsOver });
      assert.strictEqual(resOversized?.imgPath, path.join(baseDir, 'cover.png'));

      // Custom maxArtworkSize capping
      const mockFsCustom = new MockFileSystemProvider();
      mockFsCustom.writeFile(path.join(baseDir, 'icon.png'), Buffer.alloc(2000));
      mockFsCustom.writeFile(path.join(baseDir, 'cover.png'), Buffer.alloc(500));

      const resCustom = await findLocalGameImage(baseDir, {
        fs: mockFsCustom,
        maxArtworkSize: 1000,
      });
      assert.strictEqual(resCustom?.imgPath, path.join(baseDir, 'cover.png'));
    });

    it('4. integrates with Active SVG Defense: rejects malicious SVG and accepts safe SVG', async () => {
      const mockFs = new MockFileSystemProvider();
      const baseDir = '/games/SvgTest';

      // icon.svg contains active script payload, cover.png is safe
      const maliciousSvg = '<svg><script>alert(1)</script></svg>';
      mockFs.writeFile(path.join(baseDir, 'icon.svg'), maliciousSvg);
      mockFs.writeFile(path.join(baseDir, 'cover.png'), Buffer.alloc(100));

      const resMalicious = await findLocalGameImage(baseDir, { fs: mockFs });
      assert.strictEqual(resMalicious?.imgPath, path.join(baseDir, 'cover.png'));
      assert.strictEqual(resMalicious?.ext, 'png');

      // Safe SVG
      const mockFsSafe = new MockFileSystemProvider();
      const safeSvg = '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="5" fill="red"/></svg>';
      mockFsSafe.writeFile(path.join(baseDir, 'icon.svg'), safeSvg);

      const resSafe = await findLocalGameImage(baseDir, { fs: mockFsSafe });
      assert.strictEqual(resSafe?.imgPath, path.join(baseDir, 'icon.svg'));
      assert.strictEqual(resSafe?.ext, 'svg');
      assert.strictEqual(resSafe?.source, 'local-image');
    });

    it('5. falls back to Linux .desktop entry icons when no folder candidate is found', async () => {
      const mockFs = new MockFileSystemProvider();
      const gameDir = '/games/DesktopGame';

      mockFs.writeFile(
        path.join(gameDir, 'game.desktop'),
        `[Desktop Entry]\nName=Desktop Game\nIcon=assets/desktop_icon.png\n`
      );
      mockFs.writeFile(path.join(gameDir, 'assets', 'desktop_icon.png'), Buffer.alloc(128));

      const res = await findLocalGameImage(gameDir, { fs: mockFs });
      assert.ok(res !== null);
      assert.ok(res.imgPath.endsWith('desktop_icon.png'));
      assert.strictEqual(res.ext, 'png');
      assert.strictEqual(res.source, 'desktop-entry');
    });

    it('5b. enforces SVG defense and size bounds on resolved .desktop entry icons', async () => {
      const mockFs = new MockFileSystemProvider();
      const gameDir = '/games/MaliciousDesktopGame';

      // Malicious desktop SVG
      mockFs.writeFile(
        path.join(gameDir, 'game.desktop'),
        `[Desktop Entry]\nName=Game\nIcon=assets/evil.svg\n`
      );
      mockFs.writeFile(
        path.join(gameDir, 'assets', 'evil.svg'),
        '<svg><foreignObject>evil</foreignObject></svg>'
      );

      const resMalicious = await findLocalGameImage(gameDir, { fs: mockFs });
      assert.strictEqual(resMalicious, null);

      // Oversized desktop icon
      const mockFsOver = new MockFileSystemProvider();
      mockFsOver.writeFile(
        path.join(gameDir, 'game.desktop'),
        `[Desktop Entry]\nName=Game\nIcon=assets/huge.png\n`
      );
      mockFsOver.writeFile(
        path.join(gameDir, 'assets', 'huge.png'),
        Buffer.alloc(40 * 1024 * 1024)
      );

      const resOver = await findLocalGameImage(gameDir, { fs: mockFsOver });
      assert.strictEqual(resOver, null);

      // 0-byte desktop icon
      const mockFsEmpty = new MockFileSystemProvider();
      mockFsEmpty.writeFile(
        path.join(gameDir, 'game.desktop'),
        `[Desktop Entry]\nName=Game\nIcon=assets/empty.png\n`
      );
      mockFsEmpty.writeFile(path.join(gameDir, 'assets', 'empty.png'), Buffer.alloc(0));

      const resEmpty = await findLocalGameImage(gameDir, { fs: mockFsEmpty });
      assert.strictEqual(resEmpty, null);
    });

    it('6. resolves containing directory from executable files and macOS .app bundles', async () => {
      const mockFs = new MockFileSystemProvider();
      const gameDir = '/games/BundleGame';

      // Executable file: /games/BundleGame/game.exe
      mockFs.writeFile(path.join(gameDir, 'game.exe'), Buffer.alloc(100));
      mockFs.writeFile(path.join(gameDir, 'icon.png'), Buffer.alloc(100));

      const resExe = await findLocalGameImage(path.join(gameDir, 'game.exe'), { fs: mockFs });
      assert.strictEqual(resExe?.imgPath, path.join(gameDir, 'icon.png'));

      // macOS .app bundle directory: /games/BundleGame/App.app
      const resApp = await findLocalGameImage(path.join(gameDir, 'App.app'), { fs: mockFs });
      assert.strictEqual(resApp?.imgPath, path.join(gameDir, 'icon.png'));
    });

    it('7. abort signal responsiveness: returns null immediately when signal.aborted is true', async () => {
      const mockFs = new MockFileSystemProvider();
      const baseDir = '/games/AbortGame';
      mockFs.writeFile(path.join(baseDir, 'icon.png'), Buffer.alloc(100));

      // Pre-aborted
      const controller = new AbortController();
      controller.abort();

      const res = await findLocalGameImage(baseDir, {
        fs: mockFs,
        signal: controller.signal,
      });
      assert.strictEqual(res, null);
    });

    it('returns null on invalid / empty target inputs', async () => {
      assert.strictEqual(await findLocalGameImage(''), null);
      assert.strictEqual(await findLocalGameImage(null as any), null);
      assert.strictEqual(await findLocalGameImage(undefined as any), null);
      assert.strictEqual(await findLocalGameImage(123 as any), null);
    });
  });

  describe('findLocalGameImageSync', () => {
    it('discovers artwork synchronously from filesystem and handles desktop fallback', () => {
      const tempDir = fsSync.mkdtempSync(path.join(os.tmpdir(), 'yume_artwork_sync_test_'));
      try {
        // 1. Initially empty -> null
        assert.strictEqual(findLocalGameImageSync(tempDir), null);

        // 2. Add icon.png -> found
        const iconPath = path.join(tempDir, 'icon.png');
        fsSync.writeFileSync(iconPath, Buffer.alloc(64));
        const resSync = findLocalGameImageSync(tempDir);
        assert.strictEqual(resSync?.imgPath, iconPath);
        assert.strictEqual(resSync?.ext, 'png');
        assert.strictEqual(resSync?.source, 'local-image');

        // 3. Executable path resolving parent dir
        const exePath = path.join(tempDir, 'game.exe');
        fsSync.writeFileSync(exePath, Buffer.alloc(10));
        const resFromExe = findLocalGameImageSync(exePath);
        assert.strictEqual(resFromExe?.imgPath, iconPath);

        // 4. Invalid input handling
        assert.strictEqual(findLocalGameImageSync(''), null);
        assert.strictEqual(findLocalGameImageSync(null as any), null);
      } finally {
        try {
          fsSync.rmSync(tempDir, { recursive: true, force: true });
        } catch {}
      }
    });

    it('validates SVG defense in synchronous variant', () => {
      const tempDir = fsSync.mkdtempSync(path.join(os.tmpdir(), 'yume_artwork_sync_svg_'));
      try {
        const svgPath = path.join(tempDir, 'icon.svg');
        fsSync.writeFileSync(svgPath, '<svg><script>alert(1)</script></svg>');

        // Malicious SVG ignored
        assert.strictEqual(findLocalGameImageSync(tempDir), null);

        // Safe SVG accepted
        fsSync.writeFileSync(svgPath, '<svg viewBox="0 0 10 10"><rect width="10" height="10"/></svg>');
        const resSafe = findLocalGameImageSync(tempDir);
        assert.strictEqual(resSafe?.imgPath, svgPath);
        assert.strictEqual(resSafe?.ext, 'svg');
      } finally {
        try {
          fsSync.rmSync(tempDir, { recursive: true, force: true });
        } catch {}
      }
    });
  });
});
