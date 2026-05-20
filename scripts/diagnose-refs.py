import re

with open('src/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

ids_in_html = set(re.findall(r'id=["\']([^"\']+)["\']', html))
classes_in_html = set(re.findall(r'class=["\']([^"\']+)["\']', html))

# Let's inspect what's in uiTextRefs in dom-refs.js
with open('src/renderer/bootstrap/dom-refs.js', 'r', encoding='utf-8') as f:
    dom_refs = f.read()

# Parse all keys inside uiTextRefs
ui_text_refs_block = re.search(r'uiTextRefs:\s*\{(.*?)\}', dom_refs, re.DOTALL)
if ui_text_refs_block:
    lines = ui_text_refs_block.group(1).split('\n')
    for line in lines:
        if ':' in line:
            key, val = line.split(':', 1)
            key = key.strip()
            # If it uses getElementById
            match_id = re.search(r"getElementById\(['\"]([^'\"]+)['\"]\)", val)
            if match_id:
                el_id = match_id.group(1)
                if el_id not in ids_in_html:
                    print(f"MISSING ID IN HTML for key '{key}': id='{el_id}'")
            # If querySelector
            match_qs = re.search(r"querySelector\(['\"]([^'\"]+)['\"]\)", val)
            if match_qs:
                selector = match_qs.group(1)
                print(f"Query selector for key '{key}': {selector}")
else:
    print("Could not parse uiTextRefs block")
