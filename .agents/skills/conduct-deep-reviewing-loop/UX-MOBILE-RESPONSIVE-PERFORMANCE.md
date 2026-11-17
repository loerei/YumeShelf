# Cross-Device Responsive Layout, Touch Ergonomics, Loading States, and Optimistic UI

**FORM FACTOR GATE**: Load and enforce this subdocument **ONLY** when `<review_dir>/Context.md` declares `Form Factor: CROSS_DEVICE_RESPONSIVE` (triggered by `!MOBILE` / `!RESPONSIVE` or web/PWA/SaaS applications targeting mobile, tablet, and multi-device viewports). **NEVER** apply mobile breakpoint, touch target, or hover-less constraints to `DESKTOP_ONLY` targets.

Audits multi-viewport responsive layout adaptation (`@media` / `@container` from `320px` upward), coarse-pointer touch target sizing ($\ge 44\times 44\text{px}$), hover-less action parity (`@media (hover: none)`), mobile dynamic viewport containment (`100dvh`, `safe-area-inset-*`), Cumulative Layout Shift (CLS) prevention, optimistic UI boundaries, and staleness-based progress timeouts.

## Domain Audit Checklist

### 1. Multi-Viewport Responsive Layout & Mobile Viewport Safety
- [ ] **Fluid Multi-Viewport Breakpoints (`320px` to Desktop)**: Verify layouts adapt smoothly across mobile (`320px–767px`), tablet (`768px–1023px`), and desktop ($\ge 1024\text{px}$) viewports using fluid CSS Grid (`auto-fit` / `minmax()`), Flexbox wrapping, `@media` queries, or `@container` queries without horizontal page overflow (`overflow-x: hidden` masking content is banned).
- [ ] **Dynamic Mobile Viewport Height & Safe Areas (`100dvh` & `safe-area-inset`)**: For full-height mobile drawers, modals, and sticky bottom action bars, require `100dvh` (with `100vh` fallback) and `padding-bottom: env(safe-area-inset-bottom)` so collapsible mobile browser address bars and OS home indicators never obscure primary submit/navigation buttons.
- [ ] **Coarse Pointer Touch Targets ($\ge 44\times 44\text{px}$)**: On touch devices (`@media (pointer: coarse)`), verify interactive controls (buttons, icon triggers, filter chips, pagination links, form inputs) expose a minimum hit target of $44\times 44\text{px}$ with adequate spacing ($\ge 8\text{px}$) to prevent adjacent mis-taps.
- [ ] **Hover-Less Action Parity (`@media (hover: none)`)**: Reject locking primary or secondary actions exclusively behind `:hover` states (e.g. row action buttons or tooltips that only appear on mouse hover). On touch/hover-less viewports (`@media (hover: none)`), surface actions via persistent visible triggers, explicit menu buttons, or tap disclosures.

### 2. Visual Stability & Layout Shift Protections (CLS)
- [ ] **Dimension Reservations**: Verify dynamic images, embeds, and async lazy-loaded elements reserve explicit width/height dimensions, intrinsic `aspect-ratio` boxes, or `contain-intrinsic-size` to guarantee visual layout stability (`CLS = 0`).
- [ ] **Data Fetching & Loading Hierarchy**: Default to slim top-edge progress lines, inline spinners, or dimension-matched skeletons according to codebase convention without causing layout shifts when content resolves.
- [ ] **Empty In-Flow Container Hierarchy (3-Tier Precedence)**: Follow (1) `Context.md` directives > (2) existing codebase conventions > (3) Default: smooth animated accordion transitions (`interpolate-size: allow-keywords` / `<details>` `::details-content` for progressive enhancement, or `grid-template-rows: 0fr -> 1fr` for cross-browser height animation, opting into transitions via `@media (prefers-reduced-motion: no-preference)`) rather than abrupt display toggles, preserving error recovery controls in `catch` blocks.
- [ ] **Scrollbar & Stacking Stability**: Reserve stable scrollbar gutters (`scrollbar-gutter: stable`) on scrollable viewports and use verified elevation tokens (`--zIndex-*`) or `isolation: isolate` rather than magic z-indices.

### 3. Micro-Interaction Responsiveness, Optimistic UI & Staleness Timeouts
- [ ] **Immediate Input Feedback ($<100\text{ms}$)**: Ensure interactive controls supply immediate `:active` / pending visual feedback within $<100\text{ms}$ of touch, click, or keyboard activation (using `touch-action: manipulation` where needed to eliminate $300\text{ms}$ tap delay).
- [ ] **Optimistic Updates & Ephemeral Toast Undo**: Confirm non-destructive mutations update state immediately and roll back with an error toast on failure. **NEVER use optimistic updates for irreversible destructive actions** (permanent deletions, payment submissions, irreversible database writes).
- [ ] **Quantitative Progress ($>2\text{s}$) & Staleness Watchdogs**: Require quantitative progress (`processed / total`, percentage) + Cancel action for operations $>2\text{s}$, and abort strictly on progress staleness (`performance.now()` zero-delta window) rather than fixed wall-clock timers.

## Concrete Anti-Patterns

### Anti-Pattern 1: Fixed `100vh` Modal Clipping & Hover-Only Row Actions on Mobile

```css
/* BAD: 100vh clips bottom footer under mobile browser bar, and hover-only actions are unreachable on touchscreens */
.mobile-sheet-bad {
  height: 100vh;
}
.row-actions-bad {
  opacity: 0;
  pointer-events: none;
}
.row-bad:hover .row-actions-bad {
  opacity: 1;
  pointer-events: auto;
}

/* GOOD: 100dvh + safe-area-inset-bottom, coarse-pointer 44px hit targets, and hover-none visibility fallback */
.mobile-sheet-safe {
  max-height: 100vh;
  max-height: 100dvh;
  padding-bottom: env(safe-area-inset-bottom, 0px);
  display: flex;
  flex-direction: column;
}
.row-actions-safe {
  opacity: 0;
  pointer-events: none;
}
.row-safe:hover .row-actions-safe,
.row-safe:focus-within .row-actions-safe {
  opacity: 1;
  pointer-events: auto;
}
@media (hover: none), (pointer: coarse) {
  .row-actions-safe {
    opacity: 1;
    pointer-events: auto;
  }
  .touch-target-btn {
    min-width: 44px;
    min-height: 44px;
    touch-action: manipulation;
  }
}
```
- **Acceptance Criterion**: *Given* a mobile touch viewport (`hover: none, pointer: coarse`) at `375px` width, *when* the sheet and list rows render, *then* the sheet footer remains above the OS home indicator (`100dvh` + `safe-area-inset-bottom`), row action triggers remain visible without hover, and interactive buttons expose a $\ge 44\times 44\text{px}$ hit area.

### Anti-Pattern 2: Rigid Multi-Column Grid Overflowing Narrow Viewports

```css
/* BAD: Fixed 4-column grid forces horizontal overflow on <768px screens */
.card-grid-bad {
  display: grid;
  grid-template-columns: repeat(4, 280px);
}

/* GOOD: Fluid container-aware responsive grid that collapses gracefully down to 1 column on 320px screens */
.card-grid-wrapper {
  container-type: inline-size;
}
.card-grid-safe {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr));
  gap: var(--space-4, 16px);
}
```
- **Acceptance Criterion**: *Given* `.card-grid-safe` rendered inside a `320px` mobile viewport and a `1280px` desktop viewport, *when* layout is computed, *then* cards collapse to a single full-width column at `320px` with zero horizontal scroll overflow (`scrollWidth <= clientWidth`) and expand to multiple columns at `1280px`.

### Anti-Pattern 3: Arbitrary Wall-Clock Timeout Penalizing Active Progress

```typescript
// GOOD: Rolling staleness watchdog resets on positive progress delta (processed > lastProcessed)
export async function runWithStalenessWatchdog(
  payload: Blob,
  inactivityLimitMs: number,
  updateUI: (done: number, total: number) => void
) {
  const controller = new AbortController();
  let lastProcessed = -1;
  let lastProgressMono = performance.now();

  const watchdog = setInterval(() => {
    if (performance.now() - lastProgressMono > inactivityLimitMs) {
      controller.abort(new Error("Stalled: zero progress within inactivity window"));
    }
  }, 1000);

  try {
    await uploadLargePayload(payload, {
      signal: controller.signal,
      onProgress: (processed: number, total: number) => {
        if (processed > lastProcessed) {
          lastProcessed = processed;
          lastProgressMono = performance.now();
        }
        updateUI(processed, total);
      }
    });
  } finally {
    clearInterval(watchdog);
  }
}
```
- **Acceptance Criterion**: *Given* an upload exceeding 30s on a slow mobile connection that emits positive progress deltas every 2s under a 10s inactivity threshold, *when* executed, *then* the upload completes without premature abort; *when* progress stalls with zero delta for $>10\text{s}$, *then* `controller.abort` fires.

## Failure Modes & Mitigations

- **Clipped Mobile Bottom Actions**: Use `100dvh` and `env(safe-area-inset-bottom)` instead of fixed `100vh` on mobile drawers and sheets.
- **Unreachable Hover-Only Controls on Touchscreens**: Provide `@media (hover: none)` fallbacks or explicit menu triggers for hover-revealed actions.
- **Fat-Finger Mis-Taps**: Enforce $\ge 44\times 44\text{px}$ hit targets under `@media (pointer: coarse)` with `touch-action: manipulation`.
- **Horizontal Scroll Overflow at `320px`**: Use `minmax(min(100%, <min_card_width>), 1fr)` and `min-width: 0` on flex/grid children.
- **Cumulative Layout Shifts (`CLS > 0`)**: Reserve intrinsic dimensions (`aspect-ratio`, `contain-intrinsic-size`) and use opt-in `interpolate-size: allow-keywords` or `0fr -> 1fr` transitions under `@media (prefers-reduced-motion: no-preference)`.
