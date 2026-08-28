/// <reference types="node" />
/**
 * PE Binary Inspector - Import Directory & Thunk Table Parser
 *
 * Derived from Detect-It-Easy & XPEViewer specifications by horsicq
 * MIT License - Copyright (c) horsicq / YumeShelf Contributors
 */

import {
  safeReadAsciiString,
  safeReadBigUInt64LE,
  safeReadBytes,
  safeReadUInt16LE,
  safeReadUInt32LE,
} from './binary-reader.js';
import {
  ImageDataDirectoryIndex,
  ImageOptionalMagic,
  ImportedLibrary,
} from './types.js';
import type { PEInspector } from './pe-inspector.js';

const MAX_IMPORT_DESCRIPTORS = 2048;
const MAX_THUNKS_PER_DESCRIPTOR = 4096;

/**
 * Normalizes a DLL name: lowercased, trimmed, and stripped of trailing '.dll'.
 * e.g. "GameAssembly.DLL" -> "gameassembly"
 *      " unityplayer.dll " -> "unityplayer"
 */
export function normalizeDllName(name: string): string {
  if (!name) return '';
  let norm = name.trim().toLowerCase();
  if (norm.endsWith('.dll')) {
    norm = norm.slice(0, -4);
  }
  return norm;
}

/**
 * Parses the Import Directory and resolves ILT/IAT thunks for both 32-bit and 64-bit binaries.
 */
export function parseImportDirectory(inspector: PEInspector): {
  libraries: ImportedLibrary[];
  importsSet: Set<string>;
} {
  const libraries: ImportedLibrary[] = [];
  const importsSet = new Set<string>();

  if (!inspector.isValid) {
    return { libraries, importsSet };
  }

  const importDir = inspector.getDataDirectory(ImageDataDirectoryIndex.IMPORT);
  if (!importDir || importDir.virtualAddress === 0 || importDir.size === 0) {
    return { libraries, importsSet };
  }

  const dirOffset = inspector.rvaToOffset(importDir.virtualAddress);
  if (dirOffset === null || !inspector.rawBuffer) {
    return { libraries, importsSet };
  }

  const is64Bit =
    inspector.is64Bit ||
    inspector.optionalHeader.magic === ImageOptionalMagic.PE32_PLUS;

  let currentDescOffset = dirOffset;

  for (let descIdx = 0; descIdx < MAX_IMPORT_DESCRIPTORS; descIdx++) {
    // Descriptor size is 20 bytes:
    // +0  OriginalFirstThunk (RVA)
    // +4  TimeDateStamp
    // +8  ForwarderChain
    // +12 Name (RVA)
    // +16 FirstThunk (RVA)
    if (currentDescOffset + 20 > inspector.rawBuffer.length) {
      break;
    }

    const originalFirstThunk = safeReadUInt32LE(inspector.rawBuffer, currentDescOffset + 0) ?? 0;
    const timeDateStamp = safeReadUInt32LE(inspector.rawBuffer, currentDescOffset + 4) ?? 0;
    const forwarderChain = safeReadUInt32LE(inspector.rawBuffer, currentDescOffset + 8) ?? 0;
    const nameRva = safeReadUInt32LE(inspector.rawBuffer, currentDescOffset + 12) ?? 0;
    const firstThunk = safeReadUInt32LE(inspector.rawBuffer, currentDescOffset + 16) ?? 0;

    // Null descriptor terminator: all fields are 0
    if (
      originalFirstThunk === 0 &&
      timeDateStamp === 0 &&
      forwarderChain === 0 &&
      nameRva === 0 &&
      firstThunk === 0
    ) {
      break;
    }

    // Advance descriptor offset for next iteration
    currentDescOffset += 20;

    if (nameRva === 0) {
      continue;
    }

    // Resolve DLL name from nameRVA
    const nameFileOffset = inspector.rvaToOffset(nameRva);
    if (nameFileOffset === null) {
      continue;
    }

    const rawDllName = safeReadAsciiString(inspector.rawBuffer, nameFileOffset, 256);
    if (!rawDllName || rawDllName.length === 0) {
      continue;
    }

    const normName = normalizeDllName(rawDllName);
    importsSet.add(normName);
    importsSet.add(rawDllName.toLowerCase());

    // Resolve Thunks (ILT / IAT)
    // Prefer OriginalFirstThunk (ILT); if 0 (Borland / Delphi), fall back to FirstThunk (IAT)
    const thunkRva = originalFirstThunk !== 0 ? originalFirstThunk : firstThunk;
    const functions: string[] = [];

    if (thunkRva !== 0) {
      const thunkFileOffset = inspector.rvaToOffset(thunkRva);
      if (thunkFileOffset !== null) {
        let currentThunkOffset = thunkFileOffset;

        for (let tIdx = 0; tIdx < MAX_THUNKS_PER_DESCRIPTOR; tIdx++) {
          if (is64Bit) {
            if (currentThunkOffset + 8 > inspector.rawBuffer.length) break;
            const thunkVal = safeReadBigUInt64LE(inspector.rawBuffer, currentThunkOffset);
            if (thunkVal === null || thunkVal === 0n) break;
            currentThunkOffset += 8;

            // Check ordinal flag (bit 63)
            const isOrdinal = (thunkVal & 0x8000000000000000n) !== 0n;
            if (!isOrdinal) {
              const hintNameRva = Number(thunkVal & 0x7fffffffn);
              const hintNameOffset = inspector.rvaToOffset(hintNameRva);
              if (hintNameOffset !== null) {
                // IMAGE_IMPORT_BY_NAME: [Hint: uint16, Name: ASCII]
                const fnName = safeReadAsciiString(inspector.rawBuffer, hintNameOffset + 2, 256);
                if (fnName) {
                  functions.push(fnName);
                }
              }
            }
          } else {
            if (currentThunkOffset + 4 > inspector.rawBuffer.length) break;
            const thunkVal = safeReadUInt32LE(inspector.rawBuffer, currentThunkOffset);
            if (thunkVal === null || thunkVal === 0) break;
            currentThunkOffset += 4;

            // Check ordinal flag (bit 31)
            const isOrdinal = (thunkVal & 0x80000000) !== 0;
            if (!isOrdinal) {
              const hintNameRva = thunkVal & 0x7fffffff;
              const hintNameOffset = inspector.rvaToOffset(hintNameRva);
              if (hintNameOffset !== null) {
                // IMAGE_IMPORT_BY_NAME: [Hint: uint16, Name: ASCII]
                const fnName = safeReadAsciiString(inspector.rawBuffer, hintNameOffset + 2, 256);
                if (fnName) {
                  functions.push(fnName);
                }
              }
            }
          }
        }
      }
    }

    libraries.push({
      name: rawDllName,
      normalizedName: normName,
      functions,
    });
  }

  return { libraries, importsSet };
}
