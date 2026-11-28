# 05 — Terminal Cutover & Real-Runtime Smoke Gate ($S$)

## Epic
[Epic 10: Frontend Tech Debt Hardening](file:///d:/Projects/YumeShelf/docs/specs/10-frontend-tech-debt-hardening/PRD.md)

## Status
ready-for-agent

## Blocked by
- [02.1 — Decompose Remaining Settings Tabs ($S$)](file:///d:/Projects/YumeShelf/docs/specs/10-frontend-tech-debt-hardening/tickets/02.1-decompose-settings-tabs.md)
- [02.2 — Extract AppShell Library Actions Hook ($S$)](file:///d:/Projects/YumeShelf/docs/specs/10-frontend-tech-debt-hardening/tickets/02.2-extract-appshell-library-actions.md)
- [03.2 — Harden Save Editor Refs & Storage Error Reporting ($S$)](file:///d:/Projects/YumeShelf/docs/specs/10-frontend-tech-debt-hardening/tickets/03.2-harden-save-editor-refs-and-storage.md)
- [04 — Document Global CSS Deferral Guardrails ($S$)](file:///d:/Projects/YumeShelf/docs/specs/10-frontend-tech-debt-hardening/tickets/04-document-css-deferral-guardrails.md)

## What to Build
> **Scope Guard:** Execute final `!NC` epic convergence verification and real-runtime Electron smoke validation across all Epic 10 changes without introducing unrequested features or behavioral regressions.

Verify end-to-end convergence across main, preload, renderer, Vite bundles, and live Electron execution before closing Epic 10:

- [x] 1. **Full Automated Build, Typecheck & Test Pipeline**:
  - **Files:** **[VERIFY]** [`src/renderer/entrypoint-cutover.test.tsx`](file:///d:/Projects/YumeShelf/src/renderer/entrypoint-cutover.test.tsx), **[VERIFY]** [`src/renderer/components/modals/path-dnd.test.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/modals/path-dnd.test.tsx), **[VERIFY]** [`src/preload.ts`](file:///d:/Projects/YumeShelf/src/preload.ts), **[VERIFY]** [`src/index.html`](file:///d:/Projects/YumeShelf/src/index.html), **[VERIFY]** [`src/save-editor.html`](file:///d:/Projects/YumeShelf/src/save-editor.html)
  - Execute `npm test && npm run typecheck && npm run build:preload && npm run build:vite && npm run verify:no-ts-nocheck` (verifying full Vitest + Node suites, renderer/main TypeScript compilation, preload bundle, Vite bundling with `ban-engine-runtime-in-renderer` across `src/index.html` and `src/save-editor.html` including `src/style.css`, and zero `@ts-nocheck`).
- [ ] 2. **Real-Runtime Electron UI Smoke Gate (`npm start`)**:
  - Launch the desktop app via `npm start` and verify:
    - Opening and closing `SettingsModal` (all 4 tabs including `autoAllowLargeSaves` and Mascot/Hide-and-Seek controls), `AboutModal`, `LanguagePackModal`, `DuplicateStackModal`, and `Delete Game from Library` modal with single-press `Escape` dismissal and deterministic focus restoration.
    - Save Editor `Ctrl/Cmd+F` search focus, `Shift+Enter` save shortcut, and pinned-field persistence (`yumeshelf_pinned_*`).
    - Zero console errors, CSP violations, or computed-style/layout regressions.

## Acceptance Criteria
- [x] Full build, test, and lint gates pass (`npm test && npm run typecheck && npm run build:preload && npm run build:vite && npm run verify:no-ts-nocheck`).
- [ ] Real-runtime Electron UI smoke check (`npm start`) passes across all modals (`SettingsModal` all 4 tabs, `AboutModal`, `LanguagePackModal`, `DuplicateStackModal`, `Delete Game from Library` with single-press `Escape` and focus restoration) and Save Editor shortcuts/persistence with zero console, CSP, or computed-style errors.

## Verification Command
```bash
npm test && npm run typecheck && npm run build:preload && npm run build:vite && npm run verify:no-ts-nocheck
```
