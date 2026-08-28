# Logic Subdocument: Concurrent Algorithms & Floating-Point Precision

## Domain Audit Checklist

### 1. Concurrent Data Structure & Lock Safety
- [ ] Lock Acquisition Ordering: Verify that all code blocks acquiring multiple locks always acquire those locks in a global, deterministic order to prevent deadlocks.
- [ ] Non-Blocking Atomic Guards: Confirm atomic pointer swaps (`CAS`) correctly protect against the ABA problem (e.g., using tagged pointers or monotonic generation counters).

### 2. Mathematical & Financial Correctness
- [ ] Floating-Point Currency Arithmetic: Reject standard floating-point representation primitives (`float32`, `float64`, `double`) for monetary or financial calculations. Require arbitrary-precision decimal libraries or scaled integer amounts.
- [ ] Integer Overflow Guards: Verify arithmetic calculations on dynamic user inputs implement explicit boundary saturation checks or overflow guards.

## Concrete Anti-Patterns

### Anti-Pattern 1: Floating-Point Math for Currency Calculations

```java
// BAD: IEEE 754 floating-point inaccuracies cause cumulative rounding loss.
double price = 0.10;
double tax = 0.02;
double total = price + tax; 
System.out.println(total == 0.12); // May evaluate to false due to precision errors! (0.12000000000000002)

// GOOD: Use BigDecimal or scaled integer representation (cents).
BigDecimal price = new BigDecimal("0.10");
BigDecimal tax = new BigDecimal("0.02");
BigDecimal total = price.add(tax);
System.out.println(total.compareTo(new BigDecimal("0.12")) == 0); // Guaranteed precise
```

### Anti-Pattern 2: Deadlock via Dynamic Lock Acquisition Order

```python
# BAD: Thread 1 locks A then B. Thread 2 locks B then A. Deadlock risk!
def transfer(acc1, acc2, amount):
    with acc1.lock:
        with acc2.lock:
            acc1.balance -= amount
            acc2.balance += amount

# GOOD: Enforce global locking order by invariant property (e.g., account ID)
def transfer(acc1, acc2, amount):
    first = acc1 if acc1.id < acc2.id else acc2
    second = acc2 if acc1.id < acc2.id else acc1
    with first.lock:
        with second.lock:
            acc1.balance -= amount
            acc2.balance += amount
```

## Failure Modes & Mitigations

- Deadlocks in Multithreaded Runtimes: Enforce lock acquisition timeouts on all blocking mutex operations.
- Dynamic Integer Overflows: Enable compile-time overflow checks (`-C overflow-checks=on` in Rust) or perform dynamic range checks prior to arithmetic operations.
