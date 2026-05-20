# SOP 01: CONTEXT WINDOW & SEARCH EFFICIENCY PROTOCOL

This SOP instructs you on how to optimize your context window footprint to maximize reasoning accuracy and eliminate prompt bloat.

---

## 🔍 1. Search-Narrow Protocol

When locating a symbol, function, or variable in the workspace, adhere to the following workflow:

1. **Step 1: Narrow Scanning with `grep_search`**
   * Specify a targeted query and narrow path rather than searching the entire workspace.
   * Use the `Includes` parameter to filter by relevant file extensions (e.g., `*.js`, `*.py`, `*.rs`, `*.cpp`, `*.rpy`, `*.json`, `*.html` depending on your target environment).
2. **Step 2: Consolidate Results into Metadata & Hotspots**
   * **NEVER** keep massive raw search dumps in your active prompt.
   * Summarize search hits into a structured list containing:
     * *File Path*
     * *Line Numbers*
     * *Hotspot Justification (Why this area requires modification)*
3. **Step 3: Structural Layered Reading (Anti-Tunnel Vision)**
   * Avoid raw "tunnel vision" (reading only 20-30 lines blindly) which leads to duplicate variable declarations or scope clashes. Apply the **Layered Structural Reading**:
     * **Layer 1 (Architecture & Overview):** Read the first 50 lines of the target file to see structural context (Imports, global state references, core dependencies).
     * **Layer 2 (Detail & Surrounding Scope):** Read the target function/variable along with at least **50 lines of surrounding padding** (including helper functions and class declarations) to capture the surrounding scope completely.
   * **Diff-Based Re-Verification:** When verifying code changes made in previous turns or checking modifications between edits, **NEVER** re-read the entire source file. Use `git diff <file_path>` via `run_command` instead. The standard diff is extremely token-efficient, fast, and shows you exactly what changed without bloating the context window with unchanged source code.
4. **Step 4: Repository Structural Mapping (Repo Map)**
   * To instantly locate functions, class boundaries, or understand file maps without blind raw searches, read the cached symbol map (defaults to `local/refs/repo-map.txt` or the path specified in `sop.config.json`).
   * **Self-Updating Map:** If new files are created, update the repository structure map by running:
     ```powershell
     node SOP/cli.js map
     ```

---

## 📊 2. Hotspot Analysis Example

An example of a clean, agent-generated hotspot record:
*   **Target File:** [src/main/category-state/index.js](./src/main/category-state/index.js#L12-L35)
*   **Hotspots:** `loadCategoryState` and `saveCategoryState` functions.
*   **Justification:** Implements physical read/write operations of categories; requires file checking and structured logging updates.

> [!NOTE]
> **Anti-Anchoring Guideline:** The hotspot example above is purely illustrative. You **MUST** adapt your hotspot discovery, analysis, and target definitions dynamically to the programming languages, architectural structures, and directory schemes of whichever repository or feature you are active in.

*By adhering to this protocol, you will reduce prompt noise by over 90%, preserving critical reasoning space for logic implementation.*
