import { DEFAULT_MAX_DECOMPRESSED_BYTES, type SaveCodecOptions } from '../types.js';

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

export function resolveMaxDecompressedBytes(
  options?: Pick<SaveCodecOptions, 'maxBufferSizeBytes' | 'allowLargeSaves'>
): number | undefined {
  if (options?.allowLargeSaves === true || options?.maxBufferSizeBytes === Number.POSITIVE_INFINITY) {
    return undefined;
  }
  const rawMax = options?.maxBufferSizeBytes;
  if (typeof rawMax === 'number' && Number.isFinite(rawMax) && rawMax > 0) {
    return Math.trunc(rawMax);
  }
  return DEFAULT_MAX_DECOMPRESSED_BYTES;
}

export function formatSaveTooLargeCodecMessage(
  actualBytes: number | null | undefined,
  limitBytes: number,
  label = 'Save payload'
): string {
  const safeLimit = Math.trunc(limitBytes);
  const hasActual =
    typeof actualBytes === 'number' && Number.isFinite(actualBytes) && actualBytes >= 0;
  const actualToken = hasActual ? String(Math.trunc(actualBytes)) : 'unknown';
  return `SAVE_TOO_LARGE:${actualToken}:${safeLimit}: ${label} exceeds maximum allowed size (${safeLimit} bytes)`;
}

export function isZlibBufferLimitError(err: unknown): boolean {
  return Boolean(
    err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code?: unknown }).code === 'ERR_BUFFER_TOO_LARGE'
  );
}
