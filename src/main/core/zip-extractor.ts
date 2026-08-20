import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as zlib from 'node:zlib';

export interface ZipEntryMetadata {
    fileName: string;
    compressionMethod: number;
    compressedSize: number;
    uncompressedSize: number;
    localHeaderOffset: number;
    isDirectory: boolean;
    unixMode?: number;
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIR_SIGNATURE = 0x02014b50;
const LOCAL_HEADER_SIGNATURE = 0x04034b50;

/**
 * Normalizes an entry path from a ZIP archive to prevent Zip Slip / path traversal attacks.
 * Replaces backslashes, strips drive letters, leading slashes, and verifies boundary containment.
 */
export function sanitizeZipEntryPath(rawPath: string, destinationDir: string): string {
    // 1. Replace Windows backslashes with forward slashes
    let normalized = rawPath.replace(/\\/g, '/');

    // 2. Remove drive letters (e.g., C:/foo -> /foo) and leading slashes
    normalized = normalized.replace(/^[a-zA-Z]:/, '').replace(/^\/+/, '');

    // 3. Normalize path segments to eliminate '.' and resolve '..' safely
    const resolvedDest = path.resolve(destinationDir);
    const resolvedTarget = path.resolve(resolvedDest, normalized);

    // 4. Zip Slip boundary check: resolvedTarget must reside strictly inside resolvedDest
    const relative = path.relative(resolvedDest, resolvedTarget);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(`Zip Slip path traversal attempt detected in entry: "${rawPath}"`);
    }

    return resolvedTarget;
}

/**
 * Parses Central Directory records from a ZIP buffer by locating the End of Central Directory (EOCD).
 */
export function parseZipCentralDirectory(buffer: Buffer): ZipEntryMetadata[] {
    const minEocdOffset = Math.max(0, buffer.length - 65557);
    let eocdOffset = -1;

    for (let i = buffer.length - 22; i >= minEocdOffset; i--) {
        if (buffer.readUInt32LE(i) === EOCD_SIGNATURE) {
            eocdOffset = i;
            break;
        }
    }

    if (eocdOffset === -1) {
        throw new Error('Invalid ZIP archive: End of Central Directory (EOCD) signature not found.');
    }

    const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
    const centralDirOffset = buffer.readUInt32LE(eocdOffset + 16);

    let offset = centralDirOffset;
    const entries: ZipEntryMetadata[] = [];

    for (let i = 0; i < totalEntries && offset < eocdOffset; i++) {
        const signature = buffer.readUInt32LE(offset);
        if (signature !== CENTRAL_DIR_SIGNATURE) {
            break;
        }

        const versionMadeBy = buffer.readUInt16LE(offset + 4);
        const compressionMethod = buffer.readUInt16LE(offset + 10);
        const compressedSize = buffer.readUInt32LE(offset + 20);
        const uncompressedSize = buffer.readUInt32LE(offset + 24);
        const fileNameLength = buffer.readUInt16LE(offset + 28);
        const extraFieldLength = buffer.readUInt16LE(offset + 30);
        const commentLength = buffer.readUInt16LE(offset + 32);
        const externalAttr = buffer.readUInt32LE(offset + 38);
        const localHeaderOffset = buffer.readUInt32LE(offset + 42);

        const fileNameBuffer = buffer.subarray(offset + 46, offset + 46 + fileNameLength);
        const fileName = fileNameBuffer.toString('utf8');

        // Check if UNIX mode attributes are present (host OS ID = 3 for UNIX)
        const hostOs = versionMadeBy >> 8;
        let unixMode: number | undefined;
        if (hostOs === 3 && externalAttr > 0) {
            unixMode = (externalAttr >> 16) & 0o777;
        }

        const isDirectory = fileName.endsWith('/') || fileName.endsWith('\\') || ((externalAttr & 0x10) !== 0);

        entries.push({
            fileName,
            compressionMethod,
            compressedSize,
            uncompressedSize,
            localHeaderOffset,
            isDirectory,
            unixMode
        });

        offset += 46 + fileNameLength + extraFieldLength + commentLength;
    }

    return entries;
}

/**
 * Extracts a ZIP archive buffer into the target destination directory.
 */
export async function extractZipBuffer(buffer: Buffer, destinationDir: string): Promise<void> {
    const entries = parseZipCentralDirectory(buffer);
    const resolvedDest = path.resolve(destinationDir);
    await fs.mkdir(resolvedDest, { recursive: true });

    for (const entry of entries) {
        const targetPath = sanitizeZipEntryPath(entry.fileName, resolvedDest);

        if (entry.isDirectory) {
            await fs.mkdir(targetPath, { recursive: true });
            continue;
        }

        // Ensure parent directory exists for files (handles archives with implicit directory records)
        await fs.mkdir(path.dirname(targetPath), { recursive: true });

        // Parse Local File Header
        const localSig = buffer.readUInt32LE(entry.localHeaderOffset);
        if (localSig !== LOCAL_HEADER_SIGNATURE) {
            throw new Error(`Invalid local file header signature at offset ${entry.localHeaderOffset} for entry "${entry.fileName}"`);
        }

        const localFileNameLen = buffer.readUInt16LE(entry.localHeaderOffset + 26);
        const localExtraLen = buffer.readUInt16LE(entry.localHeaderOffset + 28);
        const dataOffset = entry.localHeaderOffset + 30 + localFileNameLen + localExtraLen;

        const compressedData = buffer.subarray(dataOffset, dataOffset + entry.compressedSize);
        let uncompressedData: Buffer;

        if (entry.compressionMethod === 0) {
            // STORE (no compression)
            uncompressedData = compressedData;
        } else if (entry.compressionMethod === 8) {
            // DEFLATE
            uncompressedData = zlib.inflateRawSync(compressedData);
        } else {
            throw new Error(`Unsupported ZIP compression method: ${entry.compressionMethod} for entry "${entry.fileName}"`);
        }

        await fs.writeFile(targetPath, uncompressedData);

        if (process.platform !== 'win32' && entry.unixMode && entry.unixMode > 0) {
            await fs.chmod(targetPath, entry.unixMode).catch(() => {});
        }
    }
}

/**
 * Extracts a ZIP file on disk into the target destination directory.
 */
export async function extractZip(zipFilePath: string, destinationDir: string): Promise<void> {
    const buffer = await fs.readFile(zipFilePath);
    await extractZipBuffer(buffer, destinationDir);
}
