# Performance Subdocument: Frontend Rendering, Virtualization & Bundle Optimization

## Domain Audit Checklist

### 1. Rendering Pipeline Optimization
- [ ] Component Re-render Loops: Verify that reactive state objects (React, Vue, Svelte) are scope-isolated to prevent unnecessary top-level subtree re-renders.
- [ ] List Virtualization: Confirm dynamic lists exceeding 100 items utilize DOM virtualization libraries (`react-window`, `react-virtualized`).

### 2. Main-Thread Layout Execution
- [ ] Layout Thrashing Avoidance: Ensure read-write operations targeting the DOM are batched together. Reject alternating sequence calls of layout readings (`element.offsetHeight`) and layout writes (`element.style.height`).
- [ ] Bundle Size Optimization: Verify large third-party libraries implement tree-shaking exports or code-splitting via dynamic import statements (`import()`).

## Concrete Anti-Patterns

### Anti-Pattern 1: Un-Virtualised Dynamic List Rendering

```jsx
// BAD: Rendering 5,000 DOM nodes creates severe main-thread layout thrashing and high memory overhead.
function UserList({ users }) {
  return (
    <div>
      {users.map(user => <UserCard key={user.id} user={user} />)}
    </div>
  );
}

// GOOD: Use Virtualized Windowing to render only visible viewport items
import { FixedSizeList } from 'react-window';

function UserList({ users }) {
  const Row = ({ index, style }) => (
    <div style={style}><UserCard user={users[index]} /></div>
  );
  
  return (
    <FixedSizeList height={600} itemCount={users.length} itemSize={50} width="100%">
      {Row}
    </FixedSizeList>
  );
}
```

## Failure Modes & Mitigations

- Main Thread Blocking via Large Synchronous Computation: Offload non-UI tasks (data transformation, parsing) to dynamic Web Workers.
- Forced Synchronous Layout & Reflow Thrashing: Avoid repetitive DOM geometry recalculations; isolate DOM mutations and batch read/write cycles using requestAnimationFrame or ResizeObserver to eliminate browser engine reflow penalties.
