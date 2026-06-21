const fs = require('node:fs');
const path = require('node:path');

const INSTALLER_ARTIFACT_REGEX = /^YumeShelf-Setup-(.+)\.exe$/i;

function getBuildOutputDir() {
    return path.resolve(__dirname, '..', 'build_output');
}

function getNsisOutputDir(buildOutputDir = getBuildOutputDir()) {
    return path.join(buildOutputDir, 'nsis');
}

function getNsisApplicationOutputDir(buildOutputDir = getBuildOutputDir()) {
    return path.join(getNsisOutputDir(buildOutputDir), 'application');
}

function getNsisBlockmapOutputDir(buildOutputDir = getBuildOutputDir()) {
    return path.join(getNsisOutputDir(buildOutputDir), 'blockmap');
}

function getNsisChecksumOutputDir(buildOutputDir = getBuildOutputDir()) {
    return path.join(getNsisOutputDir(buildOutputDir), 'sha256');
}

function getNsisFeedOutputDir(buildOutputDir = getBuildOutputDir()) {
    return path.join(getNsisOutputDir(buildOutputDir), 'feed');
}

function getUnpackedOutputDir(buildOutputDir = getBuildOutputDir()) {
    return path.join(buildOutputDir, 'unpacked');
}

function getPortableOutputDir(buildOutputDir = getBuildOutputDir()) {
    return path.join(buildOutputDir, 'portable');
}

function getPortableApplicationOutputDir(buildOutputDir = getBuildOutputDir()) {
    return path.join(getPortableOutputDir(buildOutputDir), 'application');
}

function getPortableChecksumOutputDir(buildOutputDir = getBuildOutputDir()) {
    return path.join(getPortableOutputDir(buildOutputDir), 'sha256');
}

function isInstallerArtifactName(fileName) {
    return INSTALLER_ARTIFACT_REGEX.test(String(fileName || '').trim());
}

function resolveInstallerArtifactPath(version, buildOutputDir = getBuildOutputDir()) {
    return path.join(getNsisApplicationOutputDir(buildOutputDir), `YumeShelf-Setup-${version}.exe`);
}

function resolveNewestInstallerArtifactPath(buildOutputDir = getBuildOutputDir()) {
    const nsisApplicationOutputDir = getNsisApplicationOutputDir(buildOutputDir);
    const candidates = fs.readdirSync(nsisApplicationOutputDir)
        .filter(isInstallerArtifactName)
        .map((name) => {
            const filePath = path.join(nsisApplicationOutputDir, name);
            return {
                filePath,
                mtimeMs: fs.statSync(filePath).mtimeMs
            };
        })
        .sort((left, right) => right.mtimeMs - left.mtimeMs);

    if (candidates.length === 0) {
        throw new Error('No YumeShelf NSIS installer was found in build_output\\nsis\\application.');
    }

    return candidates[0].filePath;
}

module.exports = {
    getBuildOutputDir,
    getNsisOutputDir,
    getNsisApplicationOutputDir,
    getNsisBlockmapOutputDir,
    getNsisChecksumOutputDir,
    getNsisFeedOutputDir,
    getUnpackedOutputDir,
    getPortableOutputDir,
    getPortableApplicationOutputDir,
    getPortableChecksumOutputDir,
    isInstallerArtifactName,
    resolveInstallerArtifactPath,
    resolveNewestInstallerArtifactPath
};
