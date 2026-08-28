# Architectural Subdocument: Event-Driven & Asynchronous Messaging

## Domain Audit Checklist

### 1. Message Schema and Evolution
- [ ] Schema Compatibility: Verify that message schemas (Avro, Protobuf, JSON Schema) utilize backward and forward compatibility rules. Reject breaking schema changes (e.g., removing required fields, changing field types) without explicit major versioning.
- [ ] Schema Registry Coupling: Ensure event producers do not inline raw JSON payloads without register-backed schemas or structural validation interfaces.

### 2. Transactional Outbox Pattern
- [ ] Atomicity Verification: Confirm that state modifications and event publishing execute within the same local database transaction using a dedicated Outbox table. Reject direct broker publication calls within application service transactions.
- [ ] Relay Mechanics: Ensure the outbox reader uses polling or CDC (Change Data Capture) with explicit batching and error-retry limits.

### 3. Idempotency & Consumer Guarantee
- [ ] Consumer Idempotency: Verify that consumers implement deterministic message deduplication based on a unique message ID or natural business key stored in an atomic persistence layer.
- [ ] Processing Ordering: Check if sequence ordering guarantees are required. If required, verify partition key design ensures related events route to the same Kafka partition/SQS message group.

### 4. Poison Pill & Dead-Letter Queuing (DLQ)
- [ ] Failure Escalation: Verify that unparseable or continuously failing messages redirect to a Dead-Letter Queue after a bounded max-retry threshold (e.g., 3–5 attempts).
- [ ] DLQ Inspection & Replay: Confirm that tooling or manual playbooks exist to inspect, modify, and safely re-inject DLQ messages back into the primary topic.

## Concrete Anti-Patterns

### Anti-Pattern 1: Direct Broker Publish in Database Transaction

```typescript
// BAD: Broker publish occurs inside local DB transaction.
// If broker fails, DB rolls back, but message might have sent.
// If DB commit fails after publish, downstream consumers process ghost data.
await db.transaction(async (tx) => {
const order = await tx.orders.create(orderData);
await kafkaProducer.send({ topic: 'orders', message: JSON.stringify(order) });
});

// GOOD: Use Transactional Outbox.
await db.transaction(async (tx) => {
const order = await tx.orders.create(orderData);
await tx.outbox.create({
aggregateType: 'Order',
aggregateId: order.id,
payload: JSON.stringify(order),
status: 'PENDING'
});
});
```

### Anti-Pattern 2: Non-Atomic Consumer Processing
```go
// BAD: Acknowledging message before DB transaction commits.
func processMessage(msg Message) error {
    ack(msg) // Ack sent first!
    if err := db.Save(msg.Data); err != nil {
        return err // Message lost forever if DB write fails!
    }
    return nil
}

// GOOD: Process state change, commit DB, then acknowledge.
func processMessage(msg Message) error {
    if err := db.SaveIdempotent(msg.ID, msg.Data); err != nil {
        return err // Retry handled by broker
    }
    ack(msg)
    return nil
}
```

## Failure Modes & Mitigations

- Split-Brain Partitioning in Brokers: Enforce leader election quorum rules (`min.insync.replicas=2`, `acks=all`).
- Consumer Group Starvation: Ensure message handlers never block event loops indefinitely; enforce explicit processing timeouts per message.
