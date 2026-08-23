# System Protocol & Anti-Anchoring Specifications

Rules governing execution, context isolation, invalidation routing, and artifact updates in `conduct-deep-reviewing-loop`.

## 1. Clean & Neutral Artifact Protocol (Anti-Anchoring)

When updating draft artifacts between iterations, integrate fixes directly into the specification. NEVER include past reviewer names, version tags, or review notes inside the document body.

## 2. Context Freezing Protocol

Layer 2 Host writes `scratch/deep_review/Context.md` once at round start. Context files MUST remain frozen during active reviewer execution.

### Context Content Rules

- **MUST Include**: Target DA path, codebase rules path (`AGENTS.md`), task domain skill paths, objective user criteria.
- **MUST NOT Include**: Leading prompt questions, past reviewer scores, historical changelogs, or opinions from previous rounds.

## 3. Dynamic DAG Execution Sequence

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
