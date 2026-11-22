import { describe, expect, it, vi } from 'vitest';
import {
  attachWindowNavigationGuard,
  isAllowedWindowNavigation,
} from './navigation-guard';

describe('navigation-guard (cross-platform window containment)', () => {
  describe('isAllowedWindowNavigation', () => {
    it('allows case-insensitive Windows file:// URLs and blocks sibling or traversal escapes on any host OS', () => {
      const opts = {
        allowedHtmlPath: 'D:\\Projects\\YumeShelf\\dist\\renderer\\save-editor.html',
        platform: 'win32' as const,
      };

      expect(
        isAllowedWindowNavigation(
          'file:///d:/projects/yumeshelf/dist/renderer/save-editor.html?gameKey=g1',
          opts
        )
      ).toBe(true);
      expect(
        isAllowedWindowNavigation(
          'file:///D:/PROJECTS/YUMESHELF/DIST/RENDERER/index.html#section',
          opts
        )
      ).toBe(true);
      expect(
        isAllowedWindowNavigation(
          'file:///D:/Projects/YumeShelf/dist/renderer-evil/save-editor.html',
          opts
        )
      ).toBe(false);
      expect(
        isAllowedWindowNavigation(
          'file:///D:/Projects/YumeShelf/dist/renderer/../renderer-evil/save-editor.html',
          opts
        )
      ).toBe(false);
      expect(
        isAllowedWindowNavigation(
          'file://evil.com/D:/Projects/YumeShelf/dist/renderer/save-editor.html',
          opts
        )
      ).toBe(false);
    });

    it('enforces case-sensitive containment on Linux', () => {
      const opts = {
        allowedHtmlPath: '/opt/YumeShelf/dist/renderer/index.html',
        platform: 'linux' as const,
      };

      expect(
        isAllowedWindowNavigation('file:///opt/YumeShelf/dist/renderer/save-editor.html', opts)
      ).toBe(true);
      expect(
        isAllowedWindowNavigation('file:///opt/yumeshelf/dist/renderer/save-editor.html', opts)
      ).toBe(false);
      expect(
        isAllowedWindowNavigation('file:///opt/YumeShelf/dist/renderer-evil/index.html', opts)
      ).toBe(false);
    });

    it('enforces case-insensitive containment on macOS', () => {
      const opts = {
        allowedHtmlPath: '/Applications/YumeShelf.app/Contents/Resources/dist/renderer/index.html',
        platform: 'darwin' as const,
      };

      expect(
        isAllowedWindowNavigation(
          'file:///applications/yumeshelf.app/contents/resources/dist/renderer/save-editor.html',
          opts
        )
      ).toBe(true);
      expect(
        isAllowedWindowNavigation(
          'file:///Applications/YumeShelf.app/Contents/Resources/dist/renderer-evil/index.html',
          opts
        )
      ).toBe(false);
    });

    it('allows matching devServerUrl origin and rejects other origins or malformed URLs', () => {
      const opts = {
        devServerUrl: 'http://localhost:5173',
        allowedHtmlPath: '/opt/YumeShelf/dist/renderer/index.html',
        platform: 'linux' as const,
      };

      expect(isAllowedWindowNavigation('http://localhost:5173/save-editor.html?k=1', opts)).toBe(true);
      expect(isAllowedWindowNavigation('http://localhost:5174/save-editor.html', opts)).toBe(false);
      expect(isAllowedWindowNavigation('https://example.com', opts)).toBe(false);
      expect(isAllowedWindowNavigation('not a valid url', opts)).toBe(false);
    });
  });

  describe('attachWindowNavigationGuard', () => {
    it('denies window.open, opens http/https externally, and guards will-navigate', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const openExternal = vi.fn();
      let openHandler: ((details: { url: string }) => { action: 'deny' | 'allow' }) | null = null;
      let willNavigate: ((event: { preventDefault: () => void }, url: string) => void) | null = null;

      attachWindowNavigationGuard(
        {
          setWindowOpenHandler: (cb) => {
            openHandler = cb;
          },
          on: (event, cb) => {
            if (event === 'will-navigate') willNavigate = cb;
          },
        },
        {
          devServerUrl: 'http://localhost:5173',
          allowedHtmlPath: 'D:\\Projects\\YumeShelf\\dist\\renderer\\index.html',
          platform: 'win32',
          shell: { openExternal },
          logTag: '[TestGuard]',
        }
      );

      expect(openHandler!({ url: 'https://example.com/docs' })).toEqual({ action: 'deny' });
      expect(openExternal).toHaveBeenCalledWith('https://example.com/docs');

      const okEvent = { preventDefault: vi.fn() };
      willNavigate!(okEvent, 'file:///d:/projects/yumeshelf/dist/renderer/index.html');
      expect(okEvent.preventDefault).not.toHaveBeenCalled();

      const extEvent = { preventDefault: vi.fn() };
      willNavigate!(extEvent, 'https://github.com/loerei/YumeShelf');
      expect(extEvent.preventDefault).toHaveBeenCalledTimes(1);
      expect(openExternal).toHaveBeenCalledWith('https://github.com/loerei/YumeShelf');

      const badEvent = { preventDefault: vi.fn() };
      willNavigate!(badEvent, 'file:///D:/Projects/YumeShelf/dist/renderer-evil/index.html');
      expect(badEvent.preventDefault).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalled();

      warnSpy.mockRestore();
    });
  });
});
