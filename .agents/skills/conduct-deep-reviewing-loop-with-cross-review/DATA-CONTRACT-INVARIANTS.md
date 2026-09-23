# Shared Data Contract and Serialization Invariants

Audits cross-tier serialization, schema version registers, and payload boundaries.

## Domain Audit Checklist

* [ ] Monotonic Integer Versioning: Confirm all persistent stores declare an explicit integer version register (`user_version`, `schema_version`).
* [ ] Postel's Law Demarcation: Enforce permissive ingress validation only on external boundaries; internal persistence must enforce strict typed contracts.
* [ ] Precision-Preserving Types: Verify financial, cryptographic, and high-precision numeric values are stored as integers (cents/basis points) or strings, not IEEE 754 floats.
* [ ] Non-Destructive Enum Evolution: Confirm enum alterations add new variants without re-ordering existing integer mappings or narrowing string unions.
* [ ] Bidirectional Lineage Contract: Ensure schema additions do not mutate or overwrite fields owned by upstream Directive Artifacts without merge semantics.

## Concrete Anti-Patterns

### Anti-Pattern 1: Floating-Point Storage of Monetary Values

```typescript

// BAD: Storing currency as IEEE 754 float introduces decimal precision drift.
export interface AccountRecord {
accountId: string;
balance: number; // e.g. 19.99 becomes 19.989999999999998
}

// GOOD: Store currency in smallest fractional unit (cents) as integer.
export interface AccountRecord {
accountId: string;
balanceCents: bigint; // Exact integer representation
currency: string;
}

```
## Failure Modes & Mitigations

- Precision Erosion: Floating-point arithmetic during balance migrations corrupts accounting records. Mitigate by storing monetary amounts as integer minor units.
- Upstream Field Collisions: A downstream migration renaming an inherited column breaks upstream data contracts. Mitigate by cross-referencing upstream lineage declarations.
