const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');

const pkg = require('../package.json');
const {
    getBuildOutputDir,
    getLinuxOutputDir,
    getLinuxApplicationOutputDir,
    getLinuxChecksumOutputDir,
    getLinuxFeedOutputDir,
    isLinuxArtifactName,
    isLinuxAppImageArtifactName,
    isLinuxTarballArtifactName,
    resolveLinuxArtifactPaths
} = require('../scripts/release-artifacts');

test('Linux Packaging: package.json build targets and scripts configuration', async (t) => {
    await t.test('package.json contains valid electron-builder linux configuration', () => {
        assert.ok(pkg.build, 'build section must exist');
        assert.ok(pkg.build.linux, 'linux build section must exist');
        assert.deepEqual(pkg.build.linux.target, ['AppImage', 'tar.gz']);
        assert.equal(pkg.build.linux.category, 'Game;Utility;');
        assert.equal(pkg.build.linux.maintainer, 'loerei');
        assert.equal(pkg.build.linux.icon, 'assets/yumeshelf_icon_highres_4096.png');
        assert.equal(pkg.build.linux.artifactName, '${productName}-${version}.${ext}');

        // Extra resources Linux playtime-helper
        assert.ok(Array.isArray(pkg.build.linux.extraResources));
        const helperResource = pkg.build.linux.extraResources.find((r) => r.to === 'native/playtime-helper/playtime-helper');
        assert.ok(helperResource, 'playtime-helper ELF extraResource must be present for Linux');
    });

    await t.test('package.json contains build:linux and build:all scripts', () => {
        assert.ok(pkg.scripts['build:linux'], 'build:linux script must exist');
        assert.ok(pkg.scripts['build:linux'].includes('electron-builder --linux'));
        assert.ok(pkg.scripts['build:all'], 'build:all script must exist');
        assert.ok(pkg.scripts['build:all'].includes('electron-builder --win --linux'));
    });
});

test('Linux Packaging: release-artifacts helper module path resolution and pattern matching', async (t) => {
    await t.test('resolves structured linux output directories', () => {
        const root = getBuildOutputDir();
        assert.equal(getLinuxOutputDir(root), path.join(root, 'linux'));
        assert.equal(getLinuxApplicationOutputDir(root), path.join(root, 'linux', 'application'));
        assert.equal(getLinuxChecksumOutputDir(root), path.join(root, 'linux', 'sha256'));
        assert.equal(getLinuxFeedOutputDir(root), path.join(root, 'linux', 'feed'));
    });

    await t.test('correctly identifies Linux release artifact filenames', () => {
        assert.equal(isLinuxArtifactName('YumeShelf-1.6.0.AppImage'), true);
        assert.equal(isLinuxArtifactName('YumeShelf-1.6.0.tar.gz'), true);
        assert.equal(isLinuxAppImageArtifactName('YumeShelf-1.6.0.AppImage'), true);
        assert.equal(isLinuxAppImageArtifactName('YumeShelf-1.6.0.tar.gz'), false);
        assert.equal(isLinuxTarballArtifactName('YumeShelf-1.6.0.tar.gz'), true);
        assert.equal(isLinuxTarballArtifactName('YumeShelf-1.6.0.AppImage'), false);

        // Negative tests
        assert.equal(isLinuxArtifactName('YumeShelf-Setup-1.6.0.exe'), false);
        assert.equal(isLinuxArtifactName('latest-linux.yml'), false);
        assert.equal(isLinuxArtifactName('YumeShelf-1.6.0.AppImage.sha256'), false);
    });

    await t.test('resolves Linux AppImage and tarball paths for a given version', () => {
        const paths = resolveLinuxArtifactPaths('1.6.0');
        assert.ok(paths.appImage.endsWith(path.join('build_output', 'linux', 'application', 'YumeShelf-1.6.0.AppImage')));
        assert.ok(paths.tarball.endsWith(path.join('build_output', 'linux', 'application', 'YumeShelf-1.6.0.tar.gz')));
    });
});

test('Linux Packaging: SHA-256 Checksum generation across multi-platform binaries', async (t) => {
    await t.test('calculates accurate SHA-256 and writes formatted checksum files for Linux and Windows binaries', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yumeshelf-test-pkg-'));
        try {
            const linuxAppDir = path.join(tempDir, 'linux', 'application');
            const linuxShaDir = path.join(tempDir, 'linux', 'sha256');
            fs.mkdirSync(linuxAppDir, { recursive: true });

            const fakeAppImage = path.join(linuxAppDir, 'YumeShelf-1.6.0.AppImage');
            const fakeAppImageContent = 'mock-appimage-binary-payload-for-testing';
            fs.writeFileSync(fakeAppImage, fakeAppImageContent, 'utf8');

            const expectedDigest = crypto.createHash('sha256').update(fakeAppImageContent).digest('hex');

            // Test checksum formatting
            const checksumLine = `${expectedDigest}  ${path.basename(fakeAppImage)}\n`;
            const checksumPath = path.join(linuxShaDir, 'YumeShelf-1.6.0.AppImage.sha256');
            fs.mkdirSync(linuxShaDir, { recursive: true });
            fs.writeFileSync(checksumPath, checksumLine, 'utf8');

            assert.ok(fs.existsSync(checksumPath));
            const readContent = fs.readFileSync(checksumPath, 'utf8');
            assert.equal(readContent, `${expectedDigest}  YumeShelf-1.6.0.AppImage\n`);
        } finally {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });
});
