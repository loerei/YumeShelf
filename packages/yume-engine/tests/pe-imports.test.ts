/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore
import { PEInspector, normalizeDllName } from '../dist/index.js';
// @ts-ignore
import { SyntheticPEBuilder } from './fixtures/synthetic-pe-builder.ts';

test('DLL Name Normalization: Handles case, whitespace, and .dll extension', () => {
  assert.strictEqual(normalizeDllName('GameAssembly.dll'), 'gameassembly');
  assert.strictEqual(normalizeDllName('UNITYPLAYER.DLL'), 'unityplayer');
  assert.strictEqual(normalizeDllName('  mono-2.0-bdwgc.dll  '), 'mono-2.0-bdwgc');
  assert.strictEqual(normalizeDllName('RGSS301'), 'rgss301');
  assert.strictEqual(normalizeDllName(''), '');
});

test('PE Import Parser: 64-bit (PE32+) Import Directory and 64-bit Thunks', () => {
  const pe64 = new SyntheticPEBuilder({ arch: 'x64' })
    .addImport('GameAssembly.dll', ['il2cpp_init', 'il2cpp_domain_get'])
    .addImport('UnityPlayer.dll', ['UnityMain'])
    .build();

  const inspector = PEInspector.fromBuffer(pe64);
  assert.strictEqual(inspector.isValid, true);
  assert.strictEqual(inspector.is64Bit, true);

  // Test hasImport O(1) queries with various formats
  assert.strictEqual(inspector.hasImport('GameAssembly.dll'), true);
  assert.strictEqual(inspector.hasImport('gameassembly'), true);
  assert.strictEqual(inspector.hasImport('GAMEASSEMBLY.DLL'), true);
  assert.strictEqual(inspector.hasImport('  UnityPlayer.dll  '), true);
  assert.strictEqual(inspector.hasImport('unityplayer'), true);
  assert.strictEqual(inspector.hasImport('nonexistent.dll'), false);
  assert.strictEqual(inspector.hasImport(''), false);

  // Test getImport
  const gameAssembly = inspector.getImport('gameassembly');
  assert.ok(gameAssembly);
  assert.strictEqual(gameAssembly?.name, 'GameAssembly.dll');
  assert.strictEqual(gameAssembly?.normalizedName, 'gameassembly');
  assert.deepStrictEqual(gameAssembly?.functions, ['il2cpp_init', 'il2cpp_domain_get']);

  const unityPlayer = inspector.getImport('UnityPlayer.dll');
  assert.ok(unityPlayer);
  assert.deepStrictEqual(unityPlayer?.functions, ['UnityMain']);

  // Test getImports
  const allImports = inspector.getImports();
  assert.strictEqual(allImports.length, 2);
});

test('PE Import Parser: 32-bit (PE32) Import Directory and 32-bit Thunks', () => {
  const pe32 = new SyntheticPEBuilder({ arch: 'x86' })
    .addImport('RGSS301.dll', ['RGSSPlayerInit'])
    .addImport('kernel32.dll', ['ExitProcess', 'GetProcAddress'])
    .build();

  const inspector = PEInspector.fromBuffer(pe32);
  assert.strictEqual(inspector.isValid, true);
  assert.strictEqual(inspector.is64Bit, false);

  assert.strictEqual(inspector.hasImport('rgss301.dll'), true);
  assert.strictEqual(inspector.hasImport('RGSS301'), true);
  assert.strictEqual(inspector.hasImport('kernel32.dll'), true);
  assert.strictEqual(inspector.hasImport('kernel32'), true);

  const rgss = inspector.getImport('rgss301');
  assert.ok(rgss);
  assert.deepStrictEqual(rgss?.functions, ['RGSSPlayerInit']);
});

test('PE Import Parser: Borland / Delphi FirstThunk fallback when OriginalFirstThunk is 0', () => {
  const peBorland = new SyntheticPEBuilder({ arch: 'x86' })
    .addImport('wmovie.dll', ['MoviePlay'], { borlandMode: true })
    .addImport('GuruguruSMF4.dll', ['PlaySound'], { borlandMode: true })
    .build();

  const inspector = PEInspector.fromBuffer(peBorland);
  assert.strictEqual(inspector.isValid, true);

  // In Borland executables, OriginalFirstThunk is 0 so the parser must resolve FirstThunk
  assert.strictEqual(inspector.hasImport('wmovie.dll'), true);
  assert.strictEqual(inspector.hasImport('wmovie'), true);
  assert.strictEqual(inspector.hasImport('GuruguruSMF4.dll'), true);
  assert.strictEqual(inspector.hasImport('gurugurusmf4'), true);

  const wmovie = inspector.getImport('wmovie');
  assert.ok(wmovie);
  assert.deepStrictEqual(wmovie?.functions, ['MoviePlay']);
});

test('PE Import Parser: Handles Ordinal imports without string names safely', () => {
  const pe = new SyntheticPEBuilder({ arch: 'x64' })
    .addImport('user32.dll', ['MessageBoxA'])
    .build();

  // Manually modify the thunk entry to have the ordinal flag (bit 63)
  const peOffset = pe.readUInt32LE(0x3C);
  const dataDirOff = peOffset + 24 + 112; // 64-bit data directory offset
  const importRva = pe.readUInt32LE(dataDirOff + 8); // Import Table RVA

  // Find .rdata section offset
  const inspector = PEInspector.fromBuffer(pe);
  const importFileOffset = inspector.rvaToOffset(importRva);
  assert.ok(importFileOffset !== null);

  // The first descriptor's OriginalFirstThunk RVA is at offset 0
  const origThunkRva = pe.readUInt32LE(importFileOffset);
  const thunkFileOffset = inspector.rvaToOffset(origThunkRva);
  assert.ok(thunkFileOffset !== null);

  // Set bit 63 for ordinal import: 0x8000000000000042n
  pe.writeBigUInt64LE(0x8000000000000042n, thunkFileOffset);

  const ordinalInspector = PEInspector.fromBuffer(pe);
  assert.strictEqual(ordinalInspector.isValid, true);
  assert.strictEqual(ordinalInspector.hasImport('user32.dll'), true);

  const user32 = ordinalInspector.getImport('user32');
  assert.ok(user32);
  // Function name string is skipped for ordinal imports
  assert.deepStrictEqual(user32?.functions, []);
});

test('PE Import Parser: Corrupt, Truncated, and Malformed Import Tables', () => {
  // 1. Executable with no Import Table directory entry
  const peNoImports = new SyntheticPEBuilder({ arch: 'x64' }).build();
  const noImportsInspector = PEInspector.fromBuffer(peNoImports);
  assert.strictEqual(noImportsInspector.isValid, true);
  assert.strictEqual(noImportsInspector.hasImport('kernel32.dll'), false);
  assert.deepStrictEqual(noImportsInspector.getImports(), []);

  // 2. Executable with Import Table RVA pointing to invalid unmapped memory
  const peInvalidRva = new SyntheticPEBuilder({ arch: 'x64' })
    .addImport('kernel32.dll', ['ExitProcess'])
    .build();

  const peOff = peInvalidRva.readUInt32LE(0x3C);
  const dataDirOff = peOff + 24 + 112;
  peInvalidRva.writeUInt32LE(0x99999999, dataDirOff + 8); // Invalid RVA

  const invalidRvaInspector = PEInspector.fromBuffer(peInvalidRva);
  assert.strictEqual(invalidRvaInspector.isValid, true);
  assert.strictEqual(invalidRvaInspector.hasImport('kernel32.dll'), false);

  // 3. Descriptor with invalid Name RVA
  const peInvalidName = new SyntheticPEBuilder({ arch: 'x64' })
    .addImport('kernel32.dll', ['ExitProcess'])
    .build();

  const validInspector = PEInspector.fromBuffer(peInvalidName);
  const importRva = validInspector.getDataDirectory(1)!.virtualAddress;
  const importOff = validInspector.rvaToOffset(importRva)!;

  // Name RVA is at descriptor offset + 12
  peInvalidName.writeUInt32LE(0x88888888, importOff + 12);

  const invalidNameInspector = PEInspector.fromBuffer(peInvalidName);
  assert.strictEqual(invalidNameInspector.isValid, true);
  assert.strictEqual(invalidNameInspector.hasImport('kernel32.dll'), false);
});
