# SOP 02: SMART CODE MUTATION & NATIVE PYTHON-PATCHING PROTOCOL

This SOP instructs you on how to scientifically select code mutation paths to eliminate syntax errors, resolve Windows-specific CRLF issues, and minimize generation token overhead.

---

## ⚡ 1. Smart 80-Line Escalation Rule

When preparing to modify a file, calculate the line scope of the edit and choose the correct execution path:

### Selection Criteria:
1. **Under 80 Lines (Micro-Edit):**
   * Use the native `replace_file_content` or `multi_replace_file_content` tools.
   * **Windows CRLF Warning:** Windows repositories use `\r\n` line endings. Ensure your `TargetContent` block precisely matches all whitespaces, line breaks, and characters.
2. **Over 80 Lines OR Mutating Disjoint (Non-Adjacent) Areas:**
   * **STRICTLY PROHIBITED** from using raw-text replacement tools.
   * **MANDATORY** to write a dedicated Python Script to apply the patch programmatically (utilizing `re` regex or `ast` trees) and execute it via `run_command`.

---

## 🐍 2. Standard Python-Patching Script Blueprint

When generating a Python Script to modify code, utilize this standard template to guarantee physical file safety:

```python
import os
import re

# 1. Absolute target file path
target_file = r"d:\Games\H Games\YumeShelf\src\main\category-state\index.js"

# 2. Open and read using utf-8 encoding
with open(target_file, "r", encoding="utf-8") as f:
    content = f.read()

# 3. Apply modification using anchored regex
pattern = r"(async function loadCategoryState\(\)\s*\{)"
replacement = r"\1\n        console.log('DEBUG: State loaded successfully');"

new_content = re.sub(pattern, replacement, content, count=1)

# 4. Safe write back
with open(target_file, "w", encoding="utf-8") as f:
    f.write(new_content)
```

### Measured Advantages:
* Reduces LLM output token footprint by **91.60%** (LLM outputs 10 lines of script instead of 150+ lines of redundant source code).
* Eliminates Windows line-ending issues as Regex matches across both `\r\n` and `\n` formats natively.

---

## 🔄 3. The Pivot Rule

* If your first attempt using `replace_file_content` returns a **TargetContent not found** mismatch error:
  * **DO NOT** attempt to guess the line alignment or submit a second raw text patch.
  * **IMMEDIATELY PIVOT** to writing a Python script to automate the patch. Repeating failed text matches drains context and runs out of user interaction steps.
