---
name: prototype
description: Use when building a throwaway prototype to test state models, logic, or UI options.
---

# Prototype

A prototype is **throwaway code that answers a question**. The question decides the shape.

## Pick a branch

Identify which question is being answered from the prompt, surrounding code, or by asking the user:

- **"Does this logic / state model feel right?"** -> [LOGIC.md](LOGIC.md). Build a tiny interactive terminal app that pushes the state machine through cases that are hard to reason about on paper.
- **"What should this look like?"** -> [UI.md](UI.md). Generate several radically different UI variations on a single route, switchable via a URL search param and a floating bottom bar.

The two branches produce very different artifacts; choosing the wrong one wastes the prototype. If the question is ambiguous and the user is unreachable, default to whichever branch matches the surrounding code (backend module -> logic; page or component -> UI) and state the assumption at the top of the prototype.

## Rules that apply to both

1. **Throwaway from day one, clearly marked.** Place prototype code near where it will be used (next to the module or page it targets) so context is obvious, named so any reader knows it is not production. Follow the project's existing routing convention for throwaway UI routes; do not invent a new top-level structure.
2. **One command to run.** Hook into the project's task runner (`pnpm <name>`, `python <path>`, `bun <path>`, etc.) so the user starts it directly.
3. **No persistence by default.** Keep state in memory (persistence is what the prototype checks, not a dependency). If the question specifically targets a database, use a scratch DB or local file clearly named `"PROTOTYPE - wipe me"`.
4. **Skip the polish.** No tests, no error handling beyond keeping it _runnable_, no abstractions.
5. **Surface the state.** After every action (logic) or variant switch (UI), print or render the full relevant state so changes are visible.
6. **Capture it when done.** Fold validated decisions into real code, then capture the prototype itself as a **primary source** on a throwaway branch off `main` with a pointer on the implementation issue. Record the verdict and settled question in the issue or commit; keep only the validated decision on `main`.
