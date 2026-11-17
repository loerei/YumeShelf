# Server-Side Relational Schema and Migration Safety

Audits relational database migrations, locking dynamics, and operational continuity alignment.

## Domain Audit Checklist

- [ ] **Mandatory Versioned Migration Scripts**: Every schema alteration MUST execute through a versioned migration script with deterministic up/down or backup-restore paths ensuring zero data loss.
- [ ] **Lock & Statement Timeouts**: Set explicit `lock_timeout` (e.g. `2s`) and `statement_timeout` before executing DDL alterations on live tables.
- [ ] **Non-Blocking Index & Constraint Builds (`CONTINUOUS_OPERATION`)**: On live 24/7 tables, build indexes via `CREATE INDEX CONCURRENTLY` (Postgres) / `ALGORITHM=INPLACE, LOCK=NONE` (MySQL), and add foreign keys/check constraints with `NOT VALID` followed by a separate `VALIDATE CONSTRAINT` transaction.
- [ ] **Operational Continuity Migration Alignment**:
  - `CONTINUOUS_OPERATION` *(default: 24/7 zero-downtime)*: Enforce multi-deploy Expand $\rightarrow$ Backfill $\rightarrow$ Switch $\rightarrow$ Contract migration phases so application versions $N$ and $N+1$ operate concurrently without errors.
  - `NON_CONTINUOUS_OPERATION` *(tag `!NC`: offline maintenance upgrades or single-instance deployments where $N$ & $N+1$ do not run simultaneously)*: **Enforce sequential migration scripts ($V_1 \to V_2$) that transform and preserve existing records**, while permitting direct single-step atomic cutover DDL (e.g. `ALTER TABLE ... RENAME/DROP COLUMN` after data transformation in the migration script) and **banning** temporary multi-deploy dual-write shims.
  - `NON_CONTINUOUS_INTERMEDIATE` *(tag `!NC0` / `!NCI`)*: Audit schema types and constraints only; do not demand migration runners or rollback scripts.
- [ ] **Keyset-Paginated Data Backfills**: Execute large data backfills in bounded batches (`WHERE id > :last_id ORDER BY id ASC LIMIT :batch_size`) across short transactions to prevent vacuum/undo-log bloat.
- [ ] **Reversibility & Rollback Safety**: Confirm every schema migration includes an operational rollback script or pre-migration snapshot verification that does not lose production data (exempt under `NON_CONTINUOUS_INTERMEDIATE`).

## Concrete Anti-Patterns

### Anti-Pattern 1: Blocking Index and Constraint Addition on Live Tables (`CONTINUOUS_OPERATION`)

```sql
-- BAD: Acquires ACCESS EXCLUSIVE lock while scanning entire table, blocking all reads and writes
ALTER TABLE orders ADD CONSTRAINT fk_customer FOREIGN KEY (customer_id) REFERENCES customers(id);
CREATE INDEX idx_orders_customer ON orders(customer_id);

-- GOOD (CONTINUOUS_OPERATION): Non-blocking index build and two-step constraint validation
CREATE INDEX CONCURRENTLY idx_orders_customer ON orders(customer_id);

SET lock_timeout = '2s';
ALTER TABLE orders ADD CONSTRAINT fk_customer FOREIGN KEY (customer_id) REFERENCES customers(id) NOT VALID;
RESET lock_timeout;

ALTER TABLE orders VALIDATE CONSTRAINT fk_customer;
```

## Failure Modes & Mitigations

| Failure Mode | Root Cause | Mitigation |
| :--- | :--- | :--- |
| **Lock Queue Cascade Outage** | `ALTER TABLE` waiting on an active query blocks all subsequent queries behind its `ACCESS EXCLUSIVE` lock request. | Precede every `ALTER TABLE` with `SET lock_timeout = '2s'` and retry with backoff. |
| **Autovacuum / XID Wraparound Stall** | Single multi-hour transaction backfilling millions of rows. | Commit backfills in keyset-paginated batches of 1,000–5,000 rows per transaction. |
