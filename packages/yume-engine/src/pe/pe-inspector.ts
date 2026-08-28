/// <reference types="node" />
/**
 * PE Binary Inspector - Core Header & Section Table Parser
 *
 * Derived from Detect-It-Easy & XPEViewer specifications by horsicq
 * MIT License - Copyright (c) horsicq / YumeShelf Contributors
 */

import type { IFileSystem, IFileHandle } from '../types.js';
import {
  CoffHeader,
  ImageDataDirectory,
  ImageDataDirectoryIndex,
  ImageFileMachine,
  ImageOptionalMagic,
  ImageSectionHeader,
  IMAGE_DOS_SIGNATURE,
  IMAGE_NT_SIGNATURE,
  ImportedLibrary,
  OptionalHeader,
  ParsedPEHeader,
  PEVersionInfo,
} from './types.js';
import {
  safeReadAsciiString,
  safeReadBigUInt64LE,
  safeReadBytes,
  safeReadUInt16LE,
  safeReadUInt32LE,
} from './binary-reader.js';
import { normalizeDllName, parseImportDirectory } from './import-parser.js';
import { parseVersionInfo } from './version-parser.js';

export interface RvaReader {
  (offset: number, length: number): Promise<Buffer | null>;
}

export class PEInspector {
  public readonly isValid: boolean;
  public readonly is64Bit: boolean;
  public readonly dosHeaderOffset: number;
  public readonly ntHeaderOffset: number;
  public readonly coffHeader: CoffHeader;
  public readonly optionalHeader: OptionalHeader;
  public readonly sections: ImageSectionHeader[];
  public readonly rawBuffer: Buffer | null;
  public readonly imports: ImportedLibrary[];
  public readonly importsSet: Set<string>;
  public readonly versionInfo: PEVersionInfo | null;
  private readonly lazyReader: RvaReader | null;

  constructor(
    parsed: ParsedPEHeader,
    rawBuffer: Buffer | null = null,
    lazyReader: RvaReader | null = null
  ) {
    this.isValid = parsed.isValid;
    this.is64Bit = parsed.is64Bit;
    this.dosHeaderOffset = parsed.dosHeaderOffset;
    this.ntHeaderOffset = parsed.ntHeaderOffset;
    this.coffHeader = parsed.coffHeader;
    this.optionalHeader = parsed.optionalHeader;
    this.sections = parsed.sections;
    this.rawBuffer = rawBuffer;
    this.lazyReader = lazyReader;

    const { libraries, importsSet } = parseImportDirectory(this);
    this.imports = libraries;
    this.importsSet = importsSet;
    this.versionInfo = parseVersionInfo(this);
  }

  /**
   * Safe fallback for invalid/unreadable/truncated executables.
   */
  public static createEmptyProfile(): ParsedPEHeader {
    return {
      isValid: false,
      is64Bit: false,
      dosHeaderOffset: 0,
      ntHeaderOffset: 0,
      coffHeader: {
        machine: ImageFileMachine.UNKNOWN,
        numberOfSections: 0,
        timeDateStamp: 0,
        pointerToSymbolTable: 0,
        numberOfSymbols: 0,
        sizeOfOptionalHeader: 0,
        characteristics: 0,
      },
      optionalHeader: {
        magic: 0,
        majorLinkerVersion: 0,
        minorLinkerVersion: 0,
        sizeOfCode: 0,
        sizeOfInitializedData: 0,
        sizeOfUninitializedData: 0,
        addressOfEntryPoint: 0,
        baseOfCode: 0,
        imageBase: 0,
        sectionAlignment: 0,
        fileAlignment: 0,
        sizeOfImage: 0,
        sizeOfHeaders: 0,
        subsystem: 0,
        numberOfRvaAndSizes: 0,
        dataDirectories: [],
      },
      sections: [],
    };
  }

  /**
   * Synchronously parse PE headers from a memory buffer.
   */
  public static fromBuffer(buf: Buffer): PEInspector {
    if (!buf || buf.length < 64) {
      return new PEInspector(PEInspector.createEmptyProfile(), buf);
    }

    const parsed = PEInspector.parseHeaders(buf);
    return new PEInspector(parsed, buf);
  }

  /**
   * Asynchronously stream and parse PE headers using a two-stage lazy reader.
   * Reads an initial 4KB-8KB header slice, and on-demand RVA chunks up to 64KB peak RAM.
   */
  public static async fromPath(path: string, fs?: IFileSystem): Promise<PEInspector> {
    if (!fs) {
      // Default to node fs dynamic import if not provided
      const nodeFs = await import('node:fs/promises');
      const fileHandle = await nodeFs.open(path, 'r');
      try {
        const headerBuf = Buffer.alloc(8192);
        const { bytesRead } = await fileHandle.read(headerBuf, 0, 8192, 0);
        const slice = headerBuf.subarray(0, bytesRead);
        const parsed = PEInspector.parseHeaders(slice);
        return new PEInspector(parsed, slice);
      } finally {
        await fileHandle.close();
      }
    }

    let handle: IFileHandle | null = null;
    try {
      handle = await fs.open(path);
      const initialChunkSize = 8192;
      const headerBuf = await handle.read(0, initialChunkSize);

      if (!headerBuf || headerBuf.length < 64) {
        return new PEInspector(PEInspector.createEmptyProfile(), headerBuf ?? Buffer.alloc(0));
      }

      // Check if section headers extend beyond initial chunk
      const e_lfanew = safeReadUInt32LE(headerBuf, 0x3c);
      if (e_lfanew === null || e_lfanew < 64 || e_lfanew > 4096) {
        const parsed = PEInspector.parseHeaders(headerBuf);
        return new PEInspector(parsed, headerBuf);
      }

      const numSections = safeReadUInt16LE(headerBuf, e_lfanew + 4 + 2) ?? 0;
      const sizeOfOpt = safeReadUInt16LE(headerBuf, e_lfanew + 4 + 16) ?? 0;
      const totalHeaderNeeded = e_lfanew + 24 + sizeOfOpt + numSections * 40;

      let fullHeaderBuf = headerBuf;
      if (totalHeaderNeeded > headerBuf.length && totalHeaderNeeded <= 65536) {
        // Read full expanded header buffer
        fullHeaderBuf = await handle.read(0, totalHeaderNeeded);
      }

      const parsed = PEInspector.parseHeaders(fullHeaderBuf);
      return new PEInspector(parsed, fullHeaderBuf);
    } finally {
      if (handle) {
        try {
          await handle.close();
        } catch {
          // Ignore close errors
        }
      }
    }
  }

  /**
   * Parses DOS, COFF, Optional Header, and Section Table from a header buffer slice.
   */
  public static parseHeaders(buf: Buffer): ParsedPEHeader {
    const empty = PEInspector.createEmptyProfile();
    if (!buf || buf.length < 64) {
      return empty;
    }

    // 1. Validate DOS Header ('MZ')
    const dosMagic = safeReadUInt16LE(buf, 0);
    if (dosMagic !== IMAGE_DOS_SIGNATURE) {
      return empty;
    }

    // 2. Read e_lfanew (pointer to NT Header)
    const e_lfanew = safeReadUInt32LE(buf, 0x3c);
    if (e_lfanew === null || e_lfanew < 64 || e_lfanew + 4 > buf.length) {
      return empty;
    }

    // 3. Validate NT Signature ('PE\0\0')
    const peSignature = safeReadUInt32LE(buf, e_lfanew);
    if (peSignature !== IMAGE_NT_SIGNATURE) {
      return empty;
    }

    // 4. Parse COFF File Header (20 bytes)
    const coffOff = e_lfanew + 4;
    const machine = safeReadUInt16LE(buf, coffOff + 0);
    const numberOfSections = safeReadUInt16LE(buf, coffOff + 2);
    const timeDateStamp = safeReadUInt32LE(buf, coffOff + 4);
    const pointerToSymbolTable = safeReadUInt32LE(buf, coffOff + 8);
    const numberOfSymbols = safeReadUInt32LE(buf, coffOff + 12);
    const sizeOfOptionalHeader = safeReadUInt16LE(buf, coffOff + 16);
    const characteristics = safeReadUInt16LE(buf, coffOff + 18);

    if (
      machine === null ||
      numberOfSections === null ||
      timeDateStamp === null ||
      pointerToSymbolTable === null ||
      numberOfSymbols === null ||
      sizeOfOptionalHeader === null ||
      characteristics === null
    ) {
      return empty;
    }

    // Boundary constraints: sections <= 96, optional header <= 4096
    if (numberOfSections > 96 || sizeOfOptionalHeader > 4096) {
      return empty;
    }

    const coffHeader: CoffHeader = {
      machine,
      numberOfSections,
      timeDateStamp,
      pointerToSymbolTable,
      numberOfSymbols,
      sizeOfOptionalHeader,
      characteristics,
    };

    // 5. Parse Optional Header (if present)
    const optOff = coffOff + 20;
    let is64Bit =
      machine === ImageFileMachine.AMD64 ||
      machine === ImageFileMachine.ARM64 ||
      machine === ImageFileMachine.IA64;

    const optMagic = sizeOfOptionalHeader >= 2 ? safeReadUInt16LE(buf, optOff) : 0;
    if (optMagic === ImageOptionalMagic.PE32_PLUS) {
      is64Bit = true;
    }

    const majorLinkerVersion = safeReadUInt16LE(buf, optOff + 2) ?? 0;
    const sizeOfCode = safeReadUInt32LE(buf, optOff + 4) ?? 0;
    const sizeOfInitializedData = safeReadUInt32LE(buf, optOff + 8) ?? 0;
    const sizeOfUninitializedData = safeReadUInt32LE(buf, optOff + 12) ?? 0;
    const addressOfEntryPoint = safeReadUInt32LE(buf, optOff + 16) ?? 0;
    const baseOfCode = safeReadUInt32LE(buf, optOff + 20) ?? 0;

    let baseOfData: number | undefined;
    let imageBase: bigint | number = 0;
    let sectionAlignment = 0;
    let fileAlignment = 0;
    let sizeOfImage = 0;
    let sizeOfHeaders = 0;
    let subsystem = 0;
    let numberOfRvaAndSizes = 0;
    let dataDirsOffset = 0;

    if (is64Bit) {
      imageBase = safeReadBigUInt64LE(buf, optOff + 24) ?? 0n;
      sectionAlignment = safeReadUInt32LE(buf, optOff + 32) ?? 0;
      fileAlignment = safeReadUInt32LE(buf, optOff + 36) ?? 0;
      sizeOfImage = safeReadUInt32LE(buf, optOff + 56) ?? 0;
      sizeOfHeaders = safeReadUInt32LE(buf, optOff + 60) ?? 0;
      subsystem = safeReadUInt16LE(buf, optOff + 68) ?? 0;
      numberOfRvaAndSizes = safeReadUInt32LE(buf, optOff + 108) ?? 0;
      dataDirsOffset = optOff + 112;
    } else {
      baseOfData = safeReadUInt32LE(buf, optOff + 24) ?? 0;
      imageBase = safeReadUInt32LE(buf, optOff + 28) ?? 0;
      sectionAlignment = safeReadUInt32LE(buf, optOff + 32) ?? 0;
      fileAlignment = safeReadUInt32LE(buf, optOff + 36) ?? 0;
      sizeOfImage = safeReadUInt32LE(buf, optOff + 56) ?? 0;
      sizeOfHeaders = safeReadUInt32LE(buf, optOff + 60) ?? 0;
      subsystem = safeReadUInt16LE(buf, optOff + 68) ?? 0;
      numberOfRvaAndSizes = safeReadUInt32LE(buf, optOff + 92) ?? 0;
      dataDirsOffset = optOff + 96;
    }

    // Parse Data Directories (up to 16)
    const dataDirectories: ImageDataDirectory[] = [];
    const maxDirs = Math.min(numberOfRvaAndSizes, 16);
    for (let i = 0; i < maxDirs; i++) {
      const entryOff = dataDirsOffset + i * 8;
      const va = safeReadUInt32LE(buf, entryOff) ?? 0;
      const sz = safeReadUInt32LE(buf, entryOff + 4) ?? 0;
      dataDirectories.push({ virtualAddress: va, size: sz });
    }

    const optionalHeader: OptionalHeader = {
      magic: optMagic ?? 0,
      majorLinkerVersion: (majorLinkerVersion >> 8) & 0xff,
      minorLinkerVersion: majorLinkerVersion & 0xff,
      sizeOfCode,
      sizeOfInitializedData,
      sizeOfUninitializedData,
      addressOfEntryPoint,
      baseOfCode,
      baseOfData,
      imageBase,
      sectionAlignment,
      fileAlignment,
      sizeOfImage,
      sizeOfHeaders,
      subsystem,
      numberOfRvaAndSizes,
      dataDirectories,
    };

    // 6. Parse Section Table
    const sections: ImageSectionHeader[] = [];
    const secTableOff = optOff + sizeOfOptionalHeader;

    for (let i = 0; i < numberOfSections; i++) {
      const entryOff = secTableOff + i * 40;
      if (entryOff + 40 > buf.length) {
        break;
      }

      const name = safeReadAsciiString(buf, entryOff, 8) ?? '';
      const virtualSize = safeReadUInt32LE(buf, entryOff + 8) ?? 0;
      const virtualAddress = safeReadUInt32LE(buf, entryOff + 12) ?? 0;
      const rawSize = safeReadUInt32LE(buf, entryOff + 16) ?? 0;
      const rawOffset = safeReadUInt32LE(buf, entryOff + 20) ?? 0;
      const pointerToRelocations = safeReadUInt32LE(buf, entryOff + 24) ?? 0;
      const pointerToLinenumbers = safeReadUInt32LE(buf, entryOff + 28) ?? 0;
      const numberOfRelocations = safeReadUInt16LE(buf, entryOff + 32) ?? 0;
      const numberOfLinenumbers = safeReadUInt16LE(buf, entryOff + 34) ?? 0;
      const characteristics = safeReadUInt32LE(buf, entryOff + 36) ?? 0;

      sections.push({
        name,
        virtualSize,
        virtualAddress,
        rawSize,
        rawOffset,
        pointerToRelocations,
        pointerToLinenumbers,
        numberOfRelocations,
        numberOfLinenumbers,
        characteristics,
      });
    }

    return {
      isValid: true,
      is64Bit,
      dosHeaderOffset: 0,
      ntHeaderOffset: e_lfanew,
      coffHeader,
      optionalHeader,
      sections,
    };
  }

  /**
   * Safe RVA to file raw offset calculation.
   * Validates bounds: sec.rawOffset > 0 && sec.rawSize > 0 && rva >= sec.virtualAddress && (rva - sec.virtualAddress) < sec.rawSize
   * Returns null for unmapped RVAs or RVAs pointing beyond raw section bounds.
   */
  public rvaToOffset(rva: number): number | null {
    if (rva < 0) {
      return null;
    }

    for (const sec of this.sections) {
      if (
        sec.rawOffset > 0 &&
        sec.rawSize > 0 &&
        rva >= sec.virtualAddress &&
        rva - sec.virtualAddress < sec.rawSize
      ) {
        return sec.rawOffset + (rva - sec.virtualAddress);
      }
    }

    return null;
  }

  /**
   * Checks whether a specific DLL is imported in O(1) time complexity.
   * Tolerant to whitespace, case sensitivity, and optional '.dll' extension.
   * e.g. hasImport('GameAssembly.dll'), hasImport('gameassembly'), hasImport('  UNITYPLAYER.DLL ')
   */
  public hasImport(dllName: string): boolean {
    if (!dllName || !this.importsSet) {
      return false;
    }
    const trimmed = dllName.trim().toLowerCase();
    const normalized = normalizeDllName(dllName);
    return this.importsSet.has(normalized) || this.importsSet.has(trimmed);
  }

  /**
   * Retrieves import metadata and imported functions for a specific DLL.
   */
  public getImport(dllName: string): ImportedLibrary | undefined {
    if (!dllName || !this.imports) {
      return undefined;
    }
    const normalized = normalizeDllName(dllName);
    return this.imports.find((i) => i.normalizedName === normalized);
  }

  /**
   * Retrieves all imported libraries.
   */
  public getImports(): ImportedLibrary[] {
    return [...(this.imports ?? [])];
  }

  /**
   * Retrieves a Data Directory by its standard index.
   */
  public getDataDirectory(index: ImageDataDirectoryIndex | number): ImageDataDirectory | null {
    if (index < 0 || index >= this.optionalHeader.dataDirectories.length) {
      return null;
    }
    return this.optionalHeader.dataDirectories[index];
  }

  /**
   * Reads bytes at an RVA from memory buffer if available.
   */
  public readRvaBytes(rva: number, length: number): Buffer | null {
    const offset = this.rvaToOffset(rva);
    if (offset === null || !this.rawBuffer) {
      return null;
    }
    return safeReadBytes(this.rawBuffer, offset, length);
  }
}
