// @ts-nocheck
const crypto = require('crypto');
const fsSync = require('fs');
const { normalizeText } = require('./runtime');

function pickReleaseName(updateInfo) {
    return normalizeText(updateInfo?.releaseName || updateInfo?.version || '', '');
}

function pickReleaseNotes(updateInfo) {
    const raw = updateInfo?.releaseNotes;
    if (Array.isArray(raw)) {
        return raw
            .map((entry) => normalizeText(entry?.note || entry))
            .filter(Boolean)
            .join('\n\n---\n\n');
    }
    return normalizeText(raw, '');
}

function pickExpectedSha512(updateInfo) {
    const files = Array.isArray(updateInfo?.files) ? updateInfo.files : [];
    const fileEntry = files.find((entry) => {
        const candidate = String(entry?.url || entry?.name || entry?.path || '').toLowerCase();
        return candidate.endsWith('.exe');
    }) || files[0];
    return normalizeText(fileEntry?.sha512 || updateInfo?.sha512, null);
}

async function sha512FileBase64(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha512');
        const stream = fsSync.createReadStream(filePath);
        stream.on('data', chunk => hash.update(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(hash.digest('base64')));
    });
}

function buildDownloadedState(updateInfo, installerPath, releaseUrl) {
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

function normalizeDownloadedState(raw) {
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

module.exports = {
    buildDownloadedState,
    normalizeDownloadedState,
    pickReleaseName,
    pickReleaseNotes,
    sha512FileBase64
};
