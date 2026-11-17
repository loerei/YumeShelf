# Library Public Entrypoint Testing, Type-Level Assertions, and Dual-Format Verification

Audits public entrypoint import discipline, compile-time type contract assertions (`expectTypeOf`, `@ts-expect-error`), and packaged artifact verification for libraries and SDKs.

## Domain Audit Checklist

### 1. Public Entrypoint-Only Test Imports
- [ ] **Ban Internal Deep Imports in Contract Tests**: Library unit and integration tests verifying public capabilities MUST import symbols exclusively from the public package entrypoint (`src/index.ts` or package self-import `"my-lib"`) rather than deep internal files (`../src/internal/helper.ts`). If a symbol or type is needed by a consumer test, it MUST be exported from a public entrypoint.

### 2. Compile-Time Type Contract Testing
- [ ] **Positive & Negative Type Assertions**: For strongly typed libraries and SDKs, the test suite MUST include compile-time type tests (`expectTypeOf` in Vitest / `tsd`, plus `@ts-expect-error` for invalid argument combinations) verifying:
  - Generic type parameter inference and return type narrowing (e.g. Discriminated Union narrowing on result/error types).
  - Immutability (`readonly`) of returned state structures.
  - Compile-time rejection when required options are omitted or mutually exclusive options are combined (`@ts-expect-error`).

### 3. Packaged Artifact & Dual-Format Smoke Verification
- [ ] **Built Artifact Smoke Test**: When the library builds to `dist/`, include an automated smoke verification step importing the compiled `dist/` entrypoint (in both ESM `import` and CJS `require` when dual-published) and asserting that `err instanceof SdkError` and core methods execute without missing runtime files.

## Concrete Anti-Patterns

### Anti-Pattern 1: Testing Private Internal Paths While Public Entrypoint Omits Exports

```typescript
// BAD: Test imports directly from "../src/internal/parser" and passes,
// while "src/index.ts" forgot to export ParseOptions and parseToken!
import { parseToken, type ParseOptions } from "../src/internal/parser";

test("parses token", () => {
  expect(parseToken("abc")).toEqual({ id: "abc" });
});

// GOOD: Imports exclusively from public entrypoint + verifies compile-time type inference and @ts-expect-error
import { expectTypeOf, test, expect } from "vitest";
import { parseToken, SdkError, type ParseOptions, type TokenResult } from "../src/index";

test("public entrypoint exports runtime function, error class, and strict types", () => {
  const res = parseToken("abc", { strict: true } satisfies ParseOptions);
  expect(res).toEqual({ status: "ok", id: "abc" });

  // Compile-time type contract verification
  expectTypeOf(res).toEqualTypeOf<TokenResult>();

  // @ts-expect-error - invalid option type must fail compilation
  parseToken("abc", { strict: "yes" });
});
```

## Failure Modes & Mitigations

| Failure Mode | Root Cause | Mitigation |
| :--- | :--- | :--- |
| **Unusable Library Release (Missing Export)** | Implementation exports helper from `src/parser.ts` and tests import `src/parser.ts`, but `src/index.ts` never re-exports it. | Require tests to import exclusively from `src/index.ts` (or declared public subpaths). |
| **Silent Generic Type Degradation to `any`** | Refactoring a generic helper breaks type inference to `any` or `unknown` while runtime unit tests still pass. | Mandate `expectTypeOf(result).not.toBeAny()` and exact type assertions in test suites. |
