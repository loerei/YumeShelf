# Desktop Window Layout Stability, Loading States, Optimistic UI, and Progress Revealing

**FORM FACTOR GATE**: Load and enforce this subdocument **ONLY** when `<review_dir>/Context.md` declares `Form Factor: DESKTOP_ONLY` (Electron, Tauri, native desktop GUI, or desktop-only web tools with fine pointer mouse/trackpad and bounded window dimensions).

Audits Cumulative Layout Shift (CLS) prevention, desktop window resize resilience (`min-width: 0` flex/grid truncation, modal scroll containment), loading state hierarchy, optimistic UI boundaries, and staleness-based progress timeouts. Pair grounded TSX/JS and tokenized CSS remediations with atomic Given/When/Then acceptance criteria (never invent unverified token names or magic-pixel offsets).

## Domain Audit Checklist

### 1. Desktop Window Layout Stability & CLS Prevention
- [ ] **Dimension Reservations & Virtualizer Calibration**: Verify dynamic images, media cards, and virtualized lists reserve explicit dimensions (`aspect-ratio`, `contain-intrinsic-size`, or schema-accurate dynamic `estimateSize` functions in virtualizers) so scrolling and async asset loading produce zero layout jumps (`CLS = 0`).
- [ ] **Flex/Grid Overflow & Long-String Truncation (`min-width: 0`)**: On desktop apps displaying user file paths, save slots, logs, or game titles, verify flex and grid children set `min-width: 0` (and `overflow: hidden; text-overflow: ellipsis; white-space: nowrap` or `overflow-wrap: anywhere`) so long unbroken strings never blow out container widths or push action buttons off-window when the desktop window is resized within its supported `minWidth`.
- [ ] **Modal & Panel Scroll Containment**: Confirm desktop modals, sidebars, and popovers bound their maximum height relative to the window (`max-height`, `overflow-y: auto`) with fixed headers/footers so long lists or settings panels remain scrollable without clipping action buttons outside the window frame.
- [ ] **Data Fetching & Loading Hierarchy (Top Progress Line / Spinner vs. Skeleton)**: To prevent layout jumps without causing jarring skeleton shimmer flashes on fast local/desktop loads ($<200\text{ms}$), default to slim top-edge progress lines or lightweight inline spinners over heavy skeleton blocks, unless explicit skeleton placeholders are established by codebase convention.
- [ ] **Empty In-Flow Container Hierarchy (3-Tier Precedence)**: When containers dynamically appear or clear their contents (e.g. empty toolbars, contextual action bars), follow the 3-tier precedence: (1) `Context.md` directives > (2) existing codebase conventions > (3) Default: smooth animated accordion transitions (preferring native `<details>` + `interpolate-size: allow-keywords` / `::details-content` where progressive enhancement fits, or `grid-template-rows: 0fr -> 1fr` when cross-browser animated height is required) rather than abrupt non-animated display toggles, opting into motion via `@media (prefers-reduced-motion: no-preference)` and strictly preserving error recovery controls in `catch` blocks.
- [ ] **Scrollbar & Stacking Stability**: Verify overlays and dynamic panes reserve stable scrollbar gutters (`scrollbar-gutter: stable`) to eliminate horizontal layout jumps without custom JS padding hacks, and use verified design system elevation tokens (`--zIndex-*`) or local stacking context isolation (`isolation: isolate`) rather than magic integer z-indices.
- [ ] **Declarative Transitions & Reflow Prevention**: Verify dynamic elements transitioning between states use declarative CSS transitions/animations (`onTransitionEnd`, `@starting-style`, `transition-behavior: allow-discrete`) rather than brittle `setTimeout` chains, and batch all DOM geometry reads before scheduling writes in `requestAnimationFrame()`.

### 2. Micro-Interaction Responsiveness & Optimistic UI
- [ ] **Immediate Input Feedback ($<100\text{ms}$)**: Ensure interactive elements supply immediate visual active/pending state feedback within $<100\text{ms}$ of pointer click or keyboard activation.
- [ ] **Optimistic Updates & Ephemeral Toast Undo**: Confirm optimistic UI mutations update state immediately, revalidate in the background (SWR), and roll back automatically with an error toast if backend/IPC processing fails. For non-destructive list item removals, collapse the item immediately and provide a floating Undo toast without leaving a stalled in-place placeholder slot. **NEVER use optimistic updates for irreversible destructive actions** (permanent file deletions, binary save overwrites, schema migrations, irreversible database writes).

### 3. Long-Running Progress & Staleness Timeouts
- [ ] **Quantitative Progress Revealing ($>2\text{s}$)**: Verify operations taking $>2\text{s}$ provide deterministic quantitative progress (`processed / total`, percentage, bytes/items) and a user-accessible Cancel/Abort action instead of an opaque indeterminate spinner.
- [ ] **Staleness-Based Timeout (Inactivity vs. Wall-Clock)**: Confirm timeouts abort strictly on progress staleness (zero forward delta over a configurable inactivity window measured via `performance.now()`) rather than an arbitrary total elapsed wall-clock duration that aborts healthy, actively progressing jobs.

## Concrete Anti-Patterns

### Anti-Pattern 1: Unbounded Flex Child Blowout on Long Desktop File Paths

```css
/* BAD: Long unbroken file path pushes sibling action buttons out of the desktop row container */
.save-slot-row-bad {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.save-slot-path-bad {
  flex: 1;
}

/* GOOD: min-width: 0 + text-overflow: ellipsis keeps row actions pinned inside the window */
.save-slot-row-safe {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
}
.save-slot-path-safe {
  flex: 1 1 0%;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.save-slot-actions-safe {
  flex-shrink: 0;
}
```
- **Acceptance Criterion**: *Given* a desktop row displaying a 260-character unbroken file path alongside action buttons, *when* rendered at the minimum window width, *then* `.save-slot-path-safe` truncates with an ellipsis (`min-width: 0`) and `.save-slot-actions-safe` remains fully visible and clickable within the row bounds.

### Anti-Pattern 2: Un-Optimistic Async Mutate Delay on Non-Destructive Action

```tsx
// BAD: UI blocks for 500ms IPC/network roundtrip on a simple reversible favorite toggle
function FavoriteButtonBad({ itemId }: { itemId: string }) {
  const [fav, setFav] = useState(false);
  const handleToggle = async () => {
    await api.setFavorite(itemId, !fav);
    setFav(!fav);
  };
  return <button onClick={handleToggle}>{fav ? "Favorited" : "Favorite"}</button>;
}

// GOOD: Optimistic transition (<100ms) with deterministic rollback and error toast on failure
function FavoriteButtonSafe({ itemId, notifyError }: { itemId: string; notifyError: (msg: string) => void }) {
  const [fav, setFav] = useState(false);
  const handleToggle = async () => {
    const prev = fav;
    setFav(!prev);
    try {
      await api.setFavorite(itemId, !prev);
    } catch {
      setFav(prev);
      notifyError("Failed to update favorite status. Changes reverted.");
    }
  };
  return <button type="button" aria-pressed={fav} onClick={handleToggle}>{fav ? "Favorited" : "Favorite"}</button>;
}
```
- **Acceptance Criterion**: *Given* an unfavorited item, *when* the user clicks the Favorite toggle, *then* visual state updates immediately before the async promise settles; *if* the call rejects, *then* state reverts to `prev` and an error toast is shown.

### Anti-Pattern 3: Arbitrary Wall-Clock Timeout Penalizing Active Progress (Slowness vs. Staleness)

```typescript
// BAD: Fixed 30s wall-clock timeout aborts a large archive extraction that is actively progressing at 85%
const controller = new AbortController();
setTimeout(() => controller.abort(new Error("Operation timed out")), 30000);
await extractArchive(file, { signal: controller.signal, onProgress: (pct) => updateUI(pct) });

// GOOD: Rolling staleness watchdog resets on positive progress delta (processed > lastProcessed)
export async function runWithStalenessWatchdog(
  file: Blob,
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
    await extractArchive(file, {
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
- **Acceptance Criterion**: *Given* a batch job exceeding 30s total runtime that emits positive progress deltas every 2s under a 10s inactivity threshold, *when* executed, *then* the job completes without premature abort; *when* progress stalls with zero delta for $>10\text{s}$, *then* `controller.abort` fires.

### Anti-Pattern 4: Abrupt Display Toggling & Imperative `setTimeout` Unmount

```css
/* GOOD: Opt in to height/opacity motion only under prefers-reduced-motion: no-preference */
/* Option A (Progressive enhancement): native intrinsic size interpolation (Chrome/Edge 129+, instant toggle elsewhere) */
:root {
  interpolate-size: allow-keywords;
}
.collapsible-slot {
  block-size: 0;
  opacity: 0;
  overflow: hidden;
}
.collapsible-slot[data-expanded="true"] {
  block-size: auto;
  opacity: 1;
}
@media (prefers-reduced-motion: no-preference) {
  .collapsible-slot {
    transition: block-size 200ms ease, opacity 150ms ease;
  }
}

/* Option B (Cross-browser animated height): grid-template-rows 0fr -> 1fr with opt-in motion */
@media (prefers-reduced-motion: no-preference) {
  .collapsible-grid-slot {
    transition: grid-template-rows 200ms ease, opacity 150ms ease;
  }
}
```
- **Acceptance Criterion**: *Given* a dynamic toolbar or drawer slot, *when* it expands or collapses, *then* height transitions via `interpolate-size: allow-keywords` (or cross-browser `grid-template-rows: 0fr -> 1fr`) only under `prefers-reduced-motion: no-preference` without `setTimeout` unmount timers, stalled `transitionend` listeners when `getAnimations()` is empty, or interleaved DOM read-after-write loops, while keeping Retry controls mounted on error states.

## Failure Modes & Mitigations

- **Cumulative Layout Shifts (`CLS > 0`)**: Reserve intrinsic dimensions (`contain-intrinsic-size`, `aspect-ratio`, calibrated virtualizer `estimateSize`) on dynamic media/lists and use opt-in `interpolate-size: allow-keywords` or `0fr -> 1fr` transitions on collapsible in-flow slots.
- **Desktop Flex/Grid Text Blowout**: Add `min-width: 0` and `text-overflow: ellipsis` on flexible text columns and `flex-shrink: 0` on adjacent action toolbars.
- **Optimistic State Drift**: Pair optimistic mutations with automatic error rollback and background revalidation; never apply optimistic UI to destructive writes.
- **Wall-Clock Timeout Killing Healthy Jobs**: Use rolling staleness watchdogs reset by forward progress deltas (`processed > lastProcessed`) via `performance.now()`.
- **Horizontal Jump on Modal Open**: Reserve stable scrollbar gutters (`scrollbar-gutter: stable`) on root/scrollable containers.
