# System Protocol & Anti-Anchoring Specifications

Rules governing execution, context isolation, invalidation routing, and artifact updates in `conduct-deep-reviewing-loop`.

## 1. Clean & Neutral Artifact Protocol (Anti-Anchoring)

When updating draft artifacts between iterations, integrate fixes directly into the specification as native first-class requirements.

### DA Sanitization Checklist (Before Invoking Reviewers)
- [ ] Strip review-iteration delta markers (e.g. `[UPDATED]`, `[FIXED]`, `[ADDED IN ROUND N]`, `[RESOLVED]`). Preserve standard `AGENTS.md` plan action tags (`[NEW]`, `[MODIFY]`, `[DELETE]`).
- [ ] Remove internal changelogs, version history tables (`v1.x`), or review feedback references.
- [ ] Normalize tone and detail level across all sections to eliminate defensive patching markers.

## 2. Workspace Air-Gap & Context Freezing Protocol

### Workspace Layout
```text
scratch/deep_review/
├── host/                    # [HOST ONLY] Analyzation.md, Changelog.md (hidden from reviewers)
├── Context.md               # [PUBLIC] Initialized by Layer 1 (DA path, rules, criteria, static SP)
└── reports/                 # [REVIEWER OUTPUTS] Purged at pass starts; static overwrite (<Role>.md)
```

Reviewers MUST read only their assigned target DA and `scratch/deep_review/Context.md`. Reviewers MUST NOT inspect `scratch/deep_review/host/` or reports of other reviewers.

Layer 1 initializes `scratch/deep_review/Context.md` at workflow start. Context files MUST remain frozen during active reviewer execution.

### Context Content Rules

- **MUST Include**: Target DA path, codebase rules path (`AGENTS.md`), task domain skill paths, objective user criteria, static `SP` threshold.
- **MUST NOT Include**: Leading prompt questions, past reviewer scores, historical changelogs, or dynamic execution state (active round numbers, iteration counts, or current `PassCount`).

## 3. Invariant Reviewer Invocation Protocol

Host MUST summon Layer 3 subagents using this exact invariant template across all rounds:

```text
You are the <Role> Reviewer for Directive Artifact verification.
Target DA: <da_path>
Domain Context: scratch/deep_review/Context.md
Review Guide: <guide_path>
Output Path: scratch/deep_review/reports/<Role>.md

Audit the target document objectively from a clean-slate perspective. Follow your Review Guide strictly.
```

- `<guide_path>` MUST be resolved dynamically relative to the active skill location (`.agents/skills/conduct-deep-reviewing-loop/<Role>-REVIEWER-GUIDE.md` in distributed projects or `productivity/conduct-deep-reviewing-loop/<Role>-REVIEWER-GUIDE.md` in central `myskills`).
- **Tool Metadata Rule**: Host MUST specify neutral tool metadata (`toolAction: "Summoning reviewer"`, `toolSummary: "Domain review"`) to prevent leaking phase/round names in subagent tool logs.
- **Banned Calling Tokens**: `Round`, `Sweep`, `Targeted`, `Re-verify`, `Re-audit`, `Fix`, `Pass`, `Iteration`, `Previous round`.

## 4. Dynamic DAG Execution Sequence

Host executes Layer 3 reviewers in dependency order:

| DAG Tier | Role | Prerequisite |
| :--- | :--- | :--- |
| **Layer 3.1** | Architect / Problem-Solving Director | None |
| **Layer 3.2** | System Readiness Reviewer, Security Reviewer | Layer 3.1 PASS |
| **Layer 3.3** | General Logic Reviewer, Edgecase Detector | Layer 3.2 PASS |
| **Layer 3.4** | UX/UI Reviewer | Layer 3.3 PASS |

If any layer returns `REVISION NEEDED`, suspend remaining downstream layers for the current round.

## 4. Invalidation Matrix & Targeted Re-Review

When Layer 1 applies `Changelog.md` edits, identify the highest modified DAG tier. Host executes only the invalidated and downstream tiers during intermediate rounds:

| Highest Modified Tier | Roles Run in Round N+1 | Skipped Roles (Cached PASS) |
| :--- | :--- | :--- |
| **Layer 3.1 (Architectural)** | All Roles (3.1, 3.2, 3.3, 3.4) | None (Full DAG Invalidation) |
| **Layer 3.2 (Readiness / Security)** | 3.2, 3.3, 3.4 | Layer 3.1 (Architect) |
| **Layer 3.3 (Logic / Edgecase)** | 3.3, 3.4 | Layer 3.1, Layer 3.2 |
| **Layer 3.4 (UX/UI)** | 3.4 | Layer 3.1, Layer 3.2, Layer 3.3 |

## 5. Full Sweep Gate & `!SP` Threshold

Targeted re-review rounds do NOT count toward the `!SP` pass counter.

- **Triggering Full Sweep**: When all active targeted roles return PASS, Host MUST run a **Full Sweep Round** (all 6 roles auditing the static DA snapshot).
- **Pass Counter (`PassCount`)**:
  - Increments by 1 ONLY when an unbroken Full Sweep round passes with zero blocking issues across all 6 roles.
  - Resets to 0 if any role in any round returns `REVISION NEEDED`.
- **Final Verdict**: Host issues `FINAL_PASS` ONLY when `PassCount >= SP`.

## 6. Modifier Commands Matrix

| Tag | Parameter | Timing | System Behavior |
| :--- | :--- | :--- | :--- |
| `!SP<N>` | N (Integer >= 1) | Start-time | Sets required continuous Full Sweep PASS threshold `SP = N`. |
| `!PA` | None | Mid-flight | Pauses loop after Layer 1 applies `Changelog.md` edits; awaits user command to proceed. |
| `!FPA` | None | Mid-flight | Instantly kills running subagent via process control, discards outputs, pauses loop. |
