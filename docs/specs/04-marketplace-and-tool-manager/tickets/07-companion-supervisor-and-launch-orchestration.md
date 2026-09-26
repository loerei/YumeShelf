# 07 — Companion Supervisor & Launch Orchestration

## Epic
PRD 04: Community Add-on Marketplace, Task Runner & Cascading Tool Manager

## What to build
The `CompanionSupervisor` service managing external companion processes (MTool, Textractor), credential/environment variable injection, process tree termination (`taskkill /F /T /PID <pid>` on Windows), mockable spawner and clock test seams, and integration with `PlaytimeSessionManager` lifecycle hooks and 2-tier concurrency lock.

## Explicit Assumptions & Boundaries
- Companion processes are guaranteed to terminate cleanly when the main game process exits or crashes.
- Concurrency lock: `inFlightLaunches` transient launch lock and active session state are maintained in `PlaytimeSessionManager`, rejecting concurrent launches with typed `ConcurrentLaunchError` and background task conflicts with typed `TaskRunningConflictError`.
- Credentials and sensitive tokens are injected via process environment variables or memory, never written to disk logs or leaked in unredacted exception messages.

## Blocked by
- 03 — Credential Vault & Secure Main-to-Renderer IPC
- 06.2 — Add-on Transactional Rollback & Crash Recovery

## Status
ready-for-agent

## Acceptance criteria
- [ ] Implement `CompanionSupervisor` under `src/main/addons/`, supporting optional `spawnFn?: typeof child_process.spawn`, `killTreeFn?: (pid: number) => Promise<void>`, and `gracePeriodMs?: number` (defaulting to 3,000ms, configurable in tests) in constructor for deterministic testability.
- [ ] Implement companion process spawning passing decrypted credentials and environment variables using `child_process.spawn` with explicit argument arrays (`args: string[]`), `shell: false`, and parameter sanitization. Prohibit raw `.bat` or `.cmd` script entry points without an explicit runtime interpreter to eliminate CVE-2024-27980 command injection. Ensure all decrypted credentials in argument logging and error messages are sanitized with `[REDACTED]`.
- [ ] Enforce non-blocking stdio configuration and stream backpressure handling for companion processes:
  - Default background execution to `stdio: ['ignore', 'ignore', 'ignore']` when stdout/stderr log capture is disabled.
  - When log capture is enabled, stream stdout and stderr into a bounded rolling circular buffer (e.g. $\le 1\text{MB}$ in-memory capacity) with continuous drain to guarantee child processes never block on filled 64KB OS pipe buffers.
- [ ] Implement cross-platform process tree supervision and disposal (`dispose(): Promise<void>`):
  - Windows: Execute `taskkill /F /T /PID <pid>` on shutdown/cleanup to guarantee complete process tree termination.
  - POSIX / Linux: Process group isolation (`detached: true`, `pgid`) and 2-stage shutdown escalation in `terminate()` (send `SIGTERM`, wait `gracePeriodMs`, and escalate to `SIGKILL`).
  - Linux / Wine: Inherit target game's `WINEPREFIX` and Wine environment variables when launching companion `.exe` binaries.
- [ ] Wire add-on lifecycle into `PlaytimeSessionManager` via asynchronous lifecycle hooks and `inFlightLaunches` lock:
  - `onBeforeLaunch`: Acquire `inFlightLaunches` lock $\to$ `AddonLifecycleService.deployShims()` $\to$ `CompanionSupervisor.spawn()`.
  - `onSessionTerminated`: Triggered asynchronously upon game process exit; `CompanionSupervisor.terminate()` $\to$ `AddonLifecycleService.revertShims()` $\to$ release active session state.
  - Failure Rollback: Track all actively spawned PIDs during launch; if `CompanionSupervisor.spawn()` or game process launch throws an error, catch the exception, immediately terminate all already spawned companion processes before invoking `AddonLifecycleService.revertShims()`, release `inFlightLaunches` lock, and propagate a typed launch failure error to UI.
- [ ] End-to-end integration tests verifying in-flight concurrency rejection, companion process lifecycle, launch orchestration, orphan companion termination on failure rollback, and process tree termination using synthetic mock child process fixtures with `PassThrough` duplex streams (`stdout`, `stderr`, `stdin`) and `setImmediate` event emission for deterministic signal/exit propagation in CI. Include explicit `afterEach` asynchronous teardown hooks guaranteeing all spawned child process groups are terminated and pipe handles closed.
- [ ] Execute automated tests via `npm run test:node -- tests/companion-supervisor.test.js`.
