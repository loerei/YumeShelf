# Browser IndexedDB Storage and Upgrade Safety

Audits web client IndexedDB schema upgrades, transaction scopes, and tab coordination.

## Domain Audit Checklist

* [ ] Version Change Coordination: Verify `onversionchange` listeners are registered on open database instances to close connections when sibling tabs initiate upgrades.
* [ ] Blocked Event Recovery: Ensure `blocked` event handlers do NOT permanently cache null connections or dead promises; connection attempts must remain recoverable.
* [ ] Structural Upgrade Isolation: Confirm object store and index modifications occur strictly within `onupgradeneeded` lifecycle handlers.
* [ ] Transaction Lifecycle: Verify asynchronous operations (e.g. network requests) are never awaited inside active IndexedDB transactions to prevent premature auto-commit aborts.
* [ ] Multi-Version Step Handling: Ensure migration branches sequentially from `event.oldVersion` through `event.newVersion`, supporting users skipping releases.
* [ ] Quota Failure Handling: Confirm write operations intercept `QuotaExceededError` and preserve unsaved local edits in memory without crashing the interface.

## Concrete Anti-Patterns

### Anti-Pattern 1: Permanent Connection Latching on Blocked Event

```typescript

// BAD: Memoizing connection promise resolves to null on blocked event, killing tab persistence for session.
let dbPromise: Promise | null = null;

export function getDB(): Promise {
if (!dbPromise) {
dbPromise = new Promise((resolve, reject) => {
const req = indexedDB.open('AppStore', 2);
req.onblocked = () => resolve(null as any); // Tab permanently persists nothing
req.onsuccess = () => resolve(req.result);
req.onerror = () => reject(req.error);
});
}
return dbPromise;
}

// GOOD: Listen for versionchange to release connection; clear memoized promise on blocked.
let activeDB: IDBDatabase | null = null;

export function openDatabase(): Promise {
return new Promise((resolve, reject) => {
const req = indexedDB.open('AppStore', 2);
req.onblocked = () => {
// Do not cache null; allow subsequent retry when blocking tab closes
reject(new Error('UPGRADE_BLOCKED_BY_SIBLING_TAB'));
};
req.onsuccess = () => {
activeDB = req.result;
activeDB.onversionchange = () => {
activeDB?.close();
activeDB = null;
alert('Application updated in another tab. Please refresh.');
};
resolve(activeDB);
};
req.onerror = () => reject(req.error);
});
}

```
## Failure Modes & Mitigations

- Silent Write Drops: Caching a failed connection on `blocked` creates zombie tabs that show optimistic UI but persist zero rows. Mitigate by clearing memoized connection variables on error.
- Transaction Inactive Abort: Awaiting network fetch inside an IDB transaction forces the browser to auto-commit and close the transaction. Mitigate by fetching network data before opening IDB transactions.
