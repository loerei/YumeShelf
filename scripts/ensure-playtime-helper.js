const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const repoRoot = path.resolve(__dirname, '..');
const HELPER_EXE_NAME = process.platform === 'win32' ? 'playtime-helper.exe' : 'playtime-helper';
const helperProjectDir = path.join(repoRoot, 'native', 'playtime-helper');
const helperReleasePath = path.join(helperProjectDir, 'target', 'release', HELPER_EXE_NAME);

function listSourceFiles(dirPath) {
    const results = [];
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    entries.forEach((entry) => {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            results.push(...listSourceFiles(fullPath));
            return;
        }
        results.push(fullPath);
    });
    return results;
}

function getNewestSourceMtimeMs() {
    const sourceDirs = [
        path.join(helperProjectDir, 'src')
    ];
    const sourceFiles = [
        path.join(helperProjectDir, 'Cargo.toml'),
        path.join(helperProjectDir, 'Cargo.lock'),
        ...sourceDirs.flatMap((dirPath) => fs.existsSync(dirPath) ? listSourceFiles(dirPath) : [])
    ];
    return sourceFiles.reduce((maxValue, filePath) => {
        const stat = fs.statSync(filePath);
        return Math.max(maxValue, stat.mtimeMs);
    }, 0);
}

function shouldBuildHelper() {
    if (!fs.existsSync(helperReleasePath)) {
        return true;
    }
    const helperMtimeMs = fs.statSync(helperReleasePath).mtimeMs;
    return getNewestSourceMtimeMs() > helperMtimeMs;
}

function run(command, args) {
    const result = spawnSync(command, args, {
        cwd: repoRoot,
        stdio: 'inherit',
        shell: false
    });

    if (result.status !== 0) {
        throw new Error(`Command failed: ${command} ${args.join(' ')}`);
    }
}

function main() {
    if (!shouldBuildHelper()) {
        console.log(`[playtime-helper] using existing build ${helperReleasePath}`);
        return;
    }

    console.log(`[playtime-helper] building Rust helper at ${helperProjectDir}`);
    run('cargo', ['build', '--release', '--manifest-path', path.join(helperProjectDir, 'Cargo.toml')]);
    if (!fs.existsSync(helperReleasePath)) {
        throw new Error(`Expected playtime helper was not built: ${helperReleasePath}`);
    }
    console.log(`[playtime-helper] ready ${helperReleasePath}`);
}

main();
