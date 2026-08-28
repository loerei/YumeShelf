/**
 * Bounds-checked binary buffer reading utilities
 *
 * Derived from Detect-It-Easy & XPEViewer specifications by horsicq
 * MIT License - Copyright (c) horsicq / YumeShelf Contributors
 */

export function safeReadUInt8(buf: Buffer, offset: number): number | null {
  if (!buf || offset < 0 || offset + 1 > buf.length) {
    return null;
  }
  return buf.readUInt8(offset);
}

export function safeReadUInt16LE(buf: Buffer, offset: number): number | null {
  if (!buf || offset < 0 || offset + 2 > buf.length) {
    return null;
  }
  return buf.readUInt16LE(offset);
}

export function safeReadUInt32LE(buf: Buffer, offset: number): number | null {
  if (!buf || offset < 0 || offset + 4 > buf.length) {
    return null;
  }
  return buf.readUInt32LE(offset);
}

export function safeReadBigUInt64LE(buf: Buffer, offset: number): bigint | null {
  if (!buf || offset < 0 || offset + 8 > buf.length) {
    return null;
  }
  return buf.readBigUInt64LE(offset);
}

export function safeReadBytes(buf: Buffer, offset: number, length: number): Buffer | null {
  if (!buf || offset < 0 || length < 0 || offset + length > buf.length) {
    return null;
  }
  return buf.subarray(offset, offset + length);
}

export function safeReadAsciiString(
  buf: Buffer,
  offset: number,
  maxLength: number = 256
): string | null {
  if (!buf || offset < 0 || offset >= buf.length) {
    return null;
  }
  const end = Math.min(buf.length, offset + maxLength);
  let nullPos = -1;
  for (let i = offset; i < end; i++) {
    if (buf[i] === 0) {
      nullPos = i;
      break;
    }
  }
  const sliceEnd = nullPos !== -1 ? nullPos : end;
  return buf.toString('ascii', offset, sliceEnd);
}

export function safeReadUtf16LEString(
  buf: Buffer,
  offset: number,
  charCount: number
): string | null {
  const byteLength = charCount * 2;
  if (!buf || offset < 0 || offset + byteLength > buf.length) {
    return null;
  }
  let str = buf.toString('utf16le', offset, offset + byteLength);
  const nullIdx = str.indexOf('\0');
  if (nullIdx !== -1) {
    str = str.substring(0, nullIdx);
  }
  return str;
}
