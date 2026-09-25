# Server-Side Metrics, Health Probes, and Dead-Letter Monitoring

Audit criteria for cloud microservices covering health probe isolation, RED/USE metrics, metric tag cardinality bounds, and Dead Letter Queue (DLQ) backlog alerts.

## Domain Audit Checklist

- [ ] **Health Probe Isolation**: Are `/healthz/liveness` (process runtime state) and `/healthz/readiness` (dependency connectivity) strictly separated?
- [ ] **Liveness Independence**: Does the liveness probe avoid checking downstream databases or third-party APIs to prevent cascading restarts?
- [ ] **Startup Probe Configuration**: For slow-starting services, is a startup probe defined to prevent premature liveness termination?
- [ ] **RED / USE Metric Coverage**: Does the service export Rate, Errors, and Duration (RED) for request endpoints, and Utilization, Saturation, and Errors (USE) for system resources?
- [ ] **Strict Metric Cardinality Limits**: Are user IDs, UUIDs, email addresses, and dynamic request paths excluded from metric tag/label keys?
- [ ] **DLQ Backlog Alerts**: Do asynchronous message queues configure alerting thresholds on Dead Letter Queue depth ($> 0$) and consumer processing lag?

## Concrete Anti-Patterns

### Anti-Pattern 1: Database Dependency in Liveness Probe

```yaml
# BAD: Liveness probe fails when database is temporarily saturated, causing container restarts.
livenessProbe:
  httpGet:
    path: /health/db-check
    port: 8080
  failureThreshold: 3

# GOOD: Liveness checks internal process event loop; Readiness checks external DB availability.
livenessProbe:
  httpGet:
    path: /healthz/live
    port: 8080
  initialDelaySeconds: 5
readinessProbe:
  httpGet:
    path: /healthz/ready
    port: 8080
  failureThreshold: 2
```

### Anti-Pattern 2: High-Cardinality Metrics Explosion

```go
// BAD: Dynamically inserts customer ID and raw path into metric labels, crashing TSDB.
httpRequestsTotal.WithLabelValues(req.Method, req.URL.Path, customerID).Inc()

// GOOD: Labels restricted to bounded method, parameterized route, and HTTP status code.
httpRequestsTotal.WithLabelValues(req.Method, matchedRoute, strconv.Itoa(statusCode)).Inc()
```

## Failure Modes & Mitigations

| Failure Mode | Root Cause | Mitigation |
| --- | --- | --- |
| **Cascading Restart Storm** | Database slowdown causes all API container liveness probes to fail simultaneously. | Remove external dependency connectivity checks from `/healthz/liveness`. |
| **TSDB Memory Outage** | Recording user IDs or GUIDs in Prometheus metric labels creates millions of time series. | Reject any metric label whose value domain is unbounded; use parameterized routes only. |
| **Silent Queue Poisoning** | Messages continuously fail and route to a DLQ without operational alerting. | Require explicit alerts triggering on `dlq_messages_visible > 0` with notification routing. |

```
---
