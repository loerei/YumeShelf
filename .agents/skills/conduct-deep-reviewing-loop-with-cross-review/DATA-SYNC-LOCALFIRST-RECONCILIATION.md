# Hybrid and Local-First Data Reconciliation Safety

Audits sync-driven architectures, CRDT convergence, client drift, and tombstones.

## Domain Audit Checklist

* [ ] Tombstone Retention Horizon: Verify deleted records persist explicit tombstone markers (`deleted_at`), and ensure physical garbage collection is gated behind an offline retention window.
* [ ] Entity Resurrection Guards: Confirm incoming sync deltas verify local tombstone registers to prevent re-inserting records previously deleted on the client.
* [ ] Additive Schema Evolution: Ensure sync schema evolution follows additive-only rules; removing or redefining fields across active clients is strictly prohibited.
* [ ] CRDT Intent Preservation: Verify CRDT operations account for non-convergent domain invariants (e.g. balance constraints), delegating validation to authoritative servers.
* [ ] Client Re-Bootstrap Barrier: Ensure clients disconnected longer than the maximum tombstone retention horizon are forced to wipe local caches and re-clone state.

## Concrete Anti-Patterns

### Anti-Pattern 1: Physical Deletion in Sync Stores (Resurrection Defect)

```typescript

// BAD: Physical deletion removes record locally; subsequent pull treats missing row as un-synced and restores it.
export async function deleteTodo(db: Database, id: string): Promise {
await db.exec('DELETE FROM todos WHERE id = ?', [id]);
}

// GOOD: Persist tombstone marker with retention timestamp to broadcast deletion.
export async function deleteTodoSafe(db: Database, id: string): Promise {
await db.exec(
'UPDATE todos SET is_deleted = 1, deleted_at = ? WHERE id = ?',
[new Date().toISOString(), id]
);
}

```
## Failure Modes & Mitigations

- Entity Resurrection: Physical deletion on client causes server sync to re-insert record on next pull. Mitigate by maintaining soft-delete tombstones across sync boundaries.
- Divergent Merge Corruption: Uncoordinated field updates over-write concurrent changes. Mitigate by using field-level LWW timestamps or CRDT delta replication.
