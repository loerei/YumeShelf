const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');

const {
    detectPlatform,
    detectAssetRole,
    computeDigests,
    validateAssetIntegrity,
    classifyAsset,
    classifyReleaseAssets,
    generateReleaseManifest,
    runSelfTest
} = require('../scripts/classify-release-assets');

test('Classify Release Assets: platform and role detection', async (t) => {
    await t.test('detectPlatform correctly classifies files across OS targets', () => {
        // Windows
        assert.equal(detectPlatform('YumeShelf-Setup-2.1.2.exe'), 'windows');
        assert.equal(detectPlatform('YumeShelf 2.1.2.exe'), 'windows');
        assert.equal(detectPlatform('YumeShelf-Setup-2.1.2.nsis.7z'), 'windows');
        assert.equal(detectPlatform('YumeShelf-Setup-2.1.2.exe.blockmap'), 'windows');
        assert.equal(detectPlatform('latest.yml'), 'windows');
        assert.equal(detectPlatform('YumeShelf-Setup-2.1.2.exe.sha256'), 'windows');

        // Linux
        assert.equal(detectPlatform('YumeShelf-2.1.2.AppImage'), 'linux');
        assert.equal(detectPlatform('YumeShelf-2.1.2.deb'), 'linux');
        assert.equal(detectPlatform('YumeShelf-2.1.2.tar.gz'), 'linux');
        assert.equal(detectPlatform('latest-linux.yml'), 'linux');
        assert.equal(detectPlatform('YumeShelf-2.1.2.AppImage.sha256'), 'linux');

        // macOS
        assert.equal(detectPlatform('YumeShelf-2.1.2.dmg'), 'macos');
        assert.equal(detectPlatform('YumeShelf-2.1.2.zip'), 'macos');
        assert.equal(detectPlatform('YumeShelf-2.1.2.dmg.blockmap'), 'macos');
        assert.equal(detectPlatform('latest-mac.yml'), 'macos');
        assert.equal(detectPlatform('YumeShelf-2.1.2.dmg.sha256'), 'macos');

        // Cross-platform metadata & Unknown
        assert.equal(detectPlatform('builder-debug.yml'), 'cross-platform');
        assert.equal(detectPlatform('builder-effective-config.yaml'), 'cross-platform');
        assert.equal(detectPlatform('unknown-file.txt'), 'unknown');
    });

    await t.test('detectAssetRole identifies semantic release roles', () => {
        // Primary installers
        assert.equal(detectAssetRole('YumeShelf-Setup-2.1.2.exe'), 'primary-installer');
        assert.equal(detectAssetRole('YumeShelf-2.1.2.AppImage'), 'primary-installer');
        assert.equal(detectAssetRole('YumeShelf-2.1.2.deb'), 'primary-installer');
        assert.equal(detectAssetRole('YumeShelf-2.1.2.dmg'), 'primary-installer');

        // Archives / Portable
        assert.equal(detectAssetRole('YumeShelf 2.1.2.exe'), 'archive');
        assert.equal(detectAssetRole('YumeShelf-2.1.2.tar.gz'), 'archive');
        assert.equal(detectAssetRole('YumeShelf-2.1.2.zip'), 'archive');

        // Deltas & Blockmaps
        assert.equal(detectAssetRole('YumeShelf-Setup-2.1.2.nsis.7z'), 'delta');
        assert.equal(detectAssetRole('YumeShelf-Setup-2.1.2.exe.blockmap'), 'blockmap');
        assert.equal(detectAssetRole('YumeShelf-2.1.2.dmg.blockmap'), 'blockmap');

        // Updater manifests
        assert.equal(detectAssetRole('latest.yml'), 'updater-manifest');
        assert.equal(detectAssetRole('latest-linux.yml'), 'updater-manifest');
        assert.equal(detectAssetRole('latest-mac.yml'), 'updater-manifest');

        // Checksums & Metadata
        assert.equal(detectAssetRole('YumeShelf-Setup-2.1.2.exe.sha256'), 'checksum');
        assert.equal(detectAssetRole('YumeShelf-2.1.2.dmg.sha512'), 'checksum');
        assert.equal(detectAssetRole('builder-debug.yml'), 'metadata');
    });
});

test('Classify Release Assets: digest computation and integrity verification', async (t) => {
    let tempDir = null;

    t.afterEach(() => {
        if (tempDir && fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
            tempDir = null;
        }
    });

    await t.test('computeDigests generates accurate SHA-256 and SHA-512 hashes', () => {
        const payload = 'yumeshelf-crypto-test-payload-2026';
        const expectedSha256 = crypto.createHash('sha256').update(payload).digest('hex');
        const expectedSha512 = crypto.createHash('sha512').update(payload).digest('hex');

        const fromString = computeDigests(payload);
        assert.equal(fromString.sha256, expectedSha256);
        assert.equal(fromString.sha512, expectedSha512);

        const fromBuffer = computeDigests(Buffer.from(payload));
        assert.equal(fromBuffer.sha256, expectedSha256);
        assert.equal(fromBuffer.sha512, expectedSha512);
    });

    await t.test('validateAssetIntegrity flags empty files and unrecognized patterns', () => {
        // Empty file should fail validation
        const emptyAsset = {
            fileName: 'YumeShelf-Setup-2.1.2.exe',
            role: 'primary-installer',
            platform: 'windows',
            size: 0
        };
        const emptyResult = validateAssetIntegrity(emptyAsset);
        assert.equal(emptyResult.valid, false);
        assert.ok(emptyResult.errors.some((e) => e.includes('empty')));

        // Valid sized asset
        const validAsset = {
            fileName: 'YumeShelf-Setup-2.1.2.exe',
            role: 'primary-installer',
            platform: 'windows',
            size: 50 * 1024 * 1024
        };
        const validResult = validateAssetIntegrity(validAsset);
        assert.equal(validResult.valid, true);
        assert.equal(validResult.errors.length, 0);

        // Undersized asset produces warning
        const undersizedAsset = {
            fileName: 'latest.yml',
            role: 'updater-manifest',
            platform: 'windows',
            size: 2
        };
        const undersizedResult = validateAssetIntegrity(undersizedAsset);
        assert.equal(undersizedResult.valid, true);
        assert.ok(undersizedResult.warnings.some((w) => w.includes('below recommended threshold')));
    });

    await t.test('runSelfTest executes built-in verification suite', () => {
        assert.doesNotThrow(() => runSelfTest());
    });
});

test('Classify Release Assets: multi-platform directory scanning and manifest compilation', async (t) => {
    let tempDir = null;

    t.afterEach(() => {
        if (tempDir && fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
            tempDir = null;
        }
    });

    await t.test('classifyReleaseAssets and generateReleaseManifest produce structured MultiOS output', () => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yumeshelf-test-manifest-'));

        const sampleFiles = {
            'YumeShelf-Setup-2.1.2.exe': 'windows-setup-exe-bytes',
            'latest.yml': 'version: 2.1.2\npath: YumeShelf-Setup-2.1.2.exe',
            'YumeShelf-2.1.2.AppImage': 'linux-appimage-bytes',
            'latest-linux.yml': 'version: 2.1.2\npath: YumeShelf-2.1.2.AppImage',
            'YumeShelf-2.1.2.dmg': 'macos-dmg-bytes',
            'latest-mac.yml': 'version: 2.1.2\npath: YumeShelf-2.1.2.dmg'
        };

        for (const [name, content] of Object.entries(sampleFiles)) {
            fs.writeFileSync(path.join(tempDir, name), content);
        }

        const classification = classifyReleaseAssets(tempDir, { computeDigests: true });
        assert.equal(classification.total, 6);
        assert.equal(classification.allValid, true);

        assert.equal(classification.byPlatform.windows.length, 2);
        assert.equal(classification.byPlatform.linux.length, 2);
        assert.equal(classification.byPlatform.macos.length, 2);

        const manifest = generateReleaseManifest(tempDir);
        assert.equal(manifest.totalAssets, 6);
        assert.equal(manifest.allValid, true);
        assert.equal(manifest.platforms.windows.primaryInstaller, 'YumeShelf-Setup-2.1.2.exe');
        assert.equal(manifest.platforms.windows.manifest, 'latest.yml');
        assert.equal(manifest.platforms.linux.primaryInstaller, 'YumeShelf-2.1.2.AppImage');
        assert.equal(manifest.platforms.linux.manifest, 'latest-linux.yml');
        assert.equal(manifest.platforms.macos.primaryInstaller, 'YumeShelf-2.1.2.dmg');
        assert.equal(manifest.platforms.macos.manifest, 'latest-mac.yml');

        // Each asset in manifest has sha256 and sha512 digests
        for (const asset of manifest.assets) {
            assert.ok(asset.sha256 && asset.sha256.length === 64, `Asset ${asset.fileName} must have 64-char sha256`);
            assert.ok(asset.sha512 && asset.sha512.length === 128, `Asset ${asset.fileName} must have 128-char sha512`);
        }
    });
});
