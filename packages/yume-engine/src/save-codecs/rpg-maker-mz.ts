import * as zlib from 'node:zlib';
import { SaveCodecError } from './errors.js';
import { safeJsonParse, sanitizeDeep } from './sanitize.js';
import { DEFAULT_MAX_DECOMPRESSED_BYTES, type SaveCodecContext } from '../types.js';
import { safeLog } from './schema/index.js';

export class RpgMakerMzSaveCodec {
  static decode(rawData: Buffer, context?: SaveCodecContext): any {
    if (!rawData || rawData.length === 0) {
      throw new SaveCodecError('RPG Maker MZ save file is empty', 'PARSE_FAILED');
    }
    const maxDecompressedBytes =
      context?.options?.maxBufferSizeBytes ?? DEFAULT_MAX_DECOMPRESSED_BYTES;

    try {
      // 1. Try RPG Maker MZ standard UTF-8 string decoding
      const str = rawData.toString('utf8');
      const rawBytes = Buffer.alloc(str.length);
      for (let i = 0; i < str.length; i++) {
        rawBytes[i] = str.codePointAt(i) || 0;
      }
      const decompressedBuffer = zlib.inflateSync(rawBytes, {
        maxOutputLength: maxDecompressedBytes,
      });
      return safeJsonParse(decompressedBuffer.toString('utf8'));
    } catch {
      // 2. Fallback to direct raw binary zlib inflate
      try {
        const decompressedBuffer = zlib.inflateSync(rawData, {
          maxOutputLength: maxDecompressedBytes,
        });
        return safeJsonParse(decompressedBuffer.toString('utf8'));
      } catch (err: any) {
        safeLog(context?.options?.logger, 'error', 'Failed to decompress RPG Maker MZ save', {
          error: err?.message ?? String(err),
        });
        if (err instanceof SaveCodecError) throw err;
        throw new SaveCodecError(
          `Failed to decompress RPG Maker MZ save: ${err.message}`,
          'DECOMPRESSION_FAILED',
          { cause: err }
        );
      }
    }
  }

  static encode(jsonData: any, context?: SaveCodecContext): Buffer {
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
      safeLog(context?.options?.logger, 'error', 'Failed to compress RPG Maker MZ save', {
        error: err?.message ?? String(err),
      });
      if (err instanceof SaveCodecError) throw err;
      throw new SaveCodecError(
        `Failed to compress RPG Maker MZ save: ${err.message}`,
        'PARSE_FAILED',
        { cause: err }
      );
    }
  }
}
