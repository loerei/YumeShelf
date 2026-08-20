# Write Skill DTTC Reference & Case Studies

Detailed case studies comparing raw Human-in-the-Loop (HITL) UX friction against standardized Domain Terms and Tag Commands (DTTC) solutions, drawn from [`conduct-reviewing-loop`](file:///d:/Projects/myskills/productivity/conduct-reviewing-loop/SKILL.md).

---

## Case Studies: Context -> Bad Approach vs Good DTTC Solution

### Case Study 1: Pass-Count Threshold Override (Start-Time Tag)

#### Context
A review loop skill defaults to requiring `1` reviewer PASS to conclude. For high-risk architecture plans or critical code refactors, the user wants to enforce a strict multi-reviewer consensus threshold (requiring `N` continuous PASSes from independent subagents, resetting to `0` if any reviewer requests revisions).

#### Bad Approach (High UX Friction)
- **User Action**: Typing verbose, conversational instructions at launch:
  > *"Run the review loop, but don't stop after the first PASS. Make sure at least 2 independent subagents review it sequentially. If any subagent finds an issue, fix it and reset the count so 2 subagents PASS in a row before stopping."*
- **UX Friction Points**:
  - High typing volume for a recurring configuration choice.
  - Risk of AI ambiguity (AI might misunderstand whether the count resets on failure or just sums up total PASSes).

#### Good Approach (Standardized DTTC Tag Solution)
- **DTTC Tag Design**: `!SP<N>` (*Set Pass-count Threshold*)
  - **Syntax**: `!SP<N>` (Default: `1`)
  - **Timing**: Start-time tag
  - **User Invocation**: `/conduct-reviewing-loop !SP2`
- **Agent Action**: Automatically sets `SP = 2`, requiring 2 unbroken continuous PASSes before declaring `Final PASS`.

---

### Case Study 2: Mid-Flight Prompt Revision (Mid-Flight Control Tag)

#### Context
During an active multi-iteration review loop, the user realizes a critical domain constraint (e.g. OWASP security checklist) was omitted from the active reviewer prompt. The user needs to inject new instructions into the prompt for all subsequent reviewers without restarting the entire session.

#### Bad Approach (High UX Friction)
- **User Action**: Typing manual intervention instructions mid-loop:
  > *"Wait, stop! Go back and edit the reviewer prompt file in scratch to include OWASP security checks. Show me the prompt again, let me approve it, and then spawn the next reviewer using the new prompt."*
- **UX Friction Points**:
  - Complex manual instructions required mid-flight.
  - Potential breaking of prompt versioning or accidental contamination of active prompt files.

#### Good Approach (Standardized DTTC Tag Solution)
- **DTTC Tag Design**: `!PU [Instructions]` (*Prompt Update*)
  - **Syntax**: `!PU [Instructions/Criteria]`
  - **Timing**: Mid-flight control tag
  - **User Invocation**: `!PU Add OWASP top 10 security checks`
- **Agent Action**: Advances prompt version to $v(\text{Version}+1)$, writes `scratch/reviewer_prompt_v<Version+1>.md`, presents it for user confirmation (`"Conduct?"`), and freezes it as the active prompt upon approval.

---

### Case Study 3: Inspecting Fixes Before Resuming (Mid-Flight Control Tag)

#### Context
In an iterative review loop, after a reviewer returns `STATUS: REVISIONS NEEDED`, the main agent applies fixes to the target draft or code. The user wants to inspect the applied fixes before the agent automatically spawns the next blind reviewer.

#### Bad Approach (High UX Friction)
- **User Action**: Interrupting or constantly asking the agent to pause:
  > *"After you fix the issues raised by Reviewer #1, don't spawn Reviewer #2 right away. Stop and show me what lines you changed first, then wait for me to say go."*
- **UX Friction Points**:
  - Requires user to predict when fixes are applied and manually intervene.
  - Risk of agent rushing into the next subagent spawn before user can inspect changes.

#### Good Approach (Standardized DTTC Tag Solution)
- **DTTC Tag Design**: `!PA` (*Pause After*)
  - **Syntax**: `!PA`
  - **Timing**: Mid-flight control tag
  - **User Invocation**: `!PA` (can be passed at launch or mid-flight)
- **Agent Action**: Applies fixes per current reviewer feedback, pauses execution, presents summary of changes, and awaits explicit user resume command before spawning reviewer $N+1$.

---

## Tag Worthiness Test & Anti-Inflation Heuristics

To prevent **Tag Inflation** (bloating `SKILL.md` with unnecessary tags that consume context load and increase user cognitive burden), evaluate every candidate tag against the **Tag Worthiness Test**:

### Evaluation Matrix

| Candidate Tag | Criterion Checked | Decision | Rationale |
| :--- | :--- | :---: | :--- |
| `!SP<N>` | High repetition + Parameter override | **APPROVED** | Overrides numeric pass threshold cleanly without changing workflow logic. |
| `!PU [Text]` | High repetition + Mid-flight prompt adjustment | **APPROVED** | Automates complex prompt file versioning & confirmation gate in 1 concise tag. |
| `!CR` (*Create Report*) | Low savings + One-off action | **REJECTED** | Saves only 5 keystrokes vs "Write report". Requires complex context explanations. |
| `!CS` (*Change Strategy*) | Protocol alteration | **REJECTED** | Mutates primary decision tree of the skill. Must be expressed via explicit prompt instructions instead. |
| `!NL` (*No Logging*) | Infrequent edge case | **REJECTED** | Rarely used flag. Adding it inflates context load permanently for all standard runs. |

---

## Anti-Pattern Checklist for DTTC Design

| Anti-Pattern | Description | Remediation |
| :--- | :--- | :--- |
| **Over-engineered Tag Names** | Using verbose tag names like `!SET_PASS_COUNT_THRESHOLD` | Use 2-3 letter uppercase tags (e.g. `!SP`, `!PU`, `!PA`) |
| **Case-Sensitive Hardcoding** | Failing to accept lower-case inputs (`!sp2` throwing error) | Make tag parser case-insensitive (`!sp` matches `!SP`) |
| **Missing Default Value** | Mandatory argument required even for standard runs | Always specify sensible default (e.g. `Default: 1`) |
| **Ambiguous Agent Action** | Vague action description like *"Agent adjusts settings"* | Write explicit step-by-step agent instructions |
