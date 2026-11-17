# Reference: Write for AI & Deslop Guide

## 1. Master Deslop Matrix & Checklist

Use this matrix as both a lookup reference and an audit checklist:

| Noise Category | What to Cut & How to Fix | Bad (Slopped / Overexplained / Lossy) | Good (Deslopped / Actionable / Precise) |
| :--- | :--- | :--- | :--- |
| **Pompous Verbs & Fluff Adjectives** | Cut buzzwords (`utilize`, `leverage`, `orchestrate`, `facilitate`, `robust`, `seamless`, `atomic`, `intelligent`). Use simple active verbs (`fetch`, `update`, `check`). | `Safely and intelligently orchestrate avatar updates without corrupting state` | `Update user avatar URL in database` |
| **Implementation Trivia** | Cut internal algorithms, threading models, memory caches, or languages the caller cannot control. State only external behavior and return contracts. | `Uses a multi-threaded SHA-256 hashing algorithm to verify file integrity` | `Checks if a file was modified on disk` |
| **Schema & Location Duplication** | Do not repeat types, default values, enums, required status, or repo layout already in schemas/configs. State only runtime behavior or return values. | `"description": "Optional boolean flag. If true, previews changes. Defaults to false."` | `"description": "Preview changes without writing to disk. Returns diff."` |
| **Circular Naming** | Do not rephrase what the tool/parameter identifier already makes obvious. State unique triggers, differentiators, or side effects. | `# Tool: delete_user<br/>This tool is used to delete a user from the system.` | `# Tool: delete_user<br/>Permanently delete user account, purge session caches, and revoke API keys.` |
| **Conversational Chaff & Hedging** | Cut polite filler and weak modals (`Please note`, `try to`, `Make sure to`). Use direct imperatives (`MUST`, `NEVER`, `ALWAYS`). | `Please make sure to always remember that you should try to run tests before committing` | `MUST run tests before committing` |
| **Synonym Stacking** | Cut chained near-identical qualifiers (`strict, absolute, mandatory, non-negotiable`). Use a single unambiguous keyword (`MUST`, `MUST NOT`). | `It is strictly, absolutely, and mandatory non-negotiable to run impact analysis before editing symbols.` | `MUST run impact analysis before modifying any function or class symbol.` |
| **Motivational Fluff vs. Operational Rationale** | Cut creation history, author preferences, and cost/UX justifications. **EXCEPTION (Drop Test):** Preserve operational rationale (failure mode, blast radius, anti-bias mechanism) if dropping it causes edge-case errors. | `Compresses avatars to JPEG to save server bandwidth and improve user UX.` | **Constraint:** `Compresses uploaded avatars to JPEG (max 512x512).`<br/>**Operational Rationale:** `Isolate auditor in a clean session because authors have confirmation bias and overlook own bugs.` |
| **Reference Over-Specification** | Do not catalog internal sub-topics or case study titles inside a link sentence. State only the high-level category of the target file. | `For canonical case studies (Auth, Emails, Payments, Images), see [REFERENCE.md](REFERENCE.md).` | `For canonical case studies, see [REFERENCE.md](REFERENCE.md).` |
| **Phantom / Reactionary Bans** | Do not add `NEVER` rules against custom artifacts introduced by earlier prompt drafts. Delete the original trigger instruction instead. Reserve `NEVER` for default LLM biases. | `STRICT BAN: NEVER output multi-role Persona Trees ([For DevOps], [For Cost Leads]) under any circumstances.` | *(Delete the prompt instruction that originally requested Persona Trees; add zero negative rules)* |
| **Opaque Error Messages** | Cut generic failure strings or raw internal jargon. State exactly what failed and the next recovery action. | `{"error": "An unexpected internal exception occurred in the image pipeline."}` | `{"error": "Unsupported format 'image/bmp'. Convert to PNG, JPEG, or WebP and retry."}` |
| **Decorative Bullet Titles** | Never force pseudo-titles onto bullets for decoration. Title bullets in plain English ONLY when needed for cross-referencing. | `- **Action Enforcement**: Verify that all tests pass before merge.` | `- Verify all tests pass before merge.` |
| **Theatrical / Hollow Headers** | Never create headers or sub-headers wrapping 1–2 sentences. Merge directly into parent flow or list. | `### Enforcement Gate<br/>If checks fail, reject the pull request.` | `- If checks fail -> Reject the pull request.` |
| **Cosmetic Granularity (Scope Narrowing)** | Do not add narrow technical sub-cases just to look thorough. Formulate directives at the highest level of generality that enforces the boundary. | `STRICT BAN: Never guess multivariate trends from univariate statistics when querying data.` | `Do not stop at CLI output and guess deeper; all deeper claims require empirical proof.` |
| **Cross-Repo Context Contamination** | Never leak local filenames, dataset names, or repo jargon into shared rules. Write from the standpoint of an agent in an unfamiliar repo. | `Before modifying parser, check telemetry in Client.csv and Record.csv for schema drift.` | `Before modifying parser, inspect local schema definitions and test fixtures for schema changes.` |
| **Lossy Compression (Stylistic Paraphrasing)** | Never shorten a rule if doing so drops a condition (`more generalized OR more concise`), narrows set mappings (`1-to-1` vs. `N-to-M`), weakens `MUST`, or breaks variable binding. | `If a prompt can be replaced by a shorter rule, replace it.` *(drops `instruction set`, `more generalized`, and quality check)* | `If an instruction or instruction set can be reproduced by another instruction or instruction set that is more generalized or more concise with similar or better quality, the old instruction or instruction set MUST be replaced by that simpler instruction or instruction set.` |
| **Runtime & Path Lock-In** | Cut host-specific built-in tool IDs (`view_file`, `write_to_file`, `grep_search`) and hardcoded layout paths in portable skills; use capability phrasing and relative/variable asset paths while keeping contract-pinned APIs exact. | `Call view_file on subdocs and run pwsh repo/scripts/run.ps1.` | `Read matching subdocs with your native file-reading tool and run pwsh <skill_dir>/scripts/run.ps1.` |
| **Cross-Doc Protocol Drift** | Repair broken contracts across linked files before tightening prose: align status enums, caller/callee prerequisites, handoff templates, and strip spurious YAML frontmatter on non-skill guides. | Caller expects `STATUS: REVISIONS NEEDED` + setup preamble; guide has YAML frontmatter and outputs `ROUND_REVISION_NEEDED`. | Remove subdoc YAML frontmatter; align prerequisite call, handoff template, and exact `STATUS: REVISIONS NEEDED` enum. |
| **Recall-Lossy Checklist Compression** | Never collapse explicit audit defect signatures or minimal `BAD`/`GOOD` pairs into vague umbrella rules (`"ensure security/UX"`). Compress decision gates; keep defect anchors. | `Audit inputs, tokens, and file paths for security vulnerabilities.` | `Reject JWT headers trusting alg: "none", Math.random() session tokens, and path.join() without resolved root containment check.` |

---

## 2. Artifact Target Matrix

| Artifact Type | Primary Purpose | Must Answer | What to Cut |
| :--- | :--- | :--- | :--- |
| **Tool Description** | Tool selection | When to call this vs. peer tools? | Parameter repetition, internal implementation details, marketing adjectives |
| **Parameter Doc** | Value formulation | What value format is expected & what behavior does it switch? | Type/default repeats, redundant explanations of self-evident names |
| **System / Agent Rule** | Behavioral constraint | What MUST / NEVER happen under this condition? | Polite hedging (`try to`), motivational fluff/history (preserve operational rationale passing Drop Test) |
| **SKILL.md Frontmatter** | Router gate / Trigger | When to load this skill? (`Use when...` in 10–15 words) | Feature summaries (What), benefits (Why), slash command mentions |
| **Tool Error Message** | Agent recovery | What failed and what exact command/action fixes it? | Generic failures (`Something went wrong`), internal stack traces without recovery steps |
| **Audit / Reviewer Guide** | Defect recall & verdict | Which scope is isolated, which subdocs load per condition, what concrete defect signatures fail review, and what output schema/status to emit? | Vague `"check quality/security"` summaries, narrative filler, non-matching subdocs loaded out of regime |

---

## 3. Structural & Multi-Line Case Studies

### A. Tool Description: Single Action (`resize_image`)

**Before:**
```text
Perform a robust, GPU-accelerated image resize operation on a target image file.
Can be optionally scaled by aspect ratio or constrained to max width and height
using bilinear interpolation. Includes safety format checks, file existence
validation, and preview thumbnail generation.
```

**After:**
```text
Resize an image file to target width and height, or scale by percentage.
Supported formats: PNG, JPEG, WebP. Overwrites source file if in_place=true.
```

**Rationale:** Cut marketing (`robust`), implementation trivia (`GPU-accelerated`, `bilinear interpolation`), universal baseline checks (`file existence validation`), and parameter restatements (`preview thumbnail generation`). Kept supported formats and mutation side-effect (`in_place=true`).

### B. Tool Description: Batch Operation (`batch_send_emails`)

**Before:**
```text
Perform an atomic, transactional email dispatch operation across multiple recipients.
Uses SMTP connection pooling with a safety guarantee: if any recipient address fails validation,
the entire batch is rolled back safely, preventing partial delivery.
Includes crash-resilient queue persistence and rate-limit backoff.
```

**After:**
```text
Send emails to a list of recipients in one call.
All recipient addresses are validated before sending; if any address is invalid, no emails are sent.
```

**Rationale:** Cut infrastructure trivia (`SMTP connection pooling`, `queue persistence`, `rate-limit backoff`) and buzzwords (`atomic, transactional`), while preserving the exact all-or-nothing validation contract.

### C. Tool Description: Status & Result Retrieval (`get_export_result`)

**Before:**
```text
Retrieve the exported archive that was prepared by start_export, using only its job_id.
Avoids streaming large binary payloads over the primary socket, cutting bandwidth
roughly in half for the client. Fails with a clear error if the job_id is unknown,
expired (TTL 24 hours), or if the archive is still generating (pending state).
```

**After:**
```text
Download the zip archive produced by start_export using its job_id.
Returns download_url. Fails if job_id is expired (24h TTL) or if status is still pending.
```

**Rationale:** Cut architectural motivation (`Avoids streaming... cutting bandwidth...`) and tautology (`Fails with a clear error`). Preserved parameter link (`job_id`), return contract (`download_url`), and failure states (`expired`, `pending`).

### D. Prose Rule vs. 2-Column Decision Table

**Before (Ambiguous Prose):**
```text
Always compress images before uploading if they are large.
```

**After (Exact Decision Table):**

| Condition | Action |
| :--- | :--- |
| File size > 5 MB | Compress with quality=80 before upload |
| Dimensions > 2048px | Resize to max 2048px width before upload |
| File size <= 5 MB and <= 2048px | Upload directly |

### E. Skill Frontmatter Description (Router Gate)

**Bad (What-Summary & Slash Command Clutter — 22 words):**
```yaml
description: Draft reproducible bug reports with environment details, raw logs, and file replicas. Use when documenting bugs, tool failures, or invoking /write-a-bug-report.
```

**Bad (Vague — No Actionable Trigger):**
```yaml
description: Helps write better bug reports.
```

**Good (Pure Trigger — 12 words):**
```yaml
description: Use when asked to write a bug report or document tool failures.
```

### F. Over-Pruning vs. True Deslop

**Bad (Bloated Slop):**
```text
Perform a robust, secure, and state-of-the-art deletion of a user account.
Engineered to prevent orphaned records in relational tables and cut query load.
Includes optimistic concurrency locks to prevent race conditions and fails with an error
if user_id is unknown, if the account has active subscriptions, or if unverified.
```

**Bad (Over-Pruned — Drops Blocking Constraints):**
```text
Delete a user account.
```

**Good (True Deslop — 100% Signal Preserved):**
```text
Permanently delete a user account by user_id.
Fails if the account has active subscriptions (must cancel first) or is unverified.
```

### G. Operational Rationale vs. Motivational Fluff (The Drop Test)

**Bad (Motivational Fluff — External Cost/UX):**
```text
Compress uploaded avatar images to JPEG to save server disk storage, reduce AWS S3 bandwidth costs, and improve user mobile load time.
```

**Bad (Over-Pruned Rule — Loses Edge-Case Compass):**
```text
Isolate explorer and auditor into separate subagents.
```
*(Without knowing WHY, an explorer hitting a blocker may re-run scripts to "quickly self-verify", violating the anti-confirmation-bias boundary).*

**Good (Operational Rationale Preserved — Passes Drop Test):**
```text
Isolate explorer and auditor into separate subagents because authors have confirmation bias and systematically overlook defects in their own hypotheses or code.
```

### H. Generative Compression vs. The Enumeration Trap (Occam's Instruction Law)

**Bad (The Enumeration Trap — Sprawling Sub-Case Table):**
```markdown
| Defect Behavior in Automated Review | Classification |
| :--- | :--- |
| Silently missed (plausible wrong output, state drift, race condition) OR raises an error whose generalized fix across the class requires architectural/domain insight not obvious from the error message | **Blocking Defect** |
| Produces an immediate compiler error, uncaught stack trace, or failing assertion against stated Acceptance Criteria with an obvious fix; misses intermediate DEBUG logs in transient retry loops that re-raise on exhaustion; or uses best-effort idempotent resource teardown in finally blocks | **Suggestion Only** |
```
*(Brittle: Reviewers endlessly append domain-specific examples, creating the false impression that unlisted defects are excused).*

**Good (Truth Table — 2-Axis Decomposition):**

| Alert Raised in Automated CI | Fix Obvious Without Domain Knowledge | Classification |
| :---: | :---: | :--- |
| True | True | Suggestion Only |
| True | False | Blocking Defect |
| False | Any | Blocking Defect |

**Best (Generative Compression — Unified 2-Condition Invariant):**
```markdown
A defect MUST be classified as **Suggestion Only** if and only if it satisfies both conditions:
1. It raises an immediate, unmistakable alert (compiler error, crash, or failing test assertion) during automated CI execution.
2. The fix is mechanically obvious from the symptom without requiring domain-specific architectural insight.
Otherwise, it MUST be classified as a **Blocking Defect** (and state why automated checks would miss it).
```

### I. Recall Preservation in Audit Checklists vs. Decision-Gate Compression

Apply Occam's Instruction Law differently by role:
- **Gating / Routing Rules (Case Study H):** Compress sub-case lists into general invariants so unlisted items do not act as loopholes.
- **Audit Checklists & Subdocuments:** Keep explicit failure signatures and minimal `BAD`/`GOOD` contrasts as attention triggers; generalizing them into high-level categories causes auditors to overlook real defects.

**Bad (Over-Compressed Audit Checklist - Collapses Recall):**
```markdown
- Ensure JWT tokens, session IDs, and file access paths follow security best practices.
```

**Good (Preserved Failure Signatures - High Recall):**
```markdown
- Reject JWT verification trusting `decoded.header.alg` (allowlist `RS256`/`EdDSA` only; block `alg: "none"`).
- Reject `Math.random()` for session IDs or nonces (require CSPRNG such as `crypto.randomBytes`).
- Reject `path.join(baseDir, userInput)` without normalizing via `path.resolve` and asserting `target.startsWith(safeBase + path.sep)`.
```
