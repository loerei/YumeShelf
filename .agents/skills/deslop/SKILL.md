---
name: deslop
description: Use when asked to edit, clean, or deslop human-facing technical text.
---

# Deslop

Clean and tighten human-facing technical documentation by stripping corporate slop, marketing buzzwords, and redundant filler while preserving developer utility and architectural clarity. For machine-consumed text (prompts, system rules, schemas), use `write-for-ai` instead. For case studies and the master lookup matrix, see [REFERENCE.md](REFERENCE.md).

## Directives

1. **Maximize technical signal, eliminate marketing puffery**: Strip superlatives (`cutting-edge`, `blazing-fast`, `enterprise-grade`) and pompous verbs (`utilize`, `leverage`, `orchestrate`). State plainly what the software does, how it works, and how to use it.
2. **Preserve practical human context**: Unlike AI-facing text, human technical docs require context. MUST preserve problem statements ("why this exists"), architectural trade-offs, quickstart setup commands, prerequisite dependencies, configuration tables, and concrete code examples.
3. **Use natural technical voice**: Write in clear, direct active voice. Do NOT inject RFC 2119 imperatives (`MUST`, `NEVER`, `ALWAYS`) into general user-facing documentation unless editing an official RFC or protocol spec.
4. **Eliminate throat-clearing and staged openings**: Cut conversational filler (`In today's fast-paced world`, `Look no further`, `Without further ado`). Start directly with the technical concept, installation step, or usage syntax.
5. **Eliminate header tautology**: NEVER repeat the header text in the first sentence beneath it.
6. **Ground claims in verifiable facts**: Replace vague claims (`extreme scalability`) with concrete architectural facts or benchmarks (`processes 5,000 reqs/sec with p99 < 20ms`, `uses an in-memory ring buffer`).
7. **Minimal Diffs in documentation**: Update only the targeted sections or paragraphs. NEVER rephrase, restructure, or rewrite unaffected sections.
8. **Preserve domain and API terms**: Keep exact commands, flag names, types, configuration keys, and error names unchanged.

| Keep (Technical Signal) | Cut (Corporate Slop) |
| :--- | :--- |
| Quantitative benchmarks, metrics, and algorithmic complexity (`O(k)`, `50k msgs/sec`) | Marketing superlatives (`cutting-edge`, `blazing-fast`, `revolutionary`) |
| Concrete architectures, mechanics, and trade-offs (`prefix trie`, `ring buffer`) | Empty buzzwords (`robust`, `seamless`, `enterprise-grade`, `intelligent`) |
| Simple active verbs (`use`, `run`, `call`, `send`, `format`, `connect`) | Pompous verbs (`leverage`, `orchestrate`, `utilize`, `streamline`, `empower`) |
| Minimal runnable quickstarts, installation steps, and code examples | Conversational throat-clearing (`In today's fast-paced world`, `Without further ado`) |
| Direct headers and immediate technical substance | Header echoing and tautological introductory sentences |
| Exact types, defaults, and concrete parameter descriptions | Circular parameter names (`timeout: The timeout value`) |
| Targeted edits to requested sections | Full-document rewrites or rephrasing of unaffected sections |

## Workflows

### 1. Deslop Existing Documentation
1. Read the document to identify core technical purpose, prerequisites, and developer workflows.
2. Strip buzzwords, corporate fluff, empty superlatives, and conversational padding.
3. Apply Minimal Diffs: modify only the affected sections; do not rephrase surrounding text.
4. Verify all code blocks, installation steps, configuration keys, and parameter tables remain functional and intact.
5. Output `Original -> Deslopped` with a brief rationale for each cut.

### 2. Draft New Technical Documentation
1. State what the project or module does in 1-2 clear, active sentences.
2. Provide immediate installation and minimal runnable Quickstart example.
3. Document core concepts, configuration options, and API signatures plainly.
4. Note limitations, trade-offs, or prerequisites without defensive hedging.
