---
name: write-pr
description: Use when asked to draft, format, or update a GitHub Pull Request description.
---

# Write PR

Format and synchronize GitHub Pull Request descriptions using Conventional Commits and plain English.

## Directives

1. **Title Format**: MUST follow Conventional Commits: `<type>(<scope>): <short description>` (e.g., `feat(cli): add short alias flags`).
2. **Session History Retrieval**: When summarizing multi-turn sessions, MUST retrieve context via `chronicle-mcp` (`get_session_details` with `conversationStepsOnly: true`). NEVER read raw SQLite or jsonl transcripts.
3. **No Fluff**: State factual code changes; NEVER use marketing adjectives (`robust`, `seamless`, `powerful`).

| Bad (Marketing Fluff) | Good (Plain English) |
| :--- | :--- |
| `Leverages robust engine to seamlessly process input` | `Parses CLI arguments using a key-value dictionary` |
| `Significantly elevates velocity and eliminates friction` | `Adds CLI aliases (-h, -d) for common commands` |
| `Engineered fail-safe mechanisms against crash hazards` | `Catches null errors and returns default config` |

---

## PR Template

```markdown
## Summary
<Concise overview of what was changed>

---

## Why
- <Problem or friction point solved>
- <Business or technical rationale>

---

## Implementation Details

### <Component / Area>
- <Concrete technical modification>
- <Module behavior change>

---

## Files Changed
- `<file-path>`: <Brief change summary, mark `[NEW]` for additions>
```

---

## Workflow

1. **Inspect Diffs & History**: Check `git status`, `git diff`, and retrieve session steps via `chronicle-mcp`.
2. **Draft PR**: Fill PR Template following Directives.
3. **Publish / Update**:
   - Create PR: Call `github:create_pull_request` (or `gh pr create`).
   - Sync Drift: If subsequent commits modify scope, update PR body via `github:update_issue` (or `gh pr edit`).
