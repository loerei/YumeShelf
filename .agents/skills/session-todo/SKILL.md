---
name: session-todo
description: Use when tracking multiple distinct problems across a session alongside active plans.
---

# Session Todo

Maintain `session_todo.md` in the session artifact directory as a coarse-grained queue of distinct problems with stable `#N` IDs (`[ ]` Pending, `[/]` Active, `[x]` Done). `#N` is an identifier only, not execution order, and multiple `[/]` entries may share one `implementation_plan.md`.
Update `session_todo.md` in-place whenever problems are added, split, re-scoped, reprioritized, or transition status during the session.
List `session_todo.md` in `What To Re-read After A Checkpoint.md` under `## Referenced Artifacts` so it survives context compaction.

```markdown
# Session Todo

- [x] **#1 <Problem>** - <1-line scope/outcome> ([plan](file:///.../plan_archived_topic.md))
- [/] **#2 <Problem>** - <1-line scope> ([active plan](file:///.../implementation_plan.md))
- [ ] **#3 <Problem>** - <1-line scope>
```
