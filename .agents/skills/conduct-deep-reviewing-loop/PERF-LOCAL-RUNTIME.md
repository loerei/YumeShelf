# Local Runtime, IPC Throughput, and Embedded Storage Performance

Audits main-thread/event-loop blocking, stream backpressure, IPC serialization overhead, embedded SQLite throughput, and in-memory leak boundaries in local, desktop, CLI, and server runtimes.

## Domain Audit Checklist

### 1. Event Loop, Stream Backpressure & Main-Thread Non-Blocking Execution
- [ ] **Ban Synchronous I/O & Compute on Hot Paths**: Reject synchronous filesystem calls (`fs.readFileSync`, `fs.writeFileSync`), synchronous compression (`zlib.gzipSync`), synchronous crypto (`pbkdf2Sync`), or multi-megabyte `JSON.parse`/`JSON.stringify` inside request handlers, UI main threads, or active event loops.
- [ ] **Stream Backpressure Enforcement (`writable.write` Drain Check)**: When streaming large exports, archives, or file transfers, use `stream.pipeline()` or check if `writable.write(chunk)` returns `false` and `await once(writable, "drain")` before producing more chunks so fast producers do not overflow `highWaterMark` buffers into OOM.
- [ ] **Catastrophic Regex Backtracking (ReDoS)**: Reject nested quantifiers (`(a+)+`, `([a-zA-Z]+)*`) evaluated against untrusted or large inputs. Mandate linear-time engines (`re2`), atomic groups, or strict input length caps before regex evaluation.
- [ ] **Worker Thread / Utility Process Offloading**: Offload CPU-bound parsing, hashing, AST traversal, or large file indexing to Worker Threads, Web Workers, or child utility processes with bounded concurrency pools.
- [ ] **Bounded Async I/O Fan-Out**: Reject unbounded `Promise.all(items.map(...))` over variable-length arrays for file I/O, IPC, or network requests; enforce a bounded concurrency limiter (e.g. max 8–16 concurrent operations) so file descriptors and memory buffers remain bounded.
- [ ] **Zero Cold-Start Allocation & Tree-Shakability**: Avoid eagerly allocating large lookup tables, compiling unused regexes, or importing heavy optional adapters at module top-level; initialize heavy structures lazily on first use.

### 2. Desktop / Multi-Process IPC Bridge Throughput
- [ ] **No Multi-Megabyte IPC Cloning**: In Electron/Tauri/WebWorker bridges, reject serializing massive object graphs or raw binary blobs repeatedly across structured-clone/JSON IPC channels on high-frequency events.
- [ ] **Chunked Streaming or File-Backed Transfers**: Transfer large payloads via file-path references, shared memory (`SharedArrayBuffer`), custom protocol streams (`app://`), or throttled/batched delta frames ($\le 60\text{Hz}$).

### 3. Embedded SQLite & Local Storage Throughput
- [ ] **WAL Concurrency & Sync Pragmas**: Verify embedded SQLite databases enable Write-Ahead Logging (`PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;`) at connection bootstrap so concurrent reads are never blocked by writes.
- [ ] **Transactional Batch Writes**: Reject executing $N$ individual `INSERT`/`UPDATE` statements in a loop (which triggers $N$ disk `fsync` stalls). Mandate wrapping bulk writes inside a single explicit transaction (`db.transaction(...)`) using pre-compiled prepared statements (`db.prepare(...)`).

### 4. Memory Footprint & Leak Prevention
- [ ] **Bounded In-Memory Caches**: Reject unbounded `Map`, `Set`, or object caches that grow monotonically over process uptime. Require explicit capacity ceilings (LRU eviction) and TTL expiration.
- [ ] **Listener & Timer Teardown**: Verify every `EventEmitter.on`, `addEventListener`, `ResizeObserver`, `MutationObserver`, and `setInterval` registers a corresponding cleanup hook on component unmount or task completion.

## Concrete Anti-Patterns

### Anti-Pattern 1: Unbatched SQLite Loop Writes Causing Disk Fsync Stalls

```typescript
// BAD: Each insert runs in its own auto-commit transaction (1,000 fsyncs = ~10 seconds stall)
export function saveRecordsSlow(db: Database, records: Item[]) {
  const stmt = db.prepare("INSERT INTO items (id, name) VALUES (?, ?)");
  for (const r of records) {
    stmt.run(r.id, r.name);
  }
}

// GOOD: Prepared statement wrapped in a single atomic transaction (1 fsync = ~5ms)
export function saveRecordsFast(db: Database, records: Item[]) {
  const stmt = db.prepare("INSERT INTO items (id, name) VALUES (?, ?)");
  const insertBatch = db.transaction((items: Item[]) => {
    for (const r of items) stmt.run(r.id, r.name);
  });
  insertBatch(records);
}
```

### Anti-Pattern 2: High-Frequency IPC Bridge Flood Freezing UI Renderer

```typescript
// BAD: Emitting 50,000 individual IPC messages during a directory scan freezes Electron UI
for await (const entry of scanFiles(rootDir)) {
  mainWindow.webContents.send("scan:file-found", entry);
}

// GOOD: Coalesce and flush batches on a 100ms interval
let batch: FileEntry[] = [];
let lastFlush = performance.now();
for await (const entry of scanFiles(rootDir)) {
  batch.push(entry);
  if (batch.length >= 250 || performance.now() - lastFlush >= 100) {
    mainWindow.webContents.send("scan:batch-found", batch);
    batch = [];
    lastFlush = performance.now();
  }
}
if (batch.length > 0) mainWindow.webContents.send("scan:batch-found", batch);
```

## Failure Modes & Mitigations

| Failure Mode | Root Cause | Mitigation |
| :--- | :--- | :--- |
| **SQLite `SQLITE_BUSY` & Write Slowdown** | Default rollback journal mode + unbatched per-row transactions. | Enable `WAL` mode, set `busy_timeout`, and batch bulk mutations in `db.transaction()`. |
| **Stream Buffer OOM on Large Export** | Loop calls `writable.write(chunk)` without awaiting `'drain'` when buffer is full. | Use `stream.pipeline( readable, writable )` or `if (!stream.write(chunk)) await once(stream, "drain")`. |
| **Event Loop Freeze on Large Payloads** | Synchronous `fs.readFileSync` + `JSON.parse` on multi-MB files. | Use async streams (`fs.createReadStream`) or offload parsing to a Worker Thread. |
| **OOM from Unbounded Memoization** | Module-scope `const cache = new Map()` storing results per unique request input. | Enforce an LRU cache with a strict `maxEntries` cap or use `WeakMap` for object keys. |
