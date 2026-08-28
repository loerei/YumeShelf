import { spawn, type ChildProcess } from 'node:child_process';
import {
  DEFAULT_GRACE_PERIOD_MS,
  DEFAULT_MAX_BUFFER_BYTES,
  DEFAULT_PROCESS_TIMEOUT_MS,
  type IProcessRunner,
  type ProcessRunOptions,
  type ProcessRunResult,
} from './types.js';
import { SaveCodecError } from '../saves/errors.js';

export class NodeProcessRunner implements IProcessRunner {
  async run(
    command: string,
    args: string[],
    options: ProcessRunOptions = {}
  ): Promise<ProcessRunResult> {
    const timeout = options.timeout ?? DEFAULT_PROCESS_TIMEOUT_MS;
    const gracePeriod = options.gracePeriod ?? DEFAULT_GRACE_PERIOD_MS;
    const maxBuffer = options.maxBuffer ?? DEFAULT_MAX_BUFFER_BYTES;

    return new Promise((resolve, reject) => {
      let child: ChildProcess;
      try {
        // SECURITY MANDATE: shell is strictly false, direct array arguments
        child = spawn(command, args, {
          cwd: options.cwd,
          env: options.env ? { ...process.env, ...options.env } : process.env,
          shell: false,
          windowsHide: true,
        });
      } catch (err: any) {
        return reject(
          new SaveCodecError(
            `Failed to spawn process "${command}": ${err?.message || String(err)}`,
            'PROCESS_EXECUTION_FAILED'
          )
        );
      }

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      let totalStdoutBytes = 0;
      let totalStderrBytes = 0;
      let timedOut = false;
      let bufferOverflowed = false;
      let isSettled = false;
      let graceTimer: NodeJS.Timeout | null = null;
      let timeoutTimer: NodeJS.Timeout | null = null;

      const cleanupTimers = () => {
        if (timeoutTimer) {
          clearTimeout(timeoutTimer);
          timeoutTimer = null;
        }
        if (graceTimer) {
          clearTimeout(graceTimer);
          graceTimer = null;
        }
      };

      if (timeout > 0 && Number.isFinite(timeout)) {
        timeoutTimer = setTimeout(() => {
          timedOut = true;
          // Stage 1: SIGTERM
          try {
            child.kill('SIGTERM');
          } catch {
            // ignore
          }

          // Stage 2: SIGKILL escalation after gracePeriod
          graceTimer = setTimeout(() => {
            try {
              child.kill('SIGKILL');
            } catch {
              // ignore
            }
          }, gracePeriod);
        }, timeout);
      }

      child.stdout?.on('data', (chunk: Buffer) => {
        totalStdoutBytes += chunk.length;
        if (totalStdoutBytes + totalStderrBytes > maxBuffer) {
          bufferOverflowed = true;
          cleanupTimers();
          try {
            child.kill('SIGKILL');
          } catch {
            // ignore
          }
          if (!isSettled) {
            isSettled = true;
            reject(
              new SaveCodecError(
                `Process output exceeded maximum buffer limit of ${maxBuffer} bytes`,
                'PROCESS_BUFFER_OVERFLOW'
              )
            );
          }
          return;
        }
        stdoutChunks.push(chunk);
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        totalStderrBytes += chunk.length;
        if (totalStdoutBytes + totalStderrBytes > maxBuffer) {
          bufferOverflowed = true;
          cleanupTimers();
          try {
            child.kill('SIGKILL');
          } catch {
            // ignore
          }
          if (!isSettled) {
            isSettled = true;
            reject(
              new SaveCodecError(
                `Process output exceeded maximum buffer limit of ${maxBuffer} bytes`,
                'PROCESS_BUFFER_OVERFLOW'
              )
            );
          }
          return;
        }
        stderrChunks.push(chunk);
      });

      child.on('error', (err: any) => {
        cleanupTimers();
        if (isSettled) return;
        isSettled = true;
        reject(
          new SaveCodecError(
            `Process execution failed for "${command}": ${err?.message || String(err)}`,
            'PROCESS_EXECUTION_FAILED'
          )
        );
      });

      child.on('close', (code, signal) => {
        cleanupTimers();
        if (isSettled) return;
        isSettled = true;

        if (timedOut) {
          return reject(
            new SaveCodecError(
              `Process execution timed out after ${timeout}ms`,
              'PROCESS_TIMEOUT'
            )
          );
        }

        if (bufferOverflowed) {
          return; // already rejected
        }

        const stdout = Buffer.concat(stdoutChunks).toString('utf8');
        const stderr = Buffer.concat(stderrChunks).toString('utf8');
        const exitCode = code ?? (signal ? 1 : 0);

        resolve({
          exitCode,
          stdout,
          stderr,
        });
      });
    });
  }
}
