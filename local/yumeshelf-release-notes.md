---
name: yumeshelf-release-notes
description: Write YumeShelf changelogs and GitHub release notes in the user's preferred style. Use when the task is to draft, rewrite, polish, or format changelog text or release notes for YumeShelf versions. Always read 1-2 recent YumeShelf releases first to match tone and structure.
---

# YumeShelf Release Notes Writing Style

Use this skill when writing, formatting, polishing, or translating changelogs or GitHub release notes for `YumeShelf`.

---

## 📌 Core Rules

- Read 1-2 recent YumeShelf releases before writing new notes.
- Put end-user value first.
- Keep the upper section easy to scan and easy to understand.
- Do not lead with internal architecture wording.
- If polishing existing notes, preserve meaning unless the user explicitly asks for a rewrite.

---

## 🧩 Section Model

Choose sections based on the actual release scope:

- `## ✨ What's New`
- `## 🔧 What Changed`
- `## 🛠️ For the Nerds`

Rules:
- Use `What's New` when the release adds clearly new user-visible capabilities.
- Use `What Changed` when the release is mostly fixes, polish, cleanup, or behavior changes.
- If a release only fits one of those two top sections, include only that section.
- Use `For the Nerds` for technical details. It should be more detailed than the user-facing section.

---

## ✍️ Writing Style

### For the user-facing sections (`What's New` and `What Changed`):
- Say what the user will notice.
- Prefer plain, simple wording like `Added a startup overlay`.
- Avoid inflated or internal phrasing like `Transparent startup overlay`, `boot-state contract`, or `renderer/main IPC`.
- Keep bullets short.

### For `For the Nerds`:
- Be specific.
- Mention architecture, refactors, pipelines, metadata, fallbacks, packaging, or internal constraints when relevant.
- This is the right place for implementation detail.

---

## 🛠️ Workflow

1. Read 1-2 recent YumeShelf releases with `gh release view`.
2. Identify which parts of the current release are:
   - new user-facing additions
   - user-visible changes/fixes
   - technical/internal notes
3. Draft the release notes using only the sections that fit.
4. Check the top section again from a normal user's perspective:
   - would a user understand it quickly?
   - does it avoid internal jargon?
5. Keep technical detail in `For the Nerds`, not in the top section.

---

## 📄 Default Template

```md
## ✨ What's New

- ...

## 🔧 What Changed

- ...

---

## 🛠️ For the Nerds

- ...
```

*Adjust by removing any section that is not needed.*

---

## 🚫 Anti-Patterns

Do not:
- start with technical internals
- oversell small refactors as major user-facing features
- use architecture-heavy phrases in the top section
- keep both `What's New` and `What Changed` if one of them is empty
- rewrite the meaning of an existing changelog when the task is only formatting/polish
