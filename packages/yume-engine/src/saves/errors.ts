/**
 * Save Codec Domain Errors
 */

export type SaveCodecErrorCode =
  | 'CHECKSUM_FAILED'
  | 'DECOMPRESSION_FAILED'
  | 'PARSE_FAILED'
  | 'UNSUPPORTED_FORMAT'
  | 'PROCESS_TIMEOUT'
  | 'PROCESS_BUFFER_OVERFLOW'
  | 'PROCESS_EXECUTION_FAILED';

export class SaveCodecError extends Error {
  readonly code: SaveCodecErrorCode;

  constructor(message: string, code: SaveCodecErrorCode, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'SaveCodecError';
    this.code = code;
    if (options && 'cause' in options && this.cause === undefined) {
      this.cause = options.cause;
    }
    Object.setPrototypeOf(this, SaveCodecError.prototype);
  }
}
