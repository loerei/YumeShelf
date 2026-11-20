import { SaveCodecError } from './errors.js';
import { LZString } from './lz-string.js';
import { safeJsonParse, sanitizeDeep } from './sanitize.js';
import { DEFAULT_MAX_DECOMPRESSED_BYTES, type SaveCodecContext } from '../types.js';
import { safeLog } from './schema/index.js';

export class RpgMakerMvSaveCodec {
  static decode(rawData: Buffer, context?: SaveCodecContext): any {
    const maxBytes = context?.options?.maxBufferSizeBytes ?? DEFAULT_MAX_DECOMPRESSED_BYTES;
    if (rawData && rawData.length > maxBytes) {
      throw new SaveCodecError(
        `RPG Maker MV save exceeds maximum allowed size (${maxBytes} bytes)`,
        'DECOMPRESSION_FAILED'
      );
    }
    const str = rawData.toString('utf8').trim();
    if (!str) {
      throw new SaveCodecError('RPG Maker MV save file is empty', 'PARSE_FAILED');
    }

    try {
      const decompressed = LZString.decompressFromBase64(str);
      if (decompressed && typeof decompressed === 'string') {
        if (Buffer.byteLength(decompressed, 'utf8') > maxBytes) {
          throw new SaveCodecError(
            `Decompressed RPG Maker MV save exceeds maximum allowed payload size (${maxBytes} bytes)`,
            'DECOMPRESSION_FAILED'
          );
        }
        return safeJsonParse(decompressed);
      }
      // If decompressFromBase64 returns null/empty or direct JSON
      return safeJsonParse(str);
    } catch (err: any) {
      safeLog(context?.options?.logger, 'error', 'Failed to decompress/parse RPG Maker MV save', {
        error: err?.message ?? String(err),
      });
      if (err instanceof SaveCodecError) throw err;
      throw new SaveCodecError(
        `Failed to decompress/parse RPG Maker MV save: ${err.message}`,
        'DECOMPRESSION_FAILED',
        { cause: err }
      );
    }
  }

  static encode(jsonData: any, context?: SaveCodecContext): Buffer {
    try {
      const cleanData = sanitizeDeep(jsonData);
      if (cleanData && typeof cleanData === 'object') {
        delete cleanData._userMappings;
      }
      const jsonStr = JSON.stringify(cleanData);
      const compressed = LZString.compressToBase64(jsonStr);
      return Buffer.from(compressed, 'utf8');
    } catch (err: any) {
      safeLog(context?.options?.logger, 'error', 'Failed to compress RPG Maker MV save', {
        error: err?.message ?? String(err),
      });
      if (err instanceof SaveCodecError) throw err;
      throw new SaveCodecError(
        `Failed to compress RPG Maker MV save: ${err.message}`,
        'PARSE_FAILED',
        { cause: err }
      );
    }
  }
}
