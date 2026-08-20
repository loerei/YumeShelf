---
name: write-a-bug-report
description: Use when asked to write a bug report or document tool failures.
---

# Write a Bug Report

Document reproducible failures, tool errors, and bug reproductions in `BUG_REPORT.md` (or `bug_<topic>.md`).

## Directives

1. **Zero Speculation**: State ONLY observed inputs, stderr/stdout logs, exit codes, and measured timings; NEVER guess unverified root causes or fabricate durations.
2. **File Snapshot on Failure**: When a file operation or patch fails, MUST copy target file(s) to `scratch/replica_<filename>` immediately before further modifications.
3. **Exact Payloads**: MUST preserve complete raw command invocations, request payloads, and minimal repro scripts without truncation.

---

## Template (`BUG_REPORT.md`)

```markdown
# Bug Report: [Short Descriptive Summary]

**Target**: `<tool:method / command / package>`  
**Environment**: `<OS / Runtime / Versions>`  
**Severity**: `[Blocker / Major / Minor]`  
**Date**: YYYY-MM-DD  

---

## 1. Observed vs. Expected

### Observed Behavior (Actual)
- Exact error message, exit code, stack trace, or measured hang duration.
- Raw stderr/stdout log snippet.

### Expected Behavior
- Expected output, exit code, or clean error.

## 2. Reproduction (Repro)

* **Target Snapshot**: `[replica_filename](file:///absolute/path/to/replica)` (if applicable).
* **Trigger Payload / Command**:
```bash
<exact command, payload, or minimal reproduction script>
```
```

---

## Workflow

1. Snapshot affected target files to `scratch/replica_<filename>` if a write/patch failed.
2. Collect raw logs, error traces, and exact environment versions.
3. Write bug artifact to `BUG_REPORT.md` (or `<appDataDir>/brain/<convo-id>/bug_<topic>.md`).
4. Present file link and brief summary to user.
