# 04 — Document Global CSS Deferral Guardrails ($S$)

## Epic
[Epic 10: Frontend Tech Debt Hardening](file:///d:/Projects/YumeShelf/docs/specs/10-frontend-tech-debt-hardening/PRD.md)

## Status
ready-for-agent

## Blocked by
- [Epic 11: Mascot React 19 Migration & Hide-and-Seek Restoration](file:///d:/Projects/YumeShelf/docs/specs/11-mascot-react-migration-and-hide-and-seek/PRD.md)

## What to Build
> **Scope Guard:** Implement only the architectural decision comment specified below; do NOT alter CSS rules, migrate stylesheets to CSS Modules, or modify `mascot-widget.ts` / `MascotWidget.tsx` (handled in Epic 11).

Record explicit architectural deferral guardrails at the top of `src/style.css`:

- [ ] 1. **[MODIFY]** [`src/style.css`](file:///d:/Projects/YumeShelf/src/style.css) — **Add Global CSS Deferral Decision Comment**:
  - Add a concise architectural decision header comment at the top of `src/style.css` documenting:
    - Why global feature-scoped CSS files (`src/styles/*.css`) are intentionally accepted today (low overhead, zero visual regression churn, manageable via feature prefixes).
    - Concrete trigger conditions where migrating to CSS Modules becomes worth the cost (e.g. recurring cross-feature selector collisions, third-party/plugin UI injection in Epic 04 requiring strict style isolation, or multi-theme/runtime-scoped component library extraction).
- [ ] 2. **Verify Existing Stylesheet Contract Tests**:
  - Run `npm run test:vitest -- src/renderer/styles/folder-sort.test.ts && npm run typecheck` to ensure adding the header comment preserves import order and stylesheet tests.

## Acceptance Criteria
- [ ] `src/style.css` has a concise top-of-file decision comment stating current acceptance rationale and explicit CSS Modules upgrade triggers.
- [ ] Execute automated verification command: `npm run test:vitest -- src/renderer/styles/folder-sort.test.ts && npm run typecheck`.

## Verification Command
```bash
npm run test:vitest -- src/renderer/styles/folder-sort.test.ts && npm run typecheck
```
