# Reference: Write for AI & Deslop Guide

## 1. Deslop Reference: Fluff vs. Signal

| Category | Bad (Slopped / Jargon / Overexplained) | Good (Deslopped / Plain English / Actionable) |
| :--- | :--- | :--- |
| **Pompous Verbs** | `Utilize the provided mechanism to facilitate user data retrieval from storage` | `Fetch user records from the database` |
| **Implementation Trivia** | `Engineered with state-of-the-art fallback paradigms for enhanced resilience` | `Returns [] if the file does not exist` |
| **Fluff Adverbs & Buzzwords** | `Safely and intelligently orchestrate avatar updates without corrupting state` | `Update user avatar URL in database` |
| **Internal Mechanism** | `Uses a multi-threaded SHA-256 hashing algorithm to verify file integrity` | `Checks if a file was modified on disk` |
| **Schema Duplication** | `"description": "Optional boolean flag. If true, previews changes. Defaults to false."` | `"description": "Preview changes without writing to disk. Returns diff."` |
| **Circular Naming** | `# Tool: delete_user\nThis tool is used to delete a user from the system.` | `# Tool: delete_user\nPermanently removes user account and invalidates active session tokens.` |
| **Conversational Chaff & Hedging** | `Please make sure to always remember that you should try to run tests before committing` | `MUST run tests before committing` |
| **Motivational Justification** | `Compresses avatars to JPEG to save server bandwidth and improve user UX.` | `Compresses uploaded avatars to JPEG with max 512x512 dimensions.` |
| **Synonym Stacking** | `This rule is a strict, absolute, mandatory, and non-negotiable boundary.` | `MUST NOT modify files outside workspace root.` |
| **Reference Over-Specification** | `For canonical case studies (Auth, Emails, Payments, Images), see [REFERENCE.md](REFERENCE.md).` | `For canonical case studies, see [REFERENCE.md](REFERENCE.md).` |
| **Phantom Bans** | `STRICT BAN: NEVER output Persona Trees or Magic Metaphors under any circumstances.` | *(Delete the instruction that introduced Persona Trees/Metaphors instead of adding a ban rule)* |
| **Opaque Error vs Actionable** | `An unexpected internal exception occurred within the subsystem processing pipeline.` | `Invalid file path: 'src/main.ts'. Check that the file exists and retry.` |
| **Decorative Bullet Titles** | `- **Action Enforcement**: Verify that all tests pass before merge.` | `- Verify all tests pass before merge.` |
| **Theatrical / Hollow Headers** | `### Enforcement Gate\nIf not satisfied, reject the DA.` | `- If not satisfied -> Reject DA.` |

---

## 2. The 6 Universal Forms of Redundancy

| Redundancy Form | Definition & Anti-Pattern | How to Fix |
| :--- | :--- | :--- |
| Schema and Location Duplication | Repeating types, default values, enums, required status, or repository layout constraints already declared in schemas or configuration files. | State only runtime consequences, non-obvious formatting, or downstream return values. |
| Circular Naming | Rephrasing or defining what the identifier, symbol, or header already makes obvious (e.g. "The fetch_user tool fetches a user"). | State unique trigger conditions, differentiators against peer tools, or state mutations. If self-evident, omit prose. |
| Conversational Chaff & Hedging | Polite conversational filler, introductory padding, and weak modals ("Please note that you should try to...", "You may want to consider..."). | Strip polite phrasing. Replace with direct, standard imperatives (`MUST`, `NEVER`, `ALWAYS`). |
| Motivation & History | Explaining why a feature was created, past architecture decisions, or how much time/tokens/bandwidth it saves. | State only the operational contract and requirements. AI models execute instructions; they do not need justification. |
| Synonym Stacking | Chaining multiple near-identical adjectives, adverbs, or qualifiers to emphasize importance ("strict, absolute, mandatory, and non-negotiable"). | Use a single unambiguous keyword (`MUST`, `MUST NOT`). |
| Reference Over-Specification | Itemizing, summarizing, or listing internal sub-topics, case study titles, or contents of a referenced document inside the link sentence. | State only the high-level category of the target file without cataloging its contents. |

---

## 3. Artifact Target Matrix

| Artifact Type | Primary Purpose | Must Answer | What to Cut |
| :--- | :--- | :--- | :--- |
| **Tool Description** | Tool selection | When to call this vs. other tools? | Parameter repetition, internal implementation details, marketing adjectives |
| **Parameter Doc** | Value formulation | What value format is expected & what does it trigger? | Type/default repeats, redundant explanations of obvious names |
| **System / Agent Rule** | Behavioral constraint | What MUST / NEVER happen in this condition? | Polite hedging (`try to`), explanatory rationale, background context |
| **SKILL.md Frontmatter** | Router gate / Trigger | When to load this skill? (Trigger condition only) | Feature summaries (What), benefits (Why), slash command mentions |
| **Tool Error Message** | Agent recovery | What went wrong and what exact command/action fixes it? | Generic failures (`Something went wrong`), internal stack traces without recovery steps |

---

## 4. Before / After Case Studies by Artifact Type

### A. Tool Description: Single Action

**Before (`resize_image`):**
```
Perform a robust, GPU-accelerated image resize operation on a target image file.
Can be optionally scaled by aspect ratio or constrained to max width and height
using bilinear interpolation. Includes safety format checks, file existence
validation, and preview thumbnail generation.
```
**After:**
```
Resize an image file to target width and height, or scale by percentage.
Supported formats: PNG, JPEG, WebP. Overwrites source file if in_place=true.
```
**What was cut and why:**
- "robust" — marketing adjective, zero decision value
- "GPU-accelerated", "bilinear interpolation" — internal implementation trivia
- "safety format checks", "file existence validation" — universal error handling the AI already expects
- "preview thumbnail generation" — restates thumbnail parameter

---

### B. Tool Description: Batch Operation

**Before (`batch_send_emails`):**
```
Perform an atomic, transactional email dispatch operation across multiple recipients.
Uses SMTP connection pooling with a safety guarantee: if any recipient address fails validation,
the entire batch is rolled back safely, preventing partial delivery.
Includes crash-resilient queue persistence and rate-limit backoff.
```
**After:**
```
Send emails to a list of recipients in one call.
All recipient addresses are validated before sending; if any address is invalid, no emails are sent.
```
**What was cut and why:**
- "atomic, transactional" — mechanism buzzwords; the actual behavior (all-or-nothing validation) is kept
- "SMTP connection pooling" — internal mechanism the caller cannot control
- "crash-resilient queue persistence", "rate-limit backoff" — internal infrastructure details

---

### C. Tool Description: Status & Result Retrieval

**Before (`get_export_result`):**
```
Retrieve the exported archive that was prepared by start_export, using only its job_id.
Avoids streaming large binary payloads over the primary socket, cutting bandwidth
roughly in half for the client. Fails with a clear error if the job_id is unknown,
expired (TTL 24 hours), or if the archive is still generating (pending state).
```
**After:**
```
Download the zip archive produced by start_export using its job_id.
Returns download_url. Fails if job_id is expired (24h TTL) or if status is still pending.
```
**What was cut and why:**
- "Avoids streaming large binary payloads..." / "cutting bandwidth roughly in half..." — explains design motivation rather than tool contracts
- "Fails with a clear error" — tautology
- Kept the critical parameter (job_id), return contract (download_url), and recovery failure states (expired, pending)

---

### D. Parameter Description

**Before:**
```json
"description": "Optional boolean flag. If true, sends email as HTML instead of plain text. Defaults to false."
```
**After:**
```json
"description": "Send body formatted as HTML. When false, body is sent as plain text."
```
**What changed:** Removed "Optional boolean flag" and "Defaults to false" because schema type and default fields already declare them. Kept the behavioral switch.

---

### E. Circular Naming in Tool Definition

**Before (`delete_user`):**
```
# Tool: delete_user
This tool is used to delete a user from the system database when called.
```
**After:**
```
Permanently delete a user account, purge associated session caches, and revoke API keys.
```
**What was cut and why:**
- "This tool is used to delete a user..." — circular tautology repeating the function identifier
- Replaced with concrete side-effects and cascading actions the AI must know for decision-making.

---

### F. Synonym Stacking & Hedging in Agent Rules

**Before:**
```
It is strictly, absolutely, and mandatory non-negotiable that you should always make sure to run impact analysis before editing any symbols if possible.
```
**After:**
```
MUST run impact analysis before modifying any function or class symbol.
```
**What was cut and why:**
- "strictly, absolutely, and mandatory non-negotiable" — synonym stacking
- "you should always make sure to... if possible" — conversational hedging and weak modals
- Replaced with a single unambiguous imperative `MUST`.

---

### G. Decision Table vs. Multi-Step Workflow

**1. Rule Branching (Decision Table):**
- **Before (Prose Rule):**
  ```
  Always compress images before uploading if they are large.
  ```
- **After (2-Column Decision Table):**
  | Condition | Action |
  | :--- | :--- |
  | File size > 5 MB | Compress with quality=80 before upload |
  | Dimensions > 2048px | Resize to max 2048px width before upload |
  | File size <= 5 MB | Upload directly |
- **Why:** Prose rules force AI to guess what "large" means. A 2-column table gives exact branch conditions with minimal tokens.

**2. Multi-Step Workflows (Mermaid Diagram):**
- Reserve Mermaid flowcharts strictly for multi-step execution loops, state machines, and cross-agent handoffs (where a flat table cannot represent progression or cyclic recovery).

---

### H. Tool Error Message

**Bad:**
```json
{"error": "Something went wrong with the image processing."}
```
**Good:**
```json
{"error": "Unsupported image format 'image/bmp'. Convert to PNG, JPEG, or WebP and retry."}
```
**Why:** The error gives the model its exact next recovery action rather than causing an undirected retry loop.

---

### I. Reference Over-Specification & Spoilers

**Before:**
```markdown
For detailed architectural guides, configuration parameters, and canonical case studies (User Auth, Email Dispatch, Payment Webhooks, Image Resizing), see [REFERENCE.md](REFERENCE.md).
```
**After:**
```markdown
For configuration parameters and case studies, see [REFERENCE.md](REFERENCE.md).
```
**What was cut and why:**
- Parenthetical catalog list ("User Auth, Email Dispatch...") — itemizes internal contents inside the link sentence.
- Descriptive filler ("detailed architectural guides...") — redundant fluff.

---

### J. Reactionary Negative Constraints

**Scenario:** User asks to remove an unwanted multi-role survey format (`[For DevOps]`, `[For Implementers]`) that was introduced in an earlier prompt draft.

**Before (Reactionary Ban):**
```markdown
STRICT BAN: NEVER append multi-role persona survey trees (e.g., [For DevOps], [For Implementers], [For Cost Leads]) to any output under any circumstances.
```
**After (Clean Deletion):**
*(Delete the prompt instruction that originally requested persona survey trees. Add zero negative rules.)*

**Why:**
- Base models have no natural tendency to output multi-role persona trees unless prompted.
- Adding explicit bans against custom prompt artifacts wastes tokens and risks triggering unwanted behaviors. Reserve `NEVER` strictly for overriding default LLM biases.

---

### K. Skill Frontmatter Description

When scaling to 60+ skills, frontmatter descriptions act strictly as a **Router Gate**. They must answer ONLY *"When to load this skill?"* in **10–15 words**. Never summarize internal features ("What"), justify benefits ("Why"), or add slash commands (`/command` is handled automatically by platform metadata).

**Bad (What-Summary & Slash Command Clutter — 25+ words):**
```yaml
description: Draft reproducible bug reports with environment details, raw logs, and file replicas. Use when documenting bugs, tool failures, or invoking /write-a-bug-report.
```
*(Wastes context budget explaining "what" the skill does and redundantly repeating the slash command).*

**Bad (Vague Fluff — No Actionable Trigger):**
```yaml
description: Helps write better bug reports.
```
*(Lacks trigger keywords for intent matching).*

**Good (Use When Only — 10–14 words):**
```yaml
description: Use when asked to write a bug report or document tool failures.
```
*(Pure trigger condition; zero token waste).*

---

### L. Over-Pruning vs. True Deslop

Deslopping means eliminating conversational padding, marketing adjectives, and internal mechanism trivia — **NEVER dropping operational parameters, failure conditions, or recovery steps**.

**Bad (Bloated Slop — Noisy & Verbose):**
```
Perform a robust, secure, and state-of-the-art deletion of a user account.
Engineered to prevent orphaned records in relational tables and cut query load.
Includes optimistic concurrency locks to prevent race conditions and fails with an error
if user_id is unknown, if the account has active subscriptions, or if unverified.
```

**Bad (Over-Pruned — Drops Critical Constraints):**
```
Delete a user account.
```
*(Dangerous: Dropped the blocking conditions: active subscriptions and verification status. The agent cannot anticipate errors or plan prerequisites).*

**Good (True Deslop — 100% Signal Preserved):**
```
Permanently delete a user account by user_id.
Fails if the account has active subscriptions (must cancel first) or is unverified.
```
*(Strips all marketing adjectives and internal concurrency trivia, but preserves the identifier, prerequisites, and failure conditions).*