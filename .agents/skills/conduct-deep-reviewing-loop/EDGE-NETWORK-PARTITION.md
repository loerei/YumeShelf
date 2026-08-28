# Edgecase Subdocument: Transient Network Partitions & Resiliency Controls

## Domain Audit Checklist

### 1. Timeouts & Connection Limits
- [ ] Universal Request Timeouts: Verify that all HTTP, gRPC, and database client invocation libraries configure explicit connection, read, and write timeouts. Reject default infinite timeouts.
- [ ] Connection Pool Limits: Confirm connection pools enforce strict upper bounds on max idle and active sockets.

### 2. Retry Loops & Circuit Breaking
- [ ] Exponential Backoff with Jitter: Confirm retries on transient network calls implement full random jitter and exponential backoff timers. Reject static loop retries.
- [ ] Circuit Breaker Protections: Ensure outbound external integrations utilize circuit breakers that trip open upon high error threshold spikes to prevent resource exhaustion.

## Concrete Anti-Patterns

### Anti-Pattern 1: Infinite Retries without Backoff or Jitter

```python
# BAD: Thundering herd problem! Retries immediately overwhelm struggling service.
def call_external_service():
    for i in range(10):
        try:
            return requests.get("https://api.service.internal/data")
        except Exception:
            pass # Immediate retry loop!
```

```python
# GOOD: Exponential backoff with random full jitter
import random, time, requests

def call_external_service():
    max_retries = 5
    base_delay = 0.5
    for attempt in range(max_retries):
        try:
            return requests.get("https://api.service.internal/data", timeout=(2.0, 5.0))
        except requests.RequestException as e:
            if attempt == max_retries - 1:
                raise e
            # Full Jitter Formula: sleep = random(0, min(max_delay, base * 2 ^ attempt))
            sleep_time = random.uniform(0, min(10.0, base_delay * (2 ** attempt)))
            time.sleep(sleep_time)
```

## Failure Modes & Mitigations

- Cascading System Overload: Enforce deadline context propagation (`Context` timeouts passed down across microservice chains).
- Thread Pool Starvation: Isolate third-party network call execution blocks within dedicated async thread pools.
