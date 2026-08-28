/**
 * Process Runner Core Interfaces and Defaults
 * Enforces secure non-shell execution and resource boundary clamps.
 */

export interface ProcessRunOptions {
  cwd?: string;
  timeout?: number;
  env?: Record<string, string>;
  maxBuffer?: number;
  gracePeriod?: number;
}

export interface ProcessRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface IProcessRunner {
  /**
   * Executes an external process securely with direct arguments array and shell: false.
   */
  run(
    command: string,
    args: string[],
    options?: ProcessRunOptions
  ): Promise<ProcessRunResult>;
}

export const DEFAULT_PROCESS_TIMEOUT_MS = 30000;
export const DEFAULT_GRACE_PERIOD_MS = 3000;
export const DEFAULT_MAX_BUFFER_BYTES = 10 * 1024 * 1024; // 10MB
