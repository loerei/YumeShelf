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
  type PeResourceDecoderOptions,
  type PeResourceSection,
} from './types.js';

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
}
