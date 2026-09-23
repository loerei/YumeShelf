# Append-Only Event Store and Stream Evolution Safety

Audits immutable event streams, stream versioning, optimistic concurrency, and upcasting.

## Domain Audit Checklist

* [ ] Event Immutability: Confirm historical event records are never modified in-place or deleted; compensating events must be used for logical corrections.
* [ ] Optimistic Concurrency Control: Ensure event appends supply expected stream version numbers (`expected_version`) to reject concurrent write conflicts.
* [ ] Boundary Event Upcasting: Verify schema version evolution is isolated inside Event Upcaster adapters before passing payloads to domain aggregates.
* [ ] Metadata Separation: Ensure system metadata (e.g. correlation IDs, causation IDs, schema version) is separated from domain payload bodies.
* [ ] Projection Replay Determinism: Confirm read-model projection handlers are idempotent and capable of rebuilding state from arbitrary historical checkpoints.

## Concrete Anti-Patterns

### Anti-Pattern 1: In-Place Mutation of Historical Event Schemas

```typescript

// BAD: Mutating existing historical event structure breaks replaying past streams.
interface OrderPlacedEventV1 {
orderId: string;
total: number; // Modifying this to 'totalCents: number' breaks historical rehydration
}

// GOOD: Preserve immutable V1 contract and register explicit Upcaster to V2.
interface OrderPlacedEventV1 {
orderId: string;
total: number; // Dollars (Float)
}

interface OrderPlacedEventV2 {
orderId: string;
totalCents: number; // Cents (Integer)
}

export function upcastOrderPlaced(event: { version: number; payload: any }): OrderPlacedEventV2 {
if (event.version === 1) {
return {
orderId: event.payload.orderId,
totalCents: Math.round(event.payload.total * 100)
};
}
return event.payload;
}

```
## Failure Modes & Mitigations

- Concurrency Overwrite Hazard: Appending events without version validation overwrites concurrent state changes. Mitigate by enforcing stream version assertions on write.
- Projection Desynchronization: Non-deterministic event upcasters produce differing projection state across replays. Mitigate by keeping upcaster transformations pure and functional.
