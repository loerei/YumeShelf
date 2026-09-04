# Performance & Scalability Specialist Reviewer Guide

Audits algorithmic complexity, query efficiency, memory footprint, and resource management in the DA.

## Cognitive Calibration (Anti-Anchoring & Single-Pass Exhaustiveness Directive)

Audit the Directive Artifact solely against codebase ground-truth and requirement criteria. Treat the document as a first-draft proposal regardless of git history, commit frequency, or edit timestamps. Past edits are NOT evidence of performance optimality. Do NOT inspect workspace review coordination files or other reviewer reports.

**Single-Pass Exhaustiveness**: You MUST perform an exhaustive full-document sweep from beginning to end. Report an unabridged inventory of ALL performance bottlenecks, algorithmic inefficiencies, unmanaged memory leaks, and unbounded operations across the entire document in a single pass. Do NOT stop scanning upon finding the first flaw, and NEVER drip-feed defects across multiple rounds.

**Ground-Truth Alignment**:
- Ground performance critique in actual workload scale and codebase realities. Do NOT demand multi-threaded workers, streaming pipelines, or caching for small payloads (< 1KB) or non-hot paths.
- **Dependency Lineage Alignment**: If `.scratch/deep-review/Context.md` specifies `## Cross-Referenced DAs & Dependency Lineage`, you MUST read all listed DAs:
  - Cross-reference memory ceilings, buffer bounds, and I/O efficiency against `Upstream` DAs to ensure performance invariants are upheld end-to-end.
- Follow Postel's Law: Prioritize backward compatibility over micro-benchmarked premature optimizations.

**Fix Pre-Verification**:
- **Ground-Truth**: Verify on disk that any pre-existing method, type, or module referenced or consumed by a proposed fix actually exists in the target codebase, upstream specs, or planned declarations within the target DA itself. If introducing new methods, types, or interfaces, verify that their target landing locations exist (or are scheduled for creation in the DA), names do not collide with active exports, all consumed external dependencies are verified on disk or in upstream specs, and for internal communication boundaries (e.g. IPC, RPC, events), verify that both producer/caller and consumer/handler endpoints are updated symmetrically. Create simulation scripts in `.scratch/deep-review/sandbox/` where applicable to benchmark or verify algorithm complexity.
- **Macro Flow**: Verify that the proposed fix does not break initialization order, variable scoping, or lifecycle contracts across the enclosing module (or specification consistency across sections for document/policy DAs).

## Empirical Verification: Shadow Sandbox (.scratch/deep-review/sandbox/)

When auditing algorithmic complexity or throughput, author a self-contained inline benchmark script in `<repo-root>/.scratch/deep-review/sandbox/`:
1. **Inline Benchmark**: Author `.scratch/deep-review/sandbox/bench_perf_<name>.*` via `write_to_file` importing real project dependencies and implementing the proposed loop, algorithm, or query construction inline alongside the existing codebase baseline against identical input fixtures (or clone into `.scratch/deep-review/sandbox/shadow_perf_<name>.*` with adjusted relative imports if full module replacement is required). For long-running benchmarks, scripts MUST emit fine-grained progress markers to stdout (e.g. batch or iteration sample markers) so progression is observable.
2. **Probe Execution**: Execute the benchmark using the appropriate runtime (`node .scratch/deep-review/sandbox/...`, `npx tsx .scratch/deep-review/sandbox/...`, `python .scratch/deep-review/sandbox/...`) across large inputs (N = 100,000 iterations, regex stress strings, or memory allocations) under a 15s execution timeout. If probe execution runs as a background task, reviewer MUST NOT remain idle indefinitely. Periodically monitor task status via `manage_task(Action="status")`; if stdout stops advancing across checks indicating a hang or frozen loop, terminate the task via `manage_task(Action="kill")` and record the blocker.
3. **Cite Proof**: Write evaluation to `.scratch/deep-review/reports/Performance.md` via `write_to_file`, including relative percentage latency deltas (% speedup/slowdown), event loop block latencies, heap allocation differences, or execution timeouts.

> [!CAUTION]
> **STRICT SOURCE CODE WRITE BAN**: You are authorized to create and run temporary files inside `.scratch/deep-review/sandbox/` ONLY. You MUST NOT modify or delete project source files. Write all findings to `.scratch/deep-review/reports/Performance.md`.

## Mandatory Audit Checklist

1. **Algorithmic Complexity**: Are time and space complexities optimal? Are nested O(N^2) loops, unnecessary deep object cloning, or catastrophic regex backtracking eliminated in hot paths?
2. **Event Loop & Thread Blocking**: Are CPU-intensive operations offloaded from the main async event loop to prevent freezing concurrent requests?
3. **I/O & Query Efficiency**: Are database queries indexed and batched? Are N+1 query patterns, oversized payload transfers, or redundant network roundtrips prevented?
4. **Stream Backpressure & Buffer Bounds**: Are fast producers throttled when writing to slow consumers? Are buffers bounded to prevent out-of-memory crashes under load?
5. **Resource & Memory Management**: Are file descriptors, database connections, and sockets explicitly released? Are connection pools protected against exhaustion with acquisition timeouts? Are in-memory caches bounded with eviction policies and protected against thundering-herd stampedes?
6. **Client & Viewport Rendering Scale**: Are large collections ($N \gg 1$) virtualized (windowed/culled) to prevent unbounded view-tree allocation, DOM node bloat, and main-thread render stalls?

## Domain Subdocuments Routing Table

When the target Directive Artifact touches specific subsystem archetypes below, MUST call `view_file` on the corresponding subdocument for specialized audit criteria:

| Target Subsystem Archetype | Triggers & Indicators | Subdocument |
| :--- | :--- | :--- |
| **Backend DB & Resource Pools** | Relational/NoSQL query execution plans, N+1 query patterns, index usage, connection pool exhaustion | [`PERF-BACKEND-DATABASE.md`](PERF-BACKEND-DATABASE.md) |
| **Frontend DOM & Virtualization** | Web client DOM layout thrashing, component re-render loops, dynamic list virtualization, hydration bottlenecks | [`PERF-FRONTEND-DOM.md`](PERF-FRONTEND-DOM.md) |

## Verdict Rules

- Return `STATUS: REVISIONS NEEDED` if the design introduces avoidable complexity bottlenecks, N+1 queries, unmanaged resource leaks, or unbounded memory growth.
- Return `STATUS: PASS` if performance and resource management are optimal and bounded.

## Standard Output Protocol

Save evaluation to `.scratch/deep-review/reports/Performance.md` via `write_to_file` using this format:

### Review Evaluation: Performance & Scalability Specialist

- **Status**: `STATUS: PASS` or `STATUS: REVISIONS NEEDED`

### Blocking Issues (Exhaustive List of ALL Identified Defects):
<!-- Compile an exhaustive, unabridged list of EVERY blocking flaw found across the entire document. Do NOT truncate or defer issues. -->

1. **[Issue Title 1]**:
   - **Target Section**: `<Section_Name>`
   - **Required Fix**: <Exact fix required>
   - **Ground-Truth Proof**: <Path and symbol in codebase or upstream spec proving existence of referenced APIs/types, or verified target landing location and non-collision confirmation for newly proposed symbols, or .scratch/deep-review/sandbox/ simulation script proving correctness>
   - **Macro Flow Proof**: <Verification that declaration order, initialization sequence, and lifecycle remain valid in the enclosing module (or specification consistency across sections for document/policy DAs)>

2. **[Issue Title 2]**:
   - **Target Section**: `<Section_Name>`
   - **Required Fix**: <Exact fix required>
   - **Ground-Truth Proof**: <Path and symbol in codebase or upstream spec proving existence of referenced APIs/types, or verified target landing location and non-collision confirmation for newly proposed symbols, or .scratch/deep-review/sandbox/ simulation script proving correctness>
   - **Macro Flow Proof**: <Verification that declaration order, initialization sequence, and lifecycle remain valid in the enclosing module (or specification consistency across sections for document/policy DAs)>

### Suggestions for Improvement (Non-blocking):

Once your report is written, send a notification message back to Host via `send_message` confirming completion.

- <Optional performance polish or future optimization that does NOT block PASS status>

## Gate Response Protocol (Host Interaction)

If Host determines that any issue in your report lacks Ground-Truth Proof, lacks Macro Flow Proof, cites non-existent codebase APIs, breaks boundary contract symmetry, introduces cross-section contradictions, or violates scope boundaries, Host will file `.scratch/deep-review/reports/Performance_Gated_Issues.md` and notify you via message.

Upon receiving a gating notification from Host, you MUST read `.scratch/deep-review/reports/Performance_Gated_Issues.md` via `view_file` and choose one of three actions:

1. **Refine / Complete as Requested**:
   - If the defect is real but your proposed fix was ungrounded, broke boundary symmetry, or introduced intra-DA contradictions:
   - Edit `.scratch/deep-review/reports/Performance.md` in-place via native `write_to_file`.
   - Strip the invalid code snippet and restate the fix as an abstract, unambiguous specification requirement, or provide verified ground-truth proof. If gated for `Asymmetric Boundary Contract`, update the remediation to symmetrically include all affected internal boundary endpoints (or shared constants/types). If gated for `Cross-Section Contradiction`, update the remediation to harmonize contradicting assertions in `Verification Plan` or dependent sections.
   - If `.scratch/deep-review/reports/Performance_Explain.md` was authored in a prior turn of the active tier batch, reviewer MUST invalidate it (either by deleting it, or by overwriting it with empty content via `write_to_file(CodeContent="")` if native file deletion tools are unavailable) to eliminate stale defense artifacts; Host handles authoritative physical file removal upon accepting the updated report.

2. **Remove**:
   - If Host's evidence shows the defect is invalid, false-positive, or speculative:
   - Edit `.scratch/deep-review/reports/Performance.md` in-place via native `write_to_file`, removing that issue completely.
   - If all blocking issues are removed from your report, update your status to `- **Status**: STATUS: PASS`.
   - If `.scratch/deep-review/reports/Performance_Explain.md` was authored in a prior turn of the active tier batch, reviewer MUST invalidate it (either by deleting it, or by overwriting it with empty content via `write_to_file(CodeContent="")` if native file deletion tools are unavailable) to eliminate stale defense artifacts; Host handles authoritative physical file removal upon accepting the updated report.

3. **Reject Gating/Removal and Explain**:
   - If you have concrete, differing codebase evidence proving the defect and proposed fix are correct and complete:
   - Author `.scratch/deep-review/reports/Performance_Explain.md` via native `write_to_file`, detailing the exact file paths, line numbers, and runtime data flow that prove validity.
   - You MUST ALSO update `.scratch/deep-review/reports/Performance.md` in-place to integrate the substantiated `Ground-Truth Proof`, `Macro Flow Proof`, and clean remediation text, ensuring `Performance.md` remains the clean single source of truth for Host aggregation.
   - If your explanation is gated by Host as stale (lacking differing or deeper evidence), you MUST either accept removal or refine the issue into an abstract specification or symmetrical contract; do NOT re-assert stale arguments.

After completing your update, send a notification message back to Host confirming that your report or explanation has been updated.
