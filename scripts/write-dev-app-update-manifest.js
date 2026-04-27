const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function sha256File(filePath) {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function detectVersion(filePath) {
    const match = path.basename(filePath).match(/(\d+\.\d+\.\d+)/);
    return match ? match[1] : null;
}

function resolveOutputPath() {
    const appData = process.env.APPDATA;
    if (!appData) {
        throw new Error('APPDATA is not available in the current environment.');
    }
    return path.join(appData, 'yumeshelf', 'app-update', 'dev-latest.json');
}

function main() {
    const inputPath = process.argv[2];
    if (!inputPath) {
        throw new Error('Usage: node scripts/write-dev-app-update-manifest.js <path-to-exe> [version] [releaseUrl] [releaseNotes]');
    }

    const exePath = path.resolve(inputPath);
    if (!fs.existsSync(exePath)) {
        throw new Error(`Executable was not found: ${exePath}`);
    }

    const version = process.argv[3] || detectVersion(exePath);
    if (!version) {
        throw new Error('Could not infer the version. Pass it explicitly as the second argument.');
    }

    const releaseUrl = process.argv[4] || 'https://github.com/loerei/YumeShelf/releases/latest';
    const releaseNotes = process.argv[5] || `## Local test build\n- Portable updater review flow test for YumeShelf ${version}.`;
    const outputPath = resolveOutputPath();
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify({
        exePath,
        releaseNotes,
        releaseName: `YumeShelf ${version}`,
        releaseUrl,
        sha256: sha256File(exePath),
        version
    }, null, 2)}\n`, 'utf8');
    console.log(`Wrote dev app update manifest: ${outputPath}`);
}

main();
