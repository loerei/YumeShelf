# Sonar Remediation Reference & Rule Cookbook

## 1. MCP Tool Parameter Reference

| MCP Tool (`sonarcloud:` / `sonarqube:`) | Required Arguments & Constraints |
| :--- | :--- |
| `search_my_sonarqube_projects` / `search_sonar_projects` | None |
| `search_sonar_issues_in_projects` / `search_sonar_issues` | `projects: ["<key>"]`, `issueStatuses: ["OPEN"]`. Add `pullRequestId` / `pullRequest` for PR scope; add `files: ["<key>:<relPath>"]` for file scope. |
| `search_duplicated_files`, `get_duplications` | `projectKey: "<key>"`, `key: "<fileKey>"`, optional `pullRequest: "<id>"` |
| `get_component_measures` | `projectKey: "<key>"` (`projectKey`, NOT `component`), `metricKeys: [...]` |
| `show_rule` / `get_rule_details` | `key: "<ruleKey>"` |
| `get_project_quality_gate_status` / `get_quality_gate_status` | `projectKey: "<key>"` |

## 2. Rule Remediation Matrix

Before calling `change_sonar_issue_status` to flag `"accept"` or `"falsepositive"`, MUST search for the exact issue key using `search_sonar_issues` / `search_sonar_issues_in_projects` with `issueStatuses: ["OPEN"]`.

| Rule Keys & Category | Action & Rationale |
| :--- | :--- |
| `S3776` (Cognitive Complexity) | Flag `accept`. NEVER split functions solely for `S3776`; structural splits require `improve-codebase-architecture`. |
| `S2004` (Function Nesting) | Flag `accept`. Deep nesting in UI/search/event closures is intentional design. |
| `S8786` (Path Regex Backtracking) | Flag `accept`. Filesystem path/filename lengths are OS-bounded (260 Windows / 4096 POSIX); no practical ReDoS risk. |
| `S7744` (Defensive Object Spreads) | Flag `accept`. `{ ...(obj \|\| {}) }` guards against null/undefined at IPC, JSON config, and storage boundaries. |
| `S7784` (Plain JSON Clone vs Proxy) | Flag `accept` (or use shallow loop). `structuredClone` throws `DataCloneError` on Proxies and keeps prototypes/non-enumerable keys instead of pure JSON. |
| `css:S7924` (Theme / Contrast) | Flag `accept`. Brand theme tokens override generic WCAG checks. |
| `S1854`, `S1481`, `S6582`, `S6606`, `S7780`, `S7758`, `S6594`, `S4666`, `S1874` | Fix code using the patterns in Sections 3-7 below. |

## 3. Preemptive Inspection Checklist (Pre-Scan)

- **JS/TS**: Replace nested ternaries with helpers or blocks; prefer positive conditions when natural; mark React component prop interfaces `Readonly<Props>`; handle floating promises with `.catch()` rather than `void`.
- **Cross-Language**: Remove unused imports and dead non-contract variables; do not split functions solely for complexity metrics.

## 4. Contract-Aware Dead Code (`S1854`, `S1481`)

When Sonar flags an unused variable near a return literal, NEVER alter returned object keys or domain types just to consume the variable.

```typescript
// BAD: Replaces top-level Order reference with child LineItem to consume unused variable,
// dropping top-level order.status and breaking callers.
const primaryItem = order.primaryItem ?? selectPrimaryItem(items);
return { status: order.status, primaryItem: primaryItem };

// GOOD: Assign property onto domain object if missing and keep top-level contract intact.
if (!order.primaryItem) {
    order.primaryItem = selectPrimaryItem(items);
}
return { status: order.status, items, primaryItem: order };
```

## 5. Unused Functions & Dynamic References (`S1172`, `S1481`, `S1854`)

1. Run impact analysis (`find_references` / symbol search) to trace static callers.
2. Check for dynamic string registrations (`ipcMain.handle`, `ipcRenderer.invoke`, REST route strings, config hooks).
3. If dynamically invoked or externally exported, query the issue key (`issueStatuses: ["OPEN"]`) and flag `"accept"` or `"falsepositive"`.

## 6. JS/TS Refactoring Patterns

```typescript
// S6582 Optional Chaining
// BAD:  if (payload && payload.id) { ... }
// GOOD: if (payload?.id) { ... }

// S6606 Nullish Coalescing (preserves empty string and 0)
// BAD:  const title = config.title || 'Default';
// GOOD: const title = config.title ?? 'Default';

// S7780 Raw String Templates
// BAD:  const regex = new RegExp(`[\\x20-\\x7e]{${min},}`, 'g');
// GOOD: const regex = new RegExp(String.raw`[\x20-\x7e]{${min},}`, 'g');

// S7758 Code Point Inspection
// BAD:  const charCode = str.charCodeAt(i);
// GOOD: const codePoint = str.codePointAt(i) ?? 0;

// S6594 RegExp Execution
// BAD:  const match = line.match(/^\[(.+?)\]$/);
// GOOD: const match = /^\[(.+?)\]$/.exec(line);

// S3735 Void Operator Removal
// BAD:  function logDebug(msg) { void msg; }
// GOOD: function logDebug(_msg) { /* no-op */ }
```

## 7. CSS Patterns

```css
/* css:S4666 Merge duplicate selectors */
/* BAD:  .item { padding: 12px; } .item { position: relative; } */
.item { position: relative; padding: 12px; }

/* css:S1874 Replace deprecated word-break: break-word */
.tooltip { overflow-wrap: break-word; }
```
