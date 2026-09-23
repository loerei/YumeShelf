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
const { organizeBuildOutput } = require('../scripts/organize-build-output');
const { collectApplicationBinaries, writeReleaseChecksums } = require('../scripts/write-release-checksum');
const {
    DEFAULT_HELPER_RELEASE_PATH,
    isUniversalLipoOutput,
    shouldBuildUniversalHelper
} = require('../scripts/ensure-playtime-helper-universal');

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

    await t.test('package.json contains ensure:playtime-helper:universal, build:mac and package:mac scripts', () => {
        assert.ok(pkg.scripts['ensure:playtime-helper:universal'], 'ensure:playtime-helper:universal script must exist');
        assert.ok(pkg.scripts['build:mac'], 'build:mac script must exist');
        assert.ok(pkg.scripts['build:mac'].includes('electron-builder --mac'));
        assert.ok(pkg.scripts['build:mac'].includes('--universal'));
        assert.ok(pkg.scripts['build:mac'].includes('CSC_IDENTITY_AUTO_DISCOVERY=false'));
        assert.ok(pkg.scripts['package:mac'], 'package:mac script must exist');
        assert.ok(pkg.scripts['package:mac'].includes('electron-builder --mac'));
        assert.ok(pkg.scripts['package:mac'].includes('--universal'));
    });
});

test('macOS Packaging: ensure-playtime-helper-universal module and test seams', async (t) => {
    await t.test('script file exists and is non-empty', () => {
        const scriptPath = path.join(__dirname, '../scripts/ensure-playtime-helper-universal.js');
        assert.ok(fs.existsSync(scriptPath), 'scripts/ensure-playtime-helper-universal.js must exist');
        const stat = fs.statSync(scriptPath);
        assert.ok(stat.size > 0, 'script must be non-empty');
    });

    await t.test('DEFAULT_HELPER_RELEASE_PATH matches canonical release path', () => {
        const expected = path.resolve(__dirname, '../native/playtime-helper/target/release/playtime-helper');
        assert.equal(path.resolve(DEFAULT_HELPER_RELEASE_PATH), expected);
    });

    await t.test('isUniversalLipoOutput parses fat binaries correctly and rejects single-arch / invalid inputs', () => {
        // Valid fat outputs
        assert.equal(isUniversalLipoOutput('Architectures in the fat file: /path/to/bin are: arm64 x86_64'), true);
        assert.equal(isUniversalLipoOutput('Architectures in the fat file: /path/to/bin are: x86_64 arm64'), true);
        assert.equal(isUniversalLipoOutput('Architectures in the fat file: /path/to/bin are: arm64 x86_64\n'), true);

        // Single architecture
        assert.equal(isUniversalLipoOutput('Non-fat file: /path/to/bin is architecture: x86_64'), false);
        assert.equal(isUniversalLipoOutput('Non-fat file: /path/to/bin is architecture: arm64'), false);

        // Falsy / invalid inputs
        assert.equal(isUniversalLipoOutput(''), false);
        assert.equal(isUniversalLipoOutput(null), false);
        assert.equal(isUniversalLipoOutput(undefined), false);
        assert.equal(isUniversalLipoOutput(123), false);

        // Lipo error output
        assert.equal(isUniversalLipoOutput("fatal error: /usr/bin/lipo: can't figure out the architecture type"), false);

        // Non-fat binary outputs whose paths embed arm64 or x86_64 substrings
        assert.equal(isUniversalLipoOutput('Non-fat file: /Users/runner/work/arm64-workspace/playtime-helper is architecture: x86_64'), false);
        assert.equal(isUniversalLipoOutput('Non-fat file: /Users/runner/work/x86_64-workspace/playtime-helper is architecture: arm64'), false);
    });

    await t.test('shouldBuildUniversalHelper evaluates short-circuiting, errors, and cache hit/miss accurately', () => {
        let statCalled = false;
        let lipoCalled = false;
        const dummyStat = () => { statCalled = true; return { mtimeMs: 500 }; };
        const dummyLipo = () => { lipoCalled = true; return { status: 0, stdout: 'are: arm64 x86_64' }; };

        // 1. Falsy helperReleasePath
        statCalled = false; lipoCalled = false;
        assert.equal(shouldBuildUniversalHelper({ helperReleasePath: null, statFn: dummyStat, runLipoFn: dummyLipo }), true);
        assert.equal(shouldBuildUniversalHelper({ helperReleasePath: undefined, statFn: dummyStat, runLipoFn: dummyLipo }), true);
        assert.equal(shouldBuildUniversalHelper({ helperReleasePath: '', statFn: dummyStat, runLipoFn: dummyLipo }), true);
        assert.equal(statCalled, false, 'statFn must not be called when path is falsy');
        assert.equal(lipoCalled, false, 'runLipoFn must not be called when path is falsy');

        // 2. Binary missing
        statCalled = false; lipoCalled = false;
        assert.equal(shouldBuildUniversalHelper({
            helperReleasePath: '/mock/bin',
            existsFn: () => false,
            statFn: dummyStat,
            runLipoFn: dummyLipo
        }), true);
        assert.equal(statCalled, false, 'statFn must not be called when file is missing');
        assert.equal(lipoCalled, false, 'runLipoFn must not be called when file is missing');

        // 3. statFn throws
        lipoCalled = false;
        assert.equal(shouldBuildUniversalHelper({
            helperReleasePath: '/mock/bin',
            existsFn: () => true,
            statFn: () => { throw new Error('EACCES: permission denied'); },
            runLipoFn: dummyLipo
        }), true);
        assert.equal(lipoCalled, false, 'runLipoFn must not be called when stat throws');

        // 4. newestSourceMtimeMs invalid or non-numeric
        lipoCalled = false;
        assert.equal(shouldBuildUniversalHelper({
            helperReleasePath: '/mock/bin',
            existsFn: () => true,
            statFn: () => ({ mtimeMs: 500 }),
            newestSourceMtimeMs: undefined,
            runLipoFn: dummyLipo
        }), true);
        assert.equal(shouldBuildUniversalHelper({
            helperReleasePath: '/mock/bin',
            existsFn: () => true,
            statFn: () => ({ mtimeMs: 500 }),
            newestSourceMtimeMs: NaN,
            runLipoFn: dummyLipo
        }), true);
        assert.equal(shouldBuildUniversalHelper({
            helperReleasePath: '/mock/bin',
            existsFn: () => true,
            statFn: () => ({ mtimeMs: 500 }),
            newestSourceMtimeMs: 'invalid',
            runLipoFn: dummyLipo
        }), true);
        assert.equal(lipoCalled, false, 'runLipoFn must not be called when source mtime is invalid');

        // 5. newestSourceMtimeMs non-positive
        lipoCalled = false;
        assert.equal(shouldBuildUniversalHelper({
            helperReleasePath: '/mock/bin',
            existsFn: () => true,
            statFn: () => ({ mtimeMs: 500 }),
            newestSourceMtimeMs: 0,
            runLipoFn: dummyLipo
        }), true);
        assert.equal(shouldBuildUniversalHelper({
            helperReleasePath: '/mock/bin',
            existsFn: () => true,
            statFn: () => ({ mtimeMs: 500 }),
            newestSourceMtimeMs: -50,
            runLipoFn: dummyLipo
        }), true);
        assert.equal(lipoCalled, false, 'runLipoFn must not be called when source mtime is non-positive');

        // 6. Source mtime is newer (cache miss)
        lipoCalled = false;
        assert.equal(shouldBuildUniversalHelper({
            helperReleasePath: '/mock/bin',
            existsFn: () => true,
            statFn: () => ({ mtimeMs: 100 }),
            newestSourceMtimeMs: 200,
            runLipoFn: dummyLipo
        }), true);
        assert.equal(lipoCalled, false, 'runLipoFn must not be called when source is newer');

        // 7. runLipoFn throws
        assert.equal(shouldBuildUniversalHelper({
            helperReleasePath: '/mock/bin',
            existsFn: () => true,
            statFn: () => ({ mtimeMs: 500 }),
            newestSourceMtimeMs: 200,
            runLipoFn: () => { throw new Error('spawn ENOENT'); }
        }), true);

        // 8. lipo reports non-universal architectures or exits non-zero
        assert.equal(shouldBuildUniversalHelper({
            helperReleasePath: '/mock/bin',
            existsFn: () => true,
            statFn: () => ({ mtimeMs: 500 }),
            newestSourceMtimeMs: 200,
            lipoStatus: 1,
            lipoStdout: 'are: arm64 x86_64'
        }), true);
        assert.equal(shouldBuildUniversalHelper({
            helperReleasePath: '/mock/bin',
            existsFn: () => true,
            statFn: () => ({ mtimeMs: 500 }),
            newestSourceMtimeMs: 200,
            lipoStatus: 0,
            lipoStdout: 'Non-fat file: /mock/bin is architecture: x86_64'
        }), true);

        // 9. Cache hit
        assert.equal(shouldBuildUniversalHelper({
            helperReleasePath: '/mock/bin',
            existsFn: () => true,
            statFn: () => ({ mtimeMs: 500 }),
            newestSourceMtimeMs: 200,
            lipoStatus: 0,
            lipoStdout: 'Architectures in the fat file: /mock/bin are: arm64 x86_64'
        }), false);
        assert.equal(shouldBuildUniversalHelper({
            helperReleasePath: '/mock/bin',
            existsFn: () => true,
            statFn: () => ({ mtimeMs: 500 }),
            newestSourceMtimeMs: 200,
            runLipoFn: () => ({ status: 0, stdout: 'Architectures in the fat file: /mock/bin are: x86_64 arm64' })
        }), false);

        // 10. Production default parameters operates cleanly
        assert.doesNotThrow(() => {
            const res = shouldBuildUniversalHelper({ helperReleasePath: '/non/existent/path/for/unit/test/12345' });
            assert.equal(res, true);
        });
        assert.doesNotThrow(() => {
            const res = shouldBuildUniversalHelper({
                helperReleasePath: __filename,
                newestSourceMtimeMs: 1
            });
            assert.equal(res, true);
        });
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
        assert.strictEqual(isMacArtifactName('ForMacBeta.txt'), false);
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

    await t.test('omits checksum generation for ForMacBeta.txt helper documentation', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yumeshelf-test-mac-beta-txt-'));
        try {
            const macDir = path.join(tempDir, 'mac');
            const macAppDir = path.join(macDir, 'application');
            fs.mkdirSync(macAppDir, { recursive: true });

            // Create mock binary payload
            const mockDmg = path.join(macAppDir, 'YumeShelf-2.1.2.dmg');
            fs.writeFileSync(mockDmg, 'mock-dmg-binary-payload-for-testing', 'utf8');

            // Create ForMacBeta.txt in mac directory
            const betaTxt = path.join(macDir, 'ForMacBeta.txt');
            fs.writeFileSync(betaTxt, 'YumeShelf macOS Beta Instructions\n', 'utf8');

            // Verify organizeBuildOutput leaves ForMacBeta.txt untouched
            organizeBuildOutput(tempDir);
            assert.ok(fs.existsSync(betaTxt), 'ForMacBeta.txt must still exist in mac/');

            // Verify collectApplicationBinaries excludes ForMacBeta.txt
            const binaries = collectApplicationBinaries(tempDir);
            assert.ok(binaries.includes(mockDmg));
            assert.ok(!binaries.includes(betaTxt));

            // Write checksums
            writeReleaseChecksums(tempDir);

            // Assert checksum for DMG exists, but NO checksum for ForMacBeta.txt
            assert.ok(fs.existsSync(path.join(macDir, 'sha256', 'YumeShelf-2.1.2.dmg.sha256')));
            assert.ok(!fs.existsSync(path.join(macDir, 'sha256', 'ForMacBeta.txt.sha256')));
            assert.ok(!fs.existsSync(path.join(macDir, 'ForMacBeta.txt.sha256')));
        } finally {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });
});
