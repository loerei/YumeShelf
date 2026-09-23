# Form State Feedback and Accessible Interaction Flows

## Domain Audit Checklist

### 1. Form Validation & User Guidance
- [ ] Explicit Form States: Verify interactive forms explicitly handle four state renders: Idle, Submitting, Success, and Error.
- [ ] Contextual Error Messages: Ensure field validation errors display clear recovery instructions adjacent to relevant inputs.

### 2. Accessible Ergonomics (WCAG Standards)
- [ ] Keyboard Navigation: Confirm all interactive visual controls (buttons, links, inputs) receive keyboard focus in logical sequential order.
- [ ] ARIA Roles & Attributes: Verify screen-reader accessibility tags (`aria-expanded`, `aria-invalid`, `aria-describedby`) dynamically update to match component state changes.
- [ ] In-Flight Focus Continuity: For buttons initiating async jobs, verify active controls use `aria-disabled="true"` with in-flight interaction blocking rather than native HTML `disabled` to prevent browser blur and focus eviction to `document.body`.
- [ ] Vector Icon Accessibility & Parity: Verify icons are implemented as clean vector SVGs (with explicit dimensions and `aria-hidden="true"` for decorative icons or `aria-label` for icon-only buttons). Strictly reject raw emoji characters as interface icons.
- [ ] Icon-Only Controls & Tooltips: In space-constrained toolbars or row action slots, verify canonical actions (e.g. settings gear, trash delete) using icon-only controls specify both an accessible name (`aria-label`) and a visual hover/focus tooltip. Verify non-canonical domain actions retain explicit text labels to avoid ambiguous actions.
- [ ] Preventable Event Contracts: Verify nested interactive elements do not prescribe `stopPropagation()`, utilizing `event.preventDefault()` coordination with `event.defaultPrevented` validation instead.

## Concrete Anti-Patterns

> [!IMPORTANT]
> Code snippets are illustrative only. Do not copy code into review reports; write Abstract Behavioral Specifications with Acceptance Criteria instead.

### Anti-Pattern 1: Uninformative Silent Form Failure

```jsx
// BAD: Button disables silently without explaining why input fields are invalid.
function SubmitForm({ isValid }) {
  return <button disabled={!isValid}>Submit</button>;
}

// GOOD: Keep button actionable, display explicit feedback messages upon submission attempt
function SubmitForm({ errors, onSubmit }) {
  return (
    <div>
      <button onClick={onSubmit} aria-describedby="error-summary">Submit</button>
      {errors.length > 0 && (
        <div id="error-summary" role="alert" className="error-box">
          {errors.map(err => <p key={err.id}>{err.message}</p>)}
        </div>
      )}
    </div>
  );
}
```

### Anti-Pattern 2: Focus Eviction via Native HTML Disabled on Active Elements

```jsx
// BAD: Native disabled on focused button instantly blurs focus to document.body
async function handleAction(e) {
  const btn = e.currentTarget;
  btn.disabled = true; // Browser fires blur and dumps focus to body
  await performAsyncOperation();
  btn.disabled = false; // Focus is lost from tab order
}

// GOOD: aria-disabled="true" maintains focus continuity in tab order
async function handleAction(e) {
  const btn = e.currentTarget;
  if (btn.getAttribute('aria-disabled') === 'true') return; // Guard against double submission
  btn.setAttribute('aria-disabled', 'true'); // Keeps activeElement on the button
  try {
    await performAsyncOperation();
  } finally {
    btn.removeAttribute('aria-disabled');
  }
}
```

### Anti-Pattern 3: Raw Emoji Icons in UI Controls

```jsx
// BAD: Raw emoji icon lacks theme styling, scales poorly, renders inconsistently across platforms
function OpenFolderButton() {
  return <button className="icon-btn">📁 Open Folder</button>;
}

// GOOD: Accessible inline vector SVG inheriting theme tokens via currentColor
function OpenFolderButton() {
  return (
    <button className="icon-btn">
      <svg className="icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      </svg>
      <span>Open Folder</span>
    </button>
  );
}
```

### Anti-Pattern 4: Unlabeled or Ambiguous Icon-Only Controls

```jsx
// BAD: Icon-only button on ambiguous domain action without accessible name or tooltip
function RebaseButton() {
  return (
    <button className="icon-btn" onClick={handleRebase}>
      <svg className="icon" aria-hidden="true">...</svg>
    </button>
  );
}

// GOOD: Explicit text label for domain action, or canonical icon-only with tooltip and aria-label
function RebaseButton() {
  return (
    <button className="btn" onClick={handleRebase}>
      <svg className="icon" aria-hidden="true">...</svg>
      <span>Rebase Branch</span>
    </button>
  );
}

// GOOD: Canonical icon-only (e.g. settings gear, trash delete) in dense toolbar with tooltip
function DeleteItemButton({ onDelete }) {
  return (
    <button className="icon-btn" onClick={onDelete} aria-label="Delete item" data-tooltip="Delete item">
      <svg className="icon" aria-hidden="true">...</svg>
    </button>
  );
}
```

### Anti-Pattern 5: Indiscriminate stopPropagation() Event Swallowing

```javascript
// BAD: stopPropagation breaks document dismiss listeners, global shortcuts, and telemetry
function TableRowCard({ item, onSelectRow }) {
  return (
    <div className="row-card" onClick={() => onSelectRow(item.id)}>
      <span>{item.title}</span>
      <div className="row-actions">
        <button 
          onClick={(e) => {
            e.stopPropagation(); // Swallows event from global/parent listeners
            performItemDelete(item.id);
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

// GOOD: Preventable event handlers with defaultPrevented coordination
function TableRowCard({ item, onSelectRow, onDeleteItem }) {
  const handleRowClick = (event) => {
    if (event.defaultPrevented) return; // Respects child cancellation
    onSelectRow(item.id);
  };

  return (
    <div className="row-card" onClick={handleRowClick}>
      <span>{item.title}</span>
      <div className="row-actions">
        <button
          type="button"
          aria-label={`Delete ${item.title}`}
          onClick={(event) => {
            event.preventDefault(); // Signals parent without halting event bubbling
            onDeleteItem(item.id);
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
```

### Anti-Pattern 6: Focus Loss from Destructive Re-renders

```javascript
// BAD: Volatile keys and post-render timeout querySelector focus hacks
function UserList({ users }) {
  const [userList, setUserList] = useState(users);

  const handleDelete = (userId) => {
    setUserList(prev => prev.filter(u => u.id !== userId));
    setTimeout(() => {
      const nextTarget = document.querySelector('.user-item-btn');
      if (nextTarget) nextTarget.focus(); // Brittle post-render focus query
    }, 150);
  };

  return (
    <ul>
      {userList.map((user, index) => (
        <li key={index}> {/* Volatile index key destroys DOM nodes */}
          <button className="user-item-btn" onClick={() => handleDelete(user.id)}>Remove</button>
        </li>
      ))}
    </ul>
  );
}

// GOOD: Stable entity keys and WAI-ARIA roving tabindex state machine
function UserList({ users, onDelete }) {
  return (
    <ul role="toolbar" aria-label="User Directory">
      {users.map((user) => (
        <li key={user.id}> {/* Stable entity key preserves DOM node identity */}
          <button
            type="button"
            tabIndex={user.isActive ? 0 : -1}
            onClick={() => onDelete(user.id)}
          >
            Remove {user.name}
          </button>
        </li>
      ))}
    </ul>
  );
}
```

## Failure Modes & Mitigations

- Double Form Submission Race Conditions: Guard input action triggers immediately upon invocation via `aria-disabled="true"` and in-flight state flags rather than native HTML `disabled` on active focused elements.
- Screen Reader Focus Traps: Enforce automated focus management returning user focus to parent triggers when closing modal windows.
- Inconsistent Emoji Rendering Across Operating Systems: Strictly replace raw emoji glyphs with inline SVG vectors or icon library glyphs bound to `currentColor`.
- Ambiguous Icon-Only Controls: Retain explicit text labels for domain-specific actions; restrict icon-only controls to canonical actions (e.g. settings gear, trash delete) equipped with accessible tooltips and `aria-label`s.
- Swallowed Keyboard & Telemetry Events: Enforce preventable event contracts (`event.preventDefault()` with `event.defaultPrevented`) over `event.stopPropagation()`, preserving event bubbling to document listeners.
- Focus Loss from List Mutations: Enforce immutable entity keys (`key={item.id}`) and roving tabindex state machines, strictly rejecting post-render DOM re-querying hacks.
