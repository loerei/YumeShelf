import { SaveCodecError } from './errors.js';

export class BakinSgsSaveCodec {
  static decode(_rawData: Buffer): any {
    throw new SaveCodecError(
      'SGS (RPG Developer Bakin) save file format is currently not supported for editing.',
      'UNSUPPORTED_FORMAT'
    );
  }

  static encode(_jsonData: any): Buffer {
    throw new SaveCodecError(
      'SGS (RPG Developer Bakin) save file format is currently not supported for editing.',
      'UNSUPPORTED_FORMAT'
    );
  }
}
