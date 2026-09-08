/// <reference types="node" />
/**
 * Unified Headless Engine Facade Icon Extraction (@yumeshelf/engine)
 *
 * Implements two-priority fallback cascade:
 * Priority 1: Local Artwork Candidates (36-pattern folder search + Linux .desktop entry fallback)
 * Priority 2: Executable Binary Resources (macOS .app bundle icon or Windows PE .rsrc icon)
 *
 * MIT License - Copyright (c) YumeShelf Contributors
 */

import type { IFileSystem, IEnvironmentPaths } from '../types.js';
import { DEFAULT_MAX_ARTWORK_SIZE } from '../types.js';
import { NodeFileSystemProvider } from '../fs/node-fs-provider.js';
import { StandardEnvironmentPaths } from '../fs/environment-paths.js';
import { withTimeout } from '../utils/timeout.js';
import { findLocalGameImage, getImageMimeType } from './artwork-search.js';
import { resolveBundleRoot, findAppBundleIcon } from '../bundle/index.js';
import { extractPeIconAsync } from '../pe/index.js';

export interface ExtractedGameIcon {
  buffer: Buffer;
  mimeType: string;
  width?: number;
  height?: number;
  isPng: boolean;
  format?: 'png' | 'ico' | 'icns';
  source: 'pe-resource' | 'pe-rsrc' | 'local-image' | 'desktop-entry' | 'app-bundle';
  filePath?: string;
  extractedAt?: number;
}

export interface ExtractIconOptions {
  fs?: IFileSystem;
  env?: IEnvironmentPaths;
  targetPlatform?: NodeJS.Platform;
  preferLocalArtwork?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxRsrcSize?: number;
  maxArtworkSize?: number;
  maxResourceEntries?: number;
  maxRecursionDepth?: number;
  maxIconFrames?: number;
}

export async function extractGameIcon(
  targetPath: string,
  options?: ExtractIconOptions | IFileSystem
): Promise<ExtractedGameIcon | null> {
  if (!targetPath || typeof targetPath !== 'string') {
    return null;
  }

  const isDirectFs = Boolean(
    options &&
      typeof (options as any).open === 'function' &&
      typeof (options as any).readFile === 'function'
  );

  const opts = (!isDirectFs && options ? options : {}) as ExtractIconOptions;

  const fs: IFileSystem = isDirectFs
    ? (options as IFileSystem)
    : opts.fs ?? new NodeFileSystemProvider();

  const env: IEnvironmentPaths =
    (options && 'getXdgDataHome' in options
      ? (options as unknown as IEnvironmentPaths)
      : opts.env) ?? new StandardEnvironmentPaths();

  const targetPlatform: NodeJS.Platform = opts.targetPlatform ?? process.platform;
  const preferLocalArtwork = opts.preferLocalArtwork !== false;
  const signal: AbortSignal | undefined = opts.signal;
  const timeoutMs: number | undefined = opts.timeoutMs;
  const maxArtworkSize: number | undefined = opts.maxArtworkSize;
  const maxRsrcSize: number | undefined = opts.maxRsrcSize;
  const maxResourceEntries: number | undefined = opts.maxResourceEntries;
  const maxRecursionDepth: number | undefined = opts.maxRecursionDepth;
  const maxIconFrames: number | undefined = opts.maxIconFrames;

  const internalExtract = async (): Promise<ExtractedGameIcon | null> => {
    if (signal?.aborted) {
      return null;
    }

    // Priority 1: Local Artwork Candidates
    if (preferLocalArtwork) {
      try {
        const localImg = await findLocalGameImage(targetPath, {
          fs,
          env,
          targetPlatform,
          signal,
          maxArtworkSize,
          maxRsrcSize,
        });

        if (localImg) {
          if (signal?.aborted) return null;
          try {
            const stat = await fs.stat(localImg.imgPath);
            const maxSize = maxArtworkSize ?? maxRsrcSize ?? DEFAULT_MAX_ARTWORK_SIZE;

            if (stat.isFile() && stat.size > 0 && stat.size <= maxSize) {
              const raw = await fs.readFile(localImg.imgPath);
              const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
              const mimeType = getImageMimeType(localImg.ext);
              const cleanExt = (localImg.ext || '').replace(/^\./, '').toLowerCase();
              const isPng = cleanExt === 'png' || mimeType === 'image/png';
              const format: 'png' | 'ico' | 'icns' | undefined = isPng
                ? 'png'
                : cleanExt === 'ico'
                  ? 'ico'
                  : cleanExt === 'icns'
                    ? 'icns'
                    : undefined;

              return {
                buffer,
                mimeType,
                isPng,
                format,
                source: localImg.source ?? 'local-image',
                filePath: localImg.imgPath,
                extractedAt: Date.now(),
              };
            }
          } catch {
            // Cleanly catch read/lock errors and fall through to Priority 2
          }
        }
      } catch {
        // Cleanly catch errors and fall through to Priority 2
      }
    }

    if (signal?.aborted) {
      return null;
    }

    // Priority 2: Executable Binary Resources
    const isMacApp = Boolean(
      resolveBundleRoot(targetPath) || targetPath.toLowerCase().endsWith('.app')
    );

    if (isMacApp) {
      const bundleIcon = await findAppBundleIcon(targetPath, {
        fs,
        signal,
        maxArtworkSize,
        maxRsrcSize,
      });

      if (bundleIcon && bundleIcon.buffer) {
        const cleanExt = (bundleIcon.ext || '').replace(/^\./, '').toLowerCase();
        const isPng = cleanExt === 'png';
        return {
          buffer: bundleIcon.buffer,
          mimeType: isPng ? 'image/png' : 'image/x-icns',
          isPng,
          format: isPng ? 'png' : 'icns',
          source: 'app-bundle',
          filePath: bundleIcon.path,
          extractedAt: Date.now(),
        };
      }
      return null;
    }

    const isPe =
      targetPath.toLowerCase().endsWith('.exe') ||
      targetPlatform === 'win32';

    if (isPe) {
      const peIcon = await extractPeIconAsync(targetPath, {
        fs,
        signal,
        maxRsrcSize: maxRsrcSize ?? maxArtworkSize,
        maxResourceEntries,
        maxRecursionDepth,
        maxIconFrames,
      });

      if (peIcon && peIcon.buffer) {
        return {
          buffer: peIcon.buffer,
          mimeType: peIcon.isPng ? 'image/png' : 'image/x-icon',
          isPng: peIcon.isPng,
          format: peIcon.isPng ? 'png' : 'ico',
          source: 'pe-resource',
          width: peIcon.width,
          height: peIcon.height,
          extractedAt: Date.now(),
        };
      }
    }

    return null;
  };

  const safeInternalExtract = async (): Promise<ExtractedGameIcon | null> => {
    try {
      return await internalExtract();
    } catch {
      return null;
    }
  };

  return await withTimeout(safeInternalExtract(), {
    timeoutMs,
    signal,
    fallbackValue: null,
  });
}

export const extractIcon = extractGameIcon;
