const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_FEED_PORT = 5505;

function detectVersion(filePath) {
    const match = path.basename(filePath).match(/(\d+\.\d+\.\d+)/);
    return match ? match[1] : null;
}

function resolveAppDataPath() {
    const appData = process.env.APPDATA;
    if (!appData) {
        throw new Error('APPDATA is not available in the current environment.');
    }
    return path.join(appData, 'yumeshelf', 'app-update');
}

function toIndentedBlock(value) {
    return String(value || '')
        .split(/\r?\n/)
        .map(line => `  ${line}`)
        .join('\n');
}

function patchLatestYml(raw, { installerFileName, releaseName, releaseNotes }) {
    let output = String(raw || '')
        .replace(/^(\s*-\s+url:\s+).+$/m, `$1${installerFileName}`)
        .replace(/^(\s*path:\s+).+$/m, `$1${installerFileName}`);

    output = output.replace(/\nreleaseName:.*$/m, '');
    output = output.replace(/\nreleaseNotes:\s*\|-[\s\S]*$/m, '');

    output = output.trimEnd();
    output += `\nreleaseName: ${JSON.stringify(String(releaseName || ''))}`;
    output += `\nreleaseNotes: |-\n${toIndentedBlock(releaseNotes)}\n`;
    return output;
}

function main() {
    const inputPath = process.argv[2];
    if (!inputPath) {
        throw new Error('Usage: node scripts/write-dev-app-update-manifest.js <path-to-installer> [version] [feedUrl] [releaseUrl] [releaseName] [releaseNotes]');
    }

    const installerPath = path.resolve(inputPath);
    if (!fs.existsSync(installerPath)) {
        throw new Error(`Installer was not found: ${installerPath}`);
    }

    const version = process.argv[3] || detectVersion(installerPath);
    if (!version) {
        throw new Error('Could not infer the version. Pass it explicitly as the second argument.');
    }

    const feedUrl = process.argv[4] || `http://127.0.0.1:${DEFAULT_FEED_PORT}`;
    const releaseUrl = process.argv[5] || 'https://github.com/loerei/YumeShelf/releases/latest';
    const releaseName = process.argv[6] || `YumeShelf ${version}`;
    const releaseNotes = process.argv[7] || `## Local test build\n- Installer/update engine test for YumeShelf ${version}.`;

    const installerDir = path.dirname(installerPath);
    const installerFileName = path.basename(installerPath);
    const latestYmlPath = path.join(installerDir, 'latest.yml');
    const blockmapPath = `${installerPath}.blockmap`;

    if (!fs.existsSync(latestYmlPath)) {
        throw new Error(`latest.yml was not found next to the installer: ${latestYmlPath}`);
    }

    if (!fs.existsSync(blockmapPath)) {
        throw new Error(`Installer blockmap was not found: ${blockmapPath}`);
    }

    const appUpdateRoot = resolveAppDataPath();
    const feedDir = path.join(appUpdateRoot, 'dev-feed');
    fs.mkdirSync(feedDir, { recursive: true });

    fs.copyFileSync(installerPath, path.join(feedDir, installerFileName));
    fs.copyFileSync(blockmapPath, path.join(feedDir, `${installerFileName}.blockmap`));
    fs.writeFileSync(
        path.join(feedDir, 'latest.yml'),
        patchLatestYml(fs.readFileSync(latestYmlPath, 'utf8'), {
            installerFileName,
            releaseName,
            releaseNotes
        }),
        'utf8'
    );

    const devConfigPath = path.resolve(__dirname, '..', 'dev-app-update.yml');
    fs.writeFileSync(devConfigPath, [
        'provider: generic',
        `url: ${feedUrl}`,
        'updaterCacheDirName: yumeshelf-updater-dev'
    ].join('\n') + '\n', 'utf8');

    const feedMetaPath = path.join(feedDir, 'release.json');
    fs.writeFileSync(feedMetaPath, `${JSON.stringify({
        releaseName,
        releaseNotes,
        releaseUrl,
        version
    }, null, 2)}\n`, 'utf8');

    console.log(`Prepared dev app update feed: ${feedDir}`);
    console.log(`Wrote dev-app-update config: ${devConfigPath}`);
    console.log(`Serve the feed with: npm run mock:app-update:serve`);
}

main();
