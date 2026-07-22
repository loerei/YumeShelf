# Sonar Remediation Reference & Rule Cookbook

Detailed patterns, decision rules, preemptive inspection checklists, and concrete **Before / After** code examples for remediating SonarQube and SonarCloud rules across tech stacks.

---

## 1. Preemptive Code Inspection Checklist

Check modified files for common Sonar violations before running remote analyses:

### JS/TS / Frontend Stack
- **Nested Ternaries**: Replace with helper functions or dedicated conditional blocks.
- **Avoid Negated Conditions**: Convert `if (!condition)` to standard positive conditions where natural.
- **Readonly Props**: Mark React component props interfaces as `Readonly<Props>`.
- **Promise Handling**: Ensure floating promises are handled with `.catch()` instead of prefixed with `void`.

### General / Cross-Language Stack
- **Unused Imports & Variables**: Remove unused imports or dead assignments that do not hold domain state.
- **Long Functions / Complex Logic**: Do NOT split functions solely for complexity metrics; use `/improve-codebase-architecture` for structural design.

---

## 2. Contract-Aware Dead Code & Unused Assignments (`S1854`, `S1481`)

### Rule Policy
When Sonar flags a variable as "unused" or "dead store" near a return statement or object literal, **NEVER** alter returned object property references or API state properties just to consume the variable.

### Concrete Example (Domain Contract Preservation)

**❌ INCORRECT (Breaks domain contracts and state properties)**:
```typescript
// SONAR WARNS: "primaryGame" is assigned but never used.
// BAD FIX: Changing returned property to consume primaryGame variable!
const primaryGame = logicalGame.primaryInstance ? ... : choosePrimaryGame(...);

return {
    favorite: groupFavorite,
    // BAD! Overwrote top-level Domain Object (logicalGame) with Child Instance (primaryGame).
    // Result: logicalGame.favorite is lost, breaking UI Favorite button & Drag-and-Drop!
    primaryGame: primaryGame, 
};
```

**✅ CORRECT (Preserves API/UI contracts)**:
```typescript
// GOOD FIX: Assign internal property directly on logicalGame if missing, then return logicalGame untouched.
if (!logicalGame.primaryInstance) {
    logicalGame.primaryInstance = choosePrimaryGame(orderedGames, sortedGames);
}

return {
    favorite: groupFavorite,
    games: orderedGames,
    primaryGame: logicalGame, // Top-level domain contract preserved!
};
```

---

## 3. Unused Functions & Dynamic Reference Check (`S1172`, `S1481`, `S1854`)

Before deleting any unused function, export, or variable:
1. **MUST run Impact Analysis first**: Use `jcodemunch:find_references` or `gitnexus_impact` to trace callers.
2. **Check for dynamic string references**: Verify if the symbol matches any string literals or dynamic IPC/service event handlers (e.g. inside `ipcMain.handle`, `ipcRenderer.invoke`, or REST route definitions).
3. **Safe Flagging**: If dynamic or exported externally, **MUST search for the issue key** in SonarQube/SonarCloud using `search_sonar_issues_in_projects` with `issueStatuses: ["OPEN"]` first, then call `change_sonar_issue_status` to flag status as `"accept"` or `"falsepositive"`.

---

## 4. Standard Code Smells & Refactoring Patterns (JS/TS Specific)

### Optional Chaining (`S6582`)
```typescript
// ❌ Before
if (payload && payload.gameKey) { ... }
if (error && error.stack) { ... }

// ✅ After
if (payload?.gameKey) { ... }
if (error?.stack) { ... }
```

### Nullish Coalescing (`S6606`)
```typescript
// ❌ Before (Overwrites valid falsy values like empty string or 0)
const title = config.title || 'Default';

// ✅ After
const title = config.title ?? 'Default';
```

### Raw String Templates (`S7780`)
```typescript
// ❌ Before
const regex = new RegExp(`[\\x20-\\x7e]{${min},}`, 'g');

// ✅ After
const regex = new RegExp(String.raw`[\x20-\x7e]{${min},}`, 'g');
```

### Code Point Inspection (`S7758`)
```typescript
// ❌ Before
const charCode = str.charCodeAt(i);

// ✅ After
const codePoint = str.codePointAt(i) ?? 0;
```

### RegExp Execution (`S6594`)
```typescript
// ❌ Before
const match = line.match(/^\[(.+?)\]$/);

// ✅ After
const match = /^\[(.+?)\]$/.exec(line);
```

### Floating Promise vs Void Operator (`S3735`)
```typescript
// ❌ Before
function logDebug(msg) { void msg; }

// ✅ After
function logDebug(_msg) { /* no-op debug handler */ }
```

---

## 5. CSS Rules Remediation (CSS/Styling Specific)

### Duplicate Selectors (`css:S4666`)
```css
/* ❌ Before */
.sort-item { padding: 12px 15px; }
.sort-item { position: relative; }

/* ✅ After */
.sort-item { position: relative; padding: 12px 15px; }
```

### Deprecated CSS Properties (`css:S1874`)
```css
/* ❌ Before */
.app-tooltip { word-break: break-word; }

/* ✅ After */
.app-tooltip { overflow-wrap: break-word; }
```

---

## 6. Architectural & Complexity Exemption Rules (Cross-Language)

| Rule Key | Name | Mandated Action | Rationale |
| :--- | :--- | :--- | :--- |
| `S3776` | Cognitive Complexity | **Flag `accept`** | Splitting functions solely for metric scores fragments locality and creates shallow helpers. |
| `S2004` | Deep Function Nesting | **Flag `accept`** | Closures in drag-drop grids, search handlers, or async event loops require inline scope binding. |
| `css:S7924` | Text Contrast | **Flag `accept`** | Visual branding and dark-mode color palettes take precedence over automated WCAG checks. |
