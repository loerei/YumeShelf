# Server-Side Relational Schema and Non-Blocking DDL Safety

Audits relational database migrations, locking dynamics, and zero-downtime lifecycles.

## Domain Audit Checklist

* [ ] Lock and Statement Timeouts: Verify all DDL scripts explicitly set `lock_timeout` (e.g. 2s) and `statement_timeout` (e.g. 5s) before issuing alterations.
* [ ] Non-Blocking Index Builds: Ensure indexes are created using non-blocking commands (`CREATE INDEX CONCURRENTLY` in Postgres; `ALGORITHM=INPLACE, LOCK=NONE` in MySQL).
* [ ] Phased Constraint Validation: Confirm foreign key and check constraints are added using `NOT VALID` and validated in a separate transaction via `VALIDATE CONSTRAINT`.
* [ ] Expand-Contract Execution: Verify structural renames or column splits use multi-deploy expand, backfill, and contract phases rather than atomic renames.
* [ ] Keyset-Paginated Backfills: Ensure data migrations execute in throttled batches using keyset pagination (`WHERE id > :last_id ORDER BY id ASC LIMIT :batch_size`).
* [ ] Reversibility / Rollback Safety: Confirm every schema change includes an operational rollback script that does not destroy un-migrated production data.

## Concrete Anti-Patterns

### Anti-Pattern 1: Blocking Index and Constraint Addition

```sql

-- BAD: Takes ACCESS EXCLUSIVE lock on orders; blocks all concurrent traffic.
ALTER TABLE orders ADD CONSTRAINT fk_customer FOREIGN KEY (customer_id) REFERENCES customers(id);
CREATE INDEX idx_orders_customer ON orders(customer_id);

-- GOOD: Non-blocking index creation and non-blocking constraint validation.
-- Step 1: Build index concurrently without blocking writes
CREATE INDEX CONCURRENTLY idx_orders_customer ON orders(customer_id);

-- Step 2: Add constraint without validating existing rows (instant catalog lock)
SET lock_timeout = '2s';
ALTER TABLE orders ADD CONSTRAINT fk_customer FOREIGN KEY (customer_id) REFERENCES customers(id) NOT VALID;
RESET lock_timeout;

-- Step 3: Validate constraint concurrently
ALTER TABLE orders VALIDATE CONSTRAINT fk_customer;

```
## Failure Modes & Mitigations

- Lock Queue Death Spiral: Heavy DDL waiting on lock blocks subsequent queries, exhausting connection pool. Mitigate by setting `SET lock_timeout = '2s'`.
- Autovacuum Wraparound Freeze: Multi-hour backfill transactions block table cleanup, risking XID wraparound shutdown. Mitigate by batching backfills in short, isolated transactions.
