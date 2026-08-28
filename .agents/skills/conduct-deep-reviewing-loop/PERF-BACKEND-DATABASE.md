# Performance Subdocument: Backend Database Query Efficiency & $O(N)$ Hazards

## Domain Audit Checklist

### 1. Query Execution Plan Efficiency
- [ ] Covering Index Verification: Verify that high-frequency API endpoints perform queries that hit index lookups (`Index Scan` / `Index Only Scan`). Reject queries causing full table scans (`Seq Scan`) on growing production tables.
- [ ] N+1 Query Detection: Confirm ORM implementations use explicit prefetching or join fetches (`select_related`, `prefetch_related`, `JOIN FETCH`) to eliminate $N+1$ query patterns.

### 2. Result Set Streaming & Aggregation
- [ ] Dynamic Pagination: Ensure all list endpoints mandate maximum result size boundaries (`LIMIT`) and use cursor-based pagination for large datasets. Reject offset-based pagination (`OFFSET 100000`).
- [ ] Stream Backpressure: Confirm large export or processing queries stream records through dynamic cursors rather than loading entire database result sets into application RAM.

## Concrete Anti-Patterns

### Anti-Pattern 1: ORM $N+1$ Query Execution Vector

```python
# BAD: Iterating over N users executes 1 query for users, plus N queries for orders.
users = UserModel.objects.all() # Query 1
for user in users:
    print(user.orders.all())   # Executes N separate queries!

# GOOD: Enforce Single Join / Prefetch Execution
users = UserModel.objects.prefetch_related('orders').all() # Executes 2 optimized queries total
for user in users:
    print(user.orders.all())
```

### Anti-Pattern 2: Dynamic Offset Pagination Performance Collapse

```sql
-- BAD: Database must scan and throw away 500,000 rows before returning 20.
SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 20 OFFSET 500000;

-- GOOD: Cursor-based pagination using indexed field key
SELECT * FROM audit_logs WHERE id < 'last_seen_indexed_id' ORDER BY id DESC LIMIT 20;
```

## Failure Modes & Mitigations

- Connection Pool Exhaustion: Configure application connection pools with lease lifetime recycling and strict acquire timeout caps.
- Database Memory Spikes via Unbounded Sorting: Enforce memory limits on `work_mem` configuration parameters to prevent disk-based sorting operations.
