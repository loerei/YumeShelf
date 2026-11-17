# Library and SDK Observability, BYO-Logger, and Non-Intrusive Telemetry

Audits diagnostic seams, zero stream pollution, Bring-Your-Own-Logger (BYOL) contracts, API-only OpenTelemetry integration, and error inspection redaction for libraries and SDKs.

## Domain Audit Checklist

### 1. Zero Stream Pollution & Ban on Global Sinks
- [ ] **No Direct `stdout` / `stderr` or File Writes**: Library code MUST NEVER call `console.log`, `console.warn`, `console.error`, `process.stdout.write`, `process.stderr.write`, or create local log files on disk.
- [ ] **Ban Global Logger / Tracer Registration**: Library code MUST NEVER initialize a global logging subscriber (`tracing_subscriber::fmt().init()`, `winston.configure()`) or register a global OpenTelemetry `TracerProvider` / `MeterProvider` (which hijacks or overwrites the host application's telemetry pipeline).

### 2. Bring-Your-Own-Logger (BYOL) & Diagnostic Hook Seams
- [ ] **Injected Logger Interface with No-Op Default**: Accept an optional minimal `Logger` interface (`{ debug?, info?, warn?, error? }`) or structured diagnostic callback (`onDiagnostic?: (event: DiagnosticEvent) => void`) via client/function options, defaulting to a zero-allocation `NoOpLogger` when omitted.
- [ ] **Lazy / Guarded Diagnostic Formatting**: Guard verbose diagnostic payload construction behind an active check (`if (this.logger !== NOOP_LOGGER)`) so zero string/object allocations occur when the host application does not supply a logger.

### 3. Non-Intrusive OpenTelemetry API Integration
- [ ] **API-Only Dependency**: When instrumenting a library with OpenTelemetry, depend exclusively on `@opentelemetry/api` (in `peerDependencies` or lightweight API dependency). Obtain tracers/meters via `trace.getTracer("pkg-name", "pkg-version")`, which safely returns a zero-cost no-op tracer when the host application has not configured an SDK.
- [ ] **Context Propagation Respect**: Accept or preserve active context across async calls and close library-created child spans in `finally` blocks, recording caught exceptions on the span before rethrowing to the host caller.

### 4. Error & Client Inspection Redaction
- [ ] **Custom Inspect & JSON Redaction**: Client instances and custom `SdkError` objects holding configuration or request metadata MUST implement `toJSON()` and custom inspection (`Symbol.for("nodejs.util.inspect.custom")` in JS/TS, custom `fmt::Debug` in Rust, `__repr__` in Python) that redact `apiKey`, `Authorization` headers, and tokens so `console.error(err)` in the host app never leaks secrets.

## Concrete Anti-Patterns

### Anti-Pattern 1: Library Writing to `console.error` and Registering Global OTel Provider

```typescript
// BAD: Pollutes host stdout/stderr, registers a global TracerProvider, and leaks apiKey when client/error is logged
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
new NodeTracerProvider().register(); // Overwrites host app's TracerProvider!

export class PaymentClientBad {
  constructor(public readonly apiKey: string) {} // Public property printed in console.log(client)
  async charge(amount: number) {
    console.log(`Charging ${amount}...`); // Corrupts CLI/JSON stdout of host app
  }
}

// GOOD: BYO-Logger with NoOp default, API-only OTel tracer, and redacted custom inspect/toJSON
import { trace, SpanStatusCode } from "@opentelemetry/api";

export interface SdkLogger {
  debug?(msg: string, meta?: Record<string, unknown>): void;
  error?(msg: string, meta?: Record<string, unknown>): void;
}

const NOOP_LOGGER: SdkLogger = {};
const INSPECT_CUSTOM = Symbol.for("nodejs.util.inspect.custom");

export class PaymentClient {
  readonly #apiKey: string;
  private readonly logger: SdkLogger;
  private readonly tracer = trace.getTracer("@acme/payment-sdk", "1.0.0");

  constructor(options: { apiKey: string; logger?: SdkLogger }) {
    this.#apiKey = options.apiKey;
    this.logger = options.logger ?? NOOP_LOGGER;
  }

  toJSON() {
    return { client: "PaymentClient", apiKey: "[REDACTED]" };
  }

  [INSPECT_CUSTOM]() {
    return "PaymentClient { apiKey: '[REDACTED]' }";
  }

  async charge(amountCents: bigint): Promise<void> {
    return this.tracer.startActiveSpan("PaymentClient.charge", async (span) => {
      try {
        this.logger.debug?.("Initiating charge", { amountCents: amountCents.toString() });
        // execute request using this.#apiKey ...
      } catch (err) {
        span.recordException(err as Error);
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw err;
      } finally {
        span.end();
      }
    });
  }
}
```

## Failure Modes & Mitigations

| Failure Mode | Root Cause | Mitigation |
| :--- | :--- | :--- |
| **Broken CLI `--json` Output in Host App** | Imported library calls `console.log` or `console.warn` directly. | Ban `console.*` in library code; route all diagnostics through an optional injected `Logger` defaulting to no-op. |
| **Host App Traces Disappear** | Library imports `@opentelemetry/sdk-node` and calls `.register()`. | Depend only on `@opentelemetry/api` and call `trace.getTracer()`. |
| **Secret Leak in Host Crash Logs** | Host logs caught `SdkError` containing `err.config.headers.Authorization`. | Strip sensitive headers before attaching request metadata to `SdkError` and implement redacted `toJSON()` / `Debug`. |
