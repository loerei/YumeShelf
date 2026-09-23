# Modular Monolith Seams and Domain Boundaries

## Domain Audit Checklist

### 1. Domain Boundary Isolation
- [ ] Package Visibility: Ensure domain entities and internal repositories maintain module-private visibility (e.g., Go internal packages, Java package-private/modules, Rust crate privacy).
- [ ] Direct Cross-Domain Imports: Reject imports that reach directly into foreign domain data access layers or private internal structs.

### 2. Interface Contract Design
- [ ] API Abstraction: Verify that inter-module communication occurs exclusively through explicit public Interfaces or Application Services using pure Data Transfer Objects (DTOs).
- [ ] Shared Mutable State: Reject shared in-memory mutable data structures between distinct architectural modules.

### 3. Dependency DAG Topology
- [ ] Circular Dependency Analysis: Verify that module dependency graphs are strictly acyclic. Reject circular package references at both compile-time and structural levels.
- [ ] Inversion of Control: Confirm high-level policy modules depend on abstractions (interfaces), not low-level concrete infrastructure modules.

### 4. Architectural Decomposition & Seam Thresholds
- [ ] Module Scope Limit: If a proposed change touches 5+ existing architectural modules simultaneously, demand architectural decomposition into phased preparatory refactoring and isolated seam adapters before proceeding.
- [ ] Redundant Endpoint Integration: Reject new API endpoints or seam routes that introduce redundant data representations; require integration into existing domain interface schemas.

### 5. Operational Context Flow & Governance Separation
- [ ] End-to-End Parameter Seams: Verify that operational constraints (timeouts, deadlines, cancellation signals, buffer limits, early-exit flags) are injected via parameters (`options` / constructor) across the entire call chain. Reject leaf primitives that hardcode internal constants (preventing fast unit testing) and intermediary layers that choke or override caller policies.
- [ ] Orthogonal Governance Decoupling & Placement: Verify that operational governance mechanisms (stagnation watchdogs, retry engines, rate limiters) are extracted from domain logic and placed at the common ancestor scope (`src/utils/`, `src/common/`), authorizing the creation of new shared infrastructure directories when none exist on disk. Domain components emit raw progress events (`{ current, total, unit }`); governance utilities handle timing and interruption.
- [ ] Scale Invariance: Reject arbitrary hardcoded iteration ceilings derived from small sample test fixtures (Fixture Bias); require designs that accommodate streaming, incremental yielding, or dynamic progress measurement.
- [ ] Inversion of Decision (Toggle Seam Isolation): Feature flags and operational toggles MUST NOT be scattered across core domain logic. Toggles must be evaluated at the outer application layer or wrapped behind strategy seams, passing concrete behavioral strategies into domain modules.

### 6. Storage & Configuration Lifecycle Isolation
- [ ] Storage & Configuration Lifecycle Isolation: Verify that data schema migrations and configuration parsing execute exclusively within an isolated bootstrap phase at application startup. Reject directive artifacts where UI views, renderers, application loaders, or domain handlers contain transient migration flags, schema-sniffing conditionals, ad-hoc backfill logic, or dual-format configuration loaders.

### 7. Ingress Boundaries & Contract Integrity
- [ ] Ingress Parsing: Untrusted external data (network payloads, user inputs, file imports) must be parsed into strongly typed, immutable domain models at the boundary. Internal domain logic must assume valid state and must NOT execute defensive property sniffing or cascading fallbacks.
- [ ] Error Classification: Explicitly separate recoverable operational errors (network timeouts, transient I/O faults) from unrecoverable programming bugs / contract breaches (assertion failures, invariant breaches, null reference bugs). Operational errors use explicit domain error returns or typed exceptions; programming bugs fail fast.

### 8. Frontend Presentation & Orchestration Seams
- [ ] Presentation vs. Orchestration: Verify clean separation of UI presentation from business logic and data fetching. Presentational components must be pure, receiving data exclusively via typed immutable props or slot injection, without importing backend API clients or transport adapters. Domain mutations, API coordination, and business validation must be encapsulated within dedicated custom hooks or controller containers.

### 9. Component Composition & Slot Seams
- [ ] Composition over Prop Bloat: Reject UI components accumulating dozens of boolean or string configuration props to handle layout permutations. Require compound component architecture (`<Modal.Header>`, `<Modal.Body>`) or named slot-based composition (`slot="actions"`), allowing callers to inject content without altering component interface contracts.

### 10. Global Listener Provider Isolation
- [ ] Infrastructure Listener Isolation: Reject leaf UI components that attach un-encapsulated event listeners to global host interfaces (`window`, `document`, `navigator`). System-wide keyboard listeners, viewport resize trackers, and outside-dismiss handlers must be encapsulated within dedicated provider components or headless layout layers at the application root or common ancestor scope.

## Concrete Anti-Patterns

### Anti-Pattern 1: Cross-Domain Database Model Entanglement

```python
# BAD: Billing module directly querying User ORM model from User module.
# Creates deep physical coupling between database tables and domain logic.
from src.user.models import UserModel

class BillingService:
    def generate_invoice(self, user_id: str):
        user = UserModel.objects.get(id=user_id) # DIRECT CROSS-DOMAIN DATA ACCESS
        ...

# GOOD: Billing module calling explicit public application interface returning DTO.
from src.user.public import UserFacade, UserDTO

class BillingService:
    def __init__(self, user_facade: UserFacade):
        self.user_facade = user_facade

    def generate_invoice(self, user_id: str):
        user: UserDTO = self.user_facade.get_user_summary(user_id)
        ...
```

### Anti-Pattern 2: Shared Persistence Entities Across Seams

```java
// BAD: Domain A entity passed directly into Domain B API parameter.
public class OrderService {
    public void processPayment(PaymentModule paymentModule, OrderEntity order) { // OrderEntity leaks internals
        paymentModule.charge(order.getCustomer().getCardToken(), order.getTotal());
    }
}

// GOOD: Pass primitive scalar identifiers or dedicated immutable DTOs.
public class OrderService {
    public void processPayment(PaymentModule paymentModule, OrderEntity order) {
        PaymentRequest request = new PaymentRequest(order.getId(), order.getCardToken(), order.getTotal());
        paymentModule.charge(request);
    }
}
```

### Anti-Pattern 3: Hardcoding Operational Policies Across the Call Chain

```typescript
// BAD (Failure 1 - Leaf Hardcoding): Low-level utility hardcodes 10s internally,
// breaking testability (cannot inject 50ms for tests) and reusability for long jobs.
class StalenessWatchdog {
  private readonly thresholdMs = 10000; // Hardcoded leaf constant
  check(lastActive: number) {
    if (Date.now() - lastActive > this.thresholdMs) throw new Error("Stale");
  }
}

// BAD (Failure 2 - Intermediary Choking): Middle layer hardcodes 10s and forces early-exit,
// choking caller options and blinding upstream callers to full capabilities.
class ServiceFacade {
  constructor(private readonly decoder: DataDecoder) {}

  process(payload: Uint8Array) {
    const TIMEOUT_MS = 10000; // Hardcoded middle policy
    return this.decoder.parse(payload, { timeoutMs: TIMEOUT_MS, headerOnly: true }); // Chokes caller options
  }
}

// GOOD: Leaf primitives accept injected thresholds; intermediary layers propagate options transparently.
class StalenessWatchdog {
  constructor(private readonly thresholdMs: number) {} // Injected parameter enables fast unit testing
  check(lastActive: number) {
    if (Date.now() - lastActive > this.thresholdMs) throw new Error("Stale");
  }
}

interface ExecutionOptions {
  timeoutMs?: number;
  headerOnly?: boolean;
}

class ServiceFacade {
  constructor(private readonly decoder: DataDecoder) {}

  process(payload: Uint8Array, options: ExecutionOptions = {}) {
    return this.decoder.parse(payload, options); // Propagates top-down caller policy cleanly
  }
}
```

### Anti-Pattern 4: Entangling Operational Governance into Domain Codecs

```typescript
// BAD: Domain parser entangles a generic time-stagnation watchdog directly inside format decoding.
class PayloadParser {
  private lastTime = Date.now();
  parse(stream: DataStream) {
    while (stream.hasData()) {
      if (Date.now() - this.lastTime > 10000) throw new Error("Stale"); // Entangled governance
      this.decodeRecord(stream);
      this.lastTime = Date.now();
    }
  }
}

// GOOD: Domain parser emits domain metrics; composable governance utility tracks time.
interface ProgressEvent {
  current: number;
  total: number;
  unit: string; // Domain metadata (e.g. 'bytes', 'records')
}

class PayloadParser {
  parse(stream: DataStream, onProgress?: (event: ProgressEvent) => void) {
    while (stream.hasData()) {
      const record = this.decodeRecord(stream);
      onProgress?.({ current: stream.position, total: stream.length, unit: "bytes" });
    }
  }
}
```

### Anti-Pattern 5: Domain Co-location of Generic Utilities (Path-Proximity Bias)

```typescript
// BAD: A generic stream watchdog is placed inside `src/codecs/stream-watchdog.ts`
// because the developer was editing codecs. When `src/downloads/` needs it,
// it is forced to import from an unrelated domain, polluting architectural boundaries.
import { StreamWatchdog } from "../codecs/stream-watchdog"; // Cross-domain coupling

// GOOD: Domain-agnostic utilities are elevated to the common ancestor scope.
// When `src/utils/` does not yet exist, schedule its creation as a shared directory.
import { StreamWatchdog } from "../utils/stream-watchdog"; // Clean shared infrastructure
```

### Anti-Pattern 6: Scattering Feature Toggle Conditionals Across Domain Core

```typescript
// BAD: Feature flag evaluated directly inside core business logic
class OrderProcessor {
  process(order: Order) {
    if (featureFlags.isEnabled("new_discount_engine")) {
      return this.newDiscount(order);
    }
    return this.legacyDiscount(order);
  }
}

// GOOD: Inversion of Decision - Toggle resolved at bootstrap/boundary and injected via strategy interface
interface DiscountEngine {
  calculate(order: Order): Discount;
}

class OrderProcessor {
  constructor(private readonly discountEngine: DiscountEngine) {}
  process(order: Order) {
    return this.discountEngine.calculate(order);
  }
}
```

### Anti-Pattern 7: Heuristic Fallback Sniffing Inside Domain Logic vs. Boundary Parsing

```typescript
// BAD: Defensive property sniffing and cascading fallbacks inside domain logic
function processUserProfile(raw: Record<string, any>) {
  const email = raw.email ?? raw.user_email ?? raw.contact?.email ?? "unknown@domain.com";
  return { email };
}

// GOOD: Untrusted ingress parsed into immutable schema at boundary; domain consumes valid type
const UserProfileSchema = z.object({
  email: z.string().email(),
}).strict();

type UserProfile = z.infer<typeof UserProfileSchema>;

function processUserProfile(profile: UserProfile) {
  return { email: profile.email };
}
```

### Anti-Pattern 8: Monolithic Prop Bag Bloat in UI Containers

```javascript
// BAD: Accumulating boolean and string flags for every minor layout variation
function ComplexModal({
  isOpen, title, titleIcon, headerActionText, onHeaderAction,
  bodyText, showFooter, primaryText, onPrimary, variant
}) {
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
function WorkspaceDialog({ isOpen, onOpenChange, children }) {
  return (
    <DialogTrigger isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal className="modal-overlay">
        <Dialog className="modal-dialog">{children}</Dialog>
      </Modal>
    </DialogTrigger>
  );
}
WorkspaceDialog.Header = ({ children }) => <div className="dialog-header">{children}</div>;
WorkspaceDialog.Body = ({ children }) => <div className="dialog-body">{children}</div>;
WorkspaceDialog.Footer = ({ children }) => <div className="dialog-footer">{children}</div>;
```

### Anti-Pattern 9: Leaf Components Attaching Raw Global Listeners

```javascript
// BAD: Leaf component binds directly to window resize, causing listener leaks and hydration mismatches
function DynamicCard() {
  useEffect(() => {
    const handleResize = () => { /* resize logic */ };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  return <div className="card">...</div>;
}

// GOOD: Global listeners isolated in root provider; leaf components consume scoped context
function ViewportProvider({ children }) {
  const [viewport, setViewport] = useState(getViewport);
  useEffect(() => {
    const handleResize = () => setViewport(getViewport());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  return <ViewportContext.Provider value={viewport}>{children}</ViewportContext.Provider>;
}
```

## Failure Modes & Mitigations

- Cascading Module Refactoring: Enforce architectural fitness functions (e.g., ArchUnit, Go-check) in CI to block non-conforming cross-module imports.
- Implicit State Corruption: Wrap module boundaries in immutability guarantees or deep-copy DTO transformations.
- Inflexible Consumer Coupling: When lower-level modules hardcode upper-level timeouts or payload filters, extract operational flags into optional caller parameters (`options`).
- Monolithic Utility Bloat: When domain parsers embed time, networking, or retry loops, extract them into orthogonal utility helpers.
- Test-Resistant Hardcoded Constants: When leaf primitives embed magic numbers for timeouts or retry limits, refactor them to accept injected constructor options so unit tests can execute with microsecond thresholds.
- Domain Smuggling via Proximity Placement: When generic utilities are buried inside specific domain folders, elevate them to package-root shared directories (`src/utils/`, `src/common/`).
- Presentation-Orchestration Coupling: Extract data fetching and domain state machines into custom hooks, keeping presentational components pure and testable.
- Prop Contract Explosion: Convert monolithic container components to compound components or named slots when prop counts exceed 5 configuration flags.
- Global Listener Leaks: Isolate window/document listeners in centralized provider components at the application root.
