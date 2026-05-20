import re

# Read ui-text.js and find all references like refs.someName
with open('src/renderer/ui-text.js', 'r', encoding='utf-8') as f:
    ui_text = f.read()

# We look for refs.xxxx.innerText, refs.xxxx.innerHTML, refs.xxxx.value, refs.xxxx.innerText =
refs_used = set(re.findall(r'refs\.([a-zA-Z0-9_]+)', ui_text))

# Read dom-refs.js to find keys defined in uiTextRefs
with open('src/renderer/bootstrap/dom-refs.js', 'r', encoding='utf-8') as f:
    dom_refs = f.read()

ui_text_refs_block = re.search(r'uiTextRefs:\s*\{(.*?)\}', dom_refs, re.DOTALL)
keys_defined = set()
if ui_text_refs_block:
    lines = ui_text_refs_block.group(1).split('\n')
    for line in lines:
        if ':' in line:
            key = line.split(':', 1)[0].strip()
            keys_defined.add(key)

print("Keys used in ui-text.js:", sorted(list(refs_used)))
print("Keys defined in uiTextRefs of dom-refs.js:", sorted(list(keys_defined)))

missing = refs_used - keys_defined
print("\nMISSING KEYS IN dom-refs.js's uiTextRefs:", missing)
