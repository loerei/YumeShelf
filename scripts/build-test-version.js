const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const syncScriptPath = path.join(__dirname, 'sync-release-metadata.js');
const packageJsonPath = path.join(repoRoot, 'package.json');
const packageLockPath = path.join(repoRoot, 'package-lock.json');
const builtinsDir = path.join(repoRoot, 'src', 'locales', 'builtins');
const packsDir = path.join(repoRoot, 'language-packs', 'packs');
const manifestPath = path.join(repoRoot, 'language-packs', 'manifest.json');
const sampleTemplatePath = path.join(repoRoot, 'language-packs', 'templates', 'en.sample.json');

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function listSnapshotFiles() {
    const builtinFiles = fs.readdirSync(builtinsDir)
        .filter((fileName) => fileName.endsWith('.json'))
        .map((fileName) => path.join(builtinsDir, fileName));
    const packFiles = fs.readdirSync(packsDir)
        .filter((fileName) => fileName.endsWith('.json'))
        .map((fileName) => path.join(packsDir, fileName));

    return [
        packageJsonPath,
        packageLockPath,
        manifestPath,
        sampleTemplatePath,
        ...builtinFiles,
        ...packFiles
    ];
}

function snapshotFiles(filePaths) {
    const snapshot = new Map();
    filePaths.forEach((filePath) => {
        snapshot.set(filePath, fs.readFileSync(filePath));
    });
    return snapshot;
}

function restoreSnapshot(snapshot) {
    for (const [filePath, content] of snapshot.entries()) {
        fs.writeFileSync(filePath, content);
    }
}

function run(command, args) {
    const isWindowsNpm = process.platform === 'win32' && command === 'npm';
    const executable = isWindowsNpm
        ? (process.env.ComSpec || 'cmd.exe')
        : command;
    const finalArgs = isWindowsNpm
        ? ['/d', '/c', 'npm', ...args]
        : args;
    const result = spawnSync(executable, finalArgs, {
        cwd: repoRoot,
        stdio: 'inherit',
        shell: false
    });

    if (result.status !== 0) {
        throw new Error(`Command failed: ${executable} ${finalArgs.join(' ')}`);
    }
}

function getPackageVersion() {
    return readJson(packageJsonPath).version;
}

function parseCliArgs(argv) {
    let targetVersion = null;
    let cleanBuild = true;

    argv.forEach((arg) => {
        if (arg === '--no-clean') {
            cleanBuild = false;
            return;
        }

        if (!targetVersion) {
            if (/^\d+\.\d+\.\d+$/.test(arg)) {
                targetVersion = arg;
                return;
            }

            const dashedVersion = String(arg).match(/^--(\d+\.\d+\.\d+)$/);
            if (dashedVersion) {
                targetVersion = dashedVersion[1];
            }
        }
    });

    return {
        cleanBuild,
        targetVersion
    };
}

function main() {
    const { targetVersion, cleanBuild } = parseCliArgs(process.argv.slice(2));

    if (!targetVersion || !/^\d+\.\d+\.\d+$/.test(targetVersion)) {
        throw new Error('Usage: npm run build:test-version -- <x.y.z> | --<x.y.z> [--no-clean]');
    }

    const originalVersion = getPackageVersion();
    const snapshot = snapshotFiles(listSnapshotFiles());
    const buildScript = cleanBuild ? 'build:fast:clean' : 'build:fast';

    console.log(`[build:test-version] original version: ${originalVersion}`);
    console.log(`[build:test-version] target version: ${targetVersion}`);
    console.log(`[build:test-version] build script: ${buildScript}`);

    try {
        run(process.execPath, [syncScriptPath, targetVersion]);
        run('npm', ['run', buildScript]);
        console.log(`[build:test-version] built build_output\\YumeShelf ${targetVersion}.exe`);
    } finally {
        restoreSnapshot(snapshot);
        console.log(`[build:test-version] restored workspace metadata to ${originalVersion}`);
    }
}

main();
