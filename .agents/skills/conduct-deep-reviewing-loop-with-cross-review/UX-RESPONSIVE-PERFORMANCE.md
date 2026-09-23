# Layout Shift, Loading States, and Optimistic UI

## Domain Audit Checklist

### 1. Visual Stability & Layout Shift Protections (CLS)
- [ ] Dimension Reservations: Verify dynamic images, ad placements, embeds, and async lazy-loaded elements set explicit dimensional width/height attributes or dynamic intrinsic aspect ratio boxes (`aspect-ratio: auto`) to guarantee visual layout stability.
- [ ] Data Fetching & Layout Stability (Top Progress Line / Spinner vs Skeleton): To prevent layout jumps without causing jarring skeleton shimmer flashes on fast local/desktop loads (<200ms), default to slim top progress lines (e.g. edge progress bar) or lightweight inline spinners over heavy skeleton blocks, unless explicit skeleton placeholders are established by codebase convention.
- [ ] Empty In-Flow Container Hierarchy: When containers dynamically appear or clear their contents (e.g. empty toolbars, contextual action bars), follow the 3-tier precedence: (1) `Context.md` directives, (2) existing codebase conventions, (3) Default: smooth animated accordion transitions (e.g. CSS grid `grid-template-rows: 0fr -> 1fr` with opacity and easing) rather than abrupt non-animated display toggles, strictly preserving error recovery paths in `catch` blocks.
- [ ] Scrollbar Layout Stability: Verify overlays and dynamic drawers mandate `scrollbar-gutter: stable` to eliminate visual layout shifts without custom JavaScript padding adjustments.
- [ ] Declarative Transitions: Verify dynamic elements transitioning between states do not use brittle JavaScript timers (`setTimeout`) to synchronize visibility.
- [ ] Layout Thrashing Prevention: Verify dynamic geometry adaptations use CSS Container Queries (`@container`) or batch all DOM layout reads prior to scheduling writes in `requestAnimationFrame()`.

### 2. Micro-Interaction Responsiveness
- [ ] Immediate Touch Feedback: Ensure interactive elements supply immediate visual active state feedback within $<100\text{ms}$ of user touch or click events.
- [ ] Optimistic Updates & Ephemeral Toast Undo: Confirm optimistic UI mutations update state immediately and provide safe automatic rollback with notification toasts if backend processing fails. For non-destructive list item removals, collapse the item immediately and provide a floating undo toast; do not leave an in-place placeholder slot. Never use optimistic updates for destructive actions (file deletions, binary overwrites, schema migrations, irreversible database writes).

### 3. Long-Running Progress & Staleness Timeouts
- [ ] Quantitative Progress Revealing: Verify operations taking $>2\text{s}$ provide deterministic quantitative progress (`processed / total`, percentage, bytes/items) and an abort action instead of an opaque indeterminate spinner.
- [ ] Staleness-Based Timeout (Inactivity vs Wall-Clock): Confirm timeouts abort strictly on progress staleness (e.g. 10s of zero delta/activity) rather than arbitrary total elapsed wall-clock duration that penalizes healthy, active progress.

## Concrete Anti-Patterns

> [!IMPORTANT]
> Code snippets are illustrative only. Do not copy code into review reports; write Abstract Behavioral Specifications with Acceptance Criteria instead.

### Anti-Pattern 1: Un-Optimistic Async Mutate Delay

```jsx
// BAD: UI waits for slow network API response before showing any visual changes.
function LikeButton({ postId }) {
  const [liked, setLiked] = useState(false);
  
  const handleLike = async () => {
    await api.post(`/posts/${postId}/like`); // 800ms delay
    setLiked(true); // UI feels sluggish and unresponsive
  };
  
  return <button onClick={handleLike}>{liked ? 'Liked' : 'Like'}</button>;
}

// GOOD: Optimistic Update with Automatic Failure Rollback
function LikeButton({ postId }) {
  const [liked, setLiked] = useState(false);
  
  const handleLike = async () => {
    const previousState = liked;
    setLiked(!previousState); // Immediate UI feedback
    
    try {
      await api.post(`/posts/${postId}/like`);
    } catch (err) {
      setLiked(previousState); // Revert on failure
      toast.error("Failed to update like status. Please try again.");
    }
  };
  
  return <button onClick={handleLike}>{liked ? 'Liked' : 'Like'}</button>;
}
```

### Anti-Pattern 2: Arbitrary Wall-Clock Timeout Penalizing Active Progress (Slowness vs Staleness)

```javascript
// BAD: Fixed 30s timeout aborts an operation actively making progress
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(new Error("Operation timed out")), 30000);
await processLargePayload(file, { signal: controller.signal, onProgress: (pct) => updateUI(pct) });

// GOOD: Rolling Inactivity Watchdog resets whenever forward progress occurs
let lastProgressTime = Date.now();
const STALENESS_THRESHOLD_MS = 10000; // 10s of complete stagnation

const watchdog = setInterval(() => {
  if (Date.now() - lastProgressTime > STALENESS_THRESHOLD_MS) {
    clearInterval(watchdog);
    controller.abort(new Error("Operation hung: no progress delta for 10s"));
  }
}, 1000);

await processLargePayload(file, {
  signal: controller.signal,
  onProgress: (processed, total) => {
    lastProgressTime = Date.now(); // Active progress proves system health
    updateProgressBar(processed, total);
  }
});
clearInterval(watchdog);
```

### Anti-Pattern 3: Abrupt Non-Animated In-Flow Container Toggling

```javascript
// BAD: Abruptly toggling display: none / flex causes layout jumps and destroys recovery buttons in catch
if (overrideMissing) {
  toolbar.style.display = 'none'; // Jumps layout, hides recovery path
}

// GOOD: Smooth hardware-accelerated grid accordion transition with persistent recovery capability
// CSS:
// .toolbar-wrapper { display: grid; grid-template-rows: 0fr; opacity: 0; transition: grid-template-rows 0.3s ease, opacity 0.25s ease; }
// .toolbar-wrapper.expanded { grid-template-rows: 1fr; opacity: 1; }
// JS: Always maintain error recovery triggers in catch blocks regardless of collapse state
```

### Anti-Pattern 4: Imperative JavaScript Animation Timers (setTimeout)

```javascript
// BAD: Imperative setTimeout chains to synchronize display with CSS animation duration
function TransitionOverlay({ isOpen, children }) {
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      const t1 = setTimeout(() => setIsVisible(true), 20); // Brittle timer
      return () => clearTimeout(t1);
    } else {
      setIsVisible(false);
      const t2 = setTimeout(() => setShouldRender(false), 300); // Out of sync with CSS
      return () => clearTimeout(t2);
    }
  }, [isOpen]);

  if (!shouldRender) return null;
  return <div className={`modal ${isVisible ? 'fade-in' : 'fade-out'}`}>{children}</div>;
}

// GOOD: Declarative CSS transitions or animation end events without manual timers
// CSS:
// .panel { opacity: 0; transform: translateY(-8px); transition: opacity 200ms ease, transform 200ms ease; }
// .panel.open { opacity: 1; transform: translateY(0); }
// @media (prefers-reduced-motion: reduce) { .panel { transition: none; transform: none; } }
```

### Anti-Pattern 5: Forced Synchronous Layout (Layout Thrashing)

```javascript
// BAD: Interleaving DOM reads and writes forces browser reflow on every loop iteration
window.addEventListener('resize', () => {
  const cards = document.querySelectorAll('.dynamic-card');
  cards.forEach((card) => {
    const parentHeight = card.parentElement.offsetHeight; // Forced reflow read
    if (parentHeight > 400) {
      card.style.height = `${parentHeight / 2}px`; // Style write invalidation
    }
  });
});

// GOOD: Pure CSS Container Queries without JavaScript measurement overhead
// @container card-container (min-height: 400px) {
//   .dynamic-card { height: 50cqh; contain: layout style; }
// }

// GOOD (when JS measurement is mandatory): Batch all reads first, schedule writes in RAF
function synchronizeCardHeights(cards) {
  const measurements = cards.map(card => ({
    element: card,
    targetHeight: card.parentElement.offsetHeight > 400 ? card.parentElement.offsetHeight / 2 : null
  }));
  requestAnimationFrame(() => {
    measurements.forEach(({ element, targetHeight }) => {
      if (targetHeight !== null) element.style.height = `${targetHeight}px`;
    });
  });
}
```

## Failure Modes & Mitigations

- Cumulative Layout Shifts Disrupting User Interaction: Enforce CSS `contain-intrinsic-size` properties on off-screen dynamic components and smooth animated accordion transitions (or dimensional reservations) on dynamic in-flow containers.
- Unhandled Optimistic Mutation Desynchronization: Enforce periodic background re-validation fetches (SWR patterns) after optimistic state mutations complete.
- Wall-Clock Timeout Aborting Near-Complete Operations: Replace rigid total execution timers with rolling inactivity watchdogs that trigger only when no forward delta occurs for $>10\text{s}$.
- Animation Timer Drift & Leakage: Replace imperative `setTimeout` chains with declarative CSS `@starting-style` and `transition-behavior: allow-discrete`.
- Frame Drops from Layout Thrashing: Replace imperative window resize loops with CSS Container Queries (`@container`) or batch geometric reads before `requestAnimationFrame()` writes.
- Layout Jumps on Modal Open: Mandate `scrollbar-gutter: stable` in root/dialog styles to eliminate scrollbar disappearance shifts.
