# Non-Continuous Operation Phasing and Direct Cutover

Audit criteria for greenfield projects, offline refactors, and isolated rewrite branches where intermediate states do NOT serve live traffic.

## Domain Audit Checklist

### 1. Authorized Horizontal Foundation Phasing
- [ ] Layer-Wise Staging Authorization: Milestones MAY be sequenced horizontally by architectural layer (e.g. Milestone 1: Headless Core & Domain State Store $\rightarrow$ Milestone 2: IPC/Transport Adapters $\rightarrow$ Milestone 3: Declarative UI Views). Reject reviewer feedback that penalizes horizontal layering when the codebase does not need to run continuously during implementation.
- [ ] No Artificial UI Scaffolding: BANS requiring throwaway UI components, temporary mock views, or synthetic tracer bullets in early foundation milestones when real presentation layers are scheduled for subsequent milestones.

### 2. Operational Targets: Final Cutover (`!NC`) vs Intermediate Stepping Stone (`!NC0` / `!NCI`)
- [ ] Terminal System Cutover (`NON_CONTINUOUS_FINAL` / `!NC`): When scoped as `NON_CONTINUOUS_FINAL`, the codebase must be fully operational after the epic concludes. The final milestone/tickets MUST deliver complete end-to-end cutovers, bootable application verification, and legacy decommissioning. Reject reviewer demands for continuous operation during intermediate foundation tickets, but enforce full bootability at the epic boundary.
- [ ] Downstream Handoff Contract (`NON_CONTINUOUS_INTERMEDIATE` / `!NC0` / `!NCI`): When scoped as `NON_CONTINUOUS_INTERMEDIATE`, the codebase does NOT need to operate during OR after the epic (e.g. foundational schema extraction, tooling migration, or intermediate stepping stone). BANS reviewer demands requiring application bootability, GUI rendering, or runtime launchers. Reviewers MUST enforce strict headless contract verification (unit tests, typecheck) and downstream handoff interface integrity only.

### 3. Direct Atomic Cutover & Clean Decommissioning
- [ ] Ban on Accidental Complexity Shims: Reject reviewer feedback demanding dual-write pipelines, expand-contract phasing, or temporary backward-compatibility adapters. Systems operating offline must execute clean, direct cutovers without transitional runtime shims.
- [ ] Explicit Legacy Decommissioning: Ensure old subsystems, obsolete files, and legacy dead code have dedicated, scheduled deletion steps immediately upon completion of the replacement subsystem.

### 4. Headless Atomic Verification
- [ ] Self-Contained Ticket Verification: Every ticket MUST deliver isolated, automated verification (unit tests, headless integration fixtures, contract mocks, or CLI test runners) that passes in headless CI, regardless of whether the complete application can boot or render. BANS deferring test coverage to subsequent phases ("Big-Bang Integration").
- [ ] Contract Surface Verification: Foundation tickets (state stores, engines, schemas) must verify their public API contracts and invariant boundaries with automated assertions before downstream consumer tickets are implemented.

### 5. Single-Turn Execution Sizing
- [ ] Cognitive Containment: Slicing depth is governed strictly by agent context limits, testability, and cyclomatic complexity, NOT by live user deployability. Split monolithic foundation tasks so each ticket can be deterministically implemented in a single turn.

## Concrete Anti-Patterns

### Anti-Pattern 1: Accidental Complexity Shims
BAD (Fake Vertical Slicing in Non-Continuous Branch):
- Milestone 1 Ticket 3: Create temporary mock React components and fake event bridges just to verify state store visually, when the entire UI is being rewritten in Milestone 3.
(Flaw: Wastes tokens and engineering effort on throwaway UI code that must be deleted later.)

GOOD (Headless Contract Verification):
- Milestone 1 Ticket 3: Verify state store transitions, reducers, and selectors thoroughly using automated Vitest/Jest unit test suites without rendering any UI.

### Anti-Pattern 2: Unverified Foundation Accumulation (Big-Bang Integration)
BAD (Deferred Testing):
- Tickets 1 through 5 build data schemas, state stores, and controllers with zero automated tests, with a plan to "test everything when the UI boots in Ticket 6".
(Flaw: Accumulates hidden regressions; debugging root causes during final integration becomes exponentially harder.)

GOOD (Atomic Verification per Ticket):
- Ticket 1 includes automated schema parsing tests.
- Ticket 2 includes automated state mutation tests.
- Ticket 3 includes automated IPC round-trip tests.
(Result: Each layer is verified solid before the next layer builds on top of it.)

### Anti-Pattern 3: Demanding Full Application Boot on Intermediate Stepping Stone
BAD (False-Positive Boot Demand):
- Reviewer rejects a Phase 0 epic (scoping headless state store extraction under `!NC0`) because "the application does not render a UI or launch a window upon completion".
(Flaw: Forces engineers to write throwaway UI bootstrap code or fakes for an epic whose explicit purpose is headless foundation.)

GOOD (Headless Contract & Handoff Integrity):
- Reviewer verifies that all state store reducers pass headless unit test suites, exports are strictly typed, and the handoff boundary matches downstream epic expectations.

## Failure Modes & Mitigations
- Big-Bang Integration Failure: Mitigate by enforcing automated headless tests on every ticket before it can be marked complete.
- Zombie Legacy Clutter: Mitigate by requiring explicit deletion tickets (`DECOMMISSION_LEGACY`) in the work breakdown.
