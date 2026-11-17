# Reference: Technical Deslop Guide

## 1. Master Technical Deslop Matrix & Checklist

Use this matrix as both a lookup reference and an audit checklist for human-facing technical documentation:

| Noise Category | What to Cut & How to Fix | Bad (Slopped / Corporate / Fluff) | Good (Deslopped / Plain English / Technical Signal) |
| :--- | :--- | :--- | :--- |
| **Marketing Superlatives** | Cut self-congratulatory adjectives (`cutting-edge`, `revolutionary`, `blazing-fast`, `state-of-the-art`, `next-gen`, `ultra-lightweight`). State plain technical capabilities. | `A cutting-edge, next-generation framework for seamless state management.` | `A state management library with automatic dependency tracking.` |
| **Pompous Verbs** | Cut corporate buzzwords (`leverage`, `orchestrate`, `utilize`, `streamline`, `empower`, `operationalize`). Use direct technical verbs (`use`, `run`, `call`, `send`, `format`, `connect`). | `Leverage our API to orchestrate asynchronous background job execution.` | `Call the queue API to run background tasks.` |
| **Throat-Clearing Openers** | Cut conversational run-up (`In today's fast-paced world`, `Look no further`, `Without further ado`, `Let's dive in`). Start directly with the technical concept, installation step, or usage syntax. | `In today's fast-paced cloud landscape, managing distributed services is hard.` | `Connects services across cloud providers with automatic TLS encryption.` |
| **Header Tautology** | Do not write introductory sentences that merely echo the header above them. Jump straight to the code snippet, table, or concrete instructions. | `## Installation<br/>This section explains how to install the package.` | `## Installation<br/>Install via npm:<br/>\`\`\`bash<br/>npm install my-package<br/>\`\`\`` |
| **Vague Reliability & Speed Claims** | Cut unbacked hand-waving (`infinitely scalable`, `enterprise-grade resilience`). State concrete benchmarks, algorithms, concurrency models, or retry limits. | `Engineered with state-of-the-art enterprise resilience.` | `Retries failed requests up to 3 times with exponential backoff.` |
| **Empty Feature Titles** | Cut buzzword-laden pseudo-titles on feature bullets. State concrete capabilities or performance metrics. | `- **Unmatched Velocity**: Delivers blazing-fast throughput.` | `- Processes up to 5,000 events/second per worker.` |
| **Passive Voice Obfuscation** | Cut passive constructions that hide the actor or configuration lever. Use imperative active voice for instructions. | `Optimal performance can be achieved when batch size is increased.` | `Set batch_size to 100 to maximize throughput.` |
| **Hollow Security Claims** | Cut marketing phrases (`military-grade security`, `bank-grade encryption`). State exact ciphers, hashing algorithms, or protocols. | `Built from the ground up with military-grade security in mind.` | `Encrypts payload at rest using AES-256-GCM.` |
| **Circular Parameter Descriptions** | Do not define options or parameters by repeating their names. State exact type, default value, side-effects, and valid ranges. | `timeout: The timeout value for the operation.` | `timeout: Maximum seconds to wait before throwing RequestTimeoutError. Defaults to 30.` |
| **Defensive Hedging** | Cut wishy-washy qualifiers (`should normally work`, `usually fine in most cases`). State exact supported runtimes, OS versions, and required dependencies. | `It should usually work in most normal environments if configured properly.` | `Supported on Linux (kernel >= 5.4) and macOS (>= 12.0) with Node.js 18+.` |
| **Unsolicited Restructuring (Minimal Diffs)** | Do not rewrite, rephrase, or reformat surrounding unaffected sections when updating documentation. Update only the targeted paragraphs. | *(Rewriting an entire 200-line README when the user only asked to add one CLI flag)* | *(Inserting the single flag into the existing flags table with matching formatting)* |

---

## 2. Before / After Case Studies by Document Type

### A. Project README Hero & Overview

**Before (Corporate Slop):**
```markdown
# FlowSync

FlowSync is a powerful, cutting-edge, and revolutionary event bus engineered from the ground up to seamlessly orchestrate your microservices. In today's fast-paced cloud landscape, modern teams need robust resilience. FlowSync empowers developers to leverage state-of-the-art pub/sub paradigms with unmatched velocity.
```

**After (Deslopped & Grounded):**
```markdown
# FlowSync

An in-memory publish-subscribe event bus for Node.js services with wildcard topic matching and backpressure handling.

- Throughput: Up to 50,000 messages/sec on a single core
- Zero external dependencies
- Built-in dead-letter queue for unhandled message exceptions
```

---

### B. Quickstart / Installation Section

**Before (Conversational Padding & Header Echoing):**
```markdown
## Installation

In this section, we will guide you through the process of getting started with our tool. First and foremost, make sure that you have Node installed on your machine. Without further ado, let's install the package by running the following command:

npm install flow-sync
```

**After (Clean & Direct):**
```markdown
## Installation

Requires Node.js 18 or higher.

```bash
npm install flow-sync
```
```

---

### C. Configuration Options Table

**Before (Tautology & Missing Operational Values):**
```markdown
## Configuration

| Option | Type | Description |
| :--- | :--- | :--- |
| `retries` | Number | The number of retries for the system. |
| `timeout` | Number | Sets the timeout duration. |
| `debug` | Boolean | Whether debug mode is enabled or not. |
```

**After (High-Signal Technical Documentation):**
```markdown
## Configuration

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `retries` | number | `3` | Maximum retry attempts before routing to the dead-letter queue. |
| `timeout` | number | `5000` | Request timeout in milliseconds. Set to `0` to disable timeout. |
| `debug` | boolean | `false` | Emits verbose connection lifecycle events to `stderr`. |
```

---

### D. Architectural Decision & Trade-offs

**Before (Sales Pitch):**
```markdown
## Why FlowSync?

Because other event buses are outdated, bloated, and slow. FlowSync was created by visionary engineers who wanted to build the ultimate developer experience. It is the best choice for any team that cares about excellence and future-proof architectures.
```

**After (Objective Trade-offs & Positioning):**
```markdown
## Architecture & Trade-offs

FlowSync stores all event topics in-memory using a prefix trie:
- **Fast routing**: O(k) topic lookup where k is the number of path segments.
- **Trade-off**: Not persistent across process restarts. For durable multi-node clustering, use Redis Streams or Kafka instead.
```
