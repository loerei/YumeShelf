const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const crypto = require('node:crypto');

const { downloadUpdate } = require('../dist/main/nsis-updater/download');
const { classifyErrorReason } = require('../dist/main/nsis-updater/runtime');

function createSampleInstallerBuffer() {
    return Buffer.from('MOCK_EXE_INSTALLER_CONTENT_' + Date.now() + '_' + Math.random());
}

function computeSha512Base64(buffer) {
    return crypto.createHash('sha512').update(buffer).digest('base64');
}

function computeSha512Hex(buffer) {
    return crypto.createHash('sha512').update(buffer).digest('hex');
}

async function* createAsyncStream(chunks) {
    for (const chunk of chunks) {
        yield chunk;
    }
}

test('nsis-updater download: single stream download succeeds, verifies SHA-512, renames atomically, and writes state', async (t) => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yumeshelf-nsis-test-'));
    t.after(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    const sampleExe = createSampleInstallerBuffer();
    const sha512Base64 = computeSha512Base64(sampleExe);

    const emitted = [];
    let savedState = null;

    const mockContext = {
        releasePageUrl: 'https://github.com/loerei/YumeShelf/releases',
        updateCacheDir: tempDir,
        state: { activeDownloadPromise: null },
        stateFiles: {
            writeDownloadedState: async (state) => {
                savedState = state;
            }
        },
        emitStatus: (payload) => emitted.push(payload),
        summarizeUpdateState: (payload) => ({ ...payload, summarized: true }),
        ensureDir: async (dir) => {
            await fs.mkdir(dir, { recursive: true });
        },
        configureUpdaterFeed: async () => ({ updater: null, feedOverride: null }),
        resolveRuntime: () => ({ channel: 'nsis' }),
        appendUpdateLog: async () => {},
        checkForUpdates: async () => ({
            available: true,
            updateInfo: {
                version: '2.3.0',
                files: [
                    {
                        url: 'https://github.com/loerei/YumeShelf/releases/download/v2.3.0/YumeShelf-Setup-2.3.0.exe',
                        sha512: sha512Base64
                    }
                ]
            }
        }),
        fetch: async () => ({
            ok: true,
            status: 200,
            statusText: 'OK',
            headers: {
                get: (h) => (h.toLowerCase() === 'content-length' ? String(sampleExe.length) : null)
            },
            body: createAsyncStream([sampleExe])
        })
    };

    const res = await downloadUpdate(mockContext);
    assert.equal(res.ok, true);
    assert.ok(res.installerPath.endsWith('YumeShelf-Setup-2.3.0.exe'));

    // Check file on disk
    const diskStat = await fs.stat(res.installerPath);
    assert.equal(diskStat.size, sampleExe.length);

    // Verify temp files are cleaned up
    const dirEntries = await fs.readdir(tempDir);
    const tempDownloads = dirEntries.filter(f => f.includes('.download.'));
    assert.equal(tempDownloads.length, 0);

    // Verify state was saved
    assert.ok(savedState);
    assert.equal(savedState.version, '2.3.0');
    assert.equal(savedState.expectedSha512, sha512Base64);
    assert.equal(savedState.installerPath, res.installerPath);

    // Verify emitted progress events
    assert.ok(emitted.some(e => e.phase === 'download-started'));
    assert.ok(emitted.some(e => e.phase === 'download-ready'));
});

test('nsis-updater download: hex format SHA-512 is canonically normalized to Base64 in state for deferred install compatibility', async (t) => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yumeshelf-nsis-hex-'));
    t.after(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    const sampleExe = createSampleInstallerBuffer();
    const sha512Hex = computeSha512Hex(sampleExe);
    const sha512Base64 = computeSha512Base64(sampleExe);

    let savedState = null;

    const mockContext = {
        releasePageUrl: 'https://github.com/loerei/YumeShelf/releases',
        updateCacheDir: tempDir,
        state: { activeDownloadPromise: null },
        stateFiles: {
            writeDownloadedState: async (state) => {
                savedState = state;
            }
        },
        emitStatus: () => {},
        summarizeUpdateState: (payload) => payload,
        ensureDir: async (dir) => {
            await fs.mkdir(dir, { recursive: true });
        },
        configureUpdaterFeed: async () => ({ updater: null, feedOverride: null }),
        resolveRuntime: () => ({ channel: 'nsis' }),
        appendUpdateLog: async () => {},
        checkForUpdates: async () => ({
            available: true,
            updateInfo: {
                version: '2.3.0',
                files: [
                    {
                        url: 'https://github.com/loerei/YumeShelf/releases/download/v2.3.0/YumeShelf-Setup-2.3.0.exe',
                        sha512: sha512Hex
                    }
                ]
            }
        }),
        fetch: async () => ({
            ok: true,
            status: 200,
            statusText: 'OK',
            headers: {
                get: (h) => (h.toLowerCase() === 'content-length' ? String(sampleExe.length) : null)
            },
            body: createAsyncStream([sampleExe])
        })
    };

    const res = await downloadUpdate(mockContext);
    assert.equal(res.ok, true);
    assert.ok(savedState);
    assert.equal(savedState.expectedSha512, sha512Base64);
});

test('nsis-updater download: stall detection watchdog aborts when stream is inactive beyond downloadTimeoutMs', async (t) => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yumeshelf-nsis-stall-'));
    t.after(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    const sampleExe = createSampleInstallerBuffer();
    const sha512Base64 = computeSha512Base64(sampleExe);

    async function* createStalledStream() {
        yield Buffer.from('chunk1');
        // Delay 120ms, which exceeds downloadTimeoutMs of 40ms
        await new Promise(r => setTimeout(r, 120));
        yield Buffer.from('chunk2');
    }

    const emitted = [];
    const mockContext = {
        releasePageUrl: 'https://github.com/loerei/YumeShelf/releases',
        updateCacheDir: tempDir,
        state: { activeDownloadPromise: null },
        stateFiles: { writeDownloadedState: async () => {} },
        emitStatus: (p) => emitted.push(p),
        summarizeUpdateState: (p) => p,
        ensureDir: async (dir) => { await fs.mkdir(dir, { recursive: true }); },
        configureUpdaterFeed: async () => ({ updater: null, feedOverride: null }),
        resolveRuntime: () => ({ channel: 'nsis' }),
        appendUpdateLog: async () => {},
        downloadTimeoutMs: 40,
        checkForUpdates: async () => ({
            available: true,
            updateInfo: {
                version: '2.3.0',
                files: [{ url: 'https://github.com/loerei/YumeShelf/releases/download/v2.3.0/YumeShelf-Setup-2.3.0.exe', sha512: sha512Base64 }]
            }
        }),
        fetch: async (_url, { signal }) => {
            return {
                ok: true,
                status: 200,
                statusText: 'OK',
                headers: { get: () => '1000' },
                body: (async function* () {
                    for await (const chunk of createStalledStream()) {
                        if (signal?.aborted) {
                            throw new Error('Aborted');
                        }
                        yield chunk;
                    }
                })()
            };
        }
    };

    const res = await downloadUpdate(mockContext);
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'timeout');

    // Temp file should be destroyed
    const dirEntries = await fs.readdir(tempDir);
    const tempDownloads = dirEntries.filter(f => f.includes('.download.'));
    assert.equal(tempDownloads.length, 0);
});

test('nsis-updater download: SEC-08 rejects download and destroys temp file on SHA-512 mismatch or missing hash', async (t) => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yumeshelf-nsis-sec-'));
    t.after(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    const sampleExe = createSampleInstallerBuffer();
    const corruptSha = 'CORRUPT_SHA512_BASE64_HASH_VAL==';

    let stateWritten = false;
    const mockContext = {
        releasePageUrl: 'https://github.com/loerei/YumeShelf/releases',
        updateCacheDir: tempDir,
        state: { activeDownloadPromise: null },
        stateFiles: { writeDownloadedState: async () => { stateWritten = true; } },
        emitStatus: () => {},
        summarizeUpdateState: (p) => p,
        ensureDir: async (dir) => { await fs.mkdir(dir, { recursive: true }); },
        configureUpdaterFeed: async () => ({ updater: null, feedOverride: null }),
        resolveRuntime: () => ({ channel: 'nsis' }),
        appendUpdateLog: async () => {},
        checkForUpdates: async () => ({
            available: true,
            updateInfo: {
                version: '2.3.0',
                files: [{ url: 'https://github.com/loerei/YumeShelf/releases/download/v2.3.0/YumeShelf-Setup-2.3.0.exe', sha512: corruptSha }]
            }
        }),
        fetch: async () => ({
            ok: true,
            status: 200,
            statusText: 'OK',
            headers: { get: () => String(sampleExe.length) },
            body: createAsyncStream([sampleExe])
        })
    };

    const res = await downloadUpdate(mockContext);
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'checksum');
    assert.equal(stateWritten, false);

    // Temp files and target files must not exist
    const dirEntries = await fs.readdir(tempDir);
    assert.equal(dirEntries.length, 0);

    // Test missing SHA-512 metadata
    const missingHashContext = {
        ...mockContext,
        checkForUpdates: async () => ({
            available: true,
            updateInfo: {
                version: '2.3.0',
                files: [{ url: 'https://github.com/loerei/YumeShelf/releases/download/v2.3.0/YumeShelf-Setup-2.3.0.exe' }]
            }
        })
    };

    const resMissing = await downloadUpdate(missingHashContext);
    assert.equal(resMissing.ok, false);
    assert.equal(resMissing.reason, 'checksum');
});

test('nsis-updater download: rejects non-HTTPS URLs with insecure-transport', async (t) => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yumeshelf-nsis-insecure-'));
    t.after(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    let fetchCalled = false;
    const mockContext = {
        releasePageUrl: 'https://github.com/loerei/YumeShelf/releases',
        updateCacheDir: tempDir,
        state: { activeDownloadPromise: null },
        stateFiles: { writeDownloadedState: async () => {} },
        emitStatus: () => {},
        summarizeUpdateState: (p) => p,
        ensureDir: async (dir) => { await fs.mkdir(dir, { recursive: true }); },
        configureUpdaterFeed: async () => ({ updater: null, feedOverride: null }),
        resolveRuntime: () => ({ channel: 'nsis' }),
        appendUpdateLog: async () => {},
        checkForUpdates: async () => ({
            available: true,
            updateInfo: {
                version: '2.3.0',
                files: [{ url: 'http://insecure.example.com/YumeShelf-Setup-2.3.0.exe', sha512: 'somehash' }]
            }
        }),
        fetch: async () => {
            fetchCalled = true;
            return { ok: true };
        }
    };

    const res = await downloadUpdate(mockContext);
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'insecure-transport');
    assert.equal(fetchCalled, false);
});
