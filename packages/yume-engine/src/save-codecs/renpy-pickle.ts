import * as zlib from 'node:zlib';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { SaveCodecError } from './errors.js';
import { createSafeDict, isDangerousKey, sanitizeDeep } from './sanitize.js';
import {
  StalenessTracker,
  StalenessError,
  defaultStalenessErrorMessage,
  type StalenessTrackerOptions,
} from '../utils/staleness-tracker.js';
import type { SaveCodecContext, CodecProgressUpdate } from '../types.js';

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

function safeString(val: any): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'symbol') return val.toString();
  if (typeof val === 'object') {
    try {
      if (typeof val.toString === 'function') {
        return val.toString();
      }
    } catch {}
    return '';
  }
  try {
    return String(val);
  } catch {
    return '';
  }
}

export class PickleGlobal {
  constructor(public readonly module: string, public readonly name: string) {}

  toString(): string {
    return `<Global ${this.module}.${this.name}>`;
  }
}

export class PickleInstance {
  public state: any = null;
  public dict: Record<string, any> = createSafeDict();
  public slots: Record<string, any> = createSafeDict();

  constructor(
    public readonly cls: any,
    public readonly args: any[] = [],
    public readonly kwargs?: Record<string, any>
  ) {}

  toString(): string {
    const clsName =
      this.cls instanceof PickleGlobal ? `${this.cls.module}.${this.cls.name}` : safeString(this.cls);
    return `<Instance ${clsName}>`;
  }
}

export interface PickleFrameInfo {
  headerPos: number;
  lenPos: number;
  payloadStart: number;
  payloadEnd: number;
  origLen: number;
  delta: number;
}

export interface RootsScanResult {
  rootsOffsets: Map<
    string,
    {
      key: string;
      valStart: number;
      valEnd: number;
      hadMemoize: boolean;
      oldVal: any;
    }
  >;
  setitemsPos: number;
  frames: PickleFrameInfo[];
  frameLenPos: number;
  frame0Len: number;
}

export interface SandboxedPickleParserOptions {
  earlyExit?: boolean;
  earlyExitRoots?: boolean;
  stalenessTimeoutMs?: number;
  stalenessTracker?: StalenessTracker;
  maxIterations?: number;
  onProgress?: (progress: CodecProgressUpdate) => void;
  shouldCancel?: () => boolean;
}

interface ParserInternalState {
  stack: any[];
  memo: Record<number, any>;
  memoCounter: number;
  pos: number;
  iterations: number;
  rootsMark: number;
  tracker: StalenessTracker | null;
  done: boolean;
  result: any;
}

function isPickleDict(target: any): boolean {
  if (!target || typeof target !== 'object' || target === MARK) return false;
  if (
    Array.isArray(target) ||
    target instanceof Set ||
    target instanceof PickleGlobal ||
    target instanceof PickleInstance ||
    (typeof Buffer !== 'undefined' && Buffer.isBuffer(target))
  ) {
    return false;
  }
  const proto = Object.getPrototypeOf(target);
  return proto === null || proto === Object.prototype;
}

export class SandboxedPickleParser {
  private static _stepChunk(
    buf: Buffer,
    state: ParserInternalState,
    options: SandboxedPickleParserOptions | undefined,
    maxSteps: number
  ): void {
    const stack = state.stack;
    const memo = state.memo;
    let memoCounter = state.memoCounter;
    let pos = state.pos;
    let iterations = state.iterations;
    let rootsMark = state.rootsMark;
    const tracker = state.tracker;
    const earlyExit = Boolean(options?.earlyExit ?? options?.earlyExitRoots);
    const maxIterations = options?.maxIterations ?? Infinity;

    let steps = 0;
    while (pos < buf.length && steps < maxSteps) {
      steps++;
      iterations++;

      if ((steps % 500 === 0 || steps === 1) && options?.shouldCancel?.()) {
        throw new SaveCodecError('Parsing cancelled by user', 'PARSE_FAILED');
      }

      if (tracker && (iterations % 1000 === 0 || (tracker.timeoutMs !== undefined && tracker.timeoutMs <= 0))) {
        tracker.update(pos);
      }

      if (iterations > maxIterations) {
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
          pos += 8;
          break;
        }

        // STOP (0x2E, '.')
        case 0x2e: {
          if (stack.length === 0) {
            throw new SaveCodecError('Empty stack at pickle STOP opcode', 'PARSE_FAILED');
          }
          state.done = true;
          state.result = stack.pop();
          state.pos = pos;
          state.iterations = iterations;
          state.memoCounter = memoCounter;
          state.rootsMark = rootsMark;
          return;
        }

        // MARK (0x28, '(')
        case 0x28: {
          if (
            rootsMark === -1 &&
            stack.length > 0 &&
            isPickleDict(stack[stack.length - 1])
          ) {
            rootsMark = stack.length;
          }
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

        // PERSID (0x50, 'P')
        case 0x50: {
          let end = pos;
          while (end < buf.length && buf[end] !== 0x0a) end++;
          const pid = buf.subarray(pos, end).toString('latin1').trim();
          pos = end + 1;
          stack.push({ $persid: pid });
          break;
        }

        // BINPERSID (0x51, 'Q')
        case 0x51: {
          const pid = stack.pop();
          stack.push({ $persid: pid });
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

        // BINUNICODE8 (0x8D)
        case 0x8d: {
          const len = Number(buf.readBigUInt64LE(pos));
          pos += 8;
          const str = buf.subarray(pos, pos + len).toString('utf8');
          pos += len;
          stack.push(str);
          break;
        }

        // BINBYTES8 (0x8E)
        case 0x8e: {
          const len = Number(buf.readBigUInt64LE(pos));
          pos += 8;
          const bytes = buf.subarray(pos, pos + len);
          pos += len;
          stack.push(bytes);
          break;
        }

        // BYTEARRAY8 (0x96)
        case 0x96: {
          const len = Number(buf.readBigUInt64LE(pos));
          pos += 8;
          const bytes = buf.subarray(pos, pos + len);
          pos += len;
          stack.push(bytes);
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
            const k = safeString(items[i]);
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
          const key = safeString(stack.pop());
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
          const isRootsSetItems = rootsMark !== -1 && stack.length === rootsMark + 1;
          if (stack.length > 0 && stack[stack.length - 1] === MARK) {
            stack.pop();
          }
          const dict = stack[stack.length - 1];
          if (dict && typeof dict === 'object') {
            for (let i = 0; i < items.length; i += 2) {
              const k = safeString(items[i]);
              const v = items[i + 1];
              if (!isDangerousKey(k)) {
                dict[k] = v;
              }
            }
          }
          if (earlyExit && isRootsSetItems && isPickleDict(dict)) {
            let nextPos = pos;
            while (nextPos + 9 <= buf.length && buf[nextPos] === 0x95) {
              nextPos += 9;
            }
            if (nextPos < buf.length && buf[nextPos] === 0x28) {
              // Multi-batch root dictionary, continue to next batch
              break;
            }
            state.done = true;
            state.result = dict;
            state.pos = pos;
            state.iterations = iterations;
            state.memoCounter = memoCounter;
            state.rootsMark = rootsMark;
            return;
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

        // GLOBAL (0x63, 'c')
        case 0x63: {
          let end1 = pos;
          while (end1 < buf.length && buf[end1] !== 0x0a) end1++;
          const mod = buf.subarray(pos, end1).toString('latin1').trim();
          pos = end1 + 1;
          let end2 = pos;
          while (end2 < buf.length && buf[end2] !== 0x0a) end2++;
          const name = buf.subarray(pos, end2).toString('latin1').trim();
          pos = end2 + 1;
          if (mod === 'renpy.rollback' && name === 'deleted') {
            stack.push({ $renpy_deleted: true });
          } else {
            stack.push(new PickleGlobal(mod, name));
          }
          break;
        }

        // STACK_GLOBAL (0x93)
        case 0x93: {
          if (stack.length < 2) {
            throw new SaveCodecError('Stack underflow on STACK_GLOBAL', 'PARSE_FAILED');
          }
          const rawName = stack.pop();
          const rawMod = stack.pop();
          const name = safeString(rawName);
          const mod = safeString(rawMod);
          if (mod === 'renpy.rollback' && name === 'deleted') {
            stack.push({ $renpy_deleted: true });
          } else {
            stack.push(new PickleGlobal(mod, name));
          }
          break;
        }

        // NEWOBJ (0x81)
        case 0x81: {
          if (stack.length < 2) {
            throw new SaveCodecError('Stack underflow on NEWOBJ', 'PARSE_FAILED');
          }
          const args = stack.pop();
          const cls = stack.pop();
          if (cls instanceof PickleGlobal) {
            if (cls.name === 'RevertableList' || cls.name === 'list') {
              stack.push([]);
            } else if (cls.name === 'RevertableDict' || cls.name === 'dict') {
              stack.push(createSafeDict());
            } else if (cls.name === 'RevertableSet' || cls.name === 'set') {
              stack.push(new Set());
            } else if (cls.module === 'renpy.rollback' && cls.name === 'deleted') {
              stack.push({ $renpy_deleted: true });
            } else {
              stack.push(new PickleInstance(cls, Array.isArray(args) ? args : [args]));
            }
          } else {
            stack.push(new PickleInstance(cls, Array.isArray(args) ? args : [args]));
          }
          break;
        }

        // NEWOBJ_EX (0x92)
        case 0x92: {
          if (stack.length < 3) {
            throw new SaveCodecError('Stack underflow on NEWOBJ_EX', 'PARSE_FAILED');
          }
          const kwargs = stack.pop();
          const args = stack.pop();
          const cls = stack.pop();
          if (cls instanceof PickleGlobal) {
            if (cls.name === 'RevertableList' || cls.name === 'list') {
              stack.push([]);
            } else if (cls.name === 'RevertableDict' || cls.name === 'dict') {
              stack.push(createSafeDict());
            } else if (cls.name === 'RevertableSet' || cls.name === 'set') {
              stack.push(new Set());
            } else if (cls.module === 'renpy.rollback' && cls.name === 'deleted') {
              stack.push({ $renpy_deleted: true });
            } else {
              stack.push(new PickleInstance(cls, Array.isArray(args) ? args : [args], kwargs));
            }
          } else {
            stack.push(new PickleInstance(cls, Array.isArray(args) ? args : [args], kwargs));
          }
          break;
        }

        // REDUCE (0x52, 'R')
        case 0x52: {
          if (stack.length < 2) {
            throw new SaveCodecError('Stack underflow on REDUCE', 'PARSE_FAILED');
          }
          const args = stack.pop();
          const callable = stack.pop();
          if (callable instanceof PickleGlobal) {
            if (callable.name === 'RevertableList' || callable.name === 'list') {
              stack.push(Array.isArray(args) && Array.isArray(args[0]) ? [...args[0]] : []);
            } else if (callable.name === 'RevertableDict' || callable.name === 'dict') {
              stack.push(createSafeDict());
            } else if (callable.name === 'RevertableSet' || callable.name === 'set') {
              stack.push(new Set(Array.isArray(args) && Array.isArray(args[0]) ? args[0] : []));
            } else if (callable.module === 'renpy.rollback' && callable.name === 'deleted') {
              stack.push({ $renpy_deleted: true });
            } else {
              stack.push(new PickleInstance(callable, Array.isArray(args) ? args : [args]));
            }
          } else {
            stack.push(new PickleInstance(callable, Array.isArray(args) ? args : [args]));
          }
          break;
        }

        // BUILD (0x62, 'b')
        case 0x62: {
          if (stack.length < 2) {
            throw new SaveCodecError('Stack underflow on BUILD', 'PARSE_FAILED');
          }
          const state = stack.pop();
          const inst = stack[stack.length - 1];
          if (inst instanceof Set) {
            if (Array.isArray(state)) {
              for (const item of state) {
                if (
                  item &&
                  typeof item === 'object' &&
                  !(item instanceof Set) &&
                  !Array.isArray(item)
                ) {
                  for (const k of Object.keys(item)) {
                    if (!isDangerousKey(k)) inst.add(k);
                  }
                } else {
                  inst.add(item);
                }
              }
            } else if (state && typeof state === 'object') {
              for (const k of Object.keys(state)) {
                if (!isDangerousKey(k)) inst.add(k);
              }
            }
          } else if (Array.isArray(inst)) {
            if (Array.isArray(state)) {
              inst.push(...state);
            }
          } else if (inst instanceof PickleInstance) {
            inst.state = state;
            if (state && typeof state === 'object' && !Array.isArray(state)) {
              for (const [k, v] of Object.entries(state)) {
                if (!isDangerousKey(k)) inst.dict[k] = v;
              }
            } else if (Array.isArray(state)) {
              if (state[0] && typeof state[0] === 'object' && !Array.isArray(state[0])) {
                for (const [k, v] of Object.entries(state[0])) {
                  if (!isDangerousKey(k)) inst.dict[k] = v;
                }
              }
              if (state[1] && typeof state[1] === 'object' && !Array.isArray(state[1])) {
                for (const [k, v] of Object.entries(state[1])) {
                  if (!isDangerousKey(k)) inst.slots[k] = v;
                }
              }
            }
          } else if (inst && typeof inst === 'object') {
            if (state && typeof state === 'object' && !Array.isArray(state)) {
              for (const [k, v] of Object.entries(state)) {
                if (!isDangerousKey(k)) inst[k] = v;
              }
            }
          }
          break;
        }

        // INST (0x69, 'i')
        case 0x69: {
          let end1 = pos;
          while (end1 < buf.length && buf[end1] !== 0x0a) end1++;
          const mod = buf.subarray(pos, end1).toString('latin1').trim();
          pos = end1 + 1;
          let end2 = pos;
          while (end2 < buf.length && buf[end2] !== 0x0a) end2++;
          const name = buf.subarray(pos, end2).toString('latin1').trim();
          pos = end2 + 1;
          const items: any[] = [];
          while (stack.length > 0 && stack[stack.length - 1] !== MARK) {
            items.unshift(stack.pop());
          }
          if (stack.length > 0 && stack[stack.length - 1] === MARK) {
            stack.pop();
          }
          stack.push(new PickleInstance(new PickleGlobal(mod, name), items));
          break;
        }

        // OBJ (0x6F, 'o')
        case 0x6f: {
          const items: any[] = [];
          while (stack.length > 0 && stack[stack.length - 1] !== MARK) {
            items.unshift(stack.pop());
          }
          if (stack.length > 0 && stack[stack.length - 1] === MARK) {
            stack.pop();
          }
          const cls = items.shift();
          stack.push(new PickleInstance(cls, items));
          break;
        }

        // EXTENSION OPCODES
        case 0x82:
        case 0x83:
        case 0x84:
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

    state.pos = pos;
    state.iterations = iterations;
    state.memoCounter = memoCounter;
    state.rootsMark = rootsMark;

    if (pos >= buf.length && !state.done) {
      throw new SaveCodecError('Unexpected end of pickle buffer without STOP opcode', 'PARSE_FAILED');
    }
  }

  static parse(buf: Buffer, options?: SandboxedPickleParserOptions): any {
    const tracker =
      options?.stalenessTracker ??
      (options?.stalenessTimeoutMs !== undefined
        ? new StalenessTracker({
            timeoutMs: options.stalenessTimeoutMs,
            operationName: 'Pickle parser',
            errorFactory: (timeoutMs, operationName, unit) =>
              new SaveCodecError(defaultStalenessErrorMessage(timeoutMs, operationName, unit), 'PARSE_FAILED'),
          })
        : null);

    const state: ParserInternalState = {
      stack: [],
      memo: Object.create(null),
      memoCounter: 0,
      pos: 0,
      iterations: 0,
      rootsMark: -1,
      tracker,
      done: false,
      result: undefined,
    };

    while (!state.done) {
      try {
        SandboxedPickleParser._stepChunk(buf, state, options, 100000);
      } catch (err: any) {
        if (err instanceof SaveCodecError) throw err;
        if (err instanceof StalenessError) {
          throw new SaveCodecError(err.message, 'PARSE_FAILED');
        }
        if (err instanceof RangeError || err.name === 'RangeError') {
          throw new SaveCodecError(
            `Corrupted or truncated pickle buffer: ${err.message}`,
            'PARSE_FAILED'
          );
        }
        throw err;
      }
    }

    return state.result;
  }

  static async parseAsync(buf: Buffer, options?: SandboxedPickleParserOptions): Promise<any> {
    const tracker =
      options?.stalenessTracker ??
      (options?.stalenessTimeoutMs !== undefined
        ? new StalenessTracker({
            timeoutMs: options.stalenessTimeoutMs,
            operationName: 'Pickle parser',
            errorFactory: (timeoutMs, operationName, unit) =>
              new SaveCodecError(defaultStalenessErrorMessage(timeoutMs, operationName, unit), 'PARSE_FAILED'),
          })
        : null);

    const state: ParserInternalState = {
      stack: [],
      memo: Object.create(null),
      memoCounter: 0,
      pos: 0,
      iterations: 0,
      rootsMark: -1,
      tracker,
      done: false,
      result: undefined,
    };

    while (!state.done) {
      try {
        tracker?.update(state.pos);
        SandboxedPickleParser._stepChunk(buf, state, options, 5000);
      } catch (err: any) {
        if (err instanceof SaveCodecError) throw err;
        if (err instanceof StalenessError) {
          throw new SaveCodecError(err.message, 'PARSE_FAILED');
        }
        if (err instanceof RangeError || err.name === 'RangeError') {
          throw new SaveCodecError(
            `Corrupted or truncated pickle buffer: ${err.message}`,
            'PARSE_FAILED'
          );
        }
        throw err;
      }
      if (options?.shouldCancel?.()) {
        throw new SaveCodecError('Parsing cancelled by user', 'PARSE_FAILED');
      }

      options?.onProgress?.({
        current: state.pos,
        total: buf.length,
        percent: buf.length > 0 ? Math.min(100, Math.round((state.pos / buf.length) * 100)) : 100,
        unit: 'bytes',
        pos: state.pos,
        totalBytes: buf.length,
        iterations: state.iterations,
      });

      if (state.done) break;

      await new Promise((resolve) => setImmediate(resolve));
    }

    return state.result;
  }

  static scanRootsOffsets(buf: Buffer): RootsScanResult {
    try {
      const stack: any[] = [];
      const memo: Record<number, any> = Object.create(null);
      let memoCounter = 0;
      let pos = 0;
      let rootsMark = -1;
      const rootsOffsets = new Map<
        string,
        {
          key: string;
          valStart: number;
          valEnd: number;
          hadMemoize: boolean;
          oldVal: any;
        }
      >();
      let setitemsPos = -1;
      let currentKey: string | null = null;
      let currentValStart = -1;
      const frames: PickleFrameInfo[] = [];

      while (pos < buf.length) {
        const opPos = pos;
        const op = buf[pos++];

        switch (op) {
          case 0x80: {
            pos++;
            break;
          }
          case 0x95: {
            if (pos + 8 > buf.length) {
              throw new SaveCodecError('Truncated pickle frame header', 'PARSE_FAILED');
            }
            const fOpPos = opPos;
            const fLen = Number(buf.readBigUInt64LE(pos));
            frames.push({
              headerPos: fOpPos,
              lenPos: pos,
              payloadStart: pos + 8,
              payloadEnd: pos + 8 + fLen,
              origLen: fLen,
              delta: 0,
            });
            pos += 8;
            break;
          }
          case 0x2e: {
            return {
              rootsOffsets,
              setitemsPos,
              frames,
              frameLenPos: frames[0]?.lenPos ?? -1,
              frame0Len: frames[0]?.origLen ?? 0,
            };
          }
          case 0x28: {
            if (
              rootsMark === -1 &&
              stack.length > 0 &&
              isPickleDict(stack[stack.length - 1])
            ) {
              rootsMark = stack.length;
            }
            stack.push(MARK);
            break;
          }
        case 0x30: {
          stack.pop();
          break;
        }
        case 0x31: {
          while (stack.length > 0 && stack[stack.length - 1] !== MARK) stack.pop();
          if (stack.length > 0 && stack[stack.length - 1] === MARK) stack.pop();
          break;
        }
        case 0x32: {
          stack.push(stack[stack.length - 1]);
          break;
        }
        case 0x4e: {
          stack.push(null);
          break;
        }
        case 0x88: {
          stack.push(true);
          break;
        }
        case 0x89: {
          stack.push(false);
          break;
        }
        case 0x49: {
          let end = pos;
          while (end < buf.length && buf[end] !== 0x0a) end++;
          const str = buf.subarray(pos, end).toString('latin1').trim();
          pos = end + 1;
          if (str === '01') stack.push(true);
          else if (str === '00') stack.push(false);
          else stack.push(parseInt(str, 10));
          break;
        }
        case 0x4a: {
          stack.push(buf.readInt32LE(pos));
          pos += 4;
          break;
        }
        case 0x4b: {
          stack.push(buf.readUInt8(pos++));
          break;
        }
        case 0x4d: {
          stack.push(buf.readUInt16LE(pos));
          pos += 2;
          break;
        }
        case 0x4c: {
          let end = pos;
          while (end < buf.length && buf[end] !== 0x0a) end++;
          let str = buf.subarray(pos, end).toString('latin1').trim();
          if (str.endsWith('L')) str = str.slice(0, -1);
          pos = end + 1;
          stack.push(Number(str) || 0);
          break;
        }
        case 0x8a: {
          const len = buf.readUInt8(pos++);
          if (len === 0) {
            stack.push(0);
            break;
          }
          const raw = buf.subarray(pos, pos + len);
          pos += len;
          let val = 0;
          for (let i = 0; i < Math.min(len, 6); i++) val += raw[i] * Math.pow(256, i);
          stack.push(val);
          break;
        }
        case 0x8b: {
          const len = buf.readUInt32LE(pos);
          pos += 4;
          const raw = buf.subarray(pos, pos + len);
          pos += len;
          let val = 0;
          for (let i = 0; i < Math.min(len, 6); i++) val += raw[i] * Math.pow(256, i);
          stack.push(val);
          break;
        }
        case 0x46: {
          let end = pos;
          while (end < buf.length && buf[end] !== 0x0a) end++;
          stack.push(parseFloat(buf.subarray(pos, end).toString('latin1').trim()));
          pos = end + 1;
          break;
        }
        case 0x47: {
          stack.push(buf.readDoubleBE(pos));
          pos += 8;
          break;
        }
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
        case 0x54: {
          const len = buf.readUInt32LE(pos);
          pos += 4;
          stack.push(buf.subarray(pos, pos + len).toString('latin1'));
          pos += len;
          break;
        }
        case 0x55: {
          const len = buf.readUInt8(pos++);
          stack.push(buf.subarray(pos, pos + len).toString('latin1'));
          pos += len;
          break;
        }
        case 0x50: {
          let end = pos;
          while (end < buf.length && buf[end] !== 0x0a) end++;
          const pid = buf.subarray(pos, end).toString('latin1').trim();
          pos = end + 1;
          stack.push({ $persid: pid });
          break;
        }
        case 0x51: {
          const pid = stack.pop();
          stack.push({ $persid: pid });
          break;
        }
        case 0x56: {
          let end = pos;
          while (end < buf.length && buf[end] !== 0x0a) end++;
          stack.push(buf.subarray(pos, end).toString('utf8'));
          pos = end + 1;
          break;
        }
        case 0x58: {
          const len = buf.readUInt32LE(pos);
          pos += 4;
          stack.push(buf.subarray(pos, pos + len).toString('utf8'));
          pos += len;
          break;
        }
        case 0x8c: {
          const len = buf.readUInt8(pos++);
          stack.push(buf.subarray(pos, pos + len).toString('utf8'));
          pos += len;
          break;
        }
        case 0x8d: {
          const len = Number(buf.readBigUInt64LE(pos));
          pos += 8;
          stack.push(buf.subarray(pos, pos + len).toString('utf8'));
          pos += len;
          break;
        }
        case 0x8e: {
          const len = Number(buf.readBigUInt64LE(pos));
          pos += 8;
          stack.push(buf.subarray(pos, pos + len));
          pos += len;
          break;
        }
        case 0x96: {
          const len = Number(buf.readBigUInt64LE(pos));
          pos += 8;
          stack.push(buf.subarray(pos, pos + len));
          pos += len;
          break;
        }
        case 0x42: {
          const len = buf.readUInt32LE(pos);
          pos += 4;
          stack.push(buf.subarray(pos, pos + len));
          pos += len;
          break;
        }
        case 0x43: {
          const len = buf.readUInt8(pos++);
          stack.push(buf.subarray(pos, pos + len));
          pos += len;
          break;
        }
        case 0x5d: {
          stack.push([]);
          break;
        }
        case 0x6c: {
          const items: any[] = [];
          while (stack.length > 0 && stack[stack.length - 1] !== MARK) items.unshift(stack.pop());
          if (stack.length > 0 && stack[stack.length - 1] === MARK) stack.pop();
          stack.push(items);
          break;
        }
        case 0x61: {
          const item = stack.pop();
          const target = stack[stack.length - 1];
          if (Array.isArray(target)) target.push(item);
          break;
        }
        case 0x65: {
          const items: any[] = [];
          while (stack.length > 0 && stack[stack.length - 1] !== MARK) items.unshift(stack.pop());
          if (stack.length > 0 && stack[stack.length - 1] === MARK) stack.pop();
          const target = stack[stack.length - 1];
          if (Array.isArray(target)) target.push(...items);
          break;
        }
        case 0x7d: {
          stack.push(createSafeDict());
          break;
        }
        case 0x64: {
          const items: any[] = [];
          while (stack.length > 0 && stack[stack.length - 1] !== MARK) items.unshift(stack.pop());
          if (stack.length > 0 && stack[stack.length - 1] === MARK) stack.pop();
          const dict = createSafeDict();
          for (let i = 0; i < items.length; i += 2) {
            const k = safeString(items[i]);
            if (!isDangerousKey(k)) dict[k] = items[i + 1];
          }
          stack.push(dict);
          break;
        }
        case 0x73: {
          const v = stack.pop();
          const k = safeString(stack.pop());
          const d = stack[stack.length - 1];
          if (d && typeof d === 'object' && !isDangerousKey(k)) d[k] = v;
          break;
        }
        case 0x75: {
          const items: any[] = [];
          while (stack.length > 0 && stack[stack.length - 1] !== MARK) items.unshift(stack.pop());
          const isRootsSetItems = rootsMark !== -1 && stack.length === rootsMark + 1;
          if (stack.length > 0 && stack[stack.length - 1] === MARK) stack.pop();
          const d = stack[stack.length - 1];
          if (d && typeof d === 'object') {
            for (let i = 0; i < items.length; i += 2) {
              const k = safeString(items[i]);
              if (!isDangerousKey(k)) d[k] = items[i + 1];
            }
          }
          if (isRootsSetItems && isPickleDict(d)) {
            let nextPos = pos;
            while (nextPos + 9 <= buf.length && buf[nextPos] === 0x95) {
              nextPos += 9;
            }
            if (nextPos < buf.length && buf[nextPos] === 0x28) {
              break;
            }
            setitemsPos = opPos;
            while (pos < buf.length) {
              if (buf[pos] === 0x95) {
                if (pos + 9 > buf.length) {
                  throw new SaveCodecError('Truncated pickle frame header', 'PARSE_FAILED');
                }
                const fOpPos = pos;
                pos++;
                const fLen = Number(buf.readBigUInt64LE(pos));
                frames.push({
                  headerPos: fOpPos,
                  lenPos: pos,
                  payloadStart: pos + 8,
                  payloadEnd: pos + 8 + fLen,
                  origLen: fLen,
                  delta: 0,
                });
                pos += 8 + fLen;
              } else if (buf[pos] === 0x2e) {
                break;
              } else {
                pos++;
              }
            }
            return {
              rootsOffsets,
              setitemsPos,
              frames,
              frameLenPos: frames[0]?.lenPos ?? -1,
              frame0Len: frames[0]?.origLen ?? 0,
            };
          }
          break;
        }
        case 0x29: {
          stack.push([]);
          break;
        }
        case 0x74: {
          const items: any[] = [];
          while (stack.length > 0 && stack[stack.length - 1] !== MARK) items.unshift(stack.pop());
          if (stack.length > 0 && stack[stack.length - 1] === MARK) stack.pop();
          stack.push(items);
          break;
        }
        case 0x85: {
          stack.push([stack.pop()]);
          break;
        }
        case 0x86: {
          const b = stack.pop();
          const a = stack.pop();
          stack.push([a, b]);
          break;
        }
        case 0x87: {
          const c = stack.pop();
          const b = stack.pop();
          const a = stack.pop();
          stack.push([a, b, c]);
          break;
        }
        case 0x8f: {
          stack.push(new Set());
          break;
        }
        case 0x90: {
          const items: any[] = [];
          while (stack.length > 0 && stack[stack.length - 1] !== MARK) items.unshift(stack.pop());
          if (stack.length > 0 && stack[stack.length - 1] === MARK) stack.pop();
          const t = stack[stack.length - 1];
          if (t instanceof Set) for (const it of items) t.add(it);
          break;
        }
        case 0x91: {
          const items: any[] = [];
          while (stack.length > 0 && stack[stack.length - 1] !== MARK) items.unshift(stack.pop());
          if (stack.length > 0 && stack[stack.length - 1] === MARK) stack.pop();
          stack.push(new Set(items));
          break;
        }
        case 0x70: {
          let end = pos;
          while (end < buf.length && buf[end] !== 0x0a) end++;
          const idx = parseInt(buf.subarray(pos, end).toString('latin1'), 10);
          pos = end + 1;
          memo[idx] = stack[stack.length - 1];
          break;
        }
        case 0x71: {
          memo[buf.readUInt8(pos++)] = stack[stack.length - 1];
          break;
        }
        case 0x72: {
          memo[buf.readUInt32LE(pos)] = stack[stack.length - 1];
          pos += 4;
          break;
        }
        case 0x94: {
          memo[memoCounter++] = stack[stack.length - 1];
          break;
        }
        case 0x67: {
          let end = pos;
          while (end < buf.length && buf[end] !== 0x0a) end++;
          stack.push(memo[parseInt(buf.subarray(pos, end).toString('latin1'), 10)]);
          pos = end + 1;
          break;
        }
        case 0x68: {
          stack.push(memo[buf.readUInt8(pos++)]);
          break;
        }
        case 0x6a: {
          stack.push(memo[buf.readUInt32LE(pos)]);
          pos += 4;
          break;
        }
        case 0x63: {
          let end1 = pos;
          while (end1 < buf.length && buf[end1] !== 0x0a) end1++;
          const mod = buf.subarray(pos, end1).toString('latin1').trim();
          pos = end1 + 1;
          let end2 = pos;
          while (end2 < buf.length && buf[end2] !== 0x0a) end2++;
          const name = buf.subarray(pos, end2).toString('latin1').trim();
          pos = end2 + 1;
          stack.push(
            mod === 'renpy.rollback' && name === 'deleted'
              ? { $renpy_deleted: true }
              : new PickleGlobal(mod, name)
          );
          break;
        }
        case 0x93: {
          const rawName = stack.pop();
          const rawMod = stack.pop();
          const name = safeString(rawName);
          const mod = safeString(rawMod);
          stack.push(
            mod === 'renpy.rollback' && name === 'deleted'
              ? { $renpy_deleted: true }
              : new PickleGlobal(mod, name)
          );
          break;
        }
        case 0x81: {
          const a = stack.pop();
          const c = stack.pop();
          if (c instanceof PickleGlobal) {
            if (c.name === 'RevertableList' || c.name === 'list') stack.push([]);
            else if (c.name === 'RevertableDict' || c.name === 'dict') stack.push(createSafeDict());
            else if (c.name === 'RevertableSet' || c.name === 'set') stack.push(new Set());
            else if (c.module === 'renpy.rollback' && c.name === 'deleted')
              stack.push({ $renpy_deleted: true });
            else stack.push(new PickleInstance(c, Array.isArray(a) ? a : [a]));
          } else stack.push(new PickleInstance(c, Array.isArray(a) ? a : [a]));
          break;
        }
        case 0x92: {
          const kw = stack.pop();
          const a = stack.pop();
          const c = stack.pop();
          stack.push(new PickleInstance(c, Array.isArray(a) ? a : [a], kw));
          break;
        }
        case 0x52: {
          const a = stack.pop();
          const c = stack.pop();
          if (c instanceof PickleGlobal) {
            if (c.name === 'RevertableList' || c.name === 'list')
              stack.push(Array.isArray(a) && Array.isArray(a[0]) ? [...a[0]] : []);
            else if (c.name === 'RevertableDict' || c.name === 'dict') stack.push(createSafeDict());
            else if (c.name === 'RevertableSet' || c.name === 'set')
              stack.push(new Set(Array.isArray(a) && Array.isArray(a[0]) ? a[0] : []));
            else if (c.module === 'renpy.rollback' && c.name === 'deleted')
              stack.push({ $renpy_deleted: true });
            else stack.push(new PickleInstance(c, Array.isArray(a) ? a : [a]));
          } else stack.push(new PickleInstance(c, Array.isArray(a) ? a : [a]));
          break;
        }
        case 0x62: {
          const st = stack.pop();
          const inst = stack[stack.length - 1];
          if (inst instanceof Set) {
            if (Array.isArray(st)) {
              for (const it of st) {
                if (
                  it &&
                  typeof it === 'object' &&
                  !(it instanceof Set) &&
                  !Array.isArray(it)
                ) {
                  for (const k of Object.keys(it)) {
                    if (!isDangerousKey(k)) inst.add(k);
                  }
                } else inst.add(it);
              }
            } else if (st && typeof st === 'object') {
              for (const k of Object.keys(st)) {
                if (!isDangerousKey(k)) inst.add(k);
              }
            }
          } else if (Array.isArray(inst)) {
            if (Array.isArray(st)) inst.push(...st);
          } else if (inst instanceof PickleInstance) {
            inst.state = st;
            if (st && typeof st === 'object' && !Array.isArray(st)) {
              for (const [k, v] of Object.entries(st)) {
                if (!isDangerousKey(k)) inst.dict[k] = v;
              }
            }
          } else if (inst && typeof inst === 'object') {
            if (st && typeof st === 'object' && !Array.isArray(st)) {
              for (const [k, v] of Object.entries(st)) {
                if (!isDangerousKey(k)) inst[k] = v;
              }
            }
          }
          break;
        }
        case 0x69: {
          let end1 = pos;
          while (end1 < buf.length && buf[end1] !== 0x0a) end1++;
          const mod = buf.subarray(pos, end1).toString('latin1').trim();
          pos = end1 + 1;
          let end2 = pos;
          while (end2 < buf.length && buf[end2] !== 0x0a) end2++;
          const name = buf.subarray(pos, end2).toString('latin1').trim();
          pos = end2 + 1;
          const items: any[] = [];
          while (stack.length > 0 && stack[stack.length - 1] !== MARK) items.unshift(stack.pop());
          if (stack.length > 0 && stack[stack.length - 1] === MARK) stack.pop();
          stack.push(new PickleInstance(new PickleGlobal(mod, name), items));
          break;
        }
        case 0x6f: {
          const items: any[] = [];
          while (stack.length > 0 && stack[stack.length - 1] !== MARK) items.unshift(stack.pop());
          if (stack.length > 0 && stack[stack.length - 1] === MARK) stack.pop();
          const cls = items.shift();
          stack.push(new PickleInstance(cls, items));
          break;
        }
        default:
          break;
      }

      // Check if we are directly inside roots dict (not inside a nested MARK)
      if (rootsMark !== -1 && setitemsPos === -1 && stack.lastIndexOf(MARK) === rootsMark) {
        let hadMemoize = false;
        if (pos < buf.length && buf[pos] === 0x94) {
          memo[memoCounter++] = stack[stack.length - 1];
          pos++;
          hadMemoize = true;
        }

        const itemsAboveMark = stack.length - 1 - rootsMark;
        if (itemsAboveMark > 0) {
          if (itemsAboveMark % 2 === 1) {
            const top = stack[stack.length - 1];
            currentKey =
              typeof top === 'string'
                ? top
                : top !== null && top !== undefined && typeof top !== 'object'
                  ? safeString(top)
                  : null;
            currentValStart = pos;
          } else {
            const val = stack[stack.length - 1];
            if (currentKey && !rootsOffsets.has(currentKey)) {
              rootsOffsets.set(currentKey, {
                key: currentKey,
                valStart: currentValStart,
                valEnd: pos,
                hadMemoize,
                oldVal: val,
              });
            }
          }
        }
      }
    }

      return {
        rootsOffsets,
        setitemsPos,
        frames,
        frameLenPos: frames[0]?.lenPos ?? -1,
        frame0Len: frames[0]?.origLen ?? 0,
      };
    } catch (err: any) {
      if (err instanceof SaveCodecError) throw err;
      throw new SaveCodecError(
        `Corrupted or truncated pickle buffer: ${err.message}`,
        'PARSE_FAILED'
      );
    }
  }

  static serializePrimitiveValue(val: any, hadMemoize = false, protoVer = 4): Buffer {
    const chunks: Buffer[] = [];
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
      const sBuf = Buffer.from(val, 'utf8');
      if (sBuf.length <= 255 && protoVer >= 4) {
        chunks.push(Buffer.concat([Buffer.from([0x8c, sBuf.length]), sBuf]));
      } else {
        const lb = Buffer.alloc(5);
        lb[0] = 0x58;
        lb.writeUInt32LE(sBuf.length, 1);
        chunks.push(Buffer.concat([lb, sBuf]));
      }
    } else {
      chunks.push(SandboxedPickleParser.serialize(val).subarray(2, -1));
    }

    if (hadMemoize) {
      chunks.push(Buffer.from([0x94])); // MEMOIZE
    }

    return Buffer.concat(chunks);
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
        const lenBuf = Buffer.alloc(5);
        lenBuf[0] = 0x58; // BINUNICODE (protocol 1+ universal)
        lenBuf.writeUInt32LE(strBuf.length, 1);
        chunks.push(lenBuf);
        chunks.push(strBuf);
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

export interface ZipEntry {
  fileName: string;
  data: Buffer;
  compressionMethod: number;
}

/**
 * Pure-TS Multi-Entry ZIP extractor & builder for Ren'Py .save files
 */
export class ZipContainer {
  static extractEntries(buf: Buffer): ZipEntry[] {
    const entries: ZipEntry[] = [];
    if (!buf || buf.length < 22) {
      throw new SaveCodecError('Buffer too small to be a ZIP container', 'PARSE_FAILED');
    }

    // 1. Try Central Directory via EOCD
    let eocdPos = -1;
    const minSearch = Math.max(0, buf.length - 65557);
    for (let p = buf.length - 22; p >= minSearch; p--) {
      if (buf.readUInt32LE(p) === 0x06054b50) {
        eocdPos = p;
        break;
      }
    }

    if (eocdPos !== -1) {
      const cdOffset = buf.readUInt32LE(eocdPos + 16);
      const cdCount = buf.readUInt16LE(eocdPos + 10);
      let cdPos = cdOffset;

      for (let i = 0; i < cdCount && cdPos < eocdPos; i++) {
        if (buf.readUInt32LE(cdPos) !== 0x02014b50) break;
        const compressionMethod = buf.readUInt16LE(cdPos + 10);
        const compressedSize = buf.readUInt32LE(cdPos + 20);
        const fileNameLen = buf.readUInt16LE(cdPos + 28);
        const extraLen = buf.readUInt16LE(cdPos + 30);
        const commentLen = buf.readUInt16LE(cdPos + 32);
        const localOffset = buf.readUInt32LE(cdPos + 42);
        const fileName = buf.subarray(cdPos + 46, cdPos + 46 + fileNameLen).toString('utf8');

        if (localOffset + 30 <= buf.length && buf.readUInt32LE(localOffset) === 0x04034b50) {
          const localFileNameLen = buf.readUInt16LE(localOffset + 26);
          const localExtraLen = buf.readUInt16LE(localOffset + 28);
          const dataOffset = localOffset + 30 + localFileNameLen + localExtraLen;
          const compressedData = buf.subarray(dataOffset, dataOffset + compressedSize);

          let uncompressedData: Buffer;
          if (compressionMethod === 8) {
            uncompressedData =
              compressedSize > 0 ? zlib.inflateRawSync(compressedData) : Buffer.alloc(0);
          } else if (compressionMethod === 0) {
            uncompressedData = Buffer.from(compressedData);
          } else {
            throw new SaveCodecError(
              `Unsupported ZIP compression method: ${compressionMethod} for entry ${fileName}`,
              'DECOMPRESSION_FAILED'
            );
          }

          entries.push({ fileName, data: uncompressedData, compressionMethod });
        }

        cdPos += 46 + fileNameLen + extraLen + commentLen;
      }

      if (entries.length > 0) return entries;
    }

    // 2. Fallback: sequential scan of local headers
    let pos = 0;
    while (pos < buf.length - 30) {
      if (buf.readUInt32LE(pos) === 0x04034b50) {
        const compressionMethod = buf.readUInt16LE(pos + 8);
        const compressedSize = buf.readUInt32LE(pos + 18);
        const fileNameLen = buf.readUInt16LE(pos + 26);
        const extraLen = buf.readUInt16LE(pos + 28);
        const fileName = buf.subarray(pos + 30, pos + 30 + fileNameLen).toString('utf8');
        const dataOffset = pos + 30 + fileNameLen + extraLen;
        const compressedData = buf.subarray(dataOffset, dataOffset + compressedSize);

        let uncompressedData: Buffer;
        if (compressionMethod === 8) {
          uncompressedData =
            compressedSize > 0 ? zlib.inflateRawSync(compressedData) : Buffer.alloc(0);
        } else if (compressionMethod === 0) {
          uncompressedData = Buffer.from(compressedData);
        } else {
          throw new SaveCodecError(
            `Unsupported ZIP compression method: ${compressionMethod} for entry ${fileName}`,
            'DECOMPRESSION_FAILED'
          );
        }

        entries.push({ fileName, data: uncompressedData, compressionMethod });
        pos = dataOffset + compressedSize;
      } else {
        pos++;
      }
    }

    return entries;
  }

  static buildZip(entries: ZipEntry[]): Buffer {
    const localChunks: Buffer[] = [];
    const centralChunks: Buffer[] = [];
    let currentOffset = 0;

    for (const entry of entries) {
      const fileNameBuf = Buffer.from(entry.fileName, 'utf8');
      const compressionMethod = entry.compressionMethod ?? 8;
      let compressedData: Buffer;

      if (compressionMethod === 8) {
        compressedData = entry.data.length > 0 ? zlib.deflateRawSync(entry.data) : Buffer.alloc(0);
      } else {
        compressedData = entry.data;
      }

      const fileCrc = crc32(entry.data);
      const uncompressedSize = entry.data.length;
      const compressedSize = compressedData.length;

      // 1. Local Header (30 bytes)
      const localHeader = Buffer.alloc(30);
      localHeader.writeUInt32LE(0x04034b50, 0); // Signature
      localHeader.writeUInt16LE(20, 4); // Min version (2.0)
      localHeader.writeUInt16LE(0, 6); // Flags
      localHeader.writeUInt16LE(compressionMethod, 8); // Method
      localHeader.writeUInt16LE(0, 10); // Mod time
      localHeader.writeUInt16LE(0, 12); // Mod date
      localHeader.writeUInt32LE(fileCrc, 14); // CRC32
      localHeader.writeUInt32LE(compressedSize, 18); // Compressed size
      localHeader.writeUInt32LE(uncompressedSize, 22); // Uncompressed size
      localHeader.writeUInt16LE(fileNameBuf.length, 26); // Filename len
      localHeader.writeUInt16LE(0, 28); // Extra len

      const localOffset = currentOffset;
      localChunks.push(localHeader, fileNameBuf, compressedData);
      currentOffset += 30 + fileNameBuf.length + compressedSize;

      // 2. Central Directory Header (46 bytes)
      const centralHeader = Buffer.alloc(46);
      centralHeader.writeUInt32LE(0x02014b50, 0); // Signature
      centralHeader.writeUInt16LE(20, 4); // Version made by
      centralHeader.writeUInt16LE(20, 6); // Version needed
      centralHeader.writeUInt16LE(0, 8); // Flags
      centralHeader.writeUInt16LE(compressionMethod, 10); // Method
      centralHeader.writeUInt16LE(0, 12); // Mod time
      centralHeader.writeUInt16LE(0, 14); // Mod date
      centralHeader.writeUInt32LE(fileCrc, 16); // CRC32
      centralHeader.writeUInt32LE(compressedSize, 20); // Compressed size
      centralHeader.writeUInt32LE(uncompressedSize, 24); // Uncompressed size
      centralHeader.writeUInt16LE(fileNameBuf.length, 28); // Filename len
      centralHeader.writeUInt16LE(0, 30); // Extra len
      centralHeader.writeUInt16LE(0, 32); // Comment len
      centralHeader.writeUInt16LE(0, 34); // Disk start
      centralHeader.writeUInt16LE(0, 36); // Internal attr
      centralHeader.writeUInt32LE(0, 38); // External attr
      centralHeader.writeUInt32LE(localOffset, 42); // Relative offset
      centralChunks.push(centralHeader, fileNameBuf);
    }

    const centralDirOffset = currentOffset;
    const centralDirTotalSize = centralChunks.reduce((acc, c) => acc + c.length, 0);

    // 3. End of Central Directory Record (22 bytes)
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0); // Signature
    eocd.writeUInt16LE(0, 4); // Disk num
    eocd.writeUInt16LE(0, 6); // Central dir disk
    eocd.writeUInt16LE(entries.length, 8); // Entries on this disk
    eocd.writeUInt16LE(entries.length, 10); // Total entries
    eocd.writeUInt32LE(centralDirTotalSize, 12); // Central dir size
    eocd.writeUInt32LE(centralDirOffset, 16); // Central dir offset
    eocd.writeUInt16LE(0, 20); // Comment len

    return Buffer.concat([...localChunks, ...centralChunks, eocd]);
  }

  static extractLog(buf: Buffer): Buffer {
    const entries = ZipContainer.extractEntries(buf);
    const logEntry = entries.find((e) => e.fileName === 'log');
    if (!logEntry) {
      throw new SaveCodecError('Ren\'Py save zip does not contain "log" entry', 'PARSE_FAILED');
    }
    return logEntry.data;
  }

  static createZipWithLog(logData: Buffer): Buffer {
    return ZipContainer.buildZip([
      {
        fileName: 'log',
        data: logData,
        compressionMethod: 8,
      },
    ]);
  }
}

function trySignRenpyLog(logBuf: Buffer): Buffer | null {
  try {
    let keyFilePath: string | null = null;
    if (process.platform === 'win32' && process.env.APPDATA) {
      keyFilePath = path.join(process.env.APPDATA, 'RenPy', 'tokens', 'security_keys.txt');
    } else if (process.platform === 'darwin' && process.env.HOME) {
      keyFilePath = path.join(process.env.HOME, 'Library', 'RenPy', 'tokens', 'security_keys.txt');
    } else if (process.env.HOME) {
      keyFilePath = path.join(process.env.HOME, '.renpy', 'tokens', 'security_keys.txt');
    }

    if (!keyFilePath || !fs.existsSync(keyFilePath)) return null;

    const content = fs.readFileSync(keyFilePath, 'utf8');
    const lines = content.split(/\r?\n/);
    let sigLines = '';

    for (const line of lines) {
      const parts = line.trim().split(' ');
      if (parts[0] === 'signing-key' && parts[1] && parts[2]) {
        const privDer = Buffer.from(parts[1], 'base64');
        const pubDerB64 = parts[2];
        const privKey = crypto.createPrivateKey({ key: privDer, format: 'der', type: 'sec1' });
        const sig = crypto.sign('sha1', logBuf, { key: privKey, dsaEncoding: 'ieee-p1363' });
        sigLines += `signature ${pubDerB64} ${sig.toString('base64')}\n`;
      }
    }

    return sigLines.length > 0 ? Buffer.from(sigLines, 'utf8') : null;
  } catch {
    return null;
  }
}

export class RenpyPickleSaveCodec {
  static async decode(rawData: Buffer, context?: SaveCodecContext): Promise<any> {
    if (!rawData || rawData.length === 0) {
      throw new SaveCodecError('Ren\'Py save file is empty', 'PARSE_FAILED');
    }

    let pickleBuf: Buffer;

    // Check if buffer is a ZIP container
    if (rawData.length >= 4 && rawData.readUInt32LE(0) === 0x04034b50) {
      try {
        const entries = ZipContainer.extractEntries(rawData);
        const logEntry = entries.find((e) => e.fileName === 'log');
        if (!logEntry) {
          throw new SaveCodecError('Ren\'Py save zip does not contain "log" entry', 'PARSE_FAILED');
        }
        pickleBuf = logEntry.data;
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

    if (context && context.options && typeof context.options === 'object') {
      context.options.originalBuffer = rawData;
    }

    const earlyExit =
      context?.options?.earlyExit !== undefined
        ? Boolean(context.options.earlyExit)
        : (context?.options?.earlyExitRoots !== undefined ? Boolean(context.options.earlyExitRoots) : true);

    let roots: any = null;
    let fullState: any = null;

    // 1. Primary path: Fast early exit on root dictionary SETITEMS (when earlyExit is enabled)
    if (earlyExit) {
      try {
        const earlyResult = SandboxedPickleParser.parse(pickleBuf, {
          earlyExit: true,
          stalenessTracker: context?.options?.stalenessTracker,
          stalenessTimeoutMs: context?.options?.stalenessTimeoutMs,
          shouldCancel: context?.options?.shouldCancel,
        });

        if (earlyResult && typeof earlyResult === 'object' && !Array.isArray(earlyResult)) {
          roots = earlyResult;
        } else if (
          Array.isArray(earlyResult) &&
          earlyResult.length > 0 &&
          earlyResult[0] &&
          typeof earlyResult[0] === 'object' &&
          !Array.isArray(earlyResult[0])
        ) {
          roots = earlyResult[0];
        }
      } catch (err: any) {
        if (
          err instanceof SaveCodecError &&
          (err.message.includes('cancelled') ||
            err.message.includes('stalled') ||
            err.message.includes('limit exceeded') ||
            err.message.includes('Unsupported pickle protocol'))
        ) {
          throw err;
        }
        if (err instanceof StalenessError) {
          throw new SaveCodecError(err.message, 'PARSE_FAILED');
        }
        // Fallback path will run below if early exit fails or encounters non-standard structure
        roots = null;
      }
    }

    // 2. Fallback path (or primary path when earlyExit is false): Full unpickling with chunked async progress, cancellation, and staleness tracking
    if (!roots) {
      fullState = await SandboxedPickleParser.parseAsync(pickleBuf, {
        earlyExit: false,
        stalenessTracker: context?.options?.stalenessTracker,
        stalenessTimeoutMs: context?.options?.stalenessTimeoutMs,
        onProgress: context?.options?.onProgress,
        shouldCancel: context?.options?.shouldCancel,
      });

      if (Array.isArray(fullState) && fullState.length > 0) {
        roots = fullState[0];
      } else if (fullState && typeof fullState === 'object') {
        roots = fullState;
      }
    } else {
      context?.options?.onProgress?.({
        current: pickleBuf.length,
        total: pickleBuf.length,
        percent: 100,
        unit: 'bytes',
        pos: pickleBuf.length,
        totalBytes: pickleBuf.length,
      });
    }

    // Extract store variables
    const variables: Record<string, any> = createSafeDict();

    if (roots && typeof roots === 'object') {
      for (const [k, v] of Object.entries(roots)) {
        if (!isDangerousKey(k)) {
          variables[k] = sanitizeDeep(v);
        }
      }
    }

    variables.$type = 'RenpySave';
    const cleanResult = sanitizeDeep(variables);

    // Retain full rollback history non-enumerably if full state was unpickled
    if (fullState && Array.isArray(fullState) && fullState.length > 1) {
      Object.defineProperty(cleanResult, '_rollback', {
        value: sanitizeDeep(fullState[1]),
        enumerable: false,
        configurable: true,
        writable: true,
      });
    }

    // Retain original raw buffer on the parsed object for seamless surgical saving
    if (rawData.length >= 4 && rawData.readUInt32LE(0) === 0x04034b50) {
      Object.defineProperty(cleanResult, '_rawBuffer', {
        value: rawData,
        enumerable: false,
        configurable: true,
        writable: true,
      });
    }

    return cleanResult;
  }

  static decodeSync(rawData: Buffer, context?: SaveCodecContext): any {
    if (!rawData || rawData.length === 0) {
      throw new SaveCodecError('Ren\'Py save file is empty', 'PARSE_FAILED');
    }

    let pickleBuf: Buffer;
    if (rawData.length >= 4 && rawData.readUInt32LE(0) === 0x04034b50) {
      try {
        const entries = ZipContainer.extractEntries(rawData);
        const logEntry = entries.find((e) => e.fileName === 'log');
        if (!logEntry) {
          throw new SaveCodecError('Ren\'Py save zip does not contain "log" entry', 'PARSE_FAILED');
        }
        pickleBuf = logEntry.data;
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

    if (context && context.options && typeof context.options === 'object') {
      context.options.originalBuffer = rawData;
    }

    const earlyExit =
      context?.options?.earlyExit !== undefined
        ? Boolean(context.options.earlyExit)
        : (context?.options?.earlyExitRoots !== undefined ? Boolean(context.options.earlyExitRoots) : true);

    let roots: any = null;
    let fullState: any = null;
    if (earlyExit) {
      try {
        const earlyResult = SandboxedPickleParser.parse(pickleBuf, {
          earlyExit: true,
          stalenessTracker: context?.options?.stalenessTracker,
          stalenessTimeoutMs: context?.options?.stalenessTimeoutMs,
          shouldCancel: context?.options?.shouldCancel,
        });
        if (earlyResult && typeof earlyResult === 'object' && !Array.isArray(earlyResult)) {
          roots = earlyResult;
        } else if (
          Array.isArray(earlyResult) &&
          earlyResult.length > 0 &&
          earlyResult[0] &&
          typeof earlyResult[0] === 'object' &&
          !Array.isArray(earlyResult[0])
        ) {
          roots = earlyResult[0];
        }
      } catch (err: any) {
        if (
          err instanceof SaveCodecError &&
          (err.message.includes('cancelled') ||
            err.message.includes('stalled') ||
            err.message.includes('limit exceeded') ||
            err.message.includes('Unsupported pickle protocol'))
        ) {
          throw err;
        }
        if (err instanceof StalenessError) {
          throw new SaveCodecError(err.message, 'PARSE_FAILED');
        }
        roots = null;
      }
    }

    if (!roots) {
      fullState = SandboxedPickleParser.parse(pickleBuf, {
        earlyExit: false,
        stalenessTracker: context?.options?.stalenessTracker,
        stalenessTimeoutMs: context?.options?.stalenessTimeoutMs,
        shouldCancel: context?.options?.shouldCancel,
      });
      if (Array.isArray(fullState) && fullState.length > 0) {
        roots = fullState[0];
      } else if (fullState && typeof fullState === 'object') {
        roots = fullState;
      }
    }

    const variables: Record<string, any> = createSafeDict();
    if (roots && typeof roots === 'object') {
      for (const [k, v] of Object.entries(roots)) {
        if (!isDangerousKey(k)) {
          variables[k] = sanitizeDeep(v);
        }
      }
    }

    variables.$type = 'RenpySave';
    const cleanResult = sanitizeDeep(variables);

    if (fullState && Array.isArray(fullState) && fullState.length > 1) {
      Object.defineProperty(cleanResult, '_rollback', {
        value: sanitizeDeep(fullState[1]),
        enumerable: false,
        configurable: true,
        writable: true,
      });
    }

    if (rawData.length >= 4 && rawData.readUInt32LE(0) === 0x04034b50) {
      Object.defineProperty(cleanResult, '_rawBuffer', {
        value: rawData,
        enumerable: false,
        configurable: true,
        writable: true,
      });
    }

    return cleanResult;
  }

  static encode(jsonData: any, contextOrWrap?: SaveCodecContext | boolean): Buffer {
    let context: SaveCodecContext | undefined;
    let wrapInZip = true;

    if (typeof contextOrWrap === 'boolean') {
      wrapInZip = contextOrWrap;
    } else if (contextOrWrap) {
      context = contextOrWrap;
      if (context.options?.wrapInZip !== undefined) {
        wrapInZip = Boolean(context.options.wrapInZip);
      }
    }

    let origRawBuffer: Buffer | null = (jsonData && (jsonData as any)._rawBuffer) || null;
    const cleanData = sanitizeDeep(jsonData);

    if (cleanData && typeof cleanData === 'object') {
      delete cleanData.$type;
      delete cleanData._userMappings;
      if ((cleanData as any)._rawBuffer) {
        delete (cleanData as any)._rawBuffer;
      }
    }

    // Try to get original save buffer from context if not found on object
    if (!origRawBuffer) {
      if (context?.options?.originalBuffer instanceof Buffer) {
        origRawBuffer = context.options.originalBuffer;
      } else if (context?.options?.savePath && typeof context.options.savePath === 'string') {
        try {
          if (fs.existsSync(context.options.savePath)) {
            origRawBuffer = fs.readFileSync(context.options.savePath);
          }
        } catch {}
      }
    }

    // If original save buffer is available, perform surgical patching
    if (
      origRawBuffer &&
      origRawBuffer.length >= 4 &&
      origRawBuffer.readUInt32LE(0) === 0x04034b50
    ) {
      return RenpyPickleSaveCodec.surgicalEncode(origRawBuffer, cleanData);
    }

    // Standard fallback serialization (for scratch tests or new files)
    const logState = [cleanData];
    const pickleLog = SandboxedPickleParser.serialize(logState);

    if (wrapInZip) {
      return ZipContainer.createZipWithLog(pickleLog);
    }

    return pickleLog;
  }

  static surgicalEncode(origZipBuffer: Buffer, updatedVariables: Record<string, any>): Buffer {
    const entries = ZipContainer.extractEntries(origZipBuffer);
    const logEntryIndex = entries.findIndex((e) => e.fileName === 'log');
    if (logEntryIndex === -1) {
      throw new SaveCodecError('Ren\'Py save zip does not contain "log" entry', 'PARSE_FAILED');
    }

    const origLog = entries[logEntryIndex].data;
    const protoVer = origLog.length >= 2 && origLog[0] === 0x80 ? origLog[1] : 2;
    const scan = SandboxedPickleParser.scanRootsOffsets(origLog);

    if (scan.setitemsPos === -1) {
      // Fallback: replace log with serialized clean data if scan didn't find setitems
      entries[logEntryIndex].data = SandboxedPickleParser.serialize([updatedVariables]);
      return ZipContainer.buildZip(entries);
    }

    // 1. Identify modified existing values
    const replacements: Array<{ start: number; end: number; bytes: Buffer }> = [];
    const handledKeys = new Set<string>();

    for (const [key, offsetInfo] of scan.rootsOffsets.entries()) {
      handledKeys.add(key);
      if (key in updatedVariables) {
        const newVal = updatedVariables[key];
        const isPrimitive =
          newVal === null ||
          typeof newVal === 'number' ||
          typeof newVal === 'boolean' ||
          typeof newVal === 'string';
        const isOldPrimitive =
          offsetInfo.oldVal === null ||
          typeof offsetInfo.oldVal === 'number' ||
          typeof offsetInfo.oldVal === 'boolean' ||
          typeof offsetInfo.oldVal === 'string';

        if (isPrimitive && isOldPrimitive && newVal !== offsetInfo.oldVal) {
          const newBytes = SandboxedPickleParser.serializePrimitiveValue(
            newVal,
            offsetInfo.hadMemoize,
            protoVer
          );
          replacements.push({
            start: offsetInfo.valStart,
            end: offsetInfo.valEnd,
            bytes: newBytes,
          });
        }
      }
    }

    // 2. Identify newly added variables to insert before SETITEMS
    const newKeyChunks: Buffer[] = [];
    for (const [k, v] of Object.entries(updatedVariables)) {
      if (
        k === '$type' ||
        k === '_userMappings' ||
        k === '_rawBuffer' ||
        k.startsWith('$_') ||
        isDangerousKey(k) ||
        handledKeys.has(k)
      ) {
        continue;
      }
      const isPrimitive =
        v === null ||
        typeof v === 'number' ||
        typeof v === 'boolean' ||
        typeof v === 'string';
      if (!isPrimitive) continue;

      const kBuf = Buffer.from(k, 'utf8');
      // Do NOT add MEMOIZE to new keys so we preserve existing rollback memo indices
      let keyPickle: Buffer;
      if (kBuf.length <= 255 && protoVer >= 4) {
        keyPickle = Buffer.concat([Buffer.from([0x8c, kBuf.length]), kBuf]);
      } else {
        const lb = Buffer.alloc(5);
        lb[0] = 0x58;
        lb.writeUInt32LE(kBuf.length, 1);
        keyPickle = Buffer.concat([lb, kBuf]);
      }
      const valPickle = SandboxedPickleParser.serializePrimitiveValue(v, false, protoVer);
      newKeyChunks.push(keyPickle, valPickle);
    }

    if (newKeyChunks.length > 0) {
      replacements.push({
        start: scan.setitemsPos,
        end: scan.setitemsPos,
        bytes: Buffer.concat(newKeyChunks),
      });
    }

    // 3. Compute delta per frame
    for (const rep of replacements) {
      const delta = rep.bytes.length - (rep.end - rep.start);
      const targetFrame = scan.frames.find(
        (f) => rep.start >= f.payloadStart && rep.start <= f.payloadEnd
      );
      if (targetFrame) {
        targetFrame.delta += delta;
      }
    }

    // 4. Apply replacements descending by start pos so applying doesn't shift earlier indices
    replacements.sort((a, b) => b.start - a.start);

    let patchedLog = origLog;
    for (const rep of replacements) {
      patchedLog = Buffer.concat([
        patchedLog.subarray(0, rep.start),
        rep.bytes,
        patchedLog.subarray(rep.end),
      ]);
    }

    // 5. Update frame lengths across all frames if protocol 4/5 frame headers are present
    if (scan.frames.length > 0) {
      let currentShift = 0;
      for (let i = 0; i < scan.frames.length; i++) {
        const f = scan.frames[i];
        const newHeaderPos = f.headerPos + currentShift;
        const newLen = f.origLen + f.delta;
        if (patchedLog[newHeaderPos] !== 0x95) {
          throw new SaveCodecError(
            `Frame header misaligned at offset ${newHeaderPos}: expected 0x95, found 0x${patchedLog[newHeaderPos]?.toString(16)}`,
            'PARSE_FAILED'
          );
        }
        patchedLog.writeBigUInt64LE(BigInt(newLen), newHeaderPos + 1);
        currentShift += f.delta;
      }
    }

    entries[logEntryIndex].data = patchedLog;

    // 4. Handle signatures: sign with local key if available, or clear signatures
    const sigIndex = entries.findIndex((e) => e.fileName === 'signatures');
    const newSig = trySignRenpyLog(patchedLog);
    if (sigIndex !== -1) {
      entries[sigIndex].data = newSig ?? Buffer.alloc(0);
    } else if (newSig) {
      entries.push({
        fileName: 'signatures',
        data: newSig,
        compressionMethod: 8,
      });
    }

    return ZipContainer.buildZip(entries);
  }
}
