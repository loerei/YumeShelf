---
name: improve-codebase-architecture
description: Scan codebase for deepening opportunities, generate an HTML report, and grill selected candidates.
disable-model-invocation: true
---

# Improve Codebase Architecture

Surface architectural friction and propose **deepening opportunities** to transform shallow modules into deep ones.

## Directives

1. **Architecture Vocabulary**: MUST use exact terms from [`codebase-design`](../codebase-design/SKILL.md) (*module, interface, depth, seam, adapter, leverage, locality*); NEVER substitute *component, service, API, boundary*.
2. **Domain Terms & ADRs**: MUST consult `CONTEXT.md` for domain terminology and `docs/adr/` for existing architectural decisions before scanning.
3. **Temp Report Generation**: MUST write the visual HTML report to the OS temporary directory (`$TMPDIR` or `%TEMP%`) with filename `architecture-review-<timestamp>.html`. NEVER write review HTML files into the repo.
4. **Visual Centricity**: Every candidate in the report MUST have side-by-side Before/After diagrams per [HTML-REPORT.md](HTML-REPORT.md).

---

## Workflow

### 1. Scope & Explore
- **Prioritize Hot Spots**: Walk recent commit history (`git log --oneline`) to identify high-churn files, or follow user-specified target modules.
- **Inspect Friction Points**:
  - Modules with shallow interfaces (pass-through wrappers).
  - Tightly-coupled modules leaking across seams.
  - Hard-to-test areas or pure functions extracted without caller locality.
- **Apply the Deletion Test**: If deleting a module concentrates complexity in one place, it is a viable deepening candidate.

### 2. Generate HTML Report
- Write self-contained HTML report with Tailwind and Mermaid CDNs per [HTML-REPORT.md](HTML-REPORT.md).
- Structure each candidate card:
  - **Files**: Involved source files.
  - **Problem & Solution**: 1-sentence explanations.
  - **Wins**: Concise bullets (*locality, leverage, test surface*).
  - **Before / After Diagram**: Visual representation of shallowness vs deepening.
  - **Recommendation Badge**: `Strong` (emerald), `Worth exploring` (amber), or `Speculative` (slate).
- Open report in browser (`start <path>` on Windows, `open <path>` on macOS, `xdg-open <path>` on Linux).
- Present top recommendation and ask user which candidate to explore.

### 3. Grilling & Refinement Loop
- Run [`grilling`](../grilling/SKILL.md) to stress-test the chosen candidate (constraints, dependencies, test survival).
- Update domain terminology in `CONTEXT.md` via [`domain-modeling`](../domain-modeling/SKILL.md).
- If exploring alternative interfaces, apply the parallel sub-agent pattern in [DESIGN-IT-TWICE.md](../codebase-design/DESIGN-IT-TWICE.md).
- If a candidate is rejected with a permanent technical rationale, offer to record it as an ADR.

---

## Subdoc Reference

- **HTML Report Scaffold & Diagram Patterns**: see [HTML-REPORT.md](HTML-REPORT.md).
