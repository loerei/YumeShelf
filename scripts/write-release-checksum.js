const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
    getNsisApplicationOutputDir,
    getNsisChecksumOutputDir,
    getLinuxApplicationOutputDir,
    getLinuxChecksumOutputDir,
    getPortableApplicationOutputDir,
    getPortableChecksumOutputDir,
    resolveNewestInstallerArtifactPath
} = require('./release-artifacts');

function sha256File(filePath) {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function resolveChecksumPath(inputPath) {
    const absoluteInputPath = path.resolve(inputPath);
    const inputDir = path.dirname(absoluteInputPath);
    const fileName = path.basename(absoluteInputPath);

    if (inputDir === getNsisApplicationOutputDir()) {
        return path.join(getNsisChecksumOutputDir(), `${fileName}.sha256`);
    }

    if (inputDir === getLinuxApplicationOutputDir()) {
        return path.join(getLinuxChecksumOutputDir(), `${fileName}.sha256`);
    }

    if (inputDir === getPortableApplicationOutputDir()) {
        return path.join(getPortableChecksumOutputDir(), `${fileName}.sha256`);
    }

    return `${absoluteInputPath}.sha256`;
}

function writeChecksumForFile(inputPath) {
    const digest = sha256File(inputPath);
    const checksumPath = resolveChecksumPath(inputPath);
    fs.mkdirSync(path.dirname(checksumPath), { recursive: true });
    const line = `${digest}  ${path.basename(inputPath)}\n`;
    fs.writeFileSync(checksumPath, line, 'utf8');
    console.log(`Wrote checksum file: ${checksumPath}`);
}

function collectApplicationBinaries() {
    const directories = [
        getNsisApplicationOutputDir(),
        getLinuxApplicationOutputDir(),
        getPortableApplicationOutputDir()
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

function main() {
    const explicitPath = process.argv[2];
    if (explicitPath) {
        const resolved = path.resolve(explicitPath);
        if (!fs.existsSync(resolved)) {
            throw new Error(`Release installer was not found: ${resolved}`);
        }
        writeChecksumForFile(resolved);
        return;
    }

    const discoveredTargets = collectApplicationBinaries();
    if (discoveredTargets.length > 0) {
        for (const target of discoveredTargets) {
            writeChecksumForFile(target);
        }
        return;
    }

    const fallbackPath = resolveNewestInstallerArtifactPath();
    if (!fs.existsSync(fallbackPath)) {
        throw new Error(`Release installer was not found: ${fallbackPath}`);
    }
    writeChecksumForFile(fallbackPath);
}

main();
