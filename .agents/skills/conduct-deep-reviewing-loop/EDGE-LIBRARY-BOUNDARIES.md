# Library Boundary Safety, Lifecycle Disposal, and Callback Isolation

Audits host process non-interference, `AbortSignal` listener cleanup, deterministic resource disposal (`Symbol.asyncDispose`), caller input immutability, and user callback exception safety in libraries and SDKs.

## Domain Audit Checklist

### 1. Ban Host Process Hijacking
- [ ] **No Global Process Signal or Exception Listeners**: Libraries MUST NEVER register `process.on("SIGTERM")`, `process.on("SIGINT")`, `process.on("uncaughtException")`, `process.on("unhandledRejection")`, or `window.onerror`. Lifecycle termination is owned exclusively by the host application.
- [ ] **No Process Exit Calls**: Libraries MUST NEVER invoke `process.exit()`, `os._exit()`, `std::process::exit()`, or `panic!()` on runtime errors.

### 2. Deterministic Disposal & `AbortSignal` Listener Hygiene
- [ ] **Explicit Disposal Protocol (`dispose` / `Symbol.asyncDispose`)**: Stateful library clients (connection pools, file watchers, worker bridges, caches) MUST expose an explicit, idempotent `close()` / `dispose()` method (and `[Symbol.asyncDispose]` / `[Symbol.dispose]`, Python `__aenter__`/`__aexit__`, or Go `Close()`) that releases all internal timers (`unref()` or `clearInterval`), sockets, and handles.
- [ ] **`AbortSignal` Listener Removal in `finally`**: When attaching a one-off `abort` listener to a caller-supplied `AbortSignal` (`signal.addEventListener("abort", onAbort, { once: true })`), ALWAYS call `signal.removeEventListener("abort", onAbort)` inside the `finally` block! Otherwise, when a host application reuses a long-lived `AbortController` across thousands of library calls, un-aborted listeners accumulate in memory and trigger `MaxListenersExceededWarning` leaks.

### 3. Caller Input Mutation Isolation
- [ ] **Defensive Input Cloning / Readonly Contracts**: Never mutate objects, arrays, or `Headers` passed in by the caller (`options`, `payload`), and shallow/deep clone mutable configuration objects on entry so caller mutations occurring mid-flight across an `await` boundary cannot corrupt active library operations.

### 4. User Callback & Interceptor Exception Isolation
- [ ] **Guard State & Locks Across User Hooks**: When invoking caller-supplied callbacks (`onProgress`, `onRetry`, `beforeRequest`, event listeners), never hold internal mutexes across the callback invocation, and wrap callback execution (or use `try/finally`) so an exception thrown by user code cannot leave the library's internal state machine, queue, or connection pool permanently locked.

## Concrete Anti-Patterns

### Anti-Pattern 1: `AbortSignal` Listener Leak, Input Object Mutation, and Callback Lock Poisoning

```typescript
// BAD:
// 1. Mutates caller's headers object directly.
// 2. Leaks 'abort' listener on long-lived caller AbortSignal when request succeeds normally.
// 3. If caller's onProgress callback throws, internal 'inFlight' lock is never released!
export class DownloaderBad {
  private inFlight = false;

  async download(url: string, opts: { headers: Record<string, string>; signal?: AbortSignal; onProgress?: (n: number) => void }) {
    this.inFlight = true;
    opts.headers["X-Internal-Secret"] = "token"; // Mutates caller's object!
    opts.signal?.addEventListener("abort", () => this.cancel()); // Leaked if download succeeds without abort!
    const bytes = await fetchBytes(url, opts.headers);
    opts.onProgress?.(bytes.length); // If user callback throws, this.inFlight stays true forever!
    this.inFlight = false;
    return bytes;
  }
  private cancel() {}
}

// GOOD: Defensive input copy, removeEventListener in finally, and try/finally lock safety around user callback
export class DownloaderSafe {
  private inFlight = false;

  async download(
    url: string,
    opts: { readonly headers?: Readonly<Record<string, string>>; signal?: AbortSignal; onProgress?: (n: number) => void }
  ) {
    opts.signal?.throwIfAborted();
    this.inFlight = true;
    const requestHeaders = { ...opts.headers }; // Defensive copy; caller object untouched
    const onAbort = () => this.cancel();
    opts.signal?.addEventListener("abort", onAbort, { once: true });

    try {
      const bytes = await fetchBytes(url, requestHeaders, opts.signal);
      opts.onProgress?.(bytes.length);
      return bytes;
    } finally {
      opts.signal?.removeEventListener("abort", onAbort); // Prevents listener leak on reused AbortSignal
      this.inFlight = false; // Guaranteed release even if onProgress throws
    }
  }
  private cancel() {}
}
```

## Failure Modes & Mitigations

| Failure Mode | Root Cause | Mitigation |
| :--- | :--- | :--- |
| **`MaxListenersExceededWarning` & Memory Leak** | Library registers `signal.addEventListener("abort", ...)` without removing it in `finally`. | Always call `signal.removeEventListener("abort", onAbort)` inside `finally`. |
| **Permanent Library Deadlock** | User-supplied `onProgress` or interceptor throws before internal lock/flag is reset. | Release all internal locks and state flags inside `finally` blocks. |
| **Host Shutdown Hang** | Library starts a background heartbeat `setInterval` without `.unref()` or `dispose()`. | Call `.unref()` on background maintenance timers and clear them in `dispose()`. |
