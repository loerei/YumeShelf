const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
    PeResourceDecoder,
    extractPeIcon,
    extractPeMetadata
} = require('../dist/main/icon-pipeline/pe-resource-decoder');

const {
    parseDesktopFileIcon,
    resolveDesktopIconPath,
    findDesktopEntryIcon
} = require('../dist/main/icon-pipeline/desktop-entry');

const {
    findLocalGameImage,
    getImageMimeType
} = require('../dist/main/icon-pipeline/service');

/**
 * Builds a minimal valid PE32 / PE32+ executable buffer containing a .rsrc section.
 */
function buildMockPeBuffer(options = {}) {
    const is64Bit = options.is64Bit || false;
    const pngFrame = options.pngFrame || null;
    const dibFrame = options.dibFrame || null;
    const versionMetadata = options.versionMetadata || null;

    // We'll place PE header at offset 0x80 (128)
    const peOffset = 0x80;
    const optionalHeaderSize = is64Bit ? 240 : 224;
    const numSections = 1;
    const sectionTableOffset = peOffset + 24 + optionalHeaderSize;
    const rsrcSectionRawOffset = 0x200; // 512
    const rsrcSectionRva = 0x2000;

    // Construct resource tree within .rsrc
    // Level 1: Root directory (Type)
    // Level 2: Subdirectory (Name/ID)
    // Level 3: Subdirectory (Language)
    // Data Entries: Icon and Version Data

    const rsrcBuf = Buffer.alloc(4096);
    let rsrcPos = 0;

    // Helper to write directory table
    // Directory Header (16 bytes): namedEntries (uint16), idEntries (uint16)
    function writeDirHeader(offset, namedCount, idCount) {
        rsrcBuf.writeUInt16LE(namedCount, offset + 12);
        rsrcBuf.writeUInt16LE(idCount, offset + 14);
    }

    // Root directory at 0
    const rootNamed = 0;
    let rootId = 0;
    if (pngFrame || dibFrame) rootId += 2; // RT_GROUP_ICON (14) & RT_ICON (3)
    if (versionMetadata) rootId += 1; // RT_VERSION (16)

    writeDirHeader(0, rootNamed, rootId);

    let rootEntryIdx = 0;
    let nextSubdirOffset = 16 + rootId * 8;

    // Level 2 & 3 structures for Icons
    if (pngFrame || dibFrame) {
        const frameData = pngFrame || dibFrame;
        const isPng = !!pngFrame;
        const iconWidth = isPng ? 256 : 32;
        const iconHeight = isPng ? 256 : 32;

        // 1. RT_GROUP_ICON entry in root
        rsrcBuf.writeUInt32LE(14, 16 + rootEntryIdx * 8); // RT_GROUP_ICON (14)
        rsrcBuf.writeUInt32LE((0x80000000 | nextSubdirOffset) >>> 0, 16 + rootEntryIdx * 8 + 4);
        rootEntryIdx++;

        const groupL2Offset = nextSubdirOffset;
        writeDirHeader(groupL2Offset, 0, 1); // 1 group icon ID (1)
        rsrcBuf.writeUInt32LE(1, groupL2Offset + 16); // Group ID 1
        const groupL3Offset = groupL2Offset + 24;
        rsrcBuf.writeUInt32LE((0x80000000 | groupL3Offset) >>> 0, groupL2Offset + 16 + 4);

        writeDirHeader(groupL3Offset, 0, 1); // Lang 0
        rsrcBuf.writeUInt32LE(0, groupL3Offset + 16); // Lang 0
        const groupDataEntryOffset = groupL3Offset + 24;
        rsrcBuf.writeUInt32LE(groupDataEntryOffset, groupL3Offset + 16 + 4);

        // Group Icon Resource Data (GRPICONDIR + 1 GRPICONDIRENTRY)
        const groupDataOffsetInRsrc = 0x300;
        // Data Entry points to groupDataOffsetInRsrc RVA
        rsrcBuf.writeUInt32LE(rsrcSectionRva + groupDataOffsetInRsrc, groupDataEntryOffset); // OffsetToData (RVA)
        rsrcBuf.writeUInt32LE(6 + 14, groupDataEntryOffset + 4); // Size

        // GRPICONDIR: idReserved(0), idType(1), idCount(1)
        rsrcBuf.writeUInt16LE(0, groupDataOffsetInRsrc);
        rsrcBuf.writeUInt16LE(1, groupDataOffsetInRsrc + 2);
        rsrcBuf.writeUInt16LE(1, groupDataOffsetInRsrc + 4);

        // GRPICONDIRENTRY
        rsrcBuf.writeUInt8(iconWidth >= 256 ? 0 : iconWidth, groupDataOffsetInRsrc + 6);
        rsrcBuf.writeUInt8(iconHeight >= 256 ? 0 : iconHeight, groupDataOffsetInRsrc + 7);
        rsrcBuf.writeUInt8(0, groupDataOffsetInRsrc + 8); // bColorCount
        rsrcBuf.writeUInt8(0, groupDataOffsetInRsrc + 9); // bReserved
        rsrcBuf.writeUInt16LE(1, groupDataOffsetInRsrc + 10); // wPlanes
        rsrcBuf.writeUInt16LE(32, groupDataOffsetInRsrc + 12); // wBitCount
        rsrcBuf.writeUInt32LE(frameData.length, groupDataOffsetInRsrc + 14); // dwBytesInRes
        rsrcBuf.writeUInt16LE(1, groupDataOffsetInRsrc + 18); // nID (Icon ID = 1)

        // 2. RT_ICON entry in root
        const iconL2Offset = groupDataEntryOffset + 16;
        rsrcBuf.writeUInt32LE(3, 16 + rootEntryIdx * 8); // RT_ICON (3)
        rsrcBuf.writeUInt32LE((0x80000000 | iconL2Offset) >>> 0, 16 + rootEntryIdx * 8 + 4);
        rootEntryIdx++;

        writeDirHeader(iconL2Offset, 0, 1); // 1 Icon ID (1)
        rsrcBuf.writeUInt32LE(1, iconL2Offset + 16); // Icon ID 1
        const iconL3Offset = iconL2Offset + 24;
        rsrcBuf.writeUInt32LE((0x80000000 | iconL3Offset) >>> 0, iconL2Offset + 16 + 4);

        writeDirHeader(iconL3Offset, 0, 1); // Lang 0
        rsrcBuf.writeUInt32LE(0, iconL3Offset + 16); // Lang 0
        const iconDataEntryOffset = iconL3Offset + 24;
        rsrcBuf.writeUInt32LE(iconDataEntryOffset, iconL3Offset + 16 + 4);

        const iconFrameDataOffsetInRsrc = 0x400;
        rsrcBuf.writeUInt32LE(rsrcSectionRva + iconFrameDataOffsetInRsrc, iconDataEntryOffset); // OffsetToData (RVA)
        rsrcBuf.writeUInt32LE(frameData.length, iconDataEntryOffset + 4); // Size

        // Write frame buffer
        frameData.copy(rsrcBuf, iconFrameDataOffsetInRsrc);

        nextSubdirOffset = iconDataEntryOffset + 16;
    }

    if (versionMetadata) {
        // RT_VERSION entry in root
        const versionL2Offset = nextSubdirOffset;
        rsrcBuf.writeUInt32LE(16, 16 + rootEntryIdx * 8); // RT_VERSION (16)
        rsrcBuf.writeUInt32LE((0x80000000 | versionL2Offset) >>> 0, 16 + rootEntryIdx * 8 + 4);
        rootEntryIdx++;

        writeDirHeader(versionL2Offset, 0, 1);
        rsrcBuf.writeUInt32LE(1, versionL2Offset + 16); // Version ID 1
        const versionL3Offset = versionL2Offset + 24;
        rsrcBuf.writeUInt32LE((0x80000000 | versionL3Offset) >>> 0, versionL2Offset + 16 + 4);

        writeDirHeader(versionL3Offset, 0, 1);
        rsrcBuf.writeUInt32LE(0, versionL3Offset + 16);
        const versionDataEntryOffset = versionL3Offset + 24;
        rsrcBuf.writeUInt32LE(versionDataEntryOffset, versionL3Offset + 16 + 4);

        const versionDataOffsetInRsrc = 0x800;
        // Construct synthetic StringFileInfo block
        const versionBlock = Buffer.alloc(1024);
        let vPos = 0;

        // Write synthetic UTF-16LE entries
        function writeVersionString(key, value) {
            const keyU16 = Buffer.from(key + '\0', 'utf16le');
            const valU16 = Buffer.from(value + '\0', 'utf16le');
            const structLen = 6 + keyU16.length + 2 + valU16.length;

            versionBlock.writeUInt16LE(structLen, vPos);
            versionBlock.writeUInt16LE(value.length + 1, vPos + 2); // wValueLength
            versionBlock.writeUInt16LE(1, vPos + 4); // wType = 1 (Unicode)
            keyU16.copy(versionBlock, vPos + 6);

            let valStart = vPos + 6 + keyU16.length;
            valStart = (valStart + 3) & ~3; // 4-byte align
            valU16.copy(versionBlock, valStart);
            vPos = valStart + valU16.length;
            vPos = (vPos + 3) & ~3;
        }

        if (versionMetadata.productName) writeVersionString('ProductName', versionMetadata.productName);
        if (versionMetadata.fileDescription) writeVersionString('FileDescription', versionMetadata.fileDescription);
        if (versionMetadata.fileVersion) writeVersionString('FileVersion', versionMetadata.fileVersion);
        if (versionMetadata.companyName) writeVersionString('CompanyName', versionMetadata.companyName);

        rsrcBuf.writeUInt32LE(rsrcSectionRva + versionDataOffsetInRsrc, versionDataEntryOffset);
        rsrcBuf.writeUInt32LE(vPos, versionDataEntryOffset + 4);
        versionBlock.subarray(0, vPos).copy(rsrcBuf, versionDataOffsetInRsrc);
    }

    // Now assemble full PE Buffer
    const fullPe = Buffer.alloc(rsrcSectionRawOffset + rsrcBuf.length);

    // 1. DOS Header
    fullPe.writeUInt16LE(0x5a4d, 0); // 'MZ'
    fullPe.writeUInt32LE(peOffset, 0x3c); // e_lfanew

    // 2. PE Signature
    fullPe.writeUInt32LE(0x00004550, peOffset); // 'PE\0\0'

    // 3. COFF File Header
    fullPe.writeUInt16LE(is64Bit ? 0x8664 : 0x014c, peOffset + 4); // Machine
    fullPe.writeUInt16LE(numSections, peOffset + 6); // NumberOfSections
    fullPe.writeUInt32LE(0, peOffset + 8); // TimeDateStamp
    fullPe.writeUInt32LE(0, peOffset + 12); // PointerToSymbolTable
    fullPe.writeUInt32LE(0, peOffset + 16); // NumberOfSymbols
    fullPe.writeUInt16LE(optionalHeaderSize, peOffset + 20); // SizeOfOptionalHeader
    fullPe.writeUInt16LE(0x0002, peOffset + 22); // Characteristics (EXECUTABLE_IMAGE)

    // 4. Optional Header
    const optOffset = peOffset + 24;
    fullPe.writeUInt16LE(is64Bit ? 0x20b : 0x10b, optOffset); // Magic

    const dataDirResourceOffset = optOffset + (is64Bit ? 112 : 96) + 2 * 8;
    fullPe.writeUInt32LE(rsrcSectionRva, dataDirResourceOffset); // Resource Table RVA
    fullPe.writeUInt32LE(rsrcBuf.length, dataDirResourceOffset + 4); // Resource Table Size

    // 5. Section Table Header (.rsrc)
    fullPe.write('.rsrc\0\0\0', sectionTableOffset, 'utf8');
    fullPe.writeUInt32LE(rsrcBuf.length, sectionTableOffset + 8); // VirtualSize
    fullPe.writeUInt32LE(rsrcSectionRva, sectionTableOffset + 12); // VirtualAddress
    fullPe.writeUInt32LE(rsrcBuf.length, sectionTableOffset + 16); // SizeOfRawData
    fullPe.writeUInt32LE(rsrcSectionRawOffset, sectionTableOffset + 20); // PointerToRawData
    fullPe.writeUInt32LE(0x40000040, sectionTableOffset + 36); // Characteristics (INITIALIZED_DATA | READ)

    // 6. Copy .rsrc section content
    rsrcBuf.copy(fullPe, rsrcSectionRawOffset);

    return fullPe;
}

test('PE Resource Decoder: Pure TypeScript binary extraction', async (t) => {
    await t.test('extracts high-resolution embedded PNG icon frame (PE32 & PE32+)', async () => {
        // Construct a synthetic 256x256 PNG buffer
        const mockPng = Buffer.alloc(64);
        // PNG signature: 89 50 4E 47 0D 0A 1A 0A
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(mockPng, 0);
        // IHDR chunk: length=13, 'IHDR', width=256, height=256
        mockPng.writeUInt32BE(13, 8);
        mockPng.write('IHDR', 12, 'utf8');
        mockPng.writeUInt32BE(256, 16); // Width
        mockPng.writeUInt32BE(256, 20); // Height

        const peBuffer32 = buildMockPeBuffer({ is64Bit: false, pngFrame: mockPng });
        const icon32 = extractPeIcon(peBuffer32);

        assert.ok(icon32);
        assert.equal(icon32.isPng, true);
        assert.equal(icon32.mimeType, 'image/png');
        assert.equal(icon32.width, 256);
        assert.equal(icon32.height, 256);
        assert.deepEqual(icon32.buffer, mockPng);

        // Test 64-bit PE32+
        const peBuffer64 = buildMockPeBuffer({ is64Bit: true, pngFrame: mockPng });
        const icon64 = extractPeIcon(peBuffer64);

        assert.ok(icon64);
        assert.equal(icon64.isPng, true);
        assert.equal(icon64.width, 256);
        assert.equal(icon64.height, 256);
    });

    await t.test('extracts and synthesizes valid ICO header for DIB bitmap frame', async () => {
        // Synthetic 32x32 DIB frame (BITMAPINFOHEADER 40 bytes + 32x32 pixel bytes)
        const mockDib = Buffer.alloc(40 + 32 * 32 * 4);
        mockDib.writeUInt32LE(40, 0); // biSize
        mockDib.writeInt32LE(32, 4); // biWidth
        mockDib.writeInt32LE(64, 8); // biHeight (double for XOR + AND masks)
        mockDib.writeUInt16LE(1, 12); // biPlanes
        mockDib.writeUInt16LE(32, 14); // biBitCount

        const peBuffer = buildMockPeBuffer({ dibFrame: mockDib });
        const icon = extractPeIcon(peBuffer);

        assert.ok(icon);
        assert.equal(icon.isPng, false);
        assert.equal(icon.mimeType, 'image/x-icon');
        assert.equal(icon.width, 32);
        assert.equal(icon.height, 32);

        // Verify synthesized .ico header (22 bytes)
        assert.equal(icon.buffer.readUInt16LE(0), 0); // idReserved
        assert.equal(icon.buffer.readUInt16LE(2), 1); // idType (1 = ICO)
        assert.equal(icon.buffer.readUInt16LE(4), 1); // idCount (1 frame)
        assert.equal(icon.buffer.readUInt8(6), 32); // bWidth
        assert.equal(icon.buffer.readUInt8(7), 32); // bHeight
        assert.equal(icon.buffer.readUInt32LE(18), 22); // dwImageOffset
    });

    await t.test('extracts VS_VERSIONINFO metadata string table', async () => {
        const peBuffer = buildMockPeBuffer({
            versionMetadata: {
                productName: 'Yume Chronicle DX',
                fileDescription: 'Yume Chronicle Game Executable',
                fileVersion: '2.1.0.0',
                companyName: 'Studio Hikari'
            }
        });

        const meta = extractPeMetadata(peBuffer);
        assert.ok(meta);
        assert.equal(meta.productName, 'Yume Chronicle DX');
        assert.equal(meta.fileDescription, 'Yume Chronicle Game Executable');
        assert.equal(meta.fileVersion, '2.1.0.0');
        assert.equal(meta.companyName, 'Studio Hikari');
    });

    await t.test('gracefully handles malformed, truncated, or non-PE buffers', async () => {
        assert.equal(extractPeIcon(Buffer.alloc(0)), null);
        assert.equal(extractPeIcon(Buffer.from('not a pe binary')), null);
        assert.equal(extractPeIcon(Buffer.alloc(30)), null);

        // DOS header valid but PE header truncated
        const partialPe = Buffer.alloc(100);
        partialPe.writeUInt16LE(0x5a4d, 0);
        partialPe.writeUInt32LE(0x80, 0x3c); // points past buffer
        assert.equal(extractPeIcon(partialPe), null);
        assert.equal(extractPeMetadata(partialPe), null);
    });
});

test('Desktop Entry Resolver: Linux .desktop file icon extraction', async (t) => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yumeshelf_desktop_test_'));

    t.after(() => {
        try {
            fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {}
    });

    await t.test('parses Icon= property from [Desktop Entry]', () => {
        const content = `[Desktop Entry]\nType=Application\nName=SuperGame\nIcon=super-game-icon\nExec=./run.sh`;
        assert.equal(parseDesktopFileIcon(content), 'super-game-icon');

        const contentWithSpaces = `[Desktop Entry]\nIcon = /usr/share/pixmaps/game.png \nName=Game`;
        assert.equal(parseDesktopFileIcon(contentWithSpaces), '/usr/share/pixmaps/game.png');
    });

    await t.test('findDesktopEntryIcon locates local relative icon image', () => {
        const desktopPath = path.join(tempDir, 'game.desktop');
        const iconPath = path.join(tempDir, 'game_banner.png');

        fs.writeFileSync(iconPath, 'mock png');
        fs.writeFileSync(desktopPath, `[Desktop Entry]\nName=MyGame\nIcon=game_banner.png\nExec=./start`);

        const resolvedFromDir = findDesktopEntryIcon(tempDir);
        assert.equal(resolvedFromDir, iconPath);

        const resolvedFromFile = findDesktopEntryIcon(desktopPath);
        assert.equal(resolvedFromFile, iconPath);
    });
});

test('Local Game Image & MIME Type Utilities', async (t) => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yumeshelf_image_test_'));

    t.after(() => {
        try {
            fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {}
    });

    await t.test('getImageMimeType returns correct MIME types', () => {
        assert.equal(getImageMimeType('png'), 'image/png');
        assert.equal(getImageMimeType('jpg'), 'image/jpeg');
        assert.equal(getImageMimeType('jpeg'), 'image/jpeg');
        assert.equal(getImageMimeType('svg'), 'image/svg+xml');
        assert.equal(getImageMimeType('ico'), 'image/x-icon');
        assert.equal(getImageMimeType('webp'), 'image/webp');
    });

    await t.test('findLocalGameImage finds desktop entry icon when no root image exists', () => {
        const desktopPath = path.join(tempDir, 'play.desktop');
        const iconPath = path.join(tempDir, 'art.jpg');

        fs.writeFileSync(iconPath, 'mock jpg');
        fs.writeFileSync(desktopPath, `[Desktop Entry]\nName=VisualNovel\nIcon=art.jpg`);

        const exePath = path.join(tempDir, 'game.sh');
        fs.writeFileSync(exePath, '#!/bin/sh');

        const res = findLocalGameImage(exePath);
        assert.ok(res);
        assert.equal(res.imgPath, iconPath);
        assert.equal(res.ext, 'jpg');
    });
});
