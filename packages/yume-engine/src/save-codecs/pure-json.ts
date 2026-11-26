import { SaveCodecError } from './errors.js';
import { safeJsonParse, sanitizeDeep } from './sanitize.js';
import type { SaveCodecContext } from '../types.js';
import { safeLog } from './schema/index.js';

export class PureJsonSaveCodec {
  static decode(rawData: Buffer, context?: SaveCodecContext): any {
    const rawMax = context?.options?.maxBufferSizeBytes;
    const maxBytes = typeof rawMax === 'number' && Number.isFinite(rawMax) && rawMax > 0 ? Math.trunc(rawMax) : undefined;
    if (maxBytes !== undefined && rawData && rawData.length > maxBytes) {
      throw new SaveCodecError(
        `Pure JSON save payload exceeds maximum allowed size (${maxBytes} bytes)`,
        'DECOMPRESSION_FAILED'
      );
    }
    try {
      const text = rawData.toString('utf8');
      const data = safeJsonParse(text);
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        data.$type = 'PureJsonSave';
      }
      return data;
    } catch (err: any) {
      safeLog(context?.options?.logger, 'error', 'Failed to parse Pure JSON save', {
        error: err?.message ?? String(err),
      });
      if (err instanceof SaveCodecError) throw err;
      throw new SaveCodecError(`Failed to parse Pure JSON save: ${err.message}`, 'PARSE_FAILED', {
        cause: err,
      });
    }
  }

  static encode(jsonData: any, context?: SaveCodecContext): Buffer {
    try {
      const cleanData = sanitizeDeep(jsonData);
      if (cleanData && typeof cleanData === 'object') {
        delete cleanData.$type;
        delete cleanData._userMappings;
      }
      const output = JSON.stringify(cleanData);
      return Buffer.from(output, 'utf8');
    } catch (err: any) {
      safeLog(context?.options?.logger, 'error', 'Failed to encode Pure JSON save', {
        error: err?.message ?? String(err),
      });
      if (err instanceof SaveCodecError) throw err;
      throw new SaveCodecError(`Failed to encode Pure JSON save: ${err.message}`, 'PARSE_FAILED', {
        cause: err,
      });
    }
  }
}
