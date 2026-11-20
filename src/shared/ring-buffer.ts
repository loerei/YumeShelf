export class CircularRingBuffer<T> {
  private buffer: (T | undefined)[];
  private head = 0;
  private size = 0;
  private droppedCount = 0;

  constructor(readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new Error('Capacity must be a positive integer');
    }
    this.buffer = new Array(capacity);
  }

  push(item: T): void {
    let entry = item;
    if (typeof item === 'string') {
      const stripped = item.replace(/\u001b\[[0-9;]*m/g, '');
      entry = (stripped.length > 2000 ? `${stripped.slice(0, 2000)}... [truncated]` : stripped) as unknown as T;
    }
    if (this.size === this.capacity) {
      this.droppedCount++;
    }
    this.buffer[this.head] = entry;
    this.head = (this.head + 1) % this.capacity;
    if (this.size < this.capacity) this.size++;
  }

  getDroppedCount(): number {
    return this.droppedCount;
  }

  toArray(): T[] {
    const result: T[] = [];
    const start = this.size < this.capacity ? 0 : this.head;
    for (let i = 0; i < this.size; i++) {
      result.push(this.buffer[(start + i) % this.capacity] as T);
    }
    return result;
  }

  toSafeArray(maxDepth = 10): unknown[] {
    const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
    const ANSI_REGEX = /\u001b\[[0-9;]*m/g;
    const sanitize = (val: unknown, activeStack = new Set<object>(), depth = 0): unknown => {
      if (depth > maxDepth) return '[DepthExceeded]';
      if (typeof val === 'string') {
        const stripped = val.replace(ANSI_REGEX, '');
        return stripped.length > 2000 ? `${stripped.slice(0, 2000)}... [truncated]` : stripped;
      }
      if (val !== null && typeof val === 'object') {
        if (activeStack.has(val)) return '[Circular]';
        activeStack.add(val);
        try {
          if (val instanceof Error) {
            const errOut: Record<string, unknown> = Object.create(null);
            errOut.name = val.name;
            errOut.message = typeof val.message === 'string' ? sanitize(val.message, activeStack, depth + 1) : val.message;
            errOut.stack = typeof val.stack === 'string' ? sanitize(val.stack, activeStack, depth + 1) : val.stack;
            if ('cause' in val && val.cause !== undefined) {
              errOut.cause = sanitize(val.cause, activeStack, depth + 1);
            }
            if (typeof AggregateError !== 'undefined' && val instanceof AggregateError && Array.isArray(val.errors)) {
              errOut.errors = val.errors.map((e) => sanitize(e, activeStack, depth + 1));
            }
            return errOut;
          }
          if (val instanceof Date) {
            return val.toISOString();
          }
          if (val instanceof Map) {
            const mapOut: Record<string, unknown> = Object.create(null);
            for (const [k, v] of val.entries()) {
              const keyStr = typeof k === 'string' ? k : String(k);
              if (!DANGEROUS_KEYS.has(keyStr)) {
                mapOut[keyStr] = sanitize(v, activeStack, depth + 1);
              }
            }
            return mapOut;
          }
          if (val instanceof Set) {
            return Array.from(val).map((item) => sanitize(item, activeStack, depth + 1));
          }
          if (Array.isArray(val)) {
            return val.map((item) => sanitize(item, activeStack, depth + 1));
          }
          const out: Record<string, unknown> = Object.create(null);
          for (const [k, v] of Object.entries(val)) {
            if (!DANGEROUS_KEYS.has(k)) {
              out[k] = sanitize(v, activeStack, depth + 1);
            }
          }
          return out;
        } finally {
          activeStack.delete(val);
        }
      }
      if (typeof val === 'bigint') {
        return val.toString();
      }
      return val;
    };
    return this.toArray().map((entry) => sanitize(entry, new Set<object>(), 0));
  }

  toJSON(): unknown[] {
    return this.toSafeArray();
  }

  clear(): void {
    this.head = 0;
    this.size = 0;
    this.droppedCount = 0;
    this.buffer.fill(undefined);
  }
}
