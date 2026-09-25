# CLI & Developer Utility Observability

Audit criteria for command-line tools, batch scripts, and automation runners covering stream hygiene, verbosity flags, TTY detection, and deterministic POSIX exit codes.

## Domain Audit Checklist

- [ ] **Stream Hygiene (`stdout` vs `stderr`)**: Is primary machine-readable output sent strictly to `stdout`, while all logs, diagnostics, warnings, and spinners go strictly to `stderr`?
- [ ] **Machine-Readable Mode (`--json`)**: When `--json` is active, does `stdout` contain ONLY valid, unadorned JSON (no ANSI escape codes, no progress bars)?
- [ ] **Standardized Verbosity Controls**: Does the CLI implement standard verbosity flags (`-v`/`--verbose`, `--debug`, `-q`/`--quiet`) routed to logger levels?
- [ ] **Interactive TTY Detection**: Are ANSI colors, terminal cursor manipulation, and dynamic spinners suppressed when `stdout` or `stderr` is not an interactive terminal (`isatty`)?
- [ ] **Color Overrides**: Does output formatting respect the `NO_COLOR` environment variable and `--no-color` flag?
- [ ] **Deterministic POSIX Exit Codes**: Does the CLI exit with `0` on success, `1` on operational failure, `2` on usage/flag syntax error, and `130` on SIGINT?
- [ ] **Diagnostic Pipelining**: When invoking child subcommands, is child process `stderr` passed through to the parent `stderr` stream?

## Concrete Anti-Patterns

### Anti-Pattern 1: Diagnostics Emitted on Stdout Breaking Pipelines

```typescript
// BAD: Diagnostic progress written to stdout corrupts downstream JSON processing (`cli | jq`).
async function runCommand() {
  console.log("Fetching account details..."); // Corrupts stdout
  const data = await fetchAccount();
  console.log(JSON.stringify(data));
  process.exit(0);
}

// GOOD: Diagnostics routed to stderr; machine data isolated on stdout.
async function runCommand(flags: { json: boolean }) {
  if (!flags.json) {
    process.stderr.write("Fetching account details...\n");
  }
  const data = await fetchAccount();
  process.stdout.write(JSON.stringify(data, null, flags.json ? 0 : 2) + "\n");
  process.exit(0);
}
```

### Anti-Pattern 2: Dynamic Spinners Emitted to Non-TTY Environments

```python
# BAD: Emits ANSI cursor movements and spinner frames to redirected pipes or CI logs.
import sys, time

def show_spinner():
  for char in "|/-\\":
    sys.stderr.write(f"\rProcessing {char}")
    sys.stderr.flush()
    time.sleep(0.1)

# GOOD: Checks TTY status before rendering interactive ANSI components.
import sys, os

def log_progress(message: str):
  is_interactive = sys.stderr.isatty() and "NO_COLOR" not in os.environ
  if is_interactive:
    sys.stderr.write(f"\r\033[K{message}")
    sys.stderr.flush()
  else:
    sys.stderr.write(f"{message}\n")
```

## Failure Modes & Mitigations

| Failure Mode | Root Cause | Mitigation |
| --- | --- | --- |
| **Pipeline Parsing Failure** | Progress text or banner art mixed into `stdout`. | Enforce that all logging utilities bind output explicitly to `stderr`. |
| **CI Log File Bloat** | ANSI carriage return (`\r`) spinners emitted in CI logs producing thousands of garbage lines. | Guard all spinner rendering behind `isatty` checks or `CI=true` detection. |
| **Ambiguous Script Failure** | Command fails on invalid user argument but exits with generic code `0` or `1`. | Enforce exit code `2` for argument validation errors and `130` for SIGINT handlers. |

```
---
