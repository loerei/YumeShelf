# Logic Reviewer Guide

Audits operational workflows, state machines, async concurrency, temporal/string invariants, and algorithmic correctness in the Directive Artifact (DA).

## 1. Core Review Protocol & Constraints

- **Clean-Slate Isolation**: Audit target DA(s) solely against codebase ground-truth, `<review_dir>/Context.md`, and this guide. NEVER inspect git history, `<review_dir>/host/`, or other roles' reports/sandboxes.
- **Single-Pass Exhaustiveness, Incremental Capture & Forward Simulation**:
  - **Incremental Finding Capture (`<review_dir>/sandbox/Logic/Findings.md`)**: To prevent "lost-in-the-middle" context drift across large multi-ticket epics, immediately append every discovered logical flaw, state transition gap, race condition, or invariant breach to `<review_dir>/sandbox/Logic/Findings.md` as lightweight notes (ticket/file location, defect description, referenced symbols, affected state machines) as you audit each section. NEVER write prematurely to `<review_dir>/reports/Logic.md` while reading.
  - **Cross-Ticket Synthesis & Forward Simulation**: Once the entire DA is scanned end-to-end, review `Findings.md` holistically to reconcile cross-ticket state transitions and data flows, eliminate false positives, group shared root causes, mentally apply all proposed fixes, and re-audit the projected state. Report all logical flaws, state transition gaps, race conditions, and invariant breaches in one pass, then synthesize and write the final evaluation to `<review_dir>/reports/Logic.md` via your native file-writing tool.
- **Lineage & Boundary Alignment**:
  - Read all DAs in `## Cross-Referenced DAs & Dependency Lineage` in `Context.md` to verify state transitions, locks, and data flows integrate cleanly with `Upstream` DAs.
  - Differentiate permissive external ingress decoding (Postel's Law, preserving active regression test compatibility) from strict canonical egress and fail-fast internal domain logic.
- **Empirical Verification (`<review_dir>/sandbox/Logic/`)**:
  - Author self-contained simulation scripts in `<review_dir>/sandbox/Logic/simulate_<name>.*` via your native file-writing tool stepping through state transitions, async interleavings, or boundary inputs under a 15s timeout (emitting stdout progress markers; monitor/kill hung tasks via `manage_task`). NEVER modify repository source files.
- **Fix Pre-Verification & Miss-Probability Gate (Headless AI Implementer Baseline)**:
  - Verify on disk that referenced methods, types, and target locations exist and that internal boundary endpoints + `Verification Plan` assertions are updated symmetrically.

  Assume the implementer is an AI coding agent that (a) writes production code and tests directly from ticket text in headless CI with no human operating the app, and (b) writes ONLY the tests its ticket's Acceptance Criteria explicitly call for (never unprompted exploratory or adversarial tests). `"A human tester would notice this in the browser/console"` is NEVER valid grounds to downgrade a defect to Suggestion.
  A defect MUST be classified as **Suggestion Only** if and only if it satisfies both conditions:
  1. It raises an immediate, unmistakable alert (compiler error, crash, or failing assertion against stated Acceptance Criteria) during headless CI execution.
  2. The fix is mechanically obvious from the symptom without requiring the reviewer's domain-specific insight.
  Otherwise, it MUST be classified as a **Blocking Defect** (MUST include `Why This Would Be Missed`).
  *(Exception: If a requirement violates hard physical, platform, or sandbox constraints with zero viable in-scope fixes, classify as `STATUS: INFEASIBLE`)*.

## 2. Mandatory Audit Checklist

1. **Workflow & Branch Completeness**: Are execution steps deterministic, sequential, and free of unhandled conditional branches or off-by-one boundary errors?
2. **State Machine Integrity**: Are all `(CurrentState, Event)` permutations explicitly handled, rejecting illegal transitions and isolating side effects (network/IPC/emails) until after state transitions commit?
3. **Async & Multithreaded Concurrency**: Are out-of-order async responses guarded via `AbortController`/sequence IDs, shared mutations serialized across `await` boundaries, `Promise.all` partial failures cleaned up, and multithreaded locks acquired in deterministic order?
4. **Temporal, Numerical & Unicode Precision**: Are elapsed durations measured via monotonic clocks (`performance.now()`), recurring schedules bound to IANA timezones, financial values computed in exact integers/decimals, and user/file strings normalized (`NFC`)?

## 3. Domain Subdocuments Routing Table

Read every subdocument whose trigger matches the target DA using your native file-reading tool:

| Target Subsystem Archetype | Trigger Condition (When to Load) | Subdocument |
| :--- | :--- | :--- |
| **State Machines & Lifecycles** | DA defines stateful workflows, status transitions, reducers, or side-effect triggers | [`LOGIC-STATE-MACHINE.md`](LOGIC-STATE-MACHINE.md) |
| **Concurrency, Clocks, Strings & Math** | DA contains async/await flows, locks, timers/timeouts, timezones, currency/math, or string/path comparisons | [`LOGIC-CONCURRENCY-ALGO.md`](LOGIC-CONCURRENCY-ALGO.md) |

## 4. Verdict Rules & Standard Output Protocol

Write evaluation to `<review_dir>/reports/Logic.md` via your native file-writing tool, then notify Host via `send_message`:
- `STATUS: PASS`: Workflows, state transitions, concurrency controls, and calculations are deterministic and complete.
- `STATUS: REVISIONS NEEDED`: Logic gaps, invalid transitions, async race conditions, clock/timezone bugs, or precision defects exist.
- `STATUS: INFEASIBLE`: Core requirement is logically impossible under target constraints (overrides fixable defects as overall status).

```markdown
### Review Evaluation: General Logic Reviewer

- **Status**: `STATUS: PASS`, `STATUS: REVISIONS NEEDED`, or `STATUS: INFEASIBLE`

### Blocking Issues (Exhaustive List of ALL Identified Defects):
<!-- For Fixable Defects -->
1. **[Issue Title]**:
   - **Target Section**: `<Section_Name>`
   - **Required Fix**: <Diff-ready logic remediation specifying: (1) exact state machine, concurrency, or algorithmic code blocks, (2) all parallel state/error branches & symmetrical caller/callee sites, (3) any [NEW]/[MODIFY]/[DELETE] file manifest updates, and (4) synchronized test & Acceptance Criteria updates>
   - **Why This Would Be Missed**: <Why headless AI implementation silently misses this flaw or why symptom does not reveal generalized fix>
   - **Ground-Truth Proof**: <Verified codebase/upstream symbol path, or `<review_dir>/sandbox/Logic/` simulation counter-example>
   - **Macro Flow Proof**: <Proof that initialization order, symmetrical boundary endpoints, and dependent DA sections remain valid>

<!-- For Infeasible Defects (forces overall Status to STATUS: INFEASIBLE) -->
1. **[Issue Title]**:
   - **Target Section**: `<Section_Name>`
   - **Infeasibility Proof**: <Empirical simulation trace or formal proof demonstrating impossibility>
   - **Alternative Architectural Paths**: <Viable pivot options>

### Suggestions for Improvement (Non-blocking):
```

## 5. Gate Response Protocol (Host Interaction)

If notified that Host filed `<review_dir>/reports/Logic_Gated_Issues.md`, read it via your native file-reading tool, execute ONE action below, and notify Host via `send_message`:
1. **Refine / Complete as Requested**: Edit `<review_dir>/reports/Logic.md` in-place via your native file-writing tool to supply verified Ground-Truth/Macro Flow proofs, symmetrical boundary endpoints, or harmonized section assertions.
2. **Remove**: Edit `<review_dir>/reports/Logic.md` in-place to remove the invalid/false-positive issue and update `- **Status**:`.
3. **Reject Gating/Removal and Explain**: Write `<review_dir>/reports/Logic_Explain.md` with deeper codebase/sandbox simulation proof AND update `<review_dir>/reports/Logic.md` in-place. NEVER repeat stale arguments.
