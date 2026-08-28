# Observability Subdocument: Alerting Thresholds, Health Checks & SLO Alignment

## Domain Audit Checklist

### 1. Service Level Indicators (SLIs) & SLOs
- [ ] Actionable Alerting Rules: Verify that alerts trigger directly on customer-impacting SLO burn rates rather than noise metrics (e.g., alert on high 5xx error rate or high latency, not CPU usage).
- [ ] Health Check Endpoint Isolation: Confirm applications provide distinct `/healthz/liveness` and `/healthz/readiness` endpoints.

### 2. Queue Backlog & Dead-Letter Alerts
- [ ] Queue Backlog Alerts: Ensure message consumer lag metrics configure dynamic threshold alerts before queue exhaustion occurs.
- [ ] Dead-Letter Queue Depth: Confirm dead-letter queue backlogs trigger immediate notifications to operational channels.

## Concrete Anti-Patterns

### Anti-Pattern 1: Flaky Liveness Probes

```yaml
# BAD: Liveness probe checks external database dependency.
# If DB lags, Kubernetes restarts application container, compounding system outage!
livenessProbe:
  httpGet:
    path: /health-check-with-db-query
    port: 8080

# GOOD: Liveness checks app process runtime; Readiness checks dependency connectivity.
livenessProbe:
  httpGet:
    path: /healthz/liveness
    port: 8080
readinessProbe:
  httpGet:
    path: /healthz/readiness
    port: 8080
```

## Failure Modes & Mitigations

- Alert Fatigue via Flashing Threshold Probes: Enforce evaluation duration windows (`for: 5m`) before alerting channels fire.
- Monitoring System Failure During Outages: Implement external synthetic heartbeat probes that verify core endpoint reachability out-of-band.
