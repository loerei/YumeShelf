const winUserDirRegex = /(?:[a-zA-Z]:(?:\\\\|\\|\/)(?:Users|Documents and Settings)(?:\\\\|\\|\/)[^\\\/":,;*?<>|\r\n]+)(?=(?:\\\\|\\|\/|"|'|`|\)|\]|:|,|;|\r?\n|$))/gi;
const macUserDirRegex = /(?:\/Users\/[^/":,;*?<>|\r\n]+)(?=(?:\/|"|'|`|\)|\]|:|,|;|\r?\n|$))/gi;
const linuxUserDirRegex = /(?:\/home\/[^/":,;*?<>|\r\n]+)(?=(?:\/|"|'|`|\)|\]|:|,|;|\r?\n|$))/g;

export function sanitizeUserPaths(text: unknown): string {
  let str: string;
  if (typeof text === 'string') {
    str = text;
  } else if (text === null || text === undefined) {
    return '';
  } else {
    try {
      str = String(text);
    } catch {
      return '';
    }
  }
  return str
    .replace(winUserDirRegex, '<USER_DIR>')
    .replace(macUserDirRegex, '<USER_DIR>')
    .replace(linuxUserDirRegex, '<USER_DIR>');
}

export function sanitizeLoneSurrogates(input: string): string {
  return input.replace(
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
    '\uFFFD'
  );
}

export interface SanitizedErrorRecord {
  name?: string;
  message: string;
  stack?: string;
}

export function extractSanitizedCauseChain(err: unknown, maxDepth = 5): SanitizedErrorRecord[] {
  const chain: SanitizedErrorRecord[] = [];
  let current: unknown = err;
  let depth = 0;
  const seen = new Set<unknown>();

  while (current !== null && current !== undefined && depth < maxDepth) {
    if (seen.has(current)) {
      break;
    }
    seen.add(current);

    if (current instanceof Error) {
      chain.push({
        name: current.name,
        message: sanitizeUserPaths(current.message || 'Unknown error'),
        stack: current.stack ? sanitizeUserPaths(current.stack) : undefined,
      });
      current = (current as { cause?: unknown }).cause;
    } else {
      chain.push({
        message: sanitizeUserPaths(current) || 'Unknown error',
      });
      break;
    }
    depth++;
  }
  return chain;
}

export function registerGlobalErrorSanitizer(
  targetWindow: Window | any = typeof window !== 'undefined' ? window : undefined,
  prefix: string = '[Renderer]'
): () => void {
  if (!targetWindow || typeof targetWindow.addEventListener !== 'function') {
    return () => {};
  }

  const errorHandler = (event: any) => {
    const rawError = event.error;
    const sanitizedError = rawError instanceof Error
      ? {
          name: rawError.name,
          message: sanitizeUserPaths(rawError.message || ''),
          stack: rawError.stack ? sanitizeUserPaths(rawError.stack) : undefined,
          causeChain: rawError.cause ? extractSanitizedCauseChain(rawError.cause) : undefined,
        }
      : typeof rawError === 'string'
        ? sanitizeUserPaths(rawError)
        : rawError;

    console.error(`${prefix} Uncaught error:`, {
      message: sanitizeUserPaths(event.message || ''),
      filename: event.filename ? sanitizeUserPaths(event.filename) : '',
      lineno: event.lineno,
      colno: event.colno,
      error: sanitizedError,
    });
  };

  const unhandledRejectionHandler = (event: any) => {
    const reason = event.reason;
    const sanitizedReason = reason instanceof Error
      ? {
          name: reason.name,
          message: sanitizeUserPaths(reason.message || ''),
          stack: reason.stack ? sanitizeUserPaths(reason.stack) : undefined,
          causeChain: reason.cause ? extractSanitizedCauseChain(reason.cause) : undefined,
        }
      : typeof reason === 'string'
        ? sanitizeUserPaths(reason)
        : reason;

    console.error(`${prefix} Unhandled rejection:`, {
      reason: sanitizedReason,
    });
  };

  targetWindow.addEventListener('error', errorHandler);
  targetWindow.addEventListener('unhandledrejection', unhandledRejectionHandler);

  return () => {
    targetWindow.removeEventListener('error', errorHandler);
    targetWindow.removeEventListener('unhandledrejection', unhandledRejectionHandler);
  };
}
