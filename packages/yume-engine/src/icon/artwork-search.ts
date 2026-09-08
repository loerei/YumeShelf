/// <reference types="node" />
/**
 * Folder Artwork Search & Desktop Entry Fallback
 *
 * Scans 36 candidate patterns in game directories for local artwork
 * and falls back to Linux .desktop entry icon resolution with active SVG defense.
 */

import * as fsSync from 'node:fs';
import * as path from 'node:path';
import type { IFileSystem, IEnvironmentPaths } from '../types.js';
import { DEFAULT_MAX_ARTWORK_SIZE } from '../types.js';
import { NodeFileSystemProvider } from '../fs/node-fs-provider.js';
import { StandardEnvironmentPaths } from '../fs/environment-paths.js';
import {
  resolveBundleRoot,
  findDesktopEntryIcon,
  findDesktopEntryIconSync,
} from '../bundle/index.js';
import { isSafeSvgBuffer } from './svg-defense.js';

export { DEFAULT_MAX_ARTWORK_SIZE };

export interface LocalGameImageResult {
  imgPath: string;
  ext: string;
  source?: 'local-image' | 'desktop-entry';
}

export type ImageCandidatePattern = (dir: string, ext: string) => string;

export const LOCAL_IMAGE_CANDIDATE_PATTERNS: ImageCandidatePattern[] = [
  (dir, ext) => path.join(dir, `icon.${ext}`),
  (dir, ext) => path.join(dir, `cover.${ext}`),
  (dir, ext) => path.join(dir, `folder.${ext}`),
  (dir, ext) => path.join(dir, 'icon', `icon.${ext}`),
  (dir, ext) => path.join(dir, 'icon', `cover.${ext}`),
  (dir, ext) => path.join(dir, 'www', 'icon', `icon.${ext}`),
];

export const LOCAL_IMAGE_EXTENSIONS: readonly string[] = [
  'png',
  'jpg',
  'jpeg',
  'webp',
  'svg',
  'ico',
];

export interface FindArtworkOptions {
  fs?: IFileSystem;
  env?: IEnvironmentPaths;
  targetPlatform?: NodeJS.Platform;
  signal?: AbortSignal;
  maxArtworkSize?: number;
  maxRsrcSize?: number;
}

export function getImageMimeType(extOrPath: string): string {
  if (!extOrPath || typeof extOrPath !== 'string') {
    return 'image/png';
  }
  const extFromPath = path.extname(extOrPath);
  const cleanExt = (extFromPath ? extFromPath : extOrPath)
    .replace(/^\./, '')
    .toLowerCase();

  switch (cleanExt) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'svg':
      return 'image/svg+xml';
    case 'ico':
      return 'image/x-icon';
    case 'webp':
      return 'image/webp';
    case 'png':
    default:
      return 'image/png';
  }
}

export async function findLocalGameImage(
  targetPathOrDir: string,
  options?: FindArtworkOptions | IFileSystem
): Promise<LocalGameImageResult | null> {
  if (!targetPathOrDir || typeof targetPathOrDir !== 'string') {
    return null;
  }

  const fs: IFileSystem =
    options && 'open' in options
      ? options
      : (options as FindArtworkOptions)?.fs ?? new NodeFileSystemProvider();

  const env: IEnvironmentPaths =
    options && 'getXdgDataHome' in options
      ? (options as unknown as IEnvironmentPaths)
      : (options as FindArtworkOptions)?.env ?? new StandardEnvironmentPaths();

  const targetPlatform: NodeJS.Platform =
    options && !('open' in options) && (options as FindArtworkOptions)?.targetPlatform
      ? (options as FindArtworkOptions).targetPlatform!
      : process.platform;

  const signal: AbortSignal | undefined =
    options && !('open' in options) ? (options as FindArtworkOptions)?.signal : undefined;

  if (signal?.aborted) return null;

  const bundleRoot =
    resolveBundleRoot(targetPathOrDir) ||
    (targetPathOrDir.toLowerCase().endsWith('.app') ? targetPathOrDir : null);

  let dir = targetPathOrDir;
  if (bundleRoot) {
    dir = path.dirname(bundleRoot);
  } else {
    try {
      const stat = await fs.stat(targetPathOrDir);
      if (stat.isFile()) {
        dir = path.dirname(targetPathOrDir);
      }
    } catch {
      dir = path.dirname(targetPathOrDir);
    }
  }

  const maxSize: number =
    (options && !('open' in options)
      ? ((options as FindArtworkOptions).maxArtworkSize ?? (options as FindArtworkOptions).maxRsrcSize)
      : undefined) ?? DEFAULT_MAX_ARTWORK_SIZE;

  // 1. Search 36 candidate patterns
  for (const pattern of LOCAL_IMAGE_CANDIDATE_PATTERNS) {
    for (const ext of LOCAL_IMAGE_EXTENSIONS) {
      if (signal?.aborted) return null;

      const candidatePath = pattern(dir, ext);
      let stat;
      try {
        stat = await fs.stat(candidatePath);
      } catch {
        continue;
      }

      if (!stat.isFile()) continue;
      if (stat.size <= 0 || stat.size > maxSize) continue;

      if (ext === 'svg') {
        try {
          const raw = await fs.readFile(candidatePath);
          const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
          if (!isSafeSvgBuffer(buf)) {
            continue;
          }
        } catch {
          continue;
        }
      }

      return {
        imgPath: candidatePath,
        ext,
        source: 'local-image',
      };
    }
  }

  // 2. Desktop entry fallback
  if (signal?.aborted) return null;

  const desktopIcon = await findDesktopEntryIcon(targetPathOrDir, {
    fs,
    env,
    targetPlatform,
    signal,
  });

  if (desktopIcon) {
    if (signal?.aborted) return null;

    let stat;
    try {
      stat = await fs.stat(desktopIcon);
    } catch {
      return null;
    }

    if (!stat.isFile()) return null;
    if (stat.size <= 0 || stat.size > maxSize) return null;

    const ext = path.extname(desktopIcon).replace(/^\./, '').toLowerCase() || 'png';
    if (ext === 'svg') {
      try {
        const raw = await fs.readFile(desktopIcon);
        const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
        if (!isSafeSvgBuffer(buf)) {
          return null;
        }
      } catch {
        return null;
      }
    }

    return {
      imgPath: desktopIcon,
      ext,
      source: 'desktop-entry',
    };
  }

  return null;
}

export function findLocalGameImageSync(
  targetPathOrDir: string
): LocalGameImageResult | null {
  if (!targetPathOrDir || typeof targetPathOrDir !== 'string') {
    return null;
  }

  const bundleRoot =
    resolveBundleRoot(targetPathOrDir) ||
    (targetPathOrDir.toLowerCase().endsWith('.app') ? targetPathOrDir : null);

  let dir = targetPathOrDir;
  if (bundleRoot) {
    dir = path.dirname(bundleRoot);
  } else {
    try {
      const stat = fsSync.statSync(targetPathOrDir);
      if (stat.isFile()) {
        dir = path.dirname(targetPathOrDir);
      }
    } catch {
      dir = path.dirname(targetPathOrDir);
    }
  }

  // 1. Search candidate patterns synchronously
  for (const pattern of LOCAL_IMAGE_CANDIDATE_PATTERNS) {
    for (const ext of LOCAL_IMAGE_EXTENSIONS) {
      const candidatePath = pattern(dir, ext);
      let stat;
      try {
        stat = fsSync.statSync(candidatePath);
      } catch {
        continue;
      }

      if (!stat.isFile()) continue;
      if (stat.size <= 0 || stat.size > DEFAULT_MAX_ARTWORK_SIZE) continue;

      if (ext === 'svg') {
        try {
          const buf = fsSync.readFileSync(candidatePath);
          if (!isSafeSvgBuffer(buf)) {
            continue;
          }
        } catch {
          continue;
        }
      }

      return {
        imgPath: candidatePath,
        ext,
        source: 'local-image',
      };
    }
  }

  // 2. Desktop entry fallback synchronously
  const desktopIcon = findDesktopEntryIconSync(targetPathOrDir);
  if (desktopIcon) {
    let stat;
    try {
      stat = fsSync.statSync(desktopIcon);
    } catch {
      return null;
    }

    if (!stat.isFile()) return null;
    if (stat.size <= 0 || stat.size > DEFAULT_MAX_ARTWORK_SIZE) return null;

    const ext = path.extname(desktopIcon).replace(/^\./, '').toLowerCase() || 'png';
    if (ext === 'svg') {
      try {
        const buf = fsSync.readFileSync(desktopIcon);
        if (!isSafeSvgBuffer(buf)) {
          return null;
        }
      } catch {
        return null;
      }
    }

    return {
      imgPath: desktopIcon,
      ext,
      source: 'desktop-entry',
    };
  }

  return null;
}
