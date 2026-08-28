import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PEInspector,
  ImageFileMachine,
  ImageOptionalMagic,
  ImageDataDirectoryIndex,
  safeReadUInt8,
  safeReadUInt16LE,
  safeReadUInt32LE,
  safeReadBigUInt64LE,
  safeReadBytes,
  safeReadAsciiString,
  safeReadUtf16LEString,
} from '../dist/index.js';
import { SyntheticPEBuilder } from './fixtures/synthetic-pe-builder.ts';
import { MockFileSystemProvider } from './fixtures/mock-fs-provider.ts';

test('PE Binary Reader: Safe bounds checking on edge and corrupted buffers', () => {
  const buf = Buffer.from([0x01, 0x02, 0x03, 0x04]);

  assert.strictEqual(safeReadUInt8(buf, 0), 0x01);
  assert.strictEqual(safeReadUInt8(buf, 3), 0x04);
  assert.strictEqual(safeReadUInt8(buf, 4), null);
  assert.strictEqual(safeReadUInt8(buf, -1), null);

  assert.strictEqual(safeReadUInt16LE(buf, 0), 0x0201);
  assert.strictEqual(safeReadUInt16LE(buf, 2), 0x0403);
  assert.strictEqual(safeReadUInt16LE(buf, 3), null);
  assert.strictEqual(safeReadUInt16LE(buf, 10), null);

  assert.strictEqual(safeReadUInt32LE(buf, 0), 0x04030201);
  assert.strictEqual(safeReadUInt32LE(buf, 1), null);

  assert.strictEqual(safeReadBigUInt64LE(buf, 0), null);
  assert.strictEqual(safeReadBytes(buf, 0, 2)?.length, 2);
  assert.strictEqual(safeReadBytes(buf, 2, 5), null);
  assert.strictEqual(safeReadBytes(buf, -1, 2), null);

  const strBuf = Buffer.from('HelloWorld\0Trailing', 'ascii');
  assert.strictEqual(safeReadAsciiString(strBuf, 0), 'HelloWorld');
  assert.strictEqual(safeReadAsciiString(strBuf, 50), null);

  const utf16Buf = Buffer.from('Test\0More', 'utf16le');
  assert.strictEqual(safeReadUtf16LEString(utf16Buf, 0, 4), 'Test');
  assert.strictEqual(safeReadUtf16LEString(utf16Buf, 20, 4), null);
});

test('PEInspector: Validates DOS Header, PE Signature, and Architecture (x86 & x64)', () => {
  // 1. Valid x64 PE
  const pe64 = new SyntheticPEBuilder({ arch: 'x64' })
    .addImport('GameAssembly.dll', ['il2cpp_init'])
    .build();

  const inspector64 = PEInspector.fromBuffer(pe64);
  assert.strictEqual(inspector64.isValid, true);
  assert.strictEqual(inspector64.is64Bit, true);
  assert.strictEqual(inspector64.coffHeader.machine, ImageFileMachine.AMD64);
  assert.strictEqual(inspector64.optionalHeader.magic, ImageOptionalMagic.PE32_PLUS);
  assert.ok(inspector64.sections.length >= 1);

  // 2. Valid x86 PE
  const pe32 = new SyntheticPEBuilder({ arch: 'x86' })
    .addImport('RGSS301.dll', ['RGSSPlayerInit'])
    .build();

  const inspector32 = PEInspector.fromBuffer(pe32);
  assert.strictEqual(inspector32.isValid, true);
  assert.strictEqual(inspector32.is64Bit, false);
  assert.strictEqual(inspector32.coffHeader.machine, ImageFileMachine.I386);
  assert.strictEqual(inspector32.optionalHeader.magic, ImageOptionalMagic.PE32);
});

test('PEInspector: Corrupt and Truncated Binary Rejection without RangeError', () => {
  // Empty buffer
  const empty = PEInspector.fromBuffer(Buffer.alloc(0));
  assert.strictEqual(empty.isValid, false);

  // Short buffer (< 64 bytes)
  const shortBuf = PEInspector.fromBuffer(Buffer.alloc(32));
  assert.strictEqual(shortBuf.isValid, false);

  // Invalid DOS Magic (e.g. PK zip header)
  const zipBuf = Buffer.alloc(128);
  zipBuf.write('PK\x03\x04', 0, 'ascii');
  assert.strictEqual(PEInspector.fromBuffer(zipBuf).isValid, false);

  // Valid MZ but invalid e_lfanew pointer
  const corruptLfanew = Buffer.alloc(128);
  corruptLfanew.write('MZ', 0, 'ascii');
  corruptLfanew.writeUInt32LE(0x10, 0x3C); // e_lfanew < 64
  assert.strictEqual(PEInspector.fromBuffer(corruptLfanew).isValid, false);

  // e_lfanew points out of buffer bounds
  corruptLfanew.writeUInt32LE(0x1000, 0x3C);
  assert.strictEqual(PEInspector.fromBuffer(corruptLfanew).isValid, false);

  // e_lfanew points to invalid NT Signature
  const invalidSig = Buffer.alloc(256);
  invalidSig.write('MZ', 0, 'ascii');
  invalidSig.writeUInt32LE(0x80, 0x3C);
  invalidSig.write('NOTP', 0x80, 'ascii');
  assert.strictEqual(PEInspector.fromBuffer(invalidSig).isValid, false);

  // Excessively large sections count > 96
  const excessSections = new SyntheticPEBuilder({ arch: 'x64' }).build();
  const peOff = excessSections.readUInt32LE(0x3C);
  excessSections.writeUInt16LE(999, peOff + 4 + 2); // numberOfSections = 999
  assert.strictEqual(PEInspector.fromBuffer(excessSections).isValid, false);
});

test('PEInspector: Section Table mapping and safe rvaToOffset bounds verification', () => {
  const codeSection = Buffer.alloc(0x400, 0x90);
  const dataSection = Buffer.alloc(0x600, 0xcc);

  const pe = new SyntheticPEBuilder({ arch: 'x64' })
    .addSection('.text\0\0\0', 0x1000, codeSection)
    .addSection('.data\0\0\0', 0x1000, dataSection)
    .build();

  const inspector = PEInspector.fromBuffer(pe);
  assert.strictEqual(inspector.isValid, true);
  assert.strictEqual(inspector.sections.length, 2);

  const textSec = inspector.sections[0];
  assert.strictEqual(textSec.name.startsWith('.text'), true);
  assert.strictEqual(textSec.rawSize, 0x400);

  // Valid RVA at start of .text
  const startOffset = inspector.rvaToOffset(textSec.virtualAddress);
  assert.strictEqual(startOffset, textSec.rawOffset);

  // Valid RVA inside .text
  const midOffset = inspector.rvaToOffset(textSec.virtualAddress + 0x100);
  assert.strictEqual(midOffset, textSec.rawOffset + 0x100);

  // RVA at boundary edge (rawSize) -> out of bounds -> null
  const edgeOffset = inspector.rvaToOffset(textSec.virtualAddress + textSec.rawSize);
  assert.strictEqual(edgeOffset, null);

  // RVA in unmapped memory beyond raw data but within virtualSize
  const virtualGapOffset = inspector.rvaToOffset(textSec.virtualAddress + 0x500);
  assert.strictEqual(virtualGapOffset, null);

  // Negative RVA
  assert.strictEqual(inspector.rvaToOffset(-1), null);

  // RVA below any section virtualAddress
  assert.strictEqual(inspector.rvaToOffset(0x10), null);

  // Data directory lookup
  const importDir = inspector.getDataDirectory(ImageDataDirectoryIndex.IMPORT);
  assert.ok(importDir !== null);
});

test('PEInspector.fromPath: Asynchronous 2-stage streaming with MockFileSystemProvider', async () => {
  const fs = new MockFileSystemProvider();

  // Create synthetic PE buffer representing a large 10MB executable
  const peBuffer = new SyntheticPEBuilder({ arch: 'x64' })
    .addImport('UnityPlayer.dll', ['UnityMain'])
    .setVersionInfo({
      ProductName: 'Large Unity Game',
      OriginalFilename: 'Game.exe',
    })
    .build();

  const mockExePath = 'C:/Games/UnityGame/Game.exe';
  fs.writeFile(mockExePath, peBuffer);

  let closeCalled = false;
  const originalOpen = fs.open.bind(fs);
  fs.open = async (path: string) => {
    const handle = await originalOpen(path);
    const originalClose = handle.close.bind(handle);
    handle.close = async () => {
      closeCalled = true;
      return originalClose();
    };
    return handle;
  };

  const inspector = await PEInspector.fromPath(mockExePath, fs);
  assert.strictEqual(inspector.isValid, true);
  assert.strictEqual(inspector.is64Bit, true);
  assert.strictEqual(inspector.coffHeader.machine, ImageFileMachine.AMD64);
  assert.strictEqual(closeCalled, true, 'File handle must be deterministically closed in try...finally');
});

test('Performance Benchmark: Parses 100 synthetic PE binaries in < 50ms', () => {
  const pe = new SyntheticPEBuilder({ arch: 'x64' })
    .addImport('UnityPlayer.dll', ['UnityMain'])
    .build();

  const start = performance.now();
  for (let i = 0; i < 100; i++) {
    const inspector = PEInspector.fromBuffer(pe);
    assert.strictEqual(inspector.isValid, true);
  }
  const duration = performance.now() - start;
  assert.ok(duration < 50, `Parsing 100 PEs took ${duration.toFixed(2)}ms, expected < 50ms`);
});
