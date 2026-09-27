# Domain Entities, Value Objects, and Boundary Hygiene

Audits domain modeling, boundary parsing membranes, Value Object immutability, and Primitive Obsession.

## Domain Audit Checklist

### 1. Primitive Obsession Elimination

* [ ] Branded / Value Object Types: Verify domain identifiers (`UserId`, `OrderId`, `AccountId`) and scalar concepts (`Money`, `EmailAddress`, `Percentage`) are encapsulated as distinct Value Objects or branded types rather than raw strings or numbers.
* [ ] Unit & Precision Encapsulation: Ensure numeric quantities with units (durations, memory sizes, currencies, basis points) encapsulate their unit of measurement and precision within the type contract.

### 2. Entity and Aggregate Invariants

* [ ] Identity Boundary: Confirm domain Entities possess explicit, stable identities distinct from their mutable attributes. Entities must never be compared purely by structural value equality.
* [ ] Value Object Immutability: Verify Value Objects are completely immutable. Mutations must return new instances. Equality must depend strictly on structural value properties.
* [ ] Aggregate Root Transactional Boundaries: Ensure external callers modify child entities exclusively through methods on the Aggregate Root, preserving aggregate invariants in a single atomic transaction.

### 3. Ingress Parsing Membrane ("Parse, Don't Validate")

* [ ] Boundary Ingress Parsing: External payloads (HTTP requests, message broker payloads, configuration inputs, IPC data) must be parsed into strongly typed domain models immediately upon entry.
* [ ] Smart Constructors: Types enforcing domain invariants must restrict instantiation to validated factory functions or smart constructors that return explicit error types or throw at the boundary.
* [ ] Zero Internal Property Sniffing: Core domain services, use cases, and entities must reject untyped raw records (`Record<string, any>`, loose dicts). Internal pipelines must never execute defensive fallbacks, null sniffing, or speculative defaults.

### 4. DTO and Domain Model Demarcation

* [ ] Pure DTO Separation: Verify Data Transfer Objects (DTOs) remain simple, serializable data bags without business logic. Domain Entities and internal repository models must never leak into public transport APIs.
* [ ] Unidirectional Conversion: Ensure application services or adapters explicitly map external DTOs into domain models at ingress, and map domain models to egress DTOs at egress.

## Concrete Anti-Patterns

### Anti-Pattern 1: Primitive Obsession with Unvalidated Scalars

```typescript
// BAD: Passing unvalidated raw strings and numbers across domain services.
// Allows mixing up account IDs and customer IDs, and permits negative monetary amounts.
class PaymentService {
processTransfer(sourceAccountId: string, targetAccountId: string, amount: number) {
if (amount <= 0) throw new Error("Invalid amount"); // Validation scattered in domain logic
// Accidental inversion of source and target is undetected by type checker
db.debit(sourceAccountId, amount);
db.credit(targetAccountId, amount);
}
}

// GOOD: Domain Value Objects enforce validation on creation and prevent identifier confusion.
type AccountId = string & { readonly __brand: unique symbol };
const asAccountId = (id: string): AccountId => {
if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid AccountId format");
return id as AccountId;
};

class Money {
private constructor(public readonly cents: bigint, public readonly currency: string) {}
static create(cents: bigint, currency: string): Money {
if (cents <= 0n) throw new Error("Amount must be positive");
return new Money(cents, currency);
}
}

class PaymentService {
processTransfer(source: AccountId, target: AccountId, amount: Money) {
db.debit(source, amount.cents);
db.credit(target, amount.cents);
}
}

```
### Anti-Pattern 2: Shotgun Validation versus Boundary Parsing

```typescript
// BAD: Shotgun validation scattered deep inside internal business logic.
// Downstream functions re-check validity and guess missing data via fallback sniffing.
function processOrder(rawInput: any) {
  // Deep helper performing property sniffing
  const email = rawInput.email ?? rawInput.contact?.email ?? "no-reply@domain.com";
  const items = Array.isArray(rawInput.items) ? rawInput.items : [];
  if (items.length === 0) throw new Error("Order cannot be empty");
  
  return submitOrder(email, items);
}

// GOOD: Parse untrusted input into a guaranteed valid domain model at boundary.
import { z } from "zod";

const OrderIngressSchema = z.object({
  email: z.string().email(),
  items: z.array(z.object({ sku: z.string(), quantity: z.number().int().positive() })).nonempty(),
});

type ValidOrder = z.infer<typeof OrderIngressSchema>;

function parseOrderIngress(rawInput: unknown): ValidOrder {
  return OrderIngressSchema.parse(rawInput); // Throws structured error at boundary
}

function processOrder(order: ValidOrder) {
  // Domain logic assumes 100% valid state: no null checks, no fallback defaults
  return submitOrder(order.email, order.items);
}
```

### Anti-Pattern 3: Anemic Entities Leaking Invariants Across Seams

```typescript
// BAD: Entity exposes mutable internal state; callers manipulate children directly.
// Order aggregate cannot enforce its invariant that total must match item sums.
class Order {
  public id: string;
  public items: OrderItem[] = []; // Direct external mutation leaks aggregate invariant
  public totalCents: number = 0;
}

// Client code:
const order = new Order();
order.items.push(newItem); // Total is not updated, state is now corrupted!

// GOOD: Aggregate Root encapsulates state; mutations execute through invariant-protecting methods.
class Order {
  private constructor(
    public readonly id: OrderId,
    private readonly _items: OrderItem[],
    private _totalCents: bigint
  ) {}

  static create(id: OrderId): Order {
    return new Order(id, [], 0n);
  }

  get items(): readonly OrderItem[] {
    return this._items;
  }

  get totalCents(): bigint {
    return this._totalCents;
  }

  addItem(item: OrderItem): void {
    this._items.push(item);
    this._totalCents += item.priceCents;
  }
}
```

## Failure Modes & Mitigations

* Silent Identifier Transposition: Passing raw strings for different domain IDs causes data corruption without compiler warnings. Mitigate by using branded types or dedicated Value Object classes.
* Shotgun Parsing Vulnerability: Mixing parsing with business processing leads to inconsistent edge-case handling. Mitigate by constructing an ingress parsing membrane that guarantees valid types before domain execution.
* Aggregate Desynchronization: Exposing child collections enables callers to bypass business rules. Mitigate by returning immutable views (`readonly`) and encapsulating state mutations inside Aggregate Root methods.
* DTO Leakage: Exposing persistence or domain entities directly through public APIs causes breaking changes when database schemas evolve. Mitigate by mandating strict DTO mapping layers.

```
---
