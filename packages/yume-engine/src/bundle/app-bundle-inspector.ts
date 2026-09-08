/// <reference types="node" />
/**
 * macOS .app Bundle Metadata Inspector & resolveBundleRoot (@yumeshelf/engine)
 *
 * Inspects macOS application bundles, extracts metadata from Info.plist
 * (binary bplist00 or XML), defends against path traversal in CFBundleExecutable,
 * and discovers executable binaries in Contents/MacOS/.
 *
 * MIT License - Copyright (c) YumeShelf Contributors
 */

import path from 'node:path';
import type { IFileSystem, AppBundleInspectionResult, GameEngineProfile } from '../types.js';
import { DEFAULT_MAX_ARTWORK_SIZE } from '../types.js';
import { NodeFileSystemProvider } from '../fs/node-fs-provider.js';
import { parsePlist } from './plist-parser.js';

/**
 * Resolves the root of a macOS `.app` bundle from a target path.
 * Handles both outer bundle paths (e.g. `/Applications/Game.app`)
 * and nested inner paths (e.g. `/Applications/Game.app/Contents/MacOS/Game`),
 * normalizing both `/` and `\` cross-platform.
 *
 * @param targetPath Arbitrary file or directory path
 * @returns Normalized .app bundle root path, or null if targetPath is not within an .app bundle
 */
export function resolveBundleRoot(targetPath: string): string | null {
  if (!targetPath || typeof targetPath !== 'string') {
    return null;
  }

  // Normalize backslashes to forward slashes
  let normalized = targetPath.replace(/\\/g, '/');

  // Strip trailing slashes unless it's root '/'
  while (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }

  // Split into segments
  const segments = normalized.split('/');

  // Find the rightmost segment ending with .app (and length > 4 to ignore dotfiles like ".app")
  let bundleIndex = -1;
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    if (seg.length > 4 && seg.toLowerCase().endsWith('.app')) {
      bundleIndex = i;
      break;
    }
  }

  if (bundleIndex === -1) {
    return null;
  }

  const bundleSegments = segments.slice(0, bundleIndex + 1);
  let result = bundleSegments.join('/');

  // Normalize Windows drive letter casing: c:/ -> C:/
  if (/^[a-zA-Z]:\//.test(result)) {
    result = result[0].toUpperCase() + result.slice(1);
  }

  return result;
}

/**
 * Scans the Contents/MacOS/ directory inside a bundle root for executable entries.
 */
async function scanMacOSDir(
  bundleRoot: string,
  fileSystem: IFileSystem,
  bundleStem?: string
): Promise<{ path: string; name: string } | null> {
  const macOSDir = `${bundleRoot}/Contents/MacOS`;
  try {
    const exists = await fileSystem.exists(macOSDir);
    if (!exists) return null;
    const stat = await fileSystem.stat(macOSDir);
    if (!stat.isDirectory()) return null;

    const entries = await fileSystem.readdir(macOSDir);
    // Ignore hidden files such as .DS_Store
    const validEntries = entries.filter((e) => !e.startsWith('.'));
    if (validEntries.length === 0) return null;

    // Prefer entry matching bundle stem
    if (bundleStem && validEntries.includes(bundleStem)) {
      const candidatePath = `${macOSDir}/${bundleStem}`;
      try {
        const s = await fileSystem.stat(candidatePath);
        if (s.isFile()) {
          return { path: candidatePath, name: bundleStem };
        }
      } catch {
        // Continue to search
      }
    }

    // Otherwise prefer non-script binaries over script/text files
    const nonScriptEntries = validEntries.filter(
      (e) => !e.endsWith('.py') && !e.endsWith('.pyo') && !e.endsWith('.sh') && !e.endsWith('.txt')
    );
    const searchEntries = nonScriptEntries.length > 0 ? nonScriptEntries : validEntries;

    for (const entry of searchEntries) {
      const candidatePath = `${macOSDir}/${entry}`;
      try {
        const s = await fileSystem.stat(candidatePath);
        if (s.isFile()) {
          return { path: candidatePath, name: entry };
        }
      } catch {
        // Continue to search
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Headless inspector for macOS `.app` bundles.
 */
export class AppBundleInspector implements AppBundleInspectionResult {
  public readonly bundlePath: string;
  public readonly executablePath: string | null;
  public readonly executableName: string | null;
  public readonly bundleIdentifier: string | null;
  public readonly bundleName: string | null;
  public readonly displayName: string | null;
  public readonly profile?: GameEngineProfile;

  constructor(result: AppBundleInspectionResult) {
    this.bundlePath = result.bundlePath;
    this.executablePath = result.executablePath;
    this.executableName = result.executableName;
    this.bundleIdentifier = result.bundleIdentifier;
    this.bundleName = result.bundleName;
    this.displayName = result.displayName;
    this.profile = result.profile;
  }

  /**
   * Inspects a macOS `.app` bundle from a directory or nested path.
   *
   * @param bundlePath Outer bundle directory or nested file path
   * @param fs File system provider (defaults to NodeFileSystemProvider)
   * @returns AppBundleInspectionResult or null if not a valid bundle
   */
  public static async fromPath(
    bundlePath: string,
    fs?: IFileSystem
  ): Promise<AppBundleInspectionResult | null> {
    if (!bundlePath || typeof bundlePath !== 'string') {
      return null;
    }

    const fileSystem = fs || new NodeFileSystemProvider();
    let bundleRoot = resolveBundleRoot(bundlePath);

    if (!bundleRoot) {
      const normalized = bundlePath.replace(/\\/g, '/').replace(/\/+$/, '');
      const lastSeg = normalized.split('/').pop() || '';
      if (lastSeg.length > 4 && lastSeg.toLowerCase().endsWith('.app')) {
        bundleRoot = normalized;
      } else {
        return null;
      }
    }

    try {
      const stat = await fileSystem.stat(bundleRoot);
      if (!stat.isDirectory()) {
        return null;
      }
    } catch {
      return null;
    }

    const lastSlash = bundleRoot.lastIndexOf('/');
    const folderName = lastSlash >= 0 ? bundleRoot.substring(lastSlash + 1) : bundleRoot;
    const bundleStem = folderName.replace(/\.app$/i, '');

    const infoPlistPath = `${bundleRoot}/Contents/Info.plist`;
    let plistData: Record<string, any> | null = null;

    try {
      const infoExists = await fileSystem.exists(infoPlistPath);
      if (infoExists) {
        const content = await fileSystem.readFile(infoPlistPath);
        const parsed = parsePlist(content);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          plistData = parsed;
        }
      }
    } catch {
      plistData = null;
    }

    if (!plistData) {
      // Contents/Info.plist is absent or malformed: fallback to scanning Contents/MacOS/
      const scanned = await scanMacOSDir(bundleRoot, fileSystem, bundleStem);
      if (!scanned) {
        return null;
      }
      return new AppBundleInspector({
        bundlePath: bundleRoot,
        executablePath: scanned.path,
        executableName: scanned.name,
        bundleIdentifier: null,
        bundleName: null,
        displayName: null,
      });
    }

    const bundleIdentifier =
      typeof plistData.CFBundleIdentifier === 'string' &&
      plistData.CFBundleIdentifier.trim().length > 0
        ? plistData.CFBundleIdentifier.trim()
        : null;

    const bundleName =
      typeof plistData.CFBundleName === 'string' && plistData.CFBundleName.trim().length > 0
        ? plistData.CFBundleName.trim()
        : null;

    const displayName =
      typeof plistData.CFBundleDisplayName === 'string' &&
      plistData.CFBundleDisplayName.trim().length > 0
        ? plistData.CFBundleDisplayName.trim()
        : null;

    const rawExecutable =
      typeof plistData.CFBundleExecutable === 'string'
        ? plistData.CFBundleExecutable
        : null;

    let executablePath: string | null = null;
    let executableName: string | null = null;
    const macOSDir = `${bundleRoot}/Contents/MacOS`;

    if (rawExecutable) {
      const sanitized = rawExecutable.replace(/^[\/\\]+/, '').trim();

      let isSafe = Boolean(sanitized);
      if (
        !sanitized ||
        sanitized === '.' ||
        sanitized === '..' ||
        sanitized.includes('..') ||
        sanitized.includes('/') ||
        sanitized.includes('\\') ||
        sanitized.includes('\0')
      ) {
        isSafe = false;
      }

      if (isSafe) {
        const base = path.posix.basename(sanitized);
        if (base !== sanitized) {
          isSafe = false;
        }
      }

      const candidatePath = `${macOSDir}/${sanitized}`;
      const expectedPrefix = `${macOSDir}/`;
      if (
        !candidatePath.startsWith(expectedPrefix) ||
        candidatePath.slice(expectedPrefix.length).includes('/')
      ) {
        isSafe = false;
      }

      if (!isSafe) {
        // Path escapes or contains traversal sequences: safely fallback to Contents/MacOS/<bundle-name> or return null
        const fallbackPath = `${macOSDir}/${bundleStem}`;
        try {
          if (await fileSystem.exists(fallbackPath)) {
            const s = await fileSystem.stat(fallbackPath);
            if (s.isFile()) {
              executablePath = fallbackPath;
              executableName = bundleStem;
            } else {
              return null;
            }
          } else {
            return null;
          }
        } catch {
          return null;
        }
      } else {
        // Valid sanitized executable name
        try {
          if (await fileSystem.exists(candidatePath)) {
            const s = await fileSystem.stat(candidatePath);
            if (s.isFile()) {
              executablePath = candidatePath;
              executableName = sanitized;
            }
          }
        } catch {
          // Ignored
        }

        if (!executablePath) {
          // Check fallback to bundleStem if candidate doesn't exist
          const fallbackPath = `${macOSDir}/${bundleStem}`;
          try {
            if (await fileSystem.exists(fallbackPath)) {
              const s = await fileSystem.stat(fallbackPath);
              if (s.isFile()) {
                executablePath = fallbackPath;
                executableName = bundleStem;
              }
            }
          } catch {
            // Ignored
          }
        }

        if (!executablePath) {
          // Fallback to scanning Contents/MacOS/
          const scanned = await scanMacOSDir(bundleRoot, fileSystem, bundleStem);
          if (scanned) {
            executablePath = scanned.path;
            executableName = scanned.name;
          } else {
            executablePath = candidatePath;
            executableName = sanitized;
          }
        }
      }
    } else {
      // CFBundleExecutable absent in Info.plist: fallback to bundleStem or scanning Contents/MacOS
      const fallbackPath = `${macOSDir}/${bundleStem}`;
      try {
        if (await fileSystem.exists(fallbackPath)) {
          const s = await fileSystem.stat(fallbackPath);
          if (s.isFile()) {
            executablePath = fallbackPath;
            executableName = bundleStem;
          }
        }
      } catch {
        // Ignored
      }

      if (!executablePath) {
        const scanned = await scanMacOSDir(bundleRoot, fileSystem, bundleStem);
        if (scanned) {
          executablePath = scanned.path;
          executableName = scanned.name;
        }
      }
    }

    return new AppBundleInspector({
      bundlePath: bundleRoot,
      executablePath,
      executableName,
      bundleIdentifier,
      bundleName,
      displayName,
    });
  }
}


export interface FindAppBundleIconOptions {
  fs?: IFileSystem;
  signal?: AbortSignal;
  maxArtworkSize?: number;
  maxRsrcSize?: number;
}

export interface AppBundleIconResult {
  buffer: Buffer;
  ext: string;
  path?: string;
}

function isFileSystem(opt: any): opt is IFileSystem {
  return opt && typeof opt.open === 'function' && typeof opt.readFile === 'function';
}

/**
 * Resolves the primary icon for a macOS .app bundle.
 * Inspects Contents/Info.plist for CFBundleIconFile / CFBundleIconName with sanitization,
 * and falls back to scanning Contents/Resources/ prioritizing well-known icon names.
 */
export async function findAppBundleIcon(
  bundlePath: string,
  options?: FindAppBundleIconOptions | IFileSystem
): Promise<AppBundleIconResult | null> {
  if (!bundlePath || typeof bundlePath !== 'string') {
    return null;
  }

  let bundleRoot = resolveBundleRoot(bundlePath);
  if (!bundleRoot && bundlePath.toLowerCase().endsWith('.app')) {
    let norm = bundlePath.replace(/\\/g, '/');
    while (norm.length > 1 && norm.endsWith('/')) {
      norm = norm.slice(0, -1);
    }
    const lastSeg = norm.split('/').pop() || '';
    if (lastSeg.length > 4) {
      bundleRoot = norm;
    }
  }

  if (!bundleRoot) {
    return null;
  }

  if (/^[a-zA-Z]:\//.test(bundleRoot)) {
    bundleRoot = bundleRoot[0].toUpperCase() + bundleRoot.slice(1);
  }

  let fileSystem: IFileSystem;
  let signal: AbortSignal | undefined;
  let maxArtworkSize: number | undefined;
  let maxRsrcSize: number | undefined;

  if (isFileSystem(options)) {
    fileSystem = options;
  } else if (options) {
    fileSystem = options.fs || new NodeFileSystemProvider();
    signal = options.signal;
    maxArtworkSize = options.maxArtworkSize;
    maxRsrcSize = options.maxRsrcSize;
  } else {
    fileSystem = new NodeFileSystemProvider();
  }

  if (signal?.aborted) {
    return null;
  }

  const maxSize = maxArtworkSize ?? maxRsrcSize ?? DEFAULT_MAX_ARTWORK_SIZE;

  // Fallback directory scanner for Contents/Resources/
  const fallbackScanResources = async (): Promise<AppBundleIconResult | null> => {
    if (signal?.aborted) return null;

    const resourcesDir = `${bundleRoot}/Contents/Resources`;
    let entries: string[];
    try {
      entries = await fileSystem.readdir(resourcesDir);
    } catch {
      return null;
    }

    if (!Array.isArray(entries) || entries.length === 0) {
      return null;
    }

    const matchingFiles = entries.filter((e) => !e.startsWith('.') && /\.(icns|png)$/i.test(e));
    if (matchingFiles.length === 0) {
      return null;
    }

    const wellKnownOrder = ['icon.icns', 'appicon.icns', 'game.icns'];
    matchingFiles.sort((a, b) => {
      const rankA = wellKnownOrder.indexOf(a.toLowerCase());
      const rankB = wellKnownOrder.indexOf(b.toLowerCase());
      if (rankA !== -1 && rankB !== -1) return rankA - rankB;
      if (rankA !== -1) return -1;
      if (rankB !== -1) return 1;
      return a.toLowerCase().localeCompare(b.toLowerCase());
    });

    for (const file of matchingFiles) {
      if (signal?.aborted) return null;

      const candidatePath = `${resourcesDir}/${file}`;
      let stat: any;
      try {
        stat = await fileSystem.stat(candidatePath);
      } catch {
        continue;
      }

      if (!stat.isFile() || stat.size <= 0 || stat.size > maxSize) {
        continue;
      }

      try {
        const raw = await fileSystem.readFile(candidatePath);
        const ext = path.posix.extname(candidatePath).replace(/^\./, '').toLowerCase() || 'icns';
        return {
          buffer: Buffer.isBuffer(raw) ? raw : Buffer.from(raw),
          ext,
          path: candidatePath,
        };
      } catch {
        continue;
      }
    }

    return null;
  };

  // Check Contents/Info.plist
  const plistPath = `${bundleRoot}/Contents/Info.plist`;
  let plistData: any = null;
  try {
    const exists = await fileSystem.exists(plistPath);
    if (exists) {
      if (signal?.aborted) return null;
      const plistRaw = await fileSystem.readFile(plistPath);
      const plistBuffer = Buffer.isBuffer(plistRaw) ? plistRaw : Buffer.from(plistRaw);
      plistData = parsePlist(plistBuffer);
    }
  } catch {
    plistData = null;
  }

  const iconNameRaw = plistData?.CFBundleIconFile || plistData?.CFBundleIconName;
  if (typeof iconNameRaw === 'string' && iconNameRaw.trim().length > 0) {
    const trimmed = iconNameRaw.trim();

    // Sanitize icon filename against traversal, separators, control chars, null bytes
    const isClean =
      !trimmed.includes('\0') &&
      !trimmed.includes('%00') &&
      !/[\x00-\x1f\x7f]/.test(trimmed) &&
      !trimmed.includes('..') &&
      !trimmed.includes('/') &&
      !trimmed.includes('\\') &&
      path.posix.basename(trimmed) === trimmed &&
      path.win32.basename(trimmed) === trimmed;

    if (isClean) {
      let iconName = trimmed;
      if (!/\.(icns|png)$/i.test(iconName)) {
        iconName += '.icns';
      }

      const candidatePath = `${bundleRoot}/Contents/Resources/${iconName}`;
      let stat: any = null;
      try {
        stat = await fileSystem.stat(candidatePath);
      } catch {
        stat = null;
      }

      if (stat && stat.isFile() && stat.size > 0 && stat.size <= maxSize) {
        try {
          const raw = await fileSystem.readFile(candidatePath);
          const ext = path.posix.extname(candidatePath).replace(/^\./, '').toLowerCase() || 'icns';
          return {
            buffer: Buffer.isBuffer(raw) ? raw : Buffer.from(raw),
            ext,
            path: candidatePath,
          };
        } catch {
          // Cleanly fall through to directory scan
        }
      }
    }
  }

  // Fallback to directory scan
  return await fallbackScanResources();
}
