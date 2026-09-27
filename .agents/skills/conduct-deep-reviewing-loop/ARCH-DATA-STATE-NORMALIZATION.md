# In-Memory State Normalization, State Machines, and Collection Topology

Audits state store structure, illegal state representation, relational indexing, and in-memory collection performance.

## Domain Audit Checklist

### 1. State Normalization and Relational Indexing
- [ ] Relational Normalization: Verify entity collections in state stores or caches are normalized by unique ID (`byId: Record<Id, Entity>`, `allIds: Id[]`). Reject nested duplicate entity trees.
- [ ] Single Source of Truth: Reject storing derived state (filtered lists, item counts, calculated totals) in primary stores. Derived values must be computed on demand via pure selector functions.
- [ ] Relational References: Verify entities reference related records using scalar IDs or ID arrays (`authorId: string`) rather than nesting full foreign entity objects.

### 2. Making Illegal States Unrepresentable
- [ ] Discriminated Unions for Lifecycles: Reject multi-boolean flag soup (`isLoading`, `isError`, `isSuccess`) for stateful workflows. Require Discriminated Unions or Algebraic Data Types modeling explicit mutually exclusive states.
- [ ] Payload Association: Ensure error messages and payload data are attached strictly to their corresponding state variant (e.g., `error` exists only on `Failure`, `data` exists only on `Success`).
- [ ] Exhaustive State Transitions: Verify finite state machines enforce valid transitions and reject impossible transitions at compile-time or through strict state reducers.

### 3. Collection Selection and Access Complexity
- [ ] Hot-Path Key Lookups: Reject array linear scans (`find`, `filter`) inside high-frequency execution loops. Lookups over collections with $> 50$ items or inside nested loops must use `Map` or keyed records ($O(1)$ amortized).
- [ ] Membership Testing: Collections evaluated for element existence or deduplication must use `Set` ($O(1)$) rather than `Array.includes()` ($O(N)$).
- [ ] Prefix and Route Matching: Hierarchical routing, path matching, or autocomplete searches over variable string prefixes must use a Prefix Trie ($O(K)$) rather than iterated regex array sweeps.
- [ ] Sliding Windows & Telemetry Buffers: Fixed-capacity buffers, recent event queues, and rate-limiting windows must use Circular Ring Buffers to eliminate continuous memory reallocation and $O(N)$ array shifts.

### 4. Immutability and Structural Sharing
- [ ] Structural Sharing: State mutation pipelines in reactive architectures must update state trees immutably while preserving references to unchanged branches.
- [ ] Shallow Copy Discipline: Avoid deep cloning large state trees on minor updates. Use shallow spreading or persistent data structures (HAMT) to bound garbage collector pressure.

## Concrete Anti-Patterns

### Anti-Pattern 1: Boolean Soup Permitting Illegal States

```typescript
// BAD: Multiple independent boolean flags permit 16 possible states, 12 of which are illegal.
// Impossible state: isLoading = true, isError = true, data != null.
interface SessionState {
  isLoading: boolean;
  isError: boolean;
  isSuccess: boolean;
  data: UserSession | null;
  errorMessage: string | null;
}

function renderUI(state: SessionState) {
  if (state.isLoading) return "<Spinner />";
  if (state.isError) return `<Error msg="${state.errorMessage}" />`; // May crash if errorMessage is null
  if (state.isSuccess) return `<Dashboard user="${state.data!.name}" />`; // May crash if data is null
  return "<Empty />";
}

// GOOD: Discriminated Union makes illegal states unrepresentable.
type SessionState =

| { readonly status: "idle" }
| { readonly status: "loading" }
| { readonly status: "success"; readonly data: UserSession }
| { readonly status: "failure"; readonly error: string };

function renderUI(state: SessionState) {
  switch (state.status) {
    case "idle": return "<Empty />";
    case "loading": return "<Spinner />";
    case "success": return `<Dashboard user="${state.data.name}" />`;
    case "failure": return `<Error msg="${state.error}" />`;
  }
}
```

### Anti-Pattern 2: Denormalized State and Desynchronized Derived Data

```typescript
// BAD: Storing full nested author inside articles causes state drift on author rename.
// Storing articleCount creates derived state that desynchronizes when articles are added/deleted.
interface BlogState {
  articles: Array<{
    id: string;
    title: string;
    author: { id: string; name: string }; // DUPLICATE NESTED ENTITY
  }>;
  articleCount: number; // DERIVED STATE DRIFT
}

// GOOD: Normalized relational tables with on-demand derived selectors.
interface BlogState {
  articles: {
    byId: Record<string, { id: string; title: string; authorId: string }>;
    allIds: string[];
  };
  authors: {
    byId: Record<string, { id: string; name: string }>;
  };
}

// Derived state computed purely via selectors
const selectArticleCount = (state: BlogState): number => state.articles.allIds.length;
const selectArticleAuthor = (state: BlogState, articleId: string) => {
  const article = state.articles.byId[articleId];
  return article ? state.authors.byId[article.authorId] : undefined;
};
```

### Anti-Pattern 3: Pathological Collection Selection in Hot Paths

```typescript
// BAD: Using an Array for repeated membership checks and lookups.
// Inner loop executes O(N) scan per item, resulting in O(N * M) quadratic runtime.
class PermissionChecker {
  private revokedTokens: string[] = []; // ARRAY USED FOR LOOKUP

  isRevoked(token: string): boolean {
    return this.revokedTokens.includes(token); // O(N) LINEAR SCAN ON EVERY REQUEST
  }

  revoke(token: string): void {
    if (!this.revokedTokens.includes(token)) {
      this.revokedTokens.push(token);
    }
  }
}

// GOOD: Using a Hash Set provides O(1) membership checks.
class PermissionChecker {
  private revokedTokens = new Set<string>(); // O(1) HASH SET

  isRevoked(token: string): boolean {
    return this.revokedTokens.has(token); // O(1) LOOKUP
  }

  revoke(token: string): void {
    this.revokedTokens.add(token); // O(1) INSERTION
  }
}
```

### Anti-Pattern 4: Array-Based Sliding Window Causing Memory Churn

```typescript
// BAD: Array push and shift for sliding window causes O(N) memory copy on every eviction.
class RecentEventBuffer {
  private events: string[] = [];
  constructor(private readonly limit: number) {}

  add(event: string) {
    this.events.push(event);
    if (this.events.length > this.limit) {
      this.events.shift(); // O(N) RE-INDEXING OF ENTIRE ARRAY
    }
  }
}

// GOOD: Circular Ring Buffer operates in constant O(1) time with pre-allocated memory.
class CircularRingBuffer<T> {
  private buffer: Array<T | undefined>;
  private head = 0;
  private tail = 0;
  private count = 0;

  constructor(public readonly capacity: number) {
    this.buffer = new Array(capacity);
  }

  push(item: T): void {
    this.buffer[this.tail] = item;
    this.tail = (this.tail + 1) % this.capacity;
    if (this.count < this.capacity) {
      this.count++;
    } else {
      this.head = (this.head + 1) % this.capacity; // Evict oldest
    }
  }

  toArray(): T[] {
    const result: T[] = [];
    for (let i = 0; i < this.count; i++) {
      result.push(this.buffer[(this.head + i) % this.capacity]!);
    }
    return result;
  }
}
```

## Failure Modes & Mitigations

* Silent State Drift: Updating a denormalized child entity in one view leaves other views displaying stale data. Mitigate by mandating normalized entity stores (`byId`/`allIds`).
* Impossible Runtime Glitches: Boolean soup permits UI components to render loading spinners and error dialogs simultaneously. Mitigate by enforcing Discriminated Unions for asynchronous workflows.
* Quadratic Loop Degeneracy (O(N2)): Linear array lookups inside batch loops cause CPU spikes as collections grow. Mitigate by indexing items into `Map` or `Set` structures prior to iteration.
* GC Thrashing under Stream Loads: Array shifts in high-frequency sliding buffers generate excessive short-lived objects. Mitigate by using fixed-capacity Circular Ring Buffers.

```
---
