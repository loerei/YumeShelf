/// <reference types="node" />
/**
 * Linux Desktop Entry (.desktop) Icon Resolver
 *
 * Derived from XDG Desktop Entry Specification
 * FreeDesktop.org / YumeShelf Contributors
 */

import * as fsSync from 'node:fs';
import * as path from 'node:path';
import type { IFileSystem, IEnvironmentPaths } from '../types.js';
import { NodeFileSystemProvider } from '../fs/node-fs-provider.js';
import { StandardEnvironmentPaths } from '../fs/environment-paths.js';

export interface DesktopEntryOptions {
  fs?: IFileSystem;
  env?: IEnvironmentPaths;
  targetPlatform?: NodeJS.Platform;
  signal?: AbortSignal;
}

const ALLOWED_IMAGE_EXTENSIONS = new Set([
  '.png',
  '.svg',
  '.xpm',
  '.ico',
  '.webp',
  '.jpg',
  '.jpeg',
]);

const EXTENSION_PRIORITY = [
  '.png',
  '.svg',
  '.xpm',
  '.ico',
  '.webp',
  '.jpg',
  '.jpeg',
];

const ICON_LINE_REGEX = /^Icon\s*=\s*(.+)$/i;
const ICON_GLOBAL_REGEX = /^Icon\s*=\s*(.+)$/im;

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

function joinPosix(base: string, sub: string): string {
  const normBase = normalizePath(base);
  const normSub = normalizePath(sub);
  if (normBase.endsWith('/')) {
    return normBase + normSub;
  }
  return normBase + '/' + normSub;
}

function isAllowedImageExtension(filePath: string): boolean {
  const lastDot = filePath.lastIndexOf('.');
  if (lastDot === -1) return false;
  const ext = filePath.slice(lastDot).toLowerCase();
  return ALLOWED_IMAGE_EXTENSIONS.has(ext);
}

function isContainedIn(filePath: string, dir: string): boolean {
  if (!dir) return false;
  const normPath = normalizePath(filePath);
  const normDir = normalizePath(dir);
  const dirPrefix = normDir.endsWith('/') ? normDir : normDir + '/';
  return normPath === normDir || normPath.startsWith(dirPrefix);
}

function sanitizeIconVal(iconVal: string): string | null {
  if (!iconVal || typeof iconVal !== 'string') return null;
  const trimmed = iconVal.trim();
  if (!trimmed) return null;
  // Reject null bytes and URL-encoded null bytes (%00)
  if (trimmed.includes('\0') || /%00/i.test(trimmed)) return null;
  // Reject control characters
  if (/[\x00-\x1f\x7f]/.test(trimmed)) return null;
  // Reject directory traversal sequences (..)
  if (trimmed.includes('..')) return null;
  return trimmed;
}

function isCrossPlatformAbsolute(p: string): boolean {
  return path.isAbsolute(p) || path.posix.isAbsolute(p) || path.win32.isAbsolute(p);
}

function getAuthorizedRoots(baseDir: string | undefined, env: IEnvironmentPaths): string[] {
  const roots: string[] = [];
  if (baseDir) {
    roots.push(baseDir);
  }
  const xdgDataHome = env.getXdgDataHome?.() || '';
  if (xdgDataHome) {
    roots.push(joinPosix(xdgDataHome, 'icons'));
  }
  const home = env.getHomeDir?.() || '';
  if (home) {
    roots.push(joinPosix(home, '.local/share/icons'));
  }
  roots.push('/usr/share/icons', '/usr/share/pixmaps');
  return roots;
}

function getStandardSearchDirs(env: IEnvironmentPaths): string[] {
  const dirs: string[] = [];
  const xdgDataHome = env.getXdgDataHome?.() || '';
  if (xdgDataHome) {
    dirs.push(
      joinPosix(xdgDataHome, 'icons/hicolor/256x256/apps'),
      joinPosix(xdgDataHome, 'icons/hicolor/128x128/apps'),
      joinPosix(xdgDataHome, 'icons/hicolor/scalable/apps'),
      joinPosix(xdgDataHome, 'pixmaps')
    );
  }

  const home = env.getHomeDir?.() || '';
  if (home) {
    dirs.push(
      joinPosix(home, '.local/share/icons/hicolor/256x256/apps'),
      joinPosix(home, '.local/share/icons/hicolor/128x128/apps'),
      joinPosix(home, '.local/share/icons/hicolor/scalable/apps'),
      joinPosix(home, '.local/share/pixmaps')
    );
  }

  dirs.push(
    '/usr/share/icons/hicolor/256x256/apps',
    '/usr/share/icons/hicolor/128x128/apps',
    '/usr/share/icons/hicolor/scalable/apps',
    '/usr/share/pixmaps'
  );

  return dirs;
}

function normalizeOptions(options?: DesktopEntryOptions | IFileSystem): {
  fs: IFileSystem;
  env: IEnvironmentPaths;
  targetPlatform: NodeJS.Platform;
  signal?: AbortSignal;
} {
  const fs: IFileSystem =
    options && 'open' in options
      ? options
      : options?.fs ?? new NodeFileSystemProvider();

  const env: IEnvironmentPaths =
    options && 'getXdgDataHome' in options
      ? (options as unknown as IEnvironmentPaths)
      : options && !('open' in options) && options.env
        ? options.env
        : new StandardEnvironmentPaths();

  const targetPlatform: NodeJS.Platform =
    options && !('open' in options) && options.targetPlatform
      ? options.targetPlatform
      : process.platform;

  const signal: AbortSignal | undefined =
    options && !('open' in options) ? options.signal : undefined;

  return { fs, env, targetPlatform, signal };
}

function normalizeSyncOptions(options?: Omit<DesktopEntryOptions, 'fs'>): {
  env: IEnvironmentPaths;
  targetPlatform: NodeJS.Platform;
  signal?: AbortSignal;
} {
  const env: IEnvironmentPaths = options?.env ?? new StandardEnvironmentPaths();
  const targetPlatform: NodeJS.Platform = options?.targetPlatform ?? process.platform;
  const signal: AbortSignal | undefined = options?.signal;
  return { env, targetPlatform, signal };
}

/**
 * Parses the Icon= entry from a Linux .desktop file content.
 */
export function parseDesktopFileIcon(content: string): string | null {
  if (!content || typeof content !== 'string') {
    return null;
  }

  const lines = content.split(/\r?\n/);
  let inDesktopEntry = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) {
      continue;
    }
    if (trimmed === '[Desktop Entry]') {
      inDesktopEntry = true;
      continue;
    }
    if (trimmed.startsWith('[') && inDesktopEntry) {
      // Reached next group/section
      break;
    }
    if (inDesktopEntry) {
      const match = ICON_LINE_REGEX.exec(trimmed);
      if (match) {
        let val = match[1].trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1).trim();
        }
        return val || null;
      }
    }
  }

  // Fallback: search anywhere in file if no explicit [Desktop Entry] section was found
  const fallbackMatch = ICON_GLOBAL_REGEX.exec(content);
  if (fallbackMatch) {
    let val = fallbackMatch[1].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1).trim();
    }
    return val || null;
  }

  return null;
}

/**
 * Resolves an Icon entry value to an existing image file path.
 */
export async function resolveDesktopIconPath(
  iconVal: string,
  baseDir?: string,
  options?: DesktopEntryOptions | IFileSystem
): Promise<string | null> {
  const { fs, env, signal } = normalizeOptions(options);
  if (signal?.aborted) return null;

  const sanitized = sanitizeIconVal(iconVal);
  if (!sanitized) return null;

  const normalizedVal = normalizePath(sanitized);

  // 1. Absolute path check
  if (isCrossPlatformAbsolute(normalizedVal)) {
    const authorizedRoots = getAuthorizedRoots(baseDir, env);
    const isAuthorized = authorizedRoots.some((root) => isContainedIn(normalizedVal, root));
    if (!isAuthorized) return null;
    if (!isAllowedImageExtension(normalizedVal)) return null;

    if (signal?.aborted) return null;
    try {
      const stat = await fs.stat(normalizedVal);
      if (stat.isFile()) return normalizedVal;
    } catch {
      return null;
    }
    return null;
  }

  // 2. Relative path check against baseDir
  if (baseDir) {
    if (isAllowedImageExtension(sanitized)) {
      const cand = joinPosix(baseDir, sanitized);
      if (isContainedIn(cand, baseDir) && isAllowedImageExtension(cand)) {
        if (signal?.aborted) return null;
        try {
          const stat = await fs.stat(cand);
          if (stat.isFile()) return cand;
        } catch {}
      }
    }

    for (const ext of EXTENSION_PRIORITY) {
      const cand = joinPosix(baseDir, `${sanitized}${ext}`);
      if (isContainedIn(cand, baseDir)) {
        if (signal?.aborted) return null;
        try {
          const stat = await fs.stat(cand);
          if (stat.isFile()) return cand;
        } catch {}
      }
    }
  }

  // If explicit relative file path with separators wasn't found in baseDir, reject
  if (sanitized.includes('/') || sanitized.includes('\\')) {
    return null;
  }

  // 3. Theme icon name search across standard XDG / system icon directories
  const searchDirs = getStandardSearchDirs(env);
  for (const dir of searchDirs) {
    if (signal?.aborted) return null;

    if (isAllowedImageExtension(sanitized)) {
      const cand = joinPosix(dir, sanitized);
      try {
        const stat = await fs.stat(cand);
        if (stat.isFile()) return cand;
      } catch {}
    }

    for (const ext of EXTENSION_PRIORITY) {
      const cand = joinPosix(dir, `${sanitized}${ext}`);
      try {
        const stat = await fs.stat(cand);
        if (stat.isFile()) return cand;
      } catch {}
    }
  }

  return null;
}

/**
 * Searches a game directory or executable path for an associated .desktop file and resolves its icon.
 */
export async function findDesktopEntryIcon(
  gameDirOrFile: string,
  options?: DesktopEntryOptions | IFileSystem
): Promise<string | null> {
  const { fs, signal } = normalizeOptions(options);
  if (signal?.aborted) return null;
  if (!gameDirOrFile || typeof gameDirOrFile !== 'string') return null;

  try {
    let desktopFiles: string[] = [];
    const stat = await fs.stat(gameDirOrFile);

    if (stat.isFile() && gameDirOrFile.toLowerCase().endsWith('.desktop')) {
      desktopFiles = [gameDirOrFile];
    } else if (stat.isDirectory()) {
      const entries = await fs.readdir(gameDirOrFile);
      desktopFiles = entries
        .filter((e) => e.toLowerCase().endsWith('.desktop'))
        .map((e) => joinPosix(gameDirOrFile, e));
    } else if (stat.isFile()) {
      const parentDir = path.dirname(gameDirOrFile);
      const entries = await fs.readdir(parentDir);
      desktopFiles = entries
        .filter((e) => e.toLowerCase().endsWith('.desktop'))
        .map((e) => joinPosix(parentDir, e));
    }

    for (const desktopFile of desktopFiles) {
      if (signal?.aborted) return null;
      try {
        const rawContent = await fs.readFile(desktopFile, 'utf8');
        const content = typeof rawContent === 'string' ? rawContent : rawContent.toString('utf8');
        const iconVal = parseDesktopFileIcon(content);
        if (iconVal) {
          const resolved = await resolveDesktopIconPath(
            iconVal,
            path.dirname(desktopFile),
            options
          );
          if (resolved) return resolved;
        }
      } catch {
        continue;
      }
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Synchronous variant of resolveDesktopIconPath.
 */
export function resolveDesktopIconPathSync(
  iconVal: string,
  baseDir?: string,
  options?: Omit<DesktopEntryOptions, 'fs'>
): string | null {
  const { env, signal } = normalizeSyncOptions(options);
  if (signal?.aborted) return null;

  const sanitized = sanitizeIconVal(iconVal);
  if (!sanitized) return null;

  const normalizedVal = normalizePath(sanitized);

  // 1. Absolute path check
  if (isCrossPlatformAbsolute(normalizedVal)) {
    const authorizedRoots = getAuthorizedRoots(baseDir, env);
    const isAuthorized = authorizedRoots.some((root) => isContainedIn(normalizedVal, root));
    if (!isAuthorized) return null;
    if (!isAllowedImageExtension(normalizedVal)) return null;

    if (signal?.aborted) return null;
    try {
      const stat = fsSync.statSync(normalizedVal);
      if (stat.isFile()) return normalizedVal;
    } catch {
      return null;
    }
    return null;
  }

  // 2. Relative path check against baseDir
  if (baseDir) {
    if (isAllowedImageExtension(sanitized)) {
      const cand = joinPosix(baseDir, sanitized);
      if (isContainedIn(cand, baseDir) && isAllowedImageExtension(cand)) {
        if (signal?.aborted) return null;
        try {
          const stat = fsSync.statSync(cand);
          if (stat.isFile()) return cand;
        } catch {}
      }
    }

    for (const ext of EXTENSION_PRIORITY) {
      const cand = joinPosix(baseDir, `${sanitized}${ext}`);
      if (isContainedIn(cand, baseDir)) {
        if (signal?.aborted) return null;
        try {
          const stat = fsSync.statSync(cand);
          if (stat.isFile()) return cand;
        } catch {}
      }
    }
  }

  // If explicit relative file path with separators wasn't found in baseDir, reject
  if (sanitized.includes('/') || sanitized.includes('\\')) {
    return null;
  }

  // 3. Theme icon name search across standard XDG / system icon directories
  const searchDirs = getStandardSearchDirs(env);
  for (const dir of searchDirs) {
    if (signal?.aborted) return null;

    if (isAllowedImageExtension(sanitized)) {
      const cand = joinPosix(dir, sanitized);
      try {
        const stat = fsSync.statSync(cand);
        if (stat.isFile()) return cand;
      } catch {}
    }

    for (const ext of EXTENSION_PRIORITY) {
      const cand = joinPosix(dir, `${sanitized}${ext}`);
      try {
        const stat = fsSync.statSync(cand);
        if (stat.isFile()) return cand;
      } catch {}
    }
  }

  return null;
}

/**
 * Synchronous variant of findDesktopEntryIcon.
 */
export function findDesktopEntryIconSync(
  gameDirOrFile: string,
  options?: Omit<DesktopEntryOptions, 'fs'>
): string | null {
  const { signal } = normalizeSyncOptions(options);
  if (signal?.aborted) return null;
  if (!gameDirOrFile || typeof gameDirOrFile !== 'string') return null;

  try {
    let desktopFiles: string[] = [];
    const stat = fsSync.statSync(gameDirOrFile);

    if (stat.isFile() && gameDirOrFile.toLowerCase().endsWith('.desktop')) {
      desktopFiles = [gameDirOrFile];
    } else if (stat.isDirectory()) {
      const entries = fsSync.readdirSync(gameDirOrFile);
      desktopFiles = entries
        .filter((e) => e.toLowerCase().endsWith('.desktop'))
        .map((e) => joinPosix(gameDirOrFile, e));
    } else if (stat.isFile()) {
      const parentDir = path.dirname(gameDirOrFile);
      const entries = fsSync.readdirSync(parentDir);
      desktopFiles = entries
        .filter((e) => e.toLowerCase().endsWith('.desktop'))
        .map((e) => joinPosix(parentDir, e));
    }

    for (const desktopFile of desktopFiles) {
      if (signal?.aborted) return null;
      try {
        const content = fsSync.readFileSync(desktopFile, 'utf8');
        const iconVal = parseDesktopFileIcon(content);
        if (iconVal) {
          const resolved = resolveDesktopIconPathSync(
            iconVal,
            path.dirname(desktopFile),
            options
          );
          if (resolved) return resolved;
        }
      } catch {
        continue;
      }
    }
  } catch {
    return null;
  }

  return null;
}
