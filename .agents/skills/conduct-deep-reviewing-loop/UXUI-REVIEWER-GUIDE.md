# UXUI Reviewer Guide

Audits target-audience interaction flows, physical focus retention, layout stability (CLS), front-end developer experience (DX) & codebase maintainability, and regime/form-factor-matched ergonomics in the Directive Artifact (DA).

## 1. Core Review Protocol & Constraints

- **Clean-Slate Isolation**: Audit target DA(s) solely against codebase ground-truth, `<review_dir>/Context.md`, this guide, and the **exact 2 matching subdocuments** loaded from §2. NEVER inspect git history, `<review_dir>/host/`, or other roles' reports/sandboxes.
- **Single-Pass Exhaustiveness, Incremental Capture & Forward Simulation**:
  - **Incremental Finding Capture (`<review_dir>/sandbox/UXUI/Findings.md`)**: To prevent "lost-in-the-middle" context drift across large multi-ticket epics, immediately append every discovered UI friction, missing state, unmount focus drop, layout shift, or event suppression defect to `<review_dir>/sandbox/UXUI/Findings.md` as lightweight notes (ticket/file location, defect description, referenced symbols, affected components/views) as you audit each section. NEVER write prematurely to `<review_dir>/reports/UXUI.md` while reading.
  - **Cross-Ticket Synthesis & Forward Simulation**: Once the entire DA is scanned end-to-end, review `Findings.md` holistically to reconcile cross-ticket UX flows and component hierarchies, eliminate false positives, group shared root causes, mentally apply all proposed fixes, and re-audit the projected state. Report all UI friction, missing states, unmount focus drops, layout shifts, front-end architectural debt, and event suppression defects in one pass, then synthesize and write the final evaluation to `<review_dir>/reports/UXUI.md` directly via your native file-writing tool (NEVER write helper `.js`/`.py` scripts in `sandbox/UXUI/` to generate or regex-edit your report).
- **Grounded Code Remediations & Atomic Acceptance Criteria (Zero Semantic Loss)**:
  - Deliver every `Required Fix` using **concrete, grounded code** — JSX/TSX/HTML markup, TypeScript event/focus/state handlers (`event.target.closest(...)`, synchronous unmount focus handoff, optimistic rollback, staleness watchdogs), and structural/tokenized CSS (`isolation: isolate`, `min-width: 0`, `text-overflow: ellipsis`, `@media (prefers-reduced-motion: no-preference)`, `aspect-ratio`, `scrollbar-gutter: stable`, and verified `--zIndex-*` / theme tokens) — paired with single-responsibility **Acceptance Criteria (Given/When/Then)**.
  - **Ban Invented Tokens & Magic-Pixel Geometry Guessing**: Because `UXUI` operates without a live visual viewport, NEVER fabricate design token names not verified on disk (`Ground-Truth Proof`) and NEVER guess arbitrary pixel coordinates or magic layout offsets (`margin-top: -13px`, `width: calc(100% - 247px)`).
- **Universal GUI & Front-End DX Invariants (Applicable to All Subdocuments)**:
  - **Design Tokens & Surface Context**: Verify and cite exact design token names (`theme.css`, token catalog) on disk; NEVER invent token names or hardcode raw hex/pixel literals where codebase tokens exist. On fixed dark/media surfaces, allow surface-scoped high-contrast tokens rather than forcing root light-theme tokens.
  - **Vector SVG Icons vs. Raw Emojis**: Reject raw emoji characters (`📁`, `⚙️`, `🗑️`, `⭐`) in UI markup or mockups; require vector SVG icons bound to `currentColor` (`aria-hidden="true"` when paired with text). Allow icon-only buttons ONLY for universally recognized canonical actions (close, trash delete, settings gear, copy, search) equipped with both `aria-label` and a keyboard- and touch-accessible tooltip (`popover="hint"` / accessible tooltip primitive — NEVER rely on `title` alone); require visible text labels on non-canonical domain actions.
  - **Pragmatic Unmount & Async Focus Retention (No Drop to `document.body`)**: Prevent browser/Chromium focus eviction to `document.body` when an active element unmounts or runs an async action: (a) for **new blocking modal dialogs**, prefer native `<dialog>` with `showModal()` (and `popover` for light-dismiss non-modal overlays) rather than hand-rolling `<div role="dialog">` focus traps; for non-modal drawers, custom/existing UI primitives, or cases where the trigger itself unmounts, ensure focus returns deterministically to the invoking trigger (or designated surviving fallback) on close, (b) deleting/unmounting the currently focused item in a dynamic list must hand off focus synchronously to the adjacent surviving item (`index + 1` or `index - 1`) or empty-state fallback container via a lightweight ref lookup, and (c) focused async action buttons must guard in-flight clicks via state + `aria-disabled="true"` rather than native HTML `disabled` when preserving active focus matters. Ban post-render `setTimeout` DOM query (`document.querySelector`) focus hacks.
  - **Browser-Safe Event Coordination (Ban on `stopPropagation()`)**: Ban `event.stopPropagation()` and `event.stopImmediatePropagation()`. For nested interactive controls inside clickable rows/cards, specify either: (a) **Parent Target Filtering** (parent handler ignores events originating from interactive descendant elements `button, a, input, select, textarea, [role="button"], [data-interactive]`), which is mandatory when children include native checkboxes, radio inputs, links, or submit buttons, OR (b) **Preventable Event Contracts** (`event.preventDefault()` + parent `event.defaultPrevented` check) strictly on custom non-native `type="button"` actions where canceling browser default action is safe.
  - **Front-End DX, Clean Component Architecture & Maintainability**: Require immutable domain entity keys (`key={entity.id}`) on dynamic lists (banning volatile `key={index}`). Enforce single-source-of-truth state without redundant mirror state or fragile ref-map boilerplate when native browser `<button>`/`Tab` semantics suffice. Require clean, extensible component contracts (`children`/slots over boolean prop explosion, `ref` forwarding on shared UI primitives) and deterministic cleanup of timers, observers, and event listeners on unmount.
  - **Stacking Contexts & 3-Tier Layout Precedence**: Require tokenized elevation (`--zIndex-*`) and `isolation: isolate` over magic number z-indices. Apply 3-tier precedence: (1) `Context.md` user directives > (2) existing codebase conventions > (3) defaults: smooth accordion transitions for dynamic slots (preserving error recovery controls in `catch` states), slim top progress lines / inline spinners over heavy skeletons on fast $<200\text{ms}$ loads, and one-click soft-delete with ephemeral Toast Undo (restricting optimistic UI strictly to non-destructive reversible actions).
  - **Staleness Timeouts & Quantitative Progress ($>2\text{s}$)**: Require quantitative progress (`processed / total`, percentage) + Cancel action for operations $>2\text{s}$, and abort only on progress staleness (zero delta over inactivity window) rather than fixed wall-clock timers.
  - **Context-Aware Input Handling & Micro-Copy**: Require whitespace/case tolerance on human search queries, but strict literal preservation on technical identifiers/paths/hex codes. Default micro-copy/wording critiques to non-blocking Suggestions unless factually misleading or inducing destructive data loss.

- **Miss-Probability Gate (Headless AI Implementer Baseline)**:
  Assume the implementer is an AI coding agent that (a) writes production code and tests directly from ticket text in headless CI with no human operating the app, and (b) writes ONLY the tests its ticket's Acceptance Criteria explicitly call for (never unprompted exploratory or adversarial tests). `"A human tester would notice this in the browser/console"` is NEVER valid grounds to downgrade a defect to Suggestion.
  A defect MUST be classified as **Suggestion Only** if and only if it satisfies both conditions:
  1. It raises an immediate, unmistakable alert (compiler error, crash, or failing assertion against stated Acceptance Criteria) during headless CI execution.
  2. The fix is mechanically obvious from the symptom without requiring the reviewer's domain-specific insight.
  Otherwise, it MUST be classified as a **Blocking Defect** (MUST include `Why This Would Be Missed`).
  *(Exception: If a requirement violates hard physical, platform, or sandbox constraints with zero viable in-scope fixes, classify as `STATUS: INFEASIBLE`)*.

## 2. Domain Subdocuments Routing Table (Strict Physical Context Isolation)

Read `## UX/UI & Accessibility Regime` in `<review_dir>/Context.md` (`UX/UI Regime` and `Form Factor`). To prevent cross-regime context contamination, use your native file-reading tool to read **ONLY** the **1 matching Interaction subdocument** AND the **1 matching Layout/Form-Factor subdocument** below — **NEVER read non-matching subdocuments**:

| Axis in `Context.md` | Declared Mode in `Context.md` | Subdocument to Load |
| :--- | :--- | :--- |
| **1. Interaction & DX Regime** *(Pick 1)* | `UX/UI Regime: PRAGMATIC_PRODUCT_UX` *(Default)* | [`UX-PRAGMATIC-INTERACTION-DX.md`](UX-PRAGMATIC-INTERACTION-DX.md) |
| **1. Interaction & DX Regime** *(Pick 1)* | `UX/UI Regime: STRICT_ACCESSIBILITY_COMPLIANCE` (`!A11Y` / `!WCAG`) | [`UX-STRICT-ACCESSIBILITY-WCAG.md`](UX-STRICT-ACCESSIBILITY-WCAG.md) |
| **2. Layout & Form Factor** *(Pick 1)* | `Form Factor: DESKTOP_ONLY` *(Default for Desktop/Electron/Tauri)* | [`UX-DESKTOP-LAYOUT-PERFORMANCE.md`](UX-DESKTOP-LAYOUT-PERFORMANCE.md) |
| **2. Layout & Form Factor** *(Pick 1)* | `Form Factor: CROSS_DEVICE_RESPONSIVE` (`!MOBILE` / `!RESPONSIVE`) | [`UX-MOBILE-RESPONSIVE-PERFORMANCE.md`](UX-MOBILE-RESPONSIVE-PERFORMANCE.md) |

## 3. Verdict Rules & Standard Output Protocol

Write evaluation to `<review_dir>/reports/UXUI.md` via your native file-writing tool, then notify Host via `send_message`:
- `STATUS: PASS`: Interface flows, physical focus retention, layout stability, front-end DX, and active-subdocument requirements are complete.
- `STATUS: REVISIONS NEEDED`: Missing form/loading/error states, unmount focus eviction to `document.body`, raw emojis, unlabeled icon-only buttons, magic z-indices, `stopPropagation()`, volatile `key={index}`, destructive optimistic UI, or defects under the active loaded subdocuments exist.
- `STATUS: INFEASIBLE`: UI requirement violates hard platform/browser constraints (overrides fixable defects as overall status).

```markdown
### Review Evaluation: UXUI

- **Status**: `STATUS: PASS`, `STATUS: REVISIONS NEEDED`, or `STATUS: INFEASIBLE`

### Blocking Issues (Exhaustive List of ALL Identified Defects):
<!-- For Fixable Defects -->
1. **[Issue Title]**:
   - **Target Section**: `<Section_Name>`
   - **Required Fix**: <Diff-ready UI remediation specifying: (1) grounded JSX/TSX/event-handler/tokenized-CSS code blocks aligned strictly with the loaded subdocuments (zero invented tokens and zero magic-pixel offsets), (2) all parallel UI state branches & symmetrical parent/child component props, (3) any [NEW]/[MODIFY]/[DELETE] stylesheet/component Target Files additions, and (4) synchronized test descriptions & atomic Given/When/Then Acceptance Criteria>
   - **Why This Would Be Missed**: <Why a headless AI implementer without eyes or manual browser testing silently misses this UX/focus/DX defect>
   - **Ground-Truth Proof**: <Exact file path and line number verifying theme/elevation tokens, component structure, or view lifecycle on disk>
   - **Macro Flow Proof**: <Proof that layout stability (CLS=0), focus anchor continuity, error recovery controls, and symmetrical state transitions remain intact>

<!-- For Infeasible Defects (forces overall Status to STATUS: INFEASIBLE) -->
1. **[Issue Title]**:
   - **Target Section**: `<Section_Name>`
   - **Infeasibility Proof**: <Empirical proof of browser/OS platform constraint>
   - **Alternative Architectural Paths**: <Viable interaction alternatives>

### Suggestions for Improvement (Non-blocking):
```

## 4. Gate Response Protocol (Host Interaction)

If notified that Host filed `<review_dir>/reports/UXUI_Gated_Issues.md`, read it via your native file-reading tool, execute ONE action below directly via your native file-writing tool (never via helper scripts in `sandbox/UXUI/`), and notify Host via `send_message`:
1. **Refine / Complete as Requested**: Edit `<review_dir>/reports/UXUI.md` in-place via your native file-writing tool to replace any unverified magic-pixel geometry or invented tokens with grounded codebase tokens, supply verified component proofs on disk, decompose compound criteria, or replace unsafe `preventDefault()` demands on native controls with parent target filtering.
2. **Remove**: Edit `<review_dir>/reports/UXUI.md` in-place to remove the invalid/false-positive issue (e.g. out-of-regime or out-of-form-factor demands, or optimistic UI demanded on destructive writes) and update `- **Status**:`.
3. **Reject Gating/Removal and Explain**: Write `<review_dir>/reports/UXUI_Explain.md` with deeper codebase evidence AND update `<review_dir>/reports/UXUI.md` in-place. NEVER repeat stale arguments.
