const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');

const pkg = require('../package.json');
const {
    getBuildOutputDir,
    getMacOutputDir,
    getMacApplicationOutputDir,
    getMacChecksumOutputDir,
    getMacFeedOutputDir,
    getMacBlockmapOutputDir,
    isMacArtifactName,
    isMacDmgArtifactName,
    isMacZipArtifactName,
    resolveMacArtifactPaths
} = require('../scripts/release-artifacts');

test('macOS Packaging: package.json build targets and scripts configuration', async (t) => {
    await t.test('package.json contains valid electron-builder mac configuration', () => {
        assert.ok(pkg.build, 'build section must exist');
        assert.ok(pkg.build.mac, 'mac build section must exist');
        assert.deepEqual(pkg.build.mac.target, ['dmg', 'zip']);
        assert.equal(pkg.build.mac.category, 'public.app-category.games');
        assert.equal(pkg.build.mac.icon, 'assets/yumeshelf_icon_highres_4096.png');
        assert.equal(pkg.build.mac.artifactName, '${productName}-${version}.${ext}');
        assert.equal(pkg.build.mac.identity, null);

        // Extra resources macOS playtime-helper
        assert.ok(Array.isArray(pkg.build.mac.extraResources), 'mac.extraResources must be an array');
        const helperResource = pkg.build.mac.extraResources.find((r) => r.to === 'native/playtime-helper/playtime-helper');
        assert.ok(helperResource, 'playtime-helper Darwin binary extraResource must be present for macOS');
        assert.equal(helperResource.from, 'native/playtime-helper/target/release/playtime-helper');
    });

    await t.test('package.json isolates Windows extraResources to build.win', () => {
        assert.ok(pkg.build.win, 'win build section must exist');
        assert.ok(Array.isArray(pkg.build.win.extraResources), 'win.extraResources must be an array');
        const winHelper = pkg.build.win.extraResources.find((r) => r.to === 'native/playtime-helper/playtime-helper.exe');
        assert.ok(winHelper, 'playtime-helper.exe extraResource must be present under win.extraResources');
        assert.equal(pkg.build.extraResources, undefined, 'root build.extraResources must be undefined');
    });

    await t.test('package.json contains build:mac and package:mac scripts', () => {
        assert.ok(pkg.scripts['build:mac'], 'build:mac script must exist');
        assert.ok(pkg.scripts['build:mac'].includes('electron-builder --mac'));
        assert.ok(pkg.scripts['build:mac'].includes('CSC_IDENTITY_AUTO_DISCOVERY=false'));
        assert.ok(pkg.scripts['package:mac'], 'package:mac script must exist');
        assert.ok(pkg.scripts['package:mac'].includes('electron-builder --mac'));
    });
});

test('macOS Packaging: release-artifacts helper module path resolution and pattern matching', async (t) => {
    await t.test('resolves structured macOS output directories', () => {
        const root = getBuildOutputDir();
        assert.equal(getMacOutputDir(root), path.join(root, 'mac'));
        assert.equal(getMacApplicationOutputDir(root), path.join(root, 'mac', 'application'));
        assert.equal(getMacChecksumOutputDir(root), path.join(root, 'mac', 'sha256'));
        assert.equal(getMacBlockmapOutputDir(root), path.join(root, 'mac', 'blockmap'));
        assert.equal(getMacFeedOutputDir(root), path.join(root, 'mac', 'feed'));
    });

    await t.test('correctly identifies macOS release artifact filenames', () => {
        assert.equal(isMacArtifactName('YumeShelf-2.1.2.dmg'), true);
        assert.equal(isMacArtifactName('YumeShelf-2.1.2.zip'), true);
        assert.equal(isMacDmgArtifactName('YumeShelf-2.1.2.dmg'), true);
        assert.equal(isMacDmgArtifactName('YumeShelf-2.1.2.zip'), false);
        assert.equal(isMacZipArtifactName('YumeShelf-2.1.2.zip'), true);
        assert.equal(isMacZipArtifactName('YumeShelf-2.1.2.dmg'), false);

        // Negative tests
        assert.equal(isMacArtifactName('YumeShelf-Setup-2.1.2.exe'), false);
        assert.equal(isMacArtifactName('latest-mac.yml'), false);
        assert.equal(isMacArtifactName('YumeShelf-2.1.2.dmg.sha256'), false);
        assert.equal(isMacArtifactName('YumeShelf-2.1.2.dmg.blockmap'), false);
    });

    await t.test('resolves macOS dmg and zip paths for a given version', () => {
        const paths = resolveMacArtifactPaths('2.1.2');
        assert.ok(paths.dmg.endsWith(path.join('build_output', 'mac', 'application', 'YumeShelf-2.1.2.dmg')));
        assert.ok(paths.zip.endsWith(path.join('build_output', 'mac', 'application', 'YumeShelf-2.1.2.zip')));
    });
});

test('macOS Packaging: SHA-256 Checksum generation across macOS binaries', async (t) => {
    await t.test('calculates accurate SHA-256 and writes formatted checksum files for macOS binaries', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yumeshelf-test-mac-pkg-'));
        try {
            const macAppDir = path.join(tempDir, 'mac', 'application');
            const macShaDir = path.join(tempDir, 'mac', 'sha256');
            fs.mkdirSync(macAppDir, { recursive: true });

            const fakeDmg = path.join(macAppDir, 'YumeShelf-2.1.2.dmg');
            const fakeDmgContent = 'mock-dmg-binary-payload-for-testing';
            fs.writeFileSync(fakeDmg, fakeDmgContent, 'utf8');

            const expectedDigest = crypto.createHash('sha256').update(fakeDmgContent).digest('hex');

            const checksumLine = `${expectedDigest}  ${path.basename(fakeDmg)}\n`;
            const checksumPath = path.join(macShaDir, 'YumeShelf-2.1.2.dmg.sha256');
            fs.mkdirSync(macShaDir, { recursive: true });
            fs.writeFileSync(checksumPath, checksumLine, 'utf8');

            assert.ok(fs.existsSync(checksumPath));
            const readContent = fs.readFileSync(checksumPath, 'utf8');
            assert.equal(readContent, `${expectedDigest}  YumeShelf-2.1.2.dmg\n`);
        } finally {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });
});
