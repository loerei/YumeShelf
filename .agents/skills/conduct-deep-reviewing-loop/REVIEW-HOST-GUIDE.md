# Layer 2 Review Host Operational Guide & Execution Protocol

Unified operational instructions for Layer 2 Review Host to manage workspace isolation, route Layer 3 reviewers, negotiate tier batch gates, enforce DAG dependencies, and directly apply verified DA remediations.

---

## 1. Operating Architecture & Workspace Air-Gap

### 1.1 Workspace Layout
```text
<repo-root>/.scratch/deep-review/
├── host/                    # [HOST ONLY] Coordination artifacts (hidden from reviewers)
│   ├── State.md             # Machine-readable routing state (Verdict, Highest Modified Tier, PassCount, Untouched Reviewers)
│   ├── Analyzation.md       # Human/L1 analysis report (accepted issues & rationale)
│   └── Reviewer_Choice_Rationale.md
├── Context.md               # [PUBLIC] Initialized by Layer 1 (DA path, rules, criteria, static SP)
├── reports/                 # [REVIEWER OUTPUTS & GATING] Purged at pass starts; in-place sanitized
│   ├── <Role>.md            # Initial reviewer report & in-place sanitized report
│   ├── <Role>_Gated_Issues.md # Host gated issues (demands refinement/removal without suggestions)
│   └── <Role>_Explain.md    # Reviewer explanation with deeper/differing proof (if rejecting gate)
└── sandbox/                 # [DIAGNOSTIC SANDBOX] Inline probes & shadow modules (.scratch/deep-review/sandbox/<action>_<role>_*, shadow_*)
```

- **Information Air-Gap**: Reviewers MUST read only their assigned target DA, any cross-referenced Upstream DAs declared in `Context.md`, `.scratch/deep-review/Context.md`, and their designated `<Role>-REVIEWER-GUIDE.md`. Reviewers MUST NOT inspect `.scratch/deep-review/host/` or reports of other reviewers.
- **Context Freezing**: Layer 1 initializes `.scratch/deep-review/Context.md` at workflow start. Context files MUST remain strictly frozen during active reviewer execution.
- **Context Content Rules**:
  - **MUST Include**:
    - Target DA path(s).
    - `## Cross-Referenced DAs & Dependency Lineage` table:
      ```markdown
      ## Cross-Referenced DAs & Dependency Lineage
      | DA Path | Lineage Direction | Codebase Status | Domain Boundary & Contract Responsibility |
      | :--- | :---: | :---: | :--- |
      | `<path-to-da>` | `Upstream` | `Downstream` | `Implemented` | `Unimplemented` | <Explicit responsibility boundary> |
      ```
    - `## Active Modifiers` (e.g. `!PA`, `!WA`, `!SP<N>`).
    - Codebase rules path (`AGENTS.md`).
    - Task domain skill paths.
    - Objective user criteria.
    - Static `SP` threshold.
  - **MUST NOT Include**: Leading prompt questions, past reviewer scores, historical changelogs, or dynamic execution state (active round numbers, iteration counts, or current `PassCount`).

### 1.2 File Authoring Protocol
Reviewers and Host MUST use native `write_to_file` directly (without `ArtifactMetadata`) for all file creations (`.scratch/deep-review/sandbox/` probe scripts, `.scratch/deep-review/reports/<Role>.md`, `.scratch/deep-review/host/*.md`). Creating intermediate helper scripts (e.g. `write_report.cjs`, `.js`, `.ps1`) or embedding multi-line code inside `run_command` inline strings (`node -e`, `python -c`, `echo`, `pwsh`) to author text files is strictly prohibited.

### 1.3 Clean & Neutral Artifact Protocol (Anti-Anchoring)
When updating draft artifacts between iterations, integrate fixes directly into the specification as native first-class requirements:
- Strip review-iteration delta markers (e.g. `[UPDATED]`, `[FIXED]`, `[ADDED IN ROUND N]`, `[RESOLVED]`). Preserve standard `AGENTS.md` plan action tags (`[NEW]`, `[MODIFY]`, `[DELETE]`).
- Remove internal changelogs, version history tables (`v1.x`), or review feedback references.
- Normalize tone and detail level across all sections to eliminate defensive patching markers.

### 1.4 Cross-Referenced DA & Dependency Lineage Semantics
When evaluating a target DA with cross-referenced dependencies in `Context.md`, Host and reviewers MUST strictly follow these invariant semantics:
1. **`Upstream` + `Implemented`**: The existing codebase on disk is authoritative ground-truth. The target DA must cleanly integrate with existing implementations.
2. **`Upstream` + `Unimplemented` (Authoritative Future Baseline)**: Reviewers MUST read the upstream DA and treat its declared types, schemas, and seams as the authoritative future baseline:
   - **Anti-Bloat**: The target DA MUST NOT re-specify, duplicate, or expand features belonging to the upstream DA.
   - **Anti-Drift**: The target DA MUST strictly adhere to the data structures, types, and seams defined in the upstream DA without contradiction or incompatible divergence.
   - **Anti-False-Positive**: Reviewers MUST NOT flag missing codebase files or unimplemented methods as readiness defects if they are explicitly scheduled to be created by the upstream DA.
3. **`Downstream` + `Unimplemented`**: The target DA must expose clean extension points and domain seams, but MUST NOT tightly couple to or leak domain-specific logic of future downstream epics.

---

## 2. Invariant Reviewer Invocation Protocol

Host MUST summon Layer 3 subagents using this exact invariant template across all rounds:

```text
You are the <Role> Reviewer for Directive Artifact verification.
Target DA(s): <da_path(s)>
Domain Context: .scratch/deep-review/Context.md
Review Guide: <guide_path>
Output Path: .scratch/deep-review/reports/<Role>.md

Audit the target document(s) objectively from a clean-slate perspective. Follow your Review Guide and any domain subdocuments referenced within it strictly.
```

- **Dynamic Guide Resolution**: `<guide_path>` MUST be resolved dynamically relative to the active skill location (`.agents/skills/conduct-deep-reviewing-loop/<Role>-REVIEWER-GUIDE.md` in distributed projects or `productivity/conduct-deep-reviewing-loop/<Role>-REVIEWER-GUIDE.md` in central `myskills`).
- **Subdocument Progressive Disclosure**: Host passes only the primary `<Role>-REVIEWER-GUIDE.md` path. Reviewers autonomously load domain subdocuments referenced in their guide's routing table as needed via `view_file`.
- **Tool Metadata Rule**: Host MUST specify neutral tool metadata (`toolAction: "Summoning reviewer"`, `toolSummary: "Domain review"`) to prevent leaking phase/round names in subagent tool logs.
- **Banned Calling Tokens**: `Round`, `Sweep`, `Targeted`, `Re-verify`, `Re-audit`, `Fix`, `Pass`, `Iteration`, `Previous round`.

---

## 3. Dynamic DAG Hierarchy & Role Catalog

### 3.1 DAG Execution Sequence
Host executes Layer 3 reviewers in dependency order across the active selected roster:

| DAG Tier | Role | Prerequisite |
| :--- | :--- | :--- |
| **Layer 3.1** | `Architect` *(Mandatory Core)*, `Progress` | None |
| **Layer 3.2** | `Readiness`, `Security`, `DataMigration`, `Testability` | Layer 3.1 PASS |
| **Layer 3.3** | `Logic` *(Mandatory Core)*, `Edgecase`, `Performance`, `Observability` | Layer 3.2 PASS |
| **Layer 3.4** | `UXUI` | Layer 3.3 PASS |

- **Vacuous Tier Transition**: If all roles in a DAG tier are `EXCLUDED`, or if all active roles in the tier are skipped during an initial targeted pass (as upstream of `Highest Modified Tier` or listed under Untouched Reviewers in `host/State.md`), Host treats that tier as vacuously passed for the active targeted pass and immediately advances to the next tier.

### 3.2 Role Summoning Table

| Role Identifier | Guide Reference Path | Output Artifact Path |
| :--- | :--- | :--- |
| `Architect` | `<skill-root>/ARCHITECT-REVIEWER-GUIDE.md` | `.scratch/deep-review/reports/Architect.md` |
| `Progress` | `<skill-root>/PROGRESS-REVIEWER-GUIDE.md` | `.scratch/deep-review/reports/Progress.md` |
| `Readiness` | `<skill-root>/READINESS-REVIEWER-GUIDE.md` | `.scratch/deep-review/reports/Readiness.md` |
| `Security` | `<skill-root>/SECURITY-REVIEWER-GUIDE.md` | `.scratch/deep-review/reports/Security.md` |
| `DataMigration` | `<skill-root>/DATA-MIGRATION-REVIEWER-GUIDE.md` | `.scratch/deep-review/reports/DataMigration.md` |
| `Testability` | `<skill-root>/TESTABILITY-REVIEWER-GUIDE.md` | `.scratch/deep-review/reports/Testability.md` |
| `Logic` | `<skill-root>/LOGIC-REVIEWER-GUIDE.md` | `.scratch/deep-review/reports/Logic.md` |
| `Edgecase` | `<skill-root>/EDGECASE-REVIEWER-GUIDE.md` | `.scratch/deep-review/reports/Edgecase.md` |
| `Performance` | `<skill-root>/PERFORMANCE-REVIEWER-GUIDE.md` | `.scratch/deep-review/reports/Performance.md` |
| `Observability` | `<skill-root>/OBSERVABILITY-REVIEWER-GUIDE.md` | `.scratch/deep-review/reports/Observability.md` |
| `UXUI` | `<skill-root>/UXUI-REVIEWER-GUIDE.md` | `.scratch/deep-review/reports/UXUI.md` |

---

## 4. Host Step-by-Step Execution Workflow

### Step 0: Scope Analysis & Dynamic Roster Selection
- If `.scratch/deep-review/host/Reviewer_Choice_Rationale.md` exists (Round N+1): Load and preserve the active roster without re-evaluating exclusions.
- Else (Round 1): Inspect target DA scope, `Context.md`, and user criteria; write `.scratch/deep-review/host/Reviewer_Choice_Rationale.md`:
  ```markdown
  | Role Identifier | Selection Status (INCLUDED / EXCLUDED) | Technical Rationale |
  ```
  - `Architect` and `Logic` MUST ALWAYS be `INCLUDED` for every DA and cannot be excluded.
  - `Progress` MUST be `INCLUDED` for multi-phase/multi-ticket epics, roadmaps, or work-breakdown structures; `EXCLUDED` for single-ticket/simple plans.
  - Remaining 8 specialist roles are marked `INCLUDED` or `EXCLUDED` with concrete technical justification.

### Step 1: Workspace Preparation
- Purge all files in `.scratch/deep-review/reports/` (preserving intra-tier reports within an active pass).
- Ensure `.scratch/deep-review/sandbox/` is prepared for empirical reviewer simulations.
- Ensure no stale sibling `<da_stem>.bak.md` files exist for target DAs in `Context.md` before commencing Round 1.
- Validate `.scratch/deep-review/Context.md` (verifying target DA, dependency lineage table, active modifiers, and criteria) without overwriting criteria or `SP`.

### Step 2: DAG Routing & Targeted Execution
- **Targeted Round (Round N+1)**: If previous `host/State.md` recorded `Gate Verdict: ROUND_REVISION_NEEDED`:
  - Reset `PassCount = 0`.
  - Read `Highest Modified Tier` from previous `host/State.md`. If the line is missing, unparseable, or malformed, gracefully fallback to `Layer 3.1`.
  - Load `Untouched Reviewers` from `.scratch/deep-review/host/State.md`. If the section is missing, unparseable, or containing `*(None)*`, whitespace, or an empty table, gracefully fallback to an empty set ($\emptyset$), treating all active roles in affected tiers as targeted.
  - Determine affected roles per Section 5 Invalidation Matrix.
  - Summon affected roles on the updated static snapshot $S_N$.
- **Full Sweep Round (Round N+1)**: If previous `host/State.md` recorded `Gate Verdict: ROUND_PASS`:
  - Set `PassCount` to the parsed integer from `Current PassCount` in `host/State.md` (falling back to `PassCount = 1` if missing or unparseable), and run Full Sweep on the static DA across all active roles.
- **Initial Round (Round 1, when `host/State.md` is absent)**:
  - Initialize `PassCount = 0` and run Full DAG across all active roles (Tier 3.1 -> 3.2 -> 3.3 -> 3.4).

### Step 3: Subagent Execution & Single-Wave Summoning
- Host summons active Layer 3 subagents using the invariant template in Section 2.
- Parallel roles within the same DAG tier (e.g. `Logic`, `Edgecase`, `Performance`, `Observability` in Layer 3.3) MUST be launched simultaneously in a single `invoke_subagent` call.
- Host initializes tracking set `PendingTierRoles` containing all active roles in the tier batch, initializes per-role counter `ProbeCount[role] = 0`, and arms a 180s liveness check timer via `schedule(DurationSeconds=180, Prompt="Check on reviewers liveness", TimerCondition="any")`.
- **Asynchronous Reactive Wakeup Handling**:
  - If `.scratch/deep-review/reports/<Role>.md` exists on disk: Host removes that reviewer from `PendingTierRoles`.
  - If report does not exist on disk but message is an active confirmation: Host resets `ProbeCount[role] = 0`, does NOT remove reviewer from `PendingTierRoles`, re-arms timer, and continues waiting.
  - If `PendingTierRoles` is non-empty: Host re-arms the 180s timer, does NOT inspect reports or advance to Step 4, and ends turn to continue waiting.
- **Liveness Timer Expiry Escalation**:
  If 180s timer expires while `PendingTierRoles` is non-empty:
  1. Inspect subagents via `manage_subagents(Action="list")`.
  2. If a reviewer's state is `running`, Host MUST NOT send any message. Re-arm timer and let it continue working.
  3. If `idle` and report exists on disk: Treat as complete and remove from `PendingTierRoles`.
  4. If `idle` without report on disk:
     - `ProbeCount[role] == 0`: Host sends Probe 1 via `send_message` (`"Status probe: Detected idle state. If you have a running background script, check its status via manage_task. Once your audit is finished, write your report to .scratch/deep-review/reports/<Role>.md and notify Host."`), and sets `ProbeCount[role] = 1`.
     - `ProbeCount[role] == 1`: Host sends Probe 2 via `send_message` (`"Status probe (confirm active status immediately via send_message): Detected idle state. Once your audit is finished, write your report to .scratch/deep-review/reports/<Role>.md and notify Host."`), and sets `ProbeCount[role] = 2`.
     - `ProbeCount[role] >= 2` and reviewer remained idle with no confirmation: Host concludes reviewer is unrecoverable, inspects transcript/task logs, terminates it via `manage_subagents(Action="kill")`, resets `ProbeCount[role] = 0`, and respawns that specific reviewer.
  5. If `PendingTierRoles` remains non-empty, re-arm 180s timer and end turn.
- **Quota Interruption & Mid-Flight Resume**:
  When Host resumes execution following a quota interruption, server restart, or resume signal from Layer 1:
  1. Host inspects existing subagents via `manage_subagents(Action="list")`.
  2. For any role in `PendingTierRoles` without a report on disk:
     - **MANDATORY REVIVE**: If the reviewer's conversation ID exists, Host **MUST revive it** by sending a resume message via `send_message` (`"System resumed from interruption. Please continue your audit and write your report to .scratch/deep-review/reports/<Role>.md, then notify Host via send_message."`). Host **MUST NOT** call `manage_subagents(Action="kill")` and re-summon that role.
     - **Kill/Respawn Exception**: Only if the subagent conversation is completely missing from `manage_subagents(Action="list")` may Host summon a new subagent for that role. If after revival the subagent remains unrecoverable (exceeding Probe 2 liveness escalation), Host terminates it via `manage_subagents(Action="kill")` and respawns that specific reviewer.
  3. Re-arm 180s liveness check timer via `schedule(DurationSeconds=180, Prompt="Check on reviewers liveness", TimerCondition="any")` and end turn to await reactive wakeups.
- Only when `PendingTierRoles` is empty does Host proceed to Step 4.

### Step 4: Tier Batch Gate & Reviewer Negotiation
- Host evaluates Layer 3 reports strictly per **tier batch** (after all active roles in the current tier produce initial outputs).
- **Subagent Lifecycle Preservation & Process Teardown**: Host MUST NOT terminate reviewer subagents upon receiving initial reports. Reviewer subagents remain alive in the `idle` state throughout active tier batch negotiation so that `send_message` reaches existing subagents. Once a tier batch is fully resolved (all roles accepted as PASS, accepted as blocking REVISIONS NEEDED, or removed/sanitized), Host MUST terminate that tier's reviewer subagents via process control (`manage_subagents` with Action: `kill`) before advancing to the next tier (or triggering early suspension).
- **Triage Protocol per `HOW-TO-GATE.md`**:
  - **Fully Accepted**: All reported issues satisfy Ground-Truth and Macro Flow proofs with verified codebase citations. Host accepts report without messaging reviewer.
  - **Gated Issues**: Issues lacking proofs, citing non-existent APIs, breaking macro flow, violating boundary symmetry, or introducing intra-DA contradictions are marked GATED.
- **Gated Negotiation Loop**:
  1. Host records `GatingIssuedTimestamp = current_time`, invalidates any stale `.scratch/deep-review/reports/<Role>_Explain.md` on disk (via deletion or overwriting with empty content), and authors `.scratch/deep-review/reports/<Role>_Gated_Issues.md` for each affected role simultaneously per `HOW-TO-GATE.md`. Single top-level `## Required Reviewer Action` block at top of file, followed by `## Gated Issues`. Host MUST NOT suggest fix solutions or code snippets, and MUST NOT repeat action choices per individual issue.
  2. Host initializes `PendingGatedRoles` containing all gated roles in the tier batch, and initializes `ProbeCount[role] = 0`.
  3. Host notifies gated reviewers in a single wave via `send_message`, and arms a 180s liveness check timer via `schedule(DurationSeconds=180, Prompt="Check on gated reviewers liveness", TimerCondition="any")`.
  4. **Asynchronous Reactive Wakeup Handling**:
     - To de-queue a role from `PendingGatedRoles` during reactive wakeups, Host MUST verify that: (1) A newly authored `<Role>_Explain.md` exists on disk with modification timestamp strictly greater than gating issue (`mtime > GatingIssuedTimestamp`), OR (2) The file modification timestamp (`mtime`) of `<Role>.md` is strictly greater than `GatingIssuedTimestamp` (`mtime > GatingIssuedTimestamp`), OR (3) An explicit completion message confirming the update has been received from that reviewer's conversation ID via `send_message` subsequent to `GatingIssuedTimestamp`. Host MUST NOT check mere file existence of `<Role>.md`.
     - If reports not updated but message is active confirmation: Host resets `ProbeCount[role] = 0`, re-arms timer, and continues waiting.
     - If `PendingGatedRoles` is non-empty: Re-arm timer, do NOT inspect reports or trigger re-gating, and end turn to continue waiting.
  5. **Liveness Timer Expiry Escalation**:
     - If `running`: Send no message, re-arm timer.
     - If `idle`:
       - `ProbeCount[role] == 0`: Send Probe 1 (`"Status probe: Detected idle state. Once your gate response is finished, update .scratch/deep-review/reports/<Role>.md and notify Host."`), set `ProbeCount[role] = 1`.
       - `ProbeCount[role] == 1`: Send Probe 2 (`"Status probe (confirm active status immediately via send_message): Detected idle state. Once your gate response is finished, update .scratch/deep-review/reports/<Role>.md and notify Host."`), set `ProbeCount[role] = 2`.
       - `ProbeCount[role] >= 2` and idle with no confirmation: Terminate via `manage_subagents(Action="kill")`, reset `ProbeCount[role] = 0`, and respawn that specific reviewer by invoking `invoke_subagent` with explicit gating prompt parameters:
         `You are the <Role> Reviewer for Directive Artifact verification. Target DA(s): <da_path(s)>. Domain Context: .scratch/deep-review/Context.md. Review Guide: <guide_path>. Output Path: .scratch/deep-review/reports/<Role>.md. Your report was gated in .scratch/deep-review/reports/<Role>_Gated_Issues.md. Apply the Gate Response Protocol per HOW-TO-GATE.md to update your report.`
     - If `PendingGatedRoles` non-empty: Re-arm timer and end turn.
  - **Quota Interruption & Mid-Flight Resume**:
    When Host resumes execution following a quota interruption, server restart, or resume signal from Layer 1 during tier batch negotiation:
    1. Host inspects existing subagents via `manage_subagents(Action="list")`.
    2. For any role in `PendingGatedRoles` without updated reports on disk:
       - **MANDATORY REVIVE**: If the reviewer's conversation ID exists, Host **MUST revive it** by sending a resume message via `send_message` (`"System resumed from interruption. Please continue your gate response per .scratch/deep-review/reports/<Role>_Gated_Issues.md, update your report, and notify Host via send_message."`). Host **MUST NOT** call `manage_subagents(Action="kill")` and re-summon that role.
       - **Kill/Respawn Exception**: Only if the subagent conversation is completely missing from `manage_subagents(Action="list")` may Host respawn that specific reviewer. If after revival the subagent remains unrecoverable (exceeding Probe 2 liveness escalation), Host terminates it via `manage_subagents(Action="kill")` and respawns.
    3. Re-arm 180s liveness check timer via `schedule(DurationSeconds=180, Prompt="Check on gated reviewers liveness", TimerCondition="any")` and end turn to await reactive wakeups.
  - Only when `PendingGatedRoles` is empty does Host proceed to re-evaluate updated `<Role>.md` and `<Role>_Explain.md` reports.
  6. **Reviewer Response Actions**: Reviewers apply one of three actions per `HOW-TO-GATE.md` (Refine/Complete as Requested, Remove, or Reject Gating/Removal and Explain).
  7. **Re-Evaluation & Stale Defense Loop**:
     - If Host agrees: Stop ping-pong (no confirmation message needed).
     - If issue remains ungrounded or explanation in `<Role>_Explain.md` is stale without differing/deeper proof: Reviewer must accept removal or refine into abstract spec; reviewer MUST NOT re-assert stale arguments. Host updates `.scratch/deep-review/reports/<Role>_Gated_Issues.md` via `write_to_file` detailing why previous explanation was rejected as stale, refreshes `GatingIssuedTimestamp = current_time`, invalidates stale `<Role>_Explain.md`, re-populates `PendingGatedRoles` with re-gated roles, resets `ProbeCount[role] = 0` for each re-gated role, sends notifications via `send_message`, re-arms 180s timer, and awaits response.
  8. **Gating Artifact Cleanup**: When Host accepts an updated role report, Host deletes `<Role>_Gated_Issues.md` and any `<Role>_Explain.md` for that role (idempotently handling missing files).
- Once all roles in the tier batch are resolved, Host terminates that tier's reviewer subagents via process control (`manage_subagents` with Action: `kill`) and advances to the next tier (or triggers early suspension if any role retains accepted blocking defects).

### Step 5: Early Suspension
If a tier returns `REVISION NEEDED` after tier batch gate resolution (i.e. if any active role in the resolved tier retains accepted blocking defects), reset `PassCount = 0`, terminate all remaining active reviewer subagents via process control (`manage_subagents` with Action: `kill`), cancel downstream tiers for that round, and transition directly to Step 7.

### Step 6: Snapshot Delta Backfill & Full Sweep Clearance Gate
- When all active roles in the current pass clear with zero blocking defects (either via Full DAG execution or Targeted pass on snapshot $S_N$):
  - **Snapshot Delta Backfill**: If un-evaluated active roles exist on snapshot $S_N$ (skipped upstream roles or untouched reviewers from `host/State.md`), summon ONLY those skipped roles in topological DAG sequence on snapshot $S_N$, preserving intra-round reports in `reports/` and enforcing early tier suspension if any role returns `REVISION NEEDED`.
  - **Full Sweep Clearance Check**: Once 100% of active roles in the frozen roster have audited and passed snapshot $S_N$ with zero blocking defects:
    - Increment `PassCount += 1`.
    - If `PassCount < SP`: Transition directly to Step 7 with `Gate Verdict: ROUND_PASS`.
    - If `PassCount >= SP`: Transition directly to Step 7 with `Gate Verdict: FINAL_PASS`.

### Step 7: Reporting, Direct DA Mutation & Teardown
When terminating or concluding a round, execute this transactional sequence:

#### Direct DA Mutation Transaction (When verdict is ROUND_REVISION_NEEDED):
1. **Pre-Mutation Backups**: Host creates temporary sibling `<da_stem>.bak.md` copies (replacing trailing `.md` with `.bak.md` in its parent directory, e.g. `<dirname>/<stem>.bak.md`, matching `Context.md` -> `Context.bak.md`) before mutating any target DA. If WBS restructuring deletes a DA file, Host copies it to `<da_stem>.bak.md` before physical deletion. If WBS restructuring alters `## Target Directive Artifacts` in `Context.md`, Host creates `.scratch/deep-review/Context.bak.md`.
2. **In-Place DA Mutation**:
   - Host directly applies verified remediations from accepted `<Role>.md` reports into target Directive Artifact(s) using Clean & Neutral Artifact Protocol (§1.3).
   - **Boundary Contract Symmetry & Coherence Verification**: Host verifies that boundary modifications include symmetrical updates across internal endpoints, and that dependent sections (e.g. `Verification Plan` test assertions) are synchronized per `HOW-TO-GATE.md`.
   - **DA File Tree Synchronization**: If accepted feedback splits, merges, creates, or deletes DA files (e.g. Progress Reviewer WBS actions), Host directly creates/restructures the files on disk and updates `## Target Directive Artifacts` in `.scratch/deep-review/Context.md`.
3. **Write Verification & Abort Recovery**: Host verifies on disk that all DA mutations and restructured files were successfully written and are non-empty.
   - **Verification Failure Recovery**: If write verification fails (file missing, write error, or 0 bytes):
     1. If `.scratch/deep-review/Context.bak.md` is present: identify newly created DA files (in active `Context.md` but absent in `Context.bak.md`) and delete them; restore `Context.md` from `Context.bak.md` and delete `Context.bak.md`.
     2. For every target DA listed in restored `Context.md`: restore from its sibling `<da_stem>.bak.md` file (if present) and delete the backup file.
     3. Delete any remaining orphaned sibling `<da_stem>.bak.md` backup files.
     4. Terminate active reviewer subagents via `manage_subagents(Action="kill")`.
     5. Author `host/State.md` with `- **Gate Verdict**: ABORTED_MUTATION_FAILURE` and author `host/Analyzation.md` detailing the error and affected paths, notify Layer 1 via `send_message`, and halt execution without issuing `ROUND_REVISION_NEEDED`.
   - **Verification Success**:
     - If `!PA` / `!WA` is active: Retain `<da_stem>.bak.md` and `Context.bak.md` for Layer 1 quota pause, diff review, and user rollback.
     - If `!PA` / `!WA` is NOT active: Host immediately purges the temporary `<da_stem>.bak.md` and `Context.bak.md` backup files before concluding the round.

#### Coordination Artifacts & Process Teardown (All Verdicts):
4. **Author Coordination Artifacts**:
   - **`State.md`**: Author `.scratch/deep-review/host/State.md` containing Executive Summary state and `## Untouched Reviewers` table per `HOW-TO-GATE.md` (enforcing `Current PassCount: 0 / <SP>` whenever verdict is `ROUND_REVISION_NEEDED`).
   - **`Analyzation.md`**: Author `.scratch/deep-review/host/Analyzation.md` containing:
     - Executive Summary header:
       - `- **Gate Verdict**: ROUND_REVISION_NEEDED | ROUND_PASS | FINAL_PASS | ABORTED_MUTATION_FAILURE`
       - `- **Current PassCount**: <N> / <SP>`
       - `- **Active Roster**: <List of active roles>`
       - `- **Highest Modified Tier**: Layer 3.X` (Mandatory when verdict is `ROUND_REVISION_NEEDED`)
     - **Accepted Issues Only**: List of accepted blocking defects across active roles with technical acceptance rationale. Zero rejected/gated tables. If all active roles cleared with zero defects, record `*(None - All active roles cleared with zero blocking defects)*`.
5. **Process Teardown & Workspace State Preservation**:
   Host terminates active reviewer subagents via process control (`manage_subagents(Action="kill")`), sends a completion message to Layer 1 (parent agent) via `send_message` reporting the Gate Verdict and referencing `.scratch/deep-review/host/State.md` and `Analyzation.md`, and concludes execution:
   - **Intermediate Revision Teardown (`ROUND_REVISION_NEEDED`)**: Preserve `host/State.md` (and `host/Analyzation.md` for Layer 1 inspection). Note that Layer 1 deletes `host/Analyzation.md` prior to launching Round N+1 to eliminate cognitive anchoring.
   - **Round Pass Teardown (`ROUND_PASS`)**: Purge `reports/` and transient gating artifacts. Preserve `host/State.md` (and `host/Analyzation.md` for Layer 1 inspection). Layer 1 deletes `host/Analyzation.md` prior to launching next round.
   - **Final Pass Teardown (`FINAL_PASS`)**: Purge `reports/` and transient gating artifacts, preserve `host/State.md` and `host/Analyzation.md` for Layer 1 final presentation. Layer 1 executes final purge of `.scratch/deep-review/*` after presenting verified DA.
   - **Abort Recovery Teardown (`ABORTED_MUTATION_FAILURE`)**: Preserve `host/State.md` and `host/Analyzation.md` for Layer 1 handoff, and conclude execution.

---

## 5. Invalidation Matrix & Targeted Re-Review

When Host applies verified mutations to the Directive Artifact, the DA transitions to a new static snapshot $S_N$. The smallest scheduling unit is the **individual Reviewer**:
1. Host identifies the `Highest Modified Tier` recorded in `host/State.md` (falling back to `Layer 3.1` if missing or malformed) and its downstream tiers.
2. Host loads `Untouched Reviewers` from `.scratch/deep-review/host/State.md` and filters out all untouched reviewers from the immediate pass (treating `*(None)*` as empty set $\emptyset$).
3. Host summons only the affected reviewers in topological DAG sequence, while registering untouched reviewers into the pending backfill queue for snapshot $S_N$:

| Highest Modified Tier | Targeted Roles Run on Snapshot $S_N$ | Skipped Roles Pending Backfill (Upstream + Untouched) |
| :--- | :--- | :--- |
| **Layer 3.1 (Architectural & Phasing)** | Active 3.1 to 3.4 Roles $\setminus$ Untouched Roles | Untouched 3.1 to 3.4 Roles |
| **Layer 3.2 (Readiness / Security / DataMigration / Testability)** | Active 3.2 to 3.4 Roles $\setminus$ Untouched Roles | Active Layer 3.1 Roles + Untouched 3.2-3.4 Roles |
| **Layer 3.3 (Logic / Edgecase / Performance / Observability)** | Active 3.3 to 3.4 Roles $\setminus$ Untouched Roles | Active Layer 3.1 & 3.2 Roles + Untouched 3.3-3.4 Roles |
| **Layer 3.4 (UX/UI)** | Active 3.4 Roles $\setminus$ Untouched Roles | Active Layer 3.1 to 3.3 Roles + Untouched 3.4 Roles |

---

## 6. Modifier Commands Matrix

| Tag | Parameter | Timing | System Behavior |
| :--- | :--- | :--- | :--- |
| `!SP<N>` | N (Integer >= 1) | Start-time | Sets required continuous Full Sweep PASS threshold `SP = N`. |
| `!PA` / `!WA` | None | Start-time / Mid-flight | Pre-review pause gate: When Host issues `ROUND_REVISION_NEEDED`, Host retains sibling `<da_stem>.bak.md` copies and applies verified mutations directly to DA files. Main Agent stops execution before triggering Round N+1, prompts user to verify API quota or review diff against `<da_stem>.bak.md`, and awaits keyword `"C"` to clean backup files, delete `host/Analyzation.md`, and proceed to Round N+1 (or executes rollback per `SKILL.md` if user requests revert). If invoked mid-flight, Layer 1 updates `## Active Modifiers` in `Context.md`. Remains persistent across all rounds until `FINAL_PASS`. |
| `!FPA` | None | Mid-flight | Instantly kills running subagent via process control, discards outputs, pauses loop. |
