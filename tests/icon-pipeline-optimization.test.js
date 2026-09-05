const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

// Contract verification helpers for Group 1 URL and markup logic
function getGameIconUrl(exePath) {
    if (!exePath) return '';
    return `game-icon://app?path=${encodeURIComponent(exePath)}`;
}

function renderIconMarkup(dataUrl, fit = 'contain', source = 'unknown') {
    const normalizedFit = fit === 'cover' ? 'cover' : 'contain';
    return `<img src="${dataUrl}" alt="icon" loading="lazy" draggable="false" data-icon-fit="${normalizedFit}" data-icon-source="${source}" class="fade-in-icon" style="width:100%; height:100%; object-fit:${normalizedFit}; pointer-events:none;">`;
}

const {
    tryGetCachedIconBuffer,
    tryGetCachedIconDataUrl,
    storeHighResIconInCache,
    loadIconCacheState,
    flushPendingIconCacheState,
    normalizeExecutablePath,
    ICON_CACHE_VERSION,
    _resetIconCacheStateForTesting
} = require('../dist/main/icon-pipeline/cache');

const {
    cropTransparentPaddingFromBuffer
} = require('../dist/main/icon-pipeline/cropper');

const {
    createIconPipeline,
    convertIcoBufferToPng
} = require('../dist/main/icon-pipeline/service');

const {
    PeResourceDecoder,
    extractPeIcon
} = require('../dist/main/icon-pipeline/pe-resource-decoder');

// Helper to build a minimal PE binary with .rsrc section
function buildMockPeBufferWithPadding(prefixPaddingBytes = 0, suffixPaddingBytes = 0, useDIB = false) {
    const mockPng = Buffer.alloc(64);
    if (!useDIB) {
        const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        pngMagic.copy(mockPng, 0);
        mockPng.writeUInt32BE(13, 8);
        mockPng.write('IHDR', 12, 'utf8');
        mockPng.writeUInt32BE(256, 16);
        mockPng.writeUInt32BE(256, 20);
    } else {
        mockPng.writeUInt32LE(40, 0); // biSize
        mockPng.writeInt32LE(32, 4); // biWidth
        mockPng.writeInt32LE(64, 8); // biHeight
        mockPng.writeUInt16LE(1, 12); // biPlanes
        mockPng.writeUInt16LE(32, 14); // biBitCount
    }

    const peOffset = 0x80;
    const optionalHeaderSize = 224;
    const sectionTableOffset = peOffset + 24 + optionalHeaderSize;
    const rsrcSectionRawOffset = 0x200 + prefixPaddingBytes;
    const rsrcSectionRva = 0x2000;

    const rsrcBuf = Buffer.alloc(2048);
    // write dir header: 0 named, 2 id (RT_GROUP_ICON 14, RT_ICON 3)
    rsrcBuf.writeUInt16LE(0, 12);
    rsrcBuf.writeUInt16LE(2, 14);

    let nextSubdirOffset = 16 + 2 * 8;

    // RT_GROUP_ICON (14)
    rsrcBuf.writeUInt32LE(14, 16);
    rsrcBuf.writeUInt32LE((0x80000000 | nextSubdirOffset) >>> 0, 20);

    const groupL2 = nextSubdirOffset;
    rsrcBuf.writeUInt16LE(0, groupL2 + 12);
    rsrcBuf.writeUInt16LE(1, groupL2 + 14);
    rsrcBuf.writeUInt32LE(1, groupL2 + 16);
    const groupL3 = groupL2 + 24;
    rsrcBuf.writeUInt32LE((0x80000000 | groupL3) >>> 0, groupL2 + 20);

    rsrcBuf.writeUInt16LE(0, groupL3 + 12);
    rsrcBuf.writeUInt16LE(1, groupL3 + 14);
    rsrcBuf.writeUInt32LE(0, groupL3 + 16);
    const groupDataEntry = groupL3 + 24;
    rsrcBuf.writeUInt32LE(groupDataEntry, groupL3 + 20);

    const groupDataInRsrc = 0x200;
    rsrcBuf.writeUInt32LE(rsrcSectionRva + groupDataInRsrc, groupDataEntry);
    rsrcBuf.writeUInt32LE(6 + 14, groupDataEntry + 4);

    rsrcBuf.writeUInt16LE(0, groupDataInRsrc);
    rsrcBuf.writeUInt16LE(1, groupDataInRsrc + 2);
    rsrcBuf.writeUInt16LE(1, groupDataInRsrc + 4);

    const entryOffset = groupDataInRsrc + 6;
    rsrcBuf.writeUInt8(0, entryOffset); // 256px
    rsrcBuf.writeUInt8(0, entryOffset + 1);
    rsrcBuf.writeUInt16LE(32, entryOffset + 6);
    rsrcBuf.writeUInt32LE(mockPng.length, entryOffset + 8);
    rsrcBuf.writeUInt16LE(1, entryOffset + 12);

    // RT_ICON (3)
    nextSubdirOffset = groupDataEntry + 16;
    rsrcBuf.writeUInt32LE(3, 24);
    rsrcBuf.writeUInt32LE((0x80000000 | nextSubdirOffset) >>> 0, 28);

    const iconL2 = nextSubdirOffset;
    rsrcBuf.writeUInt16LE(0, iconL2 + 12);
    rsrcBuf.writeUInt16LE(1, iconL2 + 14);
    rsrcBuf.writeUInt32LE(1, iconL2 + 16);
    const iconL3 = iconL2 + 24;
    rsrcBuf.writeUInt32LE((0x80000000 | iconL3) >>> 0, iconL2 + 20);

    rsrcBuf.writeUInt16LE(0, iconL3 + 12);
    rsrcBuf.writeUInt16LE(1, iconL3 + 14);
    rsrcBuf.writeUInt32LE(0, iconL3 + 16);
    const iconDataEntry = iconL3 + 24;
    rsrcBuf.writeUInt32LE(iconDataEntry, iconL3 + 20);

    const iconDataInRsrc = 0x300;
    rsrcBuf.writeUInt32LE(rsrcSectionRva + iconDataInRsrc, iconDataEntry);
    rsrcBuf.writeUInt32LE(mockPng.length, iconDataEntry + 4);
    mockPng.copy(rsrcBuf, iconDataInRsrc);

    const totalSize = rsrcSectionRawOffset + rsrcBuf.length + suffixPaddingBytes;
    const peBuf = Buffer.alloc(totalSize);

    // DOS Header
    peBuf.writeUInt16LE(0x5a4d, 0);
    peBuf.writeUInt32LE(peOffset, 0x3c);

    // PE Header
    peBuf.writeUInt32LE(0x00004550, peOffset);
    peBuf.writeUInt16LE(1, peOffset + 6); // 1 section
    peBuf.writeUInt16LE(optionalHeaderSize, peOffset + 20);

    // Optional Header
    const optOffset = peOffset + 24;
    peBuf.writeUInt16LE(0x10b, optOffset); // PE32
    peBuf.writeUInt32LE(rsrcSectionRva, optOffset + 96 + 16);
    peBuf.writeUInt32LE(rsrcBuf.length, optOffset + 96 + 20);

    // Section Header
    peBuf.write('.rsrc\0\0\0', sectionTableOffset, 8, 'utf8');
    peBuf.writeUInt32LE(rsrcBuf.length, sectionTableOffset + 8);
    peBuf.writeUInt32LE(rsrcSectionRva, sectionTableOffset + 12);
    peBuf.writeUInt32LE(rsrcBuf.length, sectionTableOffset + 16);
    peBuf.writeUInt32LE(rsrcSectionRawOffset, sectionTableOffset + 20);

    rsrcBuf.copy(peBuf, rsrcSectionRawOffset);

    return { peBuf, mockPng };
}

test('Group 1: Internal protocol URL and lazy markup generation', async (t) => {
    await t.test('getGameIconUrl properly formats and encodes game-icon:// URI', () => {
        assert.equal(
            getGameIconUrl('C:\\Games\\Yume Nikki\\game.exe'),
            'game-icon://app?path=C%3A%5CGames%5CYume%20Nikki%5Cgame.exe'
        );
        assert.equal(getGameIconUrl(''), '');
        assert.equal(getGameIconUrl(null), '');
    });

    await t.test('renderIconMarkup includes loading="lazy", class="fade-in-icon", and CSP compliance', () => {
        const markup = renderIconMarkup('game-icon://app?path=test.exe', 'contain', 'game-icon');
        assert.ok(markup.includes('loading="lazy"'), 'should have loading="lazy"');
        assert.ok(markup.includes('src="game-icon://app?path=test.exe"'), 'should have correct src');
        assert.ok(markup.includes('class="fade-in-icon"'), 'should have fade-in-icon class');
        assert.ok(!markup.includes('onload='), 'must not have inline onload (CSP violation)');
        assert.ok(!markup.includes('onerror='), 'must not have inline onerror (CSP violation)');
    });
});

test('Group 2: Main Process Cache Hit, Precedence & Fragmented PE Reading', async (t) => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yumeshelf-opt-test-'));
    const mockApp = {
        getPath: () => tmpDir,
        getAppPath: () => tmpDir,
        getFileIcon: async () => ({
            toPNG: () => Buffer.from('mock-fallback-png'),
            toDataURL: () => 'data:image/png;base64,bW9jay1mYWxsYmFjaw==',
            isEmpty: () => false,
            getSize: () => ({ width: 32, height: 32 })
        })
    };

    t.after(async () => {
        _resetIconCacheStateForTesting();
        try {
            await fs.rm(tmpDir, { recursive: true, force: true });
        } catch {}
    });

    await t.test('Cache hit directly returns uncropped PNG data and buffer', async () => {
        _resetIconCacheStateForTesting();
        const fakeExe = path.join(tmpDir, 'test-game.exe');
        await fs.writeFile(fakeExe, 'mock-binary-exe');

        const mockPngBuffer = Buffer.from('my-cached-png-data');
        await storeHighResIconInCache(mockApp, fakeExe, mockPngBuffer, { source: 'test' });
        await flushPendingIconCacheState(mockApp);

        const cachedBuffer = await tryGetCachedIconBuffer(mockApp, fakeExe);
        assert.ok(cachedBuffer);
        assert.deepEqual(cachedBuffer, mockPngBuffer);

        const cachedDataUrl = await tryGetCachedIconDataUrl(mockApp, fakeExe);
        assert.ok(cachedDataUrl);
        assert.equal(cachedDataUrl, `data:image/png;base64,${mockPngBuffer.toString('base64')}`);
    });

    await t.test('Cache Hit is checked BEFORE scanning local images', async () => {
        _resetIconCacheStateForTesting();
        const gameDir = path.join(tmpDir, 'game-with-local-asset');
        await fs.mkdir(gameDir, { recursive: true });
        const gameExe = path.join(gameDir, 'Game.exe');
        const localIcon = path.join(gameDir, 'icon.png');

        await fs.writeFile(gameExe, 'game-bin');
        await fs.writeFile(localIcon, 'local-icon-content');

        // Warm the cache with a distinct buffer
        const cachedContent = Buffer.from('cached-high-res-content');
        await storeHighResIconInCache(mockApp, gameExe, cachedContent, { source: 'cache-warm' });
        await flushPendingIconCacheState(mockApp);

        let registeredProtocolHandler = null;
        const mockProtocol = {
            handle: (_scheme, handler) => {
                registeredProtocolHandler = handler;
            }
        };
        const mockIpcMain = { handle: () => {} };

        const pipeline = createIconPipeline({
            app: mockApp,
            protocol: mockProtocol,
            ipcMain: mockIpcMain,
            sourceRootDir: tmpDir
        });
        pipeline.registerProtocolHandler();

        const req = new Request(`game-icon://app?path=${encodeURIComponent(gameExe)}`);
        const resp = await registeredProtocolHandler(req);
        const arrayBuf = await resp.arrayBuffer();
        const resultBuf = Buffer.from(arrayBuf);

        // Should return the cached content, NOT the local icon file content!
        assert.deepEqual(resultBuf, cachedContent, 'Cache hit must take precedence over local asset scanning');
    });

    await t.test('PeResourceDecoder.fromFileSync reads fragmented header and .rsrc from disk', async () => {
        // Build a simulated PE with 2 MB prefix padding before .rsrc to ensure offset jumps work
        const { peBuf, mockPng } = buildMockPeBufferWithPadding(2 * 1024 * 1024, 1024 * 1024);
        const testExe = path.join(tmpDir, 'padded-game.exe');
        await fs.writeFile(testExe, peBuf);

        // Extract via fromFileSync (which uses openSync + readSync)
        const decoder = PeResourceDecoder.fromFileSync(testExe);
        assert.ok(decoder, 'decoder should be created from chunked read');

        const icon = decoder.extractIcon();
        assert.ok(icon, 'icon should be extracted');
        assert.equal(icon.isPng, true);
        assert.equal(icon.width, 256);
        assert.equal(icon.height, 256);
        assert.deepEqual(icon.buffer, mockPng);

        // Test top-level extractPeIcon with file path
        const topLevelIcon = extractPeIcon(testExe);
        assert.ok(topLevelIcon);
        assert.deepEqual(topLevelIcon.buffer, mockPng);

        // Test async fromFile
        const asyncDecoder = await PeResourceDecoder.fromFile(testExe);
        assert.ok(asyncDecoder);
        const asyncIcon = asyncDecoder.extractIcon();
        assert.ok(asyncIcon);
        assert.deepEqual(asyncIcon.buffer, mockPng);
    });
});

test('Group 3: Debounced Index Saving & Cache Concurrency', async (t) => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yumeshelf-debounce-test-'));
    const mockApp = {
        getPath: () => tmpDir,
        getAppPath: () => tmpDir
    };

    t.after(async () => {
        _resetIconCacheStateForTesting();
        try {
            await fs.rm(tmpDir, { recursive: true, force: true });
        } catch {}
    });

    await t.test('Concurrent storeHighResIconInCache calls debounce and preserve all entries', async () => {
        _resetIconCacheStateForTesting();

        const count = 10;
        const promises = [];
        for (let i = 0; i < count; i++) {
            const fakePath = path.join(tmpDir, `game_${i}.exe`);
            await fs.writeFile(fakePath, `content_${i}`);
            promises.push(
                storeHighResIconInCache(mockApp, fakePath, Buffer.from(`icon_${i}`), { index: i })
            );
        }

        // Wait for memory updates
        await Promise.all(promises);

        // In-memory state should immediately reflect all 10 entries
        const memoryState = await loadIconCacheState(mockApp);
        assert.equal(Object.keys(memoryState.entriesByPath).length, count);

        // Flush debounced write to disk
        await flushPendingIconCacheState(mockApp);

        // Read index.json directly from disk to verify atomic save
        const indexFile = path.join(tmpDir, 'high-res-icon-cache', 'index.json');
        const diskRaw = await fs.readFile(indexFile, 'utf8');
        const parsedDisk = JSON.parse(diskRaw);

        assert.equal(Object.keys(parsedDisk.entriesByPath).length, count);
        for (let i = 0; i < count; i++) {
            const normalized = normalizeExecutablePath(path.join(tmpDir, `game_${i}.exe`));
            assert.ok(parsedDisk.entriesByPath[normalized], `entry ${i} must exist on disk`);
        }
    });
});

test('Group 4: Cache Version Invalidation & Transparent Border Cropping', async (t) => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yumeshelf-version-test-'));
    const mockApp = {
        getPath: () => tmpDir,
        getAppPath: () => tmpDir,
        getFileIcon: async () => ({
            toPNG: () => Buffer.from('mock-shell-png'),
            isEmpty: () => false,
            getSize: () => ({ width: 48, height: 48 })
        })
    };

    t.after(async () => {
        _resetIconCacheStateForTesting();
        try {
            await fs.rm(tmpDir, { recursive: true, force: true });
        } catch {}
    });

    await t.test('Cache state invalidates version 1 cache and removes old cache files', async () => {
        _resetIconCacheStateForTesting();
        const cacheDir = path.join(tmpDir, 'high-res-icon-cache');
        await fs.mkdir(cacheDir, { recursive: true });

        // Simulate dirty v1 cache with old file
        const oldFile = path.join(cacheDir, 'old-uncropped-fingerprint.png');
        await fs.writeFile(oldFile, 'old-uncropped-image-data');
        const v1Index = path.join(cacheDir, 'index.json');
        await fs.writeFile(v1Index, JSON.stringify({
            version: 1,
            entriesByPath: {
                'C:\\Games\\OldGame\\Game.exe': {
                    fingerprint: 'old-uncropped-fingerprint',
                    fileName: 'old-uncropped-fingerprint.png',
                    size: 12345,
                    mtimeMs: 1000,
                    cachedAtMs: 1000
                }
            }
        }, null, 2));

        // Load state - should detect version mismatch and reset to version 2
        const state = await loadIconCacheState(mockApp);
        assert.equal(state.version, ICON_CACHE_VERSION);
        assert.equal(ICON_CACHE_VERSION, 2);
        assert.deepEqual(state.entriesByPath, {});

        // Verify old file was deleted from disk
        let oldExists = true;
        try {
            await fs.access(oldFile);
        } catch {
            oldExists = false;
        }
        assert.equal(oldExists, false, 'Old uncropped cache file must be removed on version upgrade');
    });

    await t.test('cropTransparentPaddingFromBuffer crops transparent border with mock nativeImage', () => {
        // Create a mock nativeImage with 256x256 dimensions where only 32x32 in top-left is opaque
        const mockBitmap = Buffer.alloc(256 * 256 * 4); // all 0 alpha
        // Fill 32x32 top-left with alpha = 255
        for (let y = 0; y < 32; y++) {
            for (let x = 0; x < 32; x++) {
                mockBitmap[(y * 256 + x) * 4 + 3] = 255;
            }
        }

        let cropCalledWith = null;
        const mockImg = {
            isEmpty: () => false,
            getSize: () => ({ width: 256, height: 256 }),
            toBitmap: () => mockBitmap,
            crop: (rect) => {
                cropCalledWith = rect;
                return {
                    toPNG: () => Buffer.from('mock-cropped-png-bytes')
                };
            }
        };

        const mockFactory = {
            createFromBuffer: () => mockImg
        };

        const rawBuf = Buffer.from('raw-png-input');
        const result = cropTransparentPaddingFromBuffer(rawBuf, { nativeImage: mockFactory });
        assert.equal(result.cropped, true);
        assert.ok(cropCalledWith, 'crop should have been called');
        assert.equal(cropCalledWith.x, 0);
        assert.equal(cropCalledWith.y, 0);
        // Bounding box was 32, with 2% padding (~5px) width should be ~37-38
        assert.ok(cropCalledWith.width < 50, 'width should be tightly cropped to content');
        assert.ok(cropCalledWith.height < 50, 'height should be tightly cropped to content');
        assert.equal(result.buffer.toString(), 'mock-cropped-png-bytes');
    });

    await t.test('Protocol handler falls through to shell icon when PE icon is not decodable', async () => {
        const originalPlatform = process.platform;
        Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
        try {
            _resetIconCacheStateForTesting();
            const fakeExe = path.join(tmpDir, 'corrupt-pe-game.exe');
            await fs.writeFile(fakeExe, 'mock-corrupt-pe');

            let registeredProtocolHandler = null;
            const mockProtocol = {
                handle: (_scheme, handler) => {
                    registeredProtocolHandler = handler;
                }
            };

            const pipeline = createIconPipeline({
                app: mockApp,
                protocol: mockProtocol,
                ipcMain: { handle: () => {} },
                sourceRootDir: path.resolve(__dirname, '..')
            });
            pipeline.registerProtocolHandler();

            const req = new Request(`game-icon://app?path=${encodeURIComponent(fakeExe)}`);
            const resp = await registeredProtocolHandler(req);
            assert.equal(resp.status, 200);
            assert.equal(resp.headers.get('Content-Type'), 'image/png');

            const arrayBuf = await resp.arrayBuffer();
            assert.equal(Buffer.from(arrayBuf).toString(), 'mock-shell-png');
        } finally {
            Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
        }
    });

    await t.test('Protocol handler preserves standard ICO PE icon as image/x-icon fallback when transcoding is unavailable', async () => {
        const originalPlatform = process.platform;
        Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
        try {
            _resetIconCacheStateForTesting();
            const icoPeExe = path.join(tmpDir, 'standard-ico-game.exe');
            const { peBuf } = buildMockPeBufferWithPadding(0, 0, true);
            await fs.writeFile(icoPeExe, peBuf);

            let registeredProtocolHandler = null;
            const mockProtocol = {
                handle: (_scheme, handler) => {
                    registeredProtocolHandler = handler;
                }
            };

            const pipeline = createIconPipeline({
                app: mockApp,
                protocol: mockProtocol,
                ipcMain: { handle: () => {} },
                sourceRootDir: path.resolve(__dirname, '..')
            });
            pipeline.registerProtocolHandler();

            const req = new Request(`game-icon://app?path=${encodeURIComponent(icoPeExe)}`);
            const resp = await registeredProtocolHandler(req);
            assert.equal(resp.status, 200);
            assert.equal(resp.headers.get('Content-Type'), 'image/x-icon');

            const arrayBuf = await resp.arrayBuffer();
            const resBuf = Buffer.from(arrayBuf);
            // Verify ICO header (first 4 bytes: 00 00 01 00)
            assert.equal(resBuf.readUInt16LE(0), 0);
            assert.equal(resBuf.readUInt16LE(2), 1);
        } finally {
            Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
        }
    });

    await t.test('convertIcoBufferToPng decodes via createFromBuffer when available', () => {
        const mockImg = {
            isEmpty: () => false,
            toPNG: () => Buffer.from('mock-png-from-buffer')
        };
        const mockFactory = {
            createFromBuffer: () => mockImg,
            createFromPath: () => null
        };
        const result = convertIcoBufferToPng(Buffer.from('mock-ico'), mockFactory);
        assert.equal(result.toString(), 'mock-png-from-buffer');
    });

    await t.test('convertIcoBufferToPng falls back to createFromPath when createFromBuffer returns empty', () => {
        const emptyImg = {
            isEmpty: () => true
        };
        const validImg = {
            isEmpty: () => false,
            toPNG: () => Buffer.from('mock-png-from-path')
        };
        let createdPath = null;
        const mockFactory = {
            createFromBuffer: () => emptyImg,
            createFromPath: (filePath) => {
                createdPath = filePath;
                return validImg;
            }
        };
        const result = convertIcoBufferToPng(Buffer.from('mock-ico-data'), mockFactory);
        assert.equal(result.toString(), 'mock-png-from-path');
        assert.ok(createdPath, 'createFromPath must be called with temp file path');
        assert.ok(createdPath.endsWith('.ico'));
    });

    await t.test('convertIcoBufferToPng returns null when factory returns empty or is absent', () => {
        const emptyImg = {
            isEmpty: () => true
        };
        const mockFactory = {
            createFromBuffer: () => emptyImg,
            createFromPath: () => emptyImg
        };
        assert.equal(convertIcoBufferToPng(Buffer.from('ico'), mockFactory), null);
        assert.equal(convertIcoBufferToPng(Buffer.from('ico'), {}), null);
    });

    await t.test('Protocol handler transcodes standard ICO PE icon to image/png when nativeImage is provided', async () => {
        const originalPlatform = process.platform;
        Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
        try {
            _resetIconCacheStateForTesting();
            const icoPeExe = path.join(tmpDir, 'transcoded-ico-game.exe');
            const { peBuf } = buildMockPeBufferWithPadding(0, 0, true);
            await fs.writeFile(icoPeExe, peBuf);

            let registeredProtocolHandler = null;
            const mockProtocol = {
                handle: (_scheme, handler) => {
                    registeredProtocolHandler = handler;
                }
            };

            const mockTranscodedImg = {
                isEmpty: () => false,
                toPNG: () => Buffer.from('transcoded-png-bytes'),
                getSize: () => ({ width: 256, height: 256 }),
                toBitmap: () => Buffer.alloc(256 * 256 * 4, 255)
            };
            const mockNativeImage = {
                createFromBuffer: () => mockTranscodedImg,
                createFromPath: () => mockTranscodedImg
            };

            const pipeline = createIconPipeline({
                app: mockApp,
                protocol: mockProtocol,
                ipcMain: { handle: () => {} },
                sourceRootDir: path.resolve(__dirname, '..'),
                nativeImage: mockNativeImage
            });
            pipeline.registerProtocolHandler();

            const req = new Request(`game-icon://app?path=${encodeURIComponent(icoPeExe)}`);
            const resp = await registeredProtocolHandler(req);
            assert.equal(resp.status, 200);
            assert.equal(resp.headers.get('Content-Type'), 'image/png');

            const arrayBuf = await resp.arrayBuffer();
            assert.equal(Buffer.from(arrayBuf).toString(), 'transcoded-png-bytes');

            // Verify it was saved to cache
            await pipeline.flushCache();
            const cached = await tryGetCachedIconBuffer(mockApp, icoPeExe);
            assert.ok(cached);
            assert.equal(cached.toString(), 'transcoded-png-bytes');
        } finally {
            Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
        }
    });

    await t.test('IconPipeline exposes flushCache which flushes pending index writes', async () => {
        _resetIconCacheStateForTesting();
        const pipeline = createIconPipeline({
            app: mockApp,
            protocol: { handle: () => {} },
            ipcMain: { handle: () => {} },
            sourceRootDir: path.resolve(__dirname, '..')
        });
        assert.equal(typeof pipeline.flushCache, 'function');
        await pipeline.flushCache();
    });
});

test('Group 6: Synthetic Multi-Game Scenario Simulation (End-to-End Invariants)', async (t) => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

    const rootTmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yumeshelf-sim-suite-'));
    const gamesDir = path.join(rootTmpDir, 'synthetic-games');
    const userDataDir = path.join(rootTmpDir, 'user-data');
    await fs.mkdir(gamesDir, { recursive: true });
    await fs.mkdir(userDataDir, { recursive: true });

    try {
        _resetIconCacheStateForTesting();

        // 1. Synthetic Game A: Windows PE with embedded 256x256 PNG icon
        const gameADir = path.join(gamesDir, 'Game-PNG-PE');
        await fs.mkdir(gameADir, { recursive: true });
        const gameAExe = path.join(gameADir, 'Game.exe');
        const { peBuf: peBufA } = buildMockPeBufferWithPadding(0, 0, false);
        await fs.writeFile(gameAExe, peBufA);

        // 2. Synthetic Game B: Windows PE with embedded 256x256 DIB icon (Windows ICO format)
        const gameBDir = path.join(gamesDir, 'Game-DIB-PE');
        await fs.mkdir(gameBDir, { recursive: true });
        const gameBExe = path.join(gameBDir, 'Game.exe');
        const { peBuf: peBufB } = buildMockPeBufferWithPadding(0, 0, true);
        await fs.writeFile(gameBExe, peBufB);

        // 3. Synthetic Game C: Directory with local artwork (icon.png)
        const gameCDir = path.join(gamesDir, 'Game-Local-Art');
        await fs.mkdir(gameCDir, { recursive: true });
        const gameCExe = path.join(gameCDir, 'Game.exe');
        await fs.writeFile(gameCExe, Buffer.from('MZ-dummy-binary-without-pe-rsrc'));
        const mockLocalPng = Buffer.from('local-art-png-bytes');
        await fs.writeFile(path.join(gameCDir, 'icon.png'), mockLocalPng);

        // 4. Synthetic Game D: Empty binary falling through to app.getFileIcon
        const gameDDir = path.join(gamesDir, 'Game-Shell-Fallback');
        await fs.mkdir(gameDDir, { recursive: true });
        const gameDExe = path.join(gameDDir, 'Game.exe');
        await fs.writeFile(gameDExe, Buffer.from('plain-script-file'));

        // Mock App & NativeImage
        let fallbackCallCount = 0;
        const mockApp = {
            getPath: () => userDataDir,
            getAppPath: () => rootTmpDir,
            getFileIcon: async () => {
                fallbackCallCount++;
                return {
                    isEmpty: () => false,
                    toPNG: () => Buffer.from('shell-icon-png-bytes'),
                    getSize: () => ({ width: 48, height: 48 })
                };
            }
        };

        let protocolHandler = null;
        const mockProtocol = {
            handle: (_scheme, handler) => {
                protocolHandler = handler;
            }
        };

        const mockDecodedDIBImage = {
            isEmpty: () => false,
            toPNG: () => Buffer.from('dib-converted-png-bytes'),
            getSize: () => ({ width: 256, height: 256 }),
            toBitmap: () => Buffer.alloc(256 * 256 * 4, 255)
        };

        const mockNativeImage = {
            // Simulate Chromium's createFromBuffer failing on Windows ICO buffers
            createFromBuffer: (buf) => {
                if (buf && buf.length > 2 && buf.readUInt16LE(2) === 1) {
                    return { isEmpty: () => true };
                }
                return {
                    isEmpty: () => false,
                    toPNG: () => buf,
                    getSize: () => ({ width: 256, height: 256 }),
                    toBitmap: () => Buffer.alloc(256 * 256 * 4, 255)
                };
            },
            // Fallback to createFromPath succeeds
            createFromPath: (filePath) => {
                if (filePath && filePath.endsWith('.ico')) {
                    return mockDecodedDIBImage;
                }
                return { isEmpty: () => true };
            }
        };

        const pipeline = createIconPipeline({
            app: mockApp,
            protocol: mockProtocol,
            ipcMain: { handle: () => {} },
            sourceRootDir: rootTmpDir,
            nativeImage: mockNativeImage
        });
        pipeline.registerProtocolHandler();

        await t.test('All synthetic game variants resolve without quality degradation', async () => {
            // Test Game A (PNG PE)
            const respA = await protocolHandler(new Request(`game-icon://app?path=${encodeURIComponent(gameAExe)}`));
            assert.equal(respA.status, 200);
            assert.equal(respA.headers.get('Content-Type'), 'image/png');

            // Test Game B (DIB PE - must use temp path fallback rather than falling through to 48x48 shell icon)
            const respB = await protocolHandler(new Request(`game-icon://app?path=${encodeURIComponent(gameBExe)}`));
            assert.equal(respB.status, 200);
            assert.equal(respB.headers.get('Content-Type'), 'image/png');
            const bytesB = Buffer.from(await respB.arrayBuffer());
            assert.equal(bytesB.toString(), 'dib-converted-png-bytes');

            // Test Game C (Local artwork)
            const respC = await protocolHandler(new Request(`game-icon://app?path=${encodeURIComponent(gameCExe)}`));
            assert.equal(respC.status, 200);
            assert.equal(respC.headers.get('Content-Type'), 'image/png');
            const bytesC = Buffer.from(await respC.arrayBuffer());
            assert.equal(bytesC.toString(), 'local-art-png-bytes');

            // Test Game D (Fallback)
            const respD = await protocolHandler(new Request(`game-icon://app?path=${encodeURIComponent(gameDExe)}`));
            assert.equal(respD.status, 200);
            assert.equal(respD.headers.get('Content-Type'), 'image/png');
            assert.equal(fallbackCallCount, 1);
        });

        await t.test('Flushing and subsequent queries serve directly from high-res-icon-cache', async () => {
            await pipeline.flushCache();

            // Cached Game A
            const cachedA = await tryGetCachedIconBuffer(mockApp, gameAExe);
            assert.ok(cachedA, 'Game A should be cached');

            // Cached Game B (DIB transcoded)
            const cachedB = await tryGetCachedIconBuffer(mockApp, gameBExe);
            assert.ok(cachedB, 'Game B should be cached');
            assert.equal(cachedB.toString(), 'dib-converted-png-bytes');

            // Fast path cache hit via protocol handler
            const respA2 = await protocolHandler(new Request(`game-icon://app?path=${encodeURIComponent(gameAExe)}`));
            assert.equal(respA2.status, 200);
            const bytesA2 = Buffer.from(await respA2.arrayBuffer());
            assert.equal(bytesA2.toString(), cachedA.toString());
        });
    } finally {
        Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
        await fs.rm(rootTmpDir, { recursive: true, force: true }).catch(() => {});
    }
});

