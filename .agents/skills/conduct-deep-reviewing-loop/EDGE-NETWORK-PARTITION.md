# Transient Network Partitions, Idempotent Retries, and Resiliency Controls

## Domain Audit Checklist

### 1. Timeouts, Stream Cancellation & Connection Limits
- [ ] **Universal Request Timeouts**: Verify that all HTTP, gRPC, and database client invocation libraries configure explicit connection, read, and write timeouts. Reject default infinite timeouts.
- [ ] **Upstream Stream Cancellation on Client Disconnect (`AbortSignal` Forwarding)**: When serving streaming responses (SSE, WebSockets, chunked HTTP proxies, or AI token streams), bind the downstream client disconnect event (`req.on("close")` / `request.signal`) to an `AbortController` passed into the upstream request/generator so mid-flight client disconnects immediately abort upstream compute and quota consumption.
- [ ] **Connection Pool Limits**: Confirm connection pools enforce strict upper bounds on max idle and active sockets.

### 2. Retry Loops, Idempotency Keys & Circuit Breaking
- [ ] **Exponential Backoff with Jitter & `Retry-After` Respect**: Confirm retries on transient network calls (`502`, `503`, `504`, `429`, network timeouts) implement full random jitter and exponential backoff timers, while honoring upstream `Retry-After` headers when present. Reject static immediate retry loops.
- [ ] **Idempotency-Gated Retries on Mutating Requests**: Strictly distinguish idempotent reads (`GET`, `HEAD`, `OPTIONS`) from state-mutating requests (`POST`, payment charges, email dispatch, resource creation). **NEVER auto-retry non-idempotent mutations unless a deterministic `Idempotency-Key` UUID is generated once BEFORE entering the retry loop** and attached to every retry attempt (or upstream state is queried before retrying), preventing duplicate charges or duplicate records on response timeout.
- [ ] **Circuit Breaker Protections**: Ensure outbound external integrations use circuit breakers that trip open upon high error threshold spikes to prevent cascading resource exhaustion.

## Concrete Anti-Patterns

### Anti-Pattern 1: Infinite Retries without Backoff, Jitter, or Idempotency Key

```python
# BAD 1: Immediate retries without timeout or backoff cause thundering herds.
# BAD 2: Retrying a POST mutation without an Idempotency-Key charges the customer multiple times if response times out!
def call_external_service_bad(payload: dict):
    for i in range(10):
        try:
            return requests.post("https://api.service.internal/charge", json=payload)
        except Exception:
            pass # Immediate retry loop duplicates POST mutation
```

```python
# GOOD: Generate stable Idempotency-Key BEFORE retry loop + explicit timeout + exponential backoff with full jitter
import random, time, uuid, requests

def call_external_service_safe(payload: dict):
    max_retries = 5
    base_delay = 0.5
    idempotency_key = str(uuid.uuid4()) # Generated ONCE before retry loop

    for attempt in range(max_retries):
        try:
            return requests.post(
                "https://api.service.internal/charge",
                json=payload,
                headers={"Idempotency-Key": idempotency_key},
                timeout=(2.0, 5.0),
            )
        except requests.RequestException as e:
            if attempt == max_retries - 1:
                raise e
            # Full Jitter Formula: sleep = random(0, min(max_delay, base * 2 ^ attempt))
            sleep_time = random.uniform(0, min(10.0, base_delay * (2 ** attempt)))
            time.sleep(sleep_time)
```

## Failure Modes & Mitigations

- **Duplicate Financial / State Mutations on Timeout Retry**: Generate a stable `Idempotency-Key` outside the retry loop and attach it to all retry attempts for `POST`/`PATCH` mutations.
- **Orphaned Upstream Stream & Quota Drain**: Forward client disconnect signals (`req.on("close")` $\to$ `upstreamController.abort()`) across SSE/streaming endpoints.
- **Cascading System Overload**: Enforce deadline context propagation (`Context` / `AbortSignal` timeouts passed down across service chains).
- **Thread Pool Starvation**: Isolate third-party network call execution blocks within dedicated bounded concurrency pools.
