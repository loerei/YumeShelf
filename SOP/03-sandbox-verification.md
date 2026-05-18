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

When facing a complex bug, silent runtime error, or parsing mismatch that cannot be verified locally via syntax check, you **MUST** resist the urge to perform "blind-fixing" (iterative patching based on unverified assumptions).

### The Anti-Blind-Fixing Rule:
*   **DO NOT GUESS:** Making multiple speculative code mutations without physical confirmation of runtime behavior introduces code bloat, wastes token window limits, and creates hidden regression bugs.
*   **COLLABORATE STRATEGICALLY:** The USER is your execution partner. Leverage the physical environment division of labor by actively stopping to delegate runtime diagnostics.

### Diagnostic Handoff Scenarios:
1.  **Obfuscated or Obscure Save Files / Parsers:**
    *   *Action:* Stop guessing the byte or JSON offsets. Ask the user: *"Please create a clean save file with only [Variable Name] changed by 1 unit, so I can perform a deterministic diff."*
2.  **Unreproducible Runtime Errors:**
    *   *Action:* Stop guessing race conditions. Ask the user: *"Please run the application manually, reproduce the issue, and provide the raw console/terminal logs so I can identify the exact trace."*
3.  **Visual or UI Layout Mismatches:**
    *   *Action:* Stop speculating on CSS behaviors. Ask the user: *"Please verify if the layout renders correctly on your display size. If not, please describe the spacing or run [visual command] so I can read the layout metrics."*

### Measured Advantages:
*   Converts costly speculative thinking into highly precise, deterministic data analysis.
*   Preserves step limits and token windows by cutting down retry loops.
*   Guarantees 100% accurate fixes based on empirical runtime feedback.
