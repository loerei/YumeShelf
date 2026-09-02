const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');

const {
    getBuildOutputDir,
    getNsisOutputDir,
    getNsisApplicationOutputDir,
    getNsisBlockmapOutputDir,
    getNsisChecksumOutputDir,
    getNsisFeedOutputDir,
    getLinuxOutputDir,
    getLinuxApplicationOutputDir,
    getLinuxChecksumOutputDir,
    getLinuxFeedOutputDir,
    getMacOutputDir,
    getMacApplicationOutputDir,
    getMacBlockmapOutputDir,
    getMacChecksumOutputDir,
    getMacFeedOutputDir,
    getUnpackedOutputDir,
    getPortableOutputDir,
    getPortableApplicationOutputDir,
    getPortableChecksumOutputDir,
    isInstallerArtifactName,
    isLinuxArtifactName,
    isLinuxAppImageArtifactName,
    isLinuxTarballArtifactName,
    isMacArtifactName,
    isMacDmgArtifactName,
    isMacZipArtifactName,
    resolveInstallerArtifactPath,
    resolveLinuxArtifactPaths,
    resolveMacArtifactPaths,
    resolveNewestInstallerArtifactPath
} = require('../scripts/release-artifacts');

const {
    classifyEntry,
    normalizeNestedEntries,
    moveEntry,
    organizeBuildOutput,
    classifyNsisNestedEntry,
    classifyLinuxNestedEntry,
    classifyMacNestedEntry,
    classifyPortableNestedEntry
} = require('../scripts/organize-build-output');

const {
    sha256File,
    resolveChecksumPath,
    writeChecksumForFile,
    collectApplicationBinaries,
    writeReleaseChecksums
} = require('../scripts/write-release-checksum');

test('Release Artifacts: modular helper exports and macOS paths contract', async (t) => {
    let tempDir = null;

    t.afterEach(() => {
        if (tempDir && fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
            tempDir = null;
        }
    });

    await t.test('exports all canonical macOS directory and path helpers', () => {
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
        assert.equal(isMacArtifactName('YumeShelf-2.1.2.AppImage'), false);
        assert.equal(isMacArtifactName('latest-mac.yml'), false);
        assert.equal(isMacArtifactName('YumeShelf-2.1.2.dmg.blockmap'), false);
        assert.equal(isMacArtifactName('YumeShelf-2.1.2.dmg.sha256'), false);
    });

    await t.test('resolves macOS dmg and zip paths for a given version', () => {
        const paths = resolveMacArtifactPaths('2.1.2');
        assert.ok(paths.dmg.endsWith(path.join('build_output', 'mac', 'application', 'YumeShelf-2.1.2.dmg')));
        assert.ok(paths.zip.endsWith(path.join('build_output', 'mac', 'application', 'YumeShelf-2.1.2.zip')));
    });
});

test('Organize Build Output: classification rules and collision prevention', async (t) => {
    let tempDir = null;

    t.afterEach(() => {
        if (tempDir && fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
            tempDir = null;
        }
    });

    await t.test('exports all modular organizational functions', () => {
        assert.equal(typeof classifyEntry, 'function');
        assert.equal(typeof normalizeNestedEntries, 'function');
        assert.equal(typeof moveEntry, 'function');
        assert.equal(typeof organizeBuildOutput, 'function');
        assert.equal(typeof classifyNsisNestedEntry, 'function');
        assert.equal(typeof classifyLinuxNestedEntry, 'function');
        assert.equal(typeof classifyMacNestedEntry, 'function');
        assert.equal(typeof classifyPortableNestedEntry, 'function');
    });

    await t.test('classifyEntry accurately categorizes Windows, Linux, and macOS entries', () => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yumeshelf-test-organize-'));

        // Windows
        assert.equal(classifyEntry('YumeShelf-Setup-2.1.2.exe', tempDir), getNsisApplicationOutputDir(tempDir));
        assert.equal(classifyEntry('YumeShelf-Setup-2.1.2.exe.blockmap', tempDir), getNsisBlockmapOutputDir(tempDir));
        assert.equal(classifyEntry('YumeShelf-Setup-2.1.2.exe.sha256', tempDir), getNsisChecksumOutputDir(tempDir));
        assert.equal(classifyEntry('latest.yml', tempDir), getNsisFeedOutputDir(tempDir));

        // Linux
        assert.equal(classifyEntry('YumeShelf-2.1.2.AppImage', tempDir), getLinuxApplicationOutputDir(tempDir));
        assert.equal(classifyEntry('YumeShelf-2.1.2.tar.gz', tempDir), getLinuxApplicationOutputDir(tempDir));
        assert.equal(classifyEntry('YumeShelf-2.1.2.AppImage.sha256', tempDir), getLinuxChecksumOutputDir(tempDir));
        assert.equal(classifyEntry('latest-linux.yml', tempDir), getLinuxFeedOutputDir(tempDir));

        // macOS
        assert.equal(classifyEntry('YumeShelf-2.1.2.dmg', tempDir), getMacApplicationOutputDir(tempDir));
        assert.equal(classifyEntry('YumeShelf-2.1.2.zip', tempDir), getMacApplicationOutputDir(tempDir));
        assert.equal(classifyEntry('YumeShelf-2.1.2.dmg.blockmap', tempDir), getMacBlockmapOutputDir(tempDir));
        assert.equal(classifyEntry('YumeShelf-2.1.2.dmg.sha256', tempDir), getMacChecksumOutputDir(tempDir));
        assert.equal(classifyEntry('YumeShelf-2.1.2.zip.sha256', tempDir), getMacChecksumOutputDir(tempDir));
        assert.equal(classifyEntry('latest-mac.yml', tempDir), getMacFeedOutputDir(tempDir));

        // Portable
        assert.equal(classifyEntry('YumeShelf 2.1.2.exe', tempDir), getPortableApplicationOutputDir(tempDir));
        assert.equal(classifyEntry('YumeShelf 2.1.2.exe.sha256', tempDir), getPortableChecksumOutputDir(tempDir));

        // Metadata & Internal
        assert.equal(classifyEntry('builder-debug.yml', tempDir), path.join(tempDir, 'metadata'));
        assert.equal(classifyEntry('builder-effective-config.yaml', tempDir), path.join(tempDir, 'metadata'));
        assert.equal(classifyEntry('.icon-ico', tempDir), path.join(tempDir, 'internal'));
        assert.equal(classifyEntry('release-recreate', tempDir), path.join(tempDir, 'internal'));
    });

    await t.test('classifyEntry intercepts unpacked macOS directories preventing collision with reserved mac category directory', () => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yumeshelf-test-organize-'));

        // macOS unpacked directories
        const expectedMacUnpacked = path.join(getUnpackedOutputDir(tempDir), 'mac-unpacked');
        assert.equal(classifyEntry('mac', tempDir), expectedMacUnpacked);
        assert.equal(classifyEntry('mac-arm64', tempDir), expectedMacUnpacked);
        assert.equal(classifyEntry('mac-universal', tempDir), expectedMacUnpacked);
        assert.equal(classifyEntry('mac-unpacked', tempDir), expectedMacUnpacked);

        // Win and Linux unpacked
        const expectedUnpacked = getUnpackedOutputDir(tempDir);
        assert.equal(classifyEntry('win-unpacked', tempDir), expectedUnpacked);
        assert.equal(classifyEntry('linux-unpacked', tempDir), expectedUnpacked);

        // Reserved category names must return null (already organized parent directories)
        assert.equal(classifyEntry('nsis', tempDir), null);
        assert.equal(classifyEntry('linux', tempDir), null);
        assert.equal(classifyEntry('portable', tempDir), null);
        assert.equal(classifyEntry('metadata', tempDir), null);
        assert.equal(classifyEntry('internal', tempDir), null);
    });

    await t.test('organizeBuildOutput restructures mixed Windows, Linux, and macOS artifacts idempotently', () => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yumeshelf-test-e2e-'));

        // Populate synthetic root build_output files
        const filesToCreate = [
            'YumeShelf-Setup-2.1.2.exe',
            'YumeShelf-Setup-2.1.2.exe.blockmap',
            'latest.yml',
            'YumeShelf-2.1.2.AppImage',
            'latest-linux.yml',
            'YumeShelf-2.1.2.dmg',
            'YumeShelf-2.1.2.zip',
            'YumeShelf-2.1.2.dmg.blockmap',
            'latest-mac.yml',
            'builder-debug.yml'
        ];

        for (const file of filesToCreate) {
            fs.writeFileSync(path.join(tempDir, file), `mock-content-for-${file}`);
        }

        // Create unpacked folders
        const macUnpackedDir = path.join(tempDir, 'mac');
        fs.mkdirSync(macUnpackedDir, { recursive: true });
        fs.writeFileSync(path.join(macUnpackedDir, 'YumeShelf.app'), 'mock-app-bundle');

        const winUnpackedDir = path.join(tempDir, 'win-unpacked');
        fs.mkdirSync(winUnpackedDir, { recursive: true });
        fs.writeFileSync(path.join(winUnpackedDir, 'YumeShelf.exe'), 'mock-win-exe');

        // First pass
        organizeBuildOutput(tempDir);

        // Assert organized file locations
        assert.ok(fs.existsSync(path.join(tempDir, 'nsis', 'application', 'YumeShelf-Setup-2.1.2.exe')));
        assert.ok(fs.existsSync(path.join(tempDir, 'nsis', 'blockmap', 'YumeShelf-Setup-2.1.2.exe.blockmap')));
        assert.ok(fs.existsSync(path.join(tempDir, 'nsis', 'feed', 'latest.yml')));

        assert.ok(fs.existsSync(path.join(tempDir, 'linux', 'application', 'YumeShelf-2.1.2.AppImage')));
        assert.ok(fs.existsSync(path.join(tempDir, 'linux', 'feed', 'latest-linux.yml')));

        assert.ok(fs.existsSync(path.join(tempDir, 'mac', 'application', 'YumeShelf-2.1.2.dmg')));
        assert.ok(fs.existsSync(path.join(tempDir, 'mac', 'application', 'YumeShelf-2.1.2.zip')));
        assert.ok(fs.existsSync(path.join(tempDir, 'mac', 'blockmap', 'YumeShelf-2.1.2.dmg.blockmap')));
        assert.ok(fs.existsSync(path.join(tempDir, 'mac', 'feed', 'latest-mac.yml')));

        assert.ok(fs.existsSync(path.join(tempDir, 'unpacked', 'mac-unpacked', 'YumeShelf.app')));
        assert.ok(fs.existsSync(path.join(tempDir, 'unpacked', 'win-unpacked', 'YumeShelf.exe')));
        assert.ok(fs.existsSync(path.join(tempDir, 'metadata', 'builder-debug.yml')));

        // Second pass (idempotency check)
        assert.doesNotThrow(() => organizeBuildOutput(tempDir));
        assert.ok(fs.existsSync(path.join(tempDir, 'mac', 'application', 'YumeShelf-2.1.2.dmg')));
        assert.ok(fs.existsSync(path.join(tempDir, 'nsis', 'application', 'YumeShelf-Setup-2.1.2.exe')));
    });
});

test('Write Release Checksum: macOS routing, collection, and safety fallback', async (t) => {
    let tempDir = null;

    t.afterEach(() => {
        if (tempDir && fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
            tempDir = null;
        }
    });

    await t.test('resolveChecksumPath directs macOS binaries to mac/sha256/ directory', () => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yumeshelf-test-checksum-'));
        const macAppDir = getMacApplicationOutputDir(tempDir);
        fs.mkdirSync(macAppDir, { recursive: true });

        const dmgFile = path.join(macAppDir, 'YumeShelf-2.1.2.dmg');
        fs.writeFileSync(dmgFile, 'mock-dmg-binary-payload');

        const checksumPath = resolveChecksumPath(dmgFile, tempDir);
        assert.equal(checksumPath, path.join(getMacChecksumOutputDir(tempDir), 'YumeShelf-2.1.2.dmg.sha256'));
    });

    await t.test('collectApplicationBinaries and writeChecksumForFile generate accurate hashes for macOS artifacts', () => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yumeshelf-test-checksum-'));
        const macAppDir = getMacApplicationOutputDir(tempDir);
        fs.mkdirSync(macAppDir, { recursive: true });

        const fakeDmg = path.join(macAppDir, 'YumeShelf-2.1.2.dmg');
        const fakeContent = 'mock-dmg-binary-payload-for-testing-sha256';
        fs.writeFileSync(fakeDmg, fakeContent, 'utf8');

        const expectedDigest = crypto.createHash('sha256').update(fakeContent).digest('hex');

        const targets = collectApplicationBinaries(tempDir);
        assert.equal(targets.length, 1);
        assert.equal(targets[0], fakeDmg);

        writeReleaseChecksums(tempDir);

        const checksumFile = path.join(getMacChecksumOutputDir(tempDir), 'YumeShelf-2.1.2.dmg.sha256');
        assert.ok(fs.existsSync(checksumFile));
        const fileContent = fs.readFileSync(checksumFile, 'utf8');
        assert.equal(fileContent, `${expectedDigest}  YumeShelf-2.1.2.dmg\n`);
    });

    await t.test('writeReleaseChecksums handles empty directories gracefully without unhandled crash', () => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yumeshelf-test-checksum-'));
        // Empty build output - should not throw
        assert.doesNotThrow(() => writeReleaseChecksums(tempDir));
    });
});
test('macOS Packaging: package.json build targets, extraResources relocation, and scripts configuration', async (t) => {
    const pkg = require('../package.json');

    await t.test('package.json contains valid electron-builder macOS configuration', () => {
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

    await t.test('package.json relocates Windows executable mapping to build.win.extraResources', () => {
        assert.ok(pkg.build.win, 'win build section must exist');
        assert.ok(Array.isArray(pkg.build.win.extraResources), 'win.extraResources must be an array');
        const winHelper = pkg.build.win.extraResources.find((r) => r.to === 'native/playtime-helper/playtime-helper.exe');
        assert.ok(winHelper, 'playtime-helper.exe extraResource must be present under win.extraResources');
        assert.equal(winHelper.from, 'native/playtime-helper/target/release/playtime-helper.exe');

        // Root extraResources must not be present to avoid platform pollution
        assert.equal(pkg.build.extraResources, undefined, 'root build.extraResources must be relocated to platform-specific targets');
    });

    await t.test('package.json contains build:mac and package:mac scripts with identity auto discovery disabled', () => {
        assert.ok(pkg.scripts['build:mac'], 'build:mac script must exist');
        assert.ok(pkg.scripts['build:mac'].includes('electron-builder --mac'));
        assert.ok(pkg.scripts['build:mac'].includes('CSC_IDENTITY_AUTO_DISCOVERY=false'));

        assert.ok(pkg.scripts['package:mac'], 'package:mac script must exist');
        assert.ok(pkg.scripts['package:mac'].includes('electron-builder --mac'));
    });
});

