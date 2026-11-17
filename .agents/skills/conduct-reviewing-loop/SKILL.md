---
name: conduct-reviewing-loop
description: Use when running iterative single-reviewer loops on draft plans (Mode A) or code diffs (Mode B).
---

# Conduct Reviewing Loop

Run iterative, independent subagent reviews to stress-test plans (pre-implementation) or validate codebase diffs against approved specifications (post-implementation) against explicit user and system criteria.

## Dual-Mode Architecture & Workflows

```mermaid
flowchart TD
    Start["Start Review Loop<br/>(Version = 1, PassCount = 0, SP = !SP or 1)"] --> ModeSelect{"Select Review Mode"}
    
    ModeSelect -->|"Mode A (Pre-Implementation)"| ModeA["Mode A: Design & Plan Audit<br/>(Refine unapproved draft plan/spec)"]
    ModeSelect -->|"Mode B (Post-Implementation)"| ModeB["Mode B: Implementation Validation<br/>(Audit code .diff against approved plan)"]

    ModeA --> SynthA["1. Synthesize Criteria & Task Domain Skills"] --> PrepDraftA["2. Identify/Prepare Target Draft"] --> ReadRefA["3. Read MODE-A-DESIGN-AUDIT.md"] --> SavePromptV["4. Save Prompt to scratch/reviewer_prompt_v1.md"]
    
    ModeB --> SynthB["1. Synthesize Coverage Verification Checklist"] --> GenDiff["2. Generate scratch/patch_changes.diff"] --> ReadRefB["3. Read MODE-B-CODE-VALIDATION.md"] --> SavePromptV
    
    SavePromptV --> UserGateV{"5. User Confirms Prompt?<br/>(Keyword: 'Conduct?')"}
    UserGateV -->|"Confirmed ('Conduct?')"| FreezeV["6. Freeze Prompt as Active Prompt"]
    UserGateV -->|"Prompt Feedback / !PU"| RefinePrompt["Refine Prompt"] --> SavePromptV
    
    FreezeV --> BlindSpawn["7. Spawn Independent Reviewer #N (Using Active Frozen Prompt)"]
    BlindSpawn --> CritEval{"8. Critical Evaluation of Feedback (Main Agent)"}
    
    CritEval -->|"Valid Edits Needed"| ResetPass["Reset PassCount = 0"] --> CheckExc{"New User Request / New Spec / !PU?"}
    
    CheckExc -->|"No (Standard Fix)"| ApplyFix["Apply fixes (Mode A: Draft / Mode B: Code)"] --> CheckPA{"!PA Active AND Not Final PASS?"}
    CheckExc -->|"Yes (!PU / Exception)"| IncVer["Version = Version + 1"] --> SavePromptNew["Save scratch/reviewer_prompt_v{Version}.md"] --> UserGateNew{"User Confirms Prompt?<br/>(Keyword: 'Conduct?')"}
    UserGateNew -->|"Confirmed ('Conduct?')"| FreezeNew["Freeze v{Version} as Active Prompt"] --> ApplyFix
    UserGateNew -->|"Keep Previous"| KeepPrev["Keep Previous Active Prompt"] --> ApplyFix

    CheckPA -->|"Yes (!PA Set)"| PauseLoop["PAUSE: Report Edits & Await User Resume"]
    CheckPA -->|"No"| BranchMode{"Mode?"}
    PauseLoop -->|"User Resumes"| BranchMode

    BranchMode -->|"Mode B"| Regendiff["Re-generate .diff"] --> NextIter["Iteration N = N + 1"] --> BlindSpawn
    BranchMode -->|"Mode A"| NextIter

    CritEval -->|"STATUS: PASS"| PassCounter{"PassCount = PassCount + 1<br/>PassCount >= SP?"}
    PassCounter -->|"Yes (Final PASS)"| Present["9. Present Verified Final Output"]
    PassCounter -->|"No (Not Final PASS)"| CheckPA{"!PA Active AND Not Final PASS?"}

    CritEval -->|"All Points Evaluated Invalid"| JustifyUser["Document Exclusions & Report to User"] --> UserGateFinal{"User Approves Rationale?"}
    UserGateFinal -->|"Approved"| Present
    UserGateFinal -->|"User Rejects Rationale"| ResetPass

    UserFPA["User sends !FPA Mid-Loop"] -.->|"Emergency Signal"| KillReviewer["Kill Running Reviewer #N Subagent<br/>& Discard Feedback"] -.-> PauseLoopEmergency["PAUSE: Emergency Stop & Await User Instructions"]
```

### 1. Mode Selection & Review Matrix

| Mode | Target Artifacts | Primary Goal | Reviewer Action | Termination Condition |
| :--- | :--- | :--- | :--- | :--- |
| **Mode A: Design & Plan Audit** *(Pre-Implementation)* | Draft `implementation_plan.md`, PRD, Skill RFC | Discover architectural gaps, edge cases, and design flaws before coding | Output numbered edits to the **draft document** | `Final PASS` ($\text{PassCount} = \text{SP}$) or User-Approved Invalid Rationale |
| **Mode B: Implementation Validation** *(Post-Implementation)* | Approved Plan + `.diff` Artifact + Modified Code/Tests | Verify 100% plan coverage, zero regressions, and full spec compliance | Output numbered missing plan items or defects in the **codebase** | `Final PASS` ($\text{PassCount} = \text{SP}$) or User-Approved Invalid Rationale |

### 2. Reviewer Loop Protocol (Blind Protocol & Approval Gate)

> [!IMPORTANT]
> **Prompt Persistence & Approval Gate Protocol**:
> 1. **Synthesize Task Domain Skills & Read Templates**: Read `MODE-A-DESIGN-AUDIT.md` (Mode A) or `MODE-B-CODE-VALIDATION.md` (Mode B) using your native file-reading tool. Under `Required Reading` in the synthesized reviewer prompt, include 1-2 matching `<Role>-REVIEWER-GUIDE.md` files from `../conduct-deep-reviewing-loop/` (Mode A, with output/workspace override) or `<skill_dir>/REVIEWER-CODE-VALIDATION.md` + `<skill_dir>/REVIEWER-ANTI-LAZINESS.md` (Mode B), alongside task domain skills. NEVER pass `SKILL.md`, `MODE-A-DESIGN-AUDIT.md`, or `MODE-B-CODE-VALIDATION.md` to Subagents.
> 2. **Save Prompt & `.diff`**: Save every reviewer prompt to `<scratch_dir>/reviewer_prompt_v<Version>.md`. In Mode B, generate `<scratch_dir>/patch_changes.diff` per `MODE-B-CODE-VALIDATION.md` §3 and re-generate it after each fix round (keeping the approved plan immutable).
> 3. **Initial User Approval Gate (Disambiguated)**: Present `<scratch_dir>/reviewer_prompt_v1.md` to the user and **AWAIT EXPLICIT KEYWORD "Conduct?"** (or *"Conduct review"*) before spawning Reviewer #1. *Do NOT ask using "Approve" or "Proceed" for prompt authorization to prevent lower-tier models from confusing prompt confirmation with direct Tier 3 plan/source approval.*
> 4. **Immutable Active Prompt Reuse**: Freeze the approved prompt as Active Prompt ($P_{active}$) and reuse it 100% identically for subsequent reviewers (#2, #3... #N), changing only the Reviewer ID.
> 5. **Prompt Revision Exception (v1 $\rightarrow$ vN)**: Prompt updates (`reviewer_prompt_v<Version>.md`) are permitted ONLY if triggered by `!PU`, explicit user instructions, a newly discovered High-Level Specification, or user-approved exclusions/non-goals (Mode B), all requiring user confirmation (*"Conduct?"*).
> 6. **Preventing Blind Reviewer Deadlocks**: Record user-approved rejected suggestions under **Out-of-Scope / Non-Goals** in the draft (Mode A) or in `reviewer_prompt_v<Version>.md` (Mode B) so subsequent blind reviewers do not re-raise them.
> 7. **Clean & Neutral Artifact Rule (Anti-Anchoring)**: Integrate Mode A draft updates seamlessly as native specifications without past reviewer references, reviewer-based version tags, or meta-changelogs.

> [!WARNING]
> **Critical Evaluation & Non-Blocking Churn Guard (Main Agent Gatekeeper)**: Evaluate reviewer feedback critically against YAGNI, empirical codebase facts, and repository rules (`AGENTS.md`).
> - **Non-Blocking Churn Guard**: Items listed under `Suggestions for Improvement (Optional / Non-blocking)` do NOT affect `STATUS: PASS`. The Main Agent **MUST NOT** edit the draft plan, modify codebase files, or reset `PassCount` based on non-blocking suggestions unless the user explicitly commands it.

## Subdoc References

- **Main Agent Orchestration Guides**: [MODE-A-DESIGN-AUDIT.md](MODE-A-DESIGN-AUDIT.md) (Mode A), [MODE-B-CODE-VALIDATION.md](MODE-B-CODE-VALIDATION.md) (Mode B).
- **Subagent Reviewer Rubrics**: Mode A uses 1-2 matching `<Role>-REVIEWER-GUIDE.md` files from `../conduct-deep-reviewing-loop/`; Mode B uses [REVIEWER-CODE-VALIDATION.md](REVIEWER-CODE-VALIDATION.md) and [REVIEWER-ANTI-LAZINESS.md](REVIEWER-ANTI-LAZINESS.md).

## Domain Terms and Modifiers

- **`PassCount`**: Consecutive `STATUS: PASS` evaluations; resets to `0` on `STATUS: REVISIONS NEEDED`. `Final PASS` completes the loop when $\text{PassCount} = \text{SP}$.
- **`Active Prompt`**: The frozen, user-approved prompt file (`<scratch_dir>/reviewer_prompt_v<Version>.md`) reused identically across blind reviewers.

| Modifier | Timing | Action |
| :--- | :--- | :--- |
| `!SP<N>` | Start-time | Sets continuous `PASS` threshold `SP = N` (default: `1`). |
| `!PU [Instructions]` | Mid-flight | Increments prompt version, writes `<scratch_dir>/reviewer_prompt_v<Version+1>.md`, awaits `"Conduct?"`, and freezes it as Active Prompt. |
| `!PA` | Mid-flight | Pauses after applying valid fixes, reports edit summary, and awaits user resume before Reviewer #N+1 (skipped on `Final PASS`). |
| `!FPA` | Mid-flight | Terminates the active reviewer subagent immediately, discards pending feedback, prevents edits, and pauses awaiting user instructions. |
