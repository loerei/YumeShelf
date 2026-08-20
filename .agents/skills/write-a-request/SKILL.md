---
name: write-a-request
description: Use when asked to draft a feature request, change proposal, or RFC.
---

# Write a Request

Draft idea-level proposals, behavioral change requests, and policy enhancements in `REQUEST.md` (or `request_<topic>.md`).

## Directives

1. **Zero Speculation**: Propose at the behavioral or interface level (`what/how it looks`); NEVER dictate internal algorithms or guessed architecture.
2. **Concrete Grounding**: MUST anchor the problem in an observed bottleneck or real example; no hypothetical generalities.
3. **No Fluff Rationale**: State direct technical value and saved friction without marketing hype.

---

## Template (`REQUEST.md`)

```markdown
# Request: [Short Descriptive Summary]

**Target**: `<tool / document / repository>`  
**Type**: `[Feature / Policy / Enhancement]`  
**Date**: YYYY-MM-DD  

---

## 1. Problem (What)
- Concrete friction point, missing option, or workflow bottleneck. Include observed example.

## 2. Proposed Idea (Do What)
- Desired behavioral, parameter, or interface change at conceptual level.
- Do NOT dictate internal implementation mechanics.

## 3. Rationale (Why)
- Direct operational value and friction eliminated.
```

---

## Workflow

1. Identify the target entity and exact friction point.
2. Formulate behavioral proposal following Directives.
3. Write artifact to `REQUEST.md` (or `<appDataDir>/brain/<convo-id>/request_<topic>.md`).
4. Present file link and brief summary to user.
