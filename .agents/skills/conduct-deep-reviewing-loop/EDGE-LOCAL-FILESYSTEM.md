# Local Filesystem Hazards and Async Cancellation Cleanup

Audits OS filesystem edge cases (locks, bounded prefix probing, disk exhaustion, symlinks, cross-device moves) and mid-flight cancellation cleanup.

## Domain Audit Checklist

### 1. Filesystem Mutation, Probing & Locking Edge Cases
- [ ] **Bounded Prefix/Header Probing (`handle.read` Slice vs. `fs.readFile`)**: When inspecting file magic bytes, MIME signatures, or metadata headers, open a file handle and read only the required prefix slice (`handle.read(buf, 0, 4096, 0)` inside `try/finally`) rather than calling `fs.readFile(path)` which loads multi-gigabyte files entirely into memory.
- [ ] **Transient Lock Contention (`EBUSY` / `EPERM` / `EACCES`)**: On Windows and cloud-synced directories (OneDrive, Dropbox, iCloud, antivirus scanners), `fs.rename` and `fs.unlink` frequently fail with transient `EBUSY` or `EPERM`. Verify atomic file replacement routines implement bounded retry backoff (e.g. 3–5 attempts over 50–200ms) and close all open file descriptors before renaming.
- [ ] **Cross-Device Rename Fallback (`EXDEV`)**: `fs.rename` fails with `EXDEV` if the temporary directory (`/tmp` or `os.tmpdir()`) resides on a different mount/volume than the destination file. Verify atomic writes either place the `.tmp` sibling file in the **same parent directory** as the target (`path.dirname(targetPath)`) or handle `EXDEV` via copy + `fsync` + unlink.
- [ ] **Disk Exhaustion (`ENOSPC`) & Partial Write Rollback**: Verify file writers catch `ENOSPC` / `EIO` and unlink incomplete `.tmp` sibling files in `catch`/`finally` blocks so partial 0-byte or truncated artifacts never overwrite valid user data or remain orphaned.
- [ ] **Symlink Cycles & Special Files (`ELOOP`)**: Verify recursive directory crawlers track visited `(dev, ino)` inode pairs (or cap max recursion depth) to prevent infinite loops on circular symlinks, and skip FIFOs/sockets/device nodes.

### 2. Mid-Flight Cancellation & AbortSignal Propagation
- [ ] **End-to-End `AbortSignal` Threading**: Verify long-running I/O, child processes, streams, and batch loops accept an `AbortSignal`, check `signal.throwIfAborted()` at iteration boundaries, and forward `{ signal }` to underlying `fetch` / `fs` / `child_process` calls.
- [ ] **Deterministic Cancellation Cleanup**: When an operation is aborted mid-flight, verify `finally` blocks roll back open transactions, kill spawned child processes, and remove partially written temporary files before propagating `AbortError`.

## Concrete Anti-Patterns

### Anti-Pattern 1: Temp File in `os.tmpdir()` Failing with `EXDEV` & Leaving Orphans on Crash

```typescript
// BAD: os.tmpdir() may be on a different partition (EXDEV on rename), and failed writes leave orphan tmp files
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

export async function writeAtomicBad(targetPath: string, content: string) {
  const tmpPath = path.join(os.tmpdir(), `tmp-${Date.now()}`);
  await fs.writeFile(tmpPath, content);
  await fs.rename(tmpPath, targetPath); // Throws EXDEV across mounts; leaves tmpPath on disk if write/rename fails
}

// GOOD: Co-locate sibling temp file in target directory, fsync, retry transient EBUSY, and unlink on failure
export async function writeAtomicSafe(targetPath: string, content: string, signal?: AbortSignal) {
  const tmpPath = path.join(path.dirname(targetPath), `.${path.basename(targetPath)}.${process.pid}.${Date.now()}.tmp`);
  let handle: fs.FileHandle | undefined;
  try {
    signal?.throwIfAborted();
    handle = await fs.open(tmpPath, "w");
    await handle.writeFile(content, "utf-8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await fs.rename(tmpPath, targetPath);
  } catch (err) {
    if (handle) await handle.close().catch(() => {});
    await fs.unlink(tmpPath).catch(() => {});
    throw err;
  }
}
```

## Failure Modes & Mitigations

| Failure Mode | Root Cause | Mitigation |
| :--- | :--- | :--- |
| **OOM on Header / Magic-Byte Check** | Calling `fs.readFile()` on a multi-GB archive or binary just to inspect the first 64 bytes. | Open a file handle and read a bounded prefix buffer (`handle.read(buf, 0, 4096, 0)`) with `finally { await handle.close() }`. |
| **`EXDEV: cross-device link not permitted`** | Atomic write stages temp file in `/tmp` while target is on `/home` or `D:\`. | Always stage temp sibling file in `path.dirname(targetPath)`. |
| **Orphaned `.tmp` Disk Bloat** | Exception or `AbortSignal` interrupts write before `rename` without `catch` cleanup. | Unlink `tmpPath` inside `catch` block after closing the file descriptor. |
| **Infinite Directory Walk Hang** | Recursive scanner follows symlink pointing to an ancestor directory. | Do not follow symlinks by default (`lstat`), or track visited `stat.dev + ":" + stat.ino` in a `Set`. |
