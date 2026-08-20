# Reviewer Anti-Laziness & Output Completeness Audit Reference

Instructions and heuristics for subagent reviewers to detect and reject code truncation, placeholder shortcuts, and incomplete implementations in `.diff` patches and modified source files.

---

## 1. Core Rejection Mandate

As a Reviewer, you MUST return `STATUS: REVISIONS NEEDED` if the implementation contains ANY lazy placeholder patterns, incomplete method stubs, or truncated logic.

Never give the main agent the benefit of the doubt. If code was omitted, abbreviated, or stubbed out with a placeholder comment, it is a hard failure.

---

## 2. Detection Matrix: Banned Patterns & Triage Heuristics

Scan all additions (`+` lines) in the `.diff` and modified source files against these 4 categories:

### A. Comment Placeholders & Syntactic Shortcuts
| Offending Pattern in Diff | Typical Disguise | Reviewer Verdict | Required Action |
| :--- | :--- | :--- | :--- |
| `// ...` or `/* ... */` | Ellipsis replacing lines | **HARD FAIL** | Quote file + line -> Demand complete implementation |
| `// TODO` / `// FIXME` | Deferred implementation | **HARD FAIL** | Demand logic be implemented in this iteration |
| `// rest of code here` | Section omission | **HARD FAIL** | Demand unabridged file content |
| `// similar to above` | Repeated logic skipped | **HARD FAIL** | Demand explicit implementation for all cases |
| `// implement later` | Lazy placeholder | **HARD FAIL** | Mark as missing deliverable |

### B. Structural & Behavioral Stubbing
| Offending Pattern | Description | Reviewer Verdict | Required Action |
| :--- | :--- | :--- | :--- |
| Empty function bodies | `def foo(): pass` or `function bar() {}` | **HARD FAIL** | Reject unless explicitly specified in plan as no-op |
| Hardcoded mock returns | `return true;` / `return null;` masking real logic | **HARD FAIL** | Demand dynamic, real calculation |
| Swallowed exceptions | `catch (e) {}` / `except: pass` without error handling | **HARD FAIL** | Demand proper error propagation or handling |
| Skipped test suites | `test.skip()`, `it.todo()`, or commented-out assertions | **HARD FAIL** | Demand active, asserting tests |

### C. Plan Checklist vs. Diff Incompleteness
| Defect Type | Indicator | Reviewer Verdict | Required Action |
| :--- | :--- | :--- | :--- |
| Checkbox without code | Item marked `[x]` in plan but no corresponding code in `.diff` | **HARD FAIL** | List exact plan checkboxes not present in diff |
| Partial case coverage | Plan specifies 5 cases, diff implements 2 | **HARD FAIL** | Detail the 3 missing cases |
| Missing edge-case handlers | Plan specifies null/empty check, code omits it | **HARD FAIL** | Demand guard clauses per plan |

### D. Truncation & Token Limit Breakage
| Indicator | Symptom | Reviewer Verdict | Required Action |
| :--- | :--- | :--- | :--- |
| Unclosed brackets / syntax error | File ends abruptly mid-statement | **HARD FAIL** | Report syntax break and missing tail |
| Incomplete exports | File defines functions but omits exports/imports | **HARD FAIL** | Demand complete module boundary |

---

## 3. Reviewer Reporting Format (when reporting to Parent Agent)

When you find any of the patterns above, format your finding under blocking issues:

```markdown
### Blocking Issue: [Anti-Laziness / Incomplete Implementation]
- **Target File**: `<path_to_file>:<line_number>`
- **Detected Pattern**: `[Exact quote of the offending code or comment, e.g. // ...]`
- **Plan Requirement**: `[Quote the exact section/checkbox from implementation_plan.md]`
- **Required Fix**: `[Concrete instruction specifying what complete logic must be written]`
```
