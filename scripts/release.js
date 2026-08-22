/**
 * Master Release Orchestrator for YumeShelf
 * Usage: node scripts/release.js <version> [--dry-run] [--local]
 * Example:
 *   npm run release 2.0.2          (Delegates multi-platform packaging to GitHub Actions)
 *   npm run release 2.0.2 --local  (Performs full local packaging for Windows offline)
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isLocalOnly = args.includes('--local');
const versionArg = args.find((arg) => !arg.startsWith('--'));

if (!versionArg && !isDryRun) {
  console.error('❌ Error: Version argument is required.');
  console.log('Usage: node scripts/release.js <version> [--dry-run] [--local]');
  console.log('Example: npm run release 2.0.2');
  process.exit(1);
}

const targetVersion = (versionArg || require('../package.json').version).replace(/^v/, '');

if (!/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/.test(targetVersion)) {
  console.error(`❌ Error: Invalid version format "${targetVersion}". Expected semver (e.g. 2.0.2).`);
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
if (isLocalOnly) {
  console.log('ℹ Mode: Local Offline Build (building Windows installer locally)');
} else {
  console.log('⚡ Mode: Cloud-Parallel Matrix (delegating Windows & Linux packaging to GitHub Actions)');
}

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

// 4. (Optional Local Mode): Build production installer package locally
if (isLocalOnly) {
  console.log('\n🛠️ Step 3: Building production package locally (electron-builder)...');
  run('npm run ensure:playtime-helper && npm run build:preload && npm run build:main && npm run ensure:installer-shell && npm run copy:assets && npm run build:vite && npm run verify:deps && npx electron-builder --win && npm run organize:build-output');

  console.log('\n🔑 Step 4: Generating release SHA-256 checksum...');
  run('node scripts/write-release-checksum.js');

  console.log('\n🔍 Step 5: Verifying release asset integrity...');
  const mandatoryAssets = [
    path.join('build_output', 'nsis', 'application', `YumeShelf-Setup-${targetVersion}.exe`),
    path.join('build_output', 'nsis', 'feed', 'latest.yml'),
    path.join('build_output', 'nsis', 'blockmap', `YumeShelf-Setup-${targetVersion}.exe.blockmap`),
    path.join('build_output', 'nsis', 'sha256', `YumeShelf-Setup-${targetVersion}.exe.sha256`),
  ];

  for (const asset of mandatoryAssets) {
    const fullPath = path.join(rootDir, asset);
    if (!fs.existsSync(fullPath)) {
      console.error(`❌ Missing mandatory asset: ${asset}`);
      if (!isDryRun) process.exit(1);
    } else {
      const size = fs.statSync(fullPath).size;
      console.log(`  ✓ [Windows] ${asset} (${size} bytes)`);
    }
  }
}

// 5. Git commit & tag
console.log('\n📌 Step 3: Git commit & tagging...');
const commitMsg = `release: v${targetVersion} - release notes & version bump`;
run(`git add CHANGELOG.md package.json pnpm-lock.yaml src/ language-packs/ scripts/`, { skipInDryRun: true });
run(`git commit -m "${commitMsg}"`, { skipInDryRun: true });
run(`git push origin main`, { skipInDryRun: true });
run(`git tag v${targetVersion}`, { skipInDryRun: true });
run(`git push origin v${targetVersion}`, { skipInDryRun: true });

if (isLocalOnly) {
  console.log('\n📢 Step 4: Publishing local GitHub Release via gh CLI...');
  const compiledNotesPath = path.join('docs', 'changelogs', `compiled.release-notes.${targetVersion}.md`);
  const ghEnv = { GITHUB_TOKEN: '' };
  const ghCmd = `gh release create v${targetVersion} --title "v${targetVersion}" -F "${compiledNotesPath}" "build_output\\nsis\\application\\YumeShelf-Setup-${targetVersion}.exe" "build_output\\nsis\\feed\\latest.yml" "build_output\\nsis\\blockmap\\YumeShelf-Setup-${targetVersion}.exe.blockmap" "build_output\\nsis\\sha256\\YumeShelf-Setup-${targetVersion}.exe.sha256"`;
  run(ghCmd, { env: ghEnv, skipInDryRun: true });
  console.log(`\n🎉 Successfully published YumeShelf v${targetVersion} locally!`);
} else {
  console.log(`\n🎉 Release v${targetVersion} tag pushed successfully!`);
  console.log('⚡ GitHub Actions has started the parallel multi-platform release pipeline:');
  console.log(`   🔗 https://github.com/loerei/YumeShelf/actions/workflows/release.yml`);
  console.log(`   Windows & Linux installers will be compiled in parallel and attached to:`);
  console.log(`   📦 https://github.com/loerei/YumeShelf/releases/tag/v${targetVersion}\n`);
}
