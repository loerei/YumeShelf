const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
    getBuildOutputDir,
    getNsisApplicationOutputDir,
    getNsisChecksumOutputDir,
    getLinuxApplicationOutputDir,
    getLinuxChecksumOutputDir,
    getMacApplicationOutputDir,
    getMacChecksumOutputDir,
    getPortableApplicationOutputDir,
    getPortableChecksumOutputDir,
    resolveNewestInstallerArtifactPath
} = require('./release-artifacts');

function sha256File(filePath) {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function resolveChecksumPath(inputPath, buildOutputDir = getBuildOutputDir()) {
    const absoluteInputPath = path.resolve(inputPath);
    const inputDir = path.dirname(absoluteInputPath);
    const fileName = path.basename(absoluteInputPath);

    if (inputDir === getNsisApplicationOutputDir(buildOutputDir)) {
        return path.join(getNsisChecksumOutputDir(buildOutputDir), `${fileName}.sha256`);
    }

    if (inputDir === getLinuxApplicationOutputDir(buildOutputDir)) {
        return path.join(getLinuxChecksumOutputDir(buildOutputDir), `${fileName}.sha256`);
    }

    if (inputDir === getMacApplicationOutputDir(buildOutputDir)) {
        return path.join(getMacChecksumOutputDir(buildOutputDir), `${fileName}.sha256`);
    }

    if (inputDir === getPortableApplicationOutputDir(buildOutputDir)) {
        return path.join(getPortableChecksumOutputDir(buildOutputDir), `${fileName}.sha256`);
    }

    return `${absoluteInputPath}.sha256`;
}

function writeChecksumForFile(inputPath, buildOutputDir = getBuildOutputDir()) {
    const digest = sha256File(inputPath);
    const checksumPath = resolveChecksumPath(inputPath, buildOutputDir);
    fs.mkdirSync(path.dirname(checksumPath), { recursive: true });
    const line = `${digest}  ${path.basename(inputPath)}\n`;
    fs.writeFileSync(checksumPath, line, 'utf8');
    console.log(`Wrote checksum file: ${checksumPath}`);
    return checksumPath;
}

function collectApplicationBinaries(buildOutputDir = getBuildOutputDir()) {
    const directories = [
        getNsisApplicationOutputDir(buildOutputDir),
        getLinuxApplicationOutputDir(buildOutputDir),
        getMacApplicationOutputDir(buildOutputDir),
        getPortableApplicationOutputDir(buildOutputDir)
    ];

    const targets = [];
    for (const dir of directories) {
        if (fs.existsSync(dir)) {
            const entries = fs.readdirSync(dir);
            for (const entry of entries) {
                if (entry.endsWith('.sha256') || entry.endsWith('.blockmap')) continue;
                const fullPath = path.join(dir, entry);
                if (fs.statSync(fullPath).isFile()) {
                    targets.push(fullPath);
                }
            }
        }
    }

    return targets;
}

function main(buildOutputDir = getBuildOutputDir()) {
    const explicitPath = process.argv[2];
    if (explicitPath) {
        const resolved = path.resolve(explicitPath);
        if (!fs.existsSync(resolved)) {
            throw new Error(`Release installer was not found: ${resolved}`);
        }
        writeChecksumForFile(resolved, buildOutputDir);
        return;
    }

    const discoveredTargets = collectApplicationBinaries(buildOutputDir);
    if (discoveredTargets.length > 0) {
        for (const target of discoveredTargets) {
            writeChecksumForFile(target, buildOutputDir);
        }
        return;
    }

    let fallbackPath = null;
    try {
        fallbackPath = resolveNewestInstallerArtifactPath(buildOutputDir);
    } catch {
        fallbackPath = null;
    }

    if (fallbackPath && fs.existsSync(fallbackPath)) {
        writeChecksumForFile(fallbackPath, buildOutputDir);
        return;
    }

    console.log('[write-release-checksum] No application binaries found to checksum.');
}

if (require.main === module) {
    main();
}

module.exports = {
    sha256File,
    resolveChecksumPath,
    writeChecksumForFile,
    collectApplicationBinaries,
    writeReleaseChecksums: main
};