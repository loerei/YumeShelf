import {
  DEFAULT_MAX_BUFFER_BYTES,
  DEFAULT_PROCESS_TIMEOUT_MS,
  type IProcessRunner,
  type ProcessRunOptions,
  type ProcessRunResult,
} from './types.js';
import { SaveCodecError } from '../saves/errors.js';

export interface RecordedProcessCall {
  command: string;
  args: string[];
  options?: ProcessRunOptions;
}

export type MockProcessHandler = (
  command: string,
  args: string[],
  options?: ProcessRunOptions
) => Promise<ProcessRunResult> | ProcessRunResult;

export class MockProcessRunner implements IProcessRunner {
  public calls: RecordedProcessCall[] = [];
  private handlers: Array<{
    matcher: (command: string, args: string[]) => boolean;
    handler: MockProcessHandler;
  }> = [];
  private defaultHandler?: MockProcessHandler;

  /**
   * Register a dynamic handler matched by custom predicate.
   */
  registerHandler(
    matcher: (command: string, args: string[]) => boolean,
    handler: MockProcessHandler
  ): this {
    this.handlers.push({ matcher, handler });
    return this;
  }

  /**
   * Register a handler for a specific command name or path.
   */
  registerCommand(
    commandName: string,
    result: ProcessRunResult | MockProcessHandler
  ): this {
    const handler: MockProcessHandler =
      typeof result === 'function' ? result : () => result;
    return this.registerHandler(
      (cmd) =>
        cmd === commandName ||
        cmd.endsWith(`/${commandName}`) ||
        cmd.endsWith(`\\${commandName}`),
      handler
    );
  }

  /**
   * Fallback handler when no registered matchers match.
   */
  setDefaultHandler(handler: MockProcessHandler): this {
    this.defaultHandler = handler;
    return this;
  }

  async run(
    command: string,
    args: string[],
    options: ProcessRunOptions = {}
  ): Promise<ProcessRunResult> {
    this.calls.push({ command, args, options });

    const maxBuffer = options.maxBuffer ?? DEFAULT_MAX_BUFFER_BYTES;

    for (const entry of this.handlers) {
      if (entry.matcher(command, args)) {
        const res = await entry.handler(command, args, options);
        return this.enforceLimits(res, maxBuffer);
      }
    }

    if (this.defaultHandler) {
      const res = await this.defaultHandler(command, args, options);
      return this.enforceLimits(res, maxBuffer);
    }

    return {
      exitCode: 0,
      stdout: '',
      stderr: '',
    };
  }

  private enforceLimits(res: ProcessRunResult, maxBuffer: number): ProcessRunResult {
    const stdoutBytes = Buffer.byteLength(res.stdout || '', 'utf8');
    const stderrBytes = Buffer.byteLength(res.stderr || '', 'utf8');
    if (stdoutBytes + stderrBytes > maxBuffer) {
      throw new SaveCodecError(
        `Process output exceeded maximum buffer limit of ${maxBuffer} bytes`,
        'PROCESS_BUFFER_OVERFLOW'
      );
    }
    return res;
  }

  /**
   * Utility helper to simulate a timeout error.
   */
  simulateTimeout(timeoutMs = DEFAULT_PROCESS_TIMEOUT_MS): never {
    throw new SaveCodecError(
      `Process execution timed out after ${timeoutMs}ms`,
      'PROCESS_TIMEOUT'
    );
  }

  reset(): void {
    this.calls = [];
    this.handlers = [];
    this.defaultHandler = undefined;
  }
}
