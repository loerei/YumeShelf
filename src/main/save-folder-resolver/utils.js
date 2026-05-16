const path = require('path');
const fs = require('fs/promises');

async function exists(target) {
    try {
        await fs.access(target);
        return true;
    } catch {
        return false;
    }
}

async function globMatch(dir, pattern) {
    try {
        const entries = await fs.readdir(dir);
        return entries.some((entry) => pattern.test(entry));
    } catch {
        return false;
    }
}

function normalizeForSearch(text) {
    if (!text) return '';
    return String(text)
        .toLowerCase()
        .replace(/[v\.\s\-\_]+/g, '')
        .replace(/[^a-z0-9]/g, '')
        .trim();
}

function getExeStem(exeDir) {
    const dirName = path.basename(exeDir);
    let stem = dirName.replace(/_Data$/i, '');
    stem = stem.replace(/\s*(v?\d+[\.\d]*)\s*/gi, ' ').replace(/\s*pc\s*/gi, ' ').trim();
    return stem;
}

function getExeStemFromPath(exePath) {
    const baseName = path.basename(exePath || '');
    let stem = baseName.replace(/\.exe$/i, '');
    stem = stem.replace(/\s*(v?\d+[\.\d]*)\s*/gi, ' ').replace(/\s*pc\s*/gi, ' ').trim();
    return stem;
}

module.exports = {
    exists,
    globMatch,
    normalizeForSearch,
    getExeStem,
    getExeStemFromPath
};
