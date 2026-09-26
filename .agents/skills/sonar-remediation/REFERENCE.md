# Sonar Remediation Reference & Rule Cookbook

Detailed patterns, decision rules, MCP parameter references, preemptive inspection checklists, and concrete **Before / After** code examples for remediating SonarQube and SonarCloud rules across tech stacks.

---

## 1. MCP Tool Parameter Reference & Argument Schemas

| Task | MCP Tool (`sonarcloud:` / `sonarqube:`) | Required Arguments & Constraints |
| :--- | :--- | :--- |
| **Search Projects** | `search_my_sonarqube_projects` / `search_sonar_projects` | None |
| **Search Open Issues** | `search_sonar_issues_in_projects` / `search_sonar_issues` | `projects: ["<key>"]`, `issueStatuses: ["OPEN"]`<br>PR scope: MUST add `pullRequestId: "<id>"` / `pullRequest: "<id>"`. File scope: `files: ["<key>:<relPath>"]` |
| **Search Duplications** | `search_duplicated_files`, `get_duplications` | `projectKey: "<key>"`, `key: "<fileKey>"`, optional `pullRequest: "<id>"` |
| **Component Measures** | `get_component_measures` | `projectKey: "<key>"` (Note: parameter is `projectKey`, not `component`), `metricKeys: [...]` |
| **Show Rule Details** | `show_rule` / `get_rule_details` | `key: "<ruleKey>"` |
| **Quality Gate Status** | `get_project_quality_gate_status` / `get_quality_gate_status` | `projectKey: "<key>"` |

---

## 2. Detailed Rule Remediation & Triage Matrix

| Domain | Issue Category | Rule Keys | Action | Rationale & Requirements |
| :--- | :--- | :--- | :--- | :--- |
| **General** | **Cognitive Complexity** | `S3776` | **Flag `accept`** via `change_sonar_issue_status` | MUST search issue key first. NEVER split functions solely for S3776. Structural splits require `/improve-codebase-architecture`. |
| **General** | **Function Nesting** | `S2004` | **Flag `accept`** via `change_sonar_issue_status` | Deep nesting in UI/search/event closures is intentional design. |
| **General** | **Backtracking Regex on Bounded Strings** | `S8786` | **Flag `accept`** via `change_sonar_issue_status` | Regexes operating on filesystem paths or filenames have finite bounded lengths. No practical ReDoS risk. |
| **General** | **Defensive Object Spreads** | `S7744` | **Flag `accept`** via `change_sonar_issue_status` | Spreads like `{ ...(obj \|\| {}) }` protect against null/undefined at IPC and storage boundaries. Do NOT remove. |
| **General** | **Plain JSON Serialization vs Proxy** | `S7784` | **Flag `accept` or Targeted Shallow Clone** | `structuredClone` throws `DataCloneError` on Proxies and host objects. Preserve `JSON.parse(JSON.stringify)` or use shallow loops when input can be a Proxy. |
| **CSS** | **Theme / Contrast** | `css:S7924` | **Flag `accept`** via `change_sonar_issue_status` | Brand theme colors override generic WCAG contrast checks. |
| **JS/TS/CSS** | **Language Smells** | `S1854`, `S1481`, `S6582`, `S6606`, `S7780`, `S7758`, `S6594`, `S4666`, `S1874` | **Fix code** | Follow domain-specific refactoring patterns in this file. |

> [!IMPORTANT]
> Before calling `change_sonar_issue_status` to flag any issue as `"accept"` or `"falsepositive"`, you MUST search for the exact issue key using `search_sonar_issues` with `issueStatuses: ["OPEN"]`.

---

## 3. Preemptive Code Inspection Checklist

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

## 4. Contract-Aware Dead Code & Unused Assignments (`S1854`, `S1481`)

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

## 5. Unused Functions & Dynamic Reference Check (`S1172`, `S1481`, `S1854`)

Before deleting any unused function, export, or variable:
1. **MUST run Impact Analysis first**: Use `jcodemunch` find_references or symbol search tools to trace callers.
2. **Check for dynamic string references**: Verify if the symbol matches any string literals or dynamic IPC/service event handlers (e.g. inside `ipcMain.handle`, `ipcRenderer.invoke`, or REST route definitions).
3. **Safe Flagging**: If dynamic or exported externally, **MUST search for the issue key** in SonarQube/SonarCloud using `search_sonar_issues_in_projects` with `issueStatuses: ["OPEN"]` first, then call `change_sonar_issue_status` to flag status as `"accept"` or `"falsepositive"`.

---

## 6. Standard Code Smells & Refactoring Patterns (JS/TS Specific)

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

## 7. CSS Rules Remediation (CSS/Styling Specific)

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

## 8. Defensive Coding & Intentional Accept Rules (`S7744`, `S8786`, `S7784`)

### Defensive Fallback Spreads (`S7744`)
Sonar flags `{ ...(obj || {}) }` or empty fallback spreads as useless ("The empty object is useless").
**Rationale for Flagging `accept`**:
At runtime boundaries (IPC payloads, deserialized JSON configs, external databases), properties can be `null`, `undefined`, or omit nested objects. Spreading `{ ...obj }` directly throws `TypeError: Cannot spread null/undefined` if the upstream object is missing.
**Policy**: When spreading untrusted inputs, configs, or state snapshots, keep `{ ...(obj || {}) }` and flag `accept`.

### Bounded Path & Filename Regex Backtracking (`S8786`)
Sonar flags `/[\\/]+$/` or `/\/+$/` for super-linear performance due to backtracking.
**Rationale for Flagging `accept`**:
Path normalization patterns operate strictly on filesystem paths or directory names, which are bounded by OS limits (260 characters on Windows, 4096 on POSIX). ReDoS attacks require megabyte-scale maliciously crafted inputs that never exist in path strings.
**Policy**: Flag `accept` on path/filename trailing slash strippers instead of rewriting working path code.

### Plain JSON Serialization & Proxy Compatibility (`S7784`)
Sonar recommends replacing `JSON.parse(JSON.stringify(val))` with `structuredClone(val)`.
**Rationale for Flagging `accept` or Targeted Shallow Clone**:
1. `structuredClone` throws `DOMException: DataCloneError` when cloning JavaScript `Proxy` objects (frequently used in test mocks, state stores, and reactive wrappers).
2. `structuredClone` preserves non-enumerable properties, prototypes, and class instances, whereas `JSON.parse(JSON.stringify(val))` guarantees a pure plain JSON data object matching disk storage semantics.
**Policy**: When plain JSON serialization is desired or when dealing with potential Proxies in test/state boundaries, preserve `JSON.parse(JSON.stringify(val))` (or use explicit shallow loops) and flag `accept`.
