/**
 * PE Binary Inspector - Type Definitions and Constants
 *
 * Derived from Detect-It-Easy & XPEViewer specifications by horsicq
 * MIT License - Copyright (c) horsicq / YumeShelf Contributors
 */

import type { IFileSystem } from '../types.js';

export const IMAGE_DOS_SIGNATURE = 0x5A4D; // 'MZ'
export const IMAGE_NT_SIGNATURE = 0x00004550; // 'PE\0\0'

export enum ImageFileMachine {
  UNKNOWN = 0x0000,
  I386 = 0x014C,
  AMD64 = 0x8664,
  ARM = 0x01C0,
  ARM64 = 0xAA64,
  IA64 = 0x0200,
}

export enum ImageOptionalMagic {
  PE32 = 0x010B,
  PE32_PLUS = 0x020B,
  ROM = 0x0107,
}

export enum ImageDataDirectoryIndex {
  EXPORT = 0,
  IMPORT = 1,
  RESOURCE = 2,
  EXCEPTION = 3,
  SECURITY = 4,
  BASERELOC = 5,
  DEBUG = 6,
  ARCHITECTURE = 7,
  GLOBALPTR = 8,
  TLS = 9,
  LOAD_CONFIG = 10,
  BOUND_IMPORT = 11,
  IAT = 12,
  DELAY_IMPORT = 13,
  CLR_HEADER = 14,
  RESERVED = 15,
}

export const RT_VERSION = 16;
export const RT_ICON = 3;
export const RT_GROUP_ICON = 14;
export const DEFAULT_MAX_RSRC_SIZE = 32 * 1024 * 1024; // 32 MB
export const DEFAULT_MAX_RESOURCE_ENTRIES = 2048;
export const DEFAULT_MAX_RECURSION_DEPTH = 3;
export const DEFAULT_MAX_GROUP_ICON_FRAMES = 64;

// Backward-compatible aliases
export const MAX_RESOURCE_ENTRIES = DEFAULT_MAX_RESOURCE_ENTRIES;
export const MAX_RECURSION_DEPTH = DEFAULT_MAX_RECURSION_DEPTH;
export const MAX_GROUP_ICON_FRAMES = DEFAULT_MAX_GROUP_ICON_FRAMES;

export interface ImageDataDirectory {
  virtualAddress: number;
  size: number;
}

export interface ImageSectionHeader {
  name: string;
  virtualSize: number;
  virtualAddress: number;
  rawSize: number;
  rawOffset: number;
  pointerToRelocations: number;
  pointerToLinenumbers: number;
  numberOfRelocations: number;
  numberOfLinenumbers: number;
  characteristics: number;
}

export interface CoffHeader {
  machine: ImageFileMachine | number;
  numberOfSections: number;
  timeDateStamp: number;
  pointerToSymbolTable: number;
  numberOfSymbols: number;
  sizeOfOptionalHeader: number;
  characteristics: number;
}

export interface OptionalHeader {
  magic: ImageOptionalMagic | number;
  majorLinkerVersion: number;
  minorLinkerVersion: number;
  sizeOfCode: number;
  sizeOfInitializedData: number;
  sizeOfUninitializedData: number;
  addressOfEntryPoint: number;
  baseOfCode: number;
  baseOfData?: number;
  imageBase: bigint | number;
  sectionAlignment: number;
  fileAlignment: number;
  sizeOfImage: number;
  sizeOfHeaders: number;
  subsystem: number;
  numberOfRvaAndSizes: number;
  dataDirectories: ImageDataDirectory[];
}

export interface ImportedLibrary {
  name: string;
  normalizedName: string;
  functions: string[];
}

export interface ImageImportDescriptor {
  originalFirstThunk: number;
  timeDateStamp: number;
  forwarderChain: number;
  nameRva: number;
  firstThunk: number;
}

export interface PEVersionInfo {
  originalFilename?: string;
  productName?: string;
  internalName?: string;
  fileDescription?: string;
  fileVersion?: string;
  productVersion?: string;
  companyName?: string;
  legalCopyright?: string;
  comments?: string;
  rawValues: Record<string, string>;
}

export interface ParsedPEHeader {
  isValid: boolean;
  is64Bit: boolean;
  dosHeaderOffset: number;
  ntHeaderOffset: number;
  coffHeader: CoffHeader;
  optionalHeader: OptionalHeader;
  sections: ImageSectionHeader[];
}

export interface PeResourceDecoderOptions {
  fs?: IFileSystem;
  signal?: AbortSignal;
  maxRsrcSize?: number;
  maxResourceEntries?: number;
  maxRecursionDepth?: number;
  maxIconFrames?: number;
}

export type PeVersionMetadata = Partial<Pick<PEVersionInfo, 'productName' | 'fileDescription' | 'companyName' | 'fileVersion' | 'productVersion' | 'legalCopyright'>>;

export interface ExtractedPeIcon {
  buffer: Buffer;
  mimeType: string;
  width: number;
  height: number;
  isPng: boolean;
}

export interface PeResourceSection {
  buffer: Buffer;
  pointerToRawData: number;
  virtualAddress: number;
  sizeOfRawData: number;
}
