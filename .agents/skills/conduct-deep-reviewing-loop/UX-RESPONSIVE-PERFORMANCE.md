# UXUI Subdocument: Responsive Layout Shift & Optimistic UI Feedback

## Domain Audit Checklist

### 1. Visual Stability & Layout Shift Protections (CLS)
- [ ] Dimension Reservations: Verify dynamic images, ad placements, embeds, and async lazy-loaded elements set explicit dimensional width/height attributes or dynamic intrinsic aspect ratio boxes (`aspect-ratio: auto`) to guarantee visual layout stability.
- [ ] Skeleton Layout Placeholders: Confirm data fetching views display visual structural skeleton placeholders that mirror final element dimensions to prevent visual layout jumps.

### 2. Micro-Interaction Responsiveness
- [ ] Immediate Touch Feedback: Ensure interactive elements supply immediate visual active state feedback within $<100\text{ms}$ of user touch or click events.
- [ ] Optimistic Updates with Graceful Rollback: Confirm optimistic UI mutations update state immediately and provide safe automatic rollback with notification toasts if backend processing fails.

### 3. Long-Running Progress & Staleness Timeouts
- [ ] Quantitative Progress Revealing: Verify operations taking $>2\text{s}$ provide deterministic quantitative progress (`processed / total`, percentage, bytes/items) and user cancellation agency instead of an opaque indeterminate spinner.
- [ ] Staleness-Based Timeout (Inactivity vs Wall-Clock): Confirm timeouts abort strictly on progress staleness (e.g. 10s of zero delta/activity) rather than arbitrary total elapsed wall-clock duration that penalizes healthy, active progress.

## Concrete Anti-Patterns

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

## Failure Modes & Mitigations

- Cumulative Layout Shifts Disrupting User Interaction: Enforce CSS `contain-intrinsic-size` properties on off-screen dynamic components.
- Unhandled Optimistic Mutation Desynchronization: Enforce periodic background re-validation fetches (SWR patterns) after optimistic state mutations complete.
- Wall-Clock Timeout Aborting Near-Complete Operations: Replace rigid total execution timers with rolling inactivity watchdogs that trigger only when no forward delta occurs for $>10\text{s}$.
