# Feature Flag Governance & Operational Degradation

Audit criteria for feature toggles, experiment branches, and operational kill-switches covering lifecycle limits, deletion testing, and architectural isolation.

## Domain Audit Checklist

- [ ] **Toggle Categorization**: Is every feature flag classified as Ephemeral (Release/Experiment) or Permanent (Ops/Kill-Switch/Permission)?
- [ ] **Lifecycle Expiration (TTL $\le$ 30d)**: Do all ephemeral release toggles declare an explicit owner and an expiration date within 30 days of creation?
- [ ] **Mandatory Deletion Acceptance Criterion**: Does the DA include an explicit Acceptance Criterion and verification test for removing the flag and retired code paths?
- [ ] **Branch by Abstraction**: Are complex or long-lived flags implemented via polymorphic strategy interfaces rather than nested `if/else` ladders?
- [ ] **Kill-Switch Isolation**: Are permanent kill-switches confined to high-risk external integrations, batch runners, or circuit breakers?
- [ ] **Consistent Context Propagation**: In distributed service chains, is flag evaluation context (user segment, tenant ID) propagated via standard baggage headers?

## Concrete Anti-Patterns

### Anti-Pattern 1: Flag Lacking Expiration and Deletion Plan

```markdown
<!-- BAD: Undated release flag with no retirement plan or owner -->
### Feature Flag: `enable_v2_recommendations`
Flag controls the rollout of the new recommendation algorithm.

<!-- GOOD: Explicit taxonomy, owner, expiration, and deletion test criterion -->
### Feature Flag: `enable_v2_recommendations`
- **Archetype**: Ephemeral Release Toggle
- **Owner**: Data-Team (@recs-lead)
- **Expiration Date**: 2026-04-15 (TTL: 28 days)
- **Default State**: False (Enabled per tenant segment)
- **Deletion Acceptance Criterion**: Ticket #502 scheduled for Sprint 12 MUST remove this toggle router, delete the LegacyRecommendationEngine class, and enforce NewRecommendationEngine as default.
```

### Anti-Pattern 2: Conditional Hell vs. Branch by Abstraction

```typescript
// BAD: Deeply nested if/else flags scattered through business core.
class OrderService {
  process(order: Order) {
    if (flags.isEnabled("use-new-tax-engine")) {
      tax = newTaxCalc(order);
    } else {
      tax = oldTaxCalc(order);
    }
    // ...
  }
}

// GOOD: Injects strategy interface via toggle router outside domain core.
interface TaxCalculator {
  calculate(order: Order): TaxAmount;
}

class OrderService {
  constructor(private taxCalc: TaxCalculator) {}
  process(order: Order) {
    const tax = this.taxCalc.calculate(order);
    // ...
  }
}
```

## Failure Modes & Mitigations

| Failure Mode | Root Cause | Mitigation |
| --- | --- | --- |
| **Toggle Debt Accumulation** | Ephemeral flags remain in codebase indefinitely after full feature rollout. | Require hard expiration date (TTL ≤ 30d) and an explicit Deletion Acceptance Criterion. |
| **Rotten Kill-Switch** | Permanent ops switch is never exercised, failing unexpectedly during an active outage. | Require automated integration tests verifying both enabled and disabled states for ops toggles. |
| **Split-Brain Execution** | Mid-request flag state mutation causes Service A to evaluate True and Service B to evaluate False. | Propagate evaluation decisions or invariant context via W3C baggage across service boundaries. |

```
---
