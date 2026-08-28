import { SaveCodecError } from './errors.js';
import { safeJsonParse, sanitizeDeep } from './sanitize.js';

export class PureJsonSaveCodec {
  static decode(rawData: Buffer): any {
    try {
      const text = rawData.toString('utf8');
      const data = safeJsonParse(text);
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        data.$type = 'PureJsonSave';
      }
      return data;
    } catch (err: any) {
      if (err instanceof SaveCodecError) throw err;
      throw new SaveCodecError(`Failed to parse Pure JSON save: ${err.message}`, 'PARSE_FAILED');
    }
  }

  static encode(jsonData: any): Buffer {
    try {
      const cleanData = sanitizeDeep(jsonData);
      if (cleanData && typeof cleanData === 'object') {
        delete cleanData.$type;
        delete cleanData._userMappings;
      }
      const output = JSON.stringify(cleanData);
      return Buffer.from(output, 'utf8');
    } catch (err: any) {
      if (err instanceof SaveCodecError) throw err;
      throw new SaveCodecError(`Failed to encode Pure JSON save: ${err.message}`, 'PARSE_FAILED');
    }
  }
}
