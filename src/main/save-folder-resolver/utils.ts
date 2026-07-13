import * as path from 'node:path';
import * as fs from 'node:fs/promises';

export async function exists(target: string): Promise<boolean> {
    try {
        await fs.access(target);
        return true;
    } catch {
        return false;
    }
}

export async function globMatch(dir: string, pattern: RegExp): Promise<boolean> {
    try {
        const entries = await fs.readdir(dir);
        return entries.some((entry) => pattern.test(entry));
    } catch {
        return false;
    }
}

export function normalizeForSearch(text: any): string {
    if (!text) return '';
    return String(text)
        .toLowerCase()
        .replace(/[v.\s-_]+/g, '')
        .replace(/[^a-z0-9]/g, '')
        .trim();
}

export function getExeStem(exeDir: string): string {
    const dirName = path.basename(exeDir);
    let stem = dirName.replace(/_Data$/i, '');
    stem = stem.replace(/\b(v?\d+(?:\.\d+)*)\b/gi, ' ').replace(/\bpc\b/gi, ' ').replace(/\s+/g, ' ').trim();
    return stem;
}

export function getExeStemFromPath(exePath: string): string {
    const baseName = path.basename(exePath || '');
    let stem = baseName.replace(/\.exe$/i, '');
    stem = stem.replace(/\b(v?\d+(?:\.\d+)*)\b/gi, ' ').replace(/\bpc\b/gi, ' ').replace(/\s+/g, ' ').trim();
    return stem;
}
