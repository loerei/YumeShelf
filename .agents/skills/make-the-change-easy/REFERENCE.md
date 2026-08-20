# Architectural Reference & Knowledge Base: Make The Change Easy

Reference guide for evaluating codebase readiness, applying Kent Beck's Tidying patterns, and formatting readiness assessments.

---

## 1. Domain Architectural Vocabulary

Strict vocabulary constraints for codebase evaluation:

| Term | Domain Definition | Forbidden Alternatives |
| :--- | :--- | :--- |
| **Module** | A logical unit of code exposing an interface and hiding implementation complexity. | Component, Service |
| **Interface** | The public boundary through which callers interact with a module. | API, Endpoint, Signature |
| **Depth** | The ratio of module implementation complexity relative to interface simplicity (Deep vs. Shallow). | Complexity ratio |
| **Seam** | A place where behavior can be altered or injected without editing target code directly. | Boundary, Hook |
| **Adapter** | A wrapper translating external dynamic interfaces into local deep module interfaces. | Bridge, Connector |
| **Leverage** | The amount of underlying functionality encapsulated behind a single simple interface method. | Abstraction power |
| **Locality** | The degree to which code that changes together resides physically together (Cohesion). | Proximity, Grouping |

---

## 2. 4-Axis Readiness Audit Criteria

### Axis 1: Maintainability (Locality & Cohesion)
- **Deep Module Test**: Does the target module conceal internal state and business rules behind a simple interface, or does it force callers to orchestrate steps?
- **Cohesion Order**: Is logic related to the change located in one place, or scattered across multiple files requiring wide-spectrum edits?

### Axis 2: Extensibility (Seams & Adapters)
- **Seam Identification**: Does a clear structural seam exist to inject new behavior (e.g., via dependency injection or strategy pattern)?
- **Adapter Coupling**: Is domain logic tightly bound to transport (HTTP/gRPC) or storage (SQL/NoSQL) layers rather than isolated via adapters?

### Axis 3: Debuggability (Test Surface)
- **Interface Testability**: Can the incoming behavior be verified entirely through the public module interface?
- **Mock Fragility**: Do tests bypass the seam to mock internal private methods, indicating a broken or leaky interface?

### Axis 4: Updatability (Shallowness & Deletion Test)
- **Deletion Test**: If this feature/fix is removed in the future, can it be cleanly deleted by removing a single file/module, or will it leave residual conditional flags across callers?
- **Pass-through Overhead**: Does adding the change force creation of shallow pass-through methods that simply forward parameters without adding value?

---

## 3. Kent Beck's 15 Tidying Patterns Taxonomy

Pre-approved structural changes ($S$) to execute before behavior changes ($B$):

| Pattern Category | Tidying Name | Execution Action |
| :--- | :--- | :--- |
| **Control Flow** | **Guard Clauses** | Replace nested `if-else` blocks with early return/exit statements. |
| | **Dead Code** | Delete unused functions, unreferenced parameters, and unreachable branches. |
| | **Normalize Symmetries** | Standardize inconsistent implementations of identical logical operations. |
| **Structure & Order** | **Reading Order** | Reorder methods in source files so execution flows logically top-to-bottom. |
| | **Cohesion Order** | Group routines and data structures that change together into adjacent positions. |
| | **Move Declaration/Init** | Relocate variable declarations directly adjacent to their first usage point. |
| **Abstraction & Naming** | **Explaining Variables** | Extract complex sub-expressions into well-named local constants/variables. |
| | **Explaining Constants** | Replace magic numbers and inline strings with named symbolic constants. |
| | **Explicit Parameters** | Pass explicit arguments to functions instead of passing wide context objects. |
| | **Extract Helper** | Pull isolated sub-tasks out of large functions into dedicated helper routines. |
| **Interface Realignment** | **New Interface, Old Impl** | Introduce ideal interface first, delegating call execution to legacy code. |
| | **One Pile** | Inline overly fragmented shallow abstractions into a single pile before re-splitting. |
| **Documentation** | **Explaining Comments** | Add comments explaining the *why* for non-obvious code mechanics. |
| | **Delete Redundant Comments** | Remove comments that merely restate what the code clearly expresses. |

---

## 4. Tidying Economics & Decision Gates

Evaluate when to execute structural changes using Beck's 4 Decision Rules:

| Trigger Condition | Decision Gate | Action Route |
| :--- | :---: | :--- |
| Structural change directly makes behavioral change easy or understandable. | **First** | Perform Tidying ($S$) now $\rightarrow$ Commit $\rightarrow$ Perform Behavior Change ($B$). |
| Code structure is messy, but behavioral change is urgent and area will be edited again soon. | **After** | Perform Behavior Change ($B$) now $\rightarrow$ Tidy ($S$) immediately after. |
| Structural change is large (> 1 hour), but time budget is severely constrained. | **Later** | Log Tidying task in backlog $\rightarrow$ Proceed directly with Behavior Change ($B$). |
| Code area is stable, deprecated, or will never be touched again. | **Never** | Leave code intact $\rightarrow$ Perform minimal direct change or leave untouched. |

---

## 5. Change Readiness Report Template (Bad State)

When evaluating a codebase in a **Bad State**, render the following Markdown report:

```markdown
# ⚠️ Change Readiness Assessment: Bad State (Refactor Required)

> **Target Goal:** <Requested feature or bugfix>  
> **Landing Zone:** [<file-1.ts#L10-L30>](file:///path/to/file-1.ts#L10-L30), [<file-2.ts#L45-L60>](file:///path/to/file-2.ts#L45-L60)

### 1. 4-Axis Readiness Scorecard

| Quality Axis | Status | Friction Diagnosis & Code Locations | Recommended Tidying |
| :--- | :---: | :--- | :--- |
| **1. Maintainability (Locality)** | 🔴 Bad / 🟡 Fair | [Diagnosis with clickable links e.g. [caller.ts#L20](file:///path/to/caller.ts#L20)] | [Pattern from Taxonomy] |
| **2. Extensibility (Seams & Adapters)** | 🔴 Bad / 🟡 Fair | [Diagnosis of coupling or missing seams e.g. [service.ts#L50](file:///path/to/service.ts#L50)] | [Pattern from Taxonomy] |
| **3. Debuggability (Test Surface)** | 🔴 Bad / 🟡 Fair | [Diagnosis of fragile mocks or missing interface test surface] | [Pattern from Taxonomy] |
| **4. Updatability (Shallowness)** | 🔴 Bad / 🟡 Fair | [Diagnosis from Deletion Test & pass-through wrappers] | [Pattern from Taxonomy] |

### 2. Architectural Transition Mapping

| Transition Dimension | Current Tangled Landing Zone | Proposed Paved Landing Zone |
| :--- | :--- | :--- |
| **Module Structure** | Shallow modules leaking internal state across callers. | Deep module encapsulating business rules behind clean interface. |
| **Dependency Path** | Direct tight coupling between callers and external storage/transport. | Decoupled execution path isolated via Port Adapters and Seams. |
| **Code Locations** | Scattered logic across [caller.ts#L10](file:///path/to/caller.ts#L10) and [shallow.ts#L30](file:///path/to/shallow.ts#L30). | Concentrated locality inside [deep_module.ts#L15](file:///path/to/deep_module.ts#L15). |

### 3. Execution Plan (Tidy First Order)

1. **Step 1 (Structural - $S$)**: Apply [Tidying Pattern] to [target_file.ts#L15](file:///path/to/target_file.ts#L15).
2. **Step 2 (Structural - $S$)**: Extract seam in [target_file2.ts#L40](file:///path/to/target_file2.ts#L40).
3. **Step 3 (Behavioral - $B$)**: Implement requested feature/fix into the newly paved landing zone.
```
