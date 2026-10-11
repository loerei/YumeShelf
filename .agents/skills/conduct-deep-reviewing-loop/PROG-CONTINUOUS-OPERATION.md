# Continuous Operation Phasing and Rollout

Audit criteria for live production services, zero-downtime migrations, and continuously operating codebases where intermediate commits must keep the system fully functional.

## Domain Audit Checklist

### 1. Vertical Tracer-Bullet Slicing
- [ ] Vertical Slicing: Verify tasks are broken down vertically across architectural layers (UI, API, Data, Tests) rather than horizontally by technical stack. Each ticket must deliver an end-to-end slice that functions without waiting for subsequent tickets.
- [ ] End-to-End Skeleton First: Confirm initial task phases deliver a fully connected end-to-end tracer bullet with minimal mock functionality before building complex edge cases.
- [ ] Independent Value Delivery: Ensure each ticket delivers a testable unit of functionality that can be merged safely behind feature flags without breaking the main branch.

### 2. Multi-Stage Deployment & Zero-Downtime Rollout
- [ ] Phased Migration Sequence: Ensure system migrations execute through explicit, sequential steps: Expand $\rightarrow$ Parallel Write $\rightarrow$ Backfill $\rightarrow$ Read Switch $\rightarrow$ Contract $\rightarrow$ Delete.
- [ ] Zero-Downtime Strategy: Confirm all structural changes support side-by-side operation of both $N$ and $N+1$ application binary versions.
- [ ] Phase Milestone Gates: Verify each stage defines measurable completion metrics (e.g., $100\%$ log verification of shadow reads matching primary reads) before proceeding to contract or deletion phases.
- [ ] Rollback Paths: Ensure every phase includes a fully automated rollback procedure that does not involve data destruction or manual DB repair.
- [ ] Postel's Law Demarcation: Preserve backward-compatible decoding during transitional milestone phases.

## Concrete Anti-Patterns

### Anti-Pattern 1: Horizontal Layer Task Decomposition
BAD (Horizontal Layering in Continuous Systems):
- Ticket 1: Create all DB Schemas for Feature X.
- Ticket 2: Write all backend endpoints for Feature X.
- Ticket 3: Build all frontend views for Feature X.
(Result: Zero testable end-to-end functionality until Ticket 3 completes; broken build and high integration risk for continuous branches.)

GOOD (Vertical Slicing):
- Ticket 1: Minimal DB schema, API endpoint, and UI component for Core Action A (Tracer Bullet).
- Ticket 2: Add validation rules and schema fields for Secondary Action B.
- Ticket 3: Add edge-case handling and UI error display.

### Anti-Pattern 2: Single-Step Atomic Cutover
BAD:
- Phase 1: Deploy new application version that drops OldField and writes to NewField simultaneously.
(Flaw: Causes service outage if rollout stalls; running instances crash if OldField is removed prematurely.)

GOOD (Expand-Contract):
- Phase 1: Add NewField (nullable) to persistence layer. Deploy App v1.1 (writes OldField + NewField, reads OldField).
- Phase 2: Backfill historical data from OldField to NewField.
- Phase 3: Deploy App v1.2 (reads NewField, fallback to OldField if null).
- Phase 4: Deploy App v1.3 (reads and writes exclusively to NewField).
- Phase 5: Drop OldField column.

## Failure Modes & Mitigations
- Big-Bang Integration Failure: Enforce feature flagging for all intermediate PR merges into main branches.
- Unrecoverable Schema Corruption: Do not drop columns or fields immediately. Enforce deprecation holding periods.
- Dual-Write Inconsistency: Use asynchronous backfill reconciliation background jobs to resolve discrepancies between primary and secondary storage models.
