import { sanitizeUserPaths } from '../../shared/path-sanitizer';
import {
  fileUrlToPlatformPath,
  getParentDirForPlatform,
  isSubsumedBy,
  type PlatformInput,
} from '../../shared/path-subsumption';

export interface NavigationGuardWebContents {
  setWindowOpenHandler?: (
    handler: (details: { url: string }) => { action: 'deny' | 'allow' }
  ) => void;
  on?: (
    event: 'will-navigate',
    listener: (event: { preventDefault: () => void }, url: string) => void
  ) => unknown;
}

export interface NavigationGuardShell {
  openExternal: (url: string) => Promise<void> | void;
}

export interface WindowNavigationGuardOptions {
  devServerUrl?: string;
  allowedHtmlPath?: string;
  platform?: PlatformInput | NodeJS.Platform;
  shell?: NavigationGuardShell | null;
  logTag: string;
}

function toPlatformInput(platform?: PlatformInput | NodeJS.Platform): PlatformInput | undefined {
  if (!platform) return undefined;
  if (platform === 'win32' || platform === 'windows') return 'win32';
  if (platform === 'darwin' || platform === 'macos') return 'darwin';
  return 'linux';
}

/**
 * Pure predicate evaluating whether a navigation URL is contained within the allowed
 * dev server origin or the allowed production HTML directory for the target platform.
 */
export function isAllowedWindowNavigation(
  navigationUrl: string,
  options: Pick<WindowNavigationGuardOptions, 'devServerUrl' | 'allowedHtmlPath' | 'platform'>
): boolean {
  let parsed: URL;
  try {
    parsed = new URL(navigationUrl);
  } catch {
    return false;
  }

  if (options.devServerUrl) {
    try {
      const appOrigin = new URL(options.devServerUrl).origin;
      if (parsed.origin === appOrigin) {
        return true;
      }
    } catch {
      // Ignore malformed devServerUrl and continue to file:// check
    }
  }

  if (parsed.protocol === 'file:' && options.allowedHtmlPath) {
    const resolvedPlatform = toPlatformInput(options.platform);
    const targetPath = fileUrlToPlatformPath(parsed, resolvedPlatform);
    const allowedDir = getParentDirForPlatform(options.allowedHtmlPath, resolvedPlatform);
    if (targetPath && allowedDir && isSubsumedBy(targetPath, allowedDir, resolvedPlatform)) {
      return true;
    }
  }

  return false;
}

/**
 * Attaches setWindowOpenHandler and will-navigate containment guards to an Electron WebContents.
 * External http/https navigations are denied in-app and delegated to shell.openExternal.
 */
export function attachWindowNavigationGuard(
  webContents: NavigationGuardWebContents | null | undefined,
  options: WindowNavigationGuardOptions
): void {
  if (!webContents) return;

  let appOrigin: string | null = null;
  if (options.devServerUrl) {
    try {
      appOrigin = new URL(options.devServerUrl).origin;
    } catch {
      appOrigin = null;
    }
  }

  const resolvedPlatform = toPlatformInput(options.platform);
  const allowedDir = options.allowedHtmlPath
    ? getParentDirForPlatform(options.allowedHtmlPath, resolvedPlatform)
    : '';

  webContents.setWindowOpenHandler?.(({ url: targetUrl }) => {
    try {
      const parsed = new URL(targetUrl);
      if (['https:', 'http:'].includes(parsed.protocol)) {
        void options.shell?.openExternal(parsed.href);
      }
    } catch (err) {
      const sanitizedError = sanitizeUserPaths(err instanceof Error ? (err.stack || err.message) : String(err));
      console.warn(`${options.logTag} Blocked malformed window open URL:`, sanitizeUserPaths(targetUrl), sanitizedError);
    }
    return { action: 'deny' };
  });

  webContents.on?.('will-navigate', (event, navigationUrl) => {
    try {
      const parsed = new URL(navigationUrl);
      if (appOrigin && parsed.origin === appOrigin) {
        return;
      }
      if (parsed.protocol === 'file:' && allowedDir) {
        const targetPath = fileUrlToPlatformPath(parsed, resolvedPlatform);
        if (targetPath && isSubsumedBy(targetPath, allowedDir, resolvedPlatform)) {
          return;
        }
      }
      event.preventDefault();
      if (['https:', 'http:'].includes(parsed.protocol)) {
        void options.shell?.openExternal(parsed.href);
      } else {
        console.warn(`${options.logTag} Blocked unauthorized navigation:`, sanitizeUserPaths(navigationUrl));
      }
    } catch (err) {
      event.preventDefault();
      const sanitizedError = sanitizeUserPaths(err instanceof Error ? (err.stack || err.message) : String(err));
      console.warn(`${options.logTag} Blocked malformed navigation URL:`, sanitizeUserPaths(navigationUrl), sanitizedError);
    }
  });
}
