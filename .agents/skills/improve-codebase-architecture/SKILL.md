---
name: improve-codebase-architecture
description: Use when scanning a codebase for shallow modules and deepening opportunities.
disable-model-invocation: true
---

# Improve Codebase Architecture

Surface architectural friction and propose **deepening opportunities** to transform shallow modules into deep ones. For HTML report scaffolding, diagram patterns, and styling, see [HTML-REPORT.md](HTML-REPORT.md).

## Directives

1. **Architecture Vocabulary**: MUST use exact terms (*module, interface, implementation, depth, seam, adapter, leverage, locality*); NEVER substitute *component, service, API, boundary*.
2. **Domain Terms & ADRs**: If the repository has a domain glossary (`CONTEXT.md`) or ADRs (`docs/adr/`), read them before scanning.
3. **Temp Report Location**: MUST write the HTML report to the OS temporary directory (`$TMPDIR` or `%TEMP%`) as `architecture-review-<timestamp>.html`. NEVER write review HTML files into the repo.
4. **Visual Centricity**: Every candidate MUST include side-by-side Before/After diagrams per [HTML-REPORT.md](HTML-REPORT.md).

## Workflow

1. **Scope & Explore:** Walk recent commit history (`git log --oneline`) for high-churn areas or inspect user-specified modules. Flag shallow pass-through interfaces, cross-seam leaks, and hard-to-test areas. Apply the Deletion Test: if deleting a module concentrates complexity in one place, it is a deepening candidate.
2. **Generate HTML Report:** Write the self-contained HTML report per [HTML-REPORT.md](HTML-REPORT.md), open it in the default browser (`start <path>` on Windows, `open <path>` on macOS, `xdg-open <path>` on Linux), present the top recommendation, and ask the user which candidate to explore.
3. **Grill & Refine:** Interview the user one question at a time via `ask_question` (constraints, dependencies, test survival). If exploring alternative interfaces, use the `design-an-interface` skill (Design It Twice pattern). If a candidate is rejected with a permanent technical rationale, offer to record it as an ADR.
