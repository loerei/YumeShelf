# SOP 02: SMART CODE MUTATION & SEMANTIC-AWARE PATCHING PROTOCOL

This SOP instructs you on how to scientifically select and execute code mutations using semantic parsing and automated polyfills to eliminate syntax errors, handle Windows-specific CRLF issues, and minimize generation token overhead.

---

## ⚡ 1. Smart 80-Line & Automation Escalation Rule

When preparing to modify a file, calculate the line scope of the edit and choose the correct execution path to prevent manual alignment mistakes:

### Selection Criteria:
1. **Under 80 Lines (Micro-Edit):**
   * Use the native `replace_file_content` or `multi_replace_file_content` tools.
   * **Windows CRLF Warning:** Windows repositories use `\r\n` line endings. Ensure your `TargetContent` block precisely matches all whitespaces, line breaks, and characters.
2. **Over 80 Lines, Mutating Disjoint Areas, OR High-Risk Multi-File Changes:**
   * **STRICTLY PROHIBITED** from using manual raw-text replacement tools to avoid line alignment/CRLF mismatch errors.
   * **MANDATORY** to write a dedicated Helper Script (**Node.js** or **Python**) to apply the patch programmatically (utilizing AST parser, regex, or standard file systems) and execute it via `run_command` in a single run.

---

## 🛠️ 2. Smart Patcher Polyfill Blueprint (The Bulletproof Path)

To completely eliminate Windows CRLF mismatch errors, line indentation shifts, and complex terminal quoting escapes, the repository provides an automated utility via `SOP/cli.js patch`.

### How to use the Smart Patcher:
1. **Create the Search Payload File:** Write the exact block of code you wish to replace into `<appDataDir>\brain\<conversation-id>/scratch/search.txt`.
2. **Create the Replace Payload File:** Write the exact replacement block of code into `<appDataDir>\brain\<conversation-id>/scratch/replace.txt`.
3. **Execute the Smart Patcher:** Run the tool with:
   ```powershell
   node SOP/cli.js patch "relative/or/absolute/path/to/target.js" "C:\Users\sayus\.gemini\antigravity\brain\<conversation-id>\scratch\search.txt" "C:\Users\sayus\.gemini\antigravity\brain\<conversation-id>\scratch\replace.txt"
   ```

### Operational Logic of the Smart Patcher:
* **CRLF Normalization:** Automatically converts all carriage returns (`\r\n` -> `\n`) in both target file and payload text files before matching, preventing typical Windows file editing errors.
* **Auto-Revert line ending:** Saves the final file with its original CRLF or LF layout intact.
* **Zero Escaping Hazards:** Since payloads are loaded directly from temporary files, there are no Shell escaping bugs or terminal length limits.

---

## 🌳 3. Tree-sitter & Semantic AST Querying

For complex analysis, refactoring, or symbol tracking, utilize the `web-tree-sitter` AST querying engine. Do not guess boundaries or nested structures.

### Standard AST Verification Checklist:
1. **Structure Exploration:** Use `node SOP/cli.js map` to extract precise file structures and method boundary lines.
2. **Grammar Integrity:** Ensure that the WASM JavaScript grammar located at the path specified in `sop.config.json` (defaults to `local/refs/grammars/tree-sitter-javascript.wasm`) is used when instantiating the parser.
3. **Safe AST Inspections:** For large files, leverage custom AST visitor scripts under `scratch/` rather than reading thousand-line modules. This guarantees 100% accurate identification of lexical scopes, variable declaration patterns, and method bindings.

---

## 🔄 4. The Pivot Rule

* If your first attempt using `replace_file_content` returns a **TargetContent not found** mismatch error:
  * **DO NOT** attempt to guess the line alignment or submit a second raw text patch.
  * **IMMEDIATELY PIVOT** to writing a Node.js or Python helper script under `<appDataDir>\brain\<conversation-id>/scratch/` or running the `smart-patcher.js` utility.
  * **Verify with Diff:** Immediately after running the helper script or patcher, execute `git diff <file_path>` via `run_command` to verify the patch applied beautifully and cleanly before running tests. Repeating failed manual text replacements drains context and wastes user turns.
