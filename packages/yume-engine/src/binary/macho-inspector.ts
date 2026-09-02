/// <reference types="node" />
/**
 * Mach-O Binary Inspector - Core Header & Universal FAT Parser
 *
 * Implements in-memory parsing for macOS Mach-O binaries and Universal FAT headers.
 * MIT License - Copyright (c) YumeShelf Contributors
 */

import type { MachOInspectionResult } from '../types.js';

export const MACHO_MAGIC_32_BE = 0xfeedface;
export const MACHO_MAGIC_32_LE = 0xcefaedfe;
export const MACHO_MAGIC_64_BE = 0xfeedfacf;
export const MACHO_MAGIC_64_LE = 0xcffaedfe;

export const FAT_MAGIC_32_BE = 0xcafebabe;
export const FAT_MAGIC_32_LE = 0xbebafeca;
export const FAT_MAGIC_64_BE = 0xcafebabf;
export const FAT_MAGIC_64_LE = 0xbfbafeca;

export const CPU_TYPE_X86 = 7;
export const CPU_TYPE_X86_64 = 0x01000007;
export const CPU_TYPE_ARM = 12;
export const CPU_TYPE_ARM64 = 0x0100000c;

export class MachOInspector {
  public readonly magic: number;
  public readonly arch: 'x64' | 'arm64' | 'x86' | 'fat' | 'unknown';
  public readonly is64Bit: boolean;
  public readonly isLittleEndian: boolean;
  public readonly isFat: boolean;
  public readonly fatArchitectures?: Array<{
    cputype: number;
    cpusubtype: number;
    offset: number;
    size: number;
  }>;

  constructor(result: MachOInspectionResult) {
    this.magic = result.magic;
    this.arch = result.arch;
    this.is64Bit = result.is64Bit;
    this.isLittleEndian = result.isLittleEndian;
    this.isFat = result.isFat;
    this.fatArchitectures = result.fatArchitectures;
  }

  public static inspect(
    buffer: Uint8Array | Buffer,
    fileSize?: number
  ): MachOInspectionResult | null {
    if (!buffer || buffer.length < 4) {
      return null;
    }

    const buf = Buffer.isBuffer(buffer)
      ? buffer
      : Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength);

    if (fileSize !== undefined && (fileSize < 0 || buf.length > fileSize)) {
      return null;
    }

    const magic = buf.readUInt32BE(0);

    // Check 32-bit single architecture Mach-O
    if (magic === MACHO_MAGIC_32_BE || magic === MACHO_MAGIC_32_LE) {
      if (buf.length < 28) {
        return null;
      }
      const isLittleEndian = magic === MACHO_MAGIC_32_LE;
      const cputype = isLittleEndian ? buf.readInt32LE(4) : buf.readInt32BE(4);
      let arch: 'x64' | 'arm64' | 'x86' | 'unknown' = 'unknown';
      if (cputype === CPU_TYPE_X86_64) {
        arch = 'x64';
      } else if (cputype === CPU_TYPE_ARM64) {
        arch = 'arm64';
      } else if (cputype === CPU_TYPE_X86) {
        arch = 'x86';
      }

      return {
        magic,
        arch,
        is64Bit: false,
        isLittleEndian,
        isFat: false,
      };
    }

    // Check 64-bit single architecture Mach-O
    if (magic === MACHO_MAGIC_64_BE || magic === MACHO_MAGIC_64_LE) {
      if (buf.length < 32) {
        return null;
      }
      const isLittleEndian = magic === MACHO_MAGIC_64_LE;
      const cputype = isLittleEndian ? buf.readInt32LE(4) : buf.readInt32BE(4);
      let arch: 'x64' | 'arm64' | 'x86' | 'unknown' = 'unknown';
      if (cputype === CPU_TYPE_X86_64) {
        arch = 'x64';
      } else if (cputype === CPU_TYPE_ARM64) {
        arch = 'arm64';
      } else if (cputype === CPU_TYPE_X86) {
        arch = 'x86';
      }

      return {
        magic,
        arch,
        is64Bit: true,
        isLittleEndian,
        isFat: false,
      };
    }

    // Check Universal FAT headers
    const isFat32 = magic === FAT_MAGIC_32_BE || magic === FAT_MAGIC_32_LE;
    const isFat64 = magic === FAT_MAGIC_64_BE || magic === FAT_MAGIC_64_LE;

    if (isFat32 || isFat64) {
      if (buf.length < 8) {
        return null;
      }
      const isLittleEndian = magic === FAT_MAGIC_32_LE || magic === FAT_MAGIC_64_LE;
      const is64Bit = isFat64;
      const nfat_arch = isLittleEndian ? buf.readUInt32LE(4) : buf.readUInt32BE(4);

      // Java .class collision defense on 0xCAFEBABE: assert nfat_arch >= 1 && nfat_arch < 30
      if (magic === FAT_MAGIC_32_BE && (nfat_arch < 1 || nfat_arch >= 30)) {
        return null;
      }

      // Universal FAT binary must contain at least 1 architecture
      if (nfat_arch < 1 || nfat_arch > 1024) {
        return null;
      }

      const entrySize = is64Bit ? 32 : 20;
      const tableByteLength = 8 + nfat_arch * entrySize;
      if (tableByteLength > buf.length) {
        return null;
      }

      const maxBound = fileSize !== undefined ? fileSize : buf.length;
      const fatArchitectures: Array<{
        cputype: number;
        cpusubtype: number;
        offset: number;
        size: number;
      }> = [];

      for (let i = 0; i < nfat_arch; i++) {
        const entryOffset = 8 + i * entrySize;
        let cputype: number;
        let cpusubtype: number;
        let offset: number;
        let size: number;

        if (is64Bit) {
          if (isLittleEndian) {
            cputype = buf.readInt32LE(entryOffset);
            cpusubtype = buf.readInt32LE(entryOffset + 4);
            const offsetBig = buf.readBigUInt64LE(entryOffset + 8);
            const sizeBig = buf.readBigUInt64LE(entryOffset + 16);
            if (
              offsetBig > BigInt(Number.MAX_SAFE_INTEGER) ||
              sizeBig > BigInt(Number.MAX_SAFE_INTEGER)
            ) {
              return null;
            }
            offset = Number(offsetBig);
            size = Number(sizeBig);
          } else {
            cputype = buf.readInt32BE(entryOffset);
            cpusubtype = buf.readInt32BE(entryOffset + 4);
            const offsetBig = buf.readBigUInt64BE(entryOffset + 8);
            const sizeBig = buf.readBigUInt64BE(entryOffset + 16);
            if (
              offsetBig > BigInt(Number.MAX_SAFE_INTEGER) ||
              sizeBig > BigInt(Number.MAX_SAFE_INTEGER)
            ) {
              return null;
            }
            offset = Number(offsetBig);
            size = Number(sizeBig);
          }
        } else {
          if (isLittleEndian) {
            cputype = buf.readInt32LE(entryOffset);
            cpusubtype = buf.readInt32LE(entryOffset + 4);
            offset = buf.readUInt32LE(entryOffset + 8);
            size = buf.readUInt32LE(entryOffset + 12);
          } else {
            cputype = buf.readInt32BE(entryOffset);
            cpusubtype = buf.readInt32BE(entryOffset + 4);
            offset = buf.readUInt32BE(entryOffset + 8);
            size = buf.readUInt32BE(entryOffset + 12);
          }
        }

        if (offset < 0 || size < 0 || offset + size > maxBound) {
          return null;
        }

        fatArchitectures.push({
          cputype,
          cpusubtype,
          offset,
          size,
        });
      }

      return {
        magic,
        arch: 'fat',
        is64Bit,
        isLittleEndian,
        isFat: true,
        fatArchitectures,
      };
    }

    return null;
  }
}
