/// <reference types="node" />

export class TimeoutError extends Error {
  constructor(message = 'Operation timed out') {
    super(message);
    this.name = 'TimeoutError';
  }
}

export interface WithTimeoutOptions<F = never> {
  timeoutMs?: number;
  signal?: AbortSignal;
  fallbackValue?: F;
  errorMessage?: string;
}

export async function withTimeout<T, F = never>(
  promise: Promise<T>,
  options: WithTimeoutOptions<F> = {}
): Promise<T | F> {
  // Unconditionally attach error suppression handler to in-flight target promise
  // prior to checking signal?.aborted or evaluating fallbackValue, guaranteeing
  // late asynchronous rejections never escape as unhandled rejections across any return path.
  promise.catch(() => {});

  const hasFallback = 'fallbackValue' in options;
  const { timeoutMs, signal, fallbackValue, errorMessage } = options;

  if (signal?.aborted) {
    if (hasFallback) {
      return fallbackValue as F;
    }
    throw signal.reason ?? new DOMException('This operation was aborted', 'AbortError');
  }

  let timerId: NodeJS.Timeout | undefined;
  let onAbort: (() => void) | undefined;

  try {
    return await new Promise<T | F>((resolve, reject) => {
      if (typeof timeoutMs === 'number' && timeoutMs >= 0) {
        timerId = setTimeout(() => {
          if (hasFallback) {
            resolve(fallbackValue as F);
          } else {
            reject(
              new TimeoutError(
                errorMessage ?? `Operation timed out after ${timeoutMs}ms`
              )
            );
          }
        }, timeoutMs);
      }

      if (signal) {
        onAbort = () => {
          if (hasFallback) {
            resolve(fallbackValue as F);
          } else {
            reject(
              signal.reason ?? new DOMException('This operation was aborted', 'AbortError')
            );
          }
        };
        signal.addEventListener('abort', onAbort, { once: true });
      }

      promise.then(resolve, reject);
    });
  } finally {
    if (timerId) {
      clearTimeout(timerId);
    }
    if (signal && onAbort) {
      signal.removeEventListener('abort', onAbort);
    }
  }
}
