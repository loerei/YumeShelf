const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const helperProjectDir = path.join(repoRoot, 'native', 'playtime-helper');
const DEFAULT_HELPER_RELEASE_PATH = path.join(__dirname, '../native/playtime-helper/target/release/playtime-helper');

function listSourceFiles(dirPath) {
    const results = [];
    if (!fs.existsSync(dirPath)) return results;
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            results.push(...listSourceFiles(fullPath));
        } else {
            results.push(fullPath);
        }
    }
    return results;
}

function getNewestSourceMtimeMs(projectDir = helperProjectDir) {
    const sourceDirs = [path.join(projectDir, 'src')];
    const sourceFiles = [
        path.join(projectDir, 'Cargo.toml'),
        path.join(projectDir, 'Cargo.lock'),
        ...sourceDirs.flatMap((dirPath) => listSourceFiles(dirPath))
    ];
    return sourceFiles.reduce((maxValue, filePath) => {
        if (!fs.existsSync(filePath)) return maxValue;
        const stat = fs.statSync(filePath);
        return Math.max(maxValue, stat.mtimeMs);
    }, 0);
}

function isUniversalLipoOutput(stdout) {
    if (typeof stdout !== 'string') return false;
    const lines = stdout.split(/\r?\n/);
    for (const line of lines) {
        const match = line.match(/(?:are|architecture):\s*(.*)$/i);
        if (match) {
            const archPart = match[1];
            const archTokens = archPart.trim().split(/\s+/);
            if (archTokens.includes('arm64') && archTokens.includes('x86_64')) {
                return true;
            }
        }
    }
    return false;
}

function shouldBuildUniversalHelper({
    helperReleasePath,
    newestSourceMtimeMs,
    lipoStdout,
    lipoStatus,
    existsFn = fs.existsSync,
    statFn = fs.statSync,
    runLipoFn = (binaryPath) => spawnSync('lipo', ['-info', binaryPath], { encoding: 'utf8', shell: false })
} = {}) {
    // 1. File existence and path validation
    if (!helperReleasePath || !existsFn(helperReleasePath)) {
        return true;
    }

    // 2. Timestamp freshness check
    let stat;
    try {
        stat = statFn(helperReleasePath);
    } catch {
        return true;
    }

    if (
        typeof newestSourceMtimeMs !== 'number' ||
        Number.isNaN(newestSourceMtimeMs) ||
        newestSourceMtimeMs <= 0 ||
        stat.mtimeMs < newestSourceMtimeMs
    ) {
        return true;
    }

    // 3. Universal architecture check
    if (lipoStatus !== undefined || lipoStdout !== undefined) {
        const status = lipoStatus !== undefined ? lipoStatus : 0;
        const out = typeof lipoStdout === 'string' ? lipoStdout : '';
        if (status !== 0 || !isUniversalLipoOutput(out)) {
            return true;
        }
    } else {
        try {
            const lipoRes = runLipoFn(helperReleasePath);
            if (!lipoRes || lipoRes.error || lipoRes.status !== 0 || !lipoRes.stdout) {
                return true;
            }
            if (!isUniversalLipoOutput(lipoRes.stdout)) {
                return true;
            }
        } catch {
            return true;
        }
    }

    // 4. Cache hit
    return false;
}

function run(command, args, cwd = repoRoot) {
    const result = spawnSync(command, args, {
        cwd,
        stdio: 'inherit',
        shell: false
    });

    if (result.status !== 0) {
        throw new Error(`Command failed: ${command} ${args.join(' ')}`);
    }
}

function main() {
    if (process.platform !== 'darwin') {
        console.error(`[playtime-helper-universal] building macOS universal helper requires macOS (darwin), current platform: ${process.platform}`);
        process.exit(1);
    }

    const helperReleasePath = DEFAULT_HELPER_RELEASE_PATH;
    const newestSourceMtimeMs = getNewestSourceMtimeMs();

    if (!shouldBuildUniversalHelper({ helperReleasePath, newestSourceMtimeMs })) {
        console.log(`[playtime-helper-universal] using existing universal helper at ${helperReleasePath}`);
        return;
    }

    console.log(`[playtime-helper-universal] building Universal Rust helper at ${helperProjectDir}`);
    const cargoManifest = path.join(helperProjectDir, 'Cargo.toml');

    console.log('[playtime-helper-universal] building for aarch64-apple-darwin...');
    run('cargo', ['build', '--release', '--manifest-path', cargoManifest, '--target', 'aarch64-apple-darwin']);

    console.log('[playtime-helper-universal] building for x86_64-apple-darwin...');
    run('cargo', ['build', '--release', '--manifest-path', cargoManifest, '--target', 'x86_64-apple-darwin']);

    const arm64Binary = path.join(helperProjectDir, 'target', 'aarch64-apple-darwin', 'release', 'playtime-helper');
    const x86_64Binary = path.join(helperProjectDir, 'target', 'x86_64-apple-darwin', 'release', 'playtime-helper');

    if (!fs.existsSync(arm64Binary)) {
        throw new Error(`Expected aarch64 binary not found at ${arm64Binary}`);
    }
    if (!fs.existsSync(x86_64Binary)) {
        throw new Error(`Expected x86_64 binary not found at ${x86_64Binary}`);
    }

    fs.mkdirSync(path.dirname(helperReleasePath), { recursive: true });
    fs.rmSync(helperReleasePath, { recursive: true, force: true });

    console.log(`[playtime-helper-universal] merging universal binary into ${helperReleasePath}...`);
    run('lipo', ['-create', arm64Binary, x86_64Binary, '-output', helperReleasePath]);

    if (!fs.existsSync(helperReleasePath)) {
        throw new Error(`Expected universal playtime helper was not built: ${helperReleasePath}`);
    }

    fs.chmodSync(helperReleasePath, 0o755);
    console.log(`[playtime-helper-universal] ready universal binary at ${helperReleasePath}`);
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_HELPER_RELEASE_PATH,
    listSourceFiles,
    getNewestSourceMtimeMs,
    isUniversalLipoOutput,
    shouldBuildUniversalHelper,
    main
};
