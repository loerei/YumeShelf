# OS Resource Handling and Process Termination Cleanup

## Domain Audit Checklist

### 1. Resource Allocations & RAII Wrappers
- [ ] Immediate Resource Cleanup: Verify that every allocated OS handle (file descriptors, sockets, database connections, memory maps) uses cleanup blocks (`defer`, `try-with-resources`, RAII destructors).
- [ ] Unbounded Buffer Memory: Reject reading raw streams or file allocations into unbounded in-memory buffers without explicit length limits.

### 2. Signal Handling & Graceful Shutdown
- [ ] Process Signal Handlers: Confirm applications catch `SIGTERM` and `SIGINT` signals to flush buffered log entries, stop accepting incoming requests, finish active tasks, and close open handles.
- [ ] Child Process Termination: Ensure subprocess creation configures death signals or process groups so subprocesses terminate if parent crashes.

## Concrete Anti-Patterns

### Anti-Pattern 1: Unprotected Resource Allocations

```go
// BAD: File handle remains open if read operations error out or function returns early.
func ReadConfig(path string) ([]byte, error) {
    file, err := os.Open(path)
    if err != nil {
        return nil, err
    }
    data, err := io.ReadAll(file)
    file.Close() // Skipped if io.ReadAll returns an error
    return data, err
}

// GOOD: Immediate defer statement ensures execution regardless of return path.
func ReadConfig(path string) ([]byte, error) {
    file, err := os.Open(path)
    if err != nil {
        return nil, err
    }
    defer file.Close()
    return io.ReadAll(file)
}
```

## Failure Modes & Mitigations

- Operating System File Descriptor Exhaustion: Enforce explicit max open connection limits in application connection pools and file streaming readers.
- Zombie Subprocesses: Use native process monitoring trees or execute processes within isolated container init wrappers (`tini`).
