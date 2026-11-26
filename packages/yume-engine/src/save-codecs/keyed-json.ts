import {
  SaveCodecError,
  formatSaveTooLargeCodecMessage,
  resolveMaxDecompressedBytes,
} from './errors.js';
import { safeJsonParse, sanitizeDeep } from './sanitize.js';
import type { SaveCodecContext } from '../types.js';
import { safeLog } from './schema/index.js';

export class KeyedJsonSaveCodec {
  static decode(rawData: Buffer, context?: SaveCodecContext): any {
    const maxBytes = resolveMaxDecompressedBytes(context?.options);
    if (maxBytes !== undefined && rawData && rawData.length > maxBytes) {
      throw new SaveCodecError(
        formatSaveTooLargeCodecMessage(rawData.length, maxBytes, 'Keyed JSON save'),
        'DECOMPRESSION_FAILED'
      );
    }
    const str = rawData.toString('utf8').trim();

    // If it already looks like pure JSON
    if (str.startsWith('{') || str.startsWith('[')) {
      try {
        const parsed = safeJsonParse(str);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          parsed.$type = 'SimpleKeyedSave';
        }
        return parsed;
      } catch (err: any) {
        safeLog(context?.options?.logger, 'error', 'Keyed JSON parse failed', {
          error: err?.message ?? String(err),
        });
        throw new SaveCodecError(`Keyed JSON parse failed: ${err.message}`, 'PARSE_FAILED', {
          cause: err,
        });
      }
    }

    // 1. Reverse the string
    const reversed = str.split('').reverse().join('');

    // 2. Base64 Decode
    let decoded: string;
    try {
      const decodedBuf = Buffer.from(reversed, 'base64');
      if (maxBytes !== undefined && decodedBuf.length > maxBytes) {
        throw new SaveCodecError(
          formatSaveTooLargeCodecMessage(decodedBuf.length, maxBytes, 'Decompressed Keyed JSON payload'),
          'DECOMPRESSION_FAILED'
        );
      }
      decoded = decodedBuf.toString('utf8');
    } catch (e: any) {
      if (e instanceof SaveCodecError) throw e;
      throw new SaveCodecError(
        `Keyed JSON base64 decode failed: ${e.message}`,
        'DECOMPRESSION_FAILED',
        { cause: e }
      );
    }

    // 3. Extract Key and JSON
    const firstBrace = decoded.indexOf('{');
    const firstBracket = decoded.indexOf('[');
    let firstIndex = -1;
    let lastIndex = -1;

    if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
      firstIndex = firstBrace;
      lastIndex = decoded.lastIndexOf('}');
    } else if (firstBracket !== -1) {
      firstIndex = firstBracket;
      lastIndex = decoded.lastIndexOf(']');
    }

    if (firstIndex === -1 || lastIndex === -1 || firstIndex > lastIndex) {
      // Try parsing directly or fail
      try {
        return safeJsonParse(str);
      } catch (err: any) {
        throw new SaveCodecError(
          'Failed to extract JSON payload from keyed-json wrapper',
          'PARSE_FAILED',
          { cause: err }
        );
      }
    }

    const jsonPart = decoded.substring(firstIndex, lastIndex + 1);

    try {
      const json = safeJsonParse(jsonPart);
      if (json && typeof json === 'object' && !Array.isArray(json)) {
        json.$type = 'SimpleKeyedSave';
      }
      return json;
    } catch (err: any) {
      throw new SaveCodecError(`Keyed JSON parse failed: ${err.message}`, 'PARSE_FAILED', {
        cause: err,
      });
    }
  }

  static encode(jsonData: any, context?: SaveCodecContext): Buffer {
    try {
      const key =
        context?.gameKey ||
        context?.options?.key ||
        'MyGameKey2025';

      const cleanData = sanitizeDeep(jsonData);
      if (cleanData && typeof cleanData === 'object') {
        delete cleanData.$type;
        delete cleanData._userMappings;
      }

      const jsonStr = JSON.stringify(cleanData);
      const payload = key + jsonStr + key;

      // 1. Base64 Encode
      const base64 = Buffer.from(payload, 'utf8').toString('base64');

      // 2. Reverse
      const final = base64.split('').reverse().join('');

      return Buffer.from(final, 'utf8');
    } catch (err: any) {
      if (err instanceof SaveCodecError) throw err;
      throw new SaveCodecError(`Keyed JSON encoding failed: ${err.message}`, 'PARSE_FAILED', {
        cause: err,
      });
    }
  }
}
