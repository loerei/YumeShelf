# Strict WCAG 2.1 AA, WAI-ARIA Composite Flows, and Front-End DX

**REGIME GATE**: Load and enforce this subdocument **ONLY** when `<review_dir>/Context.md` declares `UX/UI Regime: STRICT_ACCESSIBILITY_COMPLIANCE` (triggered by `!A11Y` / `!WCAG` or ADA/EAA/Section 508-mandated Enterprise, Public SaaS, FinTech, Healthcare, GovTech, or shared UI Component Library targets).

Audits 4-state interaction completeness, WAI-ARIA Authoring Practices (APG) composite widget keyboard state machines (`roving tabindex` and `aria-activedescendant`), screen-reader semantic ID graphs (`useId()`, `aria-labelledby`, `aria-describedby`, `aria-live`), WCAG 2.1 AA contrast/focus-ring parity, vector icon clarity, and browser-safe Front-End DX. Pair grounded JSX/TSX/ARIA/event-handler code remediations with atomic Given/When/Then acceptance criteria (never invent unverified token names or magic-pixel offsets).

## Domain Audit Checklist

### 1. Form Validation, 4-State Coverage & Live Announcements
- [ ] **Explicit Four-State Coverage**: Verify interactive forms and dialogs explicitly specify all four states: `Idle`, `Submitting` / `Loading`, `Success`, and `Error`.
- [ ] **Screen-Reader Validation Alerts (`:user-invalid` Parity)**: Keep submit buttons focusable via `aria-disabled="true"` rather than silently disabling controls without explanation. Initialize fields with explicit `aria-invalid="false"`, flip to `"true"` and bind error messages via collision-free `useId()` + `aria-describedby` **only while invalid** (matching `:user-invalid` or post-submit error timing so hidden or untouched `required` fields do not fire premature errors on load), and announce errors via one centralized `aria-live="polite"` region or post-submit focus shift to the first invalid field / error summary rather than per-field live regions.
- [ ] **Polite & Assertive Live Regions**: Announce asynchronous status updates, background filter counts, field validation changes, and toast notifications via `role="status"` (`aria-live="polite"`). Reserve `role="alert"` (`aria-live="assertive"`) strictly for critical, time-sensitive interruptions requiring immediate attention (data loss, session timeout, network drop).

### 2. WAI-ARIA Composite Widgets & Roving Tabindex State Machines
- [ ] **Single Tab-Stop Composite Navigation (`focusgroup` + Roving Tabindex Fallback)**: For composite widgets (`role="tablist"`, `role="listbox"`, `role="menu"`, `role="menubar"`, `role="toolbar"`, `role="radiogroup"`, `role="treegrid"`), prefer declarative `focusgroup` (`focusgroup="tablist nomemory"` / `focusgroup="toolbar wrap"`, moving `focusgroupstart` with active state) where supported (`'focusGroup' in HTMLElement.prototype`), paired with a single-tab-stop roving `tabindex` fallback (`tabIndex={isActive ? 0 : -1}`, cyclic `Arrow` keys, `Home`, `End`, and synchronous focus handoff to item $k+1$ or $k-1$ on deletion) for cross-browser parity.
- [ ] **Virtualized Composite Focus (`aria-activedescendant`)**: For virtualized comboboxes, command palettes, or large grids where DOM nodes mount/unmount on scroll, maintain container focus and synchronize `aria-activedescendant={activeOptionId}` with scroll-into-view guarantees.
- [ ] **Modal Accessibility, `aria-labelledby` & Restoration**: For **new blocking modal dialogs**, prefer native `<dialog>` opened with `showModal()` (paired with `useId()` + `aria-labelledby`, avoiding redundant `role="dialog"`, `aria-modal`, manual `Tab` traps, and manual `Esc`/trigger-return handlers), and prefer `popover` for light-dismiss non-modal overlays. Only when custom overlays or existing non-`<dialog>` modal primitives are used, verify `role="dialog"` / `role="alertdialog"`, `aria-modal="true"`, `aria-labelledby`, cyclic `Tab`/`Shift+Tab` trapping, `Escape` dismissal, and deterministic focus restoration on close.
- [ ] **In-Flight Focus Continuity**: For buttons initiating async jobs, require `aria-disabled="true"` with in-flight interaction blocking rather than native HTML `disabled` (which causes browsers to blur the control and evict focus to `document.body`).
- [ ] **Dynamic ARIA State Synchronization**: Confirm interactive disclosures, toggles, tabs, and selection controls synchronize `aria-expanded`, `aria-selected`, `aria-checked`, `aria-pressed`, `aria-invalid`, and `aria-current` with component state transitions.

### 3. Visual Contrast, Icons & Clean Front-End DX
- [ ] **WCAG 2.1 AA Contrast & `:focus-visible` Outlines**: Verify text tokens maintain $\ge 4.5:1$ contrast for normal text and $\ge 3:1$ for large text, icons, and control boundaries. Reject `outline: none` unless replaced by a high-contrast tokenized `:focus-visible` indicator ($\ge 2\text{px}$ solid offset outline).
- [ ] **Vector Icon Accessibility & Parity**: Require clean vector SVGs (`currentColor`, explicit dimensions, and `aria-hidden="true"` when paired with text, or `aria-label` + keyboard/touch-accessible tooltip such as `popover="hint"` / accessible tooltip primitive on canonical icon-only controls — never `title` alone). Strictly reject raw emoji characters (`📁`, `⚙️`, `🗑️`, `⭐`). Require visible text labels on non-canonical domain actions.
- [ ] **Browser-Safe Event Coordination (Ban on `stopPropagation()`)**: Reject `event.stopPropagation()` and `event.stopImmediatePropagation()`. Use **Parent Target Filtering** (`event.target.closest('button, a, input, select, textarea, [role="button"], [data-interactive]')`) when children include native checkboxes/links/submit buttons, or **Preventable Event Contracts** (`event.preventDefault()` + `event.defaultPrevented`) on custom non-native `type="button"` actions.
- [ ] **Immutable Entity Keys & Reusable Primitive Ergonomics**: Enforce immutable entity keys (`key={item.id}`, banning `key={index}` and `setTimeout` DOM query hacks). For shared UI primitives, verify Controlled/Uncontrolled support and `ref` forwarding (`forwardRef`).

## Concrete Anti-Patterns

### Anti-Pattern 1: Unmanaged Tab Stops in WAI-ARIA Composite Tablist / Listbox

```tsx
// BAD: Every tab is a separate Tab stop with no Arrow/Home/End roving tabindex
function CategoryTabsBad({ tabs, activeId, onSelect }: { tabs: { id: string; label: string }[]; activeId: string; onSelect: (id: string) => void }) {
  return (
    <div role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={t.id === activeId} onClick={() => onSelect(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

// GOOD: Native focusgroup="tablist nomemory" where supported, with WAI-ARIA APG roving tabindex fallback when 'focusGroup' in HTMLElement.prototype is false
const HAS_NATIVE_FOCUSGROUP = typeof HTMLElement !== "undefined" && "focusGroup" in HTMLElement.prototype;

function CategoryTabsAccessible({ tabs, activeId, onSelect }: { tabs: { id: string; label: string }[]; activeId: string; onSelect: (id: string) => void }) {
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (HAS_NATIVE_FOCUSGROUP || tabs.length === 0) return;
    let nextIndex: number | null = null;
    if (e.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
    else if (e.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") nextIndex = 0;
    else if (e.key === "End") nextIndex = tabs.length - 1;

    if (nextIndex !== null) {
      e.preventDefault();
      const nextTab = tabs[nextIndex];
      onSelect(nextTab.id);
      tabRefs.current.get(nextTab.id)?.focus();
    }
  };

  return (
    <div {...(HAS_NATIVE_FOCUSGROUP ? { focusgroup: "tablist nomemory" } : { role: "tablist", "aria-orientation": "horizontal" })}>
      {tabs.map((t, idx) => {
        const isSelected = t.id === activeId;
        return (
          <button
            key={t.id}
            ref={(el) => { if (el) tabRefs.current.set(t.id, el); else tabRefs.current.delete(t.id); }}
            type="button"
            {...(!HAS_NATIVE_FOCUSGROUP ? { role: "tab", tabIndex: isSelected ? 0 : -1 } : {})}
            {...(isSelected && HAS_NATIVE_FOCUSGROUP ? { focusgroupstart: "" } : {})}
            aria-selected={isSelected}
            onClick={() => onSelect(t.id)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
```
- **Acceptance Criterion**: *Given* focus is on the active tab in the tablist, *when* the user presses `ArrowRight`, `ArrowLeft`, `Home`, or `End`, *then* native `focusgroup` (or the fallback roving `tabIndex={0}` + `tabRefs` when unsupported) moves `aria-selected="true"` and DOM focus cyclically to the target tab without creating multiple `Tab` stops.

### Anti-Pattern 2: Unlinked Screen-Reader Modal Headings & Form Validation Alerts

```tsx
// BAD: Dialog lacks aria-labelledby linkage, button uses native disabled, and error message is not bound via aria-describedby
function RenameDialogBad({ isValid, error }: { isValid: boolean; error?: string }) {
  return (
    <div role="dialog" aria-modal="true">
      <h2>Rename Workspace</h2>
      <input type="text" />
      {error && <span>{error}</span>}
      <button disabled={!isValid}>Submit</button>
    </div>
  );
}

// GOOD: Native <dialog> (modal via showModal()), explicit aria-invalid="false" baseline, conditional aria-describedby, polite role="status", and aria-disabled focus retention
function RenameDialogAccessible({ dialogRef, isValid, error, onSubmit }: { dialogRef: React.RefObject<HTMLDialogElement>; isValid: boolean; error?: string; onSubmit: () => void }) {
  const titleId = useId();
  const errorId = useId();
  const hasError = Boolean(error);
  return (
    <dialog ref={dialogRef} aria-labelledby={titleId}>
      <h2 id={titleId}>Rename Workspace</h2>
      <input
        type="text"
        aria-invalid={hasError ? "true" : "false"}
        aria-describedby={hasError ? errorId : undefined}
      />
      <div role="status" aria-live="polite">
        {hasError && <span id={errorId}>{error}</span>}
      </div>
      <button
        type="button"
        aria-disabled={!isValid}
        aria-describedby={hasError ? errorId : undefined}
        onClick={(e) => { if (!isValid) { e.preventDefault(); return; } onSubmit(); }}
      >
        Submit
      </button>
    </dialog>
  );
}
```
- **Acceptance Criterion**: *Given* the blocking modal renders via `<dialog>.showModal()` with a validation error, *when* inspected in the accessibility tree, *then* `<dialog>` references the heading `id` via `aria-labelledby` (with native top-layer/inert/Esc behavior), the input transitions from `aria-invalid="false"` to `"true"` and binds `#errorId` via `aria-describedby` inside a polite `role="status"` region, and activating Submit while invalid retains focus via `aria-disabled="true"`.

### Anti-Pattern 3: Indiscriminate `stopPropagation()` & Raw Emoji Icons

```tsx
// GOOD: Parent target filtering ignores interactive descendants and buttons use vector SVGs with currentColor
const INTERACTIVE_SELECTOR = 'button, a, input, select, textarea, [role="button"], [data-interactive]';

function AccessibleRowSafe({ item, onSelectRow, onDelete }: { item: { id: string; name: string }; onSelectRow: (id: string) => void; onDelete: (id: string) => void }) {
  const tipId = useId();
  const handleRowClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest(INTERACTIVE_SELECTOR)) return;
    onSelectRow(item.id);
  };
  return (
    <div onClick={handleRowClick}>
      <input type="checkbox" aria-label={`Select ${item.name}`} />
      <button type="button" aria-label={`Delete ${item.name}`} {...({ interestfor: tipId } as any)} onClick={() => onDelete(item.id)}>
        <svg width="16" height="16" fill="currentColor" aria-hidden="true"><use href="#icon-trash" /></svg>
      </button>
      <span id={tipId} popover="hint" role="tooltip">Delete {item.name}</span>
    </div>
  );
}
```
- **Acceptance Criterion**: *Given* a clickable row containing a child checkbox and canonical icon-only Delete button, *when* the user activates the checkbox or Delete button, *then* the child action executes without firing `onSelectRow`, `document` click listeners receive the bubbled event, and the Delete button exposes `<svg aria-hidden="true">`, `aria-label`, and a keyboard/touch-accessible tooltip (`popover="hint"` or tooltip primitive, not `title` alone).

## Failure Modes & Mitigations

- **Fragmented Composite Keyboard Navigation**: Prefer native `focusgroup` with a single-tab-stop roving `tabindex` (`0` / `-1`, `Arrow`, `Home`, `End`) fallback on composite widgets where `'focusGroup' in HTMLElement.prototype` is false.
- **Duplicate Hardcoded ARIA IDs**: Use `useId()` to generate unique instance-scoped IDs for `aria-labelledby` and `aria-describedby`.
- **Silent or Premature Screen-Reader State Changes**: Start inputs at `aria-invalid="false"`, flip to `"true"` on `:user-invalid` / submit errors, link `aria-describedby` only while invalid, and announce validation updates via a centralized `role="status"` (`aria-live="polite"`) region (reserving `role="alert"` / `aria-live="assertive"` for critical failures).
- **Swallowed Global Shortcuts & Dismiss Events**: Ban `stopPropagation()`; use parent `event.target.closest(...)` filtering.
