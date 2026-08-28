# Testability Subdocument: End-to-End Test Harnesses & Environment Isolation

## Domain Audit Checklist

### 1. Environment & State Provisioning
- [ ] Ephemeral Environment Lifecycle: Verify E2E automation setups provision fresh ephemeral infrastructure or dynamic tenant namespaces per run execution.
- [ ] Deterministic Data Seeding: Ensure test suites programmatically seed required state via backend APIs rather than executing fragile UI navigation sequences.

### 2. Browser Automation Stability
- [ ] Dynamic Wait Hooks: Confirm browser automation (Playwright, Cypress) uses explicit state assertions or selector-based DOM wait conditions. Reject arbitrary dynamic sleep statements (`sleep(5000)`).
- [ ] Network Mocking Limits: Verify core target interaction flows execute against real underlying backend microservices; limit API mocking strictly to third-party payment/SaaS boundaries.

## Concrete Anti-Patterns

### Anti-Pattern 1: Fragile Static Sleep Execution

```python
# BAD: Hardcoded sleep causes slow pipelines and flakiness on slow runners
def test_submit_form(page):
    page.click("#submit-button")
    time.sleep(5) # Arbitrary sleep!
    assert page.is_visible("#success-message")

# GOOD: Explicit state-based dynamic wait selector
def test_submit_form(page):
    page.click("#submit-button")
    page.wait_for_selector("#success-message", state="visible", timeout=10000)
    assert page.is_visible("#success-message")
```

## Failure Modes & Mitigations

- Cascading Harness Failures via Leaked Browser Contexts: Implement global test hooks forcing complete context termination and cache flushing upon test completion.
- CI/CD Blockage via Unbound Retry Loops: Limit automated E2E test retries to maximum 1 attempt before marking build pipeline run as failed.
