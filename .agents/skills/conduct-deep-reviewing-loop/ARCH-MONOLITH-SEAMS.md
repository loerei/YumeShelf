# Architectural Subdocument: Modular Monolith Seams & Domain Boundaries

## Domain Audit Checklist

### 1. Domain Boundary Isolation
- [ ] Package Visibility: Ensure domain entities and internal repositories maintain module-private visibility (e.g., Go internal packages, Java package-private/modules, Rust crate privacy).
- [ ] Direct Cross-Domain Imports: Reject imports that reach directly into foreign domain data access layers or private internal structs.

### 2. Interface Contract Design
- [ ] API Abstraction: Verify that inter-module communication occurs exclusively through explicit public Interfaces or Application Services using pure Data Transfer Objects (DTOs).
- [ ] Shared Mutable State: Reject shared in-memory mutable data structures between distinct architectural modules.

### 3. Dependency DAG Topology
- [ ] Circular Dependency Analysis: Verify that module dependency graphs are strictly acyclic. Reject circular package references at both compile-time and structural levels.
- [ ] Inversion of Control: Confirm high-level policy modules depend on abstractions (interfaces), not low-level concrete infrastructure modules.

## Concrete Anti-Patterns

### Anti-Pattern 1: Cross-Domain Database Model Entanglement

```python
# BAD: Billing module directly querying User ORM model from User module.
# Creates deep physical coupling between database tables and domain logic.
from src.user.models import UserModel

class BillingService:
    def generate_invoice(self, user_id: str):
        user = UserModel.objects.get(id=user_id) # DIRECT CROSS-DOMAIN DATA ACCESS
        ...

# GOOD: Billing module calling explicit public application interface returning DTO.
from src.user.public import UserFacade, UserDTO

class BillingService:
    def __init__(self, user_facade: UserFacade):
        self.user_facade = user_facade

    def generate_invoice(self, user_id: str):
        user: UserDTO = self.user_facade.get_user_summary(user_id)
        ...
```

### Anti-Pattern 2: Shared Persistence Entities Across Seams

```java
// BAD: Domain A entity passed directly into Domain B API parameter.
public class OrderService {
    public void processPayment(PaymentModule paymentModule, OrderEntity order) { // OrderEntity leaks internals
        paymentModule.charge(order.getCustomer().getCardToken(), order.getTotal());
    }
}

// GOOD: Pass primitive scalar identifiers or dedicated immutable DTOs.
public class OrderService {
    public void processPayment(PaymentModule paymentModule, OrderEntity order) {
        PaymentRequest request = new PaymentRequest(order.getId(), order.getCardToken(), order.getTotal());
        paymentModule.charge(request);
    }
}
```

## Failure Modes & Mitigations

- Cascading Module Refactoring: Enforce architectural fitness functions (e.g., ArchUnit, Go-check) in CI to block non-conforming cross-module imports.
- Implicit State Corruption: Wrap module boundaries in immutability guarantees or deep-copy DTO transformations.
