# Feature Flag Governance & Operational Degradation

Audit criteria for feature toggles, experiment branches, and operational kill-switches covering lifecycle limits, deletion testing, and architectural isolation.

## Domain Audit Checklist

- [ ] **Toggle Categorization**: Is every feature flag classified as Ephemeral (`Release` / `Experiment`) or Permanent (`Ops` / `Kill-Switch` / `Permission`)?
- [ ] **Lifecycle Expiration (`TTL <= 30d post-rollout`)**: Do all ephemeral release/experiment toggles declare an explicit owner, a relative maximum lifespan (`TTL <= 30 days post-rollout`), and a concrete removal condition?
- [ ] **Mandatory Deletion Acceptance Criterion**: Does the DA include an explicit Acceptance Criterion and verification test for removing the flag and retired code paths?
- [ ] **Branch by Abstraction**: Are complex or long-lived flags implemented via polymorphic strategy interfaces rather than nested `if/else` ladders scattered in domain core?
- [ ] **Kill-Switch Isolation**: Are permanent kill-switches confined to high-risk external integrations, batch runners, or circuit breakers, with automated tests covering both enabled and disabled states?
- [ ] **Consistent Context Propagation**: In distributed service chains, is flag evaluation context (user segment, tenant ID) propagated via standard W3C baggage headers?

## Concrete Anti-Patterns

### Anti-Pattern 1: Flag Lacking Expiration and Deletion Plan

```markdown
<!-- BAD: Undated release flag with no retirement plan or owner -->
### Feature Flag: `enable_v2_recommendations`
Flag controls the rollout of the new recommendation algorithm.

<!-- GOOD: Explicit taxonomy, owner, relative post-rollout TTL, removal condition, and deletion test criterion -->
### Feature Flag: `enable_v2_recommendations`
- **Archetype**: Ephemeral Release Toggle
- **Owner**: Data-Team (`@recs-lead`)
- **Lifespan / TTL**: Max 30 days post-100% production rollout
- **Removal Condition**: 7 consecutive days at 100% traffic with error rate <= baseline
- **Default State**: False (Enabled per tenant segment)
- **Deletion Acceptance Criterion**: Follow-up cleanup MUST remove this toggle router, delete the `LegacyRecommendationEngine` class, and enforce `NewRecommendationEngine` as default.
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
  constructor(private readonly taxCalc: TaxCalculator) {}
  process(order: Order) {
    const tax = this.taxCalc.calculate(order);
    // ...
  }
}
```

## Failure Modes & Mitigations

| Failure Mode | Root Cause | Mitigation |
| :--- | :--- | :--- |
| **Toggle Debt Accumulation** | Ephemeral flags remain in codebase indefinitely after full feature rollout. | Require hard relative lifespan (`TTL <= 30d post-rollout`), removal condition, and an explicit Deletion Acceptance Criterion. |
| **Rotten Kill-Switch** | Permanent ops switch is never exercised, failing unexpectedly during an active outage. | Require automated integration tests verifying both enabled and disabled states for ops toggles. |
| **Split-Brain Execution** | Mid-request flag state mutation causes Service A to evaluate True and Service B to evaluate False. | Propagate evaluation decisions or invariant context via W3C baggage across service boundaries. |
