export class StalenessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StalenessError';
    Object.setPrototypeOf(this, StalenessError.prototype);
  }
}

export interface StalenessTrackerOptions {
  /**
   * Timeout in milliseconds without progress before staleness is declared.
   * If <= 0, staleness checks will immediately trigger if no progress has been made.
   * If undefined, staleness tracking is disabled.
   */
  timeoutMs?: number;

  /**
   * Descriptive operation name included in error messages (e.g. "Pickle parser", "Save codec").
   * Defaults to "Operation".
   */
  operationName?: string;

  /**
   * Metric unit for progress (e.g. "byte", "item", "step").
   * Defaults to "byte".
   */
  unit?: string;

  /**
   * Optional custom error message generator.
   */
  formatErrorMessage?: (timeoutMs: number, operationName: string) => string;

  /**
   * Optional factory function to create a custom error instance (e.g., SaveCodecError).
   * If not provided, a StalenessError is thrown.
   */
  errorFactory?: (timeoutMs: number, operationName: string, unit: string) => Error;
}

/**
 * Default message generator for staleness timeout errors.
 */
export function defaultStalenessErrorMessage(
  timeoutMs: number,
  operationName: string,
  unit: string = 'byte'
): string {
  return timeoutMs <= 0
    ? `Resource limit exceeded: ${operationName} stalled (no ${unit} progress detected)`
    : `Resource limit exceeded: ${operationName} stalled (no ${unit} progress for ${timeoutMs / 1000}s)`;
}

/**
 * Reusable staleness tracker for long-running codecs and parser operations.
 * Enforces timeouts when an operation stalls without making progress on a monotonic metric.
 */
export class StalenessTracker {
  public readonly timeoutMs: number | undefined;
  public readonly operationName: string;
  public readonly unit: string;
  public readonly errorFactory?: (timeoutMs: number, operationName: string, unit: string) => Error;
  private lastProgressPos: number;
  private lastProgressTime: number;
  private readonly formatErrorMessage?: (timeoutMs: number, operationName: string) => string;

  constructor(options?: number | StalenessTrackerOptions) {
    if (typeof options === 'number') {
      this.timeoutMs = options;
      this.operationName = 'Operation';
      this.unit = 'byte';
    } else {
      this.timeoutMs = options?.timeoutMs;
      this.operationName = options?.operationName ?? 'Operation';
      this.unit = options?.unit ?? 'byte';
      this.formatErrorMessage = options?.formatErrorMessage;
      this.errorFactory = options?.errorFactory;
    }
    this.lastProgressPos = 0;
    this.lastProgressTime = Date.now();
  }

  /**
   * Whether staleness tracking is actively enabled.
   */
  get isEnabled(): boolean {
    return this.timeoutMs !== undefined;
  }

  /**
   * The metric position recorded when progress was last detected.
   */
  get lastPos(): number {
    return this.lastProgressPos;
  }

  /**
   * The timestamp (ms) when progress was last detected.
   */
  get lastTime(): number {
    return this.lastProgressTime;
  }

  /**
   * Check progress against previous position.
   * If currentPos > lastProgressPos, advances lastProgressPos and updates lastProgressTime.
   * If no progress and elapsed time exceeds timeoutMs, throws custom error from errorFactory or StalenessError.
   */
  update(currentPos: number, now: number = Date.now()): void {
    if (this.timeoutMs === undefined) {
      return;
    }

    if (currentPos > this.lastProgressPos) {
      this.lastProgressPos = currentPos;
      this.lastProgressTime = now;
      return;
    }

    const elapsed = now - this.lastProgressTime;
    if (this.timeoutMs <= 0 || elapsed >= this.timeoutMs) {
      if (this.errorFactory) {
        throw this.errorFactory(this.timeoutMs, this.operationName, this.unit);
      }
      const msg = this.formatErrorMessage
        ? this.formatErrorMessage(this.timeoutMs, this.operationName)
        : defaultStalenessErrorMessage(this.timeoutMs, this.operationName, this.unit);
      throw new StalenessError(msg);
    }
  }

  /**
   * Reset tracker to specified position and time.
   */
  reset(currentPos: number = 0, now: number = Date.now()): void {
    this.lastProgressPos = currentPos;
    this.lastProgressTime = now;
  }
}
