# Universal Observability Invariants

Universal requirements for error context preservation, silent failure elimination, and sensitive data protection across all software architectures.

## Domain Audit Checklist

* [ ] **Structured Error Context**: Do all error capture points record runtime context (operation name, entity identifier, failure timestamp, root cause message)?
* [ ] **Stack Trace Preservation**: When rethrowing or wrapping exceptions, is the original stack trace preserved via error chaining (e.g. `cause` property or inner error wrapping)?
* [ ] **Anti-Swallowing Verification**: Are empty `catch` blocks, unhandled promise rejections, and discarded error return values completely eliminated?
* [ ] **Sensitive Data Redaction**: Are passwords, authentication tokens, API keys, credit card numbers, and session cookies scrubbed from logs and telemetry payloads before emission?
* [ ] **Non-Blocking Telemetry**: Does telemetry emission avoid crashing business logic when telemetry sinks are unavailable or rate-limited?

## Concrete Anti-Patterns

### Anti-Pattern 1: Error Swallowing & Context Loss

```typescript

// BAD: Error caught, discarded, and replaced with generic string; stack trace lost.
try {
await processPayment(account, amount);
} catch (err) {
logger.error("Payment failed");
return null;
}

// GOOD: Preserves cause, structured entity identifiers, and original stack trace.
try {
await processPayment(account, amount);
} catch (err) {
logger.error("Payment processing failed", {
accountId: account.id,
amount: amount,
error: err instanceof Error ? err.message : String(err),
stack: err instanceof Error ? err.stack : undefined,
});
throw new PaymentProcessingError("Payment failed", { cause: err });
}

```
### Anti-Pattern 2: Unredacted Sensitive Data in Log Payload

```python
# BAD: Raw request payload logged containing user credentials.
def authenticate(user_request):
  logger.info(f"Authenticating user payload: {user_request.dict()}")
  # ...

# GOOD: Strict key-level redaction applied before emission.
SENSITIVE_KEYS = {"password", "token", "secret", "authorization", "credit_card"}

def sanitize(payload: dict) -> dict:
  return {
    k: ("[REDACTED]" if k.lower() in SENSITIVE_KEYS else v)
    for k, v in payload.items()
  }

def authenticate(user_request):
  logger.info("Authenticating user", extra={"payload": sanitize(user_request.dict())})
  # ...
```

## Failure Modes & Mitigations

| Failure Mode | Root Cause | Mitigation |
| --- | --- | --- |
| **Diagnostic Blind Spot** | Exception caught and logged without stack trace or entity IDs. | Demand an Acceptance Criterion requiring error wrapping with explicit `cause` and structured context. |
| **Credential Leakage in Logs** | Dumping raw request/response objects into loggers. | Require interceptor-level sanitization using a centralized redaction mask before writing to log sinks. |
| **Cascade Crash on Telemetry Outage** | Telemetry call throws uncaught network or filesystem error. | Require defensive try/catch around telemetry sink transport; telemetry failure MUST NOT abort business flow. |

```
---
