const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function resolveInputPath() {
    const explicitPath = process.argv[2];
    if (explicitPath) {
        return path.resolve(explicitPath);
    }

    const buildOutputDir = path.resolve(__dirname, '..', 'build_output');
    const candidates = fs.readdirSync(buildOutputDir)
        .filter((name) => /^YumeShelf .*\.exe$/i.test(name))
        .map((name) => path.join(buildOutputDir, name))
        .map((filePath) => ({
            filePath,
            mtimeMs: fs.statSync(filePath).mtimeMs
        }))
        .sort((left, right) => right.mtimeMs - left.mtimeMs);

    if (candidates.length === 0) {
        throw new Error('No YumeShelf release executable was found in build_output.');
    }

    return candidates[0].filePath;
}

function sha256File(filePath) {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function main() {
    const inputPath = resolveInputPath();
    if (!fs.existsSync(inputPath)) {
        throw new Error(`Release executable was not found: ${inputPath}`);
    }

    const digest = sha256File(inputPath);
    const checksumPath = `${inputPath}.sha256`;
    const line = `${digest}  ${path.basename(inputPath)}\n`;
    fs.writeFileSync(checksumPath, line, 'utf8');
    console.log(`Wrote checksum file: ${checksumPath}`);
}

main();
