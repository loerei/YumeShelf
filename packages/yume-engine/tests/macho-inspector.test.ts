/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MachOInspector,
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
import type { PlatformType, MachOInspectionResult } from '../dist/types.d.ts';
import { MockFileSystemProvider } from './fixtures/mock-fs-provider.ts';

function buildMachO32(options: {
  magic?: number;
  cputype?: number;
  cpusubtype?: number;
  isLittleEndian?: boolean;
  filetype?: number;
  ncmds?: number;
  sizeofcmds?: number;
  flags?: number;
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
    buf.writeUInt32LE(options.filetype ?? 2, 12);
    buf.writeUInt32LE(options.ncmds ?? 1, 16);
    buf.writeUInt32LE(options.sizeofcmds ?? 128, 20);
    buf.writeUInt32LE(options.flags ?? 0, 24);
  } else {
    buf.writeInt32BE(cputype, 4);
    buf.writeInt32BE(cpusubtype, 8);
    buf.writeUInt32BE(options.filetype ?? 2, 12);
    buf.writeUInt32BE(options.ncmds ?? 1, 16);
    buf.writeUInt32BE(options.sizeofcmds ?? 128, 20);
    buf.writeUInt32BE(options.flags ?? 0, 24);
  }

  return buf;
}

function buildMachO64(options: {
  magic?: number;
  cputype?: number;
  cpusubtype?: number;
  isLittleEndian?: boolean;
  filetype?: number;
  ncmds?: number;
  sizeofcmds?: number;
  flags?: number;
  reserved?: number;
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
    buf.writeUInt32LE(options.filetype ?? 2, 12);
    buf.writeUInt32LE(options.ncmds ?? 1, 16);
    buf.writeUInt32LE(options.sizeofcmds ?? 128, 20);
    buf.writeUInt32LE(options.flags ?? 0, 24);
    buf.writeUInt32LE(options.reserved ?? 0, 28);
  } else {
    buf.writeInt32BE(cputype, 4);
    buf.writeInt32BE(cpusubtype, 8);
    buf.writeUInt32BE(options.filetype ?? 2, 12);
    buf.writeUInt32BE(options.ncmds ?? 1, 16);
    buf.writeUInt32BE(options.sizeofcmds ?? 128, 20);
    buf.writeUInt32BE(options.flags ?? 0, 24);
    buf.writeUInt32BE(options.reserved ?? 0, 28);
  }

  return buf;
}

interface FatArchDesc {
  cputype: number;
  cpusubtype: number;
  offset: number;
  size: number;
  align?: number;
}

function buildFat32(options: {
  magic?: number;
  isLittleEndian?: boolean;
  nfatArchOverride?: number;
  architectures?: FatArchDesc[];
  totalBufferSize?: number;
}): Buffer {
  const isLE = options.isLittleEndian ?? false;
  const magic = options.magic ?? (isLE ? FAT_MAGIC_32_LE : FAT_MAGIC_32_BE);
  const archs = options.architectures ?? [];
  const nfatArch = options.nfatArchOverride ?? archs.length;
  const minSize = 8 + nfatArch * 20;
  const size = options.totalBufferSize ?? Math.max(minSize, 512);
  const buf = Buffer.alloc(size);

  buf.writeUInt32BE(magic, 0);
  if (isLE) {
    buf.writeUInt32LE(nfatArch, 4);
  } else {
    buf.writeUInt32BE(nfatArch, 4);
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
      buf.writeUInt32LE(arch.align ?? 12, entryOffset + 16);
    } else {
      buf.writeInt32BE(arch.cputype, entryOffset);
      buf.writeInt32BE(arch.cpusubtype, entryOffset + 4);
      buf.writeUInt32BE(arch.offset, entryOffset + 8);
      buf.writeUInt32BE(arch.size, entryOffset + 12);
      buf.writeUInt32BE(arch.align ?? 12, entryOffset + 16);
    }
  }

  return buf;
}

function buildFat64(options: {
  magic?: number;
  isLittleEndian?: boolean;
  nfatArchOverride?: number;
  architectures?: FatArchDesc[];
  totalBufferSize?: number;
}): Buffer {
  const isLE = options.isLittleEndian ?? false;
  const magic = options.magic ?? (isLE ? FAT_MAGIC_64_LE : FAT_MAGIC_64_BE);
  const archs = options.architectures ?? [];
  const nfatArch = options.nfatArchOverride ?? archs.length;
  const minSize = 8 + nfatArch * 32;
  const size = options.totalBufferSize ?? Math.max(minSize, 512);
  const buf = Buffer.alloc(size);

  buf.writeUInt32BE(magic, 0);
  if (isLE) {
    buf.writeUInt32LE(nfatArch, 4);
  } else {
    buf.writeUInt32BE(nfatArch, 4);
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
      buf.writeUInt32LE(arch.align ?? 12, entryOffset + 24);
      buf.writeUInt32LE(0, entryOffset + 28);
    } else {
      buf.writeInt32BE(arch.cputype, entryOffset);
      buf.writeInt32BE(arch.cpusubtype, entryOffset + 4);
      buf.writeBigUInt64BE(BigInt(arch.offset), entryOffset + 8);
      buf.writeBigUInt64BE(BigInt(arch.size), entryOffset + 16);
      buf.writeUInt32BE(arch.align ?? 12, entryOffset + 24);
      buf.writeUInt32BE(0, entryOffset + 28);
    }
  }

  return buf;
}

test('Canonical types: PlatformType supports windows, linux, macos', () => {
  const platforms: PlatformType[] = ['windows', 'linux', 'macos'];
  assert.strictEqual(platforms.length, 3);
});

test('MachOInspector: inspects 32-bit Mach-O headers (BE and LE)', () => {
  // 32-bit Big-Endian (0xFEEDFACE)
  const beBuf = buildMachO32({ isLittleEndian: false, cputype: CPU_TYPE_X86 });
  const beResult = MachOInspector.inspect(beBuf);
  assert.ok(beResult);
  assert.strictEqual(beResult.magic, MACHO_MAGIC_32_BE);
  assert.strictEqual(beResult.is64Bit, false);
  assert.strictEqual(beResult.isLittleEndian, false);
  assert.strictEqual(beResult.isFat, false);
  assert.strictEqual(beResult.arch, 'x86');

  // 32-bit Little-Endian (0xCEFAEDFE)
  const leBuf = buildMachO32({ isLittleEndian: true, cputype: CPU_TYPE_X86 });
  const leResult = MachOInspector.inspect(leBuf);
  assert.ok(leResult);
  assert.strictEqual(leResult.magic, MACHO_MAGIC_32_LE);
  assert.strictEqual(leResult.is64Bit, false);
  assert.strictEqual(leResult.isLittleEndian, true);
  assert.strictEqual(leResult.isFat, false);
  assert.strictEqual(leResult.arch, 'x86');

  // Unknown 32-bit cputype (PowerPC = 18)
  const ppcBuf = buildMachO32({ isLittleEndian: false, cputype: 18 });
  const ppcResult = MachOInspector.inspect(ppcBuf);
  assert.ok(ppcResult);
  assert.strictEqual(ppcResult.arch, 'unknown');

  // Truncated 32-bit buffer (< 28 bytes)
  const truncBuf = beBuf.subarray(0, 20);
  assert.strictEqual(MachOInspector.inspect(truncBuf), null);
});

test('MachOInspector: inspects 64-bit Mach-O headers (x64 and arm64, BE and LE)', () => {
  // 64-bit Big-Endian x64 (0xFEEDFACF)
  const be64Buf = buildMachO64({ isLittleEndian: false, cputype: CPU_TYPE_X86_64 });
  const be64Result = MachOInspector.inspect(be64Buf);
  assert.ok(be64Result);
  assert.strictEqual(be64Result.magic, MACHO_MAGIC_64_BE);
  assert.strictEqual(be64Result.is64Bit, true);
  assert.strictEqual(be64Result.isLittleEndian, false);
  assert.strictEqual(be64Result.isFat, false);
  assert.strictEqual(be64Result.arch, 'x64');

  // 64-bit Little-Endian x64 (0xCFFAEDFE)
  const le64X64 = buildMachO64({ isLittleEndian: true, cputype: CPU_TYPE_X86_64 });
  const le64X64Result = MachOInspector.inspect(le64X64);
  assert.ok(le64X64Result);
  assert.strictEqual(le64X64Result.magic, MACHO_MAGIC_64_LE);
  assert.strictEqual(le64X64Result.is64Bit, true);
  assert.strictEqual(le64X64Result.isLittleEndian, true);
  assert.strictEqual(le64X64Result.isFat, false);
  assert.strictEqual(le64X64Result.arch, 'x64');

  // 64-bit Little-Endian arm64 (0xCFFAEDFE, cputype = 0x0100000C)
  const le64Arm64 = buildMachO64({ isLittleEndian: true, cputype: CPU_TYPE_ARM64 });
  const le64Arm64Result = MachOInspector.inspect(le64Arm64);
  assert.ok(le64Arm64Result);
  assert.strictEqual(le64Arm64Result.magic, MACHO_MAGIC_64_LE);
  assert.strictEqual(le64Arm64Result.is64Bit, true);
  assert.strictEqual(le64Arm64Result.isLittleEndian, true);
  assert.strictEqual(le64Arm64Result.isFat, false);
  assert.strictEqual(le64Arm64Result.arch, 'arm64');

  // Unknown 64-bit cputype
  const unknown64 = buildMachO64({ isLittleEndian: true, cputype: 0x01000099 });
  const unknown64Result = MachOInspector.inspect(unknown64);
  assert.ok(unknown64Result);
  assert.strictEqual(unknown64Result.arch, 'unknown');

  // Truncated 64-bit buffer (< 32 bytes)
  const trunc64 = le64Arm64.subarray(0, 30);
  assert.strictEqual(MachOInspector.inspect(trunc64), null);
});

test('MachOInspector: inspects 32-bit Universal FAT binary (0xCAFEBABE & 0xBEBAFECA)', () => {
  const architectures: FatArchDesc[] = [
    { cputype: CPU_TYPE_X86_64, cpusubtype: 3, offset: 64, size: 128 },
    { cputype: CPU_TYPE_ARM64, cpusubtype: 0, offset: 192, size: 256 },
  ];

  // Big-Endian FAT 32-bit (0xCAFEBABE)
  const fatBE = buildFat32({
    isLittleEndian: false,
    architectures,
    totalBufferSize: 1024,
  });
  const fatBEResult = MachOInspector.inspect(fatBE);
  assert.ok(fatBEResult);
  assert.strictEqual(fatBEResult.magic, FAT_MAGIC_32_BE);
  assert.strictEqual(fatBEResult.is64Bit, false);
  assert.strictEqual(fatBEResult.isLittleEndian, false);
  assert.strictEqual(fatBEResult.isFat, true);
  assert.strictEqual(fatBEResult.arch, 'fat');
  assert.ok(fatBEResult.fatArchitectures);
  assert.strictEqual(fatBEResult.fatArchitectures.length, 2);
  assert.strictEqual(fatBEResult.fatArchitectures[0].cputype, CPU_TYPE_X86_64);
  assert.strictEqual(fatBEResult.fatArchitectures[0].offset, 64);
  assert.strictEqual(fatBEResult.fatArchitectures[0].size, 128);
  assert.strictEqual(fatBEResult.fatArchitectures[1].cputype, CPU_TYPE_ARM64);
  assert.strictEqual(fatBEResult.fatArchitectures[1].offset, 192);
  assert.strictEqual(fatBEResult.fatArchitectures[1].size, 256);

  // Little-Endian FAT 32-bit (0xBEBAFECA)
  const fatLE = buildFat32({
    isLittleEndian: true,
    architectures,
    totalBufferSize: 1024,
  });
  const fatLEResult = MachOInspector.inspect(fatLE);
  assert.ok(fatLEResult);
  assert.strictEqual(fatLEResult.magic, FAT_MAGIC_32_LE);
  assert.strictEqual(fatLEResult.is64Bit, false);
  assert.strictEqual(fatLEResult.isLittleEndian, true);
  assert.strictEqual(fatLEResult.isFat, true);
  assert.strictEqual(fatLEResult.arch, 'fat');
  assert.ok(fatLEResult.fatArchitectures);
  assert.strictEqual(fatLEResult.fatArchitectures.length, 2);
});

test('MachOInspector: inspects 64-bit Universal FAT binary (0xCAFEBABF & 0xBFBAFECA)', () => {
  const architectures: FatArchDesc[] = [
    { cputype: CPU_TYPE_X86_64, cpusubtype: 3, offset: 128, size: 256 },
    { cputype: CPU_TYPE_ARM64, cpusubtype: 0, offset: 512, size: 512 },
  ];

  // Big-Endian FAT 64-bit (0xCAFEBABF)
  const fat64BE = buildFat64({
    isLittleEndian: false,
    architectures,
    totalBufferSize: 2048,
  });
  const fat64BEResult = MachOInspector.inspect(fat64BE);
  assert.ok(fat64BEResult);
  assert.strictEqual(fat64BEResult.magic, FAT_MAGIC_64_BE);
  assert.strictEqual(fat64BEResult.is64Bit, true);
  assert.strictEqual(fat64BEResult.isLittleEndian, false);
  assert.strictEqual(fat64BEResult.isFat, true);
  assert.strictEqual(fat64BEResult.arch, 'fat');
  assert.ok(fat64BEResult.fatArchitectures);
  assert.strictEqual(fat64BEResult.fatArchitectures.length, 2);
  assert.strictEqual(fat64BEResult.fatArchitectures[0].cputype, CPU_TYPE_X86_64);
  assert.strictEqual(fat64BEResult.fatArchitectures[0].offset, 128);
  assert.strictEqual(fat64BEResult.fatArchitectures[0].size, 256);
  assert.strictEqual(fat64BEResult.fatArchitectures[1].cputype, CPU_TYPE_ARM64);
  assert.strictEqual(fat64BEResult.fatArchitectures[1].offset, 512);
  assert.strictEqual(fat64BEResult.fatArchitectures[1].size, 512);

  // Little-Endian FAT 64-bit (0xBFBAFECA)
  const fat64LE = buildFat64({
    isLittleEndian: true,
    architectures,
    totalBufferSize: 2048,
  });
  const fat64LEResult = MachOInspector.inspect(fat64LE);
  assert.ok(fat64LEResult);
  assert.strictEqual(fat64LEResult.magic, FAT_MAGIC_64_LE);
  assert.strictEqual(fat64LEResult.is64Bit, true);
  assert.strictEqual(fat64LEResult.isLittleEndian, true);
  assert.strictEqual(fat64LEResult.isFat, true);
  assert.strictEqual(fat64LEResult.arch, 'fat');
  assert.ok(fat64LEResult.fatArchitectures);
  assert.strictEqual(fat64LEResult.fatArchitectures.length, 2);
});

test('MachOInspector: Guards against Java .class collision on 0xCAFEBABE (nfat_arch >= 1 && nfat_arch < 30)', () => {
  // Java 8 class file collision: CA FE BA BE 00 00 00 34 (major_version = 52)
  const javaClassBuf = Buffer.from([
    0xca, 0xfe, 0xba, 0xbe, // magic
    0x00, 0x00,             // minor_version = 0
    0x00, 0x34,             // major_version = 52
    0x00, 0x05,             // constant pool count
  ]);
  assert.strictEqual(MachOInspector.inspect(javaClassBuf), null);

  // Java 21 class file collision: CA FE BA BE 00 00 00 41 (major_version = 65)
  const java21Buf = Buffer.from([
    0xca, 0xfe, 0xba, 0xbe,
    0x00, 0x00,
    0x00, 0x41,
  ]);
  assert.strictEqual(MachOInspector.inspect(java21Buf), null);

  // Boundary condition: nfat_arch = 0 -> rejected
  const zeroArchBuf = buildFat32({ nfatArchOverride: 0 });
  assert.strictEqual(MachOInspector.inspect(zeroArchBuf), null);

  // Boundary condition: nfat_arch = 30 -> rejected
  const thirtyArchBuf = buildFat32({ nfatArchOverride: 30, totalBufferSize: 1024 });
  assert.strictEqual(MachOInspector.inspect(thirtyArchBuf), null);

  // Valid boundary condition: nfat_arch = 1 -> accepted
  const oneArchBuf = buildFat32({
    architectures: [{ cputype: CPU_TYPE_ARM64, cpusubtype: 0, offset: 64, size: 64 }],
    totalBufferSize: 512,
  });
  assert.ok(MachOInspector.inspect(oneArchBuf));

  // Valid boundary condition: nfat_arch = 29 -> accepted if buffer is large enough
  const twentyNineArchs: FatArchDesc[] = [];
  for (let i = 0; i < 29; i++) {
    twentyNineArchs.push({ cputype: CPU_TYPE_ARM64, cpusubtype: 0, offset: 8 + 29 * 20 + i * 10, size: 10 });
  }
  const twentyNineBuf = buildFat32({
    architectures: twentyNineArchs,
    totalBufferSize: 8 + 29 * 20 + 29 * 10,
  });
  assert.ok(MachOInspector.inspect(twentyNineBuf));
});

test('MachOInspector: Validates FAT architecture descriptor table fits within buffer bounds', () => {
  // Table requires 8 + 2 * 20 = 48 bytes, but buffer has only 40 bytes
  const truncatedTableBuf = buildFat32({
    nfatArchOverride: 2,
    architectures: [{ cputype: CPU_TYPE_X86_64, cpusubtype: 3, offset: 100, size: 50 }],
    totalBufferSize: 40,
  });
  assert.strictEqual(MachOInspector.inspect(truncatedTableBuf), null);

  // 64-bit FAT table requires 8 + 2 * 32 = 72 bytes, but buffer has only 60 bytes
  const truncated64TableBuf = buildFat64({
    nfatArchOverride: 2,
    architectures: [{ cputype: CPU_TYPE_X86_64, cpusubtype: 3, offset: 100, size: 50 }],
    totalBufferSize: 60,
  });
  assert.strictEqual(MachOInspector.inspect(truncated64TableBuf), null);
});

test('MachOInspector: Validates architecture slice bounds against total file size and in-memory buffer', () => {
  // 1. Architecture slice offsets are only validated against total file size when fileSize is provided
  const headerOnlyBuffer = buildFat32({
    architectures: [{ cputype: CPU_TYPE_ARM64, cpusubtype: 0, offset: 64, size: 500 }],
    totalBufferSize: 256,
  });
  // When fileSize is omitted, header parses without false rejection against buffer length
  assert.ok(MachOInspector.inspect(headerOnlyBuffer));

  // When fileSize is provided and smaller than offset + size (64 + 500 = 564 > 500), it rejects
  assert.strictEqual(MachOInspector.inspect(headerOnlyBuffer, 500), null);

  // 2. Bounded <= 4KB header slice: slice offset is 8192, size is 16384 (total 24576), total fileSize is 32768
  // Buffer length is only 512 bytes (simulating the <= 4KB slice), but fileSize is passed as 32768
  const headerSlice = buildFat32({
    architectures: [{ cputype: CPU_TYPE_ARM64, cpusubtype: 0, offset: 8192, size: 16384 }],
    totalBufferSize: 512,
  });
  // Must NOT suffer false out-of-bounds rejection on the 512-byte slice
  const sliceResult = MachOInspector.inspect(headerSlice, 32768);
  assert.ok(sliceResult);
  assert.strictEqual(sliceResult.isFat, true);
  assert.strictEqual(sliceResult.fatArchitectures?.[0].offset, 8192);

  // 3. Slice exceeds provided fileSize -> rejected
  const exceedingResult = MachOInspector.inspect(headerSlice, 16000); // 8192 + 16384 = 24576 > 16000
  assert.strictEqual(exceedingResult, null);

  // 4. Negative / invalid fileSize
  assert.strictEqual(MachOInspector.inspect(headerSlice, -1), null);
  assert.strictEqual(MachOInspector.inspect(headerSlice, 100), null); // slice length 512 > fileSize 100
});

test('MachOInspector: Defensive edge cases and non-Buffer inputs', () => {
  // Empty or short inputs
  assert.strictEqual(MachOInspector.inspect(Buffer.alloc(0)), null);
  assert.strictEqual(MachOInspector.inspect(Buffer.from([0xca, 0xfe])), null);

  // Non-Mach-O binaries (PE 'MZ' header and ELF header)
  const peBuf = Buffer.from('MZ\x90\x00\x03\x00\x00\x00', 'ascii');
  assert.strictEqual(MachOInspector.inspect(peBuf), null);

  const elfBuf = Buffer.from('\x7fELF\x02\x01\x01\x00', 'binary');
  assert.strictEqual(MachOInspector.inspect(elfBuf), null);

  // Supports raw Uint8Array
  const rawArray = new Uint8Array(buildMachO64({ cputype: CPU_TYPE_ARM64 }));
  const uint8Result = MachOInspector.inspect(rawArray);
  assert.ok(uint8Result);
  assert.strictEqual(uint8Result.arch, 'arm64');
  assert.strictEqual(uint8Result.is64Bit, true);
});

test('MachOInspector.fromPath: Bounded slice reading with MockFileSystemProvider', async () => {
  const fs = new MockFileSystemProvider();

  // 1. Valid 64-bit Mach-O binary
  const arm64Buf = buildMachO64({ cputype: CPU_TYPE_ARM64 });
  fs.writeFile('/Applications/Game.app/Contents/MacOS/Game', arm64Buf);

  const result = await MachOInspector.fromPath('/Applications/Game.app/Contents/MacOS/Game', fs);
  assert.ok(result);
  assert.strictEqual(result.arch, 'arm64');
  assert.strictEqual(result.is64Bit, true);
  assert.strictEqual(result.isFat, false);

  // 2. Large FAT binary: buffer is 64KB, but arch slice is at offset 8192 with size 16384
  const fatBuf = buildFat32({
    architectures: [{ cputype: CPU_TYPE_X86_64, cpusubtype: 3, offset: 8192, size: 16384 }],
    totalBufferSize: 65536,
  });
  fs.writeFile('/Applications/FatGame.app/Contents/MacOS/FatGame', fatBuf);

  const readCalls: Array<{ offset: number; length: number }> = [];
  const originalOpen = fs.open.bind(fs);
  fs.open = async (p: string) => {
    const handle = await originalOpen(p);
    return {
      read: async (offset: number, length: number) => {
        readCalls.push({ offset, length });
        return handle.read(offset, length);
      },
      close: async () => {
        return handle.close();
      },
    };
  };

  const fatResult = await MachOInspector.fromPath('/Applications/FatGame.app/Contents/MacOS/FatGame', fs);
  assert.ok(fatResult);
  assert.strictEqual(fatResult.isFat, true);
  assert.strictEqual(fatResult.fatArchitectures?.[0].offset, 8192);

  // Verify bounded read: initial read chunk length <= 4096 bytes
  assert.ok(readCalls.length >= 1);
  assert.ok(readCalls[0].length <= 4096);
});

test('MachOInspector.fromPath: Guarantees file handle cleanup on all exit paths in try...finally', async () => {
  const fs = new MockFileSystemProvider();
  const validBuf = buildMachO64({ cputype: CPU_TYPE_ARM64 });
  fs.writeFile('/test/macho', validBuf);

  let closeCalled = false;
  const originalOpen = fs.open.bind(fs);
  fs.open = async (p: string) => {
    const handle = await originalOpen(p);
    return {
      read: async (offset: number, length: number) => {
        return handle.read(offset, length);
      },
      close: async () => {
        closeCalled = true;
        return handle.close();
      },
    };
  };

  // Normal success path
  const res = await MachOInspector.fromPath('/test/macho', fs);
  assert.ok(res);
  assert.strictEqual(closeCalled, true);

  // Error/corrupt path: truncated buffer
  fs.writeFile('/test/corrupt', Buffer.from([0xca, 0xfe, 0xba, 0xbe]));
  closeCalled = false;
  const corruptRes = await MachOInspector.fromPath('/test/corrupt', fs);
  assert.strictEqual(corruptRes, null);
  assert.strictEqual(closeCalled, true);
});

test('MachOInspector.fromPath: Error handling for missing, directory, or truncated paths', async () => {
  const fs = new MockFileSystemProvider();

  // Missing file
  const nonExistent = await MachOInspector.fromPath('/non/existent/path', fs);
  assert.strictEqual(nonExistent, null);

  // Directory path
  fs.mkdir('/test/dir');
  const dirResult = await MachOInspector.fromPath('/test/dir', fs);
  assert.strictEqual(dirResult, null);

  // File too small (< 4 bytes)
  fs.writeFile('/test/tiny', Buffer.from([0x01, 0x02]));
  const tinyResult = await MachOInspector.fromPath('/test/tiny', fs);
  assert.strictEqual(tinyResult, null);
});

test('YumeEngine.inspectMachOFile: delegates to MachOInspector.fromPath', async () => {
  const fs = new MockFileSystemProvider();
  const buf = buildMachO64({ cputype: CPU_TYPE_X86_64 });
  fs.writeFile('/test/x64_bin', buf);

  const result = await YumeEngine.inspectMachOFile('/test/x64_bin', fs);
  assert.ok(result);
  assert.strictEqual(result.arch, 'x64');
  assert.strictEqual(result.is64Bit, true);

  const missingResult = await YumeEngine.inspectMachOFile('/test/missing', fs);
  assert.strictEqual(missingResult, null);
});
