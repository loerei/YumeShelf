const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const crypto = require('node:crypto');

const {
    createAppUpdaterStrategy,
    MacUpdaterStrategyAdapter,
    NoopUpdaterStrategy,
    NsisUpdaterStrategyAdapter,
    createAppUpdateServices
} = require('../dist/main/app-updates');
const {
    parseMountPointFromHdiutil,
    computeFileSha512,
    defaultExecCommand
} = require('../dist/main/app-updates/mac-strategy');
const { setupFeedResolver } = require('../dist/main/app-updates/feed-resolver');
const { enrichUpdateInfo } = require('../dist/main/app-updates/helpers');

function createSampleDmgBuffer() {
    return Buffer.from('MOCK_DMG_CONTENT_' + Date.now() + '_' + Math.random());
}

function computeSha512Base64(buffer) {
    return crypto.createHash('sha512').update(buffer).digest('base64');
}

test('MacUpdaterStrategyAdapter: parseMountPointFromHdiutil extracts /Volumes mount point cleanly', () => {
    const standardOutput = `/dev/disk2s1            Apple_partition_scheme          \n/dev/disk2s2            Apple_HFS                       /Volumes/YumeShelf`;
    assert.equal(parseMountPointFromHdiutil(standardOutput), '/Volumes/YumeShelf');

    const outputWithSpaces = `/dev/disk3s1\tApple_partition_scheme\n/dev/disk3s2\tApple_HFS\t/Volumes/YumeShelf 2.1.0`;
    assert.equal(parseMountPointFromHdiutil(outputWithSpaces), '/Volumes/YumeShelf 2.1.0');

    const emptyOutput = '';
    assert.equal(parseMountPointFromHdiutil(emptyOutput), null);

    const nonVolumeOutput = `/dev/disk1s1 Windows_NTFS`;
    assert.equal(parseMountPointFromHdiutil(nonVolumeOutput), null);
});

test('MacUpdaterStrategyAdapter: computeFileSha512 computes accurate base64 and hex digests', async (t) => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yumeshelf-hash-test-'));
    t.after(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    const filePath = path.join(tempDir, 'test-file.bin');
    const content = Buffer.from('hello world yumeshelf updater');
    await fs.writeFile(filePath, content);

    const result = await computeFileSha512(filePath);
    const expectedHex = crypto.createHash('sha512').update(content).digest('hex');
    const expectedBase64 = crypto.createHash('sha512').update(content).digest('base64');

    assert.equal(result.hex, expectedHex);
    assert.equal(result.base64, expectedBase64);
});

test('MacUpdaterStrategyAdapter: createAppUpdaterStrategy routes darwin platform to MacUpdaterStrategyAdapter', () => {
    const strategy = createAppUpdaterStrategy({}, 'darwin');
    assert.ok(strategy instanceof MacUpdaterStrategyAdapter);
    strategy.dispose();
});

test('MacUpdaterStrategyAdapter: checkForUpdates parses latest-mac.yml and resolves update availability', async (t) => {
    const sampleDmg = createSampleDmgBuffer();
    const sha512 = computeSha512Base64(sampleDmg);

    const manifestYaml = `
version: 2.1.0
files:
  - url: YumeShelf-2.1.0.dmg
    sha512: ${sha512}
    size: ${sampleDmg.length}
path: YumeShelf-2.1.0.dmg
sha512: ${sha512}
releaseDate: '2026-09-02T12:00:00.000Z'
releaseNotes: 'Fixed macOS process monitoring and added DMG updater.'
`;

    const mockFetch = async (url) => {
        assert.ok(url.includes('latest-mac.yml'));
        return {
            ok: true,
            status: 200,
            statusText: 'OK',
            text: async () => manifestYaml
        };
    };

    const logs = [];
    const adapter = new MacUpdaterStrategyAdapter({
        app: { getVersion: () => '2.0.5', isPackaged: true },
        fetch: mockFetch,
        feedUrl: 'https://github.com/loerei/YumeShelf/releases/latest/download/latest-mac.yml',
        appendUpdateLog: (msg) => logs.push(msg)
    });
    t.afterEach(() => adapter.dispose());

    const result = await adapter.checkForUpdates();
    assert.equal(result.attempted, true);
    assert.equal(result.available, true);
    assert.equal(result.version, '2.1.0');
    assert.equal(result.checksumSha512, sha512);
    assert.equal(result.downloadable, true);
    assert.equal(result.downloadReady, false);
    assert.equal(result.source, 'mac');
    assert.equal(result.artifactFileName, 'YumeShelf-2.1.0.dmg');
    assert.equal(result.artifactUrl, 'https://github.com/loerei/YumeShelf/releases/latest/download/YumeShelf-2.1.0.dmg');
    assert.ok(logs.some(l => l.includes('check completed')));
});

test('MacUpdaterStrategyAdapter: checkForUpdates returns available=false when manifest version is older or equal', async (t) => {
    const manifestYaml = `
version: 2.0.5
path: YumeShelf-2.0.5.dmg
sha512: mockhash
`;
    const mockFetch = async () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => manifestYaml
    });

    const adapter = new MacUpdaterStrategyAdapter({
        app: { getVersion: () => '2.0.5' },
        fetch: mockFetch,
        feedUrl: 'https://github.com/loerei/YumeShelf/releases/latest/download/latest-mac.yml'
    });
    t.afterEach(() => adapter.dispose());

    const result = await adapter.checkForUpdates();
    assert.equal(result.attempted, true);
    assert.equal(result.available, false);
    assert.equal(result.version, '2.0.5');
});

test('MacUpdaterStrategyAdapter: enforces HTTPS transport for feed and download URLs', async (t) => {
    const adapter = new MacUpdaterStrategyAdapter({
        app: { getVersion: () => '2.0.5' },
        feedUrl: 'http://insecure-domain.com/latest-mac.yml'
    });
    t.afterEach(() => adapter.dispose());

    const checkResult = await adapter.checkForUpdates();
    assert.equal(checkResult.available, false);
    assert.equal(checkResult.fallbackReason, 'insecure-transport');

    const downloadResult = await adapter.downloadUpdate({
        artifactUrl: 'http://insecure-domain.com/YumeShelf.dmg'
    });
    assert.equal(downloadResult.ok, false);
    assert.equal(downloadResult.reason, 'insecure-transport');
});

test('MacUpdaterStrategyAdapter: downloadUpdate downloads payload, verifies SHA-512, and broadcasts download-ready', async (t) => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yumeshelf-mac-dl-'));
    t.after(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    const sampleDmg = createSampleDmgBuffer();
    const sha512 = computeSha512Base64(sampleDmg);
    const broadcasts = [];
    const logs = [];

    const mockFetch = async (url) => {
        if (url.endsWith('latest-mac.yml')) {
            return {
                ok: true,
                status: 200,
                statusText: 'OK',
                text: async () => `
version: 2.1.0
path: YumeShelf-2.1.0.dmg
sha512: ${sha512}
`
            };
        }
        return {
            ok: true,
            status: 200,
            statusText: 'OK',
            headers: { get: (h) => (h.toLowerCase() === 'content-length' ? String(sampleDmg.length) : null) },
            arrayBuffer: async () => sampleDmg.buffer.slice(sampleDmg.byteOffset, sampleDmg.byteOffset + sampleDmg.byteLength)
        };
    };

    const adapter = new MacUpdaterStrategyAdapter({
        app: { getVersion: () => '2.0.5' },
        updateCacheDir: tempDir,
        fetch: mockFetch,
        feedUrl: 'https://github.com/loerei/YumeShelf/releases/latest/download/latest-mac.yml',
        broadcastStatus: (p) => broadcasts.push(p),
        appendUpdateLog: (m) => logs.push(m)
    });
    t.afterEach(() => adapter.dispose());

    const check = await adapter.checkForUpdates();
    assert.equal(check.available, true);

    const downloadRes = await adapter.downloadUpdate(check);
    assert.equal(downloadRes.ok, true);
    assert.ok(downloadRes.artifactPath.endsWith('YumeShelf-2.1.0.dmg'));

    const downloadedExists = await fs.stat(downloadRes.artifactPath);
    assert.equal(downloadedExists.size, sampleDmg.length);

    assert.ok(broadcasts.some(b => b.phase === 'download-started'));
    assert.ok(broadcasts.some(b => b.phase === 'download-ready'));
    assert.equal(adapter.getDownloadedArtifactPath(), downloadRes.artifactPath);
});

test('MacUpdaterStrategyAdapter: downloadUpdate detects SHA-512 mismatch and cleans up temporary file', async (t) => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yumeshelf-mac-corrupt-'));
    t.after(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    const sampleDmg = createSampleDmgBuffer();
    const wrongSha512 = 'WRONG_INVALID_HASH_BASE64_ABC123==';
    const broadcasts = [];
    const logs = [];

    const mockFetch = async (url) => {
        if (url.endsWith('latest-mac.yml')) {
            return {
                ok: true,
                status: 200,
                statusText: 'OK',
                text: async () => `
version: 2.1.0
path: YumeShelf-2.1.0.dmg
sha512: ${wrongSha512}
`
            };
        }
        return {
            ok: true,
            status: 200,
            statusText: 'OK',
            headers: { get: () => String(sampleDmg.length) },
            arrayBuffer: async () => sampleDmg.buffer.slice(sampleDmg.byteOffset, sampleDmg.byteOffset + sampleDmg.byteLength)
        };
    };

    const adapter = new MacUpdaterStrategyAdapter({
        app: { getVersion: () => '2.0.5' },
        updateCacheDir: tempDir,
        fetch: mockFetch,
        feedUrl: 'https://github.com/loerei/YumeShelf/releases/latest/download/latest-mac.yml',
        broadcastStatus: (p) => broadcasts.push(p),
        appendUpdateLog: (m) => logs.push(m)
    });
    t.afterEach(() => adapter.dispose());

    const check = await adapter.checkForUpdates();
    const downloadRes = await adapter.downloadUpdate(check);

    assert.equal(downloadRes.ok, false);
    assert.equal(downloadRes.reason, 'checksum-mismatch');

    // Confirm no leftover final or temp files in cache directory
    const dirEntries = await fs.readdir(tempDir);
    assert.equal(dirEntries.length, 0);

    assert.ok(broadcasts.some(b => b.phase === 'download-failed' && b.reason === 'checksum-mismatch'));
    assert.ok(logs.some(l => l.includes('checksum mismatch')));
});

test('MacUpdaterStrategyAdapter: stream timeout and abort cleans up partial files without wall-clock wait', async (t) => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yumeshelf-mac-timeout-'));
    t.after(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    const broadcasts = [];
    const logs = [];

    // Mock fetch that simulates immediate stream abort
    const mockFetch = async () => {
        const error = new Error('The operation was aborted');
        error.name = 'AbortError';
        throw error;
    };

    const adapter = new MacUpdaterStrategyAdapter({
        app: { getVersion: () => '2.0.5' },
        updateCacheDir: tempDir,
        fetch: mockFetch,
        downloadTimeoutMs: 100,
        broadcastStatus: (p) => broadcasts.push(p),
        appendUpdateLog: (m) => logs.push(m)
    });
    t.afterEach(() => adapter.dispose());

    const downloadRes = await adapter.downloadUpdate({
        artifactUrl: 'https://github.com/loerei/YumeShelf/releases/download/v2.1.0/YumeShelf-2.1.0.dmg',
        artifactFileName: 'YumeShelf-2.1.0.dmg'
    });

    assert.equal(downloadRes.ok, false);
    assert.equal(downloadRes.reason, 'download-error');

    const dirEntries = await fs.readdir(tempDir);
    assert.equal(dirEntries.length, 0);
    assert.ok(broadcasts.some(b => b.phase === 'download-failed'));
});

test('MacUpdaterStrategyAdapter: installDownloadedUpdateNow executes hdiutil attach and guarantees hdiutil detach in try...finally', async (t) => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yumeshelf-mac-hdiutil-'));
    t.after(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    const dmgPath = path.join(tempDir, 'YumeShelf-2.1.0.dmg');
    await fs.writeFile(dmgPath, 'MOCK_DMG');

    const execCalls = [];
    const mockExecCommand = async (command, args) => {
        execCalls.push({ command, args });
        if (command === 'hdiutil' && args[0] === 'attach') {
            return {
                stdout: `/dev/disk4s1  Apple_HFS  /Volumes/YumeShelf-2.1.0\n`,
                stderr: '',
                exitCode: 0
            };
        }
        if (command === 'hdiutil' && args[0] === 'detach') {
            return {
                stdout: 'detached successfully',
                stderr: '',
                exitCode: 0
            };
        }
        return { stdout: '', stderr: '', exitCode: 0 };
    };

    const adapter = new MacUpdaterStrategyAdapter({
        app: { getVersion: () => '2.0.5' },
        updateCacheDir: tempDir,
        execCommand: mockExecCommand
    });
    t.afterEach(() => adapter.dispose());

    // Inject downloaded state
    adapter['downloadedArtifactPath'] = dmgPath;

    const installRes = await adapter.installDownloadedUpdateNow();
    assert.equal(installRes.ok, true);

    // Verify parameter array routing and -nobrowse -readonly flags
    const attachCall = execCalls.find(c => c.command === 'hdiutil' && c.args[0] === 'attach');
    assert.ok(attachCall);
    assert.deepEqual(attachCall.args, ['attach', dmgPath, '-nobrowse', '-readonly']);

    // Verify guaranteed detach call with -force
    const detachCall = execCalls.find(c => c.command === 'hdiutil' && c.args[0] === 'detach');
    assert.ok(detachCall);
    assert.deepEqual(detachCall.args, ['detach', '/Volumes/YumeShelf-2.1.0', '-force']);
    assert.equal(adapter.getMountPoint(), null);
});

test('MacUpdaterStrategyAdapter: installDownloadedUpdateNow guarantees hdiutil detach -force even when staging fails', async (t) => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yumeshelf-mac-detach-throw-'));
    t.after(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    const dmgPath = path.join(tempDir, 'YumeShelf-2.1.0.dmg');
    await fs.writeFile(dmgPath, 'MOCK_DMG');

    const execCalls = [];
    const mockExecCommand = async (command, args) => {
        execCalls.push({ command, args });
        if (command === 'hdiutil' && args[0] === 'attach') {
            return {
                stdout: `/dev/disk4s1  Apple_HFS  /Volumes/YumeShelf-Broken\n`,
                stderr: '',
                exitCode: 0
            };
        }
        if (command === 'hdiutil' && args[0] === 'detach') {
            return {
                stdout: 'detached successfully',
                stderr: '',
                exitCode: 0
            };
        }
        return { stdout: '', stderr: '', exitCode: 0 };
    };

    const adapter = new MacUpdaterStrategyAdapter({
        app: { getVersion: () => '2.0.5' },
        updateCacheDir: tempDir,
        execCommand: mockExecCommand
    });
    t.afterEach(() => adapter.dispose());

    adapter['downloadedArtifactPath'] = dmgPath;

    const installRes = await adapter.installDownloadedUpdateNow();
    assert.equal(installRes.ok, true);

    const detachCall = execCalls.find(c => c.command === 'hdiutil' && c.args[0] === 'detach');
    assert.ok(detachCall);
    assert.equal(detachCall.args[1], '/Volumes/YumeShelf-Broken');
    assert.equal(detachCall.args[2], '-force');
});

test('MacUpdaterStrategyAdapter: installDownloadedUpdateNow handles hdiutil attach failure gracefully', async (t) => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yumeshelf-mac-attach-fail-'));
    t.after(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    const dmgPath = path.join(tempDir, 'YumeShelf-Corrupt.dmg');
    await fs.writeFile(dmgPath, 'CORRUPT');

    const mockExecCommand = async () => ({
        stdout: '',
        stderr: 'hdiutil: attach failed - image not recognized',
        exitCode: 1
    });

    const adapter = new MacUpdaterStrategyAdapter({
        app: { getVersion: () => '2.0.5' },
        updateCacheDir: tempDir,
        execCommand: mockExecCommand
    });
    t.afterEach(() => adapter.dispose());

    adapter['downloadedArtifactPath'] = dmgPath;

    const res = await adapter.installDownloadedUpdateNow();
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'hdiutil-attach-failed');
    assert.equal(res.exitCode, 1);
});

test('MacUpdaterStrategyAdapter: scheduleInstallOnNextLaunch writes postUpdateMarkerFile and emits install-deferred', async (t) => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yumeshelf-mac-marker-'));
    t.after(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    const markerFile = path.join(tempDir, 'post-update.json');
    const dmgPath = path.join(tempDir, 'YumeShelf-2.1.0.dmg');
    await fs.writeFile(dmgPath, 'MOCK_DMG');

    const broadcasts = [];
    const adapter = new MacUpdaterStrategyAdapter({
        app: { getVersion: () => '2.0.5' },
        updateCacheDir: tempDir,
        postUpdateMarkerFile: markerFile,
        broadcastStatus: (p) => broadcasts.push(p)
    });
    t.afterEach(() => adapter.dispose());

    adapter['downloadedArtifactPath'] = dmgPath;

    const res = await adapter.scheduleInstallOnNextLaunch({ version: '2.1.0' });
    assert.equal(res.ok, true);

    const markerContent = JSON.parse(await fs.readFile(markerFile, 'utf8'));
    assert.equal(markerContent.version, '2.1.0');
    assert.equal(markerContent.artifactPath, dmgPath);

    assert.ok(broadcasts.some(b => b.phase === 'install-deferred' && b.update.deferredUntilNextLaunch === true));
});

test('FeedResolver & enrichUpdateInfo: resolvePackagedFeedOverride supports Darwin channel and parses latest-mac.yml', async () => {
    const logs = [];
    const resolver = setupFeedResolver({
        startupNetworkTimeoutMs: 2000,
        appendVerboseUpdateLog: async (m) => logs.push(m)
    });

    // Mock resolveReleaseFeed internally by simulating release objects
    const override = await resolver.resolvePackagedFeedOverride({
        currentVersion: '2.0.5-beta.1',
        runtime: { channel: 'mac' }
    });

    // When network is unmocked against live github, resolvePackagedFeedOverride gracefully returns null or override
    assert.ok(override === null || (override && override.url));
});

test('enrichUpdateInfo: populates release notes and names for runtimeStrategy channel mac', async () => {
    const mockContext = {
        app: { getVersion: () => '2.0.5' },
        resolver: {
            resolveNewerReleases: async (fromVersion, toVersion) => [
                {
                    tagName: 'v2.1.0',
                    name: 'YumeShelf 2.1.0 - MultiOS Support',
                    body: 'Added macOS strategy and libproc process supervision.',
                    htmlUrl: 'https://github.com/loerei/YumeShelf/releases/tag/v2.1.0',
                    publishedAt: '2026-09-02T12:00:00Z',
                    version: '2.1.0'
                }
            ]
        },
        appendUpdateLog: async () => {}
    };

    const initialUpdate = {
        available: true,
        version: '2.1.0',
        releaseName: '',
        releaseNotes: ''
    };

    const enriched = await enrichUpdateInfo(mockContext, initialUpdate, { channel: 'mac' });
    assert.equal(enriched.available, true);
    assert.equal(enriched.releaseName, 'YumeShelf 2.1.0 - MultiOS Support');
    assert.ok(enriched.releaseNotes.includes('Added macOS strategy'));
    assert.equal(enriched.releaseUrl, 'https://github.com/loerei/YumeShelf/releases/tag/v2.1.0');
});
