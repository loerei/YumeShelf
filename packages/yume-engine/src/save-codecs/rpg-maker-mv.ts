import { SaveCodecError } from './errors.js';
import { LZString } from './lz-string.js';
import { safeJsonParse, sanitizeDeep } from './sanitize.js';

export class RpgMakerMvSaveCodec {
  static decode(rawData: Buffer): any {
    const str = rawData.toString('utf8').trim();
    if (!str) {
      throw new SaveCodecError('RPG Maker MV save file is empty', 'PARSE_FAILED');
    }

    try {
      const decompressed = LZString.decompressFromBase64(str);
      if (decompressed && typeof decompressed === 'string') {
        return safeJsonParse(decompressed);
      }
      // If decompressFromBase64 returns null/empty or direct JSON
      return safeJsonParse(str);
    } catch (err: any) {
      if (err instanceof SaveCodecError) throw err;
      throw new SaveCodecError(
        `Failed to decompress/parse RPG Maker MV save: ${err.message}`,
        'DECOMPRESSION_FAILED'
      );
    }
  }

  static encode(jsonData: any): Buffer {
    try {
      const cleanData = sanitizeDeep(jsonData);
      if (cleanData && typeof cleanData === 'object') {
        delete cleanData._userMappings;
      }
      const jsonStr = JSON.stringify(cleanData);
      const compressed = LZString.compressToBase64(jsonStr);
      return Buffer.from(compressed, 'utf8');
    } catch (err: any) {
      if (err instanceof SaveCodecError) throw err;
      throw new SaveCodecError(
        `Failed to compress RPG Maker MV save: ${err.message}`,
        'PARSE_FAILED'
      );
    }
  }
}
