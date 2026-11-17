# Library, SDK, and Reusable Package Architecture

Audits public API surface minimalization, strict option bag contracts, zero import-time side effects, programmatic error taxonomies, and host-controlled lifecycle seams for libraries, SDKs, and shared packages.

## Domain Audit Checklist

### 1. Minimal Public API Surface & Strict Option Contracts
- [ ] **Explicit Named Exports over Wildcard Barrels (`export *`)**: Expose a minimal, intentional set of public functions, classes, and DTO types through explicit named exports (`export { Client, type ClientOptions } from "./client.js"`) rather than recursive `export * from "./module.js"` barrels that leak internal helpers into the public SemVer contract.
- [ ] **No Internal Type Leakage**: Confirm public method signatures and return types never expose private internal helper structs, raw third-party vendor SDK types, or internal persistence models.
- [ ] **Ban Loose Index Signatures on Option Bags (`[key: string]: any/unknown`)**: Never add `[key: string]: any` or `[key: string]: unknown` to typed public configuration/option interfaces. Loose index signatures disable TypeScript's excess property checking, silently swallowing caller typos (e.g. `{ timoutMs: 5000 }` instead of `{ timeoutMs: 5000 }`). If arbitrary extension metadata is needed, nest it under an explicit `metadata?: Record<string, unknown>` field.

### 2. Zero Import-Time Side Effects (`sideEffects: false`)
- [ ] **Pure Module Evaluation**: Importing the library MUST NOT execute network/disk I/O, spawn background timers/workers, register global listeners, or mutate `globalThis`/`window`.
- [ ] **Explicit Configuration Injection over Ambient `process.env`**: Reject reading `process.env` or global config files implicitly inside library modules. Require callers to pass configuration explicitly via constructor or factory parameters (`new SdkClient({ apiKey, timeoutMs })`), optionally offering an explicit opt-in helper (`SdkClient.fromEnv()`) at the outer facade.

### 3. Programmatic Error Taxonomy (No `process.exit` or String-Only Errors)
- [ ] **Typed Error Hierarchy & Error Codes**: Export a base library error class (`class SdkError extends Error`) with a deterministic, machine-readable `readonly code: SdkErrorCode` discriminant, `cause` chaining, and structured metadata so host applications can branch on `err.code` without regex-matching `err.message`.
- [ ] **Ban Process Termination**: Library code MUST NEVER call `process.exit()`, `std::process::exit()`, or `panic!()` on runtime or validation failures; always return or throw typed errors to the host caller.

### 4. Pluggable Host Seams & Tree-Shakable Subpaths
- [ ] **Bring-Your-Own Infrastructure Seams (End-to-End Seam Discipline)**: Allow host applications to inject custom transport (`fetch`), virtual filesystem/storage adapters (`IFileSystem`), custom clock, and `AbortSignal`. Verify *every* internal module routes through the injected seam rather than bypassing it via direct top-level `node:fs` or ambient singleton imports.
- [ ] **Optional Adapter Subpath Isolation**: Isolate heavy optional integrations (e.g. Redis adapter, Postgres adapter, OpenTelemetry bridge) into dedicated subpath entrypoints (`my-lib/redis`) so consumers importing the core package do not pull unused transitive dependencies.

## Concrete Anti-Patterns

### Anti-Pattern 1: Import-Time Side Effects, Loose Option Index Signatures, and Untyped Errors

```typescript
// BAD:
// 1. Reads process.env and calls process.exit at import time.
// 2. [key: string]: any disables excess property checking (caller typo { timoutMs: 1000 } compiles silently!).
// 3. export * leaks internal helpers; throws plain Error strings.
export * from "./internal-helpers.js";
export interface ChargeOptionsBad {
  readonly timeoutMs?: number;
  [key: string]: any; // Destroys typo checking on option keys!
}

const API_KEY = process.env.VENDOR_API_KEY;
if (!API_KEY) process.exit(1); // Crashes host application on import!

// GOOD: Pure module evaluation, strict option contract, explicit named exports, pluggable seam, and typed error codes
export type BillingErrorCode = "AUTH_INVALID" | "RATE_LIMITED" | "UPSTREAM_UNAVAILABLE";

export class BillingSdkError extends Error {
  constructor(
    public readonly code: BillingErrorCode,
    message: string,
    public readonly status?: number,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "BillingSdkError";
  }
}

export interface BillingClientOptions {
  readonly apiKey: string;
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
  readonly metadata?: Readonly<Record<string, unknown>>; // Explicit extension bag preserves typo checking on root options
}

export class BillingClient {
  private readonly fetchFn: typeof fetch;
  constructor(private readonly options: BillingClientOptions) {
    if (!options.apiKey) throw new BillingSdkError("AUTH_INVALID", "apiKey is required");
    this.fetchFn = options.fetchImpl ?? globalThis.fetch;
  }

  async chargeCustomer(amountCents: bigint, signal?: AbortSignal): Promise<{ transactionId: string }> {
    const res = await this.fetchFn("https://api.vendor.com/charge", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.options.apiKey}` },
      body: JSON.stringify({ amountCents: amountCents.toString() }),
      signal
    });
    if (res.status === 429) throw new BillingSdkError("RATE_LIMITED", "Rate limit exceeded", 429);
    if (!res.ok) throw new BillingSdkError("UPSTREAM_UNAVAILABLE", "Vendor error", res.status);
    return res.json();
  }
}
```

## Failure Modes & Mitigations

| Failure Mode | Root Cause | Mitigation |
| :--- | :--- | :--- |
| **Host App Crash or Hang on `import`** | Library executes `process.exit()`, `setInterval`, or network I/O at top-level module scope. | Move all initialization and validation inside explicit class constructors or `createClient()` factories. |
| **Silent Caller Option Typos** | Option interface includes `[key: string]: any`, disabling TypeScript excess property checks. | Remove index signatures from option interfaces; place custom key-values inside an explicit `metadata` sub-field. |
| **Broken VFS / Portability Seam** | Core modules accept `IFileSystem`, but one sub-module imports `node:fs` directly at top level. | Enforce seam injection across all internal modules and ban raw `node:fs` imports outside the default Node adapter. |
| **Bundle Bloat & SemVer Leakage** | Root `index.ts` uses `export *` across internal modules and optional adapters. | Use explicit named exports in `index.ts` and split optional adapters into separate subpath exports (`pkg/adapters/*`). |
