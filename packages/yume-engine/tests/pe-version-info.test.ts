/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore
import { PEInspector, parseVsVersionInfo } from '../dist/index.js';
// @ts-ignore
import { SyntheticPEBuilder } from './fixtures/synthetic-pe-builder.ts';

test('PE Version Info Parser: Extracts standard version strings from 64-bit binary', () => {
  const versionData = {
    OriginalFilename: 'GameAssembly.dll',
    ProductName: 'My Unity Game',
    InternalName: 'UnityGame',
    FileDescription: 'Unity Player Executable',
    FileVersion: '2021.3.16.1234',
    ProductVersion: '2021.3.16f1',
    CompanyName: 'Unity Technologies',
    LegalCopyright: 'Copyright (C) 2026 Unity Technologies',
    Comments: 'Built with Unity Mono/IL2CPP',
  };

  const pe64 = new SyntheticPEBuilder({ arch: 'x64' })
    .setVersionInfo(versionData)
    .build();

  const inspector = PEInspector.fromBuffer(pe64);
  assert.strictEqual(inspector.isValid, true);
  assert.strictEqual(inspector.is64Bit, true);

  assert.ok(inspector.versionInfo);
  assert.strictEqual(inspector.versionInfo?.originalFilename, 'GameAssembly.dll');
  assert.strictEqual(inspector.versionInfo?.productName, 'My Unity Game');
  assert.strictEqual(inspector.versionInfo?.internalName, 'UnityGame');
  assert.strictEqual(inspector.versionInfo?.fileDescription, 'Unity Player Executable');
  assert.strictEqual(inspector.versionInfo?.fileVersion, '2021.3.16.1234');
  assert.strictEqual(inspector.versionInfo?.productVersion, '2021.3.16f1');
  assert.strictEqual(inspector.versionInfo?.companyName, 'Unity Technologies');
  assert.strictEqual(inspector.versionInfo?.legalCopyright, 'Copyright (C) 2026 Unity Technologies');
  assert.strictEqual(inspector.versionInfo?.comments, 'Built with Unity Mono/IL2CPP');

  assert.strictEqual(inspector.versionInfo?.rawValues['OriginalFilename'], 'GameAssembly.dll');
  assert.strictEqual(inspector.versionInfo?.rawValues['ProductName'], 'My Unity Game');
});

test('PE Version Info Parser: Extracts standard version strings from 32-bit binary', () => {
  const versionData = {
    OriginalFilename: 'Game.exe',
    ProductName: 'RPG Maker VX Ace Game',
    InternalName: 'RPGMakerGame',
    FileDescription: 'RGSS3 Player',
    FileVersion: '1.0.0.0',
  };

  const pe32 = new SyntheticPEBuilder({ arch: 'x86' })
    .setVersionInfo(versionData)
    .build();

  const inspector = PEInspector.fromBuffer(pe32);
  assert.strictEqual(inspector.isValid, true);
  assert.strictEqual(inspector.is64Bit, false);

  assert.ok(inspector.versionInfo);
  assert.strictEqual(inspector.versionInfo?.originalFilename, 'Game.exe');
  assert.strictEqual(inspector.versionInfo?.productName, 'RPG Maker VX Ace Game');
  assert.strictEqual(inspector.versionInfo?.internalName, 'RPGMakerGame');
  assert.strictEqual(inspector.versionInfo?.fileDescription, 'RGSS3 Player');
  assert.strictEqual(inspector.versionInfo?.fileVersion, '1.0.0.0');
});

test('PE Version Info Parser: Handles binary with no Resource Table or no RT_VERSION gracefully', () => {
  // Binary without any resources
  const peNoRsrc = new SyntheticPEBuilder({ arch: 'x64' }).build();
  const inspectorNoRsrc = PEInspector.fromBuffer(peNoRsrc);
  assert.strictEqual(inspectorNoRsrc.isValid, true);
  assert.strictEqual(inspectorNoRsrc.versionInfo, null);

  // Binary with empty buffer
  const emptyInspector = PEInspector.fromBuffer(Buffer.alloc(0));
  assert.strictEqual(emptyInspector.isValid, false);
  assert.strictEqual(emptyInspector.versionInfo, null);
});

test('PE Version Info Parser: Handles corrupted / malformed resource directories safely', () => {
  // 1. Invalid Resource Table RVA pointing outside mapped sections
  const peInvalidRva = new SyntheticPEBuilder({ arch: 'x64' })
    .setVersionInfo({ ProductName: 'Test' })
    .build();

  const peOff = peInvalidRva.readUInt32LE(0x3c);
  const dataDirOff = peOff + 24 + 112;
  peInvalidRva.writeUInt32LE(0x99999999, dataDirOff + 2 * 8); // Resource Table RVA

  const invalidRvaInspector = PEInspector.fromBuffer(peInvalidRva);
  assert.strictEqual(invalidRvaInspector.isValid, true);
  assert.strictEqual(invalidRvaInspector.versionInfo, null);

  // 2. Corrupt resource tree (Type ID is not 16)
  const peWrongType = new SyntheticPEBuilder({ arch: 'x64' })
    .setVersionInfo({ ProductName: 'Test' })
    .build();

  const validInsp = PEInspector.fromBuffer(peWrongType);
  const rsrcRva = validInsp.getDataDirectory(2)!.virtualAddress;
  const rsrcOff = validInsp.rvaToOffset(rsrcRva)!;

  // Root entry ID is at rsrcOff + 16 (change 16 to 999)
  peWrongType.writeUInt32LE(999, rsrcOff + 16);
  const wrongTypeInsp = PEInspector.fromBuffer(peWrongType);
  assert.strictEqual(wrongTypeInsp.isValid, true);
  assert.strictEqual(wrongTypeInsp.versionInfo, null);

  // 3. Truncated / malformed VS_VERSIONINFO raw bytes
  const badVsBuf = Buffer.alloc(30); // Less than 40 bytes
  assert.strictEqual(parseVsVersionInfo(badVsBuf), null);

  const badHeaderBuf = Buffer.alloc(100);
  badHeaderBuf.writeUInt16LE(100, 0); // wLength
  badHeaderBuf.writeUInt16LE(0, 2);
  badHeaderBuf.writeUInt16LE(0, 4);
  badHeaderBuf.write('INVALID_HEADER\0', 6, 'utf16le');
  assert.strictEqual(parseVsVersionInfo(badHeaderBuf), null);

  // Zero step / circular guard in StringFileInfo: wLength < 6
  const loopBuf = Buffer.alloc(120);
  loopBuf.writeUInt16LE(120, 0); // wLength
  loopBuf.writeUInt16LE(0, 2);
  loopBuf.writeUInt16LE(0, 4);
  Buffer.from('VS_VERSION_INFO\0', 'utf16le').copy(loopBuf, 6);
  const sfiOff = 40; // DWORD aligned
  loopBuf.writeUInt16LE(2, sfiOff); // corrupt length < 6
  const parsedLoop = parseVsVersionInfo(loopBuf);
  assert.ok(parsedLoop);
  assert.deepStrictEqual(parsedLoop?.rawValues, {});
});

test('PE Version Info Parser: Recursion depth ceiling limit (<= 3 levels) guards against circular resource loops', () => {
  const peLoop = new SyntheticPEBuilder({ arch: 'x64' })
    .setVersionInfo({ ProductName: 'Test' })
    .build();

  const insp = PEInspector.fromBuffer(peLoop);
  const rsrcRva = insp.getDataDirectory(2)!.virtualAddress;
  const rsrcOff = insp.rvaToOffset(rsrcRva)!;

  // Create a cyclic pointer: Entry 0 in Root points back to Root directory itself
  peLoop.writeUInt32LE(0x80000000, rsrcOff + 20); // Subdirectory at offset 0 (itself)

  const cyclicInspector = PEInspector.fromBuffer(peLoop);
  assert.strictEqual(cyclicInspector.isValid, true);
  // Traversal halts without infinite recursion or stack overflow
  assert.strictEqual(cyclicInspector.versionInfo, null);
});
