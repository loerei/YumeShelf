/**
 * Master Release Orchestrator for YumeShelf
 * Usage: node scripts/release.js <version> [--dry-run]
 * Example: node scripts/release.js 1.5.12
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const versionArg = args.find((arg) => !arg.startsWith('--'));

if (!versionArg && !isDryRun) {
  console.error('❌ Error: Version argument is required.');
  console.log('Usage: node scripts/release.js <version> [--dry-run]');
  console.log('Example: node scripts/release.js 1.5.12');
  process.exit(1);
}

const targetVersion = (versionArg || require('../package.json').version).replace(/^v/, '');

if (!/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/.test(targetVersion)) {
  console.error(`❌ Error: Invalid version format "${targetVersion}". Expected semver (e.g. 1.5.12).`);
  process.exit(1);
}

const rootDir = path.resolve(__dirname, '..');

function run(command, options = {}) {
  console.log(`\n▶ Executing: ${command}`);
  if (isDryRun && options.skipInDryRun) {
    console.log(`[Dry-Run] Skipped: ${command}`);
    return '';
  }
  return execSync(command, {
    cwd: rootDir,
    stdio: 'inherit',
    env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false', ...options.env },
  });
}

console.log(`\n🚀 Starting YumeShelf Release Process for v${targetVersion} ${isDryRun ? '(DRY RUN)' : ''}...`);

// 1. Sync version in package.json if needed
const pkgPath = path.join(rootDir, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
if (pkg.version !== targetVersion) {
  console.log(`\n📦 Bumping package.json version from ${pkg.version} to ${targetVersion}`);
  pkg.version = targetVersion;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
}

// 2. Compile release notes
console.log('\n📝 Step 1: Compiling release notes...');
run('node scripts/compile-release-notes.js --release');

// 3. Sync release metadata
console.log('\n🔄 Step 2: Syncing release metadata...');
run('node scripts/sync-release-metadata.js');

// 4. Build production installer package
console.log('\n🛠️ Step 3: Building production package (electron-builder)...');
run('npm run ensure:playtime-helper && npm run build:preload && npm run build:main && npm run ensure:installer-shell && npm run copy:assets && npm run build:vite && npx electron-builder --win && npm run organize:build-output');

// 5. Generate checksum
console.log('\n🔑 Step 4: Generating release SHA-256 checksum...');
run('node scripts/write-release-checksum.js');

// 6. Verify mandatory assets & discover all release artifacts
console.log('\n🔍 Step 5: Verifying release asset integrity...');
const mandatoryAssets = [
  path.join('build_output', 'nsis', 'application', `YumeShelf-Setup-${targetVersion}.exe`),
  path.join('build_output', 'nsis', 'feed', 'latest.yml'),
  path.join('build_output', 'nsis', 'blockmap', `YumeShelf-Setup-${targetVersion}.exe.blockmap`),
  path.join('build_output', 'nsis', 'sha256', `YumeShelf-Setup-${targetVersion}.exe.sha256`),
];

const optionalLinuxAssets = [
  path.join('build_output', 'linux', 'application', `YumeShelf-${targetVersion}.AppImage`),
  path.join('build_output', 'linux', 'sha256', `YumeShelf-${targetVersion}.AppImage.sha256`),
  path.join('build_output', 'linux', 'application', `YumeShelf-${targetVersion}.tar.gz`),
  path.join('build_output', 'linux', 'sha256', `YumeShelf-${targetVersion}.tar.gz.sha256`),
  path.join('build_output', 'linux', 'feed', 'latest-linux.yml'),
];

let missing = false;
const releaseAssets = [];

for (const asset of mandatoryAssets) {
  const fullPath = path.join(rootDir, asset);
  if (!fs.existsSync(fullPath)) {
    console.error(`❌ Missing mandatory asset: ${asset}`);
    missing = true;
  } else {
    const size = fs.statSync(fullPath).size;
    console.log(`  ✓ [Windows] ${asset} (${size} bytes)`);
    releaseAssets.push(asset);
  }
}

for (const asset of optionalLinuxAssets) {
  const fullPath = path.join(rootDir, asset);
  if (fs.existsSync(fullPath)) {
    const size = fs.statSync(fullPath).size;
    console.log(`  ✓ [Linux] ${asset} (${size} bytes)`);
    releaseAssets.push(asset);
  }
}

if (missing && !isDryRun) {
  console.error('\n❌ Release failed: One or more required assets are missing.');
  process.exit(1);
}

// 7. Git commit & tag
console.log('\n📌 Step 6: Git commit & tagging...');
const commitMsg = `release: v${targetVersion} - release notes & production build`;
run(`git add CHANGELOG.md package.json pnpm-lock.yaml src/ language-packs/ scripts/`, { skipInDryRun: true });
run(`git commit -m "${commitMsg}"`, { skipInDryRun: true });
run(`git push origin main`, { skipInDryRun: true });
run(`git tag v${targetVersion}`, { skipInDryRun: true });
run(`git push origin v${targetVersion}`, { skipInDryRun: true });

// 8. Publish GitHub Release via gh CLI
console.log('\n📢 Step 7: Publishing GitHub Release via gh CLI...');
const compiledNotesPath = path.join('docs', 'changelogs', `compiled.release-notes.${targetVersion}.md`);
const assetArgs = releaseAssets.map((a) => `"${a}"`).join(' ');

// Clear dummy GITHUB_TOKEN so gh falls back to system keyring
const ghEnv = { GITHUB_TOKEN: '' };
const ghCmd = `gh release create v${targetVersion} --title "v${targetVersion}" -F "${compiledNotesPath}" ${assetArgs}`;

run(ghCmd, { env: ghEnv, skipInDryRun: true });

console.log(`\n🎉 Successfully published YumeShelf v${targetVersion}!`);
