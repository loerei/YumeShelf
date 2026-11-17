---
name: ux-interaction
description: Use when building or auditing interactive controls, search, menus, forms, scroll behavior, and states.
---

# UX Interaction

Design interactions around minimum friction from user intent to outcome: *"How should this respond the instant I touch it, and what would be irritating to click through?"*

## Core Rules

1. **Direct Manipulation Over Ceremony**:
   - **Search & Filter**: Filter local collections immediately on `input` with a clear empty-results state; require explicit submission only when queries are expensive or remote.
   - **Inline Over Modal**: Handle single-field or frequent edits in place (e.g., inline rename, toggle, lightweight popover). Reserve blocking modals for destructive confirmations or multi-step flows.
   - **Progressive Disclosure**: Keep primary surfaces scannable by moving secondary or batch actions into context or overflow menus.
2. **Inline Feedback (`Show, Don't Tell`)**: Reflect action results directly on the triggered control (e.g., optimistic update, icon/label state change, inline progress) instead of `alert()` dialogs or toast spam. Reserve floating notifications for background events or errors the user would otherwise miss.
3. **Complete State Coverage**: Explicitly handle `loading` (without layout jumps), `empty` (clear reason and next action if applicable, hiding dead controls), `error` (inline near the control, preserving user input), and `disabled` (visually muted and non-interactive).
4. **Purposeful Motion (Prevent Teleportation)**: Animate state and spatial transitions (e.g., expanding/collapsing rows, opening drawers or menus, inserting/reordering items) with fast, direct timing so the eye tracks where elements moved instead of seeing them teleport. Do not leave native or conditional toggles (e.g., `<details>`, `display`/`hidden` swaps) snapping layout abruptly. NEVER add show-off motion (e.g., staggered page-load waterfalls, bounce excess, idle loops). Keep motion enabled by default; offer reduced motion as an opt-out setting when the app has settings (and honor `prefers-reduced-motion` when active).
5. **Tactile, Jitter-Free Affordances**:
   - **Generous Hit Targets**: Bind a row, card, or item's primary action to its full clickable surface rather than only an inner text label or icon. Isolate nested interactive controls by ignoring interactive descendants in the parent handler (e.g., `event.target.closest('button, a, input, select, textarea, [role="button"], [data-interactive]')`) instead of `stopPropagation()`, while keeping a semantic `<button>` or `<a>` for keyboard focus.
   - **Action Discoverability**: Never lock actions exclusively behind `:hover` without a visible, `:focus-within`, or touch (`@media (hover: none)`) fallback.
   - **Stable Interaction States**: Interactive elements need `cursor: pointer` and distinct `:hover`, `:active`, and `:focus-visible` states across themes without jiggling sibling layout bounds on hover or press.
6. **Scroll, Focus & Keyboard Ergonomics**: Never hijack or trap native page scroll; use `overscroll-behavior: contain` with visible scroll affordance on constrained overlays. Support `Escape` and outside-click dismissal for menus/modals, `Enter`/`Escape` for inline edits, and keep `:focus-visible` rings unobstructed. Preserve focus continuity (return focus to the trigger on overlay close, shift focus to an adjacent item when deleting a focused list item, and prefer `aria-disabled` over native `disabled` on focused async triggers) so focus never drops to `document.body`.
