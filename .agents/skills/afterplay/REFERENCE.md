# Reference: Afterplay Prompt Templates, Schemas & Output Formats

## 1. Subagent Prompt Templates

### Standard Full Audit Prompt
```markdown
Analyze the diff file at the Git Hunk level:
Diff file: <appDataDir>/brain/<conversation-id>/<filename>.diff
Target file: <absolute_path_to_source_file>

Context:
1. Prototype Goal: <quantified_goal_metrics_feature_perf_bugfix>
   (If <appDataDir>/brain/<conversation-id>/PR.md exists, read it via read_file as the Goal spec.)
2. Bug behavior / Symptoms: <observed_symptoms_and_reproduction_steps>

You may read diffs and source files using read_file / search tools.

Per-hunk analysis:
1. Split the diff into Git Hunks (`@@ -L,N +L,M @@` or logical blocks).
2. For EACH hunk, report:
   - Exact changes made and changed line count (+ and -).
   - Exactly one category:
     * Type 0 (Clean / Clear): Contributes to Goal; unrelated to bug.
     * Type 1 (Missing Code): Bug caused by missing Goal logic.
     * Type 2 (Existing Code Bug): Bug in pre-existing code needed for Goal.
     * Type 3 (Both): Pre-existing defect + missing Goal code.
     * Type U (Unrelated): Does not contribute to Goal (bloat/dead code).
     * Type 2U (Unrelated Bug): Bug in code unrelated to Goal (strip/discard).
   - Hunk action: Keep, Implement, Surgical Fix, or Strip.
3. Compute line-weighted percentages:
   `% Type X = (total changed lines in Type X hunks / total changed lines in diff) * 100%`
4. Recommend an overall file action (`Full Keep`, `Partial Strip`, `Surgical Fix`, or `Full Discard`) with confidence (0-100%) and optional cross-file pointers.
```

### `!HU` (Bloat Hunt) Prompt
```markdown
Run a fast BLOAT HUNT pass on:
Diff file: <appDataDir>/brain/<conversation-id>/<filename>.diff
Target file: <absolute_path_to_source_file>

Context:
Prototype Goal: <quantified_goal_metrics_feature_perf_bugfix>
(If <appDataDir>/brain/<conversation-id>/PR.md exists, read it via read_file.)

Identify whether this diff is Type U (Unrelated to Goal) or Type 2U (Unrelated Buggy Code) for immediate stripping:
1. Is this diff required for the Goal? (Yes/No)
2. Classification: Type U, Type 2U, or Relevant to Goal (mark Type 0/1/2/3 for full audit).
3. Include confidence (0-100%).
```

## 2. Subagent Assessment Schemas

### Markdown Format
```markdown
### Subagent Review: <file-basename>

1. **Total Changed Lines**: <N lines (+ / -)>
2. **Per-Hunk Breakdown**:
   - **Hunk 1 (`@@ -12,5 +12,18 @@`)**: Type 0 (Clean / Clear), 13 lines changed. Action: Keep. Reason: <explanation>
   - **Hunk 2 (`@@ -45,8 +58,15 @@`)**: Type U (Unrelated), 7 lines changed. Action: Strip. Reason: <explanation>
3. **Line-Weighted Type Percentages**:
   - **Type 0**: 65% (13/20 lines)
   - **Type U**: 35% (7/20 lines)
4. **Overall File Recommendation**: <Full Keep | Partial Strip | Surgical Fix | Full Discard> (Confidence: X%)
5. **Cross-File Pointing (Optional)**: Points to `<other-file>` as potential root cause (Confidence: Z%).
```

### JSON Schema
```json
{
  "targetFile": "path/to/File.ext",
  "diffFile": "<appDataDir>/brain/<conversation-id>/File.ext.diff",
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
      "reason": "Debug logging and unused helper methods"
    },
    {
      "hunkId": "Hunk 3 (lines 102-156)",
      "changedLines": 54,
      "type": "Type 2",
      "name": "Existing Code Bug",
      "action": "Surgical Fix",
      "reason": "Flawed permission check in pre-existing function"
    }
  ],
  "typePercentages": {
    "Type 0": "18.8%",
    "Type U": "17.6%",
    "Type 2": "63.5%"
  },
  "overallFileRecommendation": {
    "action": "Partial Strip & Surgical Fix",
    "details": "Strip Hunk 2 (Type U), fix Hunk 3 (Type 2), keep Hunk 1 (Type 0)",
    "confidenceScore": 95
  },
  "crossFilePointers": [
    {
      "pointedFile": "path/to/OtherFile.ext",
      "reason": "Defect or missing delegation in target method",
      "confidenceScore": 95
    }
  ]
}
```

## 3. Consensus Matrix & Synthesis Template

Write aggregated findings to `<appDataDir>/brain/<conversation-id>/subagents_diff_and_bug_analysis.md`:

```markdown
# Multi-Subagent Diff Audit & Bug Analysis Summary

## 1. Overview Matrix

| File Name | Total Lines Changed | Type Breakdown (%) | Primary Action | Confidence | Hunk Summary & Notes | Cross-File Pointing |
| :--- | :---: | :--- | :--- | :---: | :--- | :--- |
| `File1.ext` | 45 | 100% Type 0 | Full Keep | 95% | Clean goal implementation | None |
| `File2.ext` | 30 | 70% Type 2, 30% Type 0 | Surgical Fix | 90% | Fix flaw in Hunk 1 (Type 2) | `OtherFile.ext` |
| `File3.ext` | 60 | 60% Type 0, 40% Type U | Partial Strip | 95% | Strip Hunk 2 (Type U), keep Hunk 1 | None |
| `LegacyHelper.ext` | 25 | 100% Type 2U | Full Discard | 95% | Prototype bloat (Do Not Fix) | None |

## 2. Synthesis & Fix Plan

1. **Goal Specification Anchor**: `<appDataDir>/brain/<conversation-id>/PR.md`
2. **Non-Goal Code / Hunks to Strip (Type U / Type 2U)**: <List diffs/hunks to discard without fixing>
3. **Clean Goal Code to Retain (Type 0)**: <List clean diffs/hunks contributing to Goal>
4. **Identified Surgical Fix (Type 1/2/3)**: <Minimal edit required for Goal-relevant findings>
5. **Verification Command**: <Build and test commands>
```
