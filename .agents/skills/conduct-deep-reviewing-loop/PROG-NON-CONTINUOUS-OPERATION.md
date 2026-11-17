# Non-Continuous Operation Phasing and Direct Cutover

Audit criteria for offline upgrades/refactors, local/desktop/CLI applications, greenfield builds, and isolated rewrite branches (`NON_CONTINUOUS_OPERATION` / `!NC` and `NON_CONTINUOUS_INTERMEDIATE` / `!NC0` / `!NCI`) where old ($N$) and new ($N+1$) application binaries do NOT serve live traffic simultaneously.

## Domain Audit Checklist

### 1. Authorized Horizontal Foundation Phasing
- [ ] **Layer-Wise Milestone Staging**: Milestones MAY be sequenced horizontally by architectural layer (e.g. Milestone 1: Headless Core & Domain State Store + Migration Runner $\rightarrow$ Milestone 2: IPC/Transport Adapters $\rightarrow$ Milestone 3: Declarative UI Views). Reject reviewer feedback that penalizes horizontal layering when the codebase does not need to run continuously during implementation.
- [ ] **No Artificial UI Scaffolding**: BANS requiring throwaway UI components, temporary mock views, or synthetic tracer bullets in early foundation milestones when real presentation layers are scheduled for subsequent milestones.

### 2. Operational Targets: Final Cutover (`!NC`) vs Intermediate Stepping Stone (`!NC0` / `!NCI`)
- [ ] **Terminal System Cutover & Data Migration (`NON_CONTINUOUS_OPERATION` / `!NC`)**:
  - The codebase must be fully operational after the epic concludes. The final milestone/tickets MUST deliver complete end-to-end cutovers, bootable application verification, and legacy dead-code decommissioning.
  - When evolving persistent schemas, **sequential migration scripts/runners ($V_1 \to V_2$) preserving existing data are mandatory**, executed as a direct atomic cutover at startup/upgrade without 24/7 multi-deploy dual-write shims.
- [ ] **Downstream Handoff Contract (`NON_CONTINUOUS_INTERMEDIATE` / `!NC0` / `!NCI`)**:
  - The codebase does NOT need to operate during OR after the epic (e.g. foundational schema extraction, tooling migration, or intermediate stepping stone).
  - BANS reviewer demands requiring application bootability, GUI rendering, runtime launchers, or migration runners. Enforce strict headless contract verification (unit tests, typecheck) and downstream handoff interface integrity only.

### 3. Direct Atomic Cutover & Clean Decommissioning
- [ ] **Ban on 24/7 Dual-Write / Expand-Contract Shims**: Reject reviewer feedback demanding multi-deploy dual-write pipelines, shadow-read phases, or temporary runtime backward-compatibility adapters. Systems upgraded offline must execute clean, direct cutovers via startup/deployment migration scripts without transitional runtime shims in domain code.
- [ ] **Explicit Legacy Decommissioning**: Ensure old subsystems, obsolete files, and legacy dead code have dedicated, scheduled deletion steps immediately upon completion of the replacement subsystem.

### 4. Headless Atomic Verification & Single-Turn Sizing
- [ ] **Self-Contained Ticket Verification**: Every ticket MUST deliver isolated, automated verification (unit tests, headless integration fixtures, migration dry-runs, or CLI test runners) that passes in headless CI, regardless of whether the complete application can boot or render. BANS deferring test coverage to the final milestone ("Big-Bang Integration").
- [ ] **Contract Surface Verification**: Foundation tickets (state stores, engines, schemas, migration scripts) must verify their public API contracts and invariant boundaries with automated assertions before downstream consumer tickets are implemented.
- [ ] **Cognitive Containment**: Slicing depth is governed strictly by agent context limits, testability, and cyclomatic complexity, NOT by live 24/7 user deployability. Split monolithic foundation tasks so each ticket can be deterministically implemented in a single turn.

## Concrete Anti-Patterns

### Anti-Pattern 1: Fake Vertical UI Scaffolding or 24/7 Dual-Write Shims in `!NC`
- **BAD (Fake Vertical Slicing)**: Milestone 1 Ticket 3 creates temporary mock React components and fake event bridges just to verify a state store visually when the real UI is scheduled for Milestone 3.
- **BAD (24/7 Cloud Overkill on Offline Upgrade)**: Demanding a 5-phase Expand-Contract rollout with dual-writing to `old_col` and `new_col` in application code when old and new binaries never run concurrently.
- **GOOD (Headless Contract & Direct Atomic Migration)**: Verify state store and sequential migration script ($V_1 \to V_2$) using automated Vitest/Jest/in-memory DB tests in Milestone 1, and switch domain code directly to the $V_2$ schema.

### Anti-Pattern 2: Unverified Foundation Accumulation (Big-Bang Integration)
- **BAD (Deferred Testing)**: Tickets 1 through 5 build data schemas, migration scripts, state stores, and controllers with zero automated tests, planning to "test everything when the UI boots in Ticket 6".
- **GOOD (Atomic Verification per Ticket)**: Ticket 1 includes automated schema parsing & $V_1 \to V_2$ migration tests; Ticket 2 includes automated state mutation tests; Ticket 3 includes automated IPC round-trip tests.

### Anti-Pattern 3: Demanding Full Application Boot on Intermediate Stepping Stone (`!NC0` / `!NCI`)
- **BAD (False-Positive Boot Demand)**: Rejecting a Phase 0 epic (scoped under `!NC0`) because "the application does not render a UI or launch a window upon completion".
- **GOOD (Headless Contract & Handoff Integrity)**: Verify that all reducers pass headless unit test suites, exports are strictly typed, and the handoff boundary matches downstream epic expectations.
