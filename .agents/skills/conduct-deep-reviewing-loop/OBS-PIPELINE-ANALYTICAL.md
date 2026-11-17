# Analytical Pipeline, Batch Processing, and Scientific ML Observability

Audit criteria for offline batch pipelines, ETL jobs, scientific ML training/evaluation runners, and analytical scripts covering stream hygiene, deterministic artifact contracts, throttled progress telemetry, and best-effort cleanup resilience.

## Domain Audit Checklist

- [ ] **Stream Hygiene (`stdout` vs `stderr`)**: Is primary machine-readable output (formatted summary tables, CSV data, final evaluation JSON) sent strictly to `stdout` or persisted to designated artifact files, while all execution progress, epoch/fold runtimes, memory diagnostics, and error stack traces go strictly to `stderr`?
- [ ] **Deterministic Artifact Contracts**: Are pipeline run summaries, evaluation metrics, and model weights/arrays persisted atomically to deterministic filesystem locations (e.g. staging to a temporary file in the target directory before atomic rename), adhering to versioned schemas?
- [ ] **Deterministic POSIX Exit Codes**: Does the pipeline runner exit with `0` on successful completion, `1` on operational, computation, or mathematical failure with full exception trace on `stderr`, and `2` on argument, flag, or configuration validation errors?
- [ ] **Throttled Step & Epoch Progress Telemetry**: Are progress indicators for long-running batches (epoch, fold, record chunk, ETA) emitted to `stderr` with rate-limiting or step guards to eliminate I/O blocking and avoid memory allocation on high-frequency iterations?
- [ ] **Traceable Execution Context on Failure**: When an execution step or fold fails, do error logs on `stderr` record runtime context (fold/step index, dataset split identifier, model family, parameter hash) alongside the underlying exception and cause?
- [ ] **Best-Effort Teardown Resilience**: Are non-critical cleanup actions in `finally` blocks (e.g. unlinking staging `.tmp` files, releasing temporary directory locks, purging scratch caches) treated as idempotent best-effort operations (`try: tmp.unlink() except OSError: pass` or `unlink(missing_ok=True)`), ensuring cleanup failures never mask or override primary execution results?
- [ ] **Exhaustion-Gated Retry Telemetry**: In retry loops for transient filesystem locks or ephemeral resource access, does the implementation log a fatal error or re-raise upon final attempt exhaustion? (Intermediate debug logging on non-exhausted attempts is optional and MUST NOT be required as a blocking condition).

## Concrete Anti-Patterns

### Anti-Pattern 1: Diagnostics Polluting Machine-Readable Stdout

```python
# BAD: Progress prints and training diagnostics sent to stdout corrupt downstream piping (`runner | jq`).
def train_and_evaluate(config):
    print("Loading dataset...")  # Corrupts stdout
    results = run_training(config)
    print(json.dumps(results))  # Mixed with human diagnostics
```

```python
# GOOD: Clean stream separation with machine-readable payload on stdout and progress on stderr.
import sys, json

def train_and_evaluate(config):
    sys.stderr.write("Loading dataset...\n")
    results = run_training(config)
    sys.stdout.write(json.dumps(results) + "\n")
```

### Anti-Pattern 2: Non-Critical Teardown Masking Primary Failure

```python
# BAD: Cleanup exception in finally block overrides the real computation error or fails an otherwise successful run.
def persist_array(target_path, data):
    tmp_path = target_path.with_suffix(".tmp")
    try:
        write_binary(tmp_path, data)
        tmp_path.replace(target_path)
    finally:
        tmp_path.unlink()  # Raises FileNotFoundError if replace succeeded, or PermissionError if locked!
```

```python
# GOOD: Idempotent best-effort cleanup prevents teardown friction from breaking execution flow.
def persist_array(target_path, data):
    tmp_path = target_path.with_suffix(".tmp")
    try:
        write_binary(tmp_path, data)
        tmp_path.replace(target_path)
    finally:
        if tmp_path.exists():
            try:
                tmp_path.unlink()
            except OSError:
                pass  # Best-effort cleanup: target file is already replaced or primary exception is in flight
```

## Failure Modes & Mitigations

| Failure Mode | Root Cause | Mitigation |
| :--- | :--- | :--- |
| **Downstream Pipeline Corruption** | Training progress or banner logs written to `stdout`. | Enforce strict stream hygiene: machine-readable outputs to `stdout`/artifact files; diagnostics to `stderr`. |
| **Masked Computation Failure** | Uncaught exception in `finally:` cleanup block overrides primary error. | Use defensive best-effort exception suppression (`try: unlink() except OSError: pass`) for non-critical teardown. |
| **Silent Job Failure in Orchestrator** | Batch job fails during execution but exits with code `0`. | Require deterministic non-zero exit codes: `1` for execution failures and `2` for configuration/argument errors. |
| **Diagnostic Blind Spot on Step Crash** | Pipeline crashes inside a multi-hour loop without recording which fold or step failed. | Log failing step index, fold number, and dataset slice metadata before raising or exiting. |
| **I/O Bottleneck from Diagnostic Spam** | Inner loop emits progress log on every row or micro-batch. | Throttle progress telemetry to epoch/fold boundaries or time intervals ($\ge 1\text{s}$). |
