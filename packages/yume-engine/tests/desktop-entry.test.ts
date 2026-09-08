/// <reference types="node" />
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  parseDesktopFileIcon,
  resolveDesktopIconPath,
  findDesktopEntryIcon,
  resolveDesktopIconPathSync,
  findDesktopEntryIconSync,
} from '../dist/index.js';
// @ts-ignore
import { MockFileSystemProvider } from './fixtures/mock-fs-provider.ts';

describe('Linux Desktop Entry Icon Resolution (@yumeshelf/engine)', () => {
  describe('parseDesktopFileIcon', () => {
    it('parses standard [Desktop Entry] Icon= field', () => {
      const content = `
[Desktop Entry]
Type=Application
Name=Super Game
Exec=supergame
Icon=supergame_icon
Categories=Game;
`;
      assert.strictEqual(parseDesktopFileIcon(content), 'supergame_icon');
    });

    it('handles case-insensitivity and whitespace around Icon key', () => {
      const content = `
[Desktop Entry]
type=Application
icon   =   game-custom-icon
`;
      assert.strictEqual(parseDesktopFileIcon(content), 'game-custom-icon');
    });

    it('strips quotes from Icon value', () => {
      const contentDouble = `[Desktop Entry]\nIcon="quoted-icon"`;
      assert.strictEqual(parseDesktopFileIcon(contentDouble), 'quoted-icon');

      const contentSingle = `[Desktop Entry]\nIcon='single-quoted-icon'`;
      assert.strictEqual(parseDesktopFileIcon(contentSingle), 'single-quoted-icon');
    });

    it('skips commented-out Icon lines', () => {
      const content = `
[Desktop Entry]
# Icon=old_commented_icon
#Icon=another_comment
Icon=real_icon
`;
      assert.strictEqual(parseDesktopFileIcon(content), 'real_icon');
    });

    it('stops at subsequent sections and does not leak actions into main icon', () => {
      const content = `
[Desktop Entry]
Name=Super Game
Exec=supergame

[Desktop Action Gallery]
Name=Open Gallery
Icon=gallery_icon
`;
      // No Icon in [Desktop Entry] section, but present in [Desktop Action Gallery]
      // Global fallback will find it if not in main section, but if main section had Icon, it takes precedence
      const contentWithBoth = `
[Desktop Entry]
Name=Super Game
Icon=main_icon

[Desktop Action Gallery]
Name=Open Gallery
Icon=gallery_icon
`;
      assert.strictEqual(parseDesktopFileIcon(contentWithBoth), 'main_icon');
    });

    it('returns null for empty, invalid, or missing Icon lines', () => {
      assert.strictEqual(parseDesktopFileIcon(''), null);
      assert.strictEqual(parseDesktopFileIcon(null as any), null);
      assert.strictEqual(parseDesktopFileIcon('[Desktop Entry]\nName=Game'), null);
      assert.strictEqual(parseDesktopFileIcon('[Desktop Entry]\nIcon='), null);
      assert.strictEqual(parseDesktopFileIcon('[Desktop Entry]\nIcon="  "'), null);
    });
  });

  describe('resolveDesktopIconPath & Containment Boundaries', () => {
    it('resolves relative icon path with explicit extension inside baseDir', async () => {
      const mockFs = new MockFileSystemProvider();
      mockFs.writeFile('/home/user/games/mygame/assets/icon.png', Buffer.alloc(16));

      const result = await resolveDesktopIconPath('assets/icon.png', '/home/user/games/mygame', { fs: mockFs });
      assert.strictEqual(result, '/home/user/games/mygame/assets/icon.png');
    });

    it('resolves relative icon path without extension matching allowed extensions (.png, .svg, .xpm)', async () => {
      const mockFs = new MockFileSystemProvider();
      mockFs.writeFile('/home/user/games/mygame/icon.svg', '<svg></svg>');

      const result = await resolveDesktopIconPath('icon', '/home/user/games/mygame', { fs: mockFs });
      assert.strictEqual(result, '/home/user/games/mygame/icon.svg');
    });

    it('enforces baseDir root containment and rejects traversal sequences (..)', async () => {
      const mockFs = new MockFileSystemProvider();
      mockFs.writeFile('/home/user/secret/leak.png', Buffer.alloc(16));

      // Attempt traversal out of baseDir
      const result = await resolveDesktopIconPath('../secret/leak.png', '/home/user/games/mygame', { fs: mockFs });
      assert.strictEqual(result, null);
    });

    it('allows absolute icon paths inside authorized roots (baseDir, XDG, system)', async () => {
      const mockFs = new MockFileSystemProvider();
      mockFs.setXdgDataHome('/home/user/.local/share');
      mockFs.setUserProfilePath('/home/user');

      // 1. Authorized inside baseDir
      mockFs.writeFile('/home/user/games/game/icon.png', Buffer.alloc(10));
      const baseResult = await resolveDesktopIconPath('/home/user/games/game/icon.png', '/home/user/games/game', mockFs);
      assert.strictEqual(baseResult, '/home/user/games/game/icon.png');

      // 2. Authorized inside $XDG_DATA_HOME/icons
      mockFs.writeFile('/home/user/.local/share/icons/hicolor/256x256/apps/game.png', Buffer.alloc(10));
      const xdgResult = await resolveDesktopIconPath('/home/user/.local/share/icons/hicolor/256x256/apps/game.png', undefined, mockFs);
      assert.strictEqual(xdgResult, '/home/user/.local/share/icons/hicolor/256x256/apps/game.png');

      // 3. Authorized inside /usr/share/icons
      mockFs.writeFile('/usr/share/icons/hicolor/128x128/apps/sys.png', Buffer.alloc(10));
      const usrIconsResult = await resolveDesktopIconPath('/usr/share/icons/hicolor/128x128/apps/sys.png', undefined, mockFs);
      assert.strictEqual(usrIconsResult, '/usr/share/icons/hicolor/128x128/apps/sys.png');

      // 4. Authorized inside /usr/share/pixmaps
      mockFs.writeFile('/usr/share/pixmaps/app.xpm', Buffer.alloc(10));
      const pixmapResult = await resolveDesktopIconPath('/usr/share/pixmaps/app.xpm', undefined, mockFs);
      assert.strictEqual(pixmapResult, '/usr/share/pixmaps/app.xpm');
    });

    it('safely rejects arbitrary system paths outside authorized boundaries (/etc/shadow)', async () => {
      const mockFs = new MockFileSystemProvider();
      mockFs.writeFile('/etc/shadow', 'root:passwordhash:::');
      mockFs.writeFile('/etc/passwd.png', Buffer.alloc(10));
      mockFs.writeFile('/var/log/syslog.png', Buffer.alloc(10));

      assert.strictEqual(await resolveDesktopIconPath('/etc/shadow', '/home/user/game', mockFs), null);
      assert.strictEqual(await resolveDesktopIconPath('/etc/passwd.png', '/home/user/game', mockFs), null);
      assert.strictEqual(await resolveDesktopIconPath('/var/log/syslog.png', undefined, mockFs), null);
    });

    it('rejects null bytes (%00, \\0) and control characters', async () => {
      const mockFs = new MockFileSystemProvider();
      mockFs.writeFile('/home/user/game/icon.png', Buffer.alloc(10));

      assert.strictEqual(await resolveDesktopIconPath('icon.png\0.exe', '/home/user/game', mockFs), null);
      assert.strictEqual(await resolveDesktopIconPath('icon%00.png', '/home/user/game', mockFs), null);
      assert.strictEqual(await resolveDesktopIconPath('icon\r\n.png', '/home/user/game', mockFs), null);
      assert.strictEqual(await resolveDesktopIconPath('\x1bicon.png', '/home/user/game', mockFs), null);
    });

    it('rejects non-image extensions (.exe, .txt, .desktop, .sh)', async () => {
      const mockFs = new MockFileSystemProvider();
      mockFs.writeFile('/home/user/game/script.sh', '#!/bin/sh');
      mockFs.writeFile('/home/user/game/binary.exe', Buffer.alloc(100));
      mockFs.writeFile('/home/user/game/notes.txt', 'notes');

      assert.strictEqual(await resolveDesktopIconPath('script.sh', '/home/user/game', mockFs), null);
      assert.strictEqual(await resolveDesktopIconPath('binary.exe', '/home/user/game', mockFs), null);
      assert.strictEqual(await resolveDesktopIconPath('notes.txt', '/home/user/game', mockFs), null);
    });

    it('resolves theme icon names across standard system directories', async () => {
      const mockFs = new MockFileSystemProvider();
      mockFs.setXdgDataHome('/home/user/.local/share');
      mockFs.setUserProfilePath('/home/user');
      mockFs.writeFile('/usr/share/icons/hicolor/256x256/apps/steam_icon_100.png', Buffer.alloc(10));

      const resolved = await resolveDesktopIconPath('steam_icon_100', undefined, mockFs);
      assert.strictEqual(resolved, '/usr/share/icons/hicolor/256x256/apps/steam_icon_100.png');
    });

    it('skips dependent directories when getXdgDataHome or getHomeDir returns empty string', async () => {
      const mockFs = new MockFileSystemProvider();
      mockFs.setXdgDataHome('');
      mockFs.setUserProfilePath('');
      mockFs.writeFile('/usr/share/pixmaps/game_pixmap.png', Buffer.alloc(10));

      // With empty home/xdg, only /usr/share/icons and /usr/share/pixmaps should be searched
      const resolved = await resolveDesktopIconPath('game_pixmap', undefined, mockFs);
      assert.strictEqual(resolved, '/usr/share/pixmaps/game_pixmap.png');
    });

    it('returns null when baseDir is omitted and iconVal is an explicit relative path with separators', async () => {
      const mockFs = new MockFileSystemProvider();
      mockFs.writeFile('/usr/share/pixmaps/subdir/game.png', Buffer.alloc(10));

      // Explicit relative path with slash cannot be resolved without baseDir
      const result = await resolveDesktopIconPath('subdir/game.png', undefined, mockFs);
      assert.strictEqual(result, null);
    });

    it('returns null immediately when signal is aborted', async () => {
      const mockFs = new MockFileSystemProvider();
      mockFs.writeFile('/home/user/game/icon.png', Buffer.alloc(10));

      const controller = new AbortController();
      controller.abort();

      const result = await resolveDesktopIconPath('icon.png', '/home/user/game', {
        fs: mockFs,
        signal: controller.signal,
      });
      assert.strictEqual(result, null);
    });
  });

  describe('findDesktopEntryIcon', () => {
    it('discovers icon from direct .desktop file path', async () => {
      const mockFs = new MockFileSystemProvider();
      mockFs.writeFile('/games/IndieGame/game.desktop', `[Desktop Entry]\nIcon=game_icon.png`);
      mockFs.writeFile('/games/IndieGame/game_icon.png', Buffer.alloc(10));

      const icon = await findDesktopEntryIcon('/games/IndieGame/game.desktop', mockFs);
      assert.strictEqual(icon, '/games/IndieGame/game_icon.png');
    });

    it('discovers icon from game directory containing a .desktop file', async () => {
      const mockFs = new MockFileSystemProvider();
      mockFs.writeFile('/games/IndieGame/play.desktop', `[Desktop Entry]\nIcon=assets/logo.svg`);
      mockFs.writeFile('/games/IndieGame/assets/logo.svg', '<svg></svg>');

      const icon = await findDesktopEntryIcon('/games/IndieGame', mockFs);
      assert.strictEqual(icon, '/games/IndieGame/assets/logo.svg');
    });

    it('discovers icon from game executable located in directory with .desktop file', async () => {
      const mockFs = new MockFileSystemProvider();
      mockFs.writeFile('/games/IndieGame/game.x86_64', Buffer.alloc(100));
      mockFs.writeFile('/games/IndieGame/app.desktop', `[Desktop Entry]\nIcon=icon`);
      mockFs.writeFile('/games/IndieGame/icon.png', Buffer.alloc(10));

      const icon = await findDesktopEntryIcon('/games/IndieGame/game.x86_64', mockFs);
      assert.strictEqual(icon, '/games/IndieGame/icon.png');
    });

    it('returns null when no .desktop file exists', async () => {
      const mockFs = new MockFileSystemProvider();
      mockFs.writeFile('/games/IndieGame/game.x86_64', Buffer.alloc(100));

      assert.strictEqual(await findDesktopEntryIcon('/games/IndieGame', mockFs), null);
      assert.strictEqual(await findDesktopEntryIcon('/games/NonExistent', mockFs), null);
    });

    it('returns null immediately when signal is aborted', async () => {
      const mockFs = new MockFileSystemProvider();
      mockFs.writeFile('/games/IndieGame/game.desktop', `[Desktop Entry]\nIcon=icon.png`);
      mockFs.writeFile('/games/IndieGame/icon.png', Buffer.alloc(10));

      const controller = new AbortController();
      controller.abort();

      const icon = await findDesktopEntryIcon('/games/IndieGame', {
        fs: mockFs,
        signal: controller.signal,
      });
      assert.strictEqual(icon, null);
    });
  });

  describe('Synchronous Variants (resolveDesktopIconPathSync, findDesktopEntryIconSync)', () => {
    it('resolves icon path synchronously and handles missing files with safe null fallback', () => {
      const tempDir = fsSync.mkdtempSync(path.join(os.tmpdir(), 'yumeshelf_desktop_test_'));
      const desktopFile = path.join(tempDir, 'test.desktop');
      const iconFile = path.join(tempDir, 'app_icon.png');

      try {
        fsSync.writeFileSync(desktopFile, `[Desktop Entry]\nIcon=app_icon.png\n`);
        fsSync.writeFileSync(iconFile, Buffer.alloc(32));

        // 1. resolveDesktopIconPathSync
        const resolved = resolveDesktopIconPathSync('app_icon.png', tempDir);
        assert.ok(resolved !== null);
        assert.ok(resolved.endsWith('app_icon.png'));

        // 2. findDesktopEntryIconSync with directory
        const fromDir = findDesktopEntryIconSync(tempDir);
        assert.ok(fromDir !== null);
        assert.ok(fromDir.endsWith('app_icon.png'));

        // 3. findDesktopEntryIconSync with direct file
        const fromFile = findDesktopEntryIconSync(desktopFile);
        assert.ok(fromFile !== null);
        assert.ok(fromFile.endsWith('app_icon.png'));

        // 4. Missing / non-existent checks
        assert.strictEqual(resolveDesktopIconPathSync('nonexistent.png', tempDir), null);
        assert.strictEqual(findDesktopEntryIconSync(path.join(tempDir, 'not_found')), null);

        // 5. Aborted signal returns null
        const controller = new AbortController();
        controller.abort();
        assert.strictEqual(resolveDesktopIconPathSync('app_icon.png', tempDir, { signal: controller.signal }), null);
        assert.strictEqual(findDesktopEntryIconSync(tempDir, { signal: controller.signal }), null);
      } finally {
        try {
          fsSync.rmSync(tempDir, { recursive: true, force: true });
        } catch {}
      }
    });
  });
});
