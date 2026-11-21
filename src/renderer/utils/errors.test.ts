import { describe, expect, it } from 'vitest';
import { isCancellationError } from './errors';

describe('isCancellationError', () => {
  it('returns false for null, undefined, numbers, booleans, and empty values', () => {
    expect(isCancellationError(null)).toBe(false);
    expect(isCancellationError(undefined)).toBe(false);
    expect(isCancellationError(0)).toBe(false);
    expect(isCancellationError(42)).toBe(false);
    expect(isCancellationError(false)).toBe(false);
    expect(isCancellationError(true)).toBe(false);
    expect(isCancellationError('')).toBe(false);
    expect(isCancellationError({})).toBe(false);
  });

  it('recognizes DOMException AbortError and Error with name AbortError or CanceledError', () => {
    const domAbort = new DOMException('The operation was aborted.', 'AbortError');
    expect(isCancellationError(domAbort)).toBe(true);

    const abortErr = new Error('Some message');
    abortErr.name = 'AbortError';
    expect(isCancellationError(abortErr)).toBe(true);

    const canceledErr = new Error('Request canceled');
    canceledErr.name = 'CanceledError';
    expect(isCancellationError(canceledErr)).toBe(true);
  });

  it('recognizes ERR_CANCELED code and isCancelled / isCanceled boolean flags', () => {
    expect(isCancellationError({ code: 'ERR_CANCELED', message: 'Request failed' })).toBe(true);
    expect(isCancellationError({ isCancelled: true })).toBe(true);
    expect(isCancellationError({ isCanceled: true })).toBe(true);
    expect(isCancellationError({ isCancelled: false, isCanceled: false })).toBe(false);
  });

  it('recognizes exact "Aborted" Error (Ticket 09.2.1 seam) and explicit user/operation cancellation messages', () => {
    expect(isCancellationError(new Error('Aborted'))).toBe(true);
    expect(isCancellationError(new Error('  aborted  '))).toBe(true);
    expect(isCancellationError(new Error('The operation was aborted'))).toBe(true);
    expect(isCancellationError(new Error('The user aborted a request.'))).toBe(true);
    expect(isCancellationError(new Error('Operation aborted by user'))).toBe(true);
    expect(isCancellationError(new Error('User cancelled the load'))).toBe(true);
    expect(isCancellationError(new Error('Operation canceled'))).toBe(true);
    expect(isCancellationError(new Error('Error invoking remote method: load cancelled'))).toBe(true);
  });

  it('recognizes exact string "aborted", "canceled", and explicit cancellation phrases in plain strings', () => {
    expect(isCancellationError('aborted')).toBe(true);
    expect(isCancellationError('Aborted')).toBe(true);
    expect(isCancellationError('canceled')).toBe(true);
    expect(isCancellationError('cancelled')).toBe(true);
    expect(isCancellationError('The operation was aborted')).toBe(true);
    expect(isCancellationError('The user aborted a request.')).toBe(true);
    expect(isCancellationError('aborted by user')).toBe(true);
  });

  it('does not falsely match unrelated Error instances or system/crypto abort failures', () => {
    expect(isCancellationError(new Error('Decryption aborted'))).toBe(false);
    expect(isCancellationError(new Error('File read aborted'))).toBe(false);
    expect(isCancellationError(new Error('Save aborted due to disk error'))).toBe(false);
    expect(isCancellationError(new Error('ENOENT: no such file or directory'))).toBe(false);
    expect(isCancellationError(new Error('Corrupt save header'))).toBe(false);
    expect(isCancellationError('Decryption aborted')).toBe(false);
    expect(isCancellationError('File read aborted')).toBe(false);
    expect(isCancellationError('Save aborted due to disk error')).toBe(false);
  });
});
