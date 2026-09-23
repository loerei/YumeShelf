# Offline Mutation Outbox and Sync Queue Safety

Audits client-side mutation queues, optimistic reconciliation, and idempotency.

## Domain Audit Checklist

* [ ] Transactional Outbox Insertion: Confirm optimistic UI mutations and outbox queue entries commit within a single atomic local database transaction.
* [ ] Stable Operation Identifiers: Verify all queued mutations assign a persistent UUID (`operation_id`) generated at action creation, not transmission time.
* [ ] Server Idempotency Receipts: Ensure server endpoints record operation IDs and return identical processing receipts upon duplicate retry submissions.
* [ ] Multi-Tab Replay Exclusion: Verify outbox queue processing acquires a Web Lock (`navigator.locks.request`) to prevent concurrent duplicate replays.
* [ ] Settlement Failure Reconciliation: Confirm rejected mutations rollback local optimistic state and notify user without halting the queue runner.

## Concrete Anti-Patterns

### Anti-Pattern 1: Un-Transactional Outbox Enqueuing

```typescript

// BAD: Modifying local state and enqueuing network mutation in separate steps.
// App crash between steps leaves UI desynchronized from outbox queue.
export async function updateTitle(db: Database, id: string, title: string): Promise {
await db.exec('UPDATE tasks SET title = ? WHERE id = ?', [title, id]);
// CRASH HERE: State is updated locally but never transmitted to server
await db.exec('INSERT INTO outbox (op, task_id, payload) VALUES (?, ?, ?)', ['update', id, JSON.stringify({ title })]);
}

// GOOD: Atomic commit of optimistic local mutation and outbox queue record.
export async function updateTitleAtomic(db: Database, id: string, title: string): Promise {
await db.transaction(async (tx) => {
await tx.exec('UPDATE tasks SET title = ? WHERE id = ?', [title, id]);
await tx.exec(
'INSERT INTO outbox (operation_id, task_id, payload, created_at) VALUES (?, ?, ?, ?)',
[crypto.randomUUID(), id, JSON.stringify({ title }), Date.now()]
);
});
}

```
## Failure Modes & Mitigations

- Phantom Local Edits: Decoupled outbox writes leave local changes stranded if app crashes before queueing. Mitigate by grouping state update and outbox insertion in one transaction.
- Duplicate Execution on Reconnect: Retrying un-acknowledged network requests duplicates financial or inventory mutations. Mitigate by checking client UUIDs against an idempotent server receipt table.
