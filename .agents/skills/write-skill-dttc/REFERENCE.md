# Reference: Write Skill DTTC Criteria & Anti-Patterns

## 1. Tag Worthiness Criteria

Approve a candidate tag ONLY if it meets **both** conditions:
- **High Frequency or Mid-Flight Need:** Overrides a recurring numeric/mode threshold at launch, or safely adjusts execution mid-flight without restarting.
- **No Workflow Mutation:** Tunes parameters or pause/resume gates within the existing workflow; NEVER alters the primary decision tree.

| Pattern | Decision | Example |
| :--- | :---: | :--- |
| Recurring parameter override | **APPROVE** | `!SP<N>` (set continuous pass count threshold; Default: `1`) |
| Mid-flight prompt/criteria injection | **APPROVE** | `!PU [Text]` (append criteria to active prompt and confirm before next step) |
| Mid-flight pause gate | **APPROVE** | `!PA` (pause after applying changes and await user resume) |
| Low-savings one-off command | **REJECT** | `!CR` ("Create Report" saves minimal typing and adds permanent context load) |
| Primary strategy/branch rewrite | **REJECT** | `!CS` ("Change Strategy" mutates core workflow; express via explicit prompt instead) |
| Rare edge-case flag | **REJECT** | `!NL` ("No Logging" inflates context load for all standard runs) |

## 2. DTTC Anti-Patterns

| Condition | Action |
| :--- | :--- |
| Verbose tag name (e.g., `!SET_PASS_COUNT_THRESHOLD`) | Shorten to 2-3 uppercase letters (`!SP<N>`). |
| Case-sensitive tag matching | Enforce case-insensitive parsing (`!sp2` matches `!SP2`). |
| Missing default value on optional/parameterized tag | Specify an explicit default (e.g., `Default: 1`). |
| Vague agent action (e.g., "Agent adjusts settings") | Replace with explicit step-by-step execution instructions. |
