# OS Resource Handling, Stream Pipelines, and Subprocess Lifecycle Cleanup

Audits OS handle cleanup, managed stream pipelines (`stream.pipeline`), subprocess spawn hardening, live stream buffer clamping, and two-stage process termination.

## Domain Audit Checklist

### 1. Resource Allocations, Stream Pipelines & RAII Wrappers
- [ ] **Immediate Resource Cleanup**: Verify that every allocated OS handle (file descriptors, sockets, database connections, memory maps) uses deterministic cleanup blocks (`defer`, `try/finally`, `using` / `Symbol.asyncDispose`, RAII destructors).
- [ ] **Managed Stream Pipelines (`pipeline` over `.pipe()`)**: Reject bare `readable.pipe(writable)` chains in Node.js (which fail to destroy sibling streams or close file descriptors when one stream errors or closes prematurely). Mandate `pipeline(src, transform, dest, { signal })` from `node:stream/promises`.
- [ ] **Unbounded Buffer Memory**: Reject reading raw streams, child process pipes, or file allocations into unbounded in-memory buffers without explicit byte ceilings.

### 2. Signal Handling, Subprocess Lifecycle & Stream Bounds
- [ ] **Process Signal Handlers**: Confirm standalone applications catch `SIGTERM` and `SIGINT` signals to flush buffered log entries, stop accepting incoming requests, finish active tasks, and close open handles. (Reusable libraries must never register global process signal handlers; see `EDGE-LIBRARY-BOUNDARIES.md`).
- [ ] **Subprocess Spawn & Live Stream Clamping**: Spawn child processes with `shell: false` and `windowsHide: true` (preventing flashing `cmd.exe` console windows in Windows GUI/desktop apps). Track accumulated `stdout` + `stderr` bytes inside live `data` stream handlers and terminate the child immediately if output exceeds `maxBuffer` before invoking `Buffer.concat`.
- [ ] **Two-Stage Subprocess Termination (`SIGTERM` $\to$ `SIGKILL`)**: On timeout, parent cancellation (`AbortSignal`), or shutdown, send `SIGTERM` first, start a grace-period timer with `.unref()`, and escalate to `SIGKILL` if the child has not exited when the grace window expires.

## Concrete Anti-Patterns

### Anti-Pattern 1: Unbounded Subprocess Pipe Buffering & Single-Stage Kill Hang

```typescript
// BAD:
// 1. Missing windowsHide flashes console window on Windows desktop.
// 2. Accumulates unbounded stdout chunks in RAM before checking size (OOM on runaway child).
// 3. SIGTERM alone hangs forever if child process is stuck in uninterruptible I/O or ignores SIGTERM.
import { spawn } from "node:child_process";

export function runToolBad(bin: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args);
    const chunks: Buffer[] = [];
    child.stdout.on("data", (c) => chunks.push(c));
    child.on("close", () => resolve(Buffer.concat(chunks)));
    child.on("error", reject);
  });
}

// GOOD: shell: false, windowsHide: true, live maxBuffer byte clamping, and SIGTERM -> SIGKILL escalation
export function runToolSafe(
  bin: string,
  args: string[],
  opts: { maxBufferBytes: number; gracePeriodMs?: number; signal?: AbortSignal }
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { shell: false, windowsHide: true });
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let killTimer: ReturnType<typeof setTimeout> | undefined;

    const terminateChild = () => {
      if (child.exitCode !== null) return;
      child.kill("SIGTERM");
      killTimer = setTimeout(() => {
        if (child.exitCode === null) child.kill("SIGKILL");
      }, opts.gracePeriodMs ?? 2000);
      killTimer.unref();
    };

    const onAbort = () => terminateChild();
    opts.signal?.addEventListener("abort", onAbort, { once: true });

    child.stdout.on("data", (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (totalBytes > opts.maxBufferBytes) {
        child.kill("SIGKILL");
        reject(new Error(`Subprocess output exceeded ${opts.maxBufferBytes} bytes`));
        return;
      }
      chunks.push(chunk);
    });

    child.on("close", (code) => {
      if (killTimer) clearTimeout(killTimer);
      opts.signal?.removeEventListener("abort", onAbort);
      if (code === 0) resolve(Buffer.concat(chunks, totalBytes));
      else reject(new Error(`Exited with code ${code}`));
    });
    child.on("error", (err) => {
      if (killTimer) clearTimeout(killTimer);
      opts.signal?.removeEventListener("abort", onAbort);
      reject(err);
    });
  });
}
```

## Failure Modes & Mitigations

| Failure Mode | Root Cause | Mitigation |
| :--- | :--- | :--- |
| **Host OOM on Runaway Child Process** | Child prints infinite output while parent pushes all chunks into an array before `Buffer.concat`. | Track cumulative `totalBytes` on every `data` event and `SIGKILL` immediately when `totalBytes > maxBufferBytes`. |
| **Zombie / Hung Child Process** | Parent sends `SIGTERM` on timeout, but hung child ignores `SIGTERM` and stays alive indefinitely. | Escalate from `SIGTERM` to `SIGKILL` after a bounded grace timer with `.unref()`. |
| **Leaked File Descriptors on Stream Error** | `readable.pipe(writable)` leaves source/destination streams open when a transform or write errors out. | Use `await pipeline(readable, transform, writable, { signal })` from `node:stream/promises`. |
| **Flashing Console Windows on Windows** | Spawning CLI helpers from Electron/Tauri/Node on Windows without `windowsHide: true`. | Always pass `windowsHide: true` and `shell: false` in `spawn`/`execFile` options. |
