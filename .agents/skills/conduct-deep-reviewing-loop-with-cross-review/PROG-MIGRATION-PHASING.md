# Migration Phasing and Rollout DAGs

## Domain Audit Checklist

### 1. Multi-Stage Deployment Planning
- [ ] Phased Migration Sequence: Ensure system migrations execute through explicit, sequential steps: Expand -> Parallel Write -> Backfill -> Read Switch -> Contract -> Delete.
- [ ] Phase Milestone Gates: Verify each stage defines measurable completion metrics (e.g., $100\%$ log verification of shadow reads matching primary reads) before proceeding.

### 2. Backward & Forward Compatibility
- [ ] Zero-Downtime Strategy: Confirm all structural changes support side-by-side operation of both $N$ and $N+1$ application binary versions.
- [ ] Rollback Paths: Ensure every phase includes a fully automated rollback procedure that does not involve data destruction or manual DB repair.

## Concrete Anti-Patterns

### Anti-Pattern 1: Single-Step Atomic Cutover
BAD:
Phase 1: Deploy new application version that drops OldField and writes to NewField simultaneously.
// Flaw: Causes service outage if rollout stalls; running instances crash if OldField is removed prematurely.

GOOD:
Phase 1: Add NewField (nullable) to persistence layer. Deploy App v1.1 (writes OldField + NewField, reads OldField).
Phase 2: Backfill historical data from OldField to NewField.
Phase 3: Deploy App v1.2 (reads NewField, fallback to OldField if null).
Phase 4: Deploy App v1.3 (reads and writes exclusively to NewField).
Phase 5: Drop OldField column.

## Failure Modes & Mitigations

- Unrecoverable Schema Corruption: Do not drop columns or fields immediately. Enforce deprecation holding periods.
- Dual-Write Inconsistency: Use asynchronous backfill reconciliation background jobs to resolve discrepancies between primary and secondary storage models.
