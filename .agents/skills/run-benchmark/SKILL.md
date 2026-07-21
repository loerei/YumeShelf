---
name: run-benchmark
description: >
  Execute and analyze multi-variant A/B/C benchmark tests against codebases. Use when running benchmarks, comparing prompt variations, spawning dry-run subagents, or compiling benchmark metrics using chronicle-mcp.
---

# Run Benchmark

## Quick Start

1. Parse the prompts from the benchmark sheets (e.g., `Calcom Prompts Benchmark.txt`).
2. Spawn dry-run subagents for each variant.
3. Fetch full session details and compile comparisons.

## Workflows

### 1. Spawning Subagents
You MUST spawn one subagent per prompt variant. The subagents MUST run in a dry-run environment.

* Use `invoke_subagent` with:
  - `TypeName`: `"self"`
  - `Workspace`: `"branch"` (prevents file locks and race conditions)
  - `Prompt`: The exact prompt text from the benchmark sheet.

### 2. Guarding the Dry-Run
Ensure every prompt contains:
- Strict Dry-Run Prefix:
  `[DRY RUN ONLY - NO MCP SERVERS ALLOWED - NO GLOBAL DOCS - DO NOT CALL WRITE/PATCH/EDIT TOOLS - PROJECT ROOT: <path>] [RULE: Only output the proposed diff. Do NOT write or patch any files on disk.]`
- If using metadata:
  `[RULE: Trust HoverSource Metadata - Proceed directly to viewing the specified file and line without search or verification. Do NOT write or patch any files on disk. Only output the proposed diff.]`

### 3. Collecting and Saving Logs
Once all subagents in a set complete, you MUST retrieve and save their session logs.

* **Save Session Log**:
  Call `chronicle-mcp:get_session_details` with:
  - `sessionId`: The subagent's conversation ID.
  - `includeCallResults`: `true`
  - `includeToolCalls`: `true`
  - `output`: Absolute path to save the markdown file (e.g. `D:/Projects/HoverSource/benchmark-logs/calcom-task1-a.md`).

### 4. Compiling Benchmark Report
Generate or update the consolidated benchmark table (e.g. `calcom-benchmark.md`).

* **Table Structure Requirement**:
  The tables MUST be formatted exactly like the project's main `README.md` benchmark tables:
  - **Rows**: Metrics (Task Achievement, Agent Steps, Tool Calls, Execution Time, Cumulative Input, Peak Context).
  - **Columns**: Prompt Variants on the left, Delta columns on the far right.
    Format: `| Metric | Pure Natural Language (A) | Senior Developer (B) | HoverSource Metadata (C) | Delta (B vs A) | Delta (C vs A) |`
  - **Task Achievement Metric**:
    - For individual task tables: Record `1` (Succeeded - modified correct file & logic) or `0` (Failed - modified wrong file/project or wrong logic).
    - For the consolidated summary table: Calculate the average success rate percentage (e.g. `71.4% (5/7)`).
  - **Delta Calculations**:
    - Delta (%) = `((Variant - A) / A) * 100` (formatted with a bold `-%` or `+%` value).
    - For Time and Tokens, also include the multiplier (e.g. `13.6x` fewer/faster).

* **Visual Line Chart Requirement**:
  You MUST update the data inside the chart generation script (e.g. `D:/Projects/HoverSource/benchmark-logs/generate_chart.py`) with the new task's metrics, and run it:
  ```bash
  python D:/Projects/HoverSource/benchmark-logs/generate_chart.py
  ```
  This will regenerate the comparison chart image (`calcom-benchmark-chart.png`) which is embedded at the top of the benchmark report.

## Failure Recovery

| Issue | Root Cause | Action |
| :--- | :--- | :--- |
| Subagent modifies target repository | Forgot `DRY RUN` prefix or failed to check tools | Run `git restore <file>` in target repository immediately. Discard session and re-run. |
| Chronicle MCP error: "Cannot bind parameter" | Passed snake_case parameter (`session_id`) | Call the tool using camelCase parameter (`sessionId`). |
