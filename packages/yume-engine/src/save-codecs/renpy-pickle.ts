import * as zlib from 'node:zlib';
import { SaveCodecError } from './errors.js';
import { createSafeDict, isDangerousKey, sanitizeDeep } from './sanitize.js';

// CRC-32 precomputed lookup table
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[i] = c >>> 0;
}

function crc32(buf: Buffer): number {
  let crc = 0 ^ -1;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

const MARK = Symbol('PICKLE_MARK');

const MAX_STACK_SIZE = 20000;
const MAX_MEMO_SIZE = 50000;
const MAX_ITERATIONS = 500000;

export class SandboxedPickleParser {
  static parse(buf: Buffer): any {
    const stack: any[] = [];
    const memo: Record<number, any> = Object.create(null);
    let memoCounter = 0;
    let pos = 0;
    let iterations = 0;

    while (pos < buf.length) {
      if (++iterations > MAX_ITERATIONS) {
        throw new SaveCodecError(
          'Resource limit exceeded: Too many pickle opcodes processed',
          'PARSE_FAILED'
        );
      }

      if (stack.length > MAX_STACK_SIZE) {
        throw new SaveCodecError('Pickle stack depth limit exceeded', 'PARSE_FAILED');
      }

      const op = buf[pos++];

      switch (op) {
        // PROTO (0x80)
        case 0x80: {
          const protoVer = buf[pos++];
          if (protoVer < 0 || protoVer > 5) {
            throw new SaveCodecError(`Unsupported pickle protocol: ${protoVer}`, 'PARSE_FAILED');
          }
          break;
        }

        // FRAME (0x95)
        case 0x95: {
          // 8-byte frame length, skip
          pos += 8;
          break;
        }

        // STOP (0x2E, '.')
        case 0x2e: {
          if (stack.length === 0) {
            throw new SaveCodecError('Empty stack at pickle STOP opcode', 'PARSE_FAILED');
          }
          return stack.pop();
        }

        // MARK (0x28, '(')
        case 0x28: {
          stack.push(MARK);
          break;
        }

        // POP (0x30, '0')
        case 0x30: {
          stack.pop();
          break;
        }

        // POP_MARK (0x31, '1')
        case 0x31: {
          while (stack.length > 0 && stack[stack.length - 1] !== MARK) {
            stack.pop();
          }
          if (stack.length > 0 && stack[stack.length - 1] === MARK) {
            stack.pop();
          }
          break;
        }

        // DUP (0x32, '2')
        case 0x32: {
          if (stack.length === 0) {
            throw new SaveCodecError('Stack underflow on DUP', 'PARSE_FAILED');
          }
          stack.push(stack[stack.length - 1]);
          break;
        }

        // NONE (0x4E, 'N')
        case 0x4e: {
          stack.push(null);
          break;
        }

        // NEWTRUE (0x88)
        case 0x88: {
          stack.push(true);
          break;
        }

        // NEWFALSE (0x89)
        case 0x89: {
          stack.push(false);
          break;
        }

        // INT (0x49, 'I')
        case 0x49: {
          let end = pos;
          while (end < buf.length && buf[end] !== 0x0a) end++;
          const str = buf.subarray(pos, end).toString('latin1').trim();
          pos = end + 1;
          if (str === '01') {
            stack.push(true);
          } else if (str === '00') {
            stack.push(false);
          } else {
            stack.push(parseInt(str, 10));
          }
          break;
        }

        // BININT (0x4A, 'J')
        case 0x4a: {
          const val = buf.readInt32LE(pos);
          pos += 4;
          stack.push(val);
          break;
        }

        // BININT1 (0x4B, 'K')
        case 0x4b: {
          const val = buf.readUInt8(pos);
          pos += 1;
          stack.push(val);
          break;
        }

        // BININT2 (0x4D, 'M')
        case 0x4d: {
          const val = buf.readUInt16LE(pos);
          pos += 2;
          stack.push(val);
          break;
        }

        // LONG (0x4C, 'L')
        case 0x4c: {
          let end = pos;
          while (end < buf.length && buf[end] !== 0x0a) end++;
          let str = buf.subarray(pos, end).toString('latin1').trim();
          if (str.endsWith('L')) str = str.slice(0, -1);
          pos = end + 1;
          const parsed = Number(str);
          stack.push(Number.isNaN(parsed) ? 0 : parsed);
          break;
        }

        // LONG1 (0x8A)
        case 0x8a: {
          const len = buf.readUInt8(pos++);
          if (len === 0) {
            stack.push(0);
            break;
          }
          const raw = buf.subarray(pos, pos + len);
          pos += len;
          let val = 0;
          for (let i = 0; i < Math.min(len, 6); i++) {
            val += raw[i] * Math.pow(256, i);
          }
          stack.push(val);
          break;
        }

        // LONG4 (0x8B)
        case 0x8b: {
          const len = buf.readUInt32LE(pos);
          pos += 4;
          const raw = buf.subarray(pos, pos + len);
          pos += len;
          let val = 0;
          for (let i = 0; i < Math.min(len, 6); i++) {
            val += raw[i] * Math.pow(256, i);
          }
          stack.push(val);
          break;
        }

        // FLOAT (0x46, 'F')
        case 0x46: {
          let end = pos;
          while (end < buf.length && buf[end] !== 0x0a) end++;
          const str = buf.subarray(pos, end).toString('latin1').trim();
          pos = end + 1;
          stack.push(parseFloat(str));
          break;
        }

        // BINFLOAT (0x47, 'G')
        case 0x47: {
          const val = buf.readDoubleBE(pos);
          pos += 8;
          stack.push(val);
          break;
        }

        // STRING (0x53, 'S')
        case 0x53: {
          let end = pos;
          while (end < buf.length && buf[end] !== 0x0a) end++;
          let str = buf.subarray(pos, end).toString('latin1');
          pos = end + 1;
          if (
            (str.startsWith("'") && str.endsWith("'")) ||
            (str.startsWith('"') && str.endsWith('"'))
          ) {
            str = str.slice(1, -1);
          }
          stack.push(str);
          break;
        }

        // BINSTRING (0x54, 'T')
        case 0x54: {
          const len = buf.readUInt32LE(pos);
          pos += 4;
          const str = buf.subarray(pos, pos + len).toString('latin1');
          pos += len;
          stack.push(str);
          break;
        }

        // SHORT_BINSTRING (0x55, 'U')
        case 0x55: {
          const len = buf.readUInt8(pos++);
          const str = buf.subarray(pos, pos + len).toString('latin1');
          pos += len;
          stack.push(str);
          break;
        }

        // UNICODE (0x56, 'V')
        case 0x56: {
          let end = pos;
          while (end < buf.length && buf[end] !== 0x0a) end++;
          const str = buf.subarray(pos, end).toString('utf8');
          pos = end + 1;
          stack.push(str);
          break;
        }

        // BINUNICODE (0x58, 'X')
        case 0x58: {
          const len = buf.readUInt32LE(pos);
          pos += 4;
          const str = buf.subarray(pos, pos + len).toString('utf8');
          pos += len;
          stack.push(str);
          break;
        }

        // SHORT_BINUNICODE (0x8C)
        case 0x8c: {
          const len = buf.readUInt8(pos++);
          const str = buf.subarray(pos, pos + len).toString('utf8');
          pos += len;
          stack.push(str);
          break;
        }

        // BINUNICODE8 (0x8E)
        case 0x8e: {
          const len = Number(buf.readBigUInt64LE(pos));
          pos += 8;
          const str = buf.subarray(pos, pos + len).toString('utf8');
          pos += len;
          stack.push(str);
          break;
        }

        // BINBYTES (0x42, 'B')
        case 0x42: {
          const len = buf.readUInt32LE(pos);
          pos += 4;
          const bytes = buf.subarray(pos, pos + len);
          pos += len;
          stack.push(bytes);
          break;
        }

        // SHORT_BINBYTES (0x43, 'C')
        case 0x43: {
          const len = buf.readUInt8(pos++);
          const bytes = buf.subarray(pos, pos + len);
          pos += len;
          stack.push(bytes);
          break;
        }

        // EMPTY_LIST (0x5D, ']')
        case 0x5d: {
          stack.push([]);
          break;
        }

        // LIST (0x6C, 'l')
        case 0x6c: {
          const items: any[] = [];
          while (stack.length > 0 && stack[stack.length - 1] !== MARK) {
            items.unshift(stack.pop());
          }
          if (stack.length > 0 && stack[stack.length - 1] === MARK) {
            stack.pop();
          }
          stack.push(items);
          break;
        }

        // APPEND (0x61, 'a')
        case 0x61: {
          const item = stack.pop();
          const targetList = stack[stack.length - 1];
          if (Array.isArray(targetList)) {
            targetList.push(item);
          }
          break;
        }

        // APPENDS (0x65, 'e')
        case 0x65: {
          const items: any[] = [];
          while (stack.length > 0 && stack[stack.length - 1] !== MARK) {
            items.unshift(stack.pop());
          }
          if (stack.length > 0 && stack[stack.length - 1] === MARK) {
            stack.pop();
          }
          const targetList = stack[stack.length - 1];
          if (Array.isArray(targetList)) {
            targetList.push(...items);
          }
          break;
        }

        // EMPTY_DICT (0x7D, '}')
        case 0x7d: {
          stack.push(createSafeDict());
          break;
        }

        // DICT (0x64, 'd')
        case 0x64: {
          const items: any[] = [];
          while (stack.length > 0 && stack[stack.length - 1] !== MARK) {
            items.unshift(stack.pop());
          }
          if (stack.length > 0 && stack[stack.length - 1] === MARK) {
            stack.pop();
          }
          const dict = createSafeDict();
          for (let i = 0; i < items.length; i += 2) {
            const k = String(items[i]);
            const v = items[i + 1];
            if (!isDangerousKey(k)) {
              dict[k] = v;
            }
          }
          stack.push(dict);
          break;
        }

        // SETITEM (0x73, 's')
        case 0x73: {
          const val = stack.pop();
          const key = String(stack.pop());
          const dict = stack[stack.length - 1];
          if (dict && typeof dict === 'object' && !isDangerousKey(key)) {
            dict[key] = val;
          }
          break;
        }

        // SETITEMS (0x75, 'u')
        case 0x75: {
          const items: any[] = [];
          while (stack.length > 0 && stack[stack.length - 1] !== MARK) {
            items.unshift(stack.pop());
          }
          if (stack.length > 0 && stack[stack.length - 1] === MARK) {
            stack.pop();
          }
          const dict = stack[stack.length - 1];
          if (dict && typeof dict === 'object') {
            for (let i = 0; i < items.length; i += 2) {
              const k = String(items[i]);
              const v = items[i + 1];
              if (!isDangerousKey(k)) {
                dict[k] = v;
              }
            }
          }
          break;
        }

        // EMPTY_TUPLE (0x29, ')')
        case 0x29: {
          stack.push([]);
          break;
        }

        // TUPLE (0x74, 't')
        case 0x74: {
          const items: any[] = [];
          while (stack.length > 0 && stack[stack.length - 1] !== MARK) {
            items.unshift(stack.pop());
          }
          if (stack.length > 0 && stack[stack.length - 1] === MARK) {
            stack.pop();
          }
          stack.push(items);
          break;
        }

        // TUPLE1 (0x85)
        case 0x85: {
          const item = stack.pop();
          stack.push([item]);
          break;
        }

        // TUPLE2 (0x86)
        case 0x86: {
          const b = stack.pop();
          const a = stack.pop();
          stack.push([a, b]);
          break;
        }

        // TUPLE3 (0x87)
        case 0x87: {
          const c = stack.pop();
          const b = stack.pop();
          const a = stack.pop();
          stack.push([a, b, c]);
          break;
        }

        // EMPTY_SET (0x8F)
        case 0x8f: {
          stack.push(new Set());
          break;
        }

        // ADDITEMS (0x90)
        case 0x90: {
          const items: any[] = [];
          while (stack.length > 0 && stack[stack.length - 1] !== MARK) {
            items.unshift(stack.pop());
          }
          if (stack.length > 0 && stack[stack.length - 1] === MARK) {
            stack.pop();
          }
          const targetSet = stack[stack.length - 1];
          if (targetSet instanceof Set) {
            for (const item of items) targetSet.add(item);
          }
          break;
        }

        // FROZENSET (0x91)
        case 0x91: {
          const items: any[] = [];
          while (stack.length > 0 && stack[stack.length - 1] !== MARK) {
            items.unshift(stack.pop());
          }
          if (stack.length > 0 && stack[stack.length - 1] === MARK) {
            stack.pop();
          }
          stack.push(new Set(items));
          break;
        }

        // PUT (0x70, 'p')
        case 0x70: {
          let end = pos;
          while (end < buf.length && buf[end] !== 0x0a) end++;
          const idx = parseInt(buf.subarray(pos, end).toString('latin1'), 10);
          pos = end + 1;
          if (Object.keys(memo).length < MAX_MEMO_SIZE) {
            memo[idx] = stack[stack.length - 1];
          }
          break;
        }

        // BINPUT (0x71, 'q')
        case 0x71: {
          const idx = buf.readUInt8(pos++);
          if (Object.keys(memo).length < MAX_MEMO_SIZE) {
            memo[idx] = stack[stack.length - 1];
          }
          break;
        }

        // LONG_BINPUT (0x72, 'r')
        case 0x72: {
          const idx = buf.readUInt32LE(pos);
          pos += 4;
          if (Object.keys(memo).length < MAX_MEMO_SIZE) {
            memo[idx] = stack[stack.length - 1];
          }
          break;
        }

        // MEMOIZE (0x94)
        case 0x94: {
          if (memoCounter < MAX_MEMO_SIZE) {
            memo[memoCounter++] = stack[stack.length - 1];
          }
          break;
        }

        // GET (0x67, 'g')
        case 0x67: {
          let end = pos;
          while (end < buf.length && buf[end] !== 0x0a) end++;
          const idx = parseInt(buf.subarray(pos, end).toString('latin1'), 10);
          pos = end + 1;
          stack.push(memo[idx]);
          break;
        }

        // BINGET (0x68, 'h')
        case 0x68: {
          const idx = buf.readUInt8(pos++);
          stack.push(memo[idx]);
          break;
        }

        // LONG_BINGET (0x6A, 'j')
        case 0x6a: {
          const idx = buf.readUInt32LE(pos);
          pos += 4;
          stack.push(memo[idx]);
          break;
        }

        // --- UNSAFE OPCODES: EXPLICITLY REJECT WITH SaveCodecError ---
        case 0x63: // GLOBAL 'c'
          throw new SaveCodecError('Unsafe pickle opcode detected: GLOBAL (0x63)', 'PARSE_FAILED');
        case 0x93: // STACK_GLOBAL
          throw new SaveCodecError(
            'Unsafe pickle opcode detected: STACK_GLOBAL (0x93)',
            'PARSE_FAILED'
          );
        case 0x52: // REDUCE 'R'
          throw new SaveCodecError('Unsafe pickle opcode detected: REDUCE (0x52)', 'PARSE_FAILED');
        case 0x62: // BUILD 'b'
          throw new SaveCodecError('Unsafe pickle opcode detected: BUILD (0x62)', 'PARSE_FAILED');
        case 0x69: // INST 'i'
          throw new SaveCodecError('Unsafe pickle opcode detected: INST (0x69)', 'PARSE_FAILED');
        case 0x6f: // OBJ 'o'
          throw new SaveCodecError('Unsafe pickle opcode detected: OBJ (0x6f)', 'PARSE_FAILED');
        case 0x81: // NEWOBJ
          throw new SaveCodecError('Unsafe pickle opcode detected: NEWOBJ (0x81)', 'PARSE_FAILED');
        case 0x92: // NEWOBJ_EX
          throw new SaveCodecError(
            'Unsafe pickle opcode detected: NEWOBJ_EX (0x92)',
            'PARSE_FAILED'
          );
        case 0x82: // EXT1
        case 0x83: // EXT2
        case 0x84: // EXT4
          throw new SaveCodecError(
            `Unsafe pickle opcode detected: EXTENSION (0x${op.toString(16)})`,
            'PARSE_FAILED'
          );

        default:
          throw new SaveCodecError(
            `Unrecognized or unsupported pickle opcode: 0x${op.toString(16)}`,
            'PARSE_FAILED'
          );
      }
    }

    throw new SaveCodecError('Unexpected end of pickle buffer without STOP opcode', 'PARSE_FAILED');
  }

  static serialize(obj: any): Buffer {
    const chunks: Buffer[] = [Buffer.from([0x80, 0x02])]; // Protocol 2

    function writeVal(val: any) {
      if (val === null || val === undefined) {
        chunks.push(Buffer.from([0x4e])); // NONE
      } else if (typeof val === 'boolean') {
        chunks.push(Buffer.from([val ? 0x88 : 0x89])); // NEWTRUE / NEWFALSE
      } else if (typeof val === 'number') {
        if (Number.isInteger(val)) {
          if (val >= 0 && val <= 255) {
            chunks.push(Buffer.from([0x4b, val])); // BININT1
          } else if (val >= 0 && val <= 65535) {
            const b = Buffer.alloc(3);
            b[0] = 0x4d;
            b.writeUInt16LE(val, 1);
            chunks.push(b); // BININT2
          } else if (val >= -2147483648 && val <= 2147483647) {
            const b = Buffer.alloc(5);
            b[0] = 0x4a;
            b.writeInt32LE(val, 1);
            chunks.push(b); // BININT
          } else {
            const b = Buffer.alloc(9);
            b[0] = 0x47;
            b.writeDoubleBE(val, 1);
            chunks.push(b); // BINFLOAT
          }
        } else {
          const b = Buffer.alloc(9);
          b[0] = 0x47;
          b.writeDoubleBE(val, 1);
          chunks.push(b); // BINFLOAT
        }
      } else if (typeof val === 'string') {
        const strBuf = Buffer.from(val, 'utf8');
        if (strBuf.length <= 255) {
          chunks.push(Buffer.from([0x8c, strBuf.length]));
          chunks.push(strBuf);
        } else {
          const lenBuf = Buffer.alloc(5);
          lenBuf[0] = 0x58; // BINUNICODE
          lenBuf.writeUInt32LE(strBuf.length, 1);
          chunks.push(lenBuf);
          chunks.push(strBuf);
        }
      } else if (Array.isArray(val)) {
        chunks.push(Buffer.from([0x5d, 0x28])); // EMPTY_LIST, MARK
        for (const item of val) {
          writeVal(item);
        }
        chunks.push(Buffer.from([0x65])); // APPENDS
      } else if (val instanceof Set) {
        chunks.push(Buffer.from([0x8f, 0x28])); // EMPTY_SET, MARK
        for (const item of val) {
          writeVal(item);
        }
        chunks.push(Buffer.from([0x90])); // ADDITEMS
      } else if (typeof val === 'object') {
        chunks.push(Buffer.from([0x7d, 0x28])); // EMPTY_DICT, MARK
        for (const [k, v] of Object.entries(val)) {
          if (!isDangerousKey(k)) {
            writeVal(k);
            writeVal(v);
          }
        }
        chunks.push(Buffer.from([0x75])); // SETITEMS
      }
    }

    writeVal(obj);
    chunks.push(Buffer.from([0x2e])); // STOP
    return Buffer.concat(chunks);
  }
}

/**
 * Lightweight pure-TS ZIP extractor & builder for Ren'Py .save files
 */
class ZipContainer {
  static extractLog(buf: Buffer): Buffer {
    let pos = 0;
    while (pos < buf.length - 30) {
      if (buf.readUInt32LE(pos) === 0x04034b50) {
        // Local file header
        const compressionMethod = buf.readUInt16LE(pos + 8);
        const compressedSize = buf.readUInt32LE(pos + 18);
        const fileNameLen = buf.readUInt16LE(pos + 26);
        const extraLen = buf.readUInt16LE(pos + 28);
        const fileName = buf.subarray(pos + 30, pos + 30 + fileNameLen).toString('utf8');
        const dataOffset = pos + 30 + fileNameLen + extraLen;
        const compressedData = buf.subarray(dataOffset, dataOffset + compressedSize);

        if (fileName === 'log') {
          if (compressionMethod === 8) {
            return zlib.inflateRawSync(compressedData);
          } else if (compressionMethod === 0) {
            return Buffer.from(compressedData);
          }
          throw new SaveCodecError(
            `Unsupported ZIP compression method: ${compressionMethod}`,
            'DECOMPRESSION_FAILED'
          );
        }

        pos = dataOffset + compressedSize;
      } else {
        pos++;
      }
    }

    throw new SaveCodecError('Ren\'Py save zip does not contain "log" entry', 'PARSE_FAILED');
  }

  static createZipWithLog(logData: Buffer): Buffer {
    const fileName = 'log';
    const fileNameBuf = Buffer.from(fileName, 'utf8');
    const compressedLog = zlib.deflateRawSync(logData);
    const uncompressedSize = logData.length;
    const compressedSize = compressedLog.length;
    const fileCrc = crc32(logData);

    // 1. Local Header
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // Signature
    localHeader.writeUInt16LE(20, 4); // Min version (2.0)
    localHeader.writeUInt16LE(0, 6); // Flags
    localHeader.writeUInt16LE(8, 8); // Compression (Deflate)
    localHeader.writeUInt16LE(0, 10); // Mod time
    localHeader.writeUInt16LE(0, 12); // Mod date
    localHeader.writeUInt32LE(fileCrc, 14); // CRC32
    localHeader.writeUInt32LE(compressedSize, 18); // Compressed size
    localHeader.writeUInt32LE(uncompressedSize, 22); // Uncompressed size
    localHeader.writeUInt16LE(fileNameBuf.length, 26); // Filename length
    localHeader.writeUInt16LE(0, 28); // Extra len

    const localOffset = 0;

    // 2. Central Directory Header
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0); // Signature
    centralHeader.writeUInt16LE(20, 4); // Version made by
    centralHeader.writeUInt16LE(20, 6); // Version needed
    centralHeader.writeUInt16LE(0, 8); // Flags
    centralHeader.writeUInt16LE(8, 10); // Compression (Deflate)
    centralHeader.writeUInt16LE(0, 12); // Mod time
    centralHeader.writeUInt16LE(0, 14); // Mod date
    centralHeader.writeUInt32LE(fileCrc, 16); // CRC32
    centralHeader.writeUInt32LE(compressedSize, 20); // Compressed size
    centralHeader.writeUInt32LE(uncompressedSize, 24); // Uncompressed size
    centralHeader.writeUInt16LE(fileNameBuf.length, 28); // Filename length
    centralHeader.writeUInt16LE(0, 30); // Extra field len
    centralHeader.writeUInt16LE(0, 32); // Comment len
    centralHeader.writeUInt16LE(0, 34); // Disk start
    centralHeader.writeUInt16LE(0, 36); // Internal attr
    centralHeader.writeUInt32LE(0, 38); // External attr
    centralHeader.writeUInt32LE(localOffset, 42); // Relative offset

    const centralDirOffset = localHeader.length + fileNameBuf.length + compressedLog.length;
    const centralDirSize = centralHeader.length + fileNameBuf.length;

    // 3. End of Central Directory Record
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0); // Signature
    eocd.writeUInt16LE(0, 4); // Disk num
    eocd.writeUInt16LE(0, 6); // Central dir disk
    eocd.writeUInt16LE(1, 8); // Entries on this disk
    eocd.writeUInt16LE(1, 10); // Total entries
    eocd.writeUInt32LE(centralDirSize, 12); // Central dir size
    eocd.writeUInt32LE(centralDirOffset, 16); // Central dir offset
    eocd.writeUInt16LE(0, 20); // Comment len

    return Buffer.concat([
      localHeader,
      fileNameBuf,
      compressedLog,
      centralHeader,
      fileNameBuf,
      eocd,
    ]);
  }
}

export class RenpyPickleSaveCodec {
  static decode(rawData: Buffer): any {
    if (!rawData || rawData.length === 0) {
      throw new SaveCodecError('Ren\'Py save file is empty', 'PARSE_FAILED');
    }

    let pickleBuf: Buffer;

    // Check if buffer is a ZIP container
    if (rawData.length >= 4 && rawData.readUInt32LE(0) === 0x04034b50) {
      try {
        pickleBuf = ZipContainer.extractLog(rawData);
      } catch (err: any) {
        if (err instanceof SaveCodecError) throw err;
        throw new SaveCodecError(
          `Failed to extract Ren'Py save zip container: ${err.message}`,
          'DECOMPRESSION_FAILED'
        );
      }
    } else {
      pickleBuf = rawData;
    }

    const state = SandboxedPickleParser.parse(pickleBuf);

    // Extract store variables
    const variables: Record<string, any> = createSafeDict();
    let roots = state;

    if (Array.isArray(state) && state.length > 0) {
      roots = state[0];
    }

    if (roots && typeof roots === 'object') {
      for (const [k, v] of Object.entries(roots)) {
        if (!isDangerousKey(k)) {
          variables[k] = sanitizeDeep(v);
        }
      }
    }

    variables.$type = 'RenpySave';
    return sanitizeDeep(variables);
  }

  static encode(jsonData: any, wrapInZip = true): Buffer {
    const cleanData = sanitizeDeep(jsonData);
    if (cleanData && typeof cleanData === 'object') {
      delete cleanData.$type;
      delete cleanData._userMappings;
    }

    // Ren'Py log is formatted as a tuple containing the store dict as element 0
    const logState = [cleanData];
    const pickleLog = SandboxedPickleParser.serialize(logState);

    if (wrapInZip) {
      return ZipContainer.createZipWithLog(pickleLog);
    }

    return pickleLog;
  }
}
