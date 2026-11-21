import * as fs from 'node:fs';
import * as path from 'node:path';
import { sanitizeUserPaths } from '../../shared/path-sanitizer';

export async function ensureWritable(
  targetPath: string,
  fsPromises: typeof fs.promises
): Promise<void> {
  try {
    const stat = await fsPromises.stat(targetPath);
    if ((stat.mode & 0o222) === 0) {
      await fsPromises.chmod(targetPath, stat.mode | 0o666);
    }
  } catch {
    // Ignore ENOENT or stat errors; rename/unlink will handle accordingly
  }
}

export async function resilientRename(
  src: string,
  dest: string,
  maxRetries = 5,
  initialBackoffMs = 50,
  customFs: typeof fs = fs,
  jitterFn: () => number = () => Math.floor(Math.random() * 25)
): Promise<void> {
  const safeMax = Number.isFinite(maxRetries) ? Math.trunc(maxRetries) : 5;
  const boundedMaxRetries = Math.max(1, safeMax);
  const safeBackoff = Number.isFinite(initialBackoffMs) ? Math.trunc(initialBackoffMs) : 50;
  const clampedInitialDelay = Math.max(1, safeBackoff);
  let delay = clampedInitialDelay;

  for (let attempt = 1; attempt <= boundedMaxRetries; attempt++) {
    try {
      await customFs.promises.rename(src, dest);
      return;
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code === 'EXDEV') {
        const stagingPath = `${dest}.tmp.${Date.now()}_${process.pid}_exdev_${Math.random().toString(36).slice(2, 8)}`;
        let handle: fs.promises.FileHandle | null = null;
        try {
          await customFs.promises.copyFile(src, stagingPath);
          await ensureWritable(stagingPath, customFs.promises);
          handle = await customFs.promises.open(stagingPath, 'r+');
          await handle.sync();
          await handle.close();
          handle = null;

          let destRenameDelay = clampedInitialDelay;
          let destRenameSuccess = false;
          let destRenameErr: unknown;

          for (let destAttempt = 1; destAttempt <= boundedMaxRetries; destAttempt++) {
            try {
              await customFs.promises.rename(stagingPath, dest);
              destRenameSuccess = true;
              break;
            } catch (subErr: unknown) {
              destRenameErr = subErr;
              const subCode = (subErr as NodeJS.ErrnoException)?.code;
              if (subCode === 'EPERM') {
                await ensureWritable(dest, customFs.promises);
              }
              const isLock = subCode === 'EBUSY' || subCode === 'EPERM' || subCode === 'EACCES';
              if (isLock && destAttempt < boundedMaxRetries) {
                const jitter = jitterFn();
                await new Promise((res) => setTimeout(res, destRenameDelay + jitter));
                destRenameDelay *= 2;
                continue;
              }
              break;
            }
          }

          if (!destRenameSuccess) {
            throw destRenameErr;
          }

          await ensureWritable(src, customFs.promises);
          await customFs.promises.unlink(src).catch((unlinkErr: any) => {
            if (unlinkErr?.code !== 'ENOENT') {
              console.warn('[fs-utils:resilientRename] Failed to unlink source file after EXDEV copy:', {
                src: sanitizeUserPaths(src),
                error: sanitizeUserPaths(unlinkErr?.message || String(unlinkErr)),
                code: unlinkErr?.code,
              });
            }
          });
          return;
        } catch (copyErr) {
          if (handle !== null) {
            try {
              await handle.close();
            } catch (closeErr) {
              console.warn('[fs-utils:resilientRename] Failed to close staging handle during error recovery:', {
                stagingPath: sanitizeUserPaths(stagingPath),
                error: sanitizeUserPaths((closeErr as Error)?.message || String(closeErr)),
              });
            }
          }
          await ensureWritable(stagingPath, customFs.promises);
          await customFs.promises.unlink(stagingPath).catch((unlinkErr: any) => {
            if (unlinkErr?.code !== 'ENOENT') {
              console.warn('[fs-utils:resilientRename] Failed to unlink staging temp file during error recovery:', {
                stagingPath: sanitizeUserPaths(stagingPath),
                error: sanitizeUserPaths(unlinkErr?.message || String(unlinkErr)),
              });
            }
          });
          throw copyErr;
        }
      }

      if (code === 'EPERM') {
        await ensureWritable(dest, customFs.promises);
      }
      const isLockError = code === 'EBUSY' || code === 'EPERM' || code === 'EACCES';
      if (isLockError && attempt < boundedMaxRetries) {
        const jitter = jitterFn();
        await new Promise((res) => setTimeout(res, delay + jitter));
        delay *= 2;
        continue;
      }
      throw err;
    }
  }
}

export function syncSleep(ms: number): void {
  if (!Number.isFinite(ms) || ms <= 0) return;
  const sab = new SharedArrayBuffer(4);
  const int32 = new Int32Array(sab);
  Atomics.wait(int32, 0, 0, ms);
}

export function ensureWritableSync(targetPath: string, customFs: typeof fs): void {
  try {
    const stat = customFs.statSync(targetPath);
    if ((stat.mode & 0o222) === 0) {
      customFs.chmodSync(targetPath, stat.mode | 0o666);
    }
  } catch {
    // Ignore ENOENT or stat errors
  }
}

export function resilientRenameSync(
  src: string,
  dest: string,
  maxRetries = 3,
  initialBackoffMs = 25,
  customFs: typeof fs = fs,
  syncSleepFn: (ms: number) => void = syncSleep
): void {
  const safeMaxRetries = Number.isFinite(maxRetries) ? Math.trunc(maxRetries) : 3;
  const boundedMaxRetries = Math.min(3, Math.max(1, safeMaxRetries));
  const safeInitialBackoff = Number.isFinite(initialBackoffMs) ? Math.trunc(initialBackoffMs) : 25;
  let delay = Math.min(25, Math.max(1, safeInitialBackoff));
  let totalStall = 0;

  for (let attempt = 1; attempt <= boundedMaxRetries; attempt++) {
    try {
      customFs.renameSync(src, dest);
      return;
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code === 'EXDEV') {
        const stagingPath = `${dest}.tmp.${Date.now()}_${process.pid}_exdev_${Math.random().toString(36).slice(2, 8)}`;
        let fd: number | null = null;
        try {
          customFs.copyFileSync(src, stagingPath);
          ensureWritableSync(stagingPath, customFs);
          fd = customFs.openSync(stagingPath, 'r+');
          customFs.fsyncSync(fd);
          customFs.closeSync(fd);
          fd = null;

          let destRenameSuccess = false;
          let destRenameErr: unknown;
          let destDelay = Math.min(25, Math.max(1, safeInitialBackoff));

          for (let destAttempt = 1; destAttempt <= boundedMaxRetries; destAttempt++) {
            try {
              customFs.renameSync(stagingPath, dest);
              destRenameSuccess = true;
              break;
            } catch (subErr: unknown) {
              destRenameErr = subErr;
              const subCode = (subErr as NodeJS.ErrnoException)?.code;
              if (subCode === 'EPERM') {
                ensureWritableSync(dest, customFs);
              }
              const isLock = subCode === 'EBUSY' || subCode === 'EPERM' || subCode === 'EACCES';
              const sleepMs = Math.min(25, destDelay);
              if (isLock && destAttempt < boundedMaxRetries && totalStall + sleepMs <= 75) {
                totalStall += sleepMs;
                syncSleepFn(sleepMs);
                destDelay = Math.min(25, destDelay * 2);
                continue;
              }
              break;
            }
          }

          if (!destRenameSuccess) {
            throw destRenameErr;
          }

          try {
            ensureWritableSync(src, customFs);
            customFs.unlinkSync(src);
          } catch (unlinkErr: any) {
            if (unlinkErr?.code !== 'ENOENT') {
              console.warn('[fs-utils:resilientRenameSync] Failed to unlink source file after EXDEV copy:', {
                src: sanitizeUserPaths(src),
                error: sanitizeUserPaths(unlinkErr?.message || String(unlinkErr)),
                code: unlinkErr?.code,
              });
            }
          }
          return;
        } catch (copyErr) {
          if (fd !== null) {
            try {
              customFs.closeSync(fd);
            } catch (closeErr: any) {
              console.warn('[fs-utils:resilientRenameSync] Failed to close staging handle during error recovery:', {
                stagingPath: sanitizeUserPaths(stagingPath),
                error: sanitizeUserPaths(closeErr?.message || String(closeErr)),
              });
            }
          }
          try {
            if (customFs.existsSync(stagingPath)) {
              ensureWritableSync(stagingPath, customFs);
              customFs.unlinkSync(stagingPath);
            }
          } catch (unlinkErr: any) {
            if (unlinkErr?.code !== 'ENOENT') {
              console.warn('[fs-utils:resilientRenameSync] Failed to unlink staging temp file during error recovery:', {
                stagingPath: sanitizeUserPaths(stagingPath),
                error: sanitizeUserPaths(unlinkErr?.message || String(unlinkErr)),
              });
            }
          }
          throw copyErr;
        }
      }

      if (code === 'EPERM') {
        ensureWritableSync(dest, customFs);
      }
      const isLockError = code === 'EBUSY' || code === 'EPERM' || code === 'EACCES';
      const sleepMs = Math.min(25, delay);
      if (isLockError && attempt < boundedMaxRetries && totalStall + sleepMs <= 75) {
        totalStall += sleepMs;
        syncSleepFn(sleepMs);
        delay = Math.min(25, delay * 2);
        continue;
      }

      if (isLockError && totalStall > 0) {
        console.warn('[fs-utils:resilientRenameSync] File lock contention exceeded budget:', {
          dest: sanitizeUserPaths(dest),
          totalStallMs: totalStall,
          error: sanitizeUserPaths((err as Error)?.message || String(err)),
        });
      }
      throw err;
    }
  }
}

export async function sweepOrphanedSaveTmpFiles(
  saveDir: string,
  maxAgeMs = 24 * 60 * 60 * 1000,
  now: (() => number) | null | undefined = Date.now,
  customFs: typeof fs = fs
): Promise<void> {
  const nowFn = typeof now === 'function' ? now : Date.now;
  let entries: string[];
  try {
    entries = await customFs.promises.readdir(saveDir);
  } catch (err: any) {
    if (err?.code === 'ENOENT') return;
    throw err;
  }

  const nowMs = nowFn();
  for (const file of entries) {
    if (!file.includes('.tmp.')) continue;
    const entryPath = path.join(saveDir, file);
    try {
      const stat = await customFs.promises.stat(entryPath);
      if (stat.isFile() && nowMs - stat.mtimeMs > maxAgeMs) {
        try {
          await customFs.promises.unlink(entryPath);
        } catch (unlinkErr: any) {
          if (unlinkErr?.code !== 'ENOENT') {
            console.warn('[fs-utils:sweepOrphanedSaveTmpFiles] Failed to unlink expired temp file:', {
              path: sanitizeUserPaths(entryPath),
              error: sanitizeUserPaths(unlinkErr?.message || String(unlinkErr)),
            });
          }
        }
      }
    } catch (statErr: any) {
      // Ignore ENOENT if file was concurrently removed or renamed by active save pipeline
      if (statErr?.code !== 'ENOENT') {
        console.warn('[fs-utils:sweepOrphanedSaveTmpFiles] Failed to stat temp file entry:', {
          path: sanitizeUserPaths(entryPath),
          error: sanitizeUserPaths(statErr?.message || String(statErr)),
        });
      }
    }
  }
}
