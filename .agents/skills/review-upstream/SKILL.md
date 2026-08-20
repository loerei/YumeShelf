---
name: review-upstream
description: Sync, compare, and merge custom skill updates from upstream repositories. Use when checking for skill updates or running /review-upstream.
---

# Review Upstream Skills

Fetch, diff, and reconcile custom skill updates from upstream source repositories into `myskills/`.

## Workflow

```mermaid
flowchart TD
    Start["Trigger: /review-upstream"] --> Fetch["1. Fetch: node sync-upstream.js --all"]
    Fetch --> Triage{"2. Triage Skills"}
    
    Triage -->|"New Skill"| AskNew["Ask user: Add to official catalog?"]
    Triage -->|"Modified Skill"| DiffCheck["Compare local vs upstream diff & recommend action"]
    
    AskNew -->|"Approved"| ApplyAdd["node sync-upstream.js --apply <name> --action add --category <cat>"]
    
    DiffCheck --> Choice{"User Decision"}
    Choice -->|"Overwrite"| ApplyOverwrite["node sync-upstream.js --apply <name> --action overwrite"]
    Choice -->|"Keep Local"| Skip["Skip apply"]
    Choice -->|"Combine"| ManualMerge["Manually edit local SKILL.md"]
    
    ApplyAdd --> Cleanup["3. Clean pending: node sync-upstream.js --clear"]
    ApplyOverwrite --> Cleanup
    Skip --> Cleanup
    ManualMerge --> Cleanup
    
    Cleanup --> Sync["4. Sync: agents audit -a -p && agents distribute"]
    Sync --> Git["5. Commit & Push myskills"]
```

## CLI Reference

| Action | Command |
| :--- | :--- |
| **Fetch all upstream** | `node sync-upstream.js --all` |
| **Apply new skill** | `node sync-upstream.js --apply <skill_name> --action add --category <category>` |
| **Overwrite local skill** | `node sync-upstream.js --apply <skill_name> --action overwrite` |
| **Clear pending queue** | `node sync-upstream.js --clear` |
| **Audit & Distribute** | `agents audit -a -p && agents distribute` |

## Triage Rules for Modified Skills

For each modified skill, report to the user:
1. **Summary of differences**: What upstream added vs. what local customized.
2. **Recommendation**: State clearly whether to overwrite, keep local, or merge.
3. **Options**:
   - `a. Keep local` (reject upstream changes)
   - `b. Overwrite` (accept upstream version)
   - `c. Merge` (manually combine complementary improvements)
