# SOP 01: CONTEXT WINDOW & SEARCH EFFICIENCY PROTOCOL

This SOP instructs you on how to optimize your context window footprint to maximize reasoning accuracy and eliminate prompt bloat.

---

## 🔍 1. Search-Narrow Protocol

When locating a symbol, function, or variable in the workspace, adhere to the following workflow:

1. **Step 1: Narrow Scanning with `grep_search`**
   * Specify a targeted query and narrow path rather than searching the entire workspace.
   * Use the `Includes` parameter to filter by file extensions (e.g., `*.js`, `*.py`).
2. **Step 2: Consolidate Results into Metadata & Hotspots**
   * **NEVER** keep massive raw search dumps in your active prompt.
   * Summarize search hits into a structured list containing:
     * *File Path*
     * *Line Numbers*
     * *Hotspot Justification (Why this area requires modification)*
3. **Step 3: Targeted Reading with `view_file`**
   * Read code exclusively using `view_file` with precise `StartLine` and `EndLine` ranges surrounding the target function.
   * Avoid loading more than 800 lines of code unless absolutely necessary.

---

## 📊 2. Hotspot Analysis Example

An example of a clean, agent-generated hotspot record:
*   **Target File:** [src/main/category-state/index.js](file:///d:/Games/H%20Games/YumeShelf/src/main/category-state/index.js#L12-L35)
*   **Hotspots:** `loadCategoryState` and `saveCategoryState` functions.
*   **Justification:** Implements physical read/write operations of categories; requires file checking and structured logging updates.

*By adhering to this protocol, you will reduce prompt noise by over 90%, preserving critical reasoning space for logic implementation.*
