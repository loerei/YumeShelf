# Distributed NoSQL Schema and Backfill Safety

Audits distributed document/KV storage evolution, partition distribution, and throughput.

## Domain Audit Checklist

* [ ] Explicit Version Discriminator: Confirm all persisted document payloads contain a top-level `schema_version: int` attribute.
* [ ] Read-Time Document Adapters: Verify schema evolution is handled at repository boundaries via transformation adapters rather than branching in domain models.
* [ ] Partition Key Uniformity: Confirm partition keys avoid monotonically increasing values (e.g. timestamp prefixes) that create hot partition bottlenecks.
* [ ] Keyset-Paginated Migration Sweeps: Verify mass document transformations iterate via keyset range cursors, strictly rejecting offset-based pagination (`SKIP`).
* [ ] Rate-Limiting & Jittered Retry: Ensure migration workers implement exponential backoff with jitter upon encountering HTTP 429 or write capacity throttling.

## Concrete Anti-Patterns

### Anti-Pattern 1: Monotonic Partition Keys on High-Throughput Tables

```typescript

// BAD: ISO date string prefix routes all current writes to a single physical partition.
export function createPartitionKey(tenantId: string, timestamp: Date): string {
return `${timestamp.toISOString().slice(0, 10)}#${tenantId}`;
}

// GOOD: Tenant hash or compound entity key distributes writes evenly across partition shards.
import * as crypto from 'crypto';

export function createPartitionKey(tenantId: string, entityId: string): string {
const hashPrefix = crypto.createHash('md5').update(tenantId).digest('hex').slice(0, 4);
return `${hashPrefix}#${tenantId}#${entityId}`;
}

```
## Failure Modes & Mitigations

- Partition Throttling: Hot partition key exhausts provisioned IOPS, failing application writes. Mitigate by prefixing keys with hash salt or composite entity identifiers.
- Out of Memory on Cursor Traversal: Unbounded document streaming exhausts worker heap memory. Mitigate by setting explicit cursor batch limits and periodic garbage collector yields.
