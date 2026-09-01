# Progress Subdocument: Feature WBS & Granular Slicing

## Domain Audit Checklist

### 1. Work Breakdown Structure (WBS) Slicing
- [ ] Vertical Slicing: Verify that tasks are broken down vertically across layers (UI, API, Data, Tests) rather than horizontally by technical stack.
- [ ] PR Line Count Thresholds: Ensure no individual PR proposal exceeds 400 lines of modified code (excluding auto-generated code and lockfiles).

### 2. Tracer-Bullet Granularity & Hierarchical Dot-Splitting
- [ ] End-to-End Skeleton First: Confirm initial task phases deliver a fully connected end-to-end tracer bullet with minimal mock functionality before building complex edge cases.
- [ ] Independent Value Delivery: Ensure each ticket delivers a testable unit of functionality that can be merged safely behind feature flags.
- [ ] **Hierarchical Dot-Splitting (`X.1, X.2 ... X.n`)**: When splitting tickets, enforce symmetrical dot notation (`3.1, 3.2` rather than `3, 3b`). Deep nested splitting (`3.2.1, 3.2.2 ... 3.2.n`) is fully encouraged whenever sub-modules remain complex.
- [ ] **Anti-Cascading Renumbering**: BANS re-indexing downstream tickets (`04 -> 05`). Downstream dependencies converge to the terminal child node.
- [ ] **No Splitting Immunity (Ticket Number/Depth is NOT a Metric)**: A ticket having a deeply nested number (e.g. `3.2.1.2`) does NOT grant it immunity from further splitting, nor does it make the work breakdown "clean". Audit tickets purely on technical scope, cyclomatic complexity, and tracer-bullet boundaries. If a deeply nested ticket still violates granularity criteria, SPLIT IT FURTHER without hesitation. Ticket numbering/depth must NEVER be used as an evaluation metric.

### 3. Dependency DAG Structure
- [ ] Dependency Ordering: Verify that ticket dependency structures are explicitly specified as a Directed Acyclic Graph (DAG) with no blocking loops.
- [ ] Critical Path Identification: Confirm the critical path is explicitly identified in the work plan to guide task prioritization.

### 4. Prerequisite Structural Isolation ($S \to B$) & Kent Beck's 4 Decision Gates
- [ ] **Prerequisite Structural Isolation ($S \to B$)**: Ensure that structural refactoring / tidying changes ($S$) are isolated into dedicated prerequisite tickets preceding behavioral feature changes ($B$). NEVER permit mixing refactorings and features in the same ticket or PR.
- [ ] **Tidying Economics & Decision Gates**: Verify that task sequencing honors Kent Beck's 4 Decision Gates based on change frequency and urgency:

| Trigger Condition | Decision Gate | Action Route |
| :--- | :---: | :--- |
| Structural change directly makes behavioral change easy or understandable. | **First** | Perform Tidying ($S$) now $\rightarrow$ Commit $\rightarrow$ Perform Behavior Change ($B$). |
| Code structure is messy, but behavioral change is urgent and area will be edited again soon. | **After** | Perform Behavior Change ($B$) now $\rightarrow$ Tidy ($S$) immediately after. |
| Structural change is large (> 1 hour), but time budget is severely constrained. | **Later** | Log Tidying task in backlog $\rightarrow$ Proceed directly with Behavior Change ($B$). |
| Code area is stable, deprecated, or will never be touched again. | **Never** | Leave code intact $\rightarrow$ Perform minimal direct change or leave untouched. |

### 5. Checkbox (`- [ ]`) & Nano Step Granularity
- [ ] **Atomic Checkbox Scope**: Ensure each `- [ ]` execution step represents a single-turn, atomic modification (< 50-100 LOC). Overloaded checkboxes containing multiple disparate tasks MUST be split (`SPLIT_STEP`).
- [ ] **Step Execution Ordering**: Verify checkboxes follow an incremental progression: Interface / Seams / Stubs $\rightarrow$ Core Logic $\rightarrow$ Edge Cases $\rightarrow$ Verification. Forward-referencing checkboxes MUST be re-ordered (`REORDER_STEPS`).
- [ ] **Dedicated Verification Steps**: Ensure critical state modifications, migrations, or algorithms are immediately followed by explicit verification steps running automated test commands or repro harnesses (`INJECT_VERIFICATION_STEP`).
- [ ] **Scope Creep Step Isolation**: Steps requiring complex architectural changes outside ticket scope MUST be promoted to independent tickets (`EXTRACT_STEP_TO_TICKET`).
- [ ] **Intra-Step Refactoring Isolation**: Structural tidying steps ($S$) MUST NOT be merged with behavior change steps ($B$) in the same checkbox (`ISOLATE_STEP_TIDYING`).

## Concrete Anti-Patterns

### Anti-Pattern 1: Horizontal Layer Task Decomposition
BAD (Horizontal Layering):
- Ticket 1: Create all DB Schemas for Feature X.
- Ticket 2: Write all backend endpoints for Feature X.
- Ticket 3: Build all frontend views for Feature X.
(Result: Zero testable functionality until Ticket 3 completes; huge integration risk.)

GOOD (Vertical Slicing):
- Ticket 1: Minimal DB schema, API endpoint, and UI component for Core Action A (Tracer Bullet).
- Ticket 2: Add validation rules and schema fields for Secondary Action B.
- Ticket 3: Add edge-case handling and UI error display.

### Anti-Pattern 2: Mixing Refactoring and Feature Implementation in the Same PR
BAD (Mixed Refactoring and Feature):
- Single ticket: "Refactor OrderService and implement Japan Tier Discounts" (750 lines diff; high review fatigue and risky git bisect).

GOOD (Tidy First Order):
- Ticket 1: [Refactor] Extract PricingStrategy interface from OrderService (Tidying S - 120 lines diff).
- Ticket 2: [Feature] Implement JapanSpecialTierStrategy via PricingStrategy seam (Behavior B - 95 lines diff).

### Anti-Pattern 3: Overloaded Checkboxes Inside Execution Plan
BAD (Multi-Concern Step):
- `[ ] Implement user avatar upload, write API tests, update profile settings page UI, and fix image cache bug.`

GOOD (Atomic Steps with Discrete Verification):
- `[ ] 1. Define AvatarStorage interface and local disk adapter stub` (`SPLIT_STEP`)
- `[ ] 2. Implement image validation and resizing pipeline` (`SPLIT_STEP`)
- `[ ] 3. Run unit tests verifying image validator against test fixtures` (`INJECT_VERIFICATION_STEP`)
- `[ ] 4. Mount avatar upload component in user profile UI` (`SPLIT_STEP`)

## Failure Modes & Mitigations

- Big-Bang Integration Failure: Enforce feature flagging for all intermediate PR merges into main branches.
- PR Stalls via Review Fatigue: Enforce strict PR size limits; require automated splitting of PRs that exceed line thresholds.
