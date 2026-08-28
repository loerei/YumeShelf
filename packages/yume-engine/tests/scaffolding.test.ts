import test from 'node:test';
import assert from 'node:assert/strict';
import { YumeEngine, SaveCodecError } from '../dist/index.js';
import { MockFileSystemProvider } from './fixtures/mock-fs-provider.ts';
import { SyntheticPEBuilder } from './fixtures/synthetic-pe-builder.ts';

test('Monorepo Workspace Scaffolding: YumeEngine Facade and Error Contracts', () => {
  assert.ok(YumeEngine, 'YumeEngine class should be exported');
  assert.strictEqual(typeof YumeEngine.inspectExecutable, 'function');
  assert.strictEqual(typeof YumeEngine.resolveSaveDirectory, 'function');
  assert.strictEqual(typeof YumeEngine.decodeSaveFile, 'function');
  assert.strictEqual(typeof YumeEngine.encodeSaveFile, 'function');

  const err = new SaveCodecError('Corrupt payload', 'CHECKSUM_FAILED');
  assert.strictEqual(err.name, 'SaveCodecError');
  assert.strictEqual(err.code, 'CHECKSUM_FAILED');
  assert.strictEqual(err.message, 'Corrupt payload');
});

test('MockFileSystemProvider: In-memory file and path operations', async () => {
  const fs = new MockFileSystemProvider({
    appDataPath: 'C:/Custom/AppData',
    documentsPath: 'C:/Custom/Documents',
  });

  assert.strictEqual(fs.getAppDataPath(), 'C:/Custom/AppData');
  assert.strictEqual(fs.getDocumentsPath(), 'C:/Custom/Documents');
  assert.ok(Array.isArray(fs.getWinePrefixRoots()));

  const testPath = 'C:/Games/TestGame/Game.exe';
  const testContent = Buffer.from('TEST_EXECUTABLE_BYTES');

  assert.strictEqual(await fs.exists(testPath), false);
  fs.writeFile(testPath, testContent);
  assert.strictEqual(await fs.exists(testPath), true);

  const fileStat = await fs.stat(testPath);
  assert.strictEqual(fileStat.isFile(), true);
  assert.strictEqual(fileStat.isDirectory(), false);
  assert.strictEqual(fileStat.size, testContent.length);

  const readBack = await fs.readFile(testPath);
  assert.ok(Buffer.isBuffer(readBack));
  assert.strictEqual(readBack.toString('utf8'), 'TEST_EXECUTABLE_BYTES');

  const handle = await fs.open(testPath);
  const slice = await handle.read(0, 4);
  assert.strictEqual(slice.toString('utf8'), 'TEST');
  await handle.close();

  const entries = await fs.readdir('C:/Games/TestGame');
  assert.ok(entries.includes('game.exe') || entries.includes('Game.exe'));
});

test('SyntheticPEBuilder: Builds valid PE32 (x86) and PE32+ (x64) binaries', () => {
  // Test x64 builder
  const pe64 = new SyntheticPEBuilder({ arch: 'x64' })
    .addImport('UnityPlayer.dll', ['UnityMain'])
    .addImport('GameAssembly.dll', ['il2cpp_init'])
    .setVersionInfo({
      ProductName: 'Synthetic Unity Game',
      OriginalFilename: 'Game.exe',
      FileVersion: '1.0.0.0',
    })
    .build();

  assert.ok(pe64.length > 512, 'PE buffer should have valid non-zero size');
  assert.strictEqual(pe64.toString('ascii', 0, 2), 'MZ', 'DOS Header magic must be MZ');

  const peOffset = pe64.readUInt32LE(0x3C);
  assert.strictEqual(pe64.toString('ascii', peOffset, peOffset + 4), 'PE\0\0', 'NT Signature must be PE\\0\\0');

  const machine64 = pe64.readUInt16LE(peOffset + 4);
  assert.strictEqual(machine64, 0x8664, 'Machine must be IMAGE_FILE_MACHINE_AMD64 (0x8664)');

  const optMagic64 = pe64.readUInt16LE(peOffset + 24);
  assert.strictEqual(optMagic64, 0x020B, 'Optional Header Magic for x64 must be PE32+ (0x020B)');

  // Test x86 builder
  const pe32 = new SyntheticPEBuilder({ arch: 'x86' })
    .addImport('RGSS301.dll', ['RGSSPlayerInit'])
    .setVersionInfo({
      ProductName: 'RPG Maker Game',
      InternalName: 'RPGMakerVXAce',
    })
    .build();

  assert.strictEqual(pe32.toString('ascii', 0, 2), 'MZ');
  const peOffset32 = pe32.readUInt32LE(0x3C);
  assert.strictEqual(pe32.toString('ascii', peOffset32, peOffset32 + 4), 'PE\0\0');

  const machine32 = pe32.readUInt16LE(peOffset32 + 4);
  assert.strictEqual(machine32, 0x014C, 'Machine must be IMAGE_FILE_MACHINE_I386 (0x014C)');

  const optMagic32 = pe32.readUInt16LE(peOffset32 + 24);
  assert.strictEqual(optMagic32, 0x010B, 'Optional Header Magic for x86 must be PE32 (0x010B)');
});
