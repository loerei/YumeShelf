---
version: "1.5.6"
status: "released"
released_at: "2026-05-20T09:39:51.381Z"
last_updated_by: "release-compiler-script"
last_updated_at: "2026-05-20T09:39:51.381Z"
---

# YumeShelf Changelog - v1.5.6

## ✨ What's New

- **Codebase Dependency Graph Analyzer**: Integrated a robust, high-performance AST-based static dependency analysis tool into the YumeShelf SOP toolchain, giving developers and AI agents instant insight into import relationships, dependent maps, and module boundaries.
- **SOP CLI `dep` Commands**: Implemented new command interface supporting `node SOP/cli.js dep scan` for dependency graph regeneration, `node SOP/cli.js dep query <file>` for targeting dependencies/dependents, and `node SOP/cli.js dep circular` for cycle detection.

## 🔧 What Changed

- **Standard Operating Procedures Modernization**: Updated `SOP/01-context-efficiency.md` (Step 5) and `SOP/06-architectural-thinking.md` (Architecture Discovery & Post-Structural-Change Audits) to require dependency querying and circular dependency verification before and after structural refactorings.

---

## 🛠️ For the Nerds

- [SOP] Introduced a robust, AST-based codebase Dependency Graph Analyzer (`SOP/tools/dependency-manager.js`) using Web Tree-sitter to parse CommonJS require calls and ESM import statements.
- [SOP] Added `dep` command namespace to the SOP CLI orchestrator (`SOP/cli.js`) to support codebase dependency mapping, dynamic query checks, and DFS cycle detection.
- [SOP] Configured automated resolving logic to map relative import strings to absolute repository-relative references, classifying builtin modules and external NPM dependencies separately.
- [SOP] Implemented recursive, normalized circular dependency path detection to prevent memory leaks and initialization cycles across 119 codebase files.
