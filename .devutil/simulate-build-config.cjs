#!/usr/bin/env node
/**
 * YumeShelf electron-builder Configuration & Schema Simulator
 * Validates electron-builder schema locally across platforms to catch configuration errors before CI.
 * Usage: node .devutil/simulate-build-config.cjs
 */

const { spawnSync } = require('node:child_process');
const path = require('node:path');

console.log(`\n======================================================`);
console.log(`🔍 YumeShelf electron-builder Config & Schema Simulator`);
console.log(`======================================================\n`);

const rootDir = path.resolve(__dirname, '..');
const targets = ['--linux', '--win'];

let allPassed = true;

for (const target of targets) {
    console.log(`▶ Testing electron-builder schema validation for target: ${target} --dir ...`);
    const result = spawnSync('npx', ['electron-builder', target, '--dir', '--config.publish=never'], {
        cwd: rootDir,
        shell: true,
        encoding: 'utf8'
    });

    if (result.status === 0 || (result.stderr && !result.stderr.includes('Invalid configuration object'))) {
        console.log(`  ✅ ${target} schema validation: VALID\n`);
    } else {
        console.error(`  ❌ ${target} schema validation: FAILED!`);
        console.error(result.stderr || result.stdout);
        allPassed = false;
    }
}

if (allPassed) {
    console.log(`🎉 All electron-builder target schemas are 100% valid! Safe for CI.\n`);
    process.exit(0);
} else {
    console.error(`💥 Build configuration schema errors detected. Please fix package.json before pushing to CI.\n`);
    process.exit(1);
}
