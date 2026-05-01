const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
    getNsisApplicationOutputDir,
    getNsisChecksumOutputDir,
    getPortableApplicationOutputDir,
    getPortableChecksumOutputDir,
    resolveNewestInstallerArtifactPath
} = require('./release-artifacts');

function resolveInputPath() {
    const explicitPath = process.argv[2];
    if (explicitPath) {
        return path.resolve(explicitPath);
    }

    return resolveNewestInstallerArtifactPath();
}

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

    if (inputDir === getPortableApplicationOutputDir()) {
        return path.join(getPortableChecksumOutputDir(), `${fileName}.sha256`);
    }

    return `${absoluteInputPath}.sha256`;
}

function main() {
    const inputPath = resolveInputPath();
    if (!fs.existsSync(inputPath)) {
        throw new Error(`Release installer was not found: ${inputPath}`);
    }

    const digest = sha256File(inputPath);
    const checksumPath = resolveChecksumPath(inputPath);
    fs.mkdirSync(path.dirname(checksumPath), { recursive: true });
    const line = `${digest}  ${path.basename(inputPath)}\n`;
    fs.writeFileSync(checksumPath, line, 'utf8');
    console.log(`Wrote checksum file: ${checksumPath}`);
}

main();
