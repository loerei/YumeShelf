# UXUI Subdocument: Form State Feedback & Accessible Interaction Flows

## Domain Audit Checklist

### 1. Form Validation & User Guidance
- [ ] Explicit Form States: Verify interactive forms explicitly handle four state renders: Idle, Submitting, Success, and Error.
- [ ] Contextual Error Messages: Ensure field validation errors display clear recovery instructions adjacent to relevant inputs.

### 2. Accessible Ergonomics (WCAG Standards)
- [ ] Keyboard Navigation: Confirm all interactive visual controls (buttons, links, inputs) receive keyboard focus in logical sequential order.
- [ ] ARIA Roles & Attributes: Verify screen-reader accessibility tags (`aria-expanded`, `aria-invalid`, `aria-describedby`) dynamically update to match component state changes.
- [ ] In-Flight Focus Continuity: For buttons initiating async jobs, verify active controls use `aria-disabled="true"` with in-flight interaction blocking rather than native HTML `disabled` to prevent browser blur and focus eviction to `document.body`.

## Concrete Anti-Patterns

> [!IMPORTANT]
> **Conceptual Reference Notice**: Code snippets in this subdocument are for conceptual reference and illustrative purposes only. UX/UI Reviewers are strictly prohibited from copying concrete code into review reports. All report findings must use Abstract Behavioral Specifications with Acceptance Criteria.

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
  btn.disabled = true; // Browser immediately fires blur and dumps focus to body!
  await performAsyncOperation();
  btn.disabled = false; // Focus is permanently lost from tab order!
}

// GOOD: aria-disabled="true" maintains focus continuity in tab order
async function handleAction(e) {
  const btn = e.currentTarget;
  if (btn.getAttribute('aria-disabled') === 'true') return; // Guard against double submission
  btn.setAttribute('aria-disabled', 'true'); // Keeps activeElement on the button!
  try {
    await performAsyncOperation();
  } finally {
    btn.removeAttribute('aria-disabled');
  }
}
```

## Failure Modes & Mitigations

- Double Form Submission Race Conditions: Guard input action triggers immediately upon invocation via `aria-disabled="true"` and in-flight state flags rather than native HTML `disabled` on active focused elements.
- Screen Reader Focus Traps: Enforce automated focus management returning user focus to parent triggers when closing modal windows.
