# Reference: Logic & Invariants Architecture Engine

## 1. Universal Domain Mapping Dictionary

| Concept & Invariant Framing | Canonical Domain Example |
| :--- | :--- |
| **Race Condition**: Two concurrent updates read stale shared state without atomic locking. | Two users checkout the last inventory slot simultaneously, causing double booking. |
| **Deadlock**: Process A holds Resource 1 awaiting Resource 2 while Process B holds 2 awaiting 1. | Worker A locks Order Table awaiting Customer Table; Worker B holds Customer Table awaiting Order Table. |
| **Cache Invalidation / Stale Reads**: Persistent store updates while fast-read cache still serves prior state. | User updates shipping address, but invoice generator reads old address from unexpired cache. |
| **Circuit Breaker**: Failure tracker pauses downstream calls after threshold errors to protect both systems. | Payment gateway fails 5 times consecutively; checkout routes users immediately to backup method. |
| **Idempotency**: Replaying a request produces the same state as running it once. | Clicking Pay three times during network lag charges once via a unique transaction key. |
| **Sandboxing & Isolation**: Untrusted code runs with restricted disk, network, and process access. | Worker executes uploaded scripts with read-only filesystem and zero external network sockets. |
| **Least Privilege**: Grant only the minimum permissions required for the assigned task. | Reporting subagent gets read-only DB access with mutations blocked. |
| **Backpressure**: Downstream consumer signals upstream producer to slow intake when queue fills. | Image worker throttles upload queue intake once buffer hits 1,000 pending jobs. |

## 2. Four Core Configuration Dimensions (Mode 2 Analysis)

When explaining operational mechanics (**Mode 2**), evaluate parameters across:
1. **Identity & Role**: Component type, responsibility, execution scope, domain boundary.
2. **Resource & Isolation**: Memory/token ceilings, workspace sandboxes (worktrees/containers), concurrency limits.
3. **Permissions & Limits**: Least-privilege capabilities, banned operations, admission gates, recursion depth, timeout leases.
4. **Lifecycle & Signaling**: State initialization, passive wait states, health checks, liveness timers, cleanup/rollback handlers.

## 3. State Transition & Invariant Model (Atomic Reservation with Rollback)

```text
1. State Model:
   - Primary State: 'Reserved Slots' (confirmed capacity).
   - In-Flight State: 'Pending Claims' (operations currently validating payment).
2. Admission Gate (Precondition):
   - Action authorized ONLY IF: (Reserved Slots + Pending Claims) < Capacity Ceiling.
   - If capacity reached: Reject request immediately with capacity-exhausted signal.
3. Causal Flow (State Transitions):
   - On checkout request: Increment Pending (+1), mark transaction in-flight.
   - On payment confirmation: Decrement Pending (-1), increment Reserved (+1).
   - On payment failure or timeout: Decrement Pending (-1), release capacity (Rollback).
4. Safety Guarantees & Invariants:
   - Capacity Invariant: Total reserved slots never exceed maximum capacity under concurrent load.
   - Leak-Free Invariant: Aborted or timed-out transactions release pending claims.
```

## 4. Canonical Case Studies

### Case Study 1: Mode 1 (Conceptual Overview) — Subagent Mechanism
**User Prompt:** *"Explain how subagents work."*

> Subagents are independent, isolated agent processes spawned by a parent agent to execute focused tasks in a clean context window without polluting the parent's conversational state.
>
> **Core Problem Solved:** Executing deep file reads, repeated test runs, or broad searches directly in the main conversation causes **Attention Drift** and **Context Window Exhaustion**, degrading reasoning quality.
>
> **Key Boundaries & Invariants:**
> 1. **Context Isolation:** Each subagent gets a clean context window holding only its task prompt and domain rules.
> 2. **Workspace Sandboxing:** Subagents run in the parent workspace (`inherit`) or isolated throwaway branches (`branch`) to avoid unintended side effects.
> 3. **Hierarchical Communication:** Subagents return results to the parent agent on completion rather than messaging the user directly.

### Case Study 2: Mode 2 (System Mechanics) — Untrusted Webhook Payload Parser
**User Prompt:** *"Explain how the importer safely parses untrusted external JSON/DSL payloads."*

> When external partners submit custom integration templates, raw executable expressions inside those payloads could run arbitrary code on your servers if evaluated directly.
>
> To prevent this, the importer processes incoming payloads through a **Sandboxed Expression Evaluator** that separates passive data assembly from arbitrary execution.
>
> ```mermaid
> flowchart TD
>     RAW["Raw Partner Payload"] --> PARSER["Sandboxed Expression Evaluator<br/>(Reads tokens one by one)"]
>     PARSER --> VALIDATE{"Node Type?"}
>     VALIDATE -->|"Safe Data (Numbers, Strings, Lists, Maps)"| BUILD["Construct In-Memory Import Record"]
>     VALIDATE -->|"Execution Call (System / Eval / Import)"| REJECT["Reject Immediately with PayloadCodecError<br/>(PARSE_FAILED: Unsafe Node)"]
>     BUILD --> SANITIZE["Prototype Sanitization<br/>(Strip Object Injection Keys)"]
>     SANITIZE --> MODEL["Clean Validated Record"]
> ```
>
> **Key Mechanisms & Invariants:**
> 1. **Zero Dynamic Evaluation:** The evaluator allows primitive operations assembling numbers, strings, and maps, and aborts immediately on any node attempting class instantiation or OS/network calls.
> 2. **Resource Clamping (DoS Defense):** To stop malformed payloads from hanging the worker, execution enforces strict resource ceilings: 500,000 max steps and 50,000 max in-memory object references.
> 3. **Prototype Pollution Immunity:** In JavaScript runtimes, crafted keys (`__proto__`, `constructor`) can mutate shared object prototypes; the parser strips those keys recursively before returning records.
