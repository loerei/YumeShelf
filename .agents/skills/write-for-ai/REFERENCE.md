# Reference: Before / After Examples

## 1. Tool Description

**Before** (MCP `patch_file`):
```
Perform a robust, AST-bounded search-and-replace edit on a target file.
Can be optionally scoped to a line range or a specific AST symbol (function/class)
using jCodeMunch index. Includes safety occurrence checks, workspace-scoped path
protection for relative paths, and dry-run preview.
```
**After:**
```
Edit a file by replacing an exact text block (search_content/replace_content)
or applying a unified diff (patch_content). Optionally scope to a line range or AST symbol.
```
**What was cut and why:**
- `"robust"` — adjective, no decision value
- `"AST-bounded"` — implementation detail; `symbol_name` param already signals this capability
- `"safety occurrence checks"` — restates `allow_multiple` param description
- `"workspace-scoped path protection"` — covered in `instructions.md`
- `"dry-run preview"` — restates `dry_run` param description

---

## 2. Tool Description (batch)

**Before** (MCP `batch_patch_files`):
```
Perform an atomic, transactional refactoring operation across multiple target files.
Applies Git-style Unified Diffs (Fuzz = 0) with a safety lock: if any patch fails,
the entire transaction is rolled back safely, leaving no corrupted files.
Includes crash-resilient ephemeral backup files, optimistic hash-locking to prevent
concurrency conflicts, and dry-run diff preview.
```
**After:**
```
Apply unified diffs to multiple files in one call.
All patches are validated before any file is written; if one fails, none are applied.
```
**What was cut and why:**
- `"atomic, transactional"` — mechanism label; the behavior (all-or-nothing) is what matters and is kept
- `"Fuzz = 0"` — implementation detail
- `"crash-resilient ephemeral backup files"` — internal, AI cannot act on this
- `"optimistic hash-locking"` — internal mechanism

---

## 3. Tool Description (action tool)

**Before** (MCP `apply_last_dry_run`):
```
Commit a patch that was previewed with dry_run=true, using only its run_id.
Avoids resending search_content / replace_content / patch_content,
cutting token usage roughly in half for the apply step.
Fails with a clear error if the run_id is unknown, expired (TTL 300 s),
or if any target file was modified after the dry-run (hash guard).
```
**After:**
```
Apply the patch cached by a previous dry_run=true call.
Requires the run_id from that response.
Fails if the run_id is expired (300 s TTL) or if any target file was modified after the dry-run.
```
**What was cut and why:**
- `"Avoids resending..."` — explains motivation for the feature, not useful for deciding when to call it
- `"cutting token usage roughly in half"` — benefit to the user, not a decision signal for AI
- `"Fails with a clear error"` — all tools should fail clearly; stating it adds nothing
- `"hash guard"` — implementation label; what matters is *the condition* (file modified), which is kept

---

## 4. Parameter Description

**Before:**
```
"description": "If True, returns a unified diff preview of the changes without
modifying the file. Defaults to False."
```
**After:**
```
"description": "Preview changes as a diff without writing to disk. Returns run_id for apply_last_dry_run."
```
**What changed:** Added the consequence (`run_id`) that matters for the next action. Removed `"Defaults to False"` — schema `default` field already expresses this.

---

## 5. `instructions.md` / System Prompt Rule

**Before:**
```
Always use dry_run=true to preview large or risky changes before applying.
```
**After (decision table):**
```
| Condition | Action |
|---|---|
| allow_multiple: true | Use dry_run=true, then apply_last_dry_run |
| batch touching 3+ files | Use dry_run=true, then apply_last_dry_run |
| single-occurrence edit | Apply directly (dry_run=false) |
```
**Why:** Prose rules require AI to parse `"large or risky"` — subjective. A table gives exact branch conditions.

---

## 6. `SKILL.md` Frontmatter Description

**Bad:**
```
description: Helps write better text for AI systems.
```
**Good:**
```
description: Review, edit, or write AI-facing text — tool descriptions, MCP instructions,
system prompts, AGENTS.md, GEMINI.md, SKILL.md frontmatter, parameter docs, error messages —
so the AI reads it correctly with minimum tokens. Use when user asks to review, optimize,
rewrite, or create any text that an AI model will read rather than a human.
```
**Why:** The description is the *only* text the agent reads when deciding whether to load this skill. It must include: (1) what types of artifacts this covers, (2) explicit trigger phrases.

---

## 7. Error Message (returned by tool)

**Bad:**
```
{"error": "Something went wrong with the file operation."}
```
**Good:**
```
{"error": "run_id 'abc123' not found or expired. Re-run with dry_run=true to get a fresh run_id."}
```
**Why:** The error must tell the agent its *next action*, not just that something failed. `"Something went wrong"` forces a retry loop with no direction.

---

## 8. `AGENTS.md` / `GEMINI.md` Rule

**Bad:**
```
You should try to always make sure to run impact analysis before editing
any symbols if possible.
```
**Good:**
```
MUST run gitnexus_impact before modifying any function, class, or method.
Report blast radius to the user before proceeding.
```
**What was cut and why:**
- `"You should try to"` — hedging; agent treats this as optional
- `"make sure to"` — filler, no added constraint
- `"if possible"` — silently removes the rule; agent will skip whenever convenient

**Pattern for rules:**
- Use `MUST` / `NEVER` / `Always` — unambiguous imperatives
- Trigger condition first (`"before modifying any function"`)
- Action second (`"run gitnexus_impact"`)
- No hedges, no qualifiers, no politeness
