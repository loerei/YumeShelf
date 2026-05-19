# SOP 03: SANDBOX VERIFICATION & SELF-HEALING LOOP PROTOCOL

This SOP instructs you on how to verify code correctness immediately following any mutation and operate a local Self-Healing Loop to guarantee 98%+ execution reliability.

---

## 🛡️ 1. Mandatory Syntax Compilation Check

Immediately following any code modification (via raw-text replacement or Python Patching Script execution), you **MUST** verify the syntactic integrity of the modified file prior to completing your turn.

### Standard Compilation / Syntax Commands:
*   **For JavaScript/Node.js files:**
    ```powershell
    node --check <absolute-file-path>
    ```
*   **For Python files:**
    ```powershell
    python -m py_compile <absolute-file-path>
    ```
*   **For JSON data structures:**
    Utilize a quick Python verification to parse the JSON schema:
    ```powershell
    python -c "import json; json.load(open('<absolute-file-path>', encoding='utf-8'))"
    ```

> [!NOTE]
> **Anti-Anchoring Guideline:** The verification commands above are standard examples for JS/Python/JSON environments. If you are working in a different language ecosystem (e.g., Rust, Go, C#, C++, Java, Ren'Py, etc.), you **MUST** replace these commands with their corresponding native toolchain equivalent (such as `cargo check`, `go build`, `dotnet build`, etc.) rather than attempting to apply Node/Python checks blindly.

---

## 🔄 2. The Self-Healing Loop

If the syntax check returns a non-zero exit code (syntax error):

1. **Step 1: Isolate the Error**
   * Parse the compiler error message, identifying the file, line number, and error token.
2. **Step 2: Correct In-Sandbox**
   * Write and apply a fix targeting the exact line (e.g. inserting a missing bracket `}` or comma `,`).
3. **Step 3: Re-verify Syntax**
   * Execute the validation command from Section 1 again. Continue the cycle until the command completes with **Exit Code: 0**.

*Do not commit broken code to the user's workspace, and do not escalate syntax errors without first attempting the Self-Healing Loop.*

---

## 🛑 3. Anti-Blind-Fixing & Active Diagnostic Handoff

When facing a complex bug, silent runtime error, or data parsing mismatch, you **MUST** resist the urge to perform "blind-fixing" (iterative patching based on speculative assumptions).

### The Anti-Blind-Fixing Rule:
*   **DO NOT GUESS:** Making multiple speculative code mutations without physical confirmation of runtime behavior introduces code bloat, wastes token window limits, and creates hidden regression bugs.
*   **COLLABORATE STRATEGICALLY:** The USER is your execution partner. Leverage the physical environment division of labor by actively stopping to delegate runtime diagnostics.

### Universal Handoff Thresholds:
You **MUST** halt execution and transfer diagnostic control to the user if you cross any of the following three abstract boundaries:

1.  **Observability Blackout:**
    *   *Condition:* The code compiles syntactically, but you cannot execute the runtime environment locally to verify its visual layouts, timing/race behaviors, network payloads, or state side-effects.
    *   *Handoff Action:* Stop speculating on state outputs. Force the user to act as your physical execution interface (e.g. run the environment, execute specific interactions, and capture console buffers or screen states).
2.  **Information Entropy Boundary:**
    *   *Condition:* The data boundary, third-party API contract, byte structure, database schema, or external file format is undocumented, obfuscated, or structurally ambiguous.
    *   *Handoff Action:* Stop guessing offsets or schema configurations via trial-and-error. Force the user to supply high-contrast test states (e.g., generating minimum-entropy delta states, capturing isolated packets, or performing a single isolated manual database action).
3.  **Logical Indeterminism:**
    *   *Condition:* Local mock syntax validations pass, but functional correctness depends on complex local timing conditions, user system configurations, or external environment parameters.
    *   *Handoff Action:* Stop guessing logical pathways. Ask the user to reproduce the flow manually, verify state transitions step-by-step, and provide the raw empirical terminal trace.

### Measured Advantages:
*   Converts costly speculative thinking into highly precise, deterministic data analysis.
*   Preserves step limits and token windows by cutting down retry loops.
*   Guarantees 100% accurate fixes based on empirical runtime feedback.

---

## 🏗️ 4. Post-Refactor Structural Verification

After completing any refactor that changes module boundaries, moves shared references, or restructures component interfaces, you **MUST** execute the following verification sequence before marking the task as complete.

### 4.1 Cross-Module Dependency Audit
* Use `grep_search` to find **every consumer** of any modified, renamed, or removed export.
* Verify each consumer has been updated to use the new interface.
* Pay special attention to **boot pipeline files** (e.g., `bootstrap.js`, `app-composition.js`, `renderer.js`) — these are where boundary violations surface first.

### 4.2 Boot Pipeline Smoke Test
* If the project has a startup/initialization sequence, **run the application** (or request the user to run it) and verify:
  * Zero uncaught exceptions or unhandled promise rejections in the console.
  * All UI elements render correctly (no missing text, broken layouts, or undefined references).
  * No `TypeError: Cannot set/read properties of undefined` errors — these indicate a missing reference that was not properly migrated.

### 4.3 Shared-to-Owned Migration Checklist
* When moving a resource from a shared/global scope into a component's internal scope:
  1. `grep_search` for the old shared reference name across the entire `src/` directory.
  2. For each hit: determine if the consumer is **inside** the component (safe) or **outside** (must be updated or the ref must remain shared).
  3. If an external consumer exists, either: (a) keep a convenience alias in the shared scope, or (b) refactor the consumer to use the component's public API.
