export const DEFAULT_SAVE_SIZE_LIMIT_BYTES = 64 * 1024 * 1024;

const SAVE_TOO_LARGE_RE = /SAVE_TOO_LARGE:(\d+|unknown):(\d+)/;

export interface ParsedSaveTooLargeError {
  actualBytes: number | null;
  limitBytes: number;
}

export function formatSaveTooLargeError(
  actualBytes: number | null | undefined,
  limitBytes: number
): string {
  const safeLimit =
    typeof limitBytes === 'number' && Number.isFinite(limitBytes) && limitBytes > 0
      ? Math.trunc(limitBytes)
      : DEFAULT_SAVE_SIZE_LIMIT_BYTES;
  const hasActual =
    typeof actualBytes === 'number' && Number.isFinite(actualBytes) && actualBytes >= 0;
  const actualToken = hasActual ? String(Math.trunc(actualBytes)) : 'unknown';
  const detail = hasActual ? `${Math.trunc(actualBytes)} > ${safeLimit}` : `> ${safeLimit}`;
  return `SAVE_TOO_LARGE:${actualToken}:${safeLimit}: Save file exceeds maximum allowed size (${detail} bytes)`;
}

export function parseSaveTooLargeError(message: unknown): ParsedSaveTooLargeError | null {
  if (typeof message !== 'string') return null;
  const match = SAVE_TOO_LARGE_RE.exec(message);
  if (!match) return null;
  const actualBytes = match[1] === 'unknown' ? null : Number.parseInt(match[1], 10);
  const limitBytes = Number.parseInt(match[2], 10);
  if (!Number.isFinite(limitBytes) || limitBytes <= 0) return null;
  if (actualBytes !== null && !Number.isFinite(actualBytes)) return null;
  return { actualBytes, limitBytes };
}

export function formatBytesMiB(bytes: number): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) {
    return '0.0 MB';
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
