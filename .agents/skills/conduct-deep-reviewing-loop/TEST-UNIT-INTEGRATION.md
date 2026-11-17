# Unit and Integration Test Determinism, Seam Integrity, and Anti-Tautology

Audits assertion determinism, mock boundary fidelity, self-fulfilling test prevention, and fixture isolation.

## Domain Audit Checklist

### 1. Anti-Tautology & Self-Fulfilling Test Prevention
- [ ] **Ban Mocking the System Under Test (SUT)**: Reject tests that stub or spy-override methods on the class/module being tested, or tests that assert only `expect(mockFn).toHaveBeenCalled()` without asserting observable output values, state transitions, or persisted side effects.
- [ ] **No Formula Duplication & Mandatory Normalization Boundaries**: Reject tests that copy-paste the production implementation formula into the `expect(...)` calculation. Mandate concrete, pre-calculated expected literals including numeric boundary values (`0`, `-1`, empty, overflow) and, for any string/identity comparison (emails, usernames, paths), mandatory normalization boundaries: case variants (`"User@Example.com"`), leading/trailing whitespace (`" user@example.com\n"`), and Unicode normalization forms (`NFC` vs `NFD`).
- [ ] **Disambiguating Masked Responses via Side-Effect & Telemetry Assertions**: When multiple distinct internal execution paths intentionally return identical public outputs (e.g., anti-enumeration endpoints returning `200 OK` on both dispatch and mismatch), tests MUST assert both the external boundary side-effect state (e.g., `outbox.length === 1` vs `0`) AND the exact internal diagnostic outcome/reason (e.g., `abortReason: "EMAIL_MISMATCH"` vs `"USER_NOT_FOUND"` via injected logger/telemetry seam) so tests cannot pass via the wrong early-return branch.
- [ ] **Mock-to-Contract Schema Parity (Anti-Mock-Drift)**: Verify mock payloads and stub responses are typed against and parsed through the exact canonical producer DTO / Zod schema so schema changes immediately fail consumer unit tests.

### 2. Assertion Determinism & Clock/Random Isolation
- [ ] **System Time & Timer Isolation**: Verify time-dependent logic consumes an injected clock (`Clock`, `performance.now` seam) or deterministic fake timers (`vi.useFakeTimers()`, `jest.useFakeTimers()`) rather than real wall-clock sleeps.
- [ ] **Seeded Randomness**: Ensure randomized or property-based tests consume explicit, reproducible PRNG seeds.

### 3. Mock Boundary & Fixture Isolation
- [ ] **External Boundary Mocking & Programmatic Builders**: Mock only foreign I/O boundaries (network clients, third-party SDKs, LLM/AI providers, OS dialogs), never internal domain entities, pure reducers, or parser helpers. Ban live LLM or external network calls in unit/integration suites (inject deterministic replay cassettes or schema-validated fixture seams). For local SQLite/storage logic, prefer fast in-memory instances (`:memory:`) or cross-platform in-memory VFS adapters (`IFileSystem`), and use **programmatic byte/AST fixture builders** for binary/protocol parsers rather than committing opaque binary blobs or mocking internal parser steps.
- [ ] **Independent State & Handle Teardown**: Verify integration tests run inside isolated transactions/temp directories and clean up all open timers, file handles, and event listeners in `afterEach`/`finally` hooks.

## Concrete Anti-Patterns

### Anti-Pattern 1: Self-Fulfilling Tautological Mock Test

```typescript
// BAD: Test mocks the internal calculation and only asserts the mock was called with whatever it was given.
// Passes 100% of the time even if production discount logic is completely broken.
test("applies discount (BAD - tautological)", () => {
  const service = new CheckoutService();
  vi.spyOn(service as any, "computeDiscount").mockReturnValue(150);
  const total = service.checkout({ subtotal: 1000, coupon: "SAVE15" });
  expect((service as any).computeDiscount).toHaveBeenCalledWith(1000, "SAVE15");
  expect(total).toBe(1000 - 150); // Mirrors formula instead of testing real behavior
});

// GOOD: Exercises real public interface against concrete input/output fixtures without mocking internals
test("applies 15% SAVE15 coupon in integer cents", () => {
  const service = new CheckoutService(new InMemoryCouponRepo({ SAVE15: { percentOff: 15 } }));
  const receipt = service.checkout({ subtotalCents: 1000n, couponCode: "SAVE15" });
  expect(receipt).toEqual({
    subtotalCents: 1000n,
    discountCents: 150n,
    finalTotalCents: 850n
  });
});
```

### Anti-Pattern 2: Unvalidated Mock Payload Causing Silent Mock Drift

```typescript
// BAD: Untyped inline mock object omits required v2 field `currency` added to producer API
const mockApiResponse = { id: "ord_1", amountCents: 500 } as any;

// GOOD: Parse mock fixture through canonical producer schema so contract drift breaks test immediately
const mockApiResponse = OrderResponseSchema.parse({
  id: "ord_1",
  amountCents: 500,
  currency: "USD"
});
```

## Failure Modes & Mitigations

| Failure Mode | Root Cause | Mitigation |
| :--- | :--- | :--- |
| **Green Tests on Broken Production Code** | AI implementer mocks internal helpers or asserts mock call arguments instead of output state. | Require assertions on returned values/persisted state across public interfaces with zero internal spies. |
| **Mock Drift Integration Crash** | Producer changes response schema while consumer unit tests keep passing against stale hand-rolled mocks. | Validate all test fixtures through shared canonical schemas (`Schema.parse(fixture)`) at test setup. |
| **Flaky / Expensive CI Runs** | Real `setTimeout` delays, live LLM/network calls, or uncleaned open sockets/intervals across test files. | Use fake timers, deterministic replay seams for external/LLM APIs, and `afterEach` handle teardown. |
| **False-Positive Masked Response Test** | Test asserts `HTTP 200` (or only `outbox.length === 0`) on a security-masked endpoint, passing even when code aborts at the wrong branch or drops valid requests. | Require positive tests to assert persisted outbox/queue side effects and negative tests to assert the exact internal `abort_reason` diagnostic event. |
