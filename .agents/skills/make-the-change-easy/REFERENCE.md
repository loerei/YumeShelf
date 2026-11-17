# Architectural Reference & Knowledge Base: Make The Change Easy

## 1. Domain Architectural Vocabulary

| Term | Domain Definition & Forbidden Alternatives |
| :--- | :--- |
| **Module** | A logical unit of code exposing an interface and hiding implementation complexity (forbidden: *Component, Service*). |
| **Interface** | The public boundary through which callers interact with a module (forbidden: *API, Endpoint, Signature*). |
| **Depth** | The ratio of module implementation complexity relative to interface simplicity, Deep vs. Shallow (forbidden: *Complexity ratio*). |
| **Seam** | A place where behavior can be altered or injected without editing target code directly (forbidden: *Boundary, Hook*). |
| **Adapter** | A wrapper translating external dynamic interfaces into local deep module interfaces (forbidden: *Bridge, Connector*). |
| **Leverage** | The amount of underlying functionality encapsulated behind a single simple interface method (forbidden: *Abstraction power*). |
| **Locality** | The degree to which code that changes together resides physically together / Cohesion (forbidden: *Proximity, Grouping*). |

## 2. 4-Axis Readiness Audit Criteria

- **Axis 1 - Maintainability (Locality & Cohesion)**: Check whether the module hides state and business rules behind a simple interface (Deep Module Test) and keeps related logic co-located rather than scattered across callers (Cohesion Order).
- **Axis 2 - Extensibility (Seams & Adapters)**: Check whether a structural seam exists for behavior injection (dependency injection, strategy pattern) and whether domain logic is decoupled from transport (HTTP/gRPC) or storage (SQL/NoSQL) via adapters.
- **Axis 3 - Debuggability (Test Surface)**: Check whether incoming behavior can be tested solely through the public interface rather than fragile mocks of internal private methods.
- **Axis 4 - Updatability (Shallowness & Deletion Test)**: Check whether future removal requires deleting only a single file/module without leftover conditional flags across callers, and whether the change avoids shallow pass-through wrappers.

## 3. Kent Beck's Tidying Patterns (Structural Changes `S` Before Behavioral `B`)

| Tidying Pattern (Category) | Execution Action |
| :--- | :--- |
| **Guard Clauses** (Control Flow) | Replace nested `if-else` blocks with early return/exit statements. |
| **Dead Code** (Control Flow) | Delete unused functions, unreferenced parameters, and unreachable branches. |
| **Normalize Symmetries** (Control Flow) | Standardize inconsistent implementations of identical logical operations. |
| **Reading Order** (Structure & Order) | Reorder methods so execution flows logically top-to-bottom. |
| **Cohesion Order** (Structure & Order) | Group routines and data structures that change together. |
| **Move Declaration/Init** (Structure & Order) | Place variable declarations adjacent to first usage. |
| **Explaining Variables** (Abstraction & Naming) | Extract complex sub-expressions into named local constants/variables. |
| **Explaining Constants** (Abstraction & Naming) | Replace magic numbers and inline strings with named symbolic constants. |
| **Explicit Parameters** (Abstraction & Naming) | Pass explicit arguments instead of wide context objects. |
| **Extract Helper** (Abstraction & Naming) | Pull isolated sub-tasks out of large functions into dedicated helpers. |
| **New Interface, Old Impl** (Interface Realignment) | Introduce ideal interface first, delegating execution to legacy code. |
| **One Pile** (Interface Realignment) | Inline overly fragmented shallow abstractions into one pile before re-splitting. |
| **Explaining Comments** (Documentation) | Add comments explaining *why* for non-obvious code mechanics. |
| **Delete Redundant Comments** (Documentation) | Remove comments that merely restate what the code already expresses. |

## 4. Tidying Economics & Decision Gates

| Trigger Condition -> Decision | Action Route |
| :--- | :--- |
| Structural change directly makes behavioral change easy or understandable -> **First** | Tidy (`S`) now -> Commit -> Behavior change (`B`). |
| Code structure is messy, but change is urgent and area will be edited again soon -> **After** | Behavior change (`B`) now -> Tidy (`S`) immediately after. |
| Structural change is large (`> 1 hour`), but time budget is constrained -> **Later** | Log Tidying task in backlog -> Proceed with Behavior change (`B`). |
| Code area is stable, deprecated, or will never be touched again -> **Never** | Leave code intact -> Apply minimal direct change or leave untouched. |

## 5. Change Readiness Report Template (Bad State)

```markdown
# Change Readiness Assessment: Bad State (Refactor Required)

> **Target Goal:** <Requested feature or bugfix>  
> **Landing Zone:** [<file-1.ts#L10-L30>](file:///path/to/file-1.ts#L10-L30), [<file-2.ts#L45-L60>](file:///path/to/file-2.ts#L45-L60)

### 1. 4-Axis Readiness Scorecard

| Quality Axis | Status | Friction Diagnosis & Code Locations | Recommended Tidying |
| :--- | :---: | :--- | :--- |
| **1. Maintainability (Locality)** | Bad / Fair | [Diagnosis with clickable links e.g. [caller.ts#L20](file:///path/to/caller.ts#L20)] | [Pattern from Taxonomy] |
| **2. Extensibility (Seams & Adapters)** | Bad / Fair | [Diagnosis of coupling or missing seams e.g. [service.ts#L50](file:///path/to/service.ts#L50)] | [Pattern from Taxonomy] |
| **3. Debuggability (Test Surface)** | Bad / Fair | [Diagnosis of fragile mocks or missing interface test surface] | [Pattern from Taxonomy] |
| **4. Updatability (Shallowness)** | Bad / Fair | [Diagnosis from Deletion Test & pass-through wrappers] | [Pattern from Taxonomy] |

### 2. Architectural Transition Mapping

| Transition Dimension | Current Tangled Landing Zone | Proposed Paved Landing Zone |
| :--- | :--- | :--- |
| **Module Structure** | Shallow modules leaking internal state across callers. | Deep module encapsulating business rules behind clean interface. |
| **Dependency Path** | Direct tight coupling between callers and external storage/transport. | Decoupled execution path isolated via Port Adapters and Seams. |
| **Code Locations** | Scattered logic across [caller.ts#L10](file:///path/to/caller.ts#L10) and [shallow.ts#L30](file:///path/to/shallow.ts#L30). | Concentrated locality inside [deep_module.ts#L15](file:///path/to/deep_module.ts#L15). |

### 3. Execution Plan (Tidy First Order)

1. **Step 1 (Structural - S)**: Apply [Tidying Pattern] to [target_file.ts#L15](file:///path/to/target_file.ts#L15).
2. **Step 2 (Structural - S)**: Extract seam in [target_file2.ts#L40](file:///path/to/target_file2.ts#L40).
3. **Step 3 (Behavioral - B)**: Implement requested feature/fix into the newly paved landing zone.
```
