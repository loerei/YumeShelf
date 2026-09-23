# Distributed Telemetry, OpenTelemetry, and Context Propagation

## Domain Audit Checklist

### 1. Distributed Context Propagation
- [ ] Trace Context Forwarding: Verify that all network call boundaries (HTTP client, gRPC, Message Producers) inject trace context headers (`traceparent`, `tracestate` W3C standards).
- [ ] Span Lifecycle Integrity: Confirm custom application spans are closed explicitly upon execution completion, capturing uncaught exceptions into span events before termination.

### 2. Structured Log Key-Value Schemas
- [ ] Structured JSON Format: Verify application logs output key-value JSON constructs. Reject raw, unstructured string logging.
- [ ] Sensitive Data Scrubbing: Confirm log interceptors redact sensitive user information (PII, tokens, authorization headers, passwords).

### 3. Hot-Path Telemetry & Sampling Governance
- [ ] Hot-Path Overhead Bounds: In high-frequency execution loops (>1,000 ops/sec), telemetry logging MUST be wrapped in log-level guards (`if (logger.isDebugEnabled())`) or use structured lazy evaluators to prevent heap allocations and string concatenation.
- [ ] Trace Sampling: For high-throughput stream processing or batched iterations, create spans per batch or use tail-based sampling rather than instantiating individual OpenTelemetry spans per item.

## Concrete Anti-Patterns

### Anti-Pattern 1: Unstructured Un-Contextualized Logging

```go
// BAD: Raw string format without trace correlation or key-value structures.
log.Printf("User login failed for user %s with error %v", userID, err)

// GOOD: Structured JSON log with contextual fields and correlated trace attributes.
logger.ErrorContext(ctx, "user authentication failed",
    slog.String("user_id", userID),
    slog.String("error", err.Error()),
    slog.String("component", "auth_service"),
)
```

### Anti-Pattern 2: Un-Guarded Logging & Per-Item Spans in High-Frequency Loops

```typescript
// BAD: Allocates memory and span objects inside high-frequency loop (>1,000 ops/sec)
for (const item of items) {
  const span = tracer.startSpan("process_item");
  logger.debug(`Processing item ${item.id} with status ${item.status}`);
  process(item);
  span.end();
}

// GOOD: Batch-level span amortization and level-guarded structured logging
const span = tracer.startSpan("process_batch");
span.setAttribute("batch.size", items.length);
for (const item of items) {
  if (logger.isDebugEnabled()) {
    logger.debug("Processing item", { id: item.id, status: item.status });
  }
  process(item);
}
span.end();
```

## Failure Modes & Mitigations

- Out-of-Memory Overhead via High-Cardinality Span Tags: Reject inserting unique IDs, dynamic user payloads, or unstructured raw strings into metric/trace label keys.
- Telemetry Network Bottlenecks: Configure local OpenTelemetry collectors utilizing batch processor exporters with non-blocking buffer queues.
