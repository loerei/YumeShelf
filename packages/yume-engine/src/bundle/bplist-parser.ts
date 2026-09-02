/// <reference types="node" />
/**
 * Headless Binary Property List (bplist00) Deserializer (@yumeshelf/engine)
 *
 * Conforms to Apple's bplist00 specification.
 * Features:
 * - Trailer bounds validation and offset table integrity
 * - 5 MB input buffer exhaustion defense
 * - 64-level recursion depth limit
 * - Cyclic reference detection
 * - Cocoa epoch date decoding (978307200s offset)
 * - Prototype pollution defense
 *
 * MIT License - Copyright (c) YumeShelf Contributors
 */

export interface BPlistParseOptions {
  /**
   * If true, dictionaries are created using Object.create(null).
   * Defaults to false (plain objects with dangerous prototype keys stripped).
   */
  nullProto?: boolean;
}

const MAX_BUFFER_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_RECURSION_DEPTH = 64;
const COCOA_EPOCH_OFFSET_SECONDS = 978307200;
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export class BPlistParser {
  private readonly buffer: Buffer;
  private readonly options?: BPlistParseOptions;
  private offsetIntSize: number = 0;
  private objectRefSize: number = 0;
  private numObjects: number = 0;
  private topObject: number = 0;
  private offsetTableOffset: number = 0;
  private depth: number = 0;
  private activeStack: Set<number> = new Set();
  private objectCache: Map<number, any> = new Map();

  constructor(buffer: Buffer | Uint8Array, options?: BPlistParseOptions) {
    if (!buffer) {
      throw new Error('Invalid binary plist: buffer is null or undefined');
    }
    this.buffer = Buffer.isBuffer(buffer)
      ? buffer
      : Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    this.options = options;
  }

  public static parse(buffer: Buffer | Uint8Array, options?: BPlistParseOptions): any {
    const parser = new BPlistParser(buffer, options);
    return parser.parse();
  }

  public parse(): any {
    if (this.buffer.length > MAX_BUFFER_SIZE) {
      throw new Error(
        `Binary plist exceeds maximum supported size of 5 MB (${this.buffer.length} bytes)`
      );
    }

    if (this.buffer.length < 40) {
      throw new Error(
        `Invalid binary plist: buffer too small (${this.buffer.length} bytes, minimum 40 bytes)`
      );
    }

    const magic = this.buffer.subarray(0, 8).toString('ascii');
    if (magic !== 'bplist00') {
      throw new Error(`Invalid binary plist header: expected 'bplist00', got '${magic}'`);
    }

    this.parseTrailer();
    return this.parseObject(this.topObject);
  }

  private parseTrailer(): void {
    const trailerPos = this.buffer.length - 32;

    this.offsetIntSize = this.buffer.readUInt8(trailerPos + 6);
    this.objectRefSize = this.buffer.readUInt8(trailerPos + 7);

    if (![1, 2, 4, 8].includes(this.offsetIntSize)) {
      throw new Error(`Invalid offsetIntSize in trailer: ${this.offsetIntSize}`);
    }

    if (![1, 2, 4, 8].includes(this.objectRefSize)) {
      throw new Error(`Invalid objectRefSize in trailer: ${this.objectRefSize}`);
    }

    const numObjectsBig = this.buffer.readBigUInt64BE(trailerPos + 8);
    const topObjectBig = this.buffer.readBigUInt64BE(trailerPos + 16);
    const offsetTableOffsetBig = this.buffer.readBigUInt64BE(trailerPos + 24);

    if (numObjectsBig <= 0n || numObjectsBig > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error(`Invalid numObjects in trailer: ${numObjectsBig}`);
    }
    this.numObjects = Number(numObjectsBig);

    if (topObjectBig >= numObjectsBig) {
      throw new Error(
        `Invalid topObject in trailer: ${topObjectBig} (numObjects: ${this.numObjects})`
      );
    }
    this.topObject = Number(topObjectBig);

    if (
      offsetTableOffsetBig < 8n ||
      offsetTableOffsetBig > BigInt(Number.MAX_SAFE_INTEGER)
    ) {
      throw new Error(`Invalid offsetTableOffset in trailer: ${offsetTableOffsetBig}`);
    }
    this.offsetTableOffset = Number(offsetTableOffsetBig);

    const requiredOffsetTableEnd =
      this.offsetTableOffset + this.numObjects * this.offsetIntSize;
    if (requiredOffsetTableEnd > trailerPos) {
      throw new Error(
        `Offset table exceeds buffer bounds: ${requiredOffsetTableEnd} > ${trailerPos}`
      );
    }
  }

  private readOffset(index: number): number {
    if (index < 0 || index >= this.numObjects) {
      throw new Error(
        `Object index out of bounds: ${index} (numObjects: ${this.numObjects})`
      );
    }

    const pos = this.offsetTableOffset + index * this.offsetIntSize;
    let offset: number;

    switch (this.offsetIntSize) {
      case 1:
        offset = this.buffer.readUInt8(pos);
        break;
      case 2:
        offset = this.buffer.readUInt16BE(pos);
        break;
      case 4:
        offset = this.buffer.readUInt32BE(pos);
        break;
      case 8: {
        const big = this.buffer.readBigUInt64BE(pos);
        if (big > BigInt(Number.MAX_SAFE_INTEGER)) {
          throw new Error(`Object offset exceeds safe integer range: ${big}`);
        }
        offset = Number(big);
        break;
      }
      default:
        throw new Error(`Unsupported offsetIntSize: ${this.offsetIntSize}`);
    }

    if (offset < 8 || offset >= this.offsetTableOffset) {
      throw new Error(
        `Invalid object offset at index ${index}: ${offset} (must be 8 <= offset < ${this.offsetTableOffset})`
      );
    }

    return offset;
  }

  private readRef(pos: number): number {
    if (pos + this.objectRefSize > this.buffer.length) {
      throw new Error(`Object reference read out of buffer bounds at ${pos}`);
    }

    let ref: number;
    switch (this.objectRefSize) {
      case 1:
        ref = this.buffer.readUInt8(pos);
        break;
      case 2:
        ref = this.buffer.readUInt16BE(pos);
        break;
      case 4:
        ref = this.buffer.readUInt32BE(pos);
        break;
      case 8: {
        const big = this.buffer.readBigUInt64BE(pos);
        if (big > BigInt(Number.MAX_SAFE_INTEGER)) {
          throw new Error(`Object reference exceeds safe integer range: ${big}`);
        }
        ref = Number(big);
        break;
      }
      default:
        throw new Error(`Unsupported objectRefSize: ${this.objectRefSize}`);
    }

    if (ref < 0 || ref >= this.numObjects) {
      throw new Error(
        `Object reference index out of range: ${ref} (numObjects: ${this.numObjects})`
      );
    }

    return ref;
  }

  private readCount(
    pos: number,
    info: number
  ): { count: number; contentPos: number } {
    if (info < 15) {
      return { count: info, contentPos: pos + 1 };
    }

    // Extended count: the next byte is an Integer object marker
    if (pos + 1 >= this.buffer.length) {
      throw new Error('Unexpected EOF while reading extended count marker');
    }

    const intMarker = this.buffer.readUInt8(pos + 1);
    const intType = (intMarker & 0xf0) >> 4;
    if (intType !== 0x1) {
      throw new Error(
        `Expected integer object marker for extended length, got type ${intType}`
      );
    }

    const intInfo = intMarker & 0x0f;
    const intBytes = 1 << intInfo;
    const intPos = pos + 2;

    if (intPos + intBytes > this.buffer.length) {
      throw new Error('Unexpected EOF while reading extended count value');
    }

    let count: number;
    switch (intBytes) {
      case 1:
        count = this.buffer.readUInt8(intPos);
        break;
      case 2:
        count = this.buffer.readUInt16BE(intPos);
        break;
      case 4:
        count = this.buffer.readUInt32BE(intPos);
        break;
      case 8: {
        const big = this.buffer.readBigUInt64BE(intPos);
        if (big > BigInt(Number.MAX_SAFE_INTEGER)) {
          throw new Error(`Extended count exceeds safe integer range: ${big}`);
        }
        count = Number(big);
        break;
      }
      default:
        throw new Error(`Unsupported extended count byte size: ${intBytes}`);
    }

    return { count, contentPos: intPos + intBytes };
  }

  private parseObject(objIndex: number): any {
    if (this.objectCache.has(objIndex)) {
      return this.objectCache.get(objIndex);
    }

    if (this.activeStack.has(objIndex)) {
      throw new Error(
        `Cyclic object reference detected in binary plist at object index ${objIndex}`
      );
    }

    if (this.depth >= MAX_RECURSION_DEPTH) {
      throw new Error(`Maximum recursion depth of ${MAX_RECURSION_DEPTH} exceeded`);
    }

    this.activeStack.add(objIndex);
    this.depth++;

    const offset = this.readOffset(objIndex);
    const marker = this.buffer.readUInt8(offset);
    const type = (marker & 0xf0) >> 4;
    const info = marker & 0x0f;

    let result: any;

    switch (type) {
      case 0x0: {
        // Simple singleton types
        if (info === 0x00) {
          result = null;
        } else if (info === 0x08) {
          result = false;
        } else if (info === 0x09) {
          result = true;
        } else if (info === 0x0f) {
          result = null; // Fill byte
        } else {
          throw new Error(`Unsupported simple type 0x0 with info: ${info}`);
        }
        break;
      }

      case 0x1: {
        // Integer
        const numBytes = 1 << info;
        const pos = offset + 1;
        if (pos + numBytes > this.buffer.length) {
          throw new Error('Unexpected EOF reading integer value');
        }

        switch (numBytes) {
          case 1:
            result = this.buffer.readUInt8(pos);
            break;
          case 2:
            result = this.buffer.readUInt16BE(pos);
            break;
          case 4:
            result = this.buffer.readUInt32BE(pos);
            break;
          case 8: {
            const val = this.buffer.readBigInt64BE(pos);
            if (
              val >= BigInt(Number.MIN_SAFE_INTEGER) &&
              val <= BigInt(Number.MAX_SAFE_INTEGER)
            ) {
              result = Number(val);
            } else {
              result = val;
            }
            break;
          }
          case 16: {
            const high = this.buffer.readBigInt64BE(pos);
            const low = this.buffer.readBigUInt64BE(pos + 8);
            result = (high << 64n) | low;
            break;
          }
          default:
            throw new Error(`Unsupported integer size: ${numBytes} bytes`);
        }
        break;
      }

      case 0x2: {
        // Real / Float
        const numBytes = 1 << info;
        const pos = offset + 1;
        if (pos + numBytes > this.buffer.length) {
          throw new Error('Unexpected EOF reading real value');
        }

        if (numBytes === 4) {
          result = this.buffer.readFloatBE(pos);
        } else if (numBytes === 8) {
          result = this.buffer.readDoubleBE(pos);
        } else {
          throw new Error(`Unsupported real size: ${numBytes} bytes`);
        }
        break;
      }

      case 0x3: {
        // Date (info === 3, 8-byte double representing seconds since Cocoa epoch 2001-01-01)
        if (info !== 3) {
          throw new Error(`Unsupported date type info: ${info}, expected 3`);
        }
        const pos = offset + 1;
        if (pos + 8 > this.buffer.length) {
          throw new Error('Unexpected EOF reading date value');
        }

        const seconds = this.buffer.readDoubleBE(pos);
        const ms = Math.round((seconds + COCOA_EPOCH_OFFSET_SECONDS) * 1000);
        result = new Date(ms);
        break;
      }

      case 0x4: {
        // Data (Byte buffer)
        const { count: byteLength, contentPos } = this.readCount(offset, info);
        if (contentPos + byteLength > this.buffer.length) {
          throw new Error('Unexpected EOF reading data bytes');
        }
        result = Buffer.from(this.buffer.subarray(contentPos, contentPos + byteLength));
        break;
      }

      case 0x5: {
        // ASCII / UTF-8 String
        const { count: strLength, contentPos } = this.readCount(offset, info);
        if (contentPos + strLength > this.buffer.length) {
          throw new Error('Unexpected EOF reading ASCII string');
        }
        result = this.buffer
          .subarray(contentPos, contentPos + strLength)
          .toString('utf8');
        break;
      }

      case 0x6: {
        // Unicode UTF-16BE String
        const { count: charCount, contentPos } = this.readCount(offset, info);
        const byteLength = charCount * 2;
        if (contentPos + byteLength > this.buffer.length) {
          throw new Error('Unexpected EOF reading UTF-16BE string');
        }
        const rawBuf = Buffer.from(
          this.buffer.subarray(contentPos, contentPos + byteLength)
        );
        rawBuf.swap16();
        result = rawBuf.toString('utf16le');
        break;
      }

      case 0x8: {
        // UID (NSKeyedArchiver)
        const uidBytes = info + 1;
        const pos = offset + 1;
        if (pos + uidBytes > this.buffer.length) {
          throw new Error('Unexpected EOF reading UID value');
        }
        let uidVal = 0;
        for (let i = 0; i < uidBytes; i++) {
          uidVal = (uidVal << 8) | this.buffer.readUInt8(pos + i);
        }
        result = { CF$UID: uidVal };
        break;
      }

      case 0xa:
      case 0xc: {
        // Array (0xA) or Set (0xC)
        const { count, contentPos } = this.readCount(offset, info);
        if (contentPos + count * this.objectRefSize > this.buffer.length) {
          throw new Error('Unexpected EOF reading array references');
        }

        const refs: number[] = [];
        for (let i = 0; i < count; i++) {
          refs.push(this.readRef(contentPos + i * this.objectRefSize));
        }

        const arr: any[] = [];
        for (const ref of refs) {
          arr.push(this.parseObject(ref));
        }
        result = arr;
        break;
      }

      case 0xd: {
        // Dictionary
        const { count, contentPos } = this.readCount(offset, info);
        const totalRefsBytes = count * 2 * this.objectRefSize;
        if (contentPos + totalRefsBytes > this.buffer.length) {
          throw new Error('Unexpected EOF reading dictionary references');
        }

        const keyRefs: number[] = [];
        for (let i = 0; i < count; i++) {
          keyRefs.push(this.readRef(contentPos + i * this.objectRefSize));
        }

        const valRefsOffset = contentPos + count * this.objectRefSize;
        const valRefs: number[] = [];
        for (let i = 0; i < count; i++) {
          valRefs.push(this.readRef(valRefsOffset + i * this.objectRefSize));
        }

        const dict: Record<string, any> = this.options?.nullProto
          ? Object.create(null)
          : {};

        for (let i = 0; i < count; i++) {
          const rawKey = this.parseObject(keyRefs[i]);
          const key = String(rawKey);
          const val = this.parseObject(valRefs[i]);

          // Prototype pollution defense
          if (DANGEROUS_KEYS.has(key)) {
            continue;
          }

          dict[key] = val;
        }

        result = dict;
        break;
      }

      default:
        throw new Error(
          `Unrecognized bplist00 object type: 0x${type.toString(16)} (marker: 0x${marker.toString(16)})`
        );
    }

    this.activeStack.delete(objIndex);
    this.depth--;
    this.objectCache.set(objIndex, result);

    return result;
  }
}

export const BinaryPlistParser = BPlistParser;
