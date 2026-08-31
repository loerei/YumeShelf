/// <reference types="node" />
import * as nodeFsPromises from 'node:fs/promises';
import type { Dir } from 'node:fs';
import * as path from 'node:path';
import type { DirectorySizeResult, IFileSystem } from '../types.js';
import { NodeFileSystemProvider } from './node-fs-provider.js';

const STAT_CONCURRENCY_LIMIT = 64;

async function runWithConcurrencyLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const currentIndex = index++;
      results[currentIndex] = await fn(items[currentIndex]);
    }
  }

  const workerCount = Math.min(limit, items.length);
  const workers = Array.from({ length: workerCount }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * Calculates the total recursive size in bytes, total file count, and root modification timestamp
 * for a given directory path.
 *
 * Implements dual-path execution:
 * - Native Node FS: Uses streaming opendir with bounded stat concurrency, symlink skipping, and error isolation.
 * - Custom IFileSystem: Uses recursive readdir and stat for testing/mock isolation.
 */
export async function calculateDirectorySize(
  dirPath: string,
  fs?: IFileSystem
): Promise<DirectorySizeResult> {
  const effectiveFs = fs ?? new NodeFileSystemProvider();
  let rootMtimeMs = 0;

  try {
    const rootStat = await effectiveFs.stat(dirPath);
    if (!rootStat.isDirectory()) {
      return {
        sizeBytes: rootStat.size,
        fileCount: 1,
        mtimeMs: rootStat.mtimeMs ?? 0,
      };
    }
    rootMtimeMs = rootStat.mtimeMs ?? 0;
  } catch {
    return { sizeBytes: 0, fileCount: 0, mtimeMs: 0 };
  }

  let totalSize = 0;
  let fileCount = 0;

  if (!fs) {
    // Native Node.js streaming opendir traversal
    async function walkNative(currentDir: string): Promise<void> {
      let dir: Dir;
      try {
        dir = await nodeFsPromises.opendir(currentDir, { bufferSize: 128 });
      } catch {
        return;
      }

      const subdirs: string[] = [];
      const filesToStat: string[] = [];

      try {
        for await (const dirent of dir) {
          // Skip symlinks and junctions to prevent infinite recursion & directory traversal escapes
          if (dirent.isSymbolicLink()) {
            continue;
          }

          const fullPath = path.join(currentDir, dirent.name);
          if (dirent.isDirectory()) {
            subdirs.push(fullPath);
          } else if (dirent.isFile()) {
            filesToStat.push(fullPath);
          }
        }
      } catch {
        // Continue with whatever entries were collected
      }

      if (filesToStat.length > 0) {
        await runWithConcurrencyLimit(filesToStat, STAT_CONCURRENCY_LIMIT, async (filePath) => {
          try {
            const s = await nodeFsPromises.stat(filePath);
            totalSize += s.size;
            fileCount++;
          } catch {
            // Ignore per-entry permission / locked file errors
          }
        });
      }

      for (const subdir of subdirs) {
        await walkNative(subdir);
      }
    }

    await walkNative(dirPath);
  } else {
    // Custom IFileSystem recursive traversal (e.g. MockFileSystemProvider)
    async function walkCustom(currentDir: string): Promise<void> {
      let entries: string[];
      try {
        entries = await effectiveFs.readdir(currentDir);
      } catch {
        return;
      }

      const subdirs: string[] = [];
      const filesToStat: string[] = [];

      for (const name of entries) {
        const fullPath = path.join(currentDir, name).replace(/\\/g, '/');
        try {
          const s = await effectiveFs.stat(fullPath);
          if (s.isDirectory()) {
            subdirs.push(fullPath);
          } else if (s.isFile()) {
            filesToStat.push(fullPath);
          }
        } catch {
          // Ignore per-entry stat errors
        }
      }

      if (filesToStat.length > 0) {
        await runWithConcurrencyLimit(filesToStat, STAT_CONCURRENCY_LIMIT, async (filePath) => {
          try {
            const s = await effectiveFs.stat(filePath);
            totalSize += s.size;
            fileCount++;
          } catch {
            // Ignore
          }
        });
      }

      for (const subdir of subdirs) {
        await walkCustom(subdir);
      }
    }

    await walkCustom(dirPath);
  }

  return {
    sizeBytes: totalSize,
    fileCount,
    mtimeMs: rootMtimeMs,
  };
}
