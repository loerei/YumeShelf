/// <reference types="node" />
/**
 * PE Binary Inspector - Resource Directory Decoder
 *
 * Derived from Detect-It-Easy & XPEViewer specifications by horsicq
 * MIT License - Copyright (c) horsicq / YumeShelf Contributors
 */

import * as fsSync from 'node:fs';
import type { IFileSystem } from '../types.js';
import { NodeFileSystemProvider } from '../fs/node-fs-provider.js';
import { PEInspector } from './pe-inspector.js';
import {
  DEFAULT_MAX_RESOURCE_ENTRIES,
  DEFAULT_MAX_RECURSION_DEPTH,
  DEFAULT_MAX_RSRC_SIZE,
  DEFAULT_MAX_GROUP_ICON_FRAMES,
  RT_ICON,
  RT_GROUP_ICON,
  type ExtractedPeIcon,
  type PeResourceDecoderOptions,
  type PeResourceSection,
} from './types.js';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export class PeResourceDecoder {
  private readonly headerBuffer: Buffer;
  private readonly rsrcSection?: PeResourceSection;
  private readonly options?: PeResourceDecoderOptions;

  constructor(
    headerBuffer: Buffer,
    rsrcSection?: PeResourceSection,
    options?: PeResourceDecoderOptions
  ) {
    this.headerBuffer = headerBuffer;
    this.options = options;

    if (rsrcSection) {
      this.rsrcSection = rsrcSection;
    } else if (headerBuffer && headerBuffer.length >= 64) {
      try {
        const peInfo = PEInspector.parseHeaders(headerBuffer);
        if (peInfo.isValid) {
          const resourceRva = peInfo.optionalHeader?.dataDirectories?.[2]?.virtualAddress;
          const rsrcSec =
            peInfo.sections.find((s) => s.name === '.rsrc') ||
            (resourceRva
              ? peInfo.sections.find(
                  (s) =>
                    resourceRva >= s.virtualAddress &&
                    resourceRva < s.virtualAddress + Math.max(s.virtualSize, s.rawSize)
                )
              : undefined);

          if (
            rsrcSec &&
            rsrcSec.rawOffset >= 0 &&
            rsrcSec.rawOffset < headerBuffer.length &&
            rsrcSec.rawSize > 0
          ) {
            const maxRsrc = options?.maxRsrcSize ?? DEFAULT_MAX_RSRC_SIZE;
            const availableBytes = Math.max(0, headerBuffer.length - rsrcSec.rawOffset);
            const readSize = Math.min(rsrcSec.rawSize, availableBytes, maxRsrc);
            if (readSize > 0) {
              this.rsrcSection = {
                buffer: headerBuffer.subarray(rsrcSec.rawOffset, rsrcSec.rawOffset + readSize),
                pointerToRawData: rsrcSec.rawOffset,
                sizeOfRawData: readSize,
                virtualAddress: rsrcSec.virtualAddress,
              };
            }
          }
        }
      } catch {
        // Ignore parse failure in constructor
      }
    }
  }

  public get resourceSection(): PeResourceSection | undefined {
    return this.rsrcSection;
  }

  static async fromFile(
    filePath: string,
    options?: PeResourceDecoderOptions | IFileSystem
  ): Promise<PeResourceDecoder | null> {
    if (options && !('open' in options) && options.signal?.aborted) {
      return null;
    }

    const fs = options && 'open' in options ? options : options?.fs ?? new NodeFileSystemProvider();
    const decoderOptions: PeResourceDecoderOptions =
      options && !('open' in options) ? options : { fs };

    try {
      const stat = await fs.stat(filePath);
      if (!stat.isFile() || stat.size < 64) return null;

      const handle = await fs.open(filePath);
      try {
        const initialReadSize = Math.min(4096, stat.size);
        const headerBuf = await handle.read(0, initialReadSize);
        if (!headerBuf || headerBuf.length < 64) return null;

        let fullHeaderBuf = headerBuf;
        const e_lfanew = headerBuf.readUInt32LE(0x3c);
        if (e_lfanew >= 64 && e_lfanew <= 4096 && e_lfanew + 24 <= headerBuf.length) {
          const numSections = headerBuf.readUInt16LE(e_lfanew + 4 + 2);
          const sizeOfOpt = headerBuf.readUInt16LE(e_lfanew + 4 + 16);
          const totalHeaderNeeded = e_lfanew + 24 + sizeOfOpt + numSections * 40;
          if (totalHeaderNeeded > headerBuf.length && totalHeaderNeeded <= 65536) {
            fullHeaderBuf = await handle.read(0, Math.min(totalHeaderNeeded, stat.size));
          }
        }

        const peInfo = PEInspector.parseHeaders(fullHeaderBuf);
        if (!peInfo.isValid) return null;

        const resourceRva = peInfo.optionalHeader?.dataDirectories?.[2]?.virtualAddress;
        const rsrcSection =
          peInfo.sections.find((s) => s.name === '.rsrc') ||
          (resourceRva
            ? peInfo.sections.find(
                (s) =>
                  resourceRva >= s.virtualAddress &&
                  resourceRva < s.virtualAddress + Math.max(s.virtualSize, s.rawSize)
              )
            : undefined);

        if (!rsrcSection) return null;

        if (options && !('open' in options) && options.signal?.aborted) {
          return null;
        }

        const maxRsrc =
          (options && 'maxRsrcSize' in options ? options.maxRsrcSize : undefined) ??
          DEFAULT_MAX_RSRC_SIZE;

        if (
          rsrcSection.rawOffset < 0 ||
          rsrcSection.rawOffset >= stat.size ||
          rsrcSection.rawSize <= 0
        ) {
          return null;
        }

        const availableBytes = Math.max(0, stat.size - rsrcSection.rawOffset);
        const readSize = Math.min(rsrcSection.rawSize, availableBytes, maxRsrc);
        if (readSize <= 0) return null;

        const rsrcBuf = await handle.read(rsrcSection.rawOffset, readSize);
        return new PeResourceDecoder(
          fullHeaderBuf,
          {
            buffer: rsrcBuf,
            pointerToRawData: rsrcSection.rawOffset,
            sizeOfRawData: readSize,
            virtualAddress: rsrcSection.virtualAddress,
          },
          decoderOptions
        );
      } finally {
        await handle.close();
      }
    } catch {
      return null;
    }
  }

  static fromFileSync(
    filePath: string,
    options?: Omit<PeResourceDecoderOptions, 'fs'>
  ): PeResourceDecoder | null {
    if (options?.signal?.aborted) {
      return null;
    }

    let fd: number | null = null;
    try {
      const stat = fsSync.statSync(filePath);
      if (!stat.isFile() || stat.size < 64) return null;

      fd = fsSync.openSync(filePath, 'r');
      const initialReadSize = Math.min(4096, stat.size);
      let headerBuf = Buffer.alloc(initialReadSize);
      const bytesRead = fsSync.readSync(fd, headerBuf, 0, initialReadSize, 0);
      if (bytesRead < 64) return null;
      headerBuf = headerBuf.subarray(0, bytesRead);

      let fullHeaderBuf = headerBuf;
      const e_lfanew = headerBuf.readUInt32LE(0x3c);
      if (e_lfanew >= 64 && e_lfanew <= 4096 && e_lfanew + 24 <= headerBuf.length) {
        const numSections = headerBuf.readUInt16LE(e_lfanew + 4 + 2);
        const sizeOfOpt = headerBuf.readUInt16LE(e_lfanew + 4 + 16);
        const totalHeaderNeeded = e_lfanew + 24 + sizeOfOpt + numSections * 40;
        if (totalHeaderNeeded > headerBuf.length && totalHeaderNeeded <= 65536) {
          const readLen = Math.min(totalHeaderNeeded, stat.size);
          const expandedBuf = Buffer.alloc(readLen);
          const expRead = fsSync.readSync(fd, expandedBuf, 0, readLen, 0);
          fullHeaderBuf = expandedBuf.subarray(0, expRead);
        }
      }

      const peInfo = PEInspector.parseHeaders(fullHeaderBuf);
      if (!peInfo.isValid) return null;

      const resourceRva = peInfo.optionalHeader?.dataDirectories?.[2]?.virtualAddress;
      const rsrcSection =
        peInfo.sections.find((s) => s.name === '.rsrc') ||
        (resourceRva
          ? peInfo.sections.find(
              (s) =>
                resourceRva >= s.virtualAddress &&
                resourceRva < s.virtualAddress + Math.max(s.virtualSize, s.rawSize)
            )
          : undefined);

      if (!rsrcSection) return null;

      if (options?.signal?.aborted) {
        return null;
      }

      const maxRsrc = options?.maxRsrcSize ?? DEFAULT_MAX_RSRC_SIZE;
      if (
        rsrcSection.rawOffset < 0 ||
        rsrcSection.rawOffset >= stat.size ||
        rsrcSection.rawSize <= 0
      ) {
        return null;
      }

      const availableBytes = Math.max(0, stat.size - rsrcSection.rawOffset);
      const readSize = Math.min(rsrcSection.rawSize, availableBytes, maxRsrc);
      if (readSize <= 0) return null;

      const rsrcBuf = Buffer.alloc(readSize);
      const secRead = fsSync.readSync(fd, rsrcBuf, 0, readSize, rsrcSection.rawOffset);
      const finalRsrcBuf = rsrcBuf.subarray(0, secRead);

      return new PeResourceDecoder(
        fullHeaderBuf,
        {
          buffer: finalRsrcBuf,
          pointerToRawData: rsrcSection.rawOffset,
          sizeOfRawData: readSize,
          virtualAddress: rsrcSection.virtualAddress,
        },
        options
      );
    } catch {
      return null;
    } finally {
      if (fd !== null) {
        try {
          fsSync.closeSync(fd);
        } catch {
          // ignore close error
        }
      }
    }
  }

  static fromBuffer(
    buffer: Buffer,
    options?: Omit<PeResourceDecoderOptions, 'fs'>
  ): PeResourceDecoder | null {
    if (options?.signal?.aborted) return null;
    if (!buffer || buffer.length < 64) return null;

    try {
      const peInfo = PEInspector.parseHeaders(buffer);
      if (!peInfo.isValid) return null;

      const resourceRva = peInfo.optionalHeader?.dataDirectories?.[2]?.virtualAddress;
      const rsrcSection =
        peInfo.sections.find((s) => s.name === '.rsrc') ||
        (resourceRva
          ? peInfo.sections.find(
              (s) =>
                resourceRva >= s.virtualAddress &&
                resourceRva < s.virtualAddress + Math.max(s.virtualSize, s.rawSize)
            )
          : undefined);

      if (!rsrcSection) return null;

      const maxRsrc = options?.maxRsrcSize ?? DEFAULT_MAX_RSRC_SIZE;
      if (
        rsrcSection.rawOffset < 0 ||
        rsrcSection.rawOffset >= buffer.length ||
        rsrcSection.rawSize <= 0
      ) {
        return null;
      }

      const availableBytes = Math.max(0, buffer.length - rsrcSection.rawOffset);
      const readSize = Math.min(rsrcSection.rawSize, availableBytes, maxRsrc);
      if (readSize <= 0) return null;

      const rsrcBuf = buffer.subarray(rsrcSection.rawOffset, rsrcSection.rawOffset + readSize);
      return new PeResourceDecoder(
        buffer,
        {
          buffer: rsrcBuf,
          pointerToRawData: rsrcSection.rawOffset,
          sizeOfRawData: readSize,
          virtualAddress: rsrcSection.virtualAddress,
        },
        options
      );
    } catch {
      return null;
    }
  }

  public getResourceDataEntry(
    type: number | string,
    name?: number | string,
    lang?: number
  ): { offset: number; size: number; rva?: number } | null {
    if (!this.rsrcSection || !this.rsrcSection.buffer || this.rsrcSection.buffer.length < 16) {
      return null;
    }

    const maxEntries = this.options?.maxResourceEntries ?? DEFAULT_MAX_RESOURCE_ENTRIES;
    const maxDepth = this.options?.maxRecursionDepth ?? DEFAULT_MAX_RECURSION_DEPTH;

    let totalEntriesVisited = 0;
    const visitedDirOffsets = new Set<number>();
    const buf = this.rsrcSection.buffer;

    const matches = (idOrName: number, filter?: number | string): boolean => {
      if (filter === undefined) return true;
      if (idOrName & 0x80000000) {
        if (typeof filter !== 'string') return false;
        const nameOffset = idOrName & 0x7fffffff;
        if (nameOffset + 2 > buf.length) return false;
        const len = buf.readUInt16LE(nameOffset);
        if (nameOffset + 2 + len * 2 > buf.length) return false;
        const nameStr = buf.toString('utf16le', nameOffset + 2, nameOffset + 2 + len * 2);
        return nameStr.toLowerCase() === filter.toLowerCase();
      } else {
        if (typeof filter === 'number') return idOrName === filter;
        if (typeof filter === 'string' && /^\d+$/.test(filter)) return idOrName === parseInt(filter, 10);
        return false;
      }
    };

    const traverse = (dirOffset: number, depth: number): { offset: number; size: number; rva?: number } | null => {
      if (depth > maxDepth) return null;
      if (visitedDirOffsets.has(dirOffset)) return null;
      visitedDirOffsets.add(dirOffset);

      if (dirOffset < 0 || dirOffset + 16 > buf.length) return null;

      const namedEntries = buf.readUInt16LE(dirOffset + 12);
      const idEntries = buf.readUInt16LE(dirOffset + 14);
      const totalEntries = namedEntries + idEntries;

      const filter = depth === 1 ? type : depth === 2 ? name : lang;

      for (let i = 0; i < totalEntries; i++) {
        totalEntriesVisited++;
        if (totalEntriesVisited > maxEntries) return null;

        const entryOffset = dirOffset + 16 + i * 8;
        if (entryOffset + 8 > buf.length) return null;

        const idOrName = buf.readUInt32LE(entryOffset);
        const offsetToDataOrSubdir = buf.readUInt32LE(entryOffset + 4);

        if (!matches(idOrName, filter)) {
          continue;
        }

        if (offsetToDataOrSubdir & 0x80000000) {
          const subDirOffset = offsetToDataOrSubdir & 0x7fffffff;
          const result = traverse(subDirOffset, depth + 1);
          if (result) return result;
        } else {
          const dataEntryOffset = offsetToDataOrSubdir;
          if (dataEntryOffset + 16 > buf.length) continue;

          const offsetToData = buf.readUInt32LE(dataEntryOffset);
          const size = buf.readUInt32LE(dataEntryOffset + 4);

          if (!this.rsrcSection || offsetToData < this.rsrcSection.virtualAddress) return null;
          const offset = offsetToData - this.rsrcSection.virtualAddress;
          if (size <= 0 || offset < 0 || offset + size > buf.length) return null;

          return { offset, size, rva: offsetToData };
        }
      }

      return null;
    };

    return traverse(0, 1);
  }

  public extractIcon(): ExtractedPeIcon | null {
    try {
      if (!this.rsrcSection || !this.rsrcSection.buffer || this.rsrcSection.buffer.length < 16) {
        return null;
      }

      const groupIconEntry = this.getResourceDataEntry(RT_GROUP_ICON);
      if (!groupIconEntry) {
        return null;
      }

      const resBuf = this.rsrcSection.buffer;
      if (groupIconEntry.offset < 0 || groupIconEntry.offset + groupIconEntry.size > resBuf.length) {
        return null;
      }

      const groupData = resBuf.subarray(
        groupIconEntry.offset,
        groupIconEntry.offset + groupIconEntry.size
      );
      if (groupData.length < 6) {
        return null;
      }

      const idType = groupData.readUInt16LE(2);
      const idCount = groupData.readUInt16LE(4);
      if (idType !== 1 || idCount === 0) {
        return null;
      }

      const maxFrames = this.options?.maxIconFrames ?? DEFAULT_MAX_GROUP_ICON_FRAMES;
      const frameCount = Math.min(idCount, maxFrames);

      interface CandidateFrame {
        width: number;
        height: number;
        bitCount: number;
        nID: number;
        bytesInRes: number;
        score: number;
        isPng: boolean;
        rawFrameBuffer: Buffer;
      }

      const candidates: CandidateFrame[] = [];

      for (let i = 0; i < frameCount; i++) {
        const entryOffset = 6 + i * 14;
        if (entryOffset + 14 > groupData.length) {
          break;
        }

        const bWidth = groupData.readUInt8(entryOffset);
        const bHeight = groupData.readUInt8(entryOffset + 1);
        const wBitCount = groupData.readUInt16LE(entryOffset + 6);
        const dwBytesInRes = groupData.readUInt32LE(entryOffset + 8);
        const nID = groupData.readUInt16LE(entryOffset + 12);

        const iconEntry = this.getResourceDataEntry(RT_ICON, nID);
        if (!iconEntry) {
          continue;
        }

        const frameLen = dwBytesInRes > 0 ? Math.min(dwBytesInRes, iconEntry.size) : iconEntry.size;
        if (frameLen < 8) {
          continue;
        }
        if (iconEntry.offset < 0 || iconEntry.offset + frameLen > resBuf.length) {
          continue;
        }

        const rawFrameBuffer = resBuf.subarray(iconEntry.offset, iconEntry.offset + frameLen);
        if (rawFrameBuffer.length < 8) {
          continue;
        }

        const isPng =
          rawFrameBuffer.length >= 8 &&
          rawFrameBuffer.subarray(0, 8).equals(PNG_MAGIC);

        let width = bWidth === 0 ? 256 : bWidth;
        let height = bHeight === 0 ? 256 : bHeight;

        if (isPng) {
          if (rawFrameBuffer.length >= 24) {
            const pngWidth = rawFrameBuffer.readUInt32BE(16);
            const pngHeight = rawFrameBuffer.readUInt32BE(20);
            if (pngWidth > 0 && pngHeight > 0) {
              width = pngWidth;
              height = pngHeight;
            }
          }

          const bitCount = wBitCount || 32;
          const score = width * height * (bitCount >= 24 ? 2 : 1) + 100000;

          candidates.push({
            width,
            height,
            bitCount,
            nID,
            bytesInRes: dwBytesInRes,
            score,
            isPng: true,
            rawFrameBuffer,
          });
        } else {
          // DIB frame check: validate rawFrameBuffer.length >= 40 && biSize >= 40 && rawFrameBuffer.length >= biSize
          if (rawFrameBuffer.length < 40) {
            continue;
          }
          const biSize = rawFrameBuffer.readUInt32LE(0);
          if (biSize < 40 || rawFrameBuffer.length < biSize) {
            continue;
          }

          const bitCount = wBitCount || (rawFrameBuffer.length >= 16 ? rawFrameBuffer.readUInt16LE(14) : 0) || 8;
          const score = width * height * (bitCount >= 24 ? 2 : 1);

          candidates.push({
            width,
            height,
            bitCount,
            nID,
            bytesInRes: dwBytesInRes,
            score,
            isPng: false,
            rawFrameBuffer,
          });
        }
      }

      if (candidates.length === 0) {
        return null;
      }

      candidates.sort((a, b) => b.score - a.score);
      const best = candidates[0];

      if (best.isPng) {
        return {
          buffer: best.rawFrameBuffer,
          mimeType: 'image/png',
          width: best.width,
          height: best.height,
          isPng: true,
        };
      }

      // Validate DIB frame header length before synthesizing .ico
      if (best.rawFrameBuffer.length < 40) {
        return null;
      }
      const biSize = best.rawFrameBuffer.readUInt32LE(0);
      if (biSize < 40 || best.rawFrameBuffer.length < biSize) {
        return null;
      }

      // Synthesize 22-byte Windows .ico file structure: ICONDIR (6 bytes) + ICONDIRENTRY (16 bytes) + DIB buffer
      const icoHeader = Buffer.alloc(22);
      icoHeader.writeUInt16LE(0, 0); // Reserved (0)
      icoHeader.writeUInt16LE(1, 2); // Type (1 for ICO)
      icoHeader.writeUInt16LE(1, 4); // Count (1 frame)

      icoHeader.writeUInt8(best.width >= 256 ? 0 : best.width, 6);
      icoHeader.writeUInt8(best.height >= 256 ? 0 : best.height, 7);
      icoHeader.writeUInt8(0, 8); // Color count
      icoHeader.writeUInt8(0, 9); // Reserved
      icoHeader.writeUInt16LE(1, 10); // Planes
      icoHeader.writeUInt16LE(best.bitCount, 12); // Bit count
      icoHeader.writeUInt32LE(best.rawFrameBuffer.length, 14); // Bytes in res
      icoHeader.writeUInt32LE(22, 18); // Image offset (header length = 22)

      const synthesizedIco = Buffer.concat([icoHeader, best.rawFrameBuffer]);
      return {
        buffer: synthesizedIco,
        mimeType: 'image/x-icon',
        width: best.width,
        height: best.height,
        isPng: false,
      };
    } catch {
      return null;
    }
  }
}

export function extractPeIcon(
  bufferOrPath: Buffer | string,
  options?: Omit<PeResourceDecoderOptions, 'fs'>
): ExtractedPeIcon | null {
  if (typeof bufferOrPath === 'string') {
    const decoder = PeResourceDecoder.fromFileSync(bufferOrPath, options);
    return decoder ? decoder.extractIcon() : null;
  }
  if (!bufferOrPath || !Buffer.isBuffer(bufferOrPath)) {
    return null;
  }
  const decoder = PeResourceDecoder.fromBuffer(bufferOrPath, options);
  return decoder ? decoder.extractIcon() : null;
}

export async function extractPeIconAsync(
  filePath: string,
  options?: PeResourceDecoderOptions | IFileSystem
): Promise<ExtractedPeIcon | null> {
  if (typeof filePath !== 'string' || !filePath) {
    return null;
  }
  const decoder = await PeResourceDecoder.fromFile(filePath, options);
  return decoder ? decoder.extractIcon() : null;
}
