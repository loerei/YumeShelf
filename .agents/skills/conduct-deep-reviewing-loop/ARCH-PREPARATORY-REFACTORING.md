# Architectural Subdocument: Preparatory Refactoring & Landing Zone Readiness

## Domain Audit Checklist (Kent Beck's "Make The Change Easy" Framework)

### 1. Domain Architectural Vocabulary Constraints
Verify that the target Directive Artifact strictly adheres to precise domain terminology:

| Term | Domain Definition | Forbidden Alternatives |
| :--- | :--- | :--- |
| **Module** | A logical unit of code exposing an interface and hiding implementation complexity. | Component, Service |
| **Interface** | The public boundary through which callers interact with a module. | API, Endpoint, Signature |
| **Depth** | The ratio of module implementation complexity relative to interface simplicity (Deep vs. Shallow). | Complexity ratio |
| **Seam** | A place where behavior can be altered or injected without editing target code directly. | Boundary, Hook |
| **Adapter** | A wrapper translating external dynamic interfaces into local deep module interfaces. | Bridge, Connector |
| **Leverage** | The amount of underlying functionality encapsulated behind a single simple interface method. | Abstraction power |
| **Locality** | The degree to which code that changes together resides physically together (Cohesion). | Proximity, Grouping |

### 2. 4-Axis Codebase Readiness Audit
Audit target files and landing zones across 4 distinct quality axes:

1. **Maintainability (Locality & Cohesion)**:
   - *Deep Module Test*: Target module conceals internal state and business rules behind a simple interface; callers are not forced to orchestrate steps.
   - *Cohesion Order*: Logic related to the incoming change is concentrated in one place; shotgun-surgery caller edits are eliminated.
2. **Extensibility (Structural Seams & Adapters)**:
   - *Seam Identification*: A clean structural seam exists (dependency injection, strategy pattern) to inject new behavior without modifying stable callers.
   - *Adapter Isolation*: Domain logic is isolated from transport (HTTP/IPC/gRPC) and storage (SQL/NoSQL) layers via adapters.
3. **Debuggability (Interface Test Surface)**:
   - *Interface Testability*: Incoming behavior is testable entirely through the public module interface.
   - *Mock Fragility Elimination*: Tests do not bypass seams to mock internal private methods or internal state variables.
4. **Updatability (Shallowness & Deletion Test)**:
   - *Deletion Test*: Future removal of the feature can be accomplished cleanly by deleting a self-contained module without auditing conditional flags across callers.
   - *Pass-Through Overhead*: Eliminates shallow pass-through wrapper methods that forward parameters without adding value.

### 3. Landing Zone State Classification & Gate
- **Good State (Direct Implementation Clearance)**:
  - If existing interfaces are deep, structural seams exist, and test surface is clean $\rightarrow$ Clear DA for direct feature implementation.
- **Bad State (Preparatory Refactoring Required)**:
  - If landing zone is tangled, shallow, or missing seams $\rightarrow$ Reject DA (`STATUS: REVISIONS NEEDED`) and require:
    1. **4-Axis Readiness Scorecard**: Highlighting friction diagnoses across *Maintainability*, *Extensibility*, *Debuggability*, *Updatability*.
    2. **Tidying Selection**: Choosing pre-approved structural patterns ($S$) from the 15 Tidying Patterns Taxonomy.
    3. **Architectural Transition Mapping**: Current Tangled Landing Zone $\rightarrow$ Proposed Paved Landing Zone.
    4. **Tidy First Execution Order ($S \to B$)**: Structuring implementation into explicit prerequisite structural steps ($S_1 \to S_2$) followed by behavioral change ($B$).

### 4. Kent Beck's 15 Tidying Patterns Taxonomy
Verify that preparatory structural changes ($S$) employ pre-approved tidying patterns before behavior changes ($B$):

| Pattern Category | Tidying Name | Execution Action |
| :--- | :--- | :--- |
| **Control Flow** | **Guard Clauses** | Replace nested `if-else` blocks with early return/exit statements. |
| | **Dead Code** | Delete unused functions, unreferenced parameters, and unreachable branches. |
| | **Normalize Symmetries** | Standardize inconsistent implementations of identical logical operations. |
| **Structure & Order** | **Reading Order** | Reorder methods in source files so execution flows logically top-to-bottom. |
| | **Cohesion Order** | Group routines and data structures that change together into adjacent positions. |
| | **Move Declaration/Init** | Relocate variable declarations directly adjacent to their first usage point. |
| | **Chunk Statements** | Group cohesive lines of code into distinct chunks separated by blank lines to clarify logical sub-steps. |
| **Abstraction & Naming** | **Explaining Variables** | Extract complex sub-expressions into well-named local constants/variables. |
| | **Explaining Constants** | Replace magic numbers and inline strings with named symbolic constants. |
| | **Explicit Parameters** | Pass explicit arguments to functions instead of passing wide context objects. |
| | **Extract Helper** | Pull isolated sub-tasks out of large functions into dedicated helper routines. |
| **Interface Realignment** | **New Interface, Old Impl** | Introduce ideal interface first, delegating call execution to legacy code. |
| | **One Pile** | Inline overly fragmented shallow abstractions into a single pile before re-splitting. |
| **Documentation** | **Explaining Comments** | Add comments explaining the *why* for non-obvious code mechanics. |
| | **Delete Redundant Comments** | Remove comments that merely restate what the code clearly expresses. |

### 5. Architectural Transition Mapping Requirements
When evaluating a Bad State codebase, verify that the DA provides an Architectural Transition Mapping covering 3 dimensions:

| Transition Dimension | Current Tangled Landing Zone | Proposed Paved Landing Zone |
| :--- | :--- | :--- |
| **Module Structure** | Shallow modules leaking internal state across callers. | Deep module encapsulating business rules behind clean interface. |
| **Dependency Path** | Direct tight coupling between callers and external storage/transport. | Decoupled execution path isolated via Port Adapters and Seams. |
| **Code Locations** | Scattered logic across disparate files and callers. | Concentrated locality inside dedicated deep module. |

## Concrete Anti-Patterns

### Anti-Pattern 1: Bolting Features onto Tangled Legacy Modules

```typescript
// BAD: Adding new pricing tier directly into a 400-line legacy function with nested conditionals.
function calculateTotal(order: Order): number {
  // ... 200 lines of legacy code ...
  if (order.isSpecialTier) {
    // Deeply nested feature code intertwined with legacy state mutations
    if (order.country === 'JP' && order.items.length > 5) {
      order.discount = order.subtotal * 0.15;
    }
  }
  // ... 200 lines of legacy code ...
}

// GOOD: Preparatory Tidying (S) creates Seam/Strategy first, then implements Feature (B).
// Step 1 (Tidying S): Extract PricingStrategy interface and migrate legacy calculation.
interface PricingStrategy {
  applyDiscounts(order: Order): number;
}

// Step 2 (Behavior B): Add new SpecialTierStrategy cleanly through the seam without touching legacy engine.
class JapanSpecialTierStrategy implements PricingStrategy {
  applyDiscounts(order: Order): number {
    return order.items.length > 5 ? order.subtotal * 0.15 : 0;
  }
}
```

## Failure Modes & Mitigations

- **Progressive Codebase Rot**: Enforce `STATUS: REVISIONS NEEDED` when a plan proposes modifying high-cyclomatic-complexity files without a prerequisite Tidying ($S$) step.
- **Brittle Test Mocking**: Reject plans whose test strategy mocks private class internals; require introducing a public interface seam first.
