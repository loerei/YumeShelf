# Observability Subdocument: Distributed Telemetry, OpenTelemetry & Context Propagation

## Domain Audit Checklist

### 1. Distributed Context Propagation
- [ ] Trace Context Forwarding: Verify that all network call boundaries (HTTP client, gRPC, Message Producers) inject trace context headers (`traceparent`, `tracestate` W3C standards).
- [ ] Span Lifecycle Integrity: Confirm custom application spans are closed explicitly upon execution completion, capturing uncaught exceptions into span events before termination.

### 2. Structured Log Key-Value Schemas
- [ ] Structured JSON Format: Verify application logs output key-value JSON constructs. Reject raw, unstructured string logging.
- [ ] Sensitive Data Scrubbing: Confirm log interceptors redact sensitive user information (PII, tokens, authorization headers, passwords).

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

## Failure Modes & Mitigations

- Out-of-Memory Overhead via High-Cardinality Span Tags: Reject inserting unique IDs, dynamic user payloads, or unstructured raw strings into metric/trace label keys.
- Telemetry Network Bottlenecks: Configure local OpenTelemetry collectors utilizing batch processor exporters with non-blocking buffer queues.
