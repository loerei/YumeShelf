# UXUI Subdocument: Responsive Layout Shift & Optimistic UI Feedback

## Domain Audit Checklist

### 1. Visual Stability & Layout Shift Protections (CLS)
- [ ] Dimension Reservations: Verify dynamic images, ad placements, embeds, and async lazy-loaded elements set explicit dimensional width/height attributes or dynamic intrinsic aspect ratio boxes (`aspect-ratio: auto`) to guarantee visual layout stability.
- [ ] Data Fetching & Layout Stability (Top Progress Line / Spinner vs Skeleton): To prevent layout jumps without causing jarring skeleton shimmer flashes on fast local/desktop loads (<200ms), default to slim top progress lines (e.g. edge progress bar) or lightweight inline spinners over heavy skeleton blocks, unless explicit skeleton placeholders are established by codebase convention.
- [ ] Empty In-Flow Container Hierarchy: When containers dynamically appear or clear their contents (e.g. empty toolbars, contextual action bars), follow the 3-tier precedence: (1) `Context.md` directives, (2) existing codebase conventions, (3) Default: smooth animated accordion transitions (e.g. CSS grid `grid-template-rows: 0fr -> 1fr` with opacity and easing) rather than abrupt non-animated display toggles, strictly preserving error recovery paths in `catch` blocks.

### 2. Micro-Interaction Responsiveness
- [ ] Immediate Touch Feedback: Ensure interactive elements supply immediate visual active state feedback within $<100\text{ms}$ of user touch or click events.
- [ ] Optimistic Updates & Ephemeral Toast Undo: Confirm optimistic UI mutations update state immediately and provide safe automatic rollback with notification toasts if backend processing fails. For non-destructive list item removals, update the UI immediately (collapsing the list item) and provide an ephemeral floating Toast containing an "Undo" action (e.g. 5s window). Strictly BAN replacing the deleted item with an in-place "Undo" slot that stalls sidebar/list layout updates. Scope Boundary: Strictly limited to non-destructive, idempotently reversible actions (e.g. toggles, likes, local filtering). Strictly BAN demanding optimistic UI for destructive operations (e.g. file deletions, binary overwrites, schema migrations, or irreversible database writes) where rollback cannot guarantee data integrity.

### 3. Long-Running Progress & Staleness Timeouts
- [ ] Quantitative Progress Revealing: Verify operations taking $>2\text{s}$ provide deterministic quantitative progress (`processed / total`, percentage, bytes/items) and user cancellation agency instead of an opaque indeterminate spinner.
- [ ] Staleness-Based Timeout (Inactivity vs Wall-Clock): Confirm timeouts abort strictly on progress staleness (e.g. 10s of zero delta/activity) rather than arbitrary total elapsed wall-clock duration that penalizes healthy, active progress.

## Concrete Anti-Patterns

> [!IMPORTANT]
> **Conceptual Reference Notice**: Code snippets in this subdocument are for conceptual reference and illustrative purposes only. UX/UI Reviewers are strictly prohibited from copying concrete CSS or DOM code into review reports. All report findings must use Abstract Behavioral Specifications with Acceptance Criteria.

### Anti-Pattern 1: Un-Optimistic Async Mutate Delay

```jsx
// BAD: UI waits for slow network API response before showing any visual changes.
function LikeButton({ postId }) {
  const [liked, setLiked] = useState(false);
  
  const handleLike = async () => {
    await api.post(`/posts/${postId}/like`); // 800ms delay!
    setLiked(true); // UI feels sluggish and unresponsive!
  };
  
  return <button onClick={handleLike}>{liked ? 'Liked' : 'Like'}</button>;
}

// GOOD: Optimistic Update with Automatic Failure Rollback
function LikeButton({ postId }) {
  const [liked, setLiked] = useState(false);
  
  const handleLike = async () => {
    const previousState = liked;
    setLiked(!previousState); // Immediate UI Feedback!
    
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
// BAD: Rigid 30s wall-clock timeout kills operation mid-flight even when progress reaches 98%!
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
    lastProgressTime = Date.now(); // Active progress proves system health!
    updateProgressBar(processed, total);
  }
});
clearInterval(watchdog);
```

### Anti-Pattern 3: Abrupt Non-Animated In-Flow Container Toggling

```javascript
// BAD: Abruptly toggling display: none / flex causes severe 48-70px layout jumps and destroys recovery buttons in catch
if (overrideMissing) {
  toolbar.style.display = 'none'; // Jumps layout, hides recovery path!
}

// GOOD: Smooth hardware-accelerated grid accordion transition with persistent recovery capability
// CSS:
// .toolbar-wrapper { display: grid; grid-template-rows: 0fr; opacity: 0; transition: grid-template-rows 0.3s ease, opacity 0.25s ease; }
// .toolbar-wrapper.expanded { grid-template-rows: 1fr; opacity: 1; }
// JS: Always maintain error recovery triggers in catch blocks regardless of collapse state
```

## Failure Modes & Mitigations

- Cumulative Layout Shifts Disrupting User Interaction: Enforce CSS `contain-intrinsic-size` properties on off-screen dynamic components and smooth animated accordion transitions (or dimensional reservations) on dynamic in-flow containers.
- Unhandled Optimistic Mutation Desynchronization: Enforce periodic background re-validation fetches (SWR patterns) after optimistic state mutations complete.
- Wall-Clock Timeout Aborting Near-Complete Operations: Replace rigid total execution timers with rolling inactivity watchdogs that trigger only when no forward delta occurs for $>10\text{s}$.
