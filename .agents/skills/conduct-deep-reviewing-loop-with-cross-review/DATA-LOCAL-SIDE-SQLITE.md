# Local SQLite Storage and Migration Safety

Audits embedded SQLite schema evolution, transaction boundaries, and crash recovery.

## Domain Audit Checklist

* [ ] Startup Lifecycle Execution: Verify migrations execute during storage bootstrap before services, IPC channels, or UI components mount.
* [ ] Explicit Version Pragma: Confirm database declares an explicit monotonic integer version using `PRAGMA user_version`.
* [ ] Twelve-Step Table Recreation: Verify structural table refactoring (column drops, constraint updates) adheres to SQLite's formal 12-step recreation sequence.
* [ ] Foreign Key Pragma Placement: Ensure `PRAGMA foreign_keys = OFF` is executed strictly outside the active transaction boundary before table recreation.
* [ ] Foreign Key Validation: Confirm `PRAGMA foreign_key_check` executes inside the transaction before committing recreation changes.
* [ ] Transaction Locking Mode: Ensure migrations use `BEGIN IMMEDIATE` or `BEGIN EXCLUSIVE` to acquire write locks immediately.
* [ ] Corruption Quarantine: Verify startup integrity check (`PRAGMA quick_check`) executes at boot, quarantining damaged databases to timestamped backups upon failure.

## Concrete Anti-Patterns

### Anti-Pattern 1: Disabling Foreign Keys Inside Transaction

```sql

-- BAD: Modifying foreign keys pragma inside transaction is a silent no-op.
-- Dropping the table cascades deletions across referencing child tables.
BEGIN IMMEDIATE;
PRAGMA foreign_keys = OFF;
DROP TABLE projects;
ALTER TABLE new_projects RENAME TO projects;
COMMIT;

-- GOOD: Disable foreign keys before opening transaction; re-enable after commit.
PRAGMA foreign_keys = OFF;
BEGIN IMMEDIATE;
CREATE TABLE new_projects (
id INTEGER PRIMARY KEY AUTOINCREMENT,
name TEXT NOT NULL,
created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);
INSERT INTO new_projects (id, name) SELECT id, name FROM projects;
DROP TABLE projects;
ALTER TABLE new_projects RENAME TO projects;
PRAGMA foreign_key_check;
COMMIT;
PRAGMA foreign_keys = ON;

```
## Failure Modes & Mitigations

- Silent Cascade Purge: Executing table recreation while foreign keys remain active purges child records. Mitigate by placing `PRAGMA foreign_keys = OFF` before `BEGIN`.
- Database Malformed Panic: Mid-write power cuts can corrupt page b-trees. Mitigate by running `PRAGMA quick_check` at boot; isolate malformed files to `.corrupt.<timestamp>` and re-initialize.
