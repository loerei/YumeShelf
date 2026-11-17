# Concurrency, Async Race Conditions, Temporal Logic, and Precision Invariants

Audits single-threaded async race conditions, cross-tab coordination, multithreaded lock safety, monotonic vs. wall-clock time handling, Unicode string normalization, and numerical precision.

## Domain Audit Checklist

### 1. Single-Threaded & Cross-Tab Async Concurrency
- [ ] **Out-of-Order Async Response Guards**: When user input, route changes, or polling triggers concurrent async calls (fetch, IPC, worker tasks), verify older in-flight calls are aborted via `AbortController` OR gated by a monotonic request generation counter (`requestId === latestRequestId`) so stale responses never overwrite newer state.
- [ ] **Non-Atomic Read-Modify-Write Across `await` & Cross-Tab Locks**: Reject reading shared in-memory or persistent state before an `await` boundary and writing back a mutated value after `await` without a serialized async mutex, queue, or optimistic version check (`CAS`). When multiple browser tabs or desktop windows mutate shared client storage (`localStorage`, `IndexedDB`) or rotate tokens, coordinate via `navigator.locks.request` / `BroadcastChannel` rather than tab-local memory flags.
- [ ] **Late-Rejection Suppression in `Promise.race` / `withTimeout`**: When racing an underlying promise against a timeout timer or `AbortSignal`, attach a no-op `.catch(() => {})` to the underlying promise immediately before racing, and clear the timeout timer / remove the abort listener in `finally`. Otherwise, if the timeout rejects first and the underlying task fails later, the late rejection crashes the host process with `UnhandledPromiseRejection`.
- [ ] **Partial Batch Failure & Rollback (`Promise.all`)**: Verify concurrent fan-out operations (`Promise.all`, `errgroup`) define deterministic cleanup or `Promise.allSettled` reconciliation so one rejected task does not leave sibling mutations half-committed or resources leaked.
- [ ] **Bounded Concurrency over Unbounded `Promise.all(items.map(...))`**: Reject unbounded `Promise.all(items.map(fn))` over dynamic or large collections when executing I/O, database queries, IPC, or external API calls. Mandate a bounded concurrency pool / semaphore (e.g. `concurrency = 5..10`) to prevent connection pool exhaustion, OOM spikes, and HTTP 429 rate-limit cascades.

### 2. Multithreaded Lock & Atomic Safety
- [ ] **Deterministic Lock Acquisition Ordering**: Verify code acquiring multiple locks always acquires them in a global, deterministic key order (`idA < idB`) to prevent deadlocks.
- [ ] **CAS & ABA Protection**: Confirm lock-free atomic swaps protect against ABA state recycling using generation counters or tagged pointers.

### 3. Temporal, Clock, and Timezone Invariants
- [ ] **Monotonic Clock for Elapsed Durations**: Reject using system wall-clock (`Date.now()`, `time.Now()` wall component, `time.time()`) to measure elapsed durations, timeouts, or rate-limit windows (vulnerable to NTP clock steps and DST shifts). Mandate monotonic clocks (`performance.now()`, `process.hrtime.bigint()`, `time.monotonic()`).
- [ ] **UTC Persistence vs. IANA Timezone Recurrence**: Store point-in-time timestamps in UTC (ISO-8601 `Z` or integer epoch ms). For calendar-relative schedules (daily rollovers, billing cycles), store the explicit IANA timezone identifier (`America/New_York`, `Asia/Ho_Chi_Minh`) rather than a fixed numeric UTC offset.

### 4. Mathematical, Financial & String/Unicode Precision
- [ ] **Exact Decimal / Integer Currency Math**: Reject IEEE 754 floats (`number`, `float64`) for monetary or financial calculations. Mandate integer minor units (`bigint` cents/micros) or arbitrary-precision decimal types (`BigDecimal`, `Decimal`).
- [ ] **Integer Overflow & Division-by-Zero Guards**: Verify dynamic arithmetic checks denominator non-zero invariants and enforces saturation/bounds before multiplication or bit-shifting (`<<` in JS truncates to signed 32-bit int).
- [ ] **Unicode Normalization & Grapheme Length**: Normalize user/filesystem strings (`str.normalize("NFC")`) before equality comparison or hashing (macOS HFS+/APFS decomposes filenames to `NFD`). Distinguish byte length (`Buffer.byteLength`), UTF-16 code units (`str.length`), and user-perceived characters (`Intl.Segmenter`).

## Concrete Anti-Patterns

### Anti-Pattern 1: Stale Async Response Overwriting Newer State & Non-Atomic Read-Modify-Write

```typescript
// BAD 1: Slow response for query "re" resolves after fast response for "react", showing stale results
// BAD 2: Reading state.count before await and writing state.count + 1 after await drops concurrent increments
let currentResults: string[] = [];
export async function onSearchInputBad(query: string) {
  const results = await api.search(query);
  currentResults = results; // Race condition: out-of-order resolution overwrites newer query
}

// GOOD: Cancel prior in-flight request via AbortController and guard with monotonic sequence ID
let activeController: AbortController | null = null;
let latestSeq = 0;

export async function onSearchInputSafe(query: string) {
  activeController?.abort();
  const controller = new AbortController();
  activeController = controller;
  const seq = ++latestSeq;

  try {
    const results = await api.search(query, { signal: controller.signal });
    if (seq === latestSeq) {
      currentResults = results;
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") return;
    throw err;
  }
}
```

### Anti-Pattern 2: Wall-Clock Duration Measurement & Unnormalized Filename Comparison

```typescript
// BAD: Date.now() jumps backward on NTP adjustment, causing negative elapsed time or premature timeout.
// Unnormalized string equality fails when comparing macOS NFD filename ("e\u0301") with NFC ("é").
export function isExpiredAndMatchingBad(startMs: number, fileNameA: string, fileNameB: string): boolean {
  const elapsed = Date.now() - startMs;
  return elapsed > 5000 && fileNameA === fileNameB;
}

// GOOD: Use monotonic performance.now() for durations and NFC normalization for string comparisons
export function isExpiredAndMatchingSafe(startMonoMs: number, fileNameA: string, fileNameB: string): boolean {
  const elapsed = performance.now() - startMonoMs;
  return elapsed > 5000 && fileNameA.normalize("NFC") === fileNameB.normalize("NFC");
}
```

## Failure Modes & Mitigations

| Failure Mode | Root Cause | Mitigation |
| :--- | :--- | :--- |
| **UI / State Regression on Fast Input** | Earlier slow async call resolves after later fast call. | Abort superseded requests via `AbortController` and verify sequence token before committing state. |
| **Lost Updates Across `await` or Tabs** | Two coroutines or browser tabs read the same state before `await` and overwrite each other on resume. | Serialize mutations via an async mutex, `navigator.locks.request`, or atomic DB `UPDATE ... WHERE version = ?`. |
| **`UnhandledPromiseRejection` After Timeout** | `Promise.race` rejects early on timeout while the underlying promise rejects seconds later without a handler. | Attach `promise.catch(() => {})` before racing and clear the timeout timer in `finally`. |
| **Timeout Freeze on Clock Sync** | NTP steps system wall-clock backward during an active timeout loop. | Measure all intervals and deadlines using `performance.now()` or `time.monotonic()`. |
| **Silent File Lookup Mismatch on macOS** | Comparing NFC input string against NFD filesystem entry without normalization. | Normalize strings with `.normalize("NFC")` at ingress before indexing or comparison. |
