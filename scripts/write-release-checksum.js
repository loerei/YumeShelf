const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { resolveNewestInstallerArtifactPath } = require('./release-artifacts');

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

function main() {
    const inputPath = resolveInputPath();
    if (!fs.existsSync(inputPath)) {
        throw new Error(`Release installer was not found: ${inputPath}`);
    }

    const digest = sha256File(inputPath);
    const checksumPath = `${inputPath}.sha256`;
    const line = `${digest}  ${path.basename(inputPath)}\n`;
    fs.writeFileSync(checksumPath, line, 'utf8');
    console.log(`Wrote checksum file: ${checksumPath}`);
}

main();
