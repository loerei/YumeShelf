# DataMigration Subdocument: Relational Database Schema & DDL Lock Safety

## Domain Audit Checklist

### 1. Non-Blocking DDL Operations
- [ ] Non-Locking Index Creation: Verify that all new indexes on production tables use concurrent build commands (e.g., PostgreSQL `CREATE INDEX CONCURRENTLY`).
- [ ] Default Value Column Additions: Ensure column additions with non-null constraints and default values do not trigger full table rewrites (PostgreSQL <11 check; verify engine capabilities).

### 2. Constraint & Alteration Locking
- [ ] Foreign Key Validation: Confirm foreign key additions are added with `NOT VALID` syntax and subsequently validated via separate non-blocking transactions.
- [ ] Timeout Enforcements: Verify all migration scripts set explicit statement timeouts (`SET statement_timeout = '5s';`) and lock timeouts before executing DDL alterations.

### 3. Reversibility & Rollback Integrity
- [ ] Down Migration Scripts: Ensure every migration includes a fully tested `down.sql` script that safely removes modified components without dropping un-migrated user data.

## Concrete Anti-Patterns

### Anti-Pattern 1: Blocking Index Creation on Production Tables

```sql
-- BAD: Takes ExclusiveLock on table, blocking all concurrent SELECT/INSERT/UPDATE queries.
ALTER TABLE orders ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id);
CREATE INDEX idx_orders_user_id ON orders(user_id);

-- GOOD: Non-blocking execution pattern
-- Step 1: Create Index Concurrently
CREATE INDEX CONCURRENTLY idx_orders_user_id ON orders(user_id);

-- Step 2: Add Foreign Key constraint without validating existing rows (fast lock)
ALTER TABLE orders ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id) NOT VALID;

-- Step 3: Validate constraint concurrently without blocking writes
ALTER TABLE orders VALIDATE CONSTRAINT fk_user;
```

## Failure Modes & Mitigations

- Lock Cascade Deadlocks: Enforce lock timeouts (`SET lock_timeout = '2s';`) so migration scripts instantly abort if blocked by running application transactions.
- Orphaned Concurrent Index Failures: Monitor for `INVALID` status on failed concurrent index creations and clean up before retrying.
