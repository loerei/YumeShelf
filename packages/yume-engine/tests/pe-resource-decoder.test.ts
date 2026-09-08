/// <reference types="node" />
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  PeResourceDecoder,
  PEInspector,
  DEFAULT_MAX_RESOURCE_ENTRIES,
  DEFAULT_MAX_RECURSION_DEPTH,
  DEFAULT_MAX_RSRC_SIZE,
  DEFAULT_MAX_GROUP_ICON_FRAMES,
  RT_VERSION,
  RT_ICON,
  RT_GROUP_ICON,
  extractPeIcon,
  extractPeIconAsync,
} from '../dist/index.js';
// @ts-ignore
import { SyntheticPEBuilder } from './fixtures/synthetic-pe-builder.ts';
// @ts-ignore
import { MockFileSystemProvider } from './fixtures/mock-fs-provider.ts';

function createMockPngBuffer(width = 256, height = 256): Buffer {
  const buf = Buffer.alloc(64);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8);
  buf.write('IHDR', 12, 'utf8');
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  buf.writeUInt8(8, 24);
  buf.writeUInt8(6, 25);
  return buf;
}

function createMockDibBuffer(width = 32, height = 32, bitCount = 32, biSize = 40): Buffer {
  const pixelBytes = Math.max(16, width * height * Math.ceil(bitCount / 8));
  const buf = Buffer.alloc(biSize + pixelBytes);
  buf.writeUInt32LE(biSize, 0);
  buf.writeInt32LE(width, 4);
  buf.writeInt32LE(height * 2, 8);
  buf.writeUInt16LE(1, 12);
  buf.writeUInt16LE(bitCount, 14);
  return buf;
}

describe('PeResourceDecoder & Resource Tree Traversal (@yumeshelf/engine)', () => {
  it('1. performs two-stage bounded header reading when section headers exceed 4096 bytes', async () => {
    // Construct PE with enough sections so totalHeaderNeeded > 4096
    // Each section header is 40 bytes. 95 sections = 3800 bytes + PE/COFF/Opt headers (~300 bytes) > 4096 bytes.
    const builder = new SyntheticPEBuilder({ arch: 'x64' });
    for (let i = 0; i < 95; i++) {
      builder.addSection(`.sec${i}`, 0x1000, Buffer.alloc(0x200));
    }
    // Set version info so .rsrc is added after all dummy sections
    builder.setVersionInfo({ ProductName: 'HeaderExpansionGame', FileVersion: '1.0.0.0' });
    const peBuf = builder.build();

    assert.ok(peBuf.length > 5000);
    const peInfo = PEInspector.parseHeaders(peBuf);
    assert.ok(peInfo.sections.length >= 95);

    const mockFs = new MockFileSystemProvider();
    mockFs.writeFile('C:/Games/LargeHeaderGame.exe', peBuf);

    const decoder = await PeResourceDecoder.fromFile('C:/Games/LargeHeaderGame.exe', mockFs);
    assert.ok(decoder !== null);
    assert.ok(decoder.resourceSection !== undefined);
    assert.ok(decoder.resourceSection.buffer.length > 0);

    // Verify getResourceDataEntry works on expanded headers
    const entry = decoder.getResourceDataEntry(RT_VERSION);
    assert.ok(entry !== null);
    assert.ok(entry.size > 0);
    assert.ok(entry.offset >= 0);
  });

  it('2. discovers resource section via DataDirectory entry 2 RVA fallback when section is renamed (e.g. UPX1)', () => {
    // Generate valid PE with version info (.rsrc)
    const builder = new SyntheticPEBuilder({ arch: 'x64' });
    builder.setVersionInfo({ ProductName: 'PackedGame', CompanyName: 'Studio' });
    const standardPe = builder.build();

    // Rename .rsrc section in the binary to UPX1
    const peInfo = PEInspector.parseHeaders(standardPe);
    const rsrcSec = peInfo.sections.find((s) => s.name === '.rsrc');
    assert.ok(rsrcSec !== undefined);

    // Locate section name in section table
    const modifiedPe = Buffer.from(standardPe);
    const rsrcNameOffset =
      peInfo.ntHeaderOffset +
      24 +
      peInfo.coffHeader.sizeOfOptionalHeader +
      peInfo.sections.indexOf(rsrcSec) * 40;

    // Overwrite name with 'UPX1\0\0\0\0'
    modifiedPe.write('UPX1\0\0\0\0', rsrcNameOffset, 8, 'ascii');

    // Confirm that parseHeaders now sees UPX1 instead of .rsrc
    const parsedModified = PEInspector.parseHeaders(modifiedPe);
    assert.strictEqual(parsedModified.sections.find((s) => s.name === '.rsrc'), undefined);
    assert.ok(parsedModified.sections.find((s) => s.name === 'UPX1') !== undefined);

    // fromBuffer fallback test
    const decoderFromBuf = PeResourceDecoder.fromBuffer(modifiedPe);
    assert.ok(decoderFromBuf !== null);
    assert.ok(decoderFromBuf.resourceSection !== undefined);
    assert.strictEqual(decoderFromBuf.resourceSection.virtualAddress, rsrcSec.virtualAddress);

    // getResourceDataEntry through RVA fallback
    const entry = decoderFromBuf.getResourceDataEntry(RT_VERSION);
    assert.ok(entry !== null);
    assert.ok(entry.size > 0);
  });

  it('3. enforces iteration limit on crafted cyclic or oversized resource directory tables', () => {
    // Craft a cyclic resource directory buffer:
    // Root dir has 1 entry pointing to Subdir 1, which points back to Root dir (offset 0)
    const cyclicBuf = Buffer.alloc(128);
    // Root Directory at offset 0
    cyclicBuf.writeUInt16LE(0, 12); // NumberOfNamedEntries
    cyclicBuf.writeUInt16LE(1, 14); // NumberOfIdEntries = 1
    // Entry 0: ID = 16 (RT_VERSION), Subdir at offset 24 (0x18)
    cyclicBuf.writeUInt32LE(16, 16);
    cyclicBuf.writeUInt32LE(0x80000018, 20);

    // Subdir 1 at offset 24 (0x18)
    cyclicBuf.writeUInt16LE(0, 24 + 12);
    cyclicBuf.writeUInt16LE(1, 24 + 14);
    // Entry 0: ID = 1, Subdir pointing back to Root (offset 0) with high bit set: 0x80000000
    cyclicBuf.writeUInt32LE(1, 24 + 16);
    cyclicBuf.writeUInt32LE(0x80000000, 24 + 20);

    const decoder = new PeResourceDecoder(
      Buffer.alloc(64),
      {
        buffer: cyclicBuf,
        pointerToRawData: 0x1000,
        sizeOfRawData: cyclicBuf.length,
        virtualAddress: 0x2000,
      },
      { maxResourceEntries: 10 }
    );

    // Must return null without stack overflow or infinite loop
    const result = decoder.getResourceDataEntry(16);
    assert.strictEqual(result, null);
  });

  it('4. enforces recursion depth limit terminating at Language level without infinite recursion', () => {
    // Build a 5-level deep directory chain:
    // Root (0) -> Level 2 (24) -> Level 3 (48) -> Level 4 (72) -> Level 5 (96) -> Data Entry (120)
    const deepBuf = Buffer.alloc(256);
    for (let depth = 0; depth < 5; depth++) {
      const dirOffset = depth * 24;
      deepBuf.writeUInt16LE(0, dirOffset + 12);
      deepBuf.writeUInt16LE(1, dirOffset + 14);
      deepBuf.writeUInt32LE(1, dirOffset + 16);
      const nextSubdir = (depth + 1) * 24;
      deepBuf.writeUInt32LE((0x80000000 + nextSubdir) >>> 0, dirOffset + 20);
    }
    // Leaf Data entry at offset 120
    deepBuf.writeUInt32LE(0x2000 + 140, 120); // OffsetToData (RVA)
    deepBuf.writeUInt32LE(32, 124); // Size

    const decoder = new PeResourceDecoder(
      Buffer.alloc(64),
      {
        buffer: deepBuf,
        pointerToRawData: 0x1000,
        sizeOfRawData: deepBuf.length,
        virtualAddress: 0x2000,
      },
      { maxRecursionDepth: 3 } // Limit to 3 levels
    );

    // Deep entry beyond depth 3 must not be reached
    const result = decoder.getResourceDataEntry(1);
    assert.strictEqual(result, null);
  });

  it('5. enforces maxRsrcSize buffer allocation capping and non-negative bounds checking', async () => {
    const builder = new SyntheticPEBuilder({ arch: 'x64' });
    builder.setVersionInfo({ FileDescription: 'BoundsTest' });
    const peBuf = builder.build();

    const mockFs = new MockFileSystemProvider();
    mockFs.writeFile('C:/Games/BoundsTest.exe', peBuf);

    // Set maxRsrcSize to 64 bytes
    const decoder = await PeResourceDecoder.fromFile('C:/Games/BoundsTest.exe', {
      fs: mockFs,
      maxRsrcSize: 64,
    });

    assert.ok(decoder !== null);
    assert.ok(decoder.resourceSection !== undefined);
    assert.strictEqual(decoder.resourceSection.buffer.length, 64);

    // Test rejection on out-of-bounds / corrupt rawOffset
    const corruptPe = Buffer.from(peBuf);
    const peInfo = PEInspector.parseHeaders(corruptPe);
    const rsrcSec = peInfo.sections.find((s) => s.name === '.rsrc');
    assert.ok(rsrcSec !== undefined);

    // Overwrite rawOffset with invalid value (exceeding file size)
    const secOffset =
      peInfo.ntHeaderOffset +
      24 +
      peInfo.coffHeader.sizeOfOptionalHeader +
      peInfo.sections.indexOf(rsrcSec) * 40;
    corruptPe.writeUInt32LE(0x7fffffff, secOffset + 20); // rawOffset = 2GB

    mockFs.writeFile('C:/Games/CorruptSec.exe', corruptPe);
    const corruptDecoder = await PeResourceDecoder.fromFile('C:/Games/CorruptSec.exe', mockFs);
    assert.strictEqual(corruptDecoder, null);
  });

  it('6. validates getResourceDataEntry positive size and bounds relative to section buffer', () => {
    // Valid section with RVA 0x5000, buffer length 200
    const secBuf = Buffer.alloc(200);
    // Root dir
    secBuf.writeUInt16LE(0, 12);
    secBuf.writeUInt16LE(1, 14);
    secBuf.writeUInt32LE(3, 16); // Type: RT_ICON = 3
    secBuf.writeUInt32LE(0x80000018, 20); // Subdir at offset 24

    // L2 dir
    secBuf.writeUInt16LE(0, 24 + 12);
    secBuf.writeUInt16LE(1, 24 + 14);
    secBuf.writeUInt32LE(1, 24 + 16); // Name ID = 1
    secBuf.writeUInt32LE(48, 24 + 20); // Leaf Data Entry at offset 48 (no L3, direct to data)

    // Leaf Data Entry at offset 48:
    // OffsetToData RVA = 0x5000 + 80, Size = 50
    secBuf.writeUInt32LE(0x5000 + 80, 48);
    secBuf.writeUInt32LE(50, 52);

    const decoder = new PeResourceDecoder(Buffer.alloc(64), {
      buffer: secBuf,
      pointerToRawData: 0x1000,
      sizeOfRawData: 200,
      virtualAddress: 0x5000,
    });

    const entry = decoder.getResourceDataEntry(3, 1);
    assert.ok(entry !== null);
    assert.strictEqual(entry.offset, 80);
    assert.strictEqual(entry.size, 50);
    assert.strictEqual(entry.rva, 0x5000 + 80);

    // Test zero-sized entry rejection
    secBuf.writeUInt32LE(0, 52); // size = 0
    assert.strictEqual(decoder.getResourceDataEntry(3, 1), null);

    // Test out-of-bounds offset + size > buffer.length
    secBuf.writeUInt32LE(200, 52); // offset 80 + size 200 = 280 > 200
    assert.strictEqual(decoder.getResourceDataEntry(3, 1), null);

    // Test RVA lower than virtualAddress
    secBuf.writeUInt32LE(0x4000, 48); // RVA 0x4000 < virtualAddress 0x5000
    secBuf.writeUInt32LE(10, 52);
    assert.strictEqual(decoder.getResourceDataEntry(3, 1), null);
  });

  it('7. returns null immediately on signal.aborted without performing disk I/O', async (t: any) => {
    const mockFs = new MockFileSystemProvider();
    const statSpy = t.mock.method(mockFs, 'stat');
    const openSpy = t.mock.method(mockFs, 'open');

    const controller = new AbortController();
    controller.abort();

    const result = await PeResourceDecoder.fromFile('C:/Games/SomeGame.exe', {
      fs: mockFs,
      signal: controller.signal,
    });

    assert.strictEqual(result, null);
    assert.strictEqual(statSpy.mock.callCount(), 0);
    assert.strictEqual(openSpy.mock.callCount(), 0);

    // Test fromFileSync with pre-aborted signal
    const syncResult = PeResourceDecoder.fromFileSync('C:/Games/SomeGame.exe', {
      signal: controller.signal,
    });
    assert.strictEqual(syncResult, null);
  });

  it('8. extracts embedded PNG icon frame with passthrough and isPng: true', () => {
    const mockPng = createMockPngBuffer(256, 256);
    const builder = new SyntheticPEBuilder({ arch: 'x64' });
    builder.setIconFrames([{ width: 256, height: 256, isPng: true, data: mockPng }]);
    const peBuf = builder.build();

    const decoder = PeResourceDecoder.fromBuffer(peBuf);
    assert.ok(decoder !== null);

    const icon = decoder.extractIcon();
    assert.ok(icon !== null);
    assert.strictEqual(icon.isPng, true);
    assert.strictEqual(icon.mimeType, 'image/png');
    assert.strictEqual(icon.width, 256);
    assert.strictEqual(icon.height, 256);
    assert.deepStrictEqual(icon.buffer, mockPng);
  });

  it('9. extracts embedded DIB icon frame and synthesizes valid 22-byte ICO header', () => {
    const mockDib = createMockDibBuffer(32, 32, 32);
    const builder = new SyntheticPEBuilder({ arch: 'x64' });
    builder.setIconFrames([{ width: 32, height: 32, bitCount: 32, isPng: false, data: mockDib }]);
    const peBuf = builder.build();

    const decoder = PeResourceDecoder.fromBuffer(peBuf);
    assert.ok(decoder !== null);

    const icon = decoder.extractIcon();
    assert.ok(icon !== null);
    assert.strictEqual(icon.isPng, false);
    assert.strictEqual(icon.mimeType, 'image/x-icon');
    assert.strictEqual(icon.width, 32);
    assert.strictEqual(icon.height, 32);
    assert.strictEqual(icon.buffer.length, 22 + mockDib.length);

    // Verify 6-byte ICONDIR
    assert.strictEqual(icon.buffer.readUInt16LE(0), 0); // idReserved
    assert.strictEqual(icon.buffer.readUInt16LE(2), 1); // idType (1 = ICO)
    assert.strictEqual(icon.buffer.readUInt16LE(4), 1); // idCount (1 frame)

    // Verify 16-byte ICONDIRENTRY
    assert.strictEqual(icon.buffer.readUInt8(6), 32); // bWidth
    assert.strictEqual(icon.buffer.readUInt8(7), 32); // bHeight
    assert.strictEqual(icon.buffer.readUInt8(8), 0); // bColorCount
    assert.strictEqual(icon.buffer.readUInt8(9), 0); // bReserved
    assert.strictEqual(icon.buffer.readUInt16LE(10), 1); // wPlanes
    assert.strictEqual(icon.buffer.readUInt16LE(12), 32); // wBitCount
    assert.strictEqual(icon.buffer.readUInt32LE(14), mockDib.length); // dwBytesInRes
    assert.strictEqual(icon.buffer.readUInt32LE(18), 22); // dwImageOffset

    // Verify payload
    assert.deepStrictEqual(icon.buffer.subarray(22), mockDib);
  });

  it('10. enforces frame resolution scoring hierarchy (preferring 256px PNG > 256px DIB > 128px > 48px > 32px > 16px)', () => {
    const dib16 = createMockDibBuffer(16, 16, 32);
    const dib32 = createMockDibBuffer(32, 32, 32);
    const dib48 = createMockDibBuffer(48, 48, 32);
    const dib128 = createMockDibBuffer(128, 128, 32);
    const dib256 = createMockDibBuffer(256, 256, 32);
    const png256 = createMockPngBuffer(256, 256);

    const allFrames = [
      { id: 1, width: 16, height: 16, bitCount: 32, isPng: false, data: dib16 },
      { id: 2, width: 32, height: 32, bitCount: 32, isPng: false, data: dib32 },
      { id: 3, width: 48, height: 48, bitCount: 32, isPng: false, data: dib48 },
      { id: 4, width: 128, height: 128, bitCount: 32, isPng: false, data: dib128 },
      { id: 5, width: 256, height: 256, bitCount: 32, isPng: false, data: dib256 },
      { id: 6, width: 256, height: 256, bitCount: 32, isPng: true, data: png256 },
    ];

    // Case 1: All frames present -> selects 256px PNG
    const b1 = new SyntheticPEBuilder({ arch: 'x64' }).setIconFrames(allFrames);
    const icon1 = PeResourceDecoder.fromBuffer(b1.build())?.extractIcon();
    assert.ok(icon1);
    assert.strictEqual(icon1.isPng, true);
    assert.strictEqual(icon1.width, 256);

    // Case 2: Without 256px PNG -> selects 256px DIB
    const b2 = new SyntheticPEBuilder({ arch: 'x64' }).setIconFrames(allFrames.slice(0, 5));
    const icon2 = PeResourceDecoder.fromBuffer(b2.build())?.extractIcon();
    assert.ok(icon2);
    assert.strictEqual(icon2.isPng, false);
    assert.strictEqual(icon2.width, 256);

    // Case 3: Without 256px DIB -> selects 128px DIB
    const b3 = new SyntheticPEBuilder({ arch: 'x64' }).setIconFrames(allFrames.slice(0, 4));
    const icon3 = PeResourceDecoder.fromBuffer(b3.build())?.extractIcon();
    assert.ok(icon3);
    assert.strictEqual(icon3.width, 128);

    // Case 4: Without 128px DIB -> selects 48px DIB
    const b4 = new SyntheticPEBuilder({ arch: 'x64' }).setIconFrames(allFrames.slice(0, 3));
    const icon4 = PeResourceDecoder.fromBuffer(b4.build())?.extractIcon();
    assert.ok(icon4);
    assert.strictEqual(icon4.width, 48);

    // Case 5: Without 48px DIB -> selects 32px DIB
    const b5 = new SyntheticPEBuilder({ arch: 'x64' }).setIconFrames(allFrames.slice(0, 2));
    const icon5 = PeResourceDecoder.fromBuffer(b5.build())?.extractIcon();
    assert.ok(icon5);
    assert.strictEqual(icon5.width, 32);

    // Case 6: Without 32px DIB -> selects 16px DIB
    const b6 = new SyntheticPEBuilder({ arch: 'x64' }).setIconFrames(allFrames.slice(0, 1));
    const icon6 = PeResourceDecoder.fromBuffer(b6.build())?.extractIcon();
    assert.ok(icon6);
    assert.strictEqual(icon6.width, 16);

    // Case 7: Same resolution (32x32) but different bit counts (24bpp vs 8bpp)
    const dib32_24bpp = createMockDibBuffer(32, 32, 24);
    const dib32_8bpp = createMockDibBuffer(32, 32, 8);
    const b7 = new SyntheticPEBuilder({ arch: 'x64' }).setIconFrames([
      { id: 1, width: 32, height: 32, bitCount: 8, isPng: false, data: dib32_8bpp },
      { id: 2, width: 32, height: 32, bitCount: 24, isPng: false, data: dib32_24bpp },
    ]);
    const icon7 = PeResourceDecoder.fromBuffer(b7.build())?.extractIcon();
    assert.ok(icon7);
    assert.strictEqual(icon7.buffer.readUInt16LE(12), 24);
  });

  it('11. enforces GRPICONDIR frame count cap (<= 64 frames) and header validation', () => {
    // Subtest A: Capping at 64 frames
    // 70 frames: first 64 are 16x16 DIB, frames 65..70 are 256x256 PNG
    const frames70: any[] = [];
    for (let i = 1; i <= 64; i++) {
      frames70.push({ id: i, width: 16, height: 16, bitCount: 32, isPng: false, data: createMockDibBuffer(16, 16, 32) });
    }
    for (let i = 65; i <= 70; i++) {
      frames70.push({ id: i, width: 256, height: 256, bitCount: 32, isPng: true, data: createMockPngBuffer(256, 256) });
    }

    const b1 = new SyntheticPEBuilder({ arch: 'x64' }).setIconFrames(frames70, { idCount: 70 });
    const icon1 = PeResourceDecoder.fromBuffer(b1.build())?.extractIcon();
    assert.ok(icon1);
    // Because frames beyond 64 are capped and ignored, 16px DIB is chosen
    assert.strictEqual(icon1.width, 16);
    assert.strictEqual(icon1.isPng, false);

    // Subtest B: Custom maxIconFrames in options (maxIconFrames: 2)
    const frames3 = [
      { id: 1, width: 16, height: 16, bitCount: 32, isPng: false, data: createMockDibBuffer(16, 16, 32) },
      { id: 2, width: 16, height: 16, bitCount: 32, isPng: false, data: createMockDibBuffer(16, 16, 32) },
      { id: 3, width: 256, height: 256, bitCount: 32, isPng: true, data: createMockPngBuffer(256, 256) },
    ];
    const b2 = new SyntheticPEBuilder({ arch: 'x64' }).setIconFrames(frames3);
    const decoderCustom = PeResourceDecoder.fromBuffer(b2.build(), { maxIconFrames: 2 });
    assert.ok(decoderCustom !== null);
    const iconCustom = decoderCustom.extractIcon();
    assert.ok(iconCustom !== null);
    assert.strictEqual(iconCustom.width, 16); // frame 3 ignored

    // Subtest C: Invalid idType (idType = 2 cursor) -> returns null
    const b3 = new SyntheticPEBuilder({ arch: 'x64' }).setIconFrames(
      [{ width: 32, height: 32, bitCount: 32, data: createMockDibBuffer(32, 32, 32) }],
      { idType: 2 }
    );
    const icon3 = PeResourceDecoder.fromBuffer(b3.build())?.extractIcon();
    assert.strictEqual(icon3, null);

    // Subtest D: idCount = 0 -> returns null
    const b4 = new SyntheticPEBuilder({ arch: 'x64' }).setIconFrames(
      [{ width: 32, height: 32, bitCount: 32, data: createMockDibBuffer(32, 32, 32) }],
      { idCount: 0 }
    );
    const icon4 = PeResourceDecoder.fromBuffer(b4.build())?.extractIcon();
    assert.strictEqual(icon4, null);

    // Subtest E: Truncated groupData (< 6 bytes) -> returns null
    const b5 = new SyntheticPEBuilder({ arch: 'x64' }).setIconFrames(
      [{ width: 32, height: 32, bitCount: 32, data: createMockDibBuffer(32, 32, 32) }],
      { truncateHeaderBytes: 4 }
    );
    const icon5 = PeResourceDecoder.fromBuffer(b5.build())?.extractIcon();
    assert.strictEqual(icon5, null);
  });

  it('12. enforces DIB frame length validation (rawFrameBuffer.length >= 40 && biSize >= 40 && rawFrameBuffer.length >= biSize)', () => {
    // Subtest A: rawFrameBuffer.length < 40 (truncated buffer)
    const truncatedDib = Buffer.alloc(20);
    const b1 = new SyntheticPEBuilder({ arch: 'x64' }).setIconFrames([
      { width: 32, height: 32, bitCount: 32, data: truncatedDib },
    ]);
    const icon1 = PeResourceDecoder.fromBuffer(b1.build())?.extractIcon();
    assert.strictEqual(icon1, null);

    // Subtest B: biSize < 40 (invalid header size)
    const invalidBiSizeDib = Buffer.alloc(60);
    invalidBiSizeDib.writeUInt32LE(36, 0); // biSize = 36 (< 40)
    const b2 = new SyntheticPEBuilder({ arch: 'x64' }).setIconFrames([
      { width: 32, height: 32, bitCount: 32, data: invalidBiSizeDib },
    ]);
    const icon2 = PeResourceDecoder.fromBuffer(b2.build())?.extractIcon();
    assert.strictEqual(icon2, null);

    // Subtest C: rawFrameBuffer.length < biSize (buffer smaller than claimed header size)
    const oversizedBiSizeDib = Buffer.alloc(50);
    oversizedBiSizeDib.writeUInt32LE(100, 0); // biSize = 100 (> 50)
    const b3 = new SyntheticPEBuilder({ arch: 'x64' }).setIconFrames([
      { width: 32, height: 32, bitCount: 32, data: oversizedBiSizeDib },
    ]);
    const icon3 = PeResourceDecoder.fromBuffer(b3.build())?.extractIcon();
    assert.strictEqual(icon3, null);

    // Subtest D: Valid DIB frame passes validation
    const validDib = createMockDibBuffer(32, 32, 32);
    const b4 = new SyntheticPEBuilder({ arch: 'x64' }).setIconFrames([
      { width: 32, height: 32, bitCount: 32, data: validDib },
    ]);
    const icon4 = PeResourceDecoder.fromBuffer(b4.build())?.extractIcon();
    assert.ok(icon4);
    assert.strictEqual(icon4.width, 32);
  });

  it('13. provides synchronous extractPeIcon and asynchronous extractPeIconAsync entrypoints', async () => {
    const mockPng = createMockPngBuffer(256, 256);
    const builder = new SyntheticPEBuilder({ arch: 'x64' });
    builder.setIconFrames([{ width: 256, height: 256, isPng: true, data: mockPng }]);
    const peBuf = builder.build();

    // 1. extractPeIcon with Buffer
    const fromBufIcon = extractPeIcon(peBuf);
    assert.ok(fromBufIcon !== null);
    assert.strictEqual(fromBufIcon.isPng, true);
    assert.strictEqual(fromBufIcon.width, 256);

    // 2. extractPeIcon with invalid Buffer / non-PE
    assert.strictEqual(extractPeIcon(Buffer.alloc(0)), null);
    assert.strictEqual(extractPeIcon(Buffer.from('not a pe')), null);

    // 3. extractPeIcon with file path string (synchronous)
    const tempDir = fsSync.mkdtempSync(path.join(os.tmpdir(), 'yumeshelf_pe_icon_test_'));
    const tempFile = path.join(tempDir, 'TestGame.exe');
    try {
      fsSync.writeFileSync(tempFile, peBuf);

      const fromFileIcon = extractPeIcon(tempFile);
      assert.ok(fromFileIcon !== null);
      assert.strictEqual(fromFileIcon.width, 256);

      // Nonexistent file
      assert.strictEqual(extractPeIcon(path.join(tempDir, 'Nonexistent.exe')), null);
    } finally {
      try {
        fsSync.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    }

    // 4. extractPeIconAsync with MockFileSystemProvider
    const mockFs = new MockFileSystemProvider();
    mockFs.writeFile('C:/Games/AsyncGame.exe', peBuf);

    const asyncIcon = await extractPeIconAsync('C:/Games/AsyncGame.exe', { fs: mockFs });
    assert.ok(asyncIcon !== null);
    assert.strictEqual(asyncIcon.isPng, true);
    assert.strictEqual(asyncIcon.width, 256);

    // 5. extractPeIconAsync with aborted signal
    const controller = new AbortController();
    controller.abort();
    const abortedIcon = await extractPeIconAsync('C:/Games/AsyncGame.exe', {
      fs: mockFs,
      signal: controller.signal,
    });
    assert.strictEqual(abortedIcon, null);

    // 6. extractPeIconAsync on nonexistent file
    const missingIcon = await extractPeIconAsync('C:/Games/Missing.exe', { fs: mockFs });
    assert.strictEqual(missingIcon, null);
  });
});
