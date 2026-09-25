# Server-Side Telemetry, OpenTelemetry, and Tracing

Audit criteria for backend microservices, RPC systems, and asynchronous workers covering OpenTelemetry tracing, W3C context propagation, structured JSON logs, and hot paths.

## Domain Audit Checklist

- [ ] **W3C Traceparent Header Propagation**: Do all outbound HTTP, gRPC, and messaging calls inject the standard `traceparent` header (`00-{trace-id}-{parent-id}-{trace-flags}`)?
- [ ] **Inbound Context Extraction**: Do ingress controllers and queue message consumers extract incoming trace context before creating child spans?
- [ ] **Span Lifecycle & Exception Events**: Are custom spans closed explicitly in `finally` blocks, recording uncaught exceptions into span events with error status codes?
- [ ] **OpenTelemetry Semantic Conventions**: Do span names and attributes adhere to standard conventions (e.g. `http.request.method`, `http.response.status_code`, `server.address`)?
- [ ] **Structured JSON Logging**: Are logs emitted strictly as structured key-value JSON objects containing correlated `trace_id` and `span_id` fields?
- [ ] **Hot-Path Logging Protection**: In execution loops exceeding 1,000 ops/sec, are debug loggers guarded (`logger.isDebugEnabled()`) to eliminate string allocations?
- [ ] **Batch Exporting**: Are OpenTelemetry spans and logs exported using batch processors rather than synchronous per-event network calls?

## Concrete Anti-Patterns

### Anti-Pattern 1: Unpropagated Trace Context Across RPC Boundary

```go
// BAD: Outbound HTTP request executed without propagating tracing headers.
func FetchUserData(ctx context.Context, userID string) (*User, error) {
    req, _ := http.NewRequestWithContext(ctx, "GET", "/users/"+userID, nil)
    return httpClient.Do(req)
}

// GOOD: Injects W3C trace context into HTTP headers using OpenTelemetry propagator.
func FetchUserData(ctx context.Context, userID string) (*User, error) {
    req, err := http.NewRequestWithContext(ctx, "GET", "/users/"+userID, nil)
    if err != nil {
        return nil, err
    }
    otel.GetTextMapPropagator().Inject(ctx, propagation.HeaderCarrier(req.Header))
    return httpClient.Do(req)
}
```

### Anti-Pattern 2: Unguarded String Formatting in Hot Loops

```java
// BAD: Allocates memory and formats string on every iteration (>1,000 ops/sec) even when debug is disabled.
for (Transaction tx : transactions) {
    logger.debug("Processing transaction ID: " + tx.getId() + " for account: " + tx.getAccountId());
    process(tx);
}

// GOOD: Guards string concatenation with level check and uses parameterized formatting.
for (Transaction tx : transactions) {
    if (logger.isDebugEnabled()) {
        logger.debug("Processing transaction ID: {} for account: {}", tx.getId(), tx.getAccountId());
    }
    process(tx);
}
```

## Failure Modes & Mitigations

| Failure Mode | Root Cause | Mitigation |
| --- | --- | --- |
| **Broken Trace Lineage** | Queue consumer creates a new root trace instead of linking to the producer span. | Demand OpenTelemetry context extraction from message metadata headers prior to processing. |
| **Service Latency Degradation** | High-throughput loop allocates millions of string objects for disabled log levels. | Mandate level guards (`isDebugEnabled`) or lazy supplier evaluations in high-frequency paths. |
| **Collector OOM** | Synchronous exporter blocks worker threads during collector network timeouts. | Enforce BatchSpanProcessor with bounded buffer queues and drop-on-full policies. |

```
---
