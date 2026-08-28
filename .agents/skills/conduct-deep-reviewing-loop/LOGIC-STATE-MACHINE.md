# Logic Subdocument: State Machine Exhaustion & Business Transitions

## Domain Audit Checklist

### 1. Transition Matrix Completeness
- [ ] Exhaustive State Handling: Verify that state machine evaluations explicitly check every permutation of `(CurrentState, IncomingEvent)`.
- [ ] Illegal Transition Rejection: Confirm that unexpected events in any given state trigger explicit exception handling or state rejection, rather than silently dropping state or defaulting.

### 2. State Invariants & Mutation Atomicity
- [ ] Immutable State Transitions: Verify that state updates produce distinct new immutable state objects or execute within isolated database write locks.
- [ ] Side-Effect Isolation: Ensure side-effects (e.g., sending emails, invoking payment gateways) trigger *after* the state transition transaction successfully commits.

## Concrete Anti-Patterns

### Anti-Pattern 1: Non-Exhaustive Switch-Based Transition Logic

```go
// BAD: Unhandled states fall through to default without error or action!
type State string
const (
    Draft     State = "DRAFT"
    Submitted State = "SUBMITTED"
    Approved  State = "APPROVED"
)

func Transition(current State, event string) State {
    switch current {
    case Draft:
        if event == "SUBMIT" { return Submitted }
    case Submitted:
        if event == "APPROVE" { return Approved }
    }
    return current // BAD: Returns unmodified state without raising invalid transition error!
}

// GOOD: Explicit transition rejection with error returns.
func Transition(current State, event string) (State, error) {
    switch current {
    case Draft:
        if event == "SUBMIT" { return Submitted, nil }
    case Submitted:
        if event == "APPROVE" { return Approved, nil }
    }
    return "", fmt.Errorf("invalid transition event '%s' for current state '%s'", event, current)
}
```

## Failure Modes & Mitigations

- Orphaned Intermediate States: Implement periodic background reconciliation sweepers that identify records remaining in transient states (`PROCESSING`, `PENDING`) past defined expiration windows.
- Concurrent Transition Overwrites: Enforce database optimistic concurrency control using version column checks (`UPDATE order SET state = 'APPROVED', version = version + 1 WHERE id = 1 AND version = 2`).
