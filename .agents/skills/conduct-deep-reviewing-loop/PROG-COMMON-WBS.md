# Common Work Breakdown Structure (WBS) Invariants

Universal work breakdown, DAG ordering, and slicing invariants applicable across all systems regardless of operational continuity.

## Domain Audit Checklist

### 1. Dependency DAG Topology & Ordering
- [ ] Dependency DAG Ordering: Verify that ticket dependency structures are explicitly specified as a Directed Acyclic Graph (DAG). Reject execution sequences containing forward-dependencies (e.g. Ticket N depending on unbuilt APIs from Ticket N+2) or circular blocking loops across phases.
- [ ] Critical Path Identification: Confirm the critical path is explicitly identified in the work breakdown to guide implementation sequencing and detect bottleneck tickets early.

### 2. Hierarchical Dot-Splitting & Anti-Cascading Renumbering
- [ ] Hierarchical Dot-Splitting (`X.1, X.2 ... X.n`): When decomposing monolithic or overloaded tickets, enforce symmetrical dot notation (`3.1, 3.2` rather than `3, 3b` or `3a, 3b`). Deep nesting (`3.2.1, 3.2.2 ... 3.2.n`) is permitted whenever sub-modules remain complex.
- [ ] Anti-Cascading Renumbering: BANS re-indexing downstream tickets (e.g. do not rename `04` to `05` when splitting `03`). Downstream dependencies converge to the terminal child node (`3.2` or `3.2.n`).
- [ ] Scope Evaluation: Audit tickets purely on technical scope, cyclomatic complexity, and testability. Numbering depth does not exempt a ticket from splitting.

### 3. Prerequisite Structural Isolation & Refactoring Priority Gates
- [ ] Prerequisite Structural Isolation: Ensure structural refactoring changes ($S$) are isolated into dedicated prerequisite tickets preceding behavioral feature changes ($B$). NEVER mix refactorings and features in the same ticket or PR.
- [ ] Refactoring Priority Gates: Verify that task sequencing honors the 4 priority gates:

| Trigger Condition | Decision Gate | Action Route |
| :--- | :---: | :--- |
| Structural change directly makes behavioral change easy or understandable. | **First** | Perform Tidying ($S$) now $\rightarrow$ Commit $\rightarrow$ Perform Behavior Change ($B$). |
| Code structure is messy, but behavioral change is urgent and area will be edited again soon. | **After** | Perform Behavior Change ($B$) now $\rightarrow$ Tidy ($S$) immediately after. |
| Structural change is large (> 1 hour), but time budget is severely constrained. | **Later** | Log Tidying task in backlog $\rightarrow$ Proceed directly with Behavior Change ($B$). |
| Code area is stable, deprecated, or will never be touched again. | **Never** | Leave code intact $\rightarrow$ Perform minimal direct change or leave untouched. |

### 4. Checkbox (`- [ ]`) & Nano Step Granularity
- [ ] Atomic Checkbox Scope: Ensure each `- [ ]` execution step represents a single-turn, atomic modification (a single semantic change or contract addition). Overloaded checkboxes containing multiple disparate tasks MUST be split (`SPLIT_STEP`).
- [ ] Step Execution Ordering: Verify checkboxes follow an incremental progression: Interface / Seams / Stubs $\rightarrow$ Core Logic $\rightarrow$ Edge Cases $\rightarrow$ Verification. Forward-referencing checkboxes MUST be re-ordered (`REORDER_STEPS`).
- [ ] Dedicated Verification Steps: Ensure critical state modifications, migrations, or algorithms are immediately followed by explicit verification steps running automated test commands or repro harnesses (`INJECT_VERIFICATION_STEP`).
- [ ] Scope Creep Step Isolation: Steps requiring complex architectural changes outside ticket scope MUST be promoted to independent tickets (`EXTRACT_STEP_TO_TICKET`).
- [ ] Intra-Step Refactoring Isolation: Structural tidying steps ($S$) MUST NOT be merged with behavior change steps ($B$) in the same checkbox (`ISOLATE_STEP_TIDYING`).

### 5. Monolithic Plan Decomposition Threshold
- [ ] Plan-to-Modular-Epic Decomposition Threshold: Audit single-file implementation plans (e.g. `implementation_plan.md`, `plan.md`). If a plan document exceeds 300 lines or spans more than 3 discrete architectural tasks / subsystems, reject keeping it as a monolithic single-file checkbox list. Enforce `DECOMPOSE_PLAN_TO_PRD_AND_TICKETS` to break the plan into `<epic_dir>/PRD.md` and dedicated modular ticket files under `<epic_dir>/tickets/*.md`.

## Concrete Anti-Patterns

### Anti-Pattern 1: Mixing Refactoring and Feature Implementation in the Same Ticket
BAD (Mixed Refactoring and Feature):
- Single ticket: "Refactor OrderService and implement Japan Tier Discounts" (750 lines diff; high review fatigue and risky git bisect).

GOOD (Tidy First Order):
- Ticket 1: [Refactor] Extract PricingStrategy interface from OrderService (Tidying S - 120 lines diff).
- Ticket 2: [Feature] Implement JapanSpecialTierStrategy via PricingStrategy seam (Behavior B - 95 lines diff).

### Anti-Pattern 2: Overloaded Checkboxes Inside Execution Plan
BAD (Multi-Concern Step):
- `[ ] Implement user avatar upload, write API tests, update profile settings page UI, and fix image cache bug.`

GOOD (Atomic Steps with Discrete Verification):
- `[ ] 1. Define AvatarStorage interface and local disk adapter stub` (`SPLIT_STEP`)
- `[ ] 2. Implement image validation and resizing pipeline` (`SPLIT_STEP`)
- `[ ] 3. Run unit tests verifying image validator against test fixtures` (`INJECT_VERIFICATION_STEP`)
- `[ ] 4. Mount avatar upload component in user profile UI` (`SPLIT_STEP`)

### Anti-Pattern 3: Monolithic Checkbox Expansion in Single Plan File
BAD (Giant Monolithic Plan File):
- Single 900-line `implementation_plan.md` attempting to detail an entire multi-system migration or redesign with 60 nested checkboxes in one file. Reviewers attempt to split checkboxes internally, bloating the file to 1500 lines of unmaintainable markdown.

GOOD (Decomposed PRD + Modular Tickets):
- Epic Directory: `docs/specs/08-migration/PRD.md` (capturing macro architecture, milestone DAG, continuity invariants).
- Modular Tickets: `docs/specs/08-migration/tickets/01-build-setup.md`, `02-core-store.md`, `03-view-adapters.md` (each ticket isolated to a single vertical tracer bullet with dedicated verification plan).

## Failure Modes & Mitigations
- PR Stalls via Review Fatigue: Enforce strict PR size limits; require automated splitting of PRs that exceed complexity thresholds.
- Broken Bisect Lineage: Enforce separate commits for $S$ (pure refactoring, zero behavioral delta) and $B$ (pure behavior change).
