# Reference: Subagent Prompt Templates, Schemas & Output Formats

This reference document contains heavy templates, prompt schemas, and JSON output formats used during Phase 5 (Per-File Diff & Multi-Subagent Audit) and Phase 6 (Confidence Voting & Synthesis) of the **Afterplay** workflow.

---

## 1. Subagent Prompt & Context Package Templates

### Standard Full Audit Prompt Template:
Use this ready-to-use prompt template when spawning per-file diff review subagents via `invoke_subagent` in Phase 5:

```markdown
You are assigned to deeply analyze the diff file at the granular **Git Hunk level**:
Diff file: <appDataDir>\brain\<conversation-id>\<filename>.diff
Target file: <absolute_path_to_source_file>

Context:
1. Prototype Goal: <quantified_goal_metrics_feature_perf_bugfix>
   (If !GPR was invoked, read Goal details directly from: <appDataDir>\brain\<conversation-id>\PR.md)
2. Bug behavior / Symptoms: <observed_symptoms_and_reproduction_steps>

You have permission to read all diffs and source files in the codebase using view_file / jcodemunch.
If <appDataDir>\brain\<conversation-id>\PR.md exists, YOU MUST read PR.md using view_file to understand the exact Goal specifications and benchmarks.

Perform a per-hunk analysis:
1. Divide the diff into individual Git Hunks (`@@ -L,N +L,M @@` or logical block of changes).
2. For EACH hunk, analyze:
   - What exact changes are made in this hunk?
   - How many changed lines (+ and -) are in this hunk?
   - Classify this hunk into exactly one category code:
     * Type 0 (Clean / Clear): Changes contribute to Goal and have zero association with the reported bug.
     * Type 1 (Missing Code): Bug occurs because required code for Goal is missing.
     * Type 2 (Existing Code Bug): Bug in pre-existing code required for Goal.
     * Type 3 (Both): Bug caused by pre-existing code defect AND missing code for Goal.
     * Type U (Unrelated to Goal): Code does NOT contribute to Goal (accidental bloat/dead code).
     * Type 2U (Unrelated Buggy Code): Bug is in code unrelated to Goal (action: strip/discard).
   - Recommend action for this hunk: Keep, Implement, Surgical Fix, or Strip (Discard).
3. Calculate file-level Line-Weighted Type Percentages:
   % Type X = (total changed lines in Type X hunks / total changed lines in diff) * 100%.
4. Provide an overall file recommendation:
   - Full Keep (100% Type 0)
   - Partial Strip (Revert/patch out Type U / 2U hunks while keeping Type 0 hunks)
   - Surgical Fix (Focus on Type 1/2/3 hunks)
   - Full Discard (Type U / 2U > 80%)
   Include confidence level (0-100%). Optionally point to any other diff file if relevant.
```

### `!HU` (Bloat Hunter Pass) Specialized Prompt Template:
Use this lightweight prompt template when the user invokes `!HU`:

```markdown
You are assigned to run a fast BLOAT HUNT pass on:
Diff file: <appDataDir>\brain\<conversation-id>\<filename>.diff
Target file: <absolute_path_to_source_file>

Context:
Prototype Goal: <quantified_goal_metrics_feature_perf_bugfix>
(If PR.md exists at <appDataDir>\brain\<conversation-id>\PR.md, READ PR.md via view_file).

Primary Focus: Focus strictly on identifying whether this diff is Type U (Unrelated to Goal) or Type 2U (Unrelated Buggy Code) that can be stripped immediately.

Answer:
1. Is this diff strictly required for the Goal defined in PR.md? (Yes/No)
2. Classification:
   - Type U: Code does not contribute to Goal (strip/discard).
   - Type 2U: Buggy code that does NOT contribute to Goal (strip/discard, do NOT fix).
   - Relevant to Goal: (Mark as Type 0, 1, 2, or 3 for Pass 2).
Include confidence level (0-100%).
```

---

## 2. Subagent Assessment Markdown & JSON Schemas

### Subagent Assessment Markdown Format:
```markdown
### Subagent Review: <file-basename>

1. **Total Changed Lines**: <N lines (+ / -)>
2. **Per-Hunk Breakdown**:
   - **Hunk 1 (`@@ -12,5 +12,18 @@`)**: Type 0 (Clean / Clear) — 13 lines changed. Action: Keep. Reason: <explanation>
   - **Hunk 2 (`@@ -45,8 +58,15 @@`)**: Type U (Unrelated) — 7 lines changed. Action: Strip. Reason: <explanation>
3. **Line-Weighted Type Percentages**:
   - **Type 0**: 65% (13/20 lines)
   - **Type U**: 35% (7/20 lines)
4. **Overall File Recommendation**: <Full Keep / Partial Strip / Surgical Fix / Full Discard> (Confidence: X%)
5. **Cross-File Pointing (Optional)**: Points to `<other-file>` as potential root cause (Confidence: Z%).
```

### JSON Schema for Programmatic Aggregation:
```json
{
  "targetFile": "path/to/File.java",
  "diffFile": "<appDataDir>/brain/<conversation-id>/File.java.diff",
  "prGoalSpec": "<appDataDir>/brain/<conversation-id>/PR.md",
  "totalChangedLines": 85,
  "hunks": [
    {
      "hunkId": "Hunk 1 (lines 12-28)",
      "changedLines": 16,
      "type": "Type 0",
      "name": "Clean Goal Code",
      "action": "Keep",
      "reason": "New feature logic conforming to Goal specification"
    },
    {
      "hunkId": "Hunk 2 (lines 45-60)",
      "changedLines": 15,
      "type": "Type U",
      "name": "Unrelated Bloat",
      "action": "Strip",
      "reason": "Debug logging and unneeded helper methods"
    },
    {
      "hunkId": "Hunk 3 (lines 102-156)",
      "changedLines": 54,
      "type": "Type 2",
      "name": "Existing Code Bug",
      "action": "Surgical Fix",
      "reason": "Flawed permission check logic in pre-existing function"
    }
  ],
  "typePercentages": {
    "Type 0": "18.8%",
    "Type U": "17.6%",
    "Type 2": "63.5%"
  },
  "overallFileRecommendation": {
    "action": "Partial Strip & Surgical Fix",
    "details": "Strip Hunk 2 (Type U), apply Surgical Fix to Hunk 3 (Type 2), keep Hunk 1 (Type 0)",
    "confidenceScore": 95
  },
  "crossFilePointers": [
    {
      "pointedFile": "path/to/OtherFile.java",
      "reason": "Defect or missing delegation in target method",
      "confidenceScore": 95
    }
  ]
}
```

---

## 3. Subagent Consensus Matrix & Report Template

Use this markdown template to aggregate all subagent findings into `<appDataDir>\brain\<conversation-id>\subagents_diff_and_bug_analysis.md`:

```markdown
# Multi-Subagent Diff Audit & Bug Analysis Summary

## 1. Overview Matrix

| File Name | Total Lines Changed | Type Breakdown (%) | Primary Action | Subagent Confidence | Hunk Summary & Notes | Cross-File Pointing |
| :--- | :---: | :--- | :--- | :---: | :--- | :--- |
| `File1.java` | 45 | 100% Type 0 | Full Keep | 95% | Clean goal implementation | None |
| `File2.xml` | 30 | 70% Type 2, 30% Type 0 | Surgical Fix | 90% | Fix flaw in Hunk 1 (Type 2) | `OtherFile.java` |
| `File3.java` | 60 | 60% Type 0, 40% Type U | Partial Strip | 95% | Strip Hunk 2 (Type U bloat), keep Hunk 1 | None |
| `LegacyHelper.java` | 25 | 100% Type 2U | Full Discard | 95% | Prototype bloat (Do Not Fix) | None |

---

## 2. Synthesis & Fix Plan

1. **Goal Specification Anchor**: `<appDataDir>\brain\<conversation-id>\PR.md`
2. **Non-Goal Code / Hunks to Strip (Type U / Type 2U)**: <List diffs/hunks to discard without spending effort fixing>
3. **Clean Goal Code to Retain (Type 0)**: <List clean diffs/hunks contributing to Goal with zero bug association>
4. **Identified Surgical Fix (Type 1/2/3)**: <Minimal edit required based on Goal-relevant findings>
5. **Verification Command**: <Build and test execution commands>
```
