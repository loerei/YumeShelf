# Distributed NoSQL Schema and Backfill Safety

Audits distributed document/KV storage evolution, partition key distribution, and backfill throughput.

## Domain Audit Checklist

- [ ] **Explicit Version Discriminator**: Confirm all persisted documents contain a top-level integer `schema_version` attribute.
- [ ] **Boundary Document Upcasters**: Handle schema version upgrades at repository deserialization boundaries rather than scattering version conditionals in domain logic.
- [ ] **Partition Key Uniformity**: Avoid monotonically increasing partition keys (e.g. raw date/timestamp prefixes) that route all current writes to a single hot shard.
- [ ] **Keyset-Paginated Backfills**: Iterate mass document migrations via keyset range cursors, rejecting offset pagination (`SKIP`).
- [ ] **Rate-Limited Backoff with Jitter**: Implement exponential backoff with full jitter on write throttling (`ProvisionedThroughputExceededException` / HTTP 429).

## Concrete Anti-Patterns

### Anti-Pattern 1: Monotonic Partition Keys Causing Hot-Shard Throttling

```typescript
// BAD: ISO date prefix routes 100% of today's writes to a single physical partition shard
export function createPartitionKeyBad(tenantId: string, timestamp: Date): string {
  return `${timestamp.toISOString().slice(0, 10)}#${tenantId}`;
}

// GOOD: Deterministic SHA-256 shard prefix distributes writes evenly across partitions (FIPS-safe)
import * as crypto from "node:crypto";

export function createPartitionKeySafe(tenantId: string, entityId: string): string {
  const shardPrefix = crypto.createHash("sha256").update(`${tenantId}:${entityId}`).digest("hex").slice(0, 4);
  return `${shardPrefix}#${tenantId}#${entityId}`;
}
```

## Failure Modes & Mitigations

| Failure Mode | Root Cause | Mitigation |
| :--- | :--- | :--- |
| **Hot Partition Write Throttling** | Timestamp-prefixed or unsharded high-volume tenant keys. | Prefix keys with a bounded hash shard (`sha256` prefix) or composite entity key. |
| **Worker OOM During Backfill** | Unbounded cursor streaming into memory without batch limits. | Enforce explicit page size limits and checkpoint last-processed key per batch. |
