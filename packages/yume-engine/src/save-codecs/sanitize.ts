/**
 * Prototype Pollution Defense & Safe Object Utilities
 */

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Checks whether a given property key is dangerous (can pollute prototypes).
 */
export function isDangerousKey(key: string): boolean {
  return DANGEROUS_KEYS.has(key);
}

/**
 * Creates a plain dictionary object with null prototype to avoid prototype inheritance attacks.
 */
export function createSafeDict<T = any>(): Record<string, T> {
  return Object.create(null);
}

/**
 * Recursively sanitizes any object or array by removing dangerous prototype keys
 * (__proto__, constructor, prototype) and returning clean data structures.
 */
export function sanitizeDeep<T = any>(val: T): T {
  if (val === null || val === undefined) {
    return val;
  }

  if (typeof val !== 'object') {
    return val;
  }

  if (Array.isArray(val)) {
    return val.map((item) => sanitizeDeep(item)) as unknown as T;
  }

  // Handle Set
  if (val instanceof Set) {
    const safeSet = new Set();
    for (const item of val) {
      safeSet.add(sanitizeDeep(item));
    }
    return safeSet as unknown as T;
  }

  // Handle plain objects / records
  const result: Record<string, any> = {};
  for (const [key, propVal] of Object.entries(val)) {
    if (isDangerousKey(key)) {
      continue;
    }
    result[key] = sanitizeDeep(propVal);
  }

  return result as T;
}

/**
 * Safely parses a JSON string, stripping dangerous prototype keys from all levels.
 */
export function safeJsonParse(text: string): any {
  const parsed = JSON.parse(text, (key, value) => {
    if (isDangerousKey(key)) {
      return undefined;
    }
    return value;
  });
  return sanitizeDeep(parsed);
}
