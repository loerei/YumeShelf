# UXUI Subdocument: Responsive Layout Shift & Optimistic UI Feedback

## Domain Audit Checklist

### 1. Layout Shift Protections (CLS)
- [ ] Dimension Reservations: Verify dynamic images, ad placements, and async lazy-loaded elements set dynamic intrinsic aspect ratio boxes to prevent visual layout jumps.
- [ ] Skeleton Layout Placeholders: Confirm data fetching views display visual structural skeleton placeholders that mirror final element dimensions.

### 2. Micro-Interaction Responsiveness
- [ ] Immediate Touch Feedback: Ensure interactive elements supply immediate visual active state feedback within $<100\text{ms}$ of user touch or click events.
- [ ] Optimistic Updates with Graceful Rollback: Confirm optimistic UI mutations update state immediately and provide safe automatic rollback with notification toasts if backend processing fails.

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

## Failure Modes & Mitigations

- Cumulative Layout Shifts Disrupting User Interaction: Enforce CSS `contain-intrinsic-size` properties on off-screen dynamic components.
- Unhandled Optimistic Mutation Desynchronization: Enforce periodic background re-validation fetches (SWR patterns) after optimistic state mutations complete.
