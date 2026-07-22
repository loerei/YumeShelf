import os
import sys
import json

if len(sys.argv) < 3:
    print("Usage: python generate_task.py <input_json_path> <output_task_path>")
    sys.exit(1)

input_path = os.path.abspath(sys.argv[1])
output_path = os.path.abspath(sys.argv[2])

with open(input_path, "r", encoding="utf-8") as f:
    data = json.load(f)

issues = data.get("issues", [])

# Filter out S3776 from the issues that need code modifications
S3776_rules = ["typescript:S3776", "javascript:S3776", "python:S3776"]
code_issues = [issue for issue in issues if issue.get("rule") not in S3776_rules]

# Group issues by component (file)
by_file = {}
for issue in code_issues:
    comp = issue.get("component", "")
    if ":" in comp:
        comp = comp.split(":")[-1]
    if comp not in by_file:
        by_file[comp] = []
    by_file[comp].append(issue)

# Sort files alphabetically
sorted_files = sorted(by_file.keys())

task_lines = [
    "# Tasks for SonarCloud Issue Fixes",
    "",
    f"This task list tracks the resolution of all {len(code_issues)} open SonarCloud code issues across {len(sorted_files)} files.",
    "",
    "- [ ] Git Setup & Branch Creation",
    "  - [ ] Create and checkout new branch `fix/sonar-issues-all`",
    "- [ ] Code Quality Fixes"
]

for filepath in sorted_files:
    file_issues = by_file[filepath]
    file_issues_sorted = sorted(file_issues, key=lambda x: x.get("textRange", {}).get("startLine", 0) if x.get("textRange") else 0)
    
    task_lines.append(f"  - [ ] Fix issues in `{filepath}` ({len(file_issues)} issues)")
    for issue in file_issues_sorted:
        key = issue.get("key")
        rule = issue.get("rule")
        severity = issue.get("severity")
        tr = issue.get("textRange")
        line_str = f"L{tr['startLine']}" if tr else "global"
        msg = issue.get("message")
        msg_clean = msg.replace("`", "'")
        task_lines.append(f"    - [ ] `[{severity}]` `{rule}` at `{line_str}`: {msg_clean} (Key: `{key}`)")

s7924_count = sum(1 for issue in issues if issue.get("rule") == "css:S7924")

if s7924_count > 0:
    task_lines.extend([
        "- [ ] Flag contrast ratio issues (S7924) on SonarCloud",
        f"  - [ ] Flag {s7924_count} contrast ratio issues as ACCEPTED"
    ])

unused_rules = ["typescript:S1481", "javascript:S1481", "typescript:S1854", "javascript:S1854"]
unused_count = sum(1 for issue in issues if issue.get("rule") in unused_rules)

if unused_count > 0:
    task_lines.extend([
        "- [ ] Verify and Flag unused variable/function issues (S1481, S1854) on SonarCloud",
        f"  - [ ] Verify usage for {unused_count} issues, and flag as ACCEPTED if they are false positives"
    ])

s3776_count = sum(1 for issue in issues if issue.get("rule") in S3776_rules)

if s3776_count > 0:
    task_lines.extend([
        "- [ ] Flag Cognitive Complexity issues (S3776) on SonarCloud",
        f"  - [ ] Flag {s3776_count} cognitive complexity issues as ACCEPTED (avoid splitting deep functions)"
    ])

task_lines.extend([
    "- [ ] Local Verification & Testing",
    "  - [ ] Run typecheck validation",
    "  - [ ] Run test suite validation",
    "  - [ ] Check Git diff with GitNexus detect_changes"
])

with open(output_path, "w", encoding="utf-8") as f:
    f.write("\n".join(task_lines))

print(f"Generated {output_path} successfully!")
