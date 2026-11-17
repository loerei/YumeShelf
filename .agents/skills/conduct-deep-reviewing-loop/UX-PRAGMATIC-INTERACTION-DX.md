# Pragmatic Interactive Flows, Unmount Focus Retention, and Front-End DX

**REGIME GATE**: Load and enforce this subdocument when `<review_dir>/Context.md` declares `UX/UI Regime: PRAGMATIC_PRODUCT_UX`. Audits 4-state interaction completeness, physical focus retention against `document.body` eviction on element unmount or async execution, vector icon clarity, browser-safe event coordination, and clean, debt-free Front-End Developer Experience (DX) & maintainability. Pair grounded JSX/TSX/event-handler/tokenized-CSS code remediations with atomic Given/When/Then acceptance criteria (never invent unverified token names or magic-pixel offsets).

## Domain Audit Checklist

### 1. Interactive State Completeness & User Guidance
- [ ] **Explicit Four-State Coverage**: Verify interactive forms, dialogs, and action flows explicitly specify all four states: `Idle`, `Submitting` / `Loading`, `Success`, and `Error` (including retry or recovery affordances in `Error` states).
- [ ] **Actionable Validation & Error Feedback**: Keep submit/action triggers responsive and display clear, contextual validation messages explaining why an input or action is blocked rather than silently failing or leaving dead, unclickable controls without explanation.

### 2. Physical Focus Retention (Preventing `document.body` Eviction)
- [ ] **Modal & Overlay Unmount Focus Return**: For **new blocking modal dialogs**, prefer native `<dialog>` with `showModal()` (which handles top-layer promotion, `Esc`, and return focus to the invoking trigger without manual focus traps), and use native `popover` for light-dismiss non-modal overlays. For non-modal drawers, custom/existing UI primitives, or cases where the invoking trigger itself unmounts, confirm focus returns deterministically to its invoking trigger element (or a designated surviving container) so keyboard/gamepad `Tab` and `Space` navigation never resets to `document.body`.
- [ ] **Active List Item Deletion Focus Handoff**: When the user deletes or removes the currently focused item in a dynamic list (e.g. deleting an active save slot, row, or card), synchronously transfer focus to the adjacent surviving item (`items[index + 1] ?? items[index - 1]`) or the empty-state fallback container via a lightweight ref lookup. Never allow unmount to drop focus to `document.body`, and strictly reject post-render `setTimeout(() => document.querySelector(...))` focus hacks.
- [ ] **In-Flight Async Button Focus Retention**: For focused buttons initiating async jobs, block duplicate activations via a pending state guard and `aria-disabled="true"` (rather than native HTML `disabled` when preserving active focus matters, since native `disabled` causes Chromium/browsers to blur the active element and dump focus to `document.body`).
- [ ] **Native Control Simplicity**: Standard clickable controls (filter pills, category bars, tabs, badges, toolbars, and list rows built with native `<button>`, `<a>`, or `<input>` elements) rely on native browser `Tab`/`Shift+Tab` and pointer/keyboard activation without custom arrow-key state machines or ref-map boilerplate.

### 3. Front-End DX, Clean Architecture & Zero Tech Debt
- [ ] **Browser-Safe Event Coordination (Ban on `stopPropagation()`)**: Reject specifications prescribing `event.stopPropagation()` or `event.stopImmediatePropagation()`, which silently break document-level outside-click dismiss listeners and global shortcuts. Coordinate nested interactive elements inside clickable containers via:
  1. **Parent Target Filtering (Mandatory when children include native checkboxes, radio inputs, links, or submit buttons)**: The parent container's click/keydown handler ignores events whose target matches an interactive descendant (`event.target.closest('button, a, input, select, textarea, [role="button"], [data-interactive]')`), preserving both native browser default behavior and document bubbling.
  2. **Preventable Event Contracts (Valid for custom non-native `type="button"` actions)**: The child action invokes `event.preventDefault()` and the parent handler exits early when `event.defaultPrevented` is true. NEVER prescribe `event.preventDefault()` on native checkboxes, radio buttons, links, or submit buttons where it cancels the browser's native toggle/navigation action.
- [ ] **Immutable Entity Keys & React Render Hygiene**: Enforce stable domain entity IDs (`key={item.id}`) on all dynamic collections; strictly reject volatile array index keys (`key={index}`) that corrupt child state and force unnecessary DOM remounts on insertion/deletion/reordering. Avoid redundant `useEffect` mirror-state synchronization when values can be derived during render.
- [ ] **Vector Icon Clarity & Canonical Tooltips**: Require clean vector SVGs (`currentColor`, explicit dimensions, and `aria-hidden="true"` when paired with text). Strictly reject raw emoji characters (`📁`, `⚙️`, `🗑️`, `⭐`) as UI icons. Allow icon-only buttons ONLY for universally recognized canonical actions (close, trash delete, settings gear, search, copy) paired with `aria-label` and a keyboard- and touch-accessible tooltip (`popover="hint"` or accessible tooltip primitive — NEVER rely on native `title` alone, which is unreachable by keyboard and touch); require visible text labels on ambiguous domain actions.
- [ ] **Extensible & Maintainable Component Contracts**: Verify shared/reusable UI primitives expose clean, minimal TypeScript prop interfaces without boolean prop explosion, support Controlled (`value` + `onChange`) or Uncontrolled (`defaultValue`) contracts where appropriate, forward `ref` when host consumers need DOM access, and deterministically clean up timers, observers, and listeners on unmount.

## Concrete Anti-Patterns

### Anti-Pattern 1: Silent Form Failure & Missing Error Recovery State

```tsx
// BAD: Submit button disables silently with no validation feedback and no error recovery state.
function SaveConfigFormBad({ isValid, onSave }: { isValid: boolean; onSave: () => Promise<void> }) {
  return <button disabled={!isValid} onClick={onSave}>Save</button>;
}

// GOOD: Explicit 4-state feedback (Idle/Saving/Success/Error) with actionable validation message
function SaveConfigFormSafe({ isValid, validationMsg, onSave }: { isValid: boolean; validationMsg?: string; onSave: () => Promise<void> }) {
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [errorText, setErrorText] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || status === "saving") return;
    setStatus("saving");
    setErrorText(null);
    try {
      await onSave();
      setStatus("idle");
    } catch (err) {
      setStatus("error");
      setErrorText(err instanceof Error ? err.message : "Failed to save configuration.");
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {validationMsg && <p className="form-validation-msg">{validationMsg}</p>}
      {status === "error" && <p className="form-error-banner">{errorText}</p>}
      <button type="submit" aria-disabled={!isValid || status === "saving"}>
        {status === "saving" ? "Saving..." : "Save"}
      </button>
    </form>
  );
}
```
- **Acceptance Criterion**: *Given* invalid form input or a rejected save promise, *when* the user attempts to submit, *then* the form prevents duplicate in-flight submissions, displays the specific validation or error message, and keeps the submit control mounted for retry without evicting focus to `document.body`.

### Anti-Pattern 2: Focus Eviction to `document.body` on Active Item Deletion or Modal Unmount

```tsx
// BAD: Deleting a focused row or unmounting a modal without focus handoff drops activeElement to document.body,
// and setTimeout + querySelector races against React commits.
function SaveSlotListBad({ slots, onDelete }: { slots: { id: string; label: string }[]; onDelete: (id: string) => void }) {
  const handleDelete = (id: string) => {
    onDelete(id);
    setTimeout(() => document.querySelector<HTMLElement>(".slot-delete-btn")?.focus(), 100);
  };
  return <ul>{slots.map((s, idx) => <li key={idx}><button className="slot-delete-btn" onClick={() => handleDelete(s.id)}>Delete {s.label}</button></li>)}</ul>;
}

// GOOD: Stable entity key (key={s.id}) and lightweight ref handoff to adjacent item on active item deletion
function SaveSlotListSafe({ slots, onDelete }: { slots: { id: string; label: string }[]; onDelete: (id: string) => void }) {
  const deleteBtnRefs = useRef(new Map<string, HTMLButtonElement>());
  const emptyFallbackRef = useRef<HTMLDivElement>(null);

  const handleDelete = (index: number, id: string) => {
    const neighbor = slots[index + 1] ?? slots[index - 1];
    onDelete(id);
    queueMicrotask(() => {
      if (neighbor) {
        deleteBtnRefs.current.get(neighbor.id)?.focus();
      } else {
        emptyFallbackRef.current?.focus();
      }
    });
  };

  return (
    <div ref={emptyFallbackRef} tabIndex={-1}>
      <ul>
        {slots.map((s, idx) => (
          <li key={s.id}>
            <span>{s.label}</span>
            <button
              type="button"
              ref={(el) => { if (el) deleteBtnRefs.current.set(s.id, el); else deleteBtnRefs.current.delete(s.id); }}
              onClick={() => handleDelete(idx, s.id)}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```
- **Acceptance Criterion**: *Given* focus is on the Delete button of slot $k$ in a list keyed by `slot.id`, *when* slot $k$ is deleted, *then* surviving sibling DOM nodes are retained without remounting and focus transfers deterministically to slot $k+1$ (or $k-1$, or the container when empty) with zero focus drop to `document.body` and zero `setTimeout` DOM queries.

### Anti-Pattern 3: Focus Eviction via Native HTML `disabled` on Active Async Buttons

```tsx
// BAD: Setting native disabled on a focused button immediately blurs focus to document.body
async function handleActionBad(e: React.MouseEvent<HTMLButtonElement>) {
  e.currentTarget.disabled = true;
  await performAsyncOperation();
  e.currentTarget.disabled = false;
}

// GOOD: Preserve document.activeElement across async boundary using pending guard + aria-disabled
function ActionButtonSafe({ onAction }: { onAction: () => Promise<void> }) {
  const [pending, setPending] = useState(false);
  const handleClick = async () => {
    if (pending) return;
    setPending(true);
    try { await onAction(); } finally { setPending(false); }
  };
  return <button type="button" aria-disabled={pending} onClick={handleClick}>Run Job</button>;
}
```
- **Acceptance Criterion**: *Given* keyboard focus is on the action button, *when* the async operation runs, *then* the button sets `aria-disabled="true"`, retains `document.activeElement` throughout execution, blocks duplicate activations, and resets `aria-disabled="false"` in `finally`.

### Anti-Pattern 4: Raw Emoji Icons & Unlabeled Icon-Only Controls

```tsx
// BAD 1: Raw emoji icon renders inconsistently across OSes and ignores theme currentColor
// BAD 2: Icon-only button on non-canonical domain action ("Rebase") lacks visible text label
function ToolbarBad({ onOpen, onRebase, onDelete }: { onOpen: () => void; onRebase: () => void; onDelete: () => void }) {
  return (
    <div>
      <button onClick={onOpen}>📁 Open Folder</button>
      <button onClick={onRebase}><svg aria-hidden="true" /></button>
      <button onClick={onDelete}><svg aria-hidden="true" /></button>
    </div>
  );
}

// GOOD: Vector SVG bound to currentColor, visible text on domain action, and aria-label + accessible tooltip on canonical icon-only button
function ToolbarSafe({ onOpen, onRebase, onDelete }: { onOpen: () => void; onRebase: () => void; onDelete: () => void }) {
  const tipId = useId();
  return (
    <div>
      <button type="button" onClick={onOpen}>
        <svg width="16" height="16" fill="currentColor" aria-hidden="true"><use href="#icon-folder" /></svg>
        <span>Open Folder</span>
      </button>
      <button type="button" onClick={onRebase}>
        <svg width="16" height="16" fill="currentColor" aria-hidden="true"><use href="#icon-git-branch" /></svg>
        <span>Rebase Branch</span>
      </button>
      <button type="button" aria-label="Delete item" {...({ interestfor: tipId } as any)} onClick={onDelete}>
        <svg width="16" height="16" fill="currentColor" aria-hidden="true"><use href="#icon-trash" /></svg>
      </button>
      <span id={tipId} popover="hint" role="tooltip">Delete item</span>
    </div>
  );
}
```
- **Acceptance Criterion**: *Given* the toolbar renders, *when* inspected in the DOM, *then* icons use `<svg aria-hidden="true" fill="currentColor">` with zero raw emojis, non-canonical domain actions display visible text labels, and canonical icon-only buttons expose `aria-label` and a keyboard/touch-accessible tooltip (`popover="hint"` or tooltip primitive, not `title` alone).

### Anti-Pattern 5: Indiscriminate `stopPropagation()` Event Swallowing

```tsx
// BAD: stopPropagation breaks document-level popover dismiss listeners, global shortcuts, and analytics
function TableRowBad({ item, onSelectRow, onDelete }: { item: { id: string }; onSelectRow: (id: string) => void; onDelete: (id: string) => void }) {
  return (
    <div onClick={() => onSelectRow(item.id)}>
      <input type="checkbox" onClick={(e) => e.stopPropagation()} />
      <button onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}>Delete</button>
    </div>
  );
}

// GOOD: Parent target filtering ignores interactive descendants while preserving native checkbox toggle and document bubbling
const INTERACTIVE_SELECTOR = 'button, a, input, select, textarea, [role="button"], [data-interactive]';

function TableRowSafe({ item, onSelectRow, onDelete }: { item: { id: string }; onSelectRow: (id: string) => void; onDelete: (id: string) => void }) {
  const handleRowClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest(INTERACTIVE_SELECTOR)) return;
    onSelectRow(item.id);
  };
  return (
    <div onClick={handleRowClick}>
      <input type="checkbox" aria-label={`Select ${item.id}`} />
      <button type="button" onClick={() => onDelete(item.id)}>Delete</button>
    </div>
  );
}
```
- **Acceptance Criterion**: *Given* a clickable row containing a child checkbox and Delete button, *when* the user activates the checkbox or Delete button, *then* the child action executes, `onSelectRow` does not fire, and `document` click listeners still receive the bubbled event.

## Failure Modes & Mitigations

- **Focus Drop to `document.body` on Unmount**: Return focus to the invoking trigger when closing modals/popovers, and hand off focus to the adjacent surviving item (`index + 1` or `index - 1`) when deleting an actively focused list item.
- **Double Submission & Async Blur**: Guard in-flight triggers via state flags and `aria-disabled="true"` rather than native HTML `disabled`.
- **Inconsistent Emoji Rendering**: Replace raw emoji characters with vector SVGs bound to `currentColor`.
- **Ambiguous Icon-Only Controls**: Require visible text labels on domain actions; require `aria-label` + keyboard/touch-accessible tooltips (never `title` alone) on canonical icon-only controls.
- **Swallowed Global Shortcuts & Dismiss Events**: Ban `stopPropagation()`; use parent `event.target.closest(...)` filtering or custom `defaultPrevented` coordination.
- **State Corruption on List Mutation**: Use immutable entity keys (`key={item.id}`) instead of volatile array indices (`key={index}`) or post-render `querySelector` timers.
