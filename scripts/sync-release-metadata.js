const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const packageJsonPath = path.join(repoRoot, 'package.json');
const packageLockPath = path.join(repoRoot, 'package-lock.json');
const builtinsDir = path.join(repoRoot, 'src', 'locales', 'builtins');
const packsDir = path.join(repoRoot, 'language-packs', 'packs');
const manifestPath = path.join(repoRoot, 'language-packs', 'manifest.json');
const sampleTemplatePath = path.join(repoRoot, 'language-packs', 'templates', 'en.sample.json');

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function assertVersion(version) {
    if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
        throw new Error(`Invalid version '${version}'. Expected x.y.z or x.y.z-prerelease`);
    }
}

function sha256File(filePath) {
    const data = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(data).digest('hex');
}

function updateReviewedVersion(filePath, version) {
    const json = readJson(filePath);
    json.reviewedForAppVersion = version;
    writeJson(filePath, json);
    return json;
}

function main() {
    const requestedVersion = process.argv[2] || null;
    const packageJson = readJson(packageJsonPath);
    const nextVersion = requestedVersion || packageJson.version;
    assertVersion(nextVersion);

    packageJson.version = nextVersion;
    writeJson(packageJsonPath, packageJson);

    const packageLock = readJson(packageLockPath);
    packageLock.version = nextVersion;
    if (packageLock.packages?.['']) {
        packageLock.packages[''].version = nextVersion;
    }
    writeJson(packageLockPath, packageLock);

    const builtinFiles = fs.readdirSync(builtinsDir).filter(file => file.endsWith('.json'));
    builtinFiles.forEach((fileName) => {
        updateReviewedVersion(path.join(builtinsDir, fileName), nextVersion);
    });

    updateReviewedVersion(sampleTemplatePath, nextVersion);

    const packFiles = fs.readdirSync(packsDir).filter(file => file.endsWith('.json')).sort();
    const manifestPacks = packFiles.map((fileName) => {
        const filePath = path.join(packsDir, fileName);
        const pack = updateReviewedVersion(filePath, nextVersion);
        return {
            code: pack.code,
            englishName: pack.englishName,
            nativeName: pack.nativeName,
            packVersion: pack.packVersion,
            minAppVersion: pack.minAppVersion || null,
            reviewedForAppVersion: pack.reviewedForAppVersion || null,
            aliases: pack.aliases || [],
            keywords: pack.keywords || [],
            downloadUrl: `https://raw.githubusercontent.com/loerei/YumeShelf/main/language-packs/packs/${fileName}`,
            sha256: sha256File(filePath)
        };
    });

    const manifest = readJson(manifestPath);
    manifest.generatedAt = new Date().toISOString();
    manifest.packs = manifestPacks;
    writeJson(manifestPath, manifest);

    console.log(`Synced release metadata for version ${nextVersion}`);
}

main();
