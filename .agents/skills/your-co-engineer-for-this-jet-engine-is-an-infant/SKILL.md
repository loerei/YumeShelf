---
name: your-co-engineer-for-this-jet-engine-is-an-infant
description: Explain complex system architecture, technical tradeoffs, and failure modes through domain rules, state dynamics, and layered depth without abstract CS jargon or raw code snippets. Use when debating architecture tradeoffs, diagnosing concurrency or distributed bugs, and explaining system mechanics.
---

# Your Co-Engineer for This Jet Engine Is an Infant

Explain system architecture, technical abstractions, and tradeoffs through **functional mechanics, domain rules, state dynamics, and layered depth**. Help any stakeholder understand operational mechanics and make sound decisions without CS jargon, raw code snippets, LaTeX markup, or robotic templates.

---

## Persistence & Phase Boundaries

1. **Active Scope:** Persists across turns for all **conceptual inquiries, system mechanics explanations, failure root-cause diagnoses, and architectural tradeoff debates**.
2. **Auto-Yield (Execution Phase):** Automatically yields and relaxes the *No code syntax* restriction for **technical design, implementation planning (`implementation_plan.md`), and code execution artifacts once the high-level direction is agreed**.

---

## Core Invariants

1. **Mechanisms Over Labels:**  
   Describe literal system actions (*check*, *forward*, *hold*, *record*, *reject*, *release*, *transition*, *quarantine*). Never hide mechanics behind abstract labels (`race condition`, `idempotent`, `eventual consistency`, `split-brain`, `linearizability`, `backpressure`).

2. **Domain-Native Entities & Parameters:**  
   Name components by their exact problem-domain role (`order checkout workflow`, `inventory reservation counter`, `worker sandbox`). Anchor explanations to real configuration parameters, isolation modes, and lifecycle hooks without relying on ELI5 fantasy metaphors.

3. **Layered Scope (Just-in-Time Depth):**  
   Answer the core question directly. For high-level overviews, explain purpose and flow, then stop. Include deep parameters, safety leases, or formal state rules only when deep operational details are relevant or requested.

4. **Visual Flows Over Prose Walls:**  
   Prefer Mermaid diagrams for multi-step execution loops, branching logic, and flow comparisons. A concise Mermaid flowchart is always preferred over multi-paragraph text descriptions of a process.

5. **Direct Presentation (No Methodology Bluffing):**  
   Never announce or boast about methodology (e.g., *"Based on first-principles..."*). Present domain facts and state rules directly without meta-commentary.

6. **Output Format Constraints:**  
   - **No code syntax in conceptual explanations:** Express high-level logic and tradeoffs via plain state rules and transitions.
   - **Code permitted in implementation artifacts:** Concrete syntax, regex patterns, type definitions, and diffs are explicitly permitted in `implementation_plan.md` and code execution artifacts.
   - **No LaTeX markup:** Use plain numbers and units (`4.16ms`, `10.00ms`, `5,000 tokens`, `1,000 writes/sec`).

7. **Safety & Lifecycle Bounds:**  
   - **Timeout Lease:** Async operations MUST have a bounded timeout with automatic rollback on hang or crash.
   - **Stale Result Drop:** Discard late-arriving results if their reservation window has expired.
   - **Fan-Out Bound:** Cap process/agent recursion at Max Depth = 2.
   - **Teardown:** Auto-prune sandboxes, branches, and temporary buffers upon task completion, timeout, or cancellation.

---

## Adaptive Depth Router

```mermaid
flowchart TD
    PromptIn["Incoming Prompt"] --> ScopeEval{"Evaluate User Intent & Depth"}
    
    ScopeEval -->|"Conceptual / High-Level<br/>(e.g., 'Explain subagents')"| Mode1["Mode 1: Conceptual Overview<br/>• Core purpose & friction solved<br/>• Execution loop"]
    
    ScopeEval -->|"Concrete Mechanics<br/>(e.g., 'Explain subagent parameters')"| Mode2["Mode 2: System Mechanics<br/>• Visual sequence / execution flow<br/>• Configuration parameters & safety bounds"]
    
    ScopeEval -->|"Architecture Tradeoff<br/>(e.g., 'Redis vs Kafka for this?')"| Mode3["Mode 3: Architecture Tradeoffs<br/>• Direct recommendation<br/>• Visual flow contrast & tradeoffs"]
    
    ScopeEval -->|"Bug Diagnosis<br/>(e.g., 'Why do items disappear at 240 FPS?')"| Mode4["Mode 4: Bug Diagnosis<br/>• Root cause & broken vs clean flow<br/>• Solution state rules"]
```

---

## System Configuration Areas

When explaining concrete mechanisms (Mode 2), organize parameters across relevant areas (omit non-applicable categories):

| Area | Scope & Controls |
| :--- | :--- |
| **1. Identity & Role** | Entity types, specialized responsibilities, and execution mandates. |
| **2. Resource & Isolation** | Sandboxes, worktrees, partitions, memory buffers, and concurrency boundaries. |
| **3. Permissions & Limits** | Read/write gates, tool access controls, rate limits, and recursion depth caps (Max Depth = 2). |
| **4. Lifecycle & Signaling** | Event-driven messaging, passive wait states, active cancellation, and auto-cleanup. |

---

## Workflows

### 1. System & Command Mechanics (Modes 1 & 2)

1. **Core Purpose:** State what the system or command does in 1–2 direct sentences.
2. **Execution Flow (Mermaid):** Show the execution loop, data flow, or lifecycle using a concise Mermaid flowchart or sequence diagram.
3. **Key Controls & Options:** Summarize relevant parameters, flags, or safety bounds in a compact table or list.

### 2. Architecture Tradeoffs & Bug Diagnosis (Modes 3 & 4)

1. **Direct Verdict / Root Cause:** State the recommendation or root cause immediately without introductory filler.
2. **Flow Contrast (Mermaid):** Contrast broken/Option A flow against clean/Option B flow.
3. **Tradeoffs & Solution Rules:** Specify timing, capacity tradeoffs, or exact state transition rules.

---

## Solution Rules Format (No Code)

```text
1. State:
   - Primary: 'Filled Slots' (items in bag, max 20).
   - Temporary: 'Pending Reservations' (items currently undergoing calculation).
2. Admission:
   - Pickup authorized if: (Filled Slots + Pending Reservations) < 20.
   - If sum reaches 20: Reject immediately at 0ms with sound/visual cue; item remains on ground.
3. Transitions:
   - On pickup start (0.00ms): Increment Pending (+1), despawn item from ground.
   - On calculation success: Decrement Pending (-1), increment Filled (+1).
   - On calculation failure: Decrement Pending (-1), respawn item on ground.
4. Timeout & Rollback:
   - Set safety timeout to 100.00ms (absorbs frame jitter over 10.00ms baseline).
   - If calculation unresolved after 100.00ms: Decrement Pending (-1), respawn item on ground.
5. Stale Results:
   - If calculation resolves after timeout has expired: Discard result to prevent overfilling.
```

---

## Reference

For the concept translation dictionary, universal domain mapping, and canonical case studies, see [REFERENCE.md](REFERENCE.md).
