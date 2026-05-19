# SOP 06: ARCHITECTURAL THINKING & COMPONENT BOUNDARY ENFORCEMENT

This SOP instructs you on how to discover, respect, and extend the architectural patterns of a large codebase **before** writing any code. The goal is to prevent architectural drift, component boundary violations, and structural debt that silently accumulate when agents implement features without understanding the existing design.

---

## 🧭 1. Architecture-First Principle

Before implementing any feature, refactor, or bug fix that touches **more than one file**, you **MUST** perform Architecture Discovery:

### Discovery Checklist:
1. **Identify the Component Model:**
   * How are UI components or service modules organized? Do they own their internal resources (DOM, state, config), or do they receive them externally?
   * Look for patterns: Container-based components, flat ref distribution, dependency injection, event bus, pub/sub, etc.
2. **Identify the Dependency Direction:**
   * Which modules depend on which? Dependencies should flow **inward** (parent → child, container → internal), never **outward** (child → sibling, internal → unrelated module).
   * Run a quick `grep_search` for `require(` or `import` statements to map the dependency graph of the area you're modifying.
3. **Identify Shared vs. Owned Resources:**
   * Which resources (refs, state, config, DOM elements) are **shared** across modules vs. **owned** by a single component?
   * Shared resources require coordination when modified. Owned resources can be changed freely within their component boundary.
4. **Read the Project-Specific Skill File:**
   * Check for architecture documentation in `local/` (e.g., `yumeshelf-code-modularization.md`). These files contain the concrete implementation of universal principles for the specific project.

> [!IMPORTANT]
> **Never invent a new architectural pattern** when an established one exists in the codebase. If the project uses Container-based components, your new feature must also use Container-based components. Pattern consistency is more valuable than local optimization.

---

## 🧱 2. Component Encapsulation Rules

These rules apply universally across frontend, backend, and full-stack architectures:

### 2.1 The Ownership Principle
* A component **owns** its internal resources. It creates them, queries them, and destroys them.
* External code should interact with a component through its **public interface** (exported functions, event handlers, API endpoints), never by reaching into its internals.

```
// ✅ Correct: Component owns its internal DOM
function createSearchComponent(container) {
    const input = container.querySelector('.search-input');  // Internal query
    return { getValue: () => input.value };                   // Public interface
}

// ❌ Wrong: External code reaches into component internals
const searchInput = document.querySelector('.search-input');  // Owned by Search
searchComponent.doSomethingWith(searchInput);                 // Boundary violation
```

### 2.2 The Shared Resource Rule
* A resource should be **shared** only when **multiple independent components** genuinely need direct access to it.
* Before exposing a resource as shared, ask: *"Can this be encapsulated inside one component and accessed through its public API instead?"*
* When a resource IS shared, it must be declared explicitly in a centralized location (e.g., a shared refs object, a global state store, or a service registry) — never passed ad-hoc.

### 2.3 The Dependency Direction Rule
* Dependencies flow **downward**: orchestrators → controllers → utilities.
* **Never** create upward dependencies (a utility importing from a controller) or lateral dependencies (one controller importing from a sibling controller).
* If two sibling components need to communicate, use the orchestration layer above them (event bus, parent coordinator, shared state).

---

## 🔍 3. Pre-Implementation Conformity Check

Before writing code for any new feature or component, answer these questions:

| # | Question | If NO |
|---|---|---|
| 1 | Does the existing codebase have an established pattern for this type of component? | Research further or ask the user before inventing a new pattern |
| 2 | Does my implementation follow the same pattern as existing similar components? | Refactor to match, or justify the deviation explicitly |
| 3 | Are all internal resources queried/created within the component boundary? | Move the queries inside the component |
| 4 | Does the dependency direction flow downward only? | Restructure to eliminate upward/lateral dependencies |
| 5 | Are shared resources declared in the centralized location, not passed ad-hoc? | Register them in the appropriate shared location |

---

## ⚠️ 4. Common Anti-Patterns

### 4.1 Flat Reference Explosion
**Symptom:** A central "refs" or "registry" object grows to 50+ entries, with each new feature adding more.
**Problem:** Creates invisible coupling — every consumer depends on the central object's shape. Renaming or removing any entry risks breaking unknown consumers.
**Solution:** Encapsulate references inside component boundaries. The central registry should only contain genuinely shared resources and component root containers.

### 4.2 God Module / God Orchestrator
**Symptom:** One file (e.g., `app.js`, `main-controller.js`) grows to 500+ lines, wiring together every component with explicit knowledge of their internals.
**Problem:** Adding any feature requires modifying this file. It becomes a merge conflict magnet and a cognitive bottleneck.
**Solution:** Components should be self-contained. The orchestrator only needs to know each component's public interface and root container, not its internal structure.

### 4.3 Cross-Cutting Dependency Creep
**Symptom:** A utility or helper module gradually imports from controllers, state managers, AND UI components.
**Problem:** Creates circular or tangled dependency graphs that make refactoring extremely risky.
**Solution:** Utilities should depend on nothing (pure functions) or only on shared contracts/types. If a utility needs component-specific behavior, use dependency injection.

---

## 📋 5. Post-Structural-Change Audit

After any change that affects component boundaries, module interfaces, or shared resources:

1. **Dependency Audit:** `grep_search` for all imports/requires of the modified module. Verify no consumer is broken.
2. **Shared Resource Audit:** If you removed or renamed a shared resource, verify **every consumer** has been updated. This is the #1 source of post-refactor crashes.
3. **Boot Pipeline Test:** If the application has a boot/initialization sequence, verify it completes without errors after your changes. Boot pipelines are where boundary violations surface first.
4. **Interface Contract Check:** If you changed a module's exported API (added/removed/renamed exports), verify all callers match the new contract.

> [!CAUTION]
> **The Shared Ref Leak:** When transitioning resources from shared to component-owned, always check if any external module still references the old shared location. This is the most dangerous post-refactor bug because it compiles cleanly but crashes at runtime when the missing reference is accessed.
