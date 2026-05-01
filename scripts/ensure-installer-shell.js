const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const shellArtifactPath = path.join(repoRoot, 'build', 'installer-shell-dist', 'YumeShelfInstallerShell.exe');
const builderCliPath = path.join(repoRoot, 'node_modules', 'electron-builder', 'cli.js');
const builderConfigPath = path.join(repoRoot, 'build', 'installer-shell-builder.js');

function runShellBuild({ fast }) {
    const args = [
        builderCliPath,
        'build',
        '--config',
        builderConfigPath,
        '--win',
        'portable'
    ];

    if (fast) {
        args.push(
            '--config.win.signAndEditExecutable=false',
            '--config.win.signtoolOptions.sign=./scripts/noop-windows-sign.js'
        );
    }

    const result = spawnSync(process.execPath, args, {
        cwd: repoRoot,
        stdio: 'inherit',
        env: {
            ...process.env,
            CSC_IDENTITY_AUTO_DISCOVERY: fast ? 'false' : process.env.CSC_IDENTITY_AUTO_DISCOVERY
        }
    });

    if (result.status !== 0) {
        process.exit(result.status || 1);
    }
}

function ensureArtifactPresent() {
    if (!fs.existsSync(shellArtifactPath)) {
        throw new Error(`Installer shell artifact was not produced: ${shellArtifactPath}`);
    }
}

function main() {
    const fast = process.argv.includes('--fast');
    runShellBuild({ fast });
    ensureArtifactPresent();
    console.log(`[installer-shell] ready ${path.relative(repoRoot, shellArtifactPath).replace(/\//g, '\\')}`);
}

main();
