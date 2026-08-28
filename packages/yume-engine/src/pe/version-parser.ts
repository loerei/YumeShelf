/// <reference types="node" />
/**
 * PE Binary Inspector - Version Info Resource Tree Parser
 *
 * Derived from Detect-It-Easy & XPEViewer specifications by horsicq
 * MIT License - Copyright (c) horsicq / YumeShelf Contributors
 */

import {
  safeReadAsciiString,
  safeReadBytes,
  safeReadUInt16LE,
  safeReadUInt32LE,
  safeReadUtf16LEString,
} from './binary-reader.js';
import {
  ImageDataDirectoryIndex,
  PEVersionInfo,
  RT_VERSION,
} from './types.js';
import type { PEInspector } from './pe-inspector.js';

const MAX_RESOURCE_ENTRIES = 2048;
const MAX_STRING_PAIRS = 512;
const MAX_RECURSION_DEPTH = 3;

/**
 * Rounds up offset to 4-byte DWORD boundary.
 */
function align4(offset: number): number {
  return (offset + 3) & ~3;
}

/**
 * Recursively locates the leaf IMAGE_RESOURCE_DATA_ENTRY for RT_VERSION (Type 16).
 * Traversal path: Type (16) -> Name/ID -> Language.
 * Strictly limited to MAX_RECURSION_DEPTH (<= 3) to prevent stack overflows and cyclic loops.
 */
function findVersionDataEntry(
  inspector: PEInspector,
  rsrcRawBase: number,
  rsrcRawSize: number,
  dirOffsetInRsrc: number,
  currentDepth: number
): { dataRva: number; size: number } | null {
  if (currentDepth > MAX_RECURSION_DEPTH || !inspector.rawBuffer) {
    return null;
  }

  const dirOffset = rsrcRawBase + dirOffsetInRsrc;
  if (dirOffset < rsrcRawBase || dirOffset + 16 > rsrcRawBase + rsrcRawSize) {
    return null;
  }

  // IMAGE_RESOURCE_DIRECTORY Header (16 bytes):
  // +0  Characteristics (uint32)
  // +4  TimeDateStamp (uint32)
  // +8  MajorVersion (uint16)
  // +10 MinorVersion (uint16)
  // +12 NumberOfNamedEntries (uint16)
  // +14 NumberOfIdEntries (uint16)
  const numNamed = safeReadUInt16LE(inspector.rawBuffer, dirOffset + 12) ?? 0;
  const numId = safeReadUInt16LE(inspector.rawBuffer, dirOffset + 14) ?? 0;
  const totalEntries = Math.min(numNamed + numId, MAX_RESOURCE_ENTRIES);

  let entryCursor = dirOffset + 16;

  for (let i = 0; i < totalEntries; i++) {
    if (entryCursor + 8 > rsrcRawBase + rsrcRawSize) {
      break;
    }

    // IMAGE_RESOURCE_DIRECTORY_ENTRY (8 bytes):
    // +0 Name/ID (uint32)
    // +4 OffsetToData/OffsetToDirectory (uint32)
    const nameOrId = safeReadUInt32LE(inspector.rawBuffer, entryCursor + 0) ?? 0;
    const offsetToDataOrDir = safeReadUInt32LE(inspector.rawBuffer, entryCursor + 4) ?? 0;
    entryCursor += 8;

    const isSubdir = (offsetToDataOrDir & 0x80000000) !== 0;
    const childOffsetInRsrc = offsetToDataOrDir & 0x7fffffff;

    if (currentDepth === 1) {
      // Level 1: Root directory filtering for Type 16 (RT_VERSION)
      // If nameOrId is not 16 or high-bit is set (named entry), skip unless it matches RT_VERSION
      const isName = (nameOrId & 0x80000000) !== 0;
      if (isName || nameOrId !== RT_VERSION) {
        continue;
      }
    }

    if (isSubdir) {
      const leaf = findVersionDataEntry(
        inspector,
        rsrcRawBase,
        rsrcRawSize,
        childOffsetInRsrc,
        currentDepth + 1
      );
      if (leaf) {
        return leaf;
      }
    } else {
      // Leaf node: IMAGE_RESOURCE_DATA_ENTRY (16 bytes)
      // +0 OffsetToData (uint32 RVA)
      // +4 Size (uint32)
      // +8 CodePage (uint32)
      // +12 Reserved (uint32)
      const leafOffset = rsrcRawBase + childOffsetInRsrc;
      if (leafOffset + 16 <= rsrcRawBase + rsrcRawSize) {
        const dataRva = safeReadUInt32LE(inspector.rawBuffer, leafOffset + 0) ?? 0;
        const size = safeReadUInt32LE(inspector.rawBuffer, leafOffset + 4) ?? 0;
        if (dataRva > 0 && size > 0) {
          return { dataRva, size };
        }
      }
    }
  }

  return null;
}

/**
 * Reads a null-terminated UTF-16LE string from the buffer and returns the string and next aligned offset.
 */
function readNullTerminatedUtf16LE(
  buf: Buffer,
  start: number,
  limit: number
): { str: string; nextOffset: number } | null {
  if (start >= limit) return null;
  let end = start;
  while (end + 1 < limit) {
    const code = buf.readUInt16LE(end);
    if (code === 0) {
      break;
    }
    end += 2;
  }
  const str = buf.toString('utf16le', start, end);
  const nextOffset = end + 2 <= limit ? end + 2 : end;
  return { str, nextOffset };
}

/**
 * Decodes StringFileInfo / StringTable / String structures inside VS_VERSIONINFO buffer.
 */
function parseStringFileInfo(
  buf: Buffer,
  sfiOffset: number,
  sfiLimit: number,
  rawValues: Record<string, string>
): void {
  // sfiOffset is at StringFileInfo header
  // wLength: uint16
  // wValueLength: uint16
  // wType: uint16
  // szKey: "StringFileInfo\0" in UTF-16LE
  if (sfiOffset + 6 > sfiLimit) return;
  const sfiLen = buf.readUInt16LE(sfiOffset);
  if (sfiLen < 6) return;

  const actualSfiLimit = Math.min(sfiOffset + sfiLen, sfiLimit);
  const sfiKey = readNullTerminatedUtf16LE(buf, sfiOffset + 6, actualSfiLimit);
  if (!sfiKey || sfiKey.str !== 'StringFileInfo') return;

  let stCursor = align4(sfiKey.nextOffset);

  // Iterate over StringTable children
  while (stCursor + 6 < actualSfiLimit) {
    const stLen = buf.readUInt16LE(stCursor);
    if (stLen < 6) break; // Guard against infinite loop

    const stLimit = Math.min(stCursor + stLen, actualSfiLimit);
    const stKey = readNullTerminatedUtf16LE(buf, stCursor + 6, stLimit);
    if (!stKey) break;

    // stKey.str is the 8-hex-digit language/codepage ID (e.g. "040904B0")
    let strCursor = align4(stKey.nextOffset);

    // Iterate over individual String pairs
    let pairCount = 0;
    while (strCursor + 6 < stLimit && pairCount < MAX_STRING_PAIRS) {
      pairCount++;
      const strLen = buf.readUInt16LE(strCursor);
      if (strLen < 6) break; // Guard against corrupt 0-length entry

      const strEntryLimit = Math.min(strCursor + strLen, stLimit);
      const strValLen = buf.readUInt16LE(strCursor + 2); // character count of value

      const keyResult = readNullTerminatedUtf16LE(buf, strCursor + 6, strEntryLimit);
      if (!keyResult || !keyResult.str) {
        strCursor = align4(strEntryLimit);
        continue;
      }

      const valOffset = align4(keyResult.nextOffset);
      let valStr = '';
      if (strValLen > 0 && valOffset < strEntryLimit) {
        const valByteLen = Math.min(strValLen * 2, strEntryLimit - valOffset);
        const valEnd = valOffset + valByteLen;
        let nullIdx = -1;
        for (let i = valOffset; i + 1 < valEnd; i += 2) {
          if (buf.readUInt16LE(i) === 0) {
            nullIdx = i;
            break;
          }
        }
        const effectiveValEnd = nullIdx !== -1 ? nullIdx : valEnd;
        valStr = buf.toString('utf16le', valOffset, effectiveValEnd);
      }

      rawValues[keyResult.str] = valStr;
      strCursor = align4(strEntryLimit);
    }

    stCursor = align4(stLimit);
  }
}

/**
 * Parses VS_VERSIONINFO structure from binary buffer.
 */
export function parseVsVersionInfo(buf: Buffer): PEVersionInfo | null {
  if (!buf || buf.length < 40) {
    return null;
  }

  // VS_VERSIONINFO root header:
  // +0 wLength (uint16)
  // +2 wValueLength (uint16)
  // +4 wType (uint16)
  // +6 szKey ("VS_VERSION_INFO\0" in UTF-16LE, 32 bytes)
  const wLength = safeReadUInt16LE(buf, 0);
  const wValueLength = safeReadUInt16LE(buf, 2);
  const wType = safeReadUInt16LE(buf, 4);

  if (wLength === null || wLength < 40 || wLength > buf.length + 512) {
    return null;
  }

  const keyResult = readNullTerminatedUtf16LE(buf, 6, Math.min(wLength, buf.length));
  if (!keyResult || keyResult.str !== 'VS_VERSION_INFO') {
    return null;
  }

  let cursor = align4(keyResult.nextOffset);

  // If wValueLength > 0, it contains VS_FIXEDFILEINFO (typically 52 bytes)
  if (wValueLength && wValueLength > 0) {
    cursor += wValueLength;
    cursor = align4(cursor);
  }

  const rawValues: Record<string, string> = {};
  const totalLimit = Math.min(wLength, buf.length);

  // Scan children for StringFileInfo or VarFileInfo
  while (cursor + 6 < totalLimit) {
    const childLen = safeReadUInt16LE(buf, cursor) ?? 0;
    if (childLen < 6) {
      break;
    }

    const childLimit = Math.min(cursor + childLen, totalLimit);
    const childKey = readNullTerminatedUtf16LE(buf, cursor + 6, childLimit);

    if (childKey && childKey.str === 'StringFileInfo') {
      parseStringFileInfo(buf, cursor, childLimit, rawValues);
    }

    cursor = align4(childLimit);
  }

  return {
    originalFilename: rawValues['OriginalFilename'] || undefined,
    productName: rawValues['ProductName'] || undefined,
    internalName: rawValues['InternalName'] || undefined,
    fileDescription: rawValues['FileDescription'] || undefined,
    fileVersion: rawValues['FileVersion'] || undefined,
    productVersion: rawValues['ProductVersion'] || undefined,
    companyName: rawValues['CompanyName'] || undefined,
    legalCopyright: rawValues['LegalCopyright'] || undefined,
    comments: rawValues['Comments'] || undefined,
    rawValues,
  };
}

/**
 * Traverses PE Resource Directory tree to locate RT_VERSION and extracts PEVersionInfo.
 */
export function parseVersionInfo(inspector: PEInspector): PEVersionInfo | null {
  if (!inspector.isValid) {
    return null;
  }

  const rsrcDir = inspector.getDataDirectory(ImageDataDirectoryIndex.RESOURCE);
  if (!rsrcDir || rsrcDir.virtualAddress === 0 || rsrcDir.size === 0) {
    return null;
  }

  const rsrcOffset = inspector.rvaToOffset(rsrcDir.virtualAddress);
  if (rsrcOffset === null || !inspector.rawBuffer) {
    return null;
  }

  // Find the leaf for RT_VERSION (Type 16)
  const leaf = findVersionDataEntry(
    inspector,
    rsrcOffset,
    rsrcDir.size,
    0, // root directory is at offset 0 relative to resource section
    1  // start at depth 1
  );

  if (!leaf) {
    return null;
  }

  const vinfoOffset = inspector.rvaToOffset(leaf.dataRva);
  if (vinfoOffset === null) {
    return null;
  }

  const vinfoBuffer = safeReadBytes(inspector.rawBuffer, vinfoOffset, leaf.size);
  if (!vinfoBuffer) {
    return null;
  }

  return parseVsVersionInfo(vinfoBuffer);
}
