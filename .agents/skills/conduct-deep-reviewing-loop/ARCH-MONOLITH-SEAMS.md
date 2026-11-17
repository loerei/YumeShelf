# Modular Monolith Seams, Governance Decoupling, and Domain Boundaries

Audits package visibility, internal facade contracts, dependency DAG acyclicity, operational parameter seams, orthogonal governance placement, and bootstrap lifecycle isolation.

## Domain Audit Checklist

### 1. Domain Boundary Isolation & Interface Contracts
- [ ] **Package Visibility**: Ensure domain entities and internal repositories maintain module-private visibility (e.g. Go `internal/`, Java package-private, Rust crate privacy). Reject direct cross-domain imports reaching into foreign data access layers or private structs.
- [ ] **API Abstraction & DTO Demarcation**: Verify inter-module communication occurs exclusively through explicit public Interfaces or Application Services using immutable Data Transfer Objects (DTOs). Reject shared in-memory mutable state across distinct modules.
- [ ] **Third-Party SDK Anti-Corruption Layer (ACL)**: Reject importing third-party vendor SDK clients, raw response types, or vendor-specific exceptions (e.g. Stripe, OpenAI, AWS, Supabase SDKs) directly into core domain services or UI components. Encapsulate external vendor SDKs behind domain-owned Port/Adapter interfaces that translate vendor payloads and rate-limit headers (`Retry-After`) into canonical domain DTOs and typed domain errors.
- [ ] **Module Cohesion & Strategy Decomposition**: Verify that distinct domain variants, formats, codecs, or polymorphic strategies are isolated into dedicated, cohesive module files. Reject directive artifacts that bundle multiple domain strategies into a single monolithic file or inline heavy domain logic directly into coordinating facades and package entrypoints. Entrypoints MUST remain thin routers or export facades.

### 2. Dependency DAG Topology & Decomposition Thresholds
- [ ] **Circular Dependency Analysis**: Verify module dependency graphs are strictly acyclic at both compile-time and runtime levels.
- [ ] **Inversion of Control**: Confirm high-level policy modules depend on abstractions (interfaces), not low-level concrete infrastructure modules.
- [ ] **Module Scope Limit**: If a proposed change touches 5+ existing architectural modules simultaneously, demand phased preparatory refactoring and isolated seam adapters.
- [ ] **Redundant Endpoint Integration**: Reject new API endpoints or seam routes that introduce redundant data representations; require integration into existing domain interface schemas.

### 3. Operational Context Flow & Governance Separation
- [ ] **End-to-End Parameter Seams**: Verify operational constraints (timeouts, deadlines, `AbortSignal`, buffer limits, early-exit flags) are injected via parameters (`options` / constructor) across the entire call chain. Reject leaf primitives that hardcode internal constants (preventing fast unit testing) and intermediary layers that choke or override caller policies.
- [ ] **Orthogonal Governance Decoupling & Placement Altitude**: Verify operational governance mechanisms (staleness watchdogs, retry engines, rate limiters) are extracted from domain logic and placed at common ancestor scope (`src/utils/`, `src/common/`), **explicitly authorizing the creation of new shared infrastructure directories when none exist on disk**. Domain components emit raw progress events (`{ current, total, unit }`); governance utilities handle timing and interruption.
- [ ] **Scale Invariance**: Reject arbitrary hardcoded iteration ceilings derived from small sample test fixtures (*Fixture Bias*); require streaming, incremental yielding, or dynamic progress measurement.
- [ ] **Inversion of Decision (Toggle Seam Isolation)**: Feature flags and operational toggles MUST NOT be scattered across core domain logic. Evaluate toggles at the outer application boundary and inject concrete behavioral strategies into domain modules.

### 4. Storage & Configuration Lifecycle Isolation
- [ ] **Startup Bootstrap Isolation**: Verify data schema migrations and configuration parsing execute exclusively within an isolated bootstrap phase at application startup. Reject directive artifacts where UI views, renderers, application loaders, or domain handlers contain transient migration flags, schema-sniffing conditionals, ad-hoc backfill logic, or dual-format configuration loaders.
- [ ] **Multi-Tier Storage Segregation**: In multi-process or client-server systems, enforce strict separation between domain persistence (disk DB) and client view state (browser storage, transient caches). Reject pushing transient UI preferences into backend database files (causing I/O thrashing) or treating distinct persistence tiers as a single store.

### 5. Ingress Boundaries & Error Classification
- [ ] **Macro Boundary Enforcement**: Untrusted external data entering module seams must pass through typed facade boundaries and strict schema parsers before reaching domain services.
- [ ] **Error Classification**: Explicitly separate recoverable operational errors (network timeouts, transient I/O faults) from unrecoverable programming bugs / contract breaches (assertion failures, invariant breaches). Operational errors use explicit domain error returns or typed exceptions; programming bugs fail fast.

## Concrete Anti-Patterns

### Anti-Pattern 1: Cross-Domain Database Model Entanglement & Private Module Bypassing

```python
# BAD: Billing module directly querying User ORM model from User module.
from src.user.models import UserModel

class BillingService:
    def generate_invoice(self, user_id: str):
        user = UserModel.objects.get(id=user_id) # DIRECT CROSS-DOMAIN DATA ACCESS

# GOOD: Billing module calling explicit public application interface returning DTO.
from src.user.public import UserFacade, UserDTO

class BillingService:
    def __init__(self, user_facade: UserFacade):
        self.user_facade = user_facade

    def generate_invoice(self, user_id: str):
        user: UserDTO = self.user_facade.get_user_summary(user_id)
```

### Anti-Pattern 2: Shared Persistence Entities Across Seams

```java
// BAD: Domain A entity passed directly into Domain B API parameter, leaking internals.
public class OrderService {
    public void processPayment(PaymentModule paymentModule, OrderEntity order) {
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

### Anti-Pattern 3: Hardcoding Operational Policies Across the Call Chain (Leaf Hardcoding & Intermediary Choking)

```typescript
// BAD (Failure 1 - Leaf Hardcoding): Low-level utility hardcodes 10s internally,
// breaking testability (cannot inject 50ms for tests) and reusability for long jobs.
class StalenessWatchdog {
  private readonly thresholdMs = 10000; // Hardcoded leaf constant
  check(lastActive: number) {
    if (performance.now() - lastActive > this.thresholdMs) throw new Error("Stale");
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
    if (performance.now() - lastActive > this.thresholdMs) throw new Error("Stale");
  }
}

interface ExecutionOptions {
  timeoutMs?: number;
  headerOnly?: boolean;
  signal?: AbortSignal;
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
// BAD: Domain parser entangles a time-stagnation watchdog directly inside format decoding.
class PayloadParser {
  private lastTime = performance.now();
  parse(stream: DataStream) {
    while (stream.hasData()) {
      if (performance.now() - this.lastTime > 10000) throw new Error("Stale"); // Entangled governance
      this.decodeRecord(stream);
      this.lastTime = performance.now();
    }
  }
}

// GOOD: Domain parser emits raw progress metrics; composable governance utility tracks time.
interface ProgressEvent {
  current: number;
  total: number;
  unit: string; // e.g. 'bytes', 'records'
}

class PayloadParser {
  parse(stream: DataStream, onProgress?: (event: ProgressEvent) => void) {
    while (stream.hasData()) {
      this.decodeRecord(stream);
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

// GOOD: Elevate domain-agnostic utilities to the common ancestor scope (`src/utils/` or `src/common/`).
// When `src/utils/` does not yet exist on disk, schedule its creation as a shared directory.
import { StreamWatchdog } from "../utils/stream-watchdog";
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

### Anti-Pattern 7: Monolithic Strategy Bundling & Heavy Entrypoint Barrels

```typescript
// BAD: Inlining all polymorphic strategy variants directly into the package entrypoint
// src/codecs/schema/index.ts (400+ lines handling multiple format branches)
export function extractSchema(strategy: string, data: unknown) {
  if (strategy === 'format-a') { /* 100 lines of format-a logic */ }
  if (strategy === 'format-b') { /* 100 lines of format-b logic */ }
}

// GOOD: Dedicated sibling modules coordinated by a thin dispatcher facade
// src/codecs/schema/format-a.ts, src/codecs/schema/format-b.ts
// src/codecs/schema/index.ts (thin router facade)
import { extractFormatA } from './format-a.js';
import { extractFormatB } from './format-b.js';

const EXTRACTORS: Record<string, ExtractorFn> = { 'format-a': extractFormatA, 'format-b': extractFormatB };
export function extractSchema(strategy: string, data: unknown) {
  const fn = EXTRACTORS[strategy] ?? extractGeneric;
  return fn(data);
}
```

## Failure Modes & Mitigations

- **Cascading Module Refactoring**: Enforce module-private visibility on internal repositories and expose public DTO facades.
- **Inflexible Consumer Coupling & Test-Resistant Constants**: Extract operational flags and timeouts into injected caller `options` and constructor parameters so unit tests can run with millisecond thresholds.
- **Domain Smuggling via Proximity Placement**: Elevate generic utilities buried inside domain folders to package-root shared directories (`src/utils/`, `src/common/`).
- **Strategy Monoliths & Heavy Entrypoints**: Decompose polymorphic strategies, formats, and driver variants into dedicated sibling files coordinated by thin router facades.
