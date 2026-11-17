# Interactive CLI & Developer Utility Observability and Terminal Ergonomics

Audit criteria for interactive command-line tools, TUI applications, shell commands, and developer utilities covering stream hygiene, verbosity flags, non-TTY CI safety, terminal state restoration, and deterministic POSIX exit codes. (For offline batch processing, ETL scripts, and scientific ML training/eval engines, see [`OBS-PIPELINE-ANALYTICAL.md`](OBS-PIPELINE-ANALYTICAL.md)).

## Domain Audit Checklist

- [ ] **Stream Hygiene (`stdout` vs `stderr`)**: Is primary machine-readable output sent strictly to `stdout`, while all logs, diagnostics, warnings, and spinners go strictly to `stderr`?
- [ ] **Machine-Readable Mode (`--json`)**: When `--json` is active, does `stdout` contain ONLY valid, unadorned JSON (no ANSI escape codes, no progress bars)?
- [ ] **Standardized Verbosity Controls**: Does the CLI implement standard verbosity flags (`-v`/`--verbose`, `--debug`, `-q`/`--quiet`) routed to logger levels?
- [ ] **Interactive TTY Detection & Non-TTY Fail-Fast**: Are ANSI colors, terminal cursor manipulation, and dynamic spinners suppressed when `stdout`/`stderr` is not a TTY (`isatty`), and do interactive prompts (`readline`, `inquirer`) fail fast with exit code `2` (or require `--yes` / `--non-interactive`) instead of hanging indefinitely when `!process.stdin.isTTY` or `CI=true`?
- [ ] **Terminal Raw-Mode & Cursor Restoration**: If the CLI hides the terminal cursor (`\x1b[?25l`), switches to the alternate screen buffer, or enables raw input (`setRawMode(true)`), does it deterministically restore normal terminal state (`\x1b[?25h`, `setRawMode(false)`) inside `finally` and `SIGINT`/`SIGTERM` handlers?
- [ ] **Dry-Run Support & Actionable Error Remediation**: Do destructive or bulk-mutating commands provide a `--dry-run` preview flag, and do error messages print both the offending input and the exact remediation flag/command?
- [ ] **Color Overrides**: Does output formatting respect the `NO_COLOR` environment variable and `--no-color` flag?
- [ ] **Deterministic POSIX Exit Codes**: Does the CLI exit with `0` on success, `1` on operational failure, `2` on usage/flag syntax error, and `130` on `SIGINT`?
- [ ] **Diagnostic Pipelining**: When invoking child subcommands, is child process `stderr` passed through to the parent `stderr` stream?

## Concrete Anti-Patterns

### Anti-Pattern 1: Diagnostics Emitted on Stdout & Interactive Prompt Hanging in CI

```typescript
// BAD 1: Diagnostic progress written to stdout corrupts downstream JSON processing (`cli | jq`).
// BAD 2: Prompting on stdin when !process.stdin.isTTY hangs CI pipelines until the 60-minute runner timeout!
async function deleteResourcesBad() {
  console.log("Preparing deletion..."); // Corrupts stdout
  const answer = await promptUser("Delete all items? (y/N): "); // Hangs forever in non-TTY CI!
  if (answer === "y") await performDelete();
}

// GOOD: Diagnostics on stderr, non-TTY fail-fast with actionable flag hint, and --yes / --dry-run support
async function deleteResourcesSafe(flags: { yes?: boolean; dryRun?: boolean; json?: boolean }) {
  if (!flags.yes) {
    if (!process.stdin.isTTY || process.env.CI === "true") {
      process.stderr.write("Error: Confirmation required in non-interactive mode. Pass --yes to confirm or --dry-run to preview.\n");
      process.exit(2);
    }
    const answer = await promptUser("Delete all items? (y/N): ");
    if (answer.toLowerCase() !== "y") process.exit(0);
  }
  const deleted = flags.dryRun ? await previewDelete() : await performDelete();
  if (flags.json) {
    process.stdout.write(JSON.stringify({ dryRun: !!flags.dryRun, deleted }) + "\n");
  } else {
    process.stderr.write(`Deleted ${deleted.length} items.\n`);
  }
}
```

### Anti-Pattern 2: Dynamic Spinners & Hidden Terminal Cursor Leaked on Crash/SIGINT

```python
# BAD: Emits ANSI spinner frames to CI pipes and leaves terminal cursor hidden (\033[?25l) if interrupted!
import sys, time

def show_spinner_bad():
  sys.stderr.write("\033[?25l") # Hides cursor, never restored on Ctrl+C or exception!
  for char in "|/-\\":
    sys.stderr.write(f"\rProcessing {char}")
    time.sleep(0.1)

# GOOD: Checks TTY status and restores terminal cursor inside try/finally
import sys, os

def run_with_spinner_safe(task_fn):
  is_interactive = sys.stderr.isatty() and "NO_COLOR" not in os.environ
  if is_interactive:
    sys.stderr.write("\033[?25l")
  try:
    return task_fn()
  finally:
    if is_interactive:
      sys.stderr.write("\r\033[K\033[?25h") # Clears line and restores cursor unconditionally
      sys.stderr.flush()
```

## Failure Modes & Mitigations

| Failure Mode | Root Cause | Mitigation |
| :--- | :--- | :--- |
| **Pipeline Parsing Failure** | Progress text or banner art mixed into `stdout`. | Route all human logs and progress indicators strictly to `stderr`. |
| **Infinite CI Pipeline Hang** | CLI waits for interactive `stdin` prompt when `!stdin.isTTY`. | Check `stdin.isTTY` before prompting; exit with code `2` and suggest `--yes` in non-TTY environments. |
| **Broken User Terminal After `Ctrl+C`** | TUI hides cursor or enables raw mode without restoring in `finally`/`SIGINT`. | Always restore cursor visibility (`\x1b[?25h`) and disable raw mode in `finally` and signal cleanup. |
| **Ambiguous Script Failure** | Command fails on invalid user argument but exits with generic code `0` or `1`. | Enforce exit code `2` for argument validation errors and `130` for `SIGINT` handlers. |
