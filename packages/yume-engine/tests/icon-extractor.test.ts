/// <reference types="node" />
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractGameIcon,
  extractIcon,
  YumeEngine,
  DEFAULT_MAX_ARTWORK_SIZE,
  DEFAULT_MAX_RSRC_SIZE,
} from '../dist/index.js';
import type { ExtractedGameIcon, ExtractIconOptions } from '../dist/types.d.ts';
// @ts-ignore
import { SyntheticPEBuilder } from './fixtures/synthetic-pe-builder.ts';
// @ts-ignore
import { MockFileSystemProvider } from './fixtures/mock-fs-provider.ts';

function createMockPngBuffer(width = 256, height = 256): Buffer {
  const buf = Buffer.alloc(64);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8);
  buf.write('IHDR', 12, 'utf8');
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  buf.writeUInt8(8, 24);
  buf.writeUInt8(6, 25);
  return buf;
}

function createMockPeWithIcon(arch: 'x86' | 'x64' = 'x64'): Buffer {
  const builder = new SyntheticPEBuilder({ arch });
  const pngFrame = createMockPngBuffer(256, 256);
  builder.setIconFrames([
    {
      width: 256,
      height: 256,
      isPng: true,
      data: pngFrame,
    },
  ]);
  builder.setVersionInfo({
    ProductName: 'YumeTestGame',
    FileVersion: '1.0.0.0',
    FileDescription: 'Test PE Executable',
    CompanyName: 'YumeShelf',
  });
  return builder.build();
}

describe('Unified Headless Engine Facade Icon Extraction (@yumeshelf/engine)', () => {
  describe('Constants & Exports', () => {
    it('exports extractGameIcon, extractIcon, and canonical sizes', () => {
      assert.strictEqual(typeof extractGameIcon, 'function');
      assert.strictEqual(typeof extractIcon, 'function');
      assert.strictEqual(DEFAULT_MAX_ARTWORK_SIZE, 32 * 1024 * 1024);
      assert.strictEqual(DEFAULT_MAX_RSRC_SIZE, 32 * 1024 * 1024);
    });
  });

  describe('Priority 1: Local Artwork Candidates', () => {
    it('1. local artwork takes precedence over embedded PE .rsrc icon by default', async () => {
      const mockFs = new MockFileSystemProvider();
      const peBuf = createMockPeWithIcon();
      const localPng = createMockPngBuffer(128, 128);

      mockFs.writeFile('C:/Games/RPGGame/Game.exe', peBuf);
      mockFs.writeFile('C:/Games/RPGGame/icon.png', localPng);

      const result = await extractGameIcon('C:/Games/RPGGame/Game.exe', { fs: mockFs });
      assert.ok(result !== null);
      assert.strictEqual(result.source, 'local-image');
      assert.strictEqual(result.isPng, true);
      assert.strictEqual(result.mimeType, 'image/png');
      assert.strictEqual(result.format, 'png');
      assert.strictEqual(result.filePath?.replace(/\\/g, '/'), 'C:/Games/RPGGame/icon.png');
      assert.deepStrictEqual(result.buffer, localPng);
    });

    it('2. preferLocalArtwork: false bypasses local artwork and extracts embedded PE .rsrc icon', async () => {
      const mockFs = new MockFileSystemProvider();
      const peBuf = createMockPeWithIcon();
      const localPng = createMockPngBuffer(128, 128);

      mockFs.writeFile('C:/Games/RPGGame/Game.exe', peBuf);
      mockFs.writeFile('C:/Games/RPGGame/icon.png', localPng);

      const result = await extractGameIcon('C:/Games/RPGGame/Game.exe', {
        fs: mockFs,
        preferLocalArtwork: false,
      });

      assert.ok(result !== null);
      assert.strictEqual(result.source, 'pe-resource');
      assert.strictEqual(result.isPng, true);
      assert.strictEqual(result.mimeType, 'image/png');
      assert.strictEqual(result.format, 'png');
      assert.strictEqual(result.width, 256);
      assert.strictEqual(result.height, 256);
      assert.notDeepStrictEqual(result.buffer, localPng);
    });

    it('3. active SVG defense rejects malicious SVG artwork and falls through to PE icon', async () => {
      const mockFs = new MockFileSystemProvider();
      const peBuf = createMockPeWithIcon();
      const evilSvg = '<svg><script>alert("xss")</script></svg>';

      mockFs.writeFile('C:/Games/EvilGame/Game.exe', peBuf);
      mockFs.writeFile('C:/Games/EvilGame/icon.svg', evilSvg);

      const result = await extractGameIcon('C:/Games/EvilGame/Game.exe', { fs: mockFs });
      assert.ok(result !== null);
      // Malicious SVG must be rejected, falling through to PE icon
      assert.strictEqual(result.source, 'pe-resource');
      assert.strictEqual(result.isPng, true);
      assert.strictEqual(result.mimeType, 'image/png');
    });

    it('4. zero-byte artwork files are skipped and cleanly fall through to PE icon', async () => {
      const mockFs = new MockFileSystemProvider();
      const peBuf = createMockPeWithIcon();

      mockFs.writeFile('C:/Games/ZeroByte/Game.exe', peBuf);
      mockFs.writeFile('C:/Games/ZeroByte/icon.png', Buffer.alloc(0));

      const result = await extractGameIcon('C:/Games/ZeroByte/Game.exe', { fs: mockFs });
      assert.ok(result !== null);
      assert.strictEqual(result.source, 'pe-resource');
    });

    it('5. oversized artwork files exceeding maxArtworkSize are skipped and fall through to PE icon', async () => {
      const mockFs = new MockFileSystemProvider();
      const peBuf = createMockPeWithIcon();
      const bigArtwork = Buffer.alloc(2048);

      mockFs.writeFile('C:/Games/BigArt/Game.exe', peBuf);
      mockFs.writeFile('C:/Games/BigArt/icon.png', bigArtwork);

      const result = await extractGameIcon('C:/Games/BigArt/Game.exe', {
        fs: mockFs,
        maxArtworkSize: 1024,
      });

      assert.ok(result !== null);
      assert.strictEqual(result.source, 'pe-resource');
    });

    it('6. resolves Linux .desktop entry icon as fallback in Priority 1', async () => {
      const mockFs = new MockFileSystemProvider();
      const iconPng = createMockPngBuffer(64, 64);
      const gameDir = '/games/desktop-game';

      mockFs.writeFile(
        `${gameDir}/game.desktop`,
        '[Desktop Entry]\nType=Application\nName=DesktopGame\nIcon=assets/desktop_icon.png\n'
      );
      mockFs.writeFile(`${gameDir}/assets/desktop_icon.png`, iconPng);
      mockFs.writeFile(`${gameDir}/runner`, Buffer.from('#!/bin/sh\n'));

      const result = await extractGameIcon(`${gameDir}/runner`, {
        fs: mockFs,
        targetPlatform: 'linux',
      });

      assert.ok(result !== null);
      assert.strictEqual(result.source, 'desktop-entry');
      assert.strictEqual(result.isPng, true);
      assert.strictEqual(result.mimeType, 'image/png');
      assert.deepStrictEqual(result.buffer, iconPng);
    });
  });

  describe('Priority 2: Executable Binary Resources', () => {
    it('7. falls back to PE .rsrc icon when no local artwork exists', async () => {
      const mockFs = new MockFileSystemProvider();
      const peBuf = createMockPeWithIcon();

      mockFs.writeFile('C:/Games/StandaloneGame/Game.exe', peBuf);

      const result = await extractGameIcon('C:/Games/StandaloneGame/Game.exe', { fs: mockFs });
      assert.ok(result !== null);
      assert.strictEqual(result.source, 'pe-resource');
      assert.strictEqual(result.isPng, true);
      assert.strictEqual(result.mimeType, 'image/png');
      assert.strictEqual(result.width, 256);
      assert.strictEqual(result.height, 256);
    });

    it('8. macOS .app bundle icon resolution retains PNG format and MIME type', async () => {
      const mockFs = new MockFileSystemProvider();
      const appIconPng = createMockPngBuffer(512, 512);

      mockFs.writeFile(
        '/Applications/VisualNovel.app/Contents/Info.plist',
        '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>\n<key>CFBundleIconFile</key>\n<string>AppIcon.png</string>\n</dict>\n</plist>'
      );
      mockFs.writeFile('/Applications/VisualNovel.app/Contents/Resources/AppIcon.png', appIconPng);

      const result = await extractGameIcon('/Applications/VisualNovel.app', {
        fs: mockFs,
        targetPlatform: 'darwin',
      });

      assert.ok(result !== null);
      assert.strictEqual(result.source, 'app-bundle');
      assert.strictEqual(result.isPng, true);
      assert.strictEqual(result.mimeType, 'image/png');
      assert.strictEqual(result.format, 'png');
      assert.deepStrictEqual(result.buffer, appIconPng);
    });

    it('9. macOS .app bundle icon resolution retains ICNS format and MIME type', async () => {
      const mockFs = new MockFileSystemProvider();
      const appIconIcns = Buffer.from('icns\x00\x00\x00\x10mockicnsdata');

      mockFs.writeFile('/Applications/Adventure.app/Contents/Resources/icon.icns', appIconIcns);

      const result = await extractGameIcon('/Applications/Adventure.app', {
        fs: mockFs,
        targetPlatform: 'darwin',
      });

      assert.ok(result !== null);
      assert.strictEqual(result.source, 'app-bundle');
      assert.strictEqual(result.isPng, false);
      assert.strictEqual(result.mimeType, 'image/x-icns');
      assert.strictEqual(result.format, 'icns');
      assert.deepStrictEqual(result.buffer, appIconIcns);
    });

    it('10. returns null when neither local artwork nor binary icon is found', async () => {
      const mockFs = new MockFileSystemProvider();
      mockFs.writeFile('/games/unknown/binary', Buffer.from('non-executable-data'));

      const result = await extractGameIcon('/games/unknown/binary', {
        fs: mockFs,
        targetPlatform: 'linux',
      });
      assert.strictEqual(result, null);
    });
  });

  describe('Timeout, Signal & Exception Safety', () => {
    it('11. returns null when timeout expires without throwing unhandled rejection', async () => {
      const hangingFs: any = {
        open: () => new Promise(() => {}),
        readFile: () => new Promise(() => {}),
        stat: () => new Promise(() => {}),
        readdir: () => new Promise(() => {}),
        exists: () => new Promise(() => {}),
      };

      const result = await extractGameIcon('C:/Games/Hanging/Game.exe', {
        fs: hangingFs,
        timeoutMs: 15,
      });

      assert.strictEqual(result, null);
    });

    it('12. returns null immediately when signal is already aborted', async () => {
      const mockFs = new MockFileSystemProvider();
      const peBuf = createMockPeWithIcon();
      mockFs.writeFile('C:/Games/Aborted/Game.exe', peBuf);

      const controller = new AbortController();
      controller.abort();

      const result = await extractGameIcon('C:/Games/Aborted/Game.exe', {
        fs: mockFs,
        signal: controller.signal,
      });

      assert.strictEqual(result, null);
    });

    it('13. proceeds normally without premature timeout when timeoutMs is omitted', async () => {
      const mockFs = new MockFileSystemProvider();
      const peBuf = createMockPeWithIcon();
      mockFs.writeFile('C:/Games/NoTimeout/Game.exe', peBuf);

      const result = await extractGameIcon('C:/Games/NoTimeout/Game.exe', { fs: mockFs });
      assert.ok(result !== null);
      assert.strictEqual(result.source, 'pe-resource');
    });

    it('14. supports direct IFileSystem as options argument', async () => {
      const mockFs = new MockFileSystemProvider();
      const peBuf = createMockPeWithIcon();
      mockFs.writeFile('C:/Games/DirectFs/Game.exe', peBuf);

      const result = await extractGameIcon('C:/Games/DirectFs/Game.exe', mockFs);
      assert.ok(result !== null);
      assert.strictEqual(result.source, 'pe-resource');
    });

    it('15. catches internal filesystem errors and cleanly returns null', async () => {
      const errorFs: any = {
        open: async () => {
          throw new Error('Disk read failure');
        },
        readFile: async () => {
          throw new Error('Disk read failure');
        },
        stat: async () => {
          throw new Error('Disk read failure');
        },
        readdir: async () => {
          throw new Error('Disk read failure');
        },
        exists: async () => {
          throw new Error('Disk read failure');
        },
      };

      const result = await extractGameIcon('C:/Games/Error/Game.exe', { fs: errorFs });
      assert.strictEqual(result, null);
    });
  });

  describe('Facade Methods on YumeEngine', () => {
    it('16. exposes YumeEngine.extractIcon, YumeEngine.extractPeIcon, and YumeEngine.extractPeMetadata', async () => {
      assert.strictEqual(typeof YumeEngine.extractIcon, 'function');
      assert.strictEqual(typeof YumeEngine.extractPeIcon, 'function');
      assert.strictEqual(typeof YumeEngine.extractPeMetadata, 'function');

      const mockFs = new MockFileSystemProvider();
      const peBuf = createMockPeWithIcon();
      mockFs.writeFile('C:/Games/FacadeGame/Game.exe', peBuf);

      // YumeEngine.extractIcon
      const icon = await YumeEngine.extractIcon('C:/Games/FacadeGame/Game.exe', { fs: mockFs });
      assert.ok(icon !== null);
      assert.strictEqual(icon.source, 'pe-resource');

      // YumeEngine.extractPeIcon
      const peIcon = await YumeEngine.extractPeIcon('C:/Games/FacadeGame/Game.exe', { fs: mockFs });
      assert.ok(peIcon !== null);
      assert.strictEqual(peIcon.width, 256);

      // YumeEngine.extractPeMetadata
      const metadata = await YumeEngine.extractPeMetadata('C:/Games/FacadeGame/Game.exe', {
        fs: mockFs,
      });
      assert.ok(metadata !== null);
      assert.strictEqual(metadata.productName, 'YumeTestGame');
      assert.strictEqual(metadata.fileVersion, '1.0.0.0');
    });
  });
});
