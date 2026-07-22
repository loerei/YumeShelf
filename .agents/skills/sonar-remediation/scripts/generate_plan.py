import os
import sys
import json

if len(sys.argv) < 3:
    print("Usage: python generate_plan.py <input_json_path> <output_plan_path>")
    sys.exit(1)

input_path = os.path.abspath(sys.argv[1])
output_path = os.path.abspath(sys.argv[2])

with open(input_path, "r", encoding="utf-8") as f:
    data = json.load(f)

issues = data.get("issues", [])

by_file = {}
for issue in issues:
    comp = issue.get("component", "")
    if ":" in comp:
        comp = comp.split(":")[-1]
    if comp not in by_file:
        by_file[comp] = []
    by_file[comp].append(issue)

# Sort files alphabetically
sorted_files = sorted(by_file.keys())

plan_content = [
    "# Implementation Plan - Fixing SonarCloud Issues",
    "",
    f"This plan details the surgical remediation of all {len(issues)} open SonarCloud issues in this project.",
    "",
    "## Proposed Changes",
    ""
]

import os
project_dir = os.getcwd().replace("\\", "/")
if project_dir.endswith("/"):
    project_dir = project_dir[:-1]

for filepath in sorted_files:
    file_issues = by_file[filepath]
    plan_content.append(f"### {filepath} ({len(file_issues)} issues)")
    plan_content.append("")
    plan_content.append(f"#### [MODIFY] [{filepath.split('/')[-1]}](file:///{project_dir}/{filepath})")
    plan_content.append("")
    
    file_issues_sorted = sorted(file_issues, key=lambda x: x.get("textRange", {}).get("startLine", 0) if x.get("textRange") else 0)
    for issue in file_issues_sorted:
        key = issue.get("key")
        rule = issue.get("rule")
        severity = issue.get("severity")
        msg = issue.get("message")
        tr = issue.get("textRange")
        line_str = f"L{tr['startLine']}" if tr else "global"
        
        # Determine surgical resolution
        res = "Apply surgical fix"
        if rule == "typescript:S6582" or rule == "javascript:S6582":
            res = "Change logical/nullish chains to use standard TypeScript optional chaining `?.`."
        elif rule == "typescript:S7721":
            res = "Hoist the inner function out of the enclosing function block to prevent redundant closures."
        elif rule in ["typescript:S3776", "javascript:S3776", "python:S3776"]:
            res = "Always flag on SonarCloud as APPROVED/ACCEPTED. We do not split functions to satisfy SonarQube metrics as it promotes shallow modules. Structural refactoring should only be initiated via /improve-codebase-architecture."
        elif rule == "typescript:S2004":
            res = "Flatten callback structure or extract helper functions to reduce function nesting depth."
        elif rule == "typescript:S8786":
            res = "Refactor the regular expression to use non-backtracking patterns or simpler matching structures."
        elif rule == "typescript:S7735" or rule == "javascript:S7735":
            res = "Simplify condition by removing negation."
        elif rule == "typescript:S3358" or rule == "javascript:S3358":
            res = "Convert nested ternary operators to clean `if-else` blocks or dedicated helper variables."
        elif rule == "typescript:S2486" or rule == "javascript:S2486":
            res = "Ensure exceptions inside catch blocks are logged, handled, or rethrown instead of ignored."
        elif rule == "typescript:S6594" or rule == "javascript:S6594":
            res = "Change matching/testing calls to use `RegExp.exec()` where appropriate."
        elif rule == "typescript:S3735":
            res = "Remove unnecessary `void` operator prefixes."
        elif rule == "typescript:S7780":
            res = "Use `String.raw` for string literals that contain backslashes."
        elif rule in ["typescript:S1854", "javascript:S1854", "typescript:S1481", "javascript:S1481"]:
            res = "Verify if the function/variable is truly unused (SonarQube may miss indirect usage). If it is used, flag on SonarCloud as ACCEPTED/FALSE POSITIVE. Otherwise, surgically remove it."
        elif rule == "typescript:S7781":
            res = "Use `String.replaceAll()` instead of `replace()` for global replacements."
        elif rule == "typescript:S6660":
            res = "Refactor else-if style single if statements to be standard else-if blocks instead of nested else { if }."
        elif rule == "typescript:S7761" or rule == "javascript:S7761":
            res = "Use the `.dataset` property for accessing `data-*` attributes instead of calling getAttribute/setAttribute."
        elif rule == "typescript:S6606" or rule == "javascript:S6606":
            res = "Convert logical OR short-circuiting to standard nullish coalescing `??` or assignment `??=`."
        elif rule == "typescript:S6535":
            res = "Remove unnecessary backslash escape sequences."
        elif rule == "typescript:S4624":
            res = "Flatten template string literals to avoid nested interpolation."
        elif rule == "typescript:S7755":
            res = "Use `.at(-index)` instead of array length subtraction lookup."
        elif rule == "typescript:S1128":
            res = "Delete the unused import statement."
        elif rule == "javascript:S3504":
            res = "Replace `var` declarations with block-scoped `let` or `const`."
        elif rule == "python:S1192":
            res = "Define a module-level constant instead of duplicating string literals."
        elif rule == "python:S7494":
            res = "Use set comprehension `{x for x in ...}` instead of calling `set(x for x in ...)`."
        elif rule == "css:S1874":
            res = "Replace deprecated `word-break: break-word` with standard `overflow-wrap: break-word`."
        elif rule == "css:S4666":
            res = "Consolidate duplicate CSS selectors."
        elif rule == "css:S7924":
            res = "Flag on SonarCloud as APPROVED/ACCEPTED to preserve the custom theme color contrast."
        elif rule == "Web:InputWithoutLabelCheck":
            res = "Add appropriate `aria-label` attributes to ensure input accessibility."
        elif rule == "Web:S6853":
            res = "Provide accessible fallback text inside the dynamically populated checkbox label."
        
        plan_content.append(f"- `[{severity}]` **`{rule}`** at `{line_str}`: {msg} (Key: `{key}`)")
        plan_content.append(f"  *Resolution:* {res}")
        
    plan_content.append("")
    plan_content.append("---")
    plan_content.append("")

plan_content.append("## Verification Plan")
plan_content.append("")
plan_content.append("We will verify that the fixes compile, pass type checks, run successfully, and resolve the issues correctly using the following steps:")
plan_content.append("")
plan_content.append("### Automated Tests")
plan_content.append("- Run `pnpm run typecheck` or `npm run typecheck` to verify complete type safety and compile sanity.")
plan_content.append("- Run `pnpm run test` or `npm run test` to verify that all unit test suites continue to pass successfully.")
plan_content.append("")
plan_content.append("### Manual Verification")
plan_content.append("- Verify that the application starts and renders correctly on the dev server (`npm run dev`).")
plan_content.append("- Run the SonarCloud analysis (or verify that it completes successfully on CI/CD) to ensure the count of open issues drops to 0.")
plan_content.append("")

with open(output_path, "w", encoding="utf-8") as f:
    f.write("\n".join(plan_content))

print(f"Generated {output_path} successfully!")
