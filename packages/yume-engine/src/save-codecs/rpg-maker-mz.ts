import * as zlib from 'node:zlib';
import { SaveCodecError } from './errors.js';
import { safeJsonParse, sanitizeDeep } from './sanitize.js';

export class RpgMakerMzSaveCodec {
  static decode(rawData: Buffer): any {
    if (!rawData || rawData.length === 0) {
      throw new SaveCodecError('RPG Maker MZ save file is empty', 'PARSE_FAILED');
    }

    try {
      // 1. Try RPG Maker MZ standard UTF-8 string decoding
      const str = rawData.toString('utf8');
      const rawBytes = Buffer.alloc(str.length);
      for (let i = 0; i < str.length; i++) {
        rawBytes[i] = str.codePointAt(i) || 0;
      }
      const decompressedBuffer = zlib.inflateSync(rawBytes);
      return safeJsonParse(decompressedBuffer.toString('utf8'));
    } catch {
      // 2. Fallback to direct raw binary zlib inflate
      try {
        const decompressedBuffer = zlib.inflateSync(rawData);
        return safeJsonParse(decompressedBuffer.toString('utf8'));
      } catch (err: any) {
        if (err instanceof SaveCodecError) throw err;
        throw new SaveCodecError(
          `Failed to decompress RPG Maker MZ save: ${err.message}`,
          'DECOMPRESSION_FAILED'
        );
      }
    }
  }

  static encode(jsonData: any): Buffer {
    try {
      const cleanData = sanitizeDeep(jsonData);
      if (cleanData && typeof cleanData === 'object') {
        delete cleanData._userMappings;
      }

      const jsonStr = JSON.stringify(cleanData);
      const compressed = zlib.deflateSync(Buffer.from(jsonStr, 'utf8'), { level: 1 });

      let str = '';
      for (const byte of compressed) {
        str += String.fromCodePoint(byte);
      }
      return Buffer.from(str, 'utf8');
    } catch (err: any) {
      if (err instanceof SaveCodecError) throw err;
      throw new SaveCodecError(
        `Failed to compress RPG Maker MZ save: ${err.message}`,
        'PARSE_FAILED'
      );
    }
  }
}
