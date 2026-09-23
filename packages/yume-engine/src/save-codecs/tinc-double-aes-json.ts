import * as crypto from 'node:crypto';
import { SaveCodecError } from './errors.js';
import { safeJsonParse, sanitizeDeep } from './sanitize.js';
import type { SaveCodecContext } from '../types.js';

const DEFAULT_OUTER_KEY = Buffer.from('d5wAqPJLlmJCZowMt1phICUyBSA9wErz', 'utf8');
const DEFAULT_OUTER_IV = Buffer.from('d5wAqPJLlmJCZowM', 'utf8');
const DEFAULT_INNER_KEY = Buffer.from('PJC7HnliwcxXw4FM8Ep3sX9NIL3R5CZn', 'utf8');
const DEFAULT_INNER_IV = Buffer.from('PJC7HnliwcxXw4FM', 'utf8');

const DEFAULT_RAW_PLAINTEXT_FIELDS = new Set(['data_ownedItems', 'data_userTierData']);

function resolveKeyAndIv(
  customKey?: string | Buffer,
  customIv?: string | Buffer,
  defaultKey: Buffer = DEFAULT_OUTER_KEY,
  defaultIv: Buffer = DEFAULT_OUTER_IV
): { key: Buffer; iv: Buffer } {
  let key: Buffer;
  let iv: Buffer;

  if (customKey) {
    key = Buffer.isBuffer(customKey) ? customKey : Buffer.from(customKey, 'utf8');
    if (customIv) {
      iv = Buffer.isBuffer(customIv) ? customIv : Buffer.from(customIv, 'utf8');
    } else {
      iv = Buffer.from(key).subarray(0, 16);
    }
  } else {
    key = defaultKey;
    iv = customIv ? (Buffer.isBuffer(customIv) ? customIv : Buffer.from(customIv, 'utf8')) : defaultIv;
  }

  return { key, iv };
}

function resolveRawPlaintextFields(raw?: any): Set<string> {
  let custom: string[] = [];
  if (Array.isArray(raw)) {
    custom = raw.filter((f) => typeof f === 'string');
  } else if (raw instanceof Set) {
    custom = Array.from(raw).filter((f) => typeof f === 'string');
  }
  return new Set([...DEFAULT_RAW_PLAINTEXT_FIELDS, ...custom]);
}

export class TincDoubleAesJsonSaveCodec {
  static sniff(
    buffer?: Buffer,
    options?: { outerKey?: string | Buffer; outerIv?: string | Buffer }
  ): boolean {
    if (!buffer || !Buffer.isBuffer(buffer)) {
      return false;
    }

    try {
      let start = 0;
      while (
        start < buffer.length &&
        (buffer[start] === 0x20 ||
          buffer[start] === 0x09 ||
          buffer[start] === 0x0a ||
          buffer[start] === 0x0d)
      ) {
        start++;
      }

      if (buffer.length - start < 24) {
        return false;
      }

      const firstByte = buffer[start];
      if (firstByte === 0x7b || firstByte === 0x5b) {
        // '{' or '['
        return false;
      }

      // Check UTF-8 BOM: 0xEF, 0xBB, 0xBF
      if (
        buffer.length - start >= 3 &&
        firstByte === 0xef &&
        buffer[start + 1] === 0xbb &&
        buffer[start + 2] === 0xbf
      ) {
        return false;
      }

      const slice = buffer.subarray(start, start + 64);
      const rawCipher = Buffer.from(slice.toString('ascii'), 'base64');
      const alignedLen = rawCipher.length - (rawCipher.length % 16);
      if (alignedLen < 16) {
        return false;
      }

      const { key: outerKey, iv: outerIv } = resolveKeyAndIv(
        options?.outerKey,
        options?.outerIv,
        DEFAULT_OUTER_KEY,
        DEFAULT_OUTER_IV
      );

      const decipher = crypto.createDecipheriv('aes-256-cbc', outerKey, outerIv);
      decipher.setAutoPadding(false);
      const decrypted = Buffer.concat([
        decipher.update(rawCipher.subarray(0, 16)),
        decipher.final(),
      ]);

      if (decrypted.length < 16 || decrypted[0] !== 0x7b) {
        return false;
      }

      let i = 1;
      while (
        i < decrypted.length &&
        (decrypted[i] === 0x20 ||
          decrypted[i] === 0x09 ||
          decrypted[i] === 0x0a ||
          decrypted[i] === 0x0d)
      ) {
        i++;
      }

      if (i >= decrypted.length) {
        return false;
      }

      if (decrypted[i] === 0x22 || decrypted[i] === 0x7d) {
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  static decode(rawBuffer: Buffer, context?: SaveCodecContext): any {
    if (!rawBuffer || !Buffer.isBuffer(rawBuffer)) {
      throw new SaveCodecError('Invalid raw buffer for decode', 'PARSE_FAILED');
    }

    let rawCipher: Buffer;
    try {
      const b64Str = rawBuffer.toString('utf8').trim();
      rawCipher = Buffer.from(b64Str, 'base64');
      if (rawCipher.length === 0) {
        throw new Error('Empty base64 payload');
      }
    } catch (err: any) {
      throw new SaveCodecError(
        `Failed to decode base64 outer payload: ${err.message}`,
        'PARSE_FAILED'
      );
    }

    const { key: outerKey, iv: outerIv } = resolveKeyAndIv(
      context?.options?.outerKey,
      context?.options?.outerIv,
      DEFAULT_OUTER_KEY,
      DEFAULT_OUTER_IV
    );

    let decryptedOuter: Buffer;
    try {
      const decipher = crypto.createDecipheriv('aes-256-cbc', outerKey, outerIv);
      decryptedOuter = Buffer.concat([decipher.update(rawCipher), decipher.final()]);
    } catch (err: any) {
      throw new SaveCodecError(
        `Failed to decrypt outer AES-256-CBC: ${err.message}`,
        'PARSE_FAILED'
      );
    }

    let data: any;
    try {
      data = sanitizeDeep(safeJsonParse(decryptedOuter.toString('utf8')));
    } catch (err: any) {
      throw new SaveCodecError(
        `Failed to parse outer JSON payload: ${err.message}`,
        'PARSE_FAILED'
      );
    }

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new SaveCodecError(
        'Invalid TINC save file: root must be a JSON object',
        'PARSE_FAILED'
      );
    }

    const { key: innerKey, iv: innerIv } = resolveKeyAndIv(
      context?.options?.innerKey,
      context?.options?.innerIv,
      DEFAULT_INNER_KEY,
      DEFAULT_INNER_IV
    );
    const effectiveRawFields = resolveRawPlaintextFields(context?.options?.rawPlaintextFields);

    function decryptInnerString(cipherB64: string): string {
      try {
        const cipherBuf = Buffer.from(cipherB64, 'base64');
        const decipher = crypto.createDecipheriv('aes-256-cbc', innerKey, innerIv);
        const decrypted = Buffer.concat([decipher.update(cipherBuf), decipher.final()]);
        return decrypted.toString('utf8');
      } catch (err: any) {
        throw new SaveCodecError(
          `Failed to decrypt inner string field: ${err.message}`,
          'PARSE_FAILED'
        );
      }
    }

    function transformDecode(node: any, isRaw: boolean): any {
      if (node === null || node === undefined) {
        return node;
      }
      if (typeof node === 'number' || typeof node === 'boolean') {
        return node;
      }
      if (typeof node === 'string') {
        return isRaw ? node : decryptInnerString(node);
      }
      if (Array.isArray(node)) {
        return node.map((item) => transformDecode(item, isRaw));
      }
      if (typeof node === 'object') {
        const result: Record<string, any> = {};
        for (const k of Object.keys(node)) {
          const childIsRaw = isRaw || effectiveRawFields.has(k);
          result[k] = transformDecode(node[k], childIsRaw);
        }
        return result;
      }
      return node;
    }

    const result: Record<string, any> = {};
    for (const key of Object.keys(data)) {
      if (key.startsWith('data_')) {
        const isRaw = effectiveRawFields.has(key);
        result[key] = transformDecode(data[key], isRaw);
      } else {
        result[key] = data[key];
      }
    }

    result.$type = 'TincDoubleAesJsonSave';
    return result;
  }

  static encode(jsonData: any, context?: SaveCodecContext): Buffer {
    if (!jsonData || typeof jsonData !== 'object' || Array.isArray(jsonData)) {
      throw new SaveCodecError(
        'Invalid JSON data for encoding: expected an object',
        'PARSE_FAILED'
      );
    }

    const clone = sanitizeDeep(jsonData);
    delete clone.$type;
    delete clone._userMappings;

    const { key: innerKey, iv: innerIv } = resolveKeyAndIv(
      context?.options?.innerKey,
      context?.options?.innerIv,
      DEFAULT_INNER_KEY,
      DEFAULT_INNER_IV
    );
    const effectiveRawFields = resolveRawPlaintextFields(context?.options?.rawPlaintextFields);

    function encryptInnerString(plainStr: string): string {
      try {
        const cipher = crypto.createCipheriv('aes-256-cbc', innerKey, innerIv);
        const encrypted = Buffer.concat([
          cipher.update(Buffer.from(plainStr, 'utf8')),
          cipher.final(),
        ]);
        return encrypted.toString('base64');
      } catch (err: any) {
        throw new SaveCodecError(
          `Failed to encrypt inner string field: ${err.message}`,
          'PARSE_FAILED'
        );
      }
    }

    function transformEncode(node: any, isRaw: boolean): any {
      if (node === null || node === undefined) {
        return node;
      }
      if (typeof node === 'number') {
        if (!Number.isFinite(node)) {
          throw new SaveCodecError('Invalid numeric value in save data: ' + node, 'PARSE_FAILED');
        }
        return isRaw ? node : encryptInnerString(String(node));
      }
      if (typeof node === 'boolean') {
        return isRaw ? node : encryptInnerString(String(node));
      }
      if (typeof node === 'string') {
        return isRaw ? node : encryptInnerString(node);
      }
      if (Array.isArray(node)) {
        return node.map((item) => transformEncode(item, isRaw));
      }
      if (typeof node === 'object') {
        const result: Record<string, any> = {};
        for (const k of Object.keys(node)) {
          const childIsRaw = isRaw || effectiveRawFields.has(k);
          result[k] = transformEncode(node[k], childIsRaw);
        }
        return result;
      }
      return node;
    }

    for (const key of Object.keys(clone)) {
      if (key.startsWith('data_')) {
        const isRaw = effectiveRawFields.has(key);
        clone[key] = transformEncode(clone[key], isRaw);
      }
    }

    const jsonString = JSON.stringify(clone);

    const { key: outerKey, iv: outerIv } = resolveKeyAndIv(
      context?.options?.outerKey,
      context?.options?.outerIv,
      DEFAULT_OUTER_KEY,
      DEFAULT_OUTER_IV
    );

    let base64CiphertextString: string;
    try {
      const cipher = crypto.createCipheriv('aes-256-cbc', outerKey, outerIv);
      const encrypted = Buffer.concat([
        cipher.update(Buffer.from(jsonString, 'utf8')),
        cipher.final(),
      ]);
      base64CiphertextString = encrypted.toString('base64');
    } catch (err: any) {
      throw new SaveCodecError(
        `Failed to encrypt outer AES-256-CBC: ${err.message}`,
        'PARSE_FAILED'
      );
    }

    return Buffer.from(base64CiphertextString, 'utf8');
  }
}
