# HTML Report Format

Render the architectural review as a single self-contained HTML file in the OS temp directory (`$TMPDIR` or `%TEMP%`). Use Tailwind and Mermaid CDNs for graphs, and hand-built `<div>`s + inline SVG for editorial visuals (mass diagrams, cross-sections).

## Scaffold

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Architecture review: {{repo name}}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script type="module">
      import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
      mermaid.initialize({ startOnLoad: true, theme: "neutral", securityLevel: "loose" });
    </script>
    <style>
      .seam { stroke-dasharray: 4 4; }
      .leak { stroke: #dc2626; }
      .deep { background: linear-gradient(135deg, #0f172a, #1e293b); }
    </style>
  </head>
  <body class="bg-stone-50 text-slate-900 font-sans">
    <main class="max-w-5xl mx-auto px-6 py-12 space-y-12">
      <header>...</header>
      <section id="candidates" class="space-y-10">...</section>
      <section id="top-recommendation">...</section>
    </main>
  </body>
</html>
```

## Layout & Card Structure

- **Header:** Repo name, date, and compact legend (`solid box = module`, `dashed line = seam`, `red arrow = leakage`, `thick dark box = deep module`). No intro paragraph.
- **Candidate Card (`<article>`):**
  - **Title:** Short deepening name (e.g., `"Collapse the Order intake pipeline"`).
  - **Badge row:** Recommendation (`Strong` = emerald, `Worth exploring` = amber, `Speculative` = slate) + dependency category (`in-process`, `local-substitutable`, `ports & adapters`, `mock`).
  - **Files:** Monospaced list (`font-mono text-sm`).
  - **Before / After diagram:** Side-by-side (`~320px` tall).
  - **Problem / Solution:** 1 sentence each.
  - **Wins:** Bullets (`<= 6` words each) phrased in glossary terms (e.g., `"Tests hit one interface"`, `"Pricing logic stops leaking"`, `"Locality: bugs concentrate in one module"`). Avoid vague claims like `"easier to maintain"`.
  - **ADR callout (if applicable):** 1 line in an amber-tinted box.
- **Top Recommendation Section:** One larger card with candidate name, 1-sentence rationale, and anchor link to its card.

## Diagram Patterns

Vary patterns across candidates to fit the problem:
- **Mermaid graph (`flowchart` / `sequenceDiagram`):** For call flows and round-trips; style leakage edges red (`stroke:#dc2626`) and the deep module dark.
- **Hand-built boxes-and-arrows (`<div>` + inline SVG):** When showing one thick-bordered deep module with faded internals.
- **Cross-section (`h-12 border-l-4` bands):** For layered shallowness (Before: thin pass-through bands; After: 1 thick consolidated band).
- **Mass diagram:** Two rectangles per module (interface vs. implementation area; Before: wide interface, thin implementation; After: narrow interface, tall implementation).
- **Call-graph collapse:** Nested tree before; single box with faded internal calls after.

## Styling Rules

- Lean editorial layout with generous whitespace; use `text-xs uppercase tracking-wider` for schematic module labels.
- Use one primary accent (emerald or indigo) plus red for leakage and amber for warnings.
- Include no scripts other than Tailwind CDN and Mermaid ESM.
