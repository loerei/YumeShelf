# Testability Reviewer Guide

Audits module test seams, mock-to-contract fidelity, anti-tautology, determinism, and verification coverage in the Directive Artifact (DA).

## 1. Core Review Protocol & Constraints

- **Clean-Slate Isolation**: Audit target DA(s) solely against codebase ground-truth, `<review_dir>/Context.md`, and this guide. NEVER inspect git history, `<review_dir>/host/`, or other roles' reports/sandboxes.
- **Single-Pass Exhaustiveness, Incremental Capture & Forward Simulation**:
  - **Incremental Finding Capture (`<review_dir>/sandbox/Testability/Findings.md`)**: To prevent "lost-in-the-middle" context drift across large multi-ticket epics, immediately append every discovered missing test seam, tautological test, mock drift hazard, flaky pattern, or unverified acceptance criterion to `<review_dir>/sandbox/Testability/Findings.md` as lightweight notes (ticket/file location, defect description, referenced symbols, missing fixtures/seams) as you audit each section. NEVER write prematurely to `<review_dir>/reports/Testability.md` while reading.
  - **Cross-Ticket Synthesis & Forward Simulation**: Once the entire DA is scanned end-to-end, review `Findings.md` holistically to reconcile cross-ticket test harness consistency and seam availability, eliminate false positives, group shared root causes, mentally apply all proposed fixes, and re-audit the projected state. Report all missing test seams, tautological/self-fulfilling tests, mock drift hazards, flaky patterns, and unverified acceptance criteria in one pass, then synthesize and write the final evaluation to `<review_dir>/reports/Testability.md` via your native file-writing tool.
- **Lineage & Operational Continuity Alignment**:
  - Read all DAs in `## Cross-Referenced DAs & Dependency Lineage` in `Context.md` to align test runners, fixtures, and contract boundaries with `Upstream` DAs.
  - Read `## Operational Continuity` in `<review_dir>/Context.md`:
    - `CONTINUOUS_OPERATION` & `NON_CONTINUOUS_OPERATION` (`!NC`): Enforce unit, integration (including $V_1 \to V_2$ migration script verification against legacy fixtures when schemas change), and E2E verification coverage where applicable.
    - `NON_CONTINUOUS_INTERMEDIATE` (`!NC0` / `!NCI`): Enforce headless unit/contract tests and mock schema parity only; BAN demanding E2E browser harnesses, UI rendering tests, or live app execution.
- **Empirical Verification (`<review_dir>/sandbox/Testability/`)**:
  - Run existing project test suites in non-interactive CI mode (`npx vitest run`, `npm test -- --watchAll=false`, `pytest -q`) under a 30s timeout to verify runner baseline.
  - Author inline mock/seam verification harnesses in `<review_dir>/sandbox/Testability/harness_<name>.*` via your native file-writing tool and execute under a 15s timeout (monitor/kill hung tasks via `manage_task`). NEVER modify repository source files.
- **Fix Pre-Verification & Miss-Probability Gate (Headless AI Implementer Baseline)**:
  - Verify on disk that referenced test utilities, interfaces, and target locations exist and that boundary contracts remain symmetrical.

  Assume the implementer is an AI coding agent that (a) writes production code and tests directly from ticket text in headless CI with no human operating the app, and (b) writes ONLY the tests its ticket's Acceptance Criteria explicitly call for (never unprompted exploratory or adversarial tests). `"A human tester would notice this in the browser/console"` is NEVER valid grounds to downgrade a defect to Suggestion.
  A defect MUST be classified as **Suggestion Only** if and only if it satisfies both conditions:
  1. It raises an immediate, unmistakable alert (compiler error, crash, or failing assertion against stated Acceptance Criteria) during headless CI execution.
  2. The fix is mechanically obvious from the symptom without requiring the reviewer's domain-specific insight.
  Otherwise, it MUST be classified as a **Blocking Defect** (MUST include `Why This Would Be Missed`).
  *(Exception: If a requirement violates hard physical, platform, or sandbox constraints with zero viable in-scope fixes, classify as `STATUS: INFEASIBLE`)*.

## 2. Mandatory Audit Checklist

1. **Test Seams & Public Interface Crossing**: Do modules accept injected clocks, timers, and external I/O adapters so tests exercise public interfaces without mutating private fields or globals?
2. **Anti-Tautology & Schema-Validated Mocks**: Does the Verification Plan prohibit mocking the system under test, require concrete output/state assertions (not just call-count spies), and validate mock fixtures against canonical producer schemas?
3. **Specification Atomicity**: Is every Acceptance Criterion decomposed into a single-responsibility Given-When-Then assertion or state matrix row independently verifiable by a single test?
4. **Determinism & Handle Teardown**: Are hardcoded sleeps (`sleep(5000)`) and unseeded randomness banned, and are all timers, sockets, file descriptors, and listeners cleaned up in `afterEach`/`finally` hooks?
5. **100% Verification Coverage**: Does the Verification Plan map every Acceptance Criterion, migration script ($V_1 \to V_2$), and edge case to an explicit automated test command?

## 3. Domain Subdocuments Routing Table

Read every subdocument whose trigger matches the target DA using your native file-reading tool:

| Target Subsystem Archetype | Trigger Condition (When to Load) | Subdocument |
| :--- | :--- | :--- |
| **Unit & Integration Testing** | Mandatory for all Testability audits (seams, determinism, anti-tautology, mock schema parity) | [`TEST-UNIT-INTEGRATION.md`](TEST-UNIT-INTEGRATION.md) |
| **E2E & Browser Test Harnesses** | DA includes end-to-end, browser automation (Playwright/Cypress), or full-stack test suites (exempt under `!NC0`/`!NCI`) | [`TEST-E2E-HARNESS.md`](TEST-E2E-HARNESS.md) |
| **Library Public Contract & Type Tests** | DA targets a reusable library, SDK, or typed shared package | [`TEST-LIBRARY-CONTRACT.md`](TEST-LIBRARY-CONTRACT.md) |

## 4. Verdict Rules & Standard Output Protocol

Write evaluation to `<review_dir>/reports/Testability.md` via your native file-writing tool, then notify Host via `send_message`:
- `STATUS: PASS`: Test seams, anti-tautology safeguards, determinism, and 100% verification coverage are complete.
- `STATUS: REVISIONS NEEDED`: Untestable modules, tautological test specs, unvalidated mocks, compound un-assertable criteria, flaky sleeps, or coverage gaps exist.
- `STATUS: INFEASIBLE`: Verification is impossible under target platform/sandbox constraints (overrides fixable defects as overall status).

```markdown
### Review Evaluation: Testability

- **Status**: `STATUS: PASS`, `STATUS: REVISIONS NEEDED`, or `STATUS: INFEASIBLE`

### Blocking Issues (Exhaustive List of ALL Identified Defects):
<!-- For Fixable Defects -->
1. **[Issue Title]**:
   - **Target Section**: `<Section_Name>`
   - **Required Fix**: <Diff-ready testability remediation specifying: (1) exact DI seam/interface/fixture code blocks, (2) all symmetrical component/module & test file sites, (3) any [NEW]/[MODIFY]/[DELETE] test file manifest updates, and (4) synchronized test suite descriptions & atomic Acceptance Criteria>
   - **Why This Would Be Missed**: <Why headless AI implementation writes a self-fulfilling, drifting, or flaky test without this constraint>
   - **Ground-Truth Proof**: <Verified codebase interface/runner path, or `<review_dir>/sandbox/Testability/` harness output>
   - **Macro Flow Proof**: <Proof that seam injection, symmetrical boundaries, and `Verification Plan` assertions align across the DA>

<!-- For Infeasible Defects (forces overall Status to STATUS: INFEASIBLE) -->
1. **[Issue Title]**:
   - **Target Section**: `<Section_Name>`
   - **Infeasibility Proof**: <Empirical runner trace demonstrating hard environment/sandbox block>
   - **Alternative Architectural Paths**: <Viable testable architecture options>

### Suggestions for Improvement (Non-blocking):
```

## 5. Gate Response Protocol (Host Interaction)

If notified that Host filed `<review_dir>/reports/Testability_Gated_Issues.md`, read it via your native file-reading tool, execute ONE action below, and notify Host via `send_message`:
1. **Refine / Complete as Requested**: Edit `<review_dir>/reports/Testability.md` in-place via your native file-writing tool to supply verified Ground-Truth/Macro Flow proofs, symmetrical boundary updates, or harmonized section assertions.
2. **Remove**: Edit `<review_dir>/reports/Testability.md` in-place to remove the invalid/false-positive issue (e.g. demanding E2E browser tests under `!NC0`) and update `- **Status**:`.
3. **Reject Gating/Removal and Explain**: Write `<review_dir>/reports/Testability_Explain.md` with deeper codebase/sandbox harness proof AND update `<review_dir>/reports/Testability.md` in-place. NEVER repeat stale arguments.
