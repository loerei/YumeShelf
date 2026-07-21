import sys
import json

if len(sys.argv) < 3:
    print("Usage: python count_issues.py <input_json_path> <output_md_path>")
    sys.exit(1)

input_path = sys.argv[1]
output_path = sys.argv[2]

with open(input_path, "r", encoding="utf-8") as f:
    data = json.load(f)

issues = data.get("issues", [])
print(f"Total issues found: {len(issues)}")

by_file = {}
by_rule = {}
by_severity = {}

for issue in issues:
    comp = issue.get("component", "")
    # Remove project prefix if present
    if ":" in comp:
        comp = comp.split(":")[-1]
    
    rule = issue.get("rule", "")
    severity = issue.get("severity", "")
    
    by_file[comp] = by_file.get(comp, 0) + 1
    by_rule[rule] = by_rule.get(rule, 0) + 1
    by_severity[severity] = by_severity.get(severity, 0) + 1

print("\nBy Severity:")
for k, v in sorted(by_severity.items(), key=lambda x: x[1], reverse=True):
    print(f"  {k}: {v}")

print("\nBy Rule:")
for k, v in sorted(by_rule.items(), key=lambda x: x[1], reverse=True):
    print(f"  {k}: {v}")

print("\nBy File (Top 15):")
for k, v in sorted(by_file.items(), key=lambda x: x[1], reverse=True)[:15]:
    print(f"  {k}: {v}")

# Group issues by component (file)
by_file_issues = {}
for issue in issues:
    comp = issue.get("component", "")
    if ":" in comp:
        comp = comp.split(":")[-1]
    
    if comp not in by_file_issues:
        by_file_issues[comp] = []
    by_file_issues[comp].append(issue)

# Sort files alphabetically
sorted_files = sorted(by_file_issues.keys())

out_lines = [
    "# Detailed Open Issues for Project",
    f"Total issues: {len(issues)}",
    ""
]

for filepath in sorted_files:
    file_issues = by_file_issues[filepath]
    out_lines.append(f"## {filepath} ({len(file_issues)} issues)")
    out_lines.append("")
    # Sort issues by line number
    file_issues_sorted = sorted(file_issues, key=lambda x: x.get("textRange", {}).get("startLine", 0) if x.get("textRange") else 0)
    for issue in file_issues_sorted:
        key = issue.get("key")
        rule = issue.get("rule")
        severity = issue.get("severity")
        msg = issue.get("message")
        tr = issue.get("textRange")
        line_str = f"L{tr['startLine']}" if tr else "global"
        out_lines.append(f"- **[{severity}]** {rule} at `{line_str}`: {msg} (Key: `{key}`)")
    out_lines.append("")

with open(output_path, "w", encoding="utf-8") as f:
    f.write("\n".join(out_lines))

print(f"\nGenerated {output_path} successfully!")
