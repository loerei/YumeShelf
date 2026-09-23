# Preparatory Refactoring and Codebase Readiness

## Domain Audit Checklist (Kent Beck's "Make The Change Easy" Framework)

### 1. Structural Concepts
- **Module**: Logical unit exposing an interface and encapsulating internal complexity.
- **Interface**: Public boundary through which callers interact with a module.
- **Depth**: Ratio of internal module complexity to interface simplicity (deep vs shallow).
- **Leverage**: Functional capability encapsulated behind a clean interface method.
- **Locality**: Degree to which code that changes together resides physically together (cohesion).
- **Seam**: Place where behavior can be altered or injected without modifying caller implementations directly.
- **Adapter**: Component translating external interfaces into local module interfaces.

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
   - *Deletion Test*: Future removal of the feature or temporary toggle can be accomplished cleanly by deleting a self-contained module or strategy without auditing conditional flags across callers.
   - *Tidy First Toggle Sequencing ($S \to B$)*: When introducing feature flags, Step $S$ extracts the strategy interface/seam; Step $B$ introduces the toggled behavior cleanly behind the seam.
   - *Pass-Through Overhead*: Eliminates shallow pass-through wrapper methods that forward parameters without adding value.

### 3. Target Codebase State Classification & Gate
- **Good State (Direct Implementation Clearance)**:
  - If existing interfaces are deep, structural seams exist, and test surface is clean $\rightarrow$ Clear DA for direct feature implementation.
- **Bad State (Preparatory Refactoring Required)**:
  - If the target codebase is tangled, shallow, or missing seams $\rightarrow$ Reject DA (`STATUS: REVISIONS NEEDED`) and require:
    1. **4-Axis Readiness Scorecard**: Highlighting friction diagnoses across *Maintainability*, *Extensibility*, *Debuggability*, *Updatability*.
    2. **Tidying Selection**: Choosing pre-approved structural patterns ($S$) from the 15 Tidying Patterns Taxonomy.
    3. **Architectural Transition Mapping**: Current Tangled Structure $\rightarrow$ Proposed Paved Structure.
    4. **Tidy First Execution Order ($S \to B$)**: Structuring implementation into explicit prerequisite structural steps ($S_1 \to S_2$) followed by behavioral change ($B$).
    5. **Storage Readiness Invariant**: If a proposed feature modifies persistent data schemas, but the target codebase lacks a centralized schema version runner, classify the state as Bad State. Mandate establishing a minimal isolated schema version runner as Step $S$ directly in the DA before implementing feature behavior $B$.
    6. **Configuration & Environment Readiness Invariant**: If a proposed feature modifies application configuration schemas, environment variable bindings, or runtime dependency interfaces, but the target codebase lacks a centralized, strictly validated configuration boot boundary (or relies on ad-hoc runtime branching between legacy and new formats), classify the state as Bad State. Mandate establishing a canonical configuration schema parser and migrating legacy configuration files, environment definitions, and test fixtures as a prerequisite structural step ($S$) directly in the DA before implementing feature behavior ($B$).

### 4. Preparatory Structural Patterns (15 Tidying Patterns)
Preparatory structural changes ($S$) must use standard refactoring patterns before introducing new behavior ($B$):

| Category | Pattern | Execution Action |
| :--- | :--- | :--- |
| **Control Flow** | **Guard Clauses** | Replace nested conditionals with early return statements. |
| | **Dead Code** | Delete unused functions, unreferenced parameters, and unreachable branches. |
| | **Normalize Symmetries** | Standardize inconsistent implementations of identical logical operations. |
| **Structure & Order** | **Reading Order** | Reorder methods in source files so execution flows logically top-to-bottom. |
| | **Cohesion Order** | Group routines and data structures that change together into adjacent positions. |
| | **Move Declaration/Init** | Relocate variable declarations adjacent to their first usage. |
| | **Chunk Statements** | Group cohesive statements into distinct blocks separated by blank lines. |
| **Abstraction & Naming** | **Explaining Variables** | Extract complex sub-expressions into well-named local constants or variables. |
| | **Explaining Constants** | Replace magic numbers and inline strings with named constants. |
| | **Explicit Parameters** | Pass explicit arguments to functions instead of wide context objects. |
| | **Extract Helper** | Pull isolated sub-tasks into dedicated helper routines. |
| **Interface Realignment** | **New Interface, Old Impl** | Introduce the target interface first, delegating execution to legacy code. |
| | **One Pile** | Inline overly fragmented shallow abstractions into a single unit before re-splitting. |
| **Documentation** | **Explaining Comments** | Add comments explaining the reason for non-obvious code mechanics. |
| | **Delete Redundant Comments** | Remove comments that merely restate what the code expresses. |

### 5. Transition Mapping Requirements
When evaluating refactoring requirements, verify that the DA maps:
- **Module Structure**: Current shallow/leaky state -> proposed deep module with clean interface.
- **Dependency Path**: Current direct coupling -> decoupled path isolated via seams or adapters.
- **Code Locations**: Current scattered logic -> concentrated locality inside dedicated modules.

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
