# DataMigration Subdocument: NoSQL Schemas, Event Stores & Stream Evolution

## Domain Audit Checklist

### 1. Document Schema Flexibility & Upgrades
- [ ] Lazy Migration Wrappers: Verify that document store schema reads implement lazy schema adaptation (e.g., handling missing fields by assigning defaults in application models).
- [ ] Version Discriminators: Confirm all document payloads contain an explicit `schema_version` integer field.

### 2. Event Store Append Safety
- [ ] Optimistic Concurrency Control: Ensure event appends pass expected stream version tags to prevent concurrent overwrite race conditions.
- [ ] Event Stream Immutability: Confirm existing historical events are never deleted or updated in place; field modifications require new compensative events.

### 3. Backfill Pagination & Heat Controls
- [ ] Partition Key Hot-Spotting: Verify key generation strategies prevent monotonically increasing keys (e.g., raw timestamps) that route writes to single database partitions.
- [ ] Throttle-Aware Backfills: Ensure backfill workers respect database provisioned throughput constraints and use exponential backoff on HTTP 429 / write throttles.

## Concrete Anti-Patterns

### Anti-Pattern 1: Direct Schema Mutation without Versioning

```python
# BAD: Code assumes all MongoDB documents contain 'full_name' field.
# Old documents with 'first_name' and 'last_name' throw NullPointer / KeyError exceptions.
def process_user(doc):
    name = doc['full_name'] # CRASHES on legacy records!

# GOOD: Version discriminator with dynamic adapter fallback.
def process_user(doc):
    version = doc.get('schema_version', 1)
    if version == 1:
        full_name = f"{doc['first_name']} {doc['last_name']}"
    else:
        full_name = doc['full_name']
    return full_name
```

## Failure Modes & Mitigations

- Database Partition Throttling: Hash primary keys before storage or prepend key namespaces with random prefixes to distribute write load.
- Memory Exhaustion During Mass Migration: Force batch cursor iterations to use fixed limit limits with explicit garbage collection points.
