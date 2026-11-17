# Frontend Component Composition, Orchestration, and Global Listener Seams

Audits UI presentation vs. orchestration separation, compound component composition, and root global listener isolation.

## Domain Audit Checklist

### 1. Presentation vs. Orchestration Seams
- [ ] Pure Presentational Components: Verify presentational components receive data and callbacks strictly via typed immutable props without importing backend API clients, transport adapters, or persistence stores.
- [ ] Controller / Hook Encapsulation: Confirm domain mutations, async data fetching, and business validation are isolated inside dedicated custom hooks, view-models, or controller containers.

### 2. Component Composition & Slot Seams
- [ ] Composition over Prop Bloat: Reject container components accumulating $> 5$ boolean/string layout permutation flags (e.g. `showFooter`, `headerActionText`, `titleIcon`). Mandate compound component seams (`<Dialog.Header>`, `<Dialog.Body>`, `<Dialog.Footer>`) or named slots (`children`, `actions`).

### 3. Global Listener Provider Isolation
- [ ] Root Infrastructure Listeners: Reject leaf UI components attaching direct event listeners to global host objects (`window`, `document`, `navigator`). Encapsulate global keyboard shortcuts, viewport resize observers, and outside-dismiss listeners inside root provider components or shared layout hooks.

## Concrete Anti-Patterns

### Anti-Pattern 1: Monolithic Prop Bag Bloat in UI Containers

```tsx
// BAD: Accumulating boolean and string flags for every layout permutation
function ComplexModal({
  isOpen, title, titleIcon, headerActionText, onHeaderAction,
  bodyText, showFooter, primaryText, onPrimary, variant
}: ComplexModalProps) {
  if (!isOpen) return null;
  return (
    <div className={`modal modal-${variant}`}>
      <div className="header">{titleIcon}<h3>{title}</h3>{headerActionText && <button onClick={onHeaderAction}>{headerActionText}</button>}</div>
      <div className="body">{bodyText}</div>
      {showFooter && <div className="footer"><button onClick={onPrimary}>{primaryText}</button></div>}
    </div>
  );
}

// GOOD: Slot-based compound component composition
function WorkspaceDialog({ isOpen, onOpenChange, children }: DialogProps) {
  if (!isOpen) return null;
  return <div className="modal-dialog" role="dialog">{children}</div>;
}
WorkspaceDialog.Header = ({ children }: SlotProps) => <header className="dialog-header">{children}</header>;
WorkspaceDialog.Body = ({ children }: SlotProps) => <section className="dialog-body">{children}</section>;
WorkspaceDialog.Footer = ({ children }: SlotProps) => <footer className="dialog-footer">{children}</footer>;
```

### Anti-Pattern 2: Leaf Components Attaching Raw Global Listeners

```tsx
// BAD: Each leaf card binds directly to window resize, causing N listener leaks and layout thrashing
function DynamicCard() {
  useEffect(() => {
    const handleResize = () => { /* per-card resize logic */ };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  return <div className="card">...</div>;
}

// GOOD: Single root ViewportProvider manages global listener; leaves consume context
function ViewportProvider({ children }: { children: React.ReactNode }) {
  const [viewport, setViewport] = useState(getViewport);
  useEffect(() => {
    const handleResize = () => setViewport(getViewport());
    window.addEventListener("resize", handleResize, { passive: true });
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  return <ViewportContext.Provider value={viewport}>{children}</ViewportContext.Provider>;
}
```

## Failure Modes & Mitigations

| Failure Mode | Root Cause | Mitigation |
| :--- | :--- | :--- |
| **Prop Contract Explosion** | Adding boolean props to shared containers for each caller edge case. | Refactor to compound components or named ReactNode/slot props when configuration flags exceed 5. |
| **Untestable Presentational Views** | Leaf views import API singletons or IPC bridges directly. | Extract data orchestration into custom hooks/controllers and pass plain data/callbacks via props. |
| **Global Listener Leaks & Duplication** | N mounted leaf components register N duplicate `window` listeners. | Centralize `window`/`document` listeners in a single root provider or shared subscription store. |
