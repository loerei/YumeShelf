---
name: make-the-change-easy
description: Use when assessing codebase readiness before modifying code or proposing prerequisite refactoring.
---

# Make The Change Easy

Assess target codebase readiness before implementing a feature or bugfix to determine whether the landing zone absorbs the change or requires preparatory refactoring (Tidying). For the domain glossary, 15 Tidying patterns, decision gates, and report template, see [REFERENCE.md](REFERENCE.md); for dependency categories and deepening seam rules, see [DEEPENING.md](DEEPENING.md).

## Directives

1. **Architecture Vocabulary**: MUST use exact domain terms (*module, interface, depth, seam, adapter, leverage, locality*) defined in [REFERENCE.md](REFERENCE.md); NEVER substitute *component, service, API, boundary*.
2. **Mental Model First**: MUST construct an ideal landing zone representation (minimal ripple effects, clean seam) before reading implementation code.
3. **4-Axis Audit**: MUST evaluate *Maintainability (Locality)*, *Extensibility (Seams & Adapters)*, *Debuggability (Test Surface)*, and *Updatability (Shallowness & Deletion Test)* per [REFERENCE.md](REFERENCE.md).
4. **Clickable File Links**: MUST format file references with line ranges (`[file.ts#L10-L20](file:///path/to/file.ts#L10-L20)`).
5. **Presentation Boundary**: MUST terminate execution immediately after presenting the verdict or report. NEVER modify source code within this skill.

## Workflow

1. **Formulate Ideal Mental Model**: Before inspecting target files, determine where the seam should reside for zero caller ripple and how a deep module interface should express the change.
2. **Execute 4-Axis Audit**: Read target files, trace callers and seams against [REFERENCE.md](REFERENCE.md), classify dependencies per [DEEPENING.md](DEEPENING.md), and run the Deletion Test across all 4 axes with file/line evidence.
3. **Evaluate Tidying Gate**: Cross-reference friction points with Beck's Decision Rules in [REFERENCE.md](REFERENCE.md) to select Branch A (low friction, deep interfaces -> **Good State**) or Branch B (high friction -> classify structural changes `S` -> **Bad State**).
4. **Present Verdict & STOP**:
   - **Branch A (`Good State - Landing Zone Ready`)**: State how the existing seam absorbs behavioral change `B`, note existing test coverage across the seam, and STOP execution.
   - **Branch B (`Bad State`)**: Render the Change Readiness Report using the template in [REFERENCE.md](REFERENCE.md) with 4 scored rows, clickable links, selected Tidyings, Current vs Proposed mapping, and 3-step `S -> B` plan; STOP and await user review.
