# Desktop & Client-Side Application Observability

Audit criteria for native desktop clients (Tauri, Electron, Native GUI) covering crash capture, local file logging, disk quotas, privacy compliance, and offline queueing.

## Domain Audit Checklist

- [ ] **Native Crash Reporting**: Is an out-of-process crash handler (Crashpad / Sentry Native) configured for native host crashes?
- [ ] **Process Boundary Isolation**: Do renderer/child process crashes trigger state recovery in the main process without crashing the application?
- [ ] **OS-Standard Log Paths**: Are diagnostic log files written exclusively to standard OS application data directories (`%LOCALAPPDATA%`, `~/Library/Application Support/`, `~/.local/share/`)?
- [ ] **Log File Rotation & Disk Quota**: Is file logging bounded by rolling rotation (max file size $\le$ 10 MB, file count $\le$ 5) and a hard disk quota ($\le$ 50 MB total)?
- [ ] **User Privacy & Telemetry Consent**: Is remote telemetry disabled by default until explicit user opt-in is granted (or explicit opt-out provided per regulatory regime)?
- [ ] **Local Path & Username Sanitization**: Are local usernames and absolute filesystem paths stripped or normalized (`~` or `<USER_DIR>`) from log files and minidumps?
- [ ] **Offline Buffering & Backoff**: Are offline telemetry events persisted in a local bounded queue and retried with exponential backoff and jitter upon reconnect?

## Concrete Anti-Patterns

### Anti-Pattern 1: Unbounded File Logging in Working Directory

```rust
// BAD: Logs written to arbitrary working directory without rotation or quota limits.
fn init_logging() {
    let file = std::fs::File::create("app_debug.log").unwrap();
    tracing_subscriber::fmt().with_writer(file).init();
}

// GOOD: Writes to OS-standard app data path with size-based rolling rotation and hard file limit.
fn init_logging(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let log_dir = app.path().app_log_dir()?;
    std::fs::create_dir_all(&log_dir)?;

    let file_appender = tracing_appender::rolling::Builder::new()
        .rotation(tracing_appender::rolling::Rotation::DAILY)
        .filename_prefix("app")
        .filename_suffix("log")
        .max_log_files(5)
        .build(log_dir)?;

    tracing_subscriber::fmt()
        .with_writer(file_appender)
        .with_ansi(false)
        .init();
    Ok(())
}
```

### Anti-Pattern 2: Telemetry Emitted Without Consent or Path Sanitization

```typescript
// BAD: Emits telemetry without checking user consent, exposing raw absolute filesystem paths.
function reportFileError(filePath: string, error: Error) {
  telemetryClient.sendEvent("file_open_failed", {
    path: filePath, // Leaks C:\Users\alice\Documents\secret.txt
    error: error.message,
  });
}

// GOOD: Enforces user consent check and scrubs local username from path.
function sanitizeUserPath(rawPath: string): string {
  const homeDir = os.homedir();
  return rawPath.startsWith(homeDir) ? rawPath.replace(homeDir, "~") : rawPath;
}

function reportFileError(filePath: string, error: Error, userSettings: Settings) {
  if (!userSettings.isTelemetryEnabled) {
    return;
  }
  telemetryClient.sendEvent("file_open_failed", {
    path: sanitizeUserPath(filePath),
    error: error.message,
  });
}
```

## Failure Modes & Mitigations

| Failure Mode | Root Cause | Mitigation |
| --- | --- | --- |
| **Disk Exhaustion Crash** | Application logs continuously to disk without deletion policy. | Require rolling log configuration with maximum file size and strict total file retention limits. |
| **Silent Renderer Death** | Electron/Tauri renderer process crashes; main process takes no action. | Demand event listeners on `render-process-gone` to display a recovery dialog and capture minidumps. |
| **GDPR Privacy Violation** | Telemetry payloads contain absolute home directory paths revealing user names. | Enforce regex path normalization before writing to local log files or remote telemetry sinks. |
| **Thundering Herd on Reconnect** | Client retries all queued offline events immediately upon network restoration. | Require exponential backoff with full randomized jitter for queued event transport. |

```
---
