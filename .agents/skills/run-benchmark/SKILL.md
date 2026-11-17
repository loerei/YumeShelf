---
name: run-benchmark
description: Use when running multi-variant benchmarks, spawning isolated subagents, or compiling benchmark reports.
---

# Run Benchmark

## Workflow

1. **Spawn Isolated Subagents**: Parse prompt variants from the benchmark suite and spawn one subagent per variant via `invoke_subagent`:
   - `TypeName`: `"self"`
   - `Workspace`: `"branch"` (default isolation to prevent file locks and race conditions, unless the task specifies another isolated target)
   - `Prompt`: Pass the user-defined task and per-variant constraints verbatim.
2. **Collect Benchmarks & Logs**: Once all subagents finish:
   - Call `chronicle:get_session_benchmarks` with `sessionIds` (all subagent IDs), `groups` (`[{ name, sessionIds }]` per variant), `output` (absolute path for the raw report), and optionally `linechart_output` (absolute path for an interactive HTML context-window chart).
   - Call `chronicle:query_transcript` (`sessionId`, `output`) when full per-session logs are needed (e.g. `<benchmark-dir>/logs/task1-a.md`).
3. **Verify & Compile Report**: Merge task verification with `get_session_benchmarks` metrics into the consolidated report (e.g. `benchmark-report.md`):
   - **Table Columns**: `| Metric | Baseline (A) | Variant (B) | ... | Delta (B vs A) | ... |`
   - **Rows**: `Task Achievement`, `Agent Steps`, `Tool Calls`, `Execution Time`, `Cumulative Input`, `Output Tokens`, `Peak Context`, `Cache Hit %`, `Errors`.
   - **Task Achievement**: Verify each variant against the user's acceptance criteria and record `1` (met task criteria) or `0` (failed or wrong target); in summary tables report average percentage (e.g. `71.4% (5/7)`).
   - **Deltas**: Compute `((Variant - A) / A) * 100` with bold `-%` or `+%`; include multiplier (e.g. `13.6x`) for Time and Tokens.

## Failure Recovery

| Failure / Condition | Recovery Action |
| :--- | :--- |
| `chronicle` rejects `session_id` or `session_ids` | Use camelCase `sessionId` for `query_transcript` and `sessionIds` (array) for `get_session_benchmarks`. |
