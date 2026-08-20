import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';

/**
 * Creates a directory symlink / junction pointing to an existing target directory.
 * - On Windows: uses NTFS junction ('junction').
 * - On Linux/macOS: uses standard POSIX directory symlink ('dir').
 * Safely removes any existing file or broken link at linkPath before creation without mutating target directory contents.
 */
export async function createDirectorySymlink(existingDirPath: string, linkPath: string): Promise<void> {
    const resolvedTarget = path.resolve(existingDirPath);
    const resolvedLink = path.resolve(linkPath);

    // Ensure parent directory for link exists
    await fs.mkdir(path.dirname(resolvedLink), { recursive: true });

    // Check if linkPath already exists (including broken symlinks)
    const stats = await fs.lstat(resolvedLink).catch(() => null);
    if (stats) {
        if (stats.isSymbolicLink()) {
            await fs.unlink(resolvedLink).catch(async () => {
                await fs.rm(resolvedLink, { recursive: true, force: true });
            });
        } else if (stats.isDirectory()) {
            await fs.rm(resolvedLink, { recursive: true, force: true });
        } else {
            await fs.unlink(resolvedLink);
        }
    }

    const symlinkType = process.platform === 'win32' ? 'junction' : 'dir';
    try {
        await fs.symlink(resolvedTarget, resolvedLink, symlinkType);
    } catch (err: any) {
        // Fallback for Windows if junction fails (e.g. Developer Mode or specific drive setups)
        if (process.platform === 'win32' && symlinkType === 'junction') {
            await fs.symlink(resolvedTarget, resolvedLink, 'dir');
        } else {
            throw err;
        }
    }
}

const EXECUTABLE_EXTENSIONS = new Set(['.exe', '.bat', '.cmd', '.x86_64', '.x86', '.appimage', '.sh']);

/**
 * Checks if a given file path is executable according to platform standards:
 * - On Windows: checks for executable file extensions (.exe, .bat, .cmd, .x86_64, .appimage, .sh).
 * - On Linux/macOS: checks for executable file extensions and POSIX executable permissions (X_OK and mode bitmask 0o111).
 */
export async function isExecutable(filePath: string, targetPlatform: NodeJS.Platform = process.platform): Promise<boolean> {
    try {
        const stats = await fs.stat(filePath);
        if (!stats.isFile()) {
            return false;
        }

        const ext = path.extname(filePath).toLowerCase();
        if (EXECUTABLE_EXTENSIONS.has(ext)) {
            return true;
        }

        if (targetPlatform === 'win32') {
            return false;
        }

        const hasPosixExecBit = (stats.mode & 0o111) !== 0;
        let hasAccessXOk = false;
        try {
            await fs.access(filePath, fsSync.constants.X_OK);
            hasAccessXOk = true;
        } catch {
            hasAccessXOk = false;
        }

        return hasPosixExecBit || hasAccessXOk;
    } catch {
        return false;
    }
}

/**
 * Normalizes file paths for cross-platform consistency.
 */
export function normalizeCrossPlatformPath(targetPath: string): string {
    return path.normalize(targetPath);
}
