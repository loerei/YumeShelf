# Frontend Web & Mobile Real User Monitoring (RUM)

Audit criteria for browser SPAs, PWAs, and mobile client webviews covering Core Web Vitals, frontend error boundaries, breadcrumbs, session privacy, and beaconing transport.

## Domain Audit Checklist

- [ ] **Core Web Vitals Tracking**: Are Largest Contentful Paint (LCP), Interaction to Next Paint (INP), and Cumulative Layout Shift (CLS) captured and tagged with route metadata?
- [ ] **SPA Route Transitions**: Do page performance measurements reset and re-bind on client-side route transitions?
- [ ] **Frontend Error Boundaries**: Are UI component trees wrapped in Error Boundaries to prevent full-application white screens on render exceptions?
- [ ] **Global Rejection Handlers**: Are global listeners registered for `unhandledrejection` and `window.onerror`?
- [ ] **Diagnostic Breadcrumb Capture**: Do error reports bundle diagnostic breadcrumbs (last 10 user clicks, route mutations, failed network fetch URLs)?
- [ ] **Session Replay PII Masking**: Are input fields, passwords, email addresses, and payment details masked (`.masked` / `data-mask`) before session recording?
- [ ] **Unload Beaconing Transport**: Are page-exit metrics transmitted using `document.visibilityState === 'hidden'` via `navigator.sendBeacon` or `fetch({ keepalive: true })` instead of `unload`?

## Concrete Anti-Patterns

### Anti-Pattern 1: Relying on `beforeunload` for Telemetry Delivery

```typescript
// BAD: Unreliable event in modern browsers; drops telemetry on tab close or mobile suspend.
window.addEventListener("beforeunload", () => {
  fetch("/api/telemetry", {
    method: "POST",
    body: JSON.stringify(metrics),
  });
});

// GOOD: Uses visibilitychange event and sendBeacon for guaranteed delivery.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    const payload = JSON.stringify(metrics);
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/telemetry", payload);
    } else {
      fetch("/api/telemetry", {
        method: "POST",
        body: payload,
        keepalive: true,
      });
    }
  }
});
```

### Anti-Pattern 2: Unshielded Component Tree Without Error Boundary

```typescript
// BAD: Render exception in UserCard crashes entire React application tree.
function App() {
  return (
    <Layout>
      <UserCard user={currentUser} />
    </Layout>
  );
}

// GOOD: Error boundary confines render crash, logs diagnostic context, and shows fallback UI.
function App() {
  return (
    <Layout>
      <ErrorBoundary
        fallback={<p>Unable to load user profile.</p>}
        onError={(err, info) => {
          rumClient.captureException(err, { componentStack: info.componentStack });
        }}
      >
        <UserCard user={currentUser} />
      </ErrorBoundary>
    </Layout>
  );
}
```

## Failure Modes & Mitigations

| Failure Mode | Root Cause | Mitigation |
| --- | --- | --- |
| **Lost Exit Telemetry** | Using `unload` event handlers dropped by browser bfcache. | Require `visibilitychange` listening combined with `sendBeacon` or `keepalive: true`. |
| **Complete App Crash** | Uncaught render error in a child component unmounts root tree. | Enforce Error Boundaries around independent functional UI widgets. |
| **PII Leak in Session Logs** | Session recording captures sensitive user keystrokes in form inputs. | Demand default masking on all input elements (`input, textarea, [contenteditable]`). |

```
---
