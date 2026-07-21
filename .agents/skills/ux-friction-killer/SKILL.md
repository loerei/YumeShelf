---
name: ux-friction-killer
description: >
  Eliminates visual and interactive friction in user interfaces (UX/UI). Focuses on scroll trapping/hijacking prevention, clear interactive hover/focus states, Show-Don't-Tell micro-interactions, and Optimistic UI updates. Use when building, modifying, or auditing frontend interfaces, components, buttons, or scrollable areas, or when the user mentions UX friction, scroll issues, hover states, or animations.
---

# UX Friction Killer

## Quick start

For any user interaction (buttons, inputs, scrollable boxes), prioritize physical responsiveness and visual clarity:

- Hover/Active states: MUST change style (scale, border-color, shadow, background-color) to confirm focus.
- Micro-interactions: Show visual feedback inline immediately (e.g. icon checkmarks on copy buttons).
- Scroll hijack prevention: Subwindows/subscroll boxes must not lock screen scroll.

## Workflows

### 1. Scroll-Jacking & Overscroll Prevention
- **Hover scroll indicator:** If an element is scrollable, it MUST show subtle hover styling (like scrollbar track opacity transitions) to indicate it accepts scroll events.
- **Lock release:** Always release parent scroll chaining when limits are reached. Use `overscroll-behavior: contain` or native CSS options to prevent unexpected site-level scroll jumps, but ensure a clear visual boundary exists.
- **Scroll limits:** If the cursor is over a subwindow at its scroll limit (top/bottom), do not trap the user. Ensure mousewheel events naturally propagate or the boundary is clearly visual.

### 2. Show, Don't Tell (Visual Feedback over Text)
- **Status cues:** Use visual transitions, color changes, and icon states instead of text alerts (`alert()`, popup text, toast notices) where possible.
- **Instant confirmations:** When action succeeds (e.g., copied, saved, deleted), transition the active element itself (e.g., button scale changes, icon morphs to a checkmark).
- **Transitions:** Every color, layout, or size transition MUST be animated smoothly using CSS transitions (`transition: all 0.2s ease-in-out`).

### 3. Active & Hover State Coverage
- **Cursor feedback:** Every clickable element MUST have `cursor: pointer`.
- **States:** Implement distinct `:hover`, `:active`, and `:focus` styles. Never leave buttons static on hover.
- **Optimistic UI:** Update the UI state immediately on user click, then process API/sync calls in the background.

## Checklists
- [ ] Every button has a `:hover` and `:active` state.
- [ ] No `alert()` calls used for simple status feedback.
- [ ] Scrollable subwindows do not hijack site scroll unexpectedly.
