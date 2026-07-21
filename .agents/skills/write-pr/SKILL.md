---
name: write-pr
description: Write and format GitHub Pull Requests according to standard repository guidelines. Use when generating, writing, or revising PR descriptions.
---

# Writing Pull Requests

## Quick start

Format PR titles using conventional commits: `feat(<scope>): <description>` or `fix(<scope>): <description>`.

Example of a standard PR description:
```markdown
## Summary
Adds a user-friendly CLI help interface and short option aliases.

---

## Why
- Running the command with `--help` previously crashed.
- Typing full parameters was verbose.

---

## Implementation Details

### CLI
- Mapped short options in argument parser using a lookup dictionary.
- Added usage instruction prints.

### Tests
- Ran build validation successfully.

---

## Files Changed

### CLI
- `src/cli.ts`: Added help print function and short alias mappings.
```

## Workflows

Checklist for generating PR descriptions:
- [ ] **Verify Session History & Scope**: Before drafting the description, retrieve the current conversational history using the `chronicle-mcp` server's `get_session_details` tool (prioritize `conversationStepsOnly: true`). Review the sequence of actions and check against the base branch status. Do NOT read raw SQLite or jsonl transcripts directly. Ensure you distinguish between newly introduced features and modifications to pre-existing code.
- [ ] **Determine Scope**: Pick a scope for the title (e.g. `cli`, `server`, `core`, `utils`).
- [ ] **Draft Summary**: Summarize modifications and affected files concisely.
- [ ] **State Rationale (Why)**: Detail the problem solved and core improvements.
- [ ] **Explain Implementation**: Group technical details by component/module.
- [ ] **List Files**: Document modified files under their component groups, marking new files with `[NEW]`.

## References

For detailed guidelines on commit conventions and PR reviews, see the repository's main documentation.
