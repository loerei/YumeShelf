/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  YumeEngine,
  MACHO_MAGIC_32_BE,
  MACHO_MAGIC_32_LE,
  MACHO_MAGIC_64_BE,
  MACHO_MAGIC_64_LE,
  FAT_MAGIC_32_BE,
  FAT_MAGIC_32_LE,
  FAT_MAGIC_64_BE,
  FAT_MAGIC_64_LE,
  CPU_TYPE_X86,
  CPU_TYPE_X86_64,
  CPU_TYPE_ARM,
  CPU_TYPE_ARM64,
} from '../dist/index.js';
import type { GameEngineProfile } from '../dist/index.js';
import { MockFileSystemProvider } from './fixtures/mock-fs-provider.ts';

function buildMachO32(options: {
  magic?: number;
  cputype?: number;
  cpusubtype?: number;
  isLittleEndian?: boolean;
  totalSize?: number;
}): Buffer {
  const isLE = options.isLittleEndian ?? false;
  const magic = options.magic ?? (isLE ? MACHO_MAGIC_32_LE : MACHO_MAGIC_32_BE);
  const cputype = options.cputype ?? CPU_TYPE_X86;
  const cpusubtype = options.cpusubtype ?? 3;
  const size = Math.max(options.totalSize ?? 28, 28);
  const buf = Buffer.alloc(size);

  buf.writeUInt32BE(magic, 0);
  if (isLE) {
    buf.writeInt32LE(cputype, 4);
    buf.writeInt32LE(cpusubtype, 8);
    buf.writeUInt32LE(2, 12);
    buf.writeUInt32LE(1, 16);
    buf.writeUInt32LE(128, 20);
    buf.writeUInt32LE(0, 24);
  } else {
    buf.writeInt32BE(cputype, 4);
    buf.writeInt32BE(cpusubtype, 8);
    buf.writeUInt32BE(2, 12);
    buf.writeUInt32BE(1, 16);
    buf.writeUInt32BE(128, 20);
    buf.writeUInt32BE(0, 24);
  }

  return buf;
}

function buildMachO64(options: {
  magic?: number;
  cputype?: number;
  cpusubtype?: number;
  isLittleEndian?: boolean;
  totalSize?: number;
}): Buffer {
  const isLE = options.isLittleEndian ?? false;
  const magic = options.magic ?? (isLE ? MACHO_MAGIC_64_LE : MACHO_MAGIC_64_BE);
  const cputype = options.cputype ?? CPU_TYPE_X86_64;
  const cpusubtype = options.cpusubtype ?? 3;
  const size = Math.max(options.totalSize ?? 32, 32);
  const buf = Buffer.alloc(size);

  buf.writeUInt32BE(magic, 0);
  if (isLE) {
    buf.writeInt32LE(cputype, 4);
    buf.writeInt32LE(cpusubtype, 8);
    buf.writeUInt32LE(2, 12);
    buf.writeUInt32LE(1, 16);
    buf.writeUInt32LE(128, 20);
    buf.writeUInt32LE(0, 24);
    buf.writeUInt32LE(0, 28);
  } else {
    buf.writeInt32BE(cputype, 4);
    buf.writeInt32BE(cpusubtype, 8);
    buf.writeUInt32BE(2, 12);
    buf.writeUInt32BE(1, 16);
    buf.writeUInt32BE(128, 20);
    buf.writeUInt32BE(0, 24);
    buf.writeUInt32BE(0, 28);
  }

  return buf;
}

interface FatArchDesc {
  cputype: number;
  cpusubtype: number;
  offset: number;
  size: number;
}

function buildFat32(options: {
  magic?: number;
  isLittleEndian?: boolean;
  architectures?: FatArchDesc[];
  totalBufferSize?: number;
}): Buffer {
  const isLE = options.isLittleEndian ?? false;
  const magic = options.magic ?? (isLE ? FAT_MAGIC_32_LE : FAT_MAGIC_32_BE);
  const archs = options.architectures ?? [];
  const minSize = 8 + archs.length * 20;
  const size = options.totalBufferSize ?? Math.max(minSize, 512);
  const buf = Buffer.alloc(size);

  buf.writeUInt32BE(magic, 0);
  if (isLE) {
    buf.writeUInt32LE(archs.length, 4);
  } else {
    buf.writeUInt32BE(archs.length, 4);
  }

  for (let i = 0; i < archs.length; i++) {
    const entryOffset = 8 + i * 20;
    if (entryOffset + 20 > buf.length) break;
    const arch = archs[i];
    if (isLE) {
      buf.writeInt32LE(arch.cputype, entryOffset);
      buf.writeInt32LE(arch.cpusubtype, entryOffset + 4);
      buf.writeUInt32LE(arch.offset, entryOffset + 8);
      buf.writeUInt32LE(arch.size, entryOffset + 12);
      buf.writeUInt32LE(12, entryOffset + 16);
    } else {
      buf.writeInt32BE(arch.cputype, entryOffset);
      buf.writeInt32BE(arch.cpusubtype, entryOffset + 4);
      buf.writeUInt32BE(arch.offset, entryOffset + 8);
      buf.writeUInt32BE(arch.size, entryOffset + 12);
      buf.writeUInt32BE(12, entryOffset + 16);
    }
  }

  return buf;
}

function buildFat64(options: {
  magic?: number;
  isLittleEndian?: boolean;
  architectures?: FatArchDesc[];
  totalBufferSize?: number;
}): Buffer {
  const isLE = options.isLittleEndian ?? false;
  const magic = options.magic ?? (isLE ? FAT_MAGIC_64_LE : FAT_MAGIC_64_BE);
  const archs = options.architectures ?? [];
  const minSize = 8 + archs.length * 32;
  const size = options.totalBufferSize ?? Math.max(minSize, 512);
  const buf = Buffer.alloc(size);

  buf.writeUInt32BE(magic, 0);
  if (isLE) {
    buf.writeUInt32LE(archs.length, 4);
  } else {
    buf.writeUInt32BE(archs.length, 4);
  }

  for (let i = 0; i < archs.length; i++) {
    const entryOffset = 8 + i * 32;
    if (entryOffset + 32 > buf.length) break;
    const arch = archs[i];
    if (isLE) {
      buf.writeInt32LE(arch.cputype, entryOffset);
      buf.writeInt32LE(arch.cpusubtype, entryOffset + 4);
      buf.writeBigUInt64LE(BigInt(arch.offset), entryOffset + 8);
      buf.writeBigUInt64LE(BigInt(arch.size), entryOffset + 16);
      buf.writeUInt32LE(12, entryOffset + 24);
      buf.writeUInt32LE(0, entryOffset + 28);
    } else {
      buf.writeInt32BE(arch.cputype, entryOffset);
      buf.writeInt32BE(arch.cpusubtype, entryOffset + 4);
      buf.writeBigUInt64BE(BigInt(arch.offset), entryOffset + 8);
      buf.writeBigUInt64BE(BigInt(arch.size), entryOffset + 16);
      buf.writeUInt32BE(12, entryOffset + 24);
      buf.writeUInt32BE(0, entryOffset + 28);
    }
  }

  return buf;
}

function buildMinimalPE(): Buffer {
  const buf = Buffer.alloc(512);
  // 'MZ' DOS signature
  buf.writeUInt16LE(0x5a4d, 0);
  // e_lfanew at 0x3c -> points to 0x80
  buf.writeUInt32LE(0x80, 0x3c);
  // 'PE\0\0' NT signature at 0x80
  buf.writeUInt32LE(0x00004550, 0x80);
  // Machine: AMD64 (0x8664) at 0x84
  buf.writeUInt16LE(0x8664, 0x84);
  // NumberOfSections: 1 at 0x86
  buf.writeUInt16LE(1, 0x86);
  // SizeOfOptionalHeader: 240 at 0x94
  buf.writeUInt16LE(240, 0x94);
  // Magic: PE32+ (0x20b) at 0x98
  buf.writeUInt16LE(0x020b, 0x98);
  return buf;
}

test('YumeEngine.inspectExecutable: inspects standalone 64-bit Mach-O binaries (arm64 & x64)', async () => {
  const fs = new MockFileSystemProvider();

  // 1. ARM64 64-bit Mach-O binary
  const arm64Buf = buildMachO64({ cputype: CPU_TYPE_ARM64 });
  fs.writeFile('/Games/MyGame/MyGame_arm64', arm64Buf);

  const profileArm64 = await YumeEngine.inspectExecutable('/Games/MyGame/MyGame_arm64', fs);
  assert.strictEqual(profileArm64.family, 'native');
  assert.strictEqual(profileArm64.tag, 'Others');
  assert.strictEqual(profileArm64.variant, 'standard');
  assert.strictEqual(profileArm64.arch, 'arm64');
  assert.strictEqual(profileArm64.runtime, 'native');
  assert.strictEqual(profileArm64.saveStrategy, 'unknown');
  assert.strictEqual(profileArm64.detectedBy, 'Mach-O Binary');

  // 2. x64 64-bit Mach-O binary
  const x64Buf = buildMachO64({ cputype: CPU_TYPE_X86_64 });
  fs.writeFile('/Games/MyGame/MyGame_x64', x64Buf);

  const profileX64 = await YumeEngine.inspectExecutable('/Games/MyGame/MyGame_x64', fs);
  assert.strictEqual(profileX64.family, 'native');
  assert.strictEqual(profileX64.tag, 'Others');
  assert.strictEqual(profileX64.variant, 'standard');
  assert.strictEqual(profileX64.arch, 'x64');
  assert.strictEqual(profileX64.runtime, 'native');
  assert.strictEqual(profileX64.saveStrategy, 'unknown');
  assert.strictEqual(profileX64.detectedBy, 'Mach-O Binary');
});

test('YumeEngine.inspectExecutable: inspects standalone 32-bit Mach-O binaries (x86)', async () => {
  const fs = new MockFileSystemProvider();

  // 32-bit BE Mach-O (0xFEEDFACE)
  const beBuf = buildMachO32({ isLittleEndian: false, cputype: CPU_TYPE_X86 });
  fs.writeFile('/Games/ClassicGame/game_be', beBuf);

  const profileBE = await YumeEngine.inspectExecutable('/Games/ClassicGame/game_be', fs);
  assert.strictEqual(profileBE.family, 'native');
  assert.strictEqual(profileBE.tag, 'Others');
  assert.strictEqual(profileBE.variant, 'standard');
  assert.strictEqual(profileBE.arch, 'x86');
  assert.strictEqual(profileBE.runtime, 'native');
  assert.strictEqual(profileBE.saveStrategy, 'unknown');
  assert.strictEqual(profileBE.detectedBy, 'Mach-O Binary');

  // 32-bit LE Mach-O (0xCEFAEDFE)
  const leBuf = buildMachO32({ isLittleEndian: true, cputype: CPU_TYPE_X86 });
  fs.writeFile('/Games/ClassicGame/game_le', leBuf);

  const profileLE = await YumeEngine.inspectExecutable('/Games/ClassicGame/game_le', fs);
  assert.strictEqual(profileLE.family, 'native');
  assert.strictEqual(profileLE.tag, 'Others');
  assert.strictEqual(profileLE.variant, 'standard');
  assert.strictEqual(profileLE.arch, 'x86');
  assert.strictEqual(profileLE.runtime, 'native');
  assert.strictEqual(profileLE.saveStrategy, 'unknown');
  assert.strictEqual(profileLE.detectedBy, 'Mach-O Binary');
});

test('YumeEngine.inspectExecutable: inspects Universal FAT binaries (32-bit & 64-bit)', async () => {
  const fs = new MockFileSystemProvider();

  // 1. 32-bit Universal FAT binary (0xCAFEBABE)
  const fat32Buf = buildFat32({
    isLittleEndian: false,
    architectures: [
      { cputype: CPU_TYPE_X86_64, cpusubtype: 3, offset: 64, size: 128 },
      { cputype: CPU_TYPE_ARM64, cpusubtype: 0, offset: 192, size: 256 },
    ],
    totalBufferSize: 1024,
  });
  fs.writeFile('/Games/UniversalGame/fat32_game', fat32Buf);

  const profileFat32 = await YumeEngine.inspectExecutable('/Games/UniversalGame/fat32_game', fs);
  assert.strictEqual(profileFat32.family, 'native');
  assert.strictEqual(profileFat32.tag, 'Others');
  assert.strictEqual(profileFat32.variant, 'standard');
  assert.strictEqual(profileFat32.arch, 'fat');
  assert.strictEqual(profileFat32.runtime, 'native');
  assert.strictEqual(profileFat32.saveStrategy, 'unknown');
  assert.strictEqual(profileFat32.detectedBy, 'Mach-O Binary');

  // 2. 64-bit Universal FAT binary (0xCAFEBABF)
  const fat64Buf = buildFat64({
    isLittleEndian: false,
    architectures: [
      { cputype: CPU_TYPE_X86_64, cpusubtype: 3, offset: 128, size: 256 },
      { cputype: CPU_TYPE_ARM64, cpusubtype: 0, offset: 512, size: 512 },
    ],
    totalBufferSize: 2048,
  });
  fs.writeFile('/Games/UniversalGame/fat64_game', fat64Buf);

  const profileFat64 = await YumeEngine.inspectExecutable('/Games/UniversalGame/fat64_game', fs);
  assert.strictEqual(profileFat64.family, 'native');
  assert.strictEqual(profileFat64.tag, 'Others');
  assert.strictEqual(profileFat64.variant, 'standard');
  assert.strictEqual(profileFat64.arch, 'fat');
  assert.strictEqual(profileFat64.runtime, 'native');
  assert.strictEqual(profileFat64.saveStrategy, 'unknown');
  assert.strictEqual(profileFat64.detectedBy, 'Mach-O Binary');
});

test('YumeEngine.inspectExecutable: safely falls back on truncated or unreadable Mach-O binaries', async () => {
  const fs = new MockFileSystemProvider();

  // 1. Truncated 64-bit Mach-O (4 bytes of 0xFEEDFACF magic only)
  const trunc64 = Buffer.alloc(4);
  trunc64.writeUInt32BE(MACHO_MAGIC_64_BE, 0);
  fs.writeFile('/Games/Broken/trunc64', trunc64);

  const profileTrunc64 = await YumeEngine.inspectExecutable('/Games/Broken/trunc64', fs);
  assert.strictEqual(profileTrunc64.family, 'native');
  assert.strictEqual(profileTrunc64.tag, 'Others');
  assert.strictEqual(profileTrunc64.variant, 'standard');
  assert.strictEqual(profileTrunc64.arch, 'unknown');
  assert.strictEqual(profileTrunc64.runtime, 'native');
  assert.strictEqual(profileTrunc64.saveStrategy, 'unknown');
  assert.strictEqual(profileTrunc64.detectedBy, 'Mach-O Binary');

  // 2. Truncated 32-bit Mach-O (4 bytes of 0xFEEDFACE magic only)
  const trunc32 = Buffer.alloc(4);
  trunc32.writeUInt32BE(MACHO_MAGIC_32_BE, 0);
  fs.writeFile('/Games/Broken/trunc32', trunc32);

  const profileTrunc32 = await YumeEngine.inspectExecutable('/Games/Broken/trunc32', fs);
  assert.strictEqual(profileTrunc32.family, 'native');
  assert.strictEqual(profileTrunc32.tag, 'Others');
  assert.strictEqual(profileTrunc32.variant, 'standard');
  assert.strictEqual(profileTrunc32.arch, 'unknown');
  assert.strictEqual(profileTrunc32.runtime, 'native');
  assert.strictEqual(profileTrunc32.saveStrategy, 'unknown');
  assert.strictEqual(profileTrunc32.detectedBy, 'Mach-O Binary');

  // 3. Truncated FAT 64-bit binary (table descriptors cut off)
  const truncFat = Buffer.alloc(20);
  truncFat.writeUInt32BE(FAT_MAGIC_64_BE, 0);
  truncFat.writeUInt32BE(2, 4); // claims 2 architectures but table requires 72 bytes
  fs.writeFile('/Games/Broken/trunc_fat', truncFat);

  const profileTruncFat = await YumeEngine.inspectExecutable('/Games/Broken/trunc_fat', fs);
  assert.strictEqual(profileTruncFat.family, 'native');
  assert.strictEqual(profileTruncFat.tag, 'Others');
  assert.strictEqual(profileTruncFat.variant, 'standard');
  assert.strictEqual(profileTruncFat.arch, 'unknown');
  assert.strictEqual(profileTruncFat.runtime, 'native');
  assert.strictEqual(profileTruncFat.saveStrategy, 'unknown');
  assert.strictEqual(profileTruncFat.detectedBy, 'Mach-O Binary');
});

test('YumeEngine.inspectExecutable: PEInspector remains primary for .exe with Mach-O fallback', async () => {
  const fs = new MockFileSystemProvider();

  // 1. Standard valid PE .exe
  const peBuf = buildMinimalPE();
  fs.writeFile('/Games/WinGame/game.exe', peBuf);

  const peProfile = await YumeEngine.inspectExecutable('/Games/WinGame/game.exe', fs);
  assert.strictEqual(peProfile.family, 'native');
  assert.strictEqual(peProfile.detectedBy, 'Native PE Executable (Unclassified)');
  assert.strictEqual(peProfile.arch, 'x64');

  // 2. .exe file containing Mach-O binary (PE magic fails -> Mach-O fallback succeeds)
  const machoInExe = buildMachO64({ cputype: CPU_TYPE_ARM64 });
  fs.writeFile('/Games/FakeExe/macho.exe', machoInExe);

  const machoFallbackProfile = await YumeEngine.inspectExecutable('/Games/FakeExe/macho.exe', fs);
  assert.strictEqual(machoFallbackProfile.family, 'native');
  assert.strictEqual(machoFallbackProfile.tag, 'Others');
  assert.strictEqual(machoFallbackProfile.variant, 'standard');
  assert.strictEqual(machoFallbackProfile.arch, 'arm64');
  assert.strictEqual(machoFallbackProfile.detectedBy, 'Mach-O Binary');
});

test('YumeEngine.inspectGame facade method behaves identically to inspectExecutable', async () => {
  const fs = new MockFileSystemProvider();
  const arm64Buf = buildMachO64({ cputype: CPU_TYPE_ARM64 });
  fs.writeFile('/Games/GameApp/game_bin', arm64Buf);

  const profile = await YumeEngine.inspectGame('/Games/GameApp/game_bin', fs);
  assert.strictEqual(profile.family, 'native');
  assert.strictEqual(profile.tag, 'Others');
  assert.strictEqual(profile.variant, 'standard');
  assert.strictEqual(profile.arch, 'arm64');
  assert.strictEqual(profile.detectedBy, 'Mach-O Binary');
});
