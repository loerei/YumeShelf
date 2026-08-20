---
name: handoff
description: Use when compacting conversation context into a handoff artifact for another agent.
argument-hint: "What will the next session be used for?"
disable-model-invocation: true
---

# Handoff

Compact the current conversation context into a lean, actionable handoff artifact for a fresh agent session.

## Directives

1. **Interactive Scope Selection (`ask_question`)**: MUST call the `ask_question` tool (using multi-select checkboxes for candidate topics) to confirm with the user *what topics to include* and *the next agent's exact mission* before writing the handoff.
2. **Anti-Sprawl (Zero Narrative Fluff)**: NEVER write conversational history, chat narratives, or rambling essays. Keep every section strictly factual, dense, and scannable.
3. **Zero Secret Leakage**: MUST redact all credentials, API keys, tokens, and sensitive personal data.
4. **Reference, Don't Duplicate**: MUST reference existing plans, diffs, ADRs, and transcripts via clickable links (`[file.ts#L10-L20](file:///path/to/file.ts#L10-L20)`); NEVER copy-paste raw content.
5. **Artifact Location**: MUST save the handoff document to `<appDataDir>/brain/<conversation-id>/handoff.md` or the OS temporary directory (`$TMPDIR` or `%TEMP%`). NEVER write handoff files into the workspace repo.

---

## Workflow

### 1. Inventory Conversation Topics
Analyze the conversation trajectory and extract 2–5 discrete candidate topics (e.g., *Feature implementation*, *Prototype benchmark*, *Pending bugfixes*).

### 2. Interactive Scope Selection
Call the `ask_question` tool with:
- **Question 1 (`is_multi_select: true`)**: *"Select conversation topics to include in the handoff:"* with candidate topic options.
- **Question 2 (`is_multi_select: false`)**: *"What is the primary mission / first action for the next agent session?"* with candidate next steps (incorporating any command arguments passed at invocation).

### 3. Populate Handoff Document
Fill the **Handoff Document Template** below using *only* the user-selected topics and confirmed mission.

### 4. Write Artifact & Present Link
Save the file to `<appDataDir>/brain/<conversation-id>/handoff.md` (or temp OS directory) and output the absolute clickable file link with a 1-sentence summary of the next agent's starting step.

---

## Handoff Document Template

```markdown
# Handoff Document

> **Session Focus:** <Confirmed goal for next session>  
> **Timestamp:** <Current ISO timestamp>  
> **Previous Conversation:** [<conversation-id>](conversation://<conversation-id>)

## 1. Immediate Next Step
- **First Action**: <Exact command, file edit, or verification step the next agent MUST execute first>.
- **Active Tier / Approval State**: <e.g., Tier 1 / Tier 3 Authorized>.

## 2. Scoped Context & Modified Files
- **Completed Outcomes**: <Concise bullet points of verified changes>.
- **Modified Files**:
  - [<file-1.ts#L10-L30>](file:///path/to/file-1.ts#L10-L30)
  - [<file-2.ts>](file:///path/to/file-2.ts)
- **Scratch / Repro Scripts**: `<path-to-scratch-script-if-any>`.

## 3. Key Decisions & Hard Constraints
- <Architectural decision / rejected approach and why>.
- <Environment or user-mandated constraint>.

## 4. Suggested Skills for Next Agent
- `<skill-name-1>`: <When/why to invoke>.
- `<skill-name-2>`: <When/why to invoke>.
```
