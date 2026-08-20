---
name: make-the-change-easy
description: Use when assessing codebase readiness before modifying code or proposing prerequisite refactoring.
---

# Make The Change Easy

Assess target codebase readiness before implementing a feature or bugfix. Determine if the landing zone naturally absorbs the change or requires prerequisite preparatory refactoring (Tidying).

## Directives

1. **Architecture Vocabulary**: MUST use exact domain terms (*module, interface, depth, seam, adapter, leverage, locality*) defined in [REFERENCE.md](REFERENCE.md); NEVER substitute *component, service, API, boundary*.
2. **Mental Model First**: MUST construct an ideal landing zone representation (minimal ripple effects, clean seam) *before* reading existing implementation code.
3. **4-Axis Audit**: MUST evaluate target code across *Maintainability (Locality)*, *Extensibility (Seams & Adapters)*, *Debuggability (Test Surface)*, and *Updatability (Shallowness & Deletion Test)* per [REFERENCE.md](REFERENCE.md).
4. **Clickable File Links**: MUST format every file reference as a clickable markdown link with line numbers: `[file.ts#L10-L20](file:///path/to/file.ts#L10-L20)`.
5. **Presentation Boundary**: MUST terminate execution immediately after presenting the final verdict or report. NEVER execute source code modifications within this skill.

---

## Workflow

### 1. Formulate Ideal Mental Model (Pre-Inspection)
Before inspecting target files, establish the ideal structural shape for the incoming change:
- Determine where the structural seam should reside to absorb the change with zero ripple effects on callers.
- Identify how a deep module interface would express this new capability naturally.
- **Completion Criterion**: Ideal module interaction and seam location clearly formulated in memory.

### 2. Inspect & Execute 4-Axis Audit
Read target files and trace execution paths against audit rules in [REFERENCE.md](REFERENCE.md):
- **Maintainability (Locality)**: Check if logic is concentrated in a deep module or scattered across callers (Cohesion Order).
- **Extensibility (Seams & Adapters)**: Identify missing seams or hardcoded external dependencies. Classify dependencies per [`DEEPENING.md`](../codebase-design/DEEPENING.md).
- **Debuggability (Test Surface)**: Verify if existing tests validate through clean interfaces or rely on brittle implementation mocks.
- **Updatability (Shallowness & Deletion Test)**: Run the *Deletion Test* — determine if adding the change directly creates pass-through wrappers or state leakage.
- **Completion Criterion**: All 4 axes evaluated with specific file/line evidence.

### 3. Evaluate Tidying Necessity & Timing Gate
Cross-reference diagnosed friction points with Kent Beck's Tidying Decision Rules in [REFERENCE.md](REFERENCE.md):
- If friction is low and existing interfaces are deep $\rightarrow$ Select **Branch A (Good State)**.
- If friction is high, classify necessary structural changes ($S$) using the Tidying Taxonomy in [REFERENCE.md](REFERENCE.md) $\rightarrow$ Select **Branch B (Bad State)**.
- **Completion Criterion**: Branch selection finalized based on economic decision gates.

### 4. Present Verdict & Terminate Execution

#### Branch A: Good State (Direct Implementation Clearance)
Output concise clearance and stop:
- **Verdict**: `Good State — Landing Zone Ready`.
- **Locality & Seam**: Explanation of how the existing interface naturally absorbs the behavioral change ($B$).
- **Test Surface**: Existing test coverage across the seam.
- **STOP execution**.

#### Branch B: Bad State (Preparatory Refactoring Required)
Render the Change Readiness Report strictly using the template in [REFERENCE.md](REFERENCE.md):
- Fill all 4 scorecard rows with clickable file links and friction diagnoses.
- Select applicable Tidyings from the taxonomy.
- Provide Current vs Proposed structural transition mapping.
- Output the 3-step execution plan ($S \rightarrow B$).
- **STOP execution** and await user review.

---

## Subdoc Reference

- **Architectural Glossary, 15 Tidying Patterns, Decision Gates & Report Template**: see [REFERENCE.md](REFERENCE.md).
