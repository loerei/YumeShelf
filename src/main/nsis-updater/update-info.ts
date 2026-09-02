import * as crypto from 'node:crypto';
import * as fsSync from 'node:fs';
import { normalizeText } from './runtime';

export function pickReleaseName(updateInfo: any): string {
    return normalizeText(updateInfo?.releaseName || updateInfo?.version || '', '');
}

export function pickReleaseNotes(updateInfo: any): string {
    const raw = updateInfo?.releaseNotes;
    if (Array.isArray(raw)) {
        return raw
            .map((entry) => normalizeText(entry?.note || entry))
            .filter(Boolean)
            .join('\n\n---\n\n');
    }
    return normalizeText(raw, '');
}

export function pickExpectedSha512(updateInfo: any): string | null {
    const files = Array.isArray(updateInfo?.files) ? updateInfo.files : [];
    const fileEntry = files.find((entry: any) => {
        const candidate = String(entry?.url || entry?.name || entry?.path || '').toLowerCase();
        return candidate.endsWith('.exe') || candidate.endsWith('.dmg') || candidate.endsWith('.zip');
    }) || files[0];
    return normalizeText(fileEntry?.sha512 || updateInfo?.sha512, null);
}

export async function sha512FileBase64(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha512');
        const stream = fsSync.createReadStream(filePath);
        stream.on('data', chunk => hash.update(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(hash.digest('base64')));
    });
}

export function buildDownloadedState(updateInfo: any, installerPath: string, releaseUrl: string) {
    return {
        downloadedAt: new Date().toISOString(),
        expectedSha512: pickExpectedSha512(updateInfo),
        installerPath: String(installerPath),
        releaseName: pickReleaseName(updateInfo),
        releaseNotes: pickReleaseNotes(updateInfo),
        releaseUrl: normalizeText(releaseUrl, ''),
        version: normalizeText(updateInfo?.version, '')
    };
}

export function normalizeDownloadedState(raw: any) {
    if (!raw || typeof raw !== 'object') return null;
    if (!raw.version || !raw.installerPath) return null;
    return {
        downloadedAt: normalizeText(raw.downloadedAt, null),
        expectedSha512: normalizeText(raw.expectedSha512, null),
        installerPath: String(raw.installerPath),
        releaseName: normalizeText(raw.releaseName, ''),
        releaseNotes: normalizeText(raw.releaseNotes, ''),
        releaseUrl: normalizeText(raw.releaseUrl, ''),
        version: String(raw.version)
    };
}
