/**
 * Determines whether an error represents an explicit user cancellation or abort signal.
 * Avoids ambient fault masking by strictly requiring cancellation-specific names, codes,
 * flags, exact "aborted" matching, or explicit user/operation cancellation phrases,
 * banning bare substring "aborted" matching that could mask system/crypto failures.
 */
export function isCancellationError(err: unknown): boolean {
  if (err === null || err === undefined) {
    return false;
  }
  if (typeof err === 'object') {
    const errorObj = err as Record<string, unknown>;
    if (
      errorObj.name === 'AbortError' ||
      errorObj.name === 'CanceledError' ||
      errorObj.code === 'ERR_CANCELED' ||
      errorObj.isCancelled === true ||
      errorObj.isCanceled === true
    ) {
      return true;
    }
    if (typeof errorObj.message === 'string') {
      const msg = errorObj.message.trim();
      if (msg.toLowerCase() === 'aborted') {
        return true;
      }
      return (
        /\buser\s+cancell?ed\b/i.test(msg) ||
        /\boperation\s+cancell?ed\b/i.test(msg) ||
        /\b(cancelled|canceled)\b/i.test(msg) ||
        /\b(user|operation)\s+aborted\b/i.test(msg) ||
        /\b(the\s+)?operation\s+was\s+aborted\b/i.test(msg) ||
        /\b(the\s+)?user\s+aborted\b/i.test(msg) ||
        /\baborted\s+by\s+user\b/i.test(msg)
      );
    }
  }
  if (typeof err === 'string') {
    const str = err.trim();
    if (str.toLowerCase() === 'aborted') {
      return true;
    }
    return (
      /\buser\s+cancell?ed\b/i.test(str) ||
      /\boperation\s+cancell?ed\b/i.test(str) ||
      /\b(cancelled|canceled)\b/i.test(str) ||
      /\b(user|operation)\s+aborted\b/i.test(str) ||
      /\b(the\s+)?operation\s+was\s+aborted\b/i.test(str) ||
      /\b(the\s+)?user\s+aborted\b/i.test(str) ||
      /\baborted\s+by\s+user\b/i.test(str)
    );
  }
  return false;
}
