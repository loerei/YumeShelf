const fs = require('fs');
const path = require('path');

const HELPER_EXE_NAME = 'playtime-helper.exe';

function getRepoRoot() {
    return path.resolve(__dirname, '..', '..');
}

function getNativeHelperProjectDir() {
    return path.join(getRepoRoot(), 'native', 'playtime-helper');
}

function getNativeHelperReleasePath() {
    return path.join(getNativeHelperProjectDir(), 'target', 'release', HELPER_EXE_NAME);
}

function getPackagedHelperRelativePath() {
    return path.join('native', 'playtime-helper', HELPER_EXE_NAME);
}

function resolvePackagedHelperPath(resourcesPath) {
    return path.join(resourcesPath, getPackagedHelperRelativePath());
}

function resolvePlaytimeHelperPath({ app, resourcesPath = process.resourcesPath } = {}) {
    if (app?.isPackaged) {
        return resolvePackagedHelperPath(resourcesPath);
    }
    return getNativeHelperReleasePath();
}

function assertPlaytimeHelperExists(helperPath) {
    if (!fs.existsSync(helperPath)) {
        throw new Error(`Playtime helper was not found: ${helperPath}`);
    }
    return helperPath;
}

module.exports = {
    HELPER_EXE_NAME,
    assertPlaytimeHelperExists,
    getNativeHelperProjectDir,
    getNativeHelperReleasePath,
    getPackagedHelperRelativePath,
    resolvePackagedHelperPath,
    resolvePlaytimeHelperPath
};
