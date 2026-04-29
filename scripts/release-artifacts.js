const fs = require('fs');
const path = require('path');

const INSTALLER_ARTIFACT_REGEX = /^YumeShelf-Setup-(.+)\.exe$/i;

function getBuildOutputDir() {
    return path.resolve(__dirname, '..', 'build_output');
}

function isInstallerArtifactName(fileName) {
    return INSTALLER_ARTIFACT_REGEX.test(String(fileName || '').trim());
}

function resolveInstallerArtifactPath(version, buildOutputDir = getBuildOutputDir()) {
    return path.join(buildOutputDir, `YumeShelf-Setup-${version}.exe`);
}

function resolveNewestInstallerArtifactPath(buildOutputDir = getBuildOutputDir()) {
    const candidates = fs.readdirSync(buildOutputDir)
        .filter(isInstallerArtifactName)
        .map((name) => {
            const filePath = path.join(buildOutputDir, name);
            return {
                filePath,
                mtimeMs: fs.statSync(filePath).mtimeMs
            };
        })
        .sort((left, right) => right.mtimeMs - left.mtimeMs);

    if (candidates.length === 0) {
        throw new Error('No YumeShelf NSIS installer was found in build_output.');
    }

    return candidates[0].filePath;
}

module.exports = {
    getBuildOutputDir,
    isInstallerArtifactName,
    resolveInstallerArtifactPath,
    resolveNewestInstallerArtifactPath
};
