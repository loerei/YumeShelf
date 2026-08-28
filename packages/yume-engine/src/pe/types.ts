/**
 * PE Binary Inspector - Type Definitions and Constants
 *
 * Derived from Detect-It-Easy & XPEViewer specifications by horsicq
 * MIT License - Copyright (c) horsicq / YumeShelf Contributors
 */

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

export interface ParsedPEHeader {
  isValid: boolean;
  is64Bit: boolean;
  dosHeaderOffset: number;
  ntHeaderOffset: number;
  coffHeader: CoffHeader;
  optionalHeader: OptionalHeader;
  sections: ImageSectionHeader[];
}
