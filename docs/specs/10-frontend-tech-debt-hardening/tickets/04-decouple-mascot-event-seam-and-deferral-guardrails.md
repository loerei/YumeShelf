# 04 — Decouple Mascot Event Seam & Document Deferral Guardrails ($S$)

## Epic
[Epic 10: Frontend Tech Debt Hardening](file:///d:/Projects/YumeShelf/docs/specs/10-frontend-tech-debt-hardening/PRD.md)

## Status
ready-for-agent

## Blocked by
- [Epic 09.2: Folder Drag-and-Drop Reordering & Card FLIP Animation](file:///d:/Projects/YumeShelf/docs/specs/09.2-folder-dnd-and-card-flip/PRD.md)

## What to Build
> **Scope Guard:** Implement only what is explicitly specified; preserve initial intended UXUI and all unmentioned existing behaviors across `SearchBar.tsx`, `MascotWidget.tsx`, `mascot-widget.ts`, and `style.css`. Do NOT rewrite `mascot-widget.ts` into React or migrate stylesheets to CSS Modules.

Remove the implicit `window` `CustomEvent` coupling between `SearchBar` and `MascotWidget`, and record explicit architectural deferral guardrails at the top of intentionally untouched files:

- [ ] 1. **[MODIFY]** [`src/renderer/components/SearchBar.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/SearchBar.tsx), **[MODIFY]** [`src/renderer/components/MascotWidget.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/MascotWidget.tsx), & **[MODIFY]** [`src/renderer/App.tsx`](file:///d:/Projects/YumeShelf/src/renderer/App.tsx) — **Replace `window` `CustomEvent('yumeshelf:mascot-bonk')` with Typed Callback/Ref Seam**:
  - Replace `window.dispatchEvent(new CustomEvent('yumeshelf:mascot-bonk'))` in `SearchBar.tsx` and the matching `window.addEventListener('yumeshelf:mascot-bonk', ...)` in `MascotWidget.tsx` with a typed `onMascotBonk` callback / imperative ref handle wired through `App.tsx` (or a small context).
  - Preserve identical mascot bonk animation behavior when triggered from search.
- [ ] 2. **[MODIFY]** [`src/style.css`](file:///d:/Projects/YumeShelf/src/style.css) — **Add Global CSS Deferral Decision Comment**:
  - Add a concise architectural decision header comment at the top of `src/style.css` documenting:
    - Why global feature-scoped CSS files (`src/styles/*.css`) are intentionally accepted today (low overhead, zero visual regression churn, manageable via feature prefixes).
    - Concrete trigger conditions where migrating to CSS Modules becomes worth the cost (e.g. recurring cross-feature selector collisions, third-party/plugin UI injection in Epic 04 requiring strict style isolation, or multi-theme/runtime-scoped component library extraction).
- [ ] 3. **[MODIFY]** [`src/renderer/mascot-widget.ts`](file:///d:/Projects/YumeShelf/src/renderer/mascot-widget.ts) & **[MODIFY]** [`src/renderer/components/MascotWidget.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/MascotWidget.tsx) — **Add Imperative Mascot Deferral Decision Comment**:
  - Add a concise architectural decision header comment at the top of both files documenting:
    - Why keeping the imperative DOM/animation core in `mascot-widget.ts` behind the thin `MascotWidget.tsx` shell is intentionally accepted today (self-contained, low churn, high animation-parity risk on full rewrite).
    - Concrete trigger conditions where rewriting to React becomes worth the cost (e.g. mascot needs shared reactive state with multiple app views, interactive multi-step UI controls/popovers, or frequent layout/a11y feature work inside the widget).
- [ ] 4. **[MODIFY]** [`src/renderer/components/SearchBar.test.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/SearchBar.test.tsx) — **Verify Typed Mascot Trigger Seam**:
  - Verify `SearchBar` triggers the injected `onMascotBonk` callback cleanly without relying on `window.dispatchEvent`.

## Acceptance Criteria
- [ ] Zero references to `yumeshelf:mascot-bonk` `CustomEvent` remain in `SearchBar.tsx` or `MascotWidget.tsx`.
- [ ] `src/style.css`, `src/renderer/mascot-widget.ts`, and `src/renderer/components/MascotWidget.tsx` each have a concise top-of-file decision comment stating current acceptance rationale and explicit upgrade triggers.
- [ ] Execute automated verification command: `npm run test:vitest -- src/renderer/components/SearchBar.test.tsx && npm run typecheck`.

## Verification Command
```bash
npm run test:vitest -- src/renderer/components/SearchBar.test.tsx && npm run typecheck
```
