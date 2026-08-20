---
name: codebase-design
description: Use when designing module interfaces, placing architectural seams, or creating deep modules.
---

# Codebase Design

Design **deep modules**: maximize behavior behind a small interface, placed at a clean seam, testable through that interface.

## Directives

1. **Strict Terminology**: MUST use glossary terms (*module, interface, depth, seam, adapter, leverage, locality*); NEVER substitute *component, service, API, boundary*.
2. **Depth as Leverage**: Depth is measured by leverage at the interface (behavior per unit of learned surface), NOT line-of-code ratios.
3. **The Deletion Test**: If deleting a module makes complexity vanish, it was a shallow pass-through; if complexity reappears across callers, it was earning its keep.
4. **Interface as Test Surface**: Callers and tests MUST cross the same seam. If tests must reach past the interface, the module is incorrectly shaped.
5. **Seam Justification**: 1 adapter = hypothetical seam (unnecessary indirection); 2+ adapters = real seam (e.g., production + test stand-in).

---

## Glossary

- **Module**: Anything with an interface and an implementation (function, class, package, slice). *Avoid: unit, component, service.*
- **Interface**: Everything a caller must know to use the module correctly (types, invariants, ordering, errors, performance). *Avoid: API, signature.*
- **Implementation**: Internal body of code. Distinct from Adapter (role at seam).
- **Depth**: Leverage at interface. Deep = small interface + large behavior; Shallow = large interface + thin pass-through.
- **Seam**: Location where an interface lives and behavior can be altered without editing callers. *Avoid: boundary.*
- **Adapter**: Concrete implementation satisfying an interface at a seam.
- **Leverage**: Capability gain per unit of interface learned (1 implementation serves N callers and M tests).
- **Locality**: Concentration of change, bugs, and verification in one place.

---

## Deep vs. Shallow Modules

```
┌─────────────────────┐       ┌─────────────────────────────────┐
│   Small Interface   │       │       Large Interface           │
├─────────────────────┤       ├─────────────────────────────────┤
│                     │       │  Thin Implementation (Avoid)    │
│  Deep Implementation│       └─────────────────────────────────┘
│                     │
└─────────────────────┘
```

When designing an interface:
- Reduce the number of entry points.
- Simplify parameters and config requirements.
- Absorb complexity behind the seam.

---

## Designing for Testability

1. **Accept dependencies, don't instantiate them:**
   ```typescript
   // Testable: Injected dependency
   function processOrder(order: Order, gateway: PaymentGateway): Receipt {}

   // Hard to test: Hardcoded instantiation
   function processOrder(order: Order): Receipt {
     const gateway = new StripeGateway();
   }
   ```

2. **Return values, avoid hidden side-effects:**
   ```typescript
   // Testable: Pure calculation
   function calculateDiscount(cart: Cart): Discount {}

   // Hard to test: In-place mutation
   function applyDiscount(cart: Cart): void {
     cart.total -= discount;
   }
   ```

3. **Minimal surface area**: Fewer methods and simpler parameters require less test setup.

---

## Subdoc References

- **Deepening & Dependency Categories**: see [DEEPENING.md](DEEPENING.md) (In-process, Local-substitutable, Ports & Adapters, Mock).
- **Parallel Sub-Agent Interface Exploration**: see [DESIGN-IT-TWICE.md](DESIGN-IT-TWICE.md) (Design It Twice pattern).
