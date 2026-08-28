# Testability Subdocument: Unit & Integration Test Determinism

## Domain Audit Checklist

### 1. Assertion Determinism & Isolation
- [ ] System Time Isolation: Verify that tests depending on time consume mockable clock abstractions (`Clock`, `TimeProvider`) rather than calling system time primitives (`Date.now()`, `time.Now()`).
- [ ] Randomness Seeding: Ensure pseudo-random sequence generations consume fixed seed inputs within test suites.

### 2. Mock Boundary Design
- [ ] Over-Mocking Anti-Patterns: Confirm unit tests mock only foreign infrastructure boundaries (HTTP clients, DB drivers), not local domain logic structs or internal helper utility modules.
- [ ] Mock Verification: Ensure all mock objects verify expected call counts and input values explicitly.

### 3. Test Fixture Leakage
- [ ] Independent State Cleanup: Verify that integration tests execute within isolated database transactions that roll back automatically upon test completion, or use atomic schema isolation per worker.

## Concrete Anti-Patterns

### Anti-Pattern 1: Non-Deterministic Time Coupling

```typescript
// BAD: Test fails depending on execution duration or system clock boundary!
test('verifies subscription active status', () => {
  const user = createUser({ subExpires: new Date(Date.now() + 1000) });
  // If garbage collection pauses execution for >1 second, this assertion fails!
  expect(user.isSubscriptionActive()).toBe(true);
});

// GOOD: Freeze time context using fake clock provider.
test('verifies subscription active status', () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  
  const user = createUser({ subExpires: new Date('2026-01-01T00:00:01Z') });
  expect(user.isSubscriptionActive()).toBe(true);
  
  jest.useRealTimers();
});
```

## Failure Modes & Mitigations

- Flaky Tests via Parallel Shared State Mutation: Run test engines in process-isolated modes with randomized test execution ordering.
- False Positive Assertion Passes: Reject tests containing missing dynamic assertion validations or unhandled promise catch blocks.
