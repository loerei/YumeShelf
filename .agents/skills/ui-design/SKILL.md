---
name: ui-design
description: Use when designing, styling, auditing, or refactoring web or desktop interfaces and visual hierarchy.
---

# UI Design

Design interfaces from the user's seat: **"Do what should exist, and do only what should exist."**

## Core Rules

1. **Purpose Over Presence**: Every element, container, label, and visual treatment must solve a real user need on that screen. If removing it loses no capability or non-obvious information, do not render it. NEVER add unrequested chrome or filler (e.g., decorative stat cards, eyebrow pills, fake notifications, or empty-padding hero sections).
2. **Silent Normal States**: Default, healthy, or expected states stay visually quiet. Render badges, counters, or status indicators ONLY for exceptions or actionable states that change what the user does next (e.g., a duplicate count when `> 1`, an error, or an active process). Never repeat context that column position or grouping already shows.
3. **Let Layout Speak**: When a control, heading, or input is clear from its label and placement, omit explanatory subtitles and instructional copy (e.g., *"Manage your settings below"*).
4. **Functional Color Restraint**: Build depth from neutral surfaces with a single primary accent reserved strictly for interactive focus, selection, or semantic status (`danger`, `warning`, `success`). NEVER use decorative gradients, neon glows, or unsolicited color flourishes (e.g., default purple/indigo AI themes). Maintain readable contrast (`>= 4.5:1` body text) and match existing theme tokens and light/dark parity.
5. **Group Without Box Spam**: Separate regions with whitespace, alignment, or `1px` dividers first. Reserve bordered or elevated cards for independently interactive items or floating overlays, and avoid nesting cards inside cards.
6. **Clean Typography, Overflow & Sizing**: Use sentence case for UI labels, `tabular-nums` (or monospace) for variable numbers and timestamps, and fluid layout units (`rem`, `%`, `clamp()`, `100dvh`). Constrain flex/grid text children (`min-width: 0` with truncation or wrapping) so long strings never push sibling controls off-screen.
7. **SVG Icons Over Emojis**: Use consistent-stroke SVG icons aligned to sibling text baselines (NEVER use emojis as UI icons). Allow icon-only buttons only for universally recognized actions (e.g., close, delete, search, copy, settings) with `aria-label` and a tooltip; give domain-specific actions visible text labels.
