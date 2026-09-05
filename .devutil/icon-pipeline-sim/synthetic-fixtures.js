const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const zlib = require('node:zlib');

// CRC32 calculation table for valid PNG chunks
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable[n] = c;
}

function calcCrc32(buf, start, end) {
    let c = 0xffffffff;
    for (let i = start; i < end; i++) {
        c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
}

function makePngChunk(type, data) {
    const chunk = Buffer.alloc(12 + data.length);
    chunk.writeUInt32BE(data.length, 0);
    chunk.write(type, 4, 'ascii');
    data.copy(chunk, 8);
    const crc = calcCrc32(chunk, 4, 8 + data.length);
    chunk.writeUInt32BE(crc, 8 + data.length);
    return chunk;
}

function createMinimalPng(width = 256, height = 256) {
    const rowSize = 1 + width * 4;
    const rawData = Buffer.alloc(rowSize * height);
    for (let y = 0; y < height; y++) {
        const rowOffset = y * rowSize;
        rawData[rowOffset] = 0; // Filter: None
        for (let x = 0; x < width; x++) {
            const px = rowOffset + 1 + x * 4;
            rawData[px] = 200;     // R
            rawData[px + 1] = 100; // G
            rawData[px + 2] = 50;  // B
            rawData[px + 3] = 255; // A
        }
    }
    const compressed = zlib.deflateSync(rawData);

    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const ihdrData = Buffer.alloc(13);
    ihdrData.writeUInt32BE(width, 0);
    ihdrData.writeUInt32BE(height, 4);
    ihdrData.writeUInt8(8, 8);  // 8 bits
    ihdrData.writeUInt8(6, 9);  // RGBA
    ihdrData.writeUInt8(0, 10);
    ihdrData.writeUInt8(0, 11);
    ihdrData.writeUInt8(0, 12);

    const ihdr = makePngChunk('IHDR', ihdrData);
    const idat = makePngChunk('IDAT', compressed);
    const iend = makePngChunk('IEND', Buffer.alloc(0));

    return Buffer.concat([pngHeader, ihdr, idat, iend]);
}

function createValidDib(width = 256, height = 256) {
    const biSize = 40;
    const pixelBytes = width * height * 4;
    const maskBytes = (width * height) / 8;
    const dibTotal = biSize + pixelBytes + maskBytes;
    const dib = Buffer.alloc(dibTotal);

    dib.writeUInt32LE(biSize, 0);
    dib.writeInt32LE(width, 4);
    dib.writeInt32LE(height * 2, 8); // ICO DIB height is doubled
    dib.writeUInt16LE(1, 12);        // biPlanes
    dib.writeUInt16LE(32, 14);       // biBitCount
    dib.writeUInt32LE(0, 16);        // BI_RGB
    dib.writeUInt32LE(pixelBytes + maskBytes, 20);

    for (let i = 0; i < width * height; i++) {
        const offset = biSize + i * 4;
        dib[offset] = 220;     // B
        dib[offset + 1] = 120; // G
        dib[offset + 2] = 80;  // R
        dib[offset + 3] = 255; // A (fully opaque)
    }

    return dib;
}

function buildMockPeBuffer(useDib = false, width = 256, height = 256) {
    const iconData = useDib ? createValidDib(width, height) : createMinimalPng(width, height);

    const peOffset = 0x80;
    const optionalHeaderSize = 224;
    const sectionTableOffset = peOffset + 24 + optionalHeaderSize;
    const rsrcSectionRawOffset = 0x200;
    const rsrcSectionRva = 0x2000;

    const rsrcBuf = Buffer.alloc(Math.max(4096, iconData.length + 2048));

    // Root directory: RT_GROUP_ICON (14) and RT_ICON (3)
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
    rsrcBuf.writeUInt8(width === 256 ? 0 : width, entryOffset);
    rsrcBuf.writeUInt8(height === 256 ? 0 : height, entryOffset + 1);
    rsrcBuf.writeUInt16LE(1, entryOffset + 4);
    rsrcBuf.writeUInt16LE(32, entryOffset + 6);
    rsrcBuf.writeUInt32LE(iconData.length, entryOffset + 8);
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

    const iconDataInRsrc = 0x400;
    rsrcBuf.writeUInt32LE(rsrcSectionRva + iconDataInRsrc, iconDataEntry);
    rsrcBuf.writeUInt32LE(iconData.length, iconDataEntry + 4);
    iconData.copy(rsrcBuf, iconDataInRsrc);

    const totalSize = rsrcSectionRawOffset + rsrcBuf.length;
    const peBuf = Buffer.alloc(totalSize);

    // DOS Header
    peBuf.writeUInt16LE(0x5a4d, 0);
    peBuf.writeUInt32LE(peOffset, 0x3c);

    // PE Header
    peBuf.writeUInt32LE(0x00004550, peOffset);
    peBuf.writeUInt16LE(1, peOffset + 6);
    peBuf.writeUInt16LE(optionalHeaderSize, peOffset + 20);

    // Optional Header
    const optOffset = peOffset + 24;
    peBuf.writeUInt16LE(0x10b, optOffset);
    peBuf.writeUInt32LE(rsrcSectionRva, optOffset + 96 + 16);
    peBuf.writeUInt32LE(rsrcBuf.length, optOffset + 96 + 20);

    // Section Header
    peBuf.write('.rsrc\0\0\0', sectionTableOffset, 8, 'utf8');
    peBuf.writeUInt32LE(rsrcBuf.length, sectionTableOffset + 8);
    peBuf.writeUInt32LE(rsrcSectionRva, sectionTableOffset + 12);
    peBuf.writeUInt32LE(rsrcBuf.length, sectionTableOffset + 16);
    peBuf.writeUInt32LE(rsrcSectionRawOffset, sectionTableOffset + 20);

    rsrcBuf.copy(peBuf, rsrcSectionRawOffset);

    return peBuf;
}

async function createSyntheticGameLibrary(targetDir) {
    await fs.mkdir(targetDir, { recursive: true });

    // 1. Game-PNG-PE: 256x256 embedded PNG icon
    const game1Dir = path.join(targetDir, 'Game-PNG-PE');
    await fs.mkdir(game1Dir, { recursive: true });
    const pePng = buildMockPeBuffer(false, 256, 256);
    await fs.writeFile(path.join(game1Dir, 'Game.exe'), pePng);

    // 2. Game-DIB-PE: 256x256 embedded Windows DIB ICO
    const game2Dir = path.join(targetDir, 'Game-DIB-PE');
    await fs.mkdir(game2Dir, { recursive: true });
    const peDib = buildMockPeBuffer(true, 256, 256);
    await fs.writeFile(path.join(game2Dir, 'Game.exe'), peDib);

    // 3. Game-Local-Art: Directory with local icon.png
    const game3Dir = path.join(targetDir, 'Game-Local-Art');
    await fs.mkdir(game3Dir, { recursive: true });
    await fs.writeFile(path.join(game3Dir, 'Game.exe'), Buffer.from('stub-binary-no-pe'));
    await fs.writeFile(path.join(game3Dir, 'icon.png'), createMinimalPng(128, 128));

    // 4. Game-Shell-Fallback: Script or executable without icons
    const game4Dir = path.join(targetDir, 'Game-Shell-Fallback');
    await fs.mkdir(game4Dir, { recursive: true });
    await fs.writeFile(path.join(game4Dir, 'Game.exe'), Buffer.from('stub-script-file'));

    return [
        { name: 'Game-PNG-PE', folderPath: game1Dir, exePath: path.join(game1Dir, 'Game.exe'), expectedType: 'pe-png' },
        { name: 'Game-DIB-PE', folderPath: game2Dir, exePath: path.join(game2Dir, 'Game.exe'), expectedType: 'pe-dib' },
        { name: 'Game-Local-Art', folderPath: game3Dir, exePath: path.join(game3Dir, 'Game.exe'), expectedType: 'local-art' },
        { name: 'Game-Shell-Fallback', folderPath: game4Dir, exePath: path.join(game4Dir, 'Game.exe'), expectedType: 'fallback' }
    ];
}

module.exports = {
    createMinimalPng,
    createValidDib,
    buildMockPeBuffer,
    createSyntheticGameLibrary
};
