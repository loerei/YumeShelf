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
