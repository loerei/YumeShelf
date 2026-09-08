/// <reference types="node" />
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PeResourceDecoder,
  PEInspector,
  DEFAULT_MAX_RESOURCE_ENTRIES,
  DEFAULT_MAX_RECURSION_DEPTH,
  DEFAULT_MAX_RSRC_SIZE,
  RT_VERSION,
} from '../dist/index.js';
// @ts-ignore
import { SyntheticPEBuilder } from './fixtures/synthetic-pe-builder.ts';
// @ts-ignore
import { MockFileSystemProvider } from './fixtures/mock-fs-provider.ts';

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
});
