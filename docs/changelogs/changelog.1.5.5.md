---
version: "1.5.5"
status: "released"
released_at: "2026-05-20T09:10:21.704Z"
last_updated_by: "release-compiler-script"
last_updated_at: "2026-05-20T09:10:21.704Z"
---

# YumeShelf Changelog - v1.5.5

## ✨ What's New

- [save-editor] Added full support for raw JSON save formats to enable seamless visual editing, state tracking, and configuration tweaking for games utilizing plain JSON serialization.
- [save-editor] Added global keyboard shortcuts in the Save Editor for fast filter toggling: 'E' to toggle 'Show Empty', 'I' to toggle 'Show Important', 'X' to toggle 'Exact Match', and 'Shift + Enter' to instantly commit and save changes. Shortcuts are disabled automatically when typing inside text inputs, textareas, or content-editable elements to prevent interference.
- [save-editor] Added a "Pinned" feature in the Save Editor to allow users to quickly access specific cards and rows across all tabs (including Gold, Items, Weapons, Armors, Variables, and Switches). Users can click a star-toggle icon on any data row to pin/unpin it. A dynamic "Pinned" tab appears between the "All" tab and other category tabs whenever there are pinned items.
- [i18n] Implemented localized "save_editor_pinned" strings in English, Japanese, and Chinese locales to support the Pinned tab label UI.

## 🔧 What Changed

- [settings] Resolved a critical UI bug where the Settings page erroneously displayed a stale application version (e.g. `1.5.3`) instead of the authoritative active version (e.g. `1.5.4` or `1.5.5`) by hardening the renderer process state synchronization.
- [save-editor] Implemented strict **Test Contracts (Hợp đồng Kiểm thử)** for all Save Editor format strategies under `src/main/save-editor/formats/` to enforce structure, cipher involution, checksum compliance, and API consistency.
- [save-editor] Register the new `PureJsonFormat` strategy inside the main Save Editor orchestrator (`src/main/save-editor/index.js`) and the new `PureJsonEngine` strategy inside the renderer's DataEngine orchestrator (`src/renderer/save-editor/data-engine.js`).
- [save-editor] Implemented strict active element checks to prevent global keyboard shortcuts from interfering during text input, and ensured complete cleanup of the keydown listeners when closing or popout-transitioning the editor overlay.
- [save-editor] Enabled star icon hover, active gold glowing state, and layout adjustments for all data rows (Gold, Items, Weapons, Armors, Variables, Switches) to accommodate the new pinning action without disrupting existing layouts.
- [save-editor] Configured the "All" tab to list the default category sections dynamically without duplicates, while keeping pinned variables, switches, items, and gold perfectly synchronized in both their original tab categories and the central Pinned hub tab.
- [tooling] Upgraded `docs/tools/generate-repo-map.js` from brittle Regex-based scans to high-fidelity AST-based parsing using `web-tree-sitter`.
- [SOP] Modernized `SOP/01-context-efficiency.md`, `SOP/02-smart-code-mutation.md`, and `SOP/04-release-and-changelog.md` to incorporate AST-driven navigation, Smart Patcher Windows CRLF safety practices, and explicit developer log standards.
- [SOP] Relocated SOP-related developer tools (`generate-repo-map.js` and `smart-patcher.js`) from `docs/tools/` to `SOP/tools/` to centralize AST code-structure parsing and patcher utilities, and updated all corresponding references in the documentation.
- [SOP] Implemented a centralized CLI Orchestrator (`SOP/cli.js`) to provide a standardized JSON diagnostic interface for all internal AI tools, eliminating fragmented script execution.
- [SOP] Decoupled all YumeShelf-specific configurations from the universal SOP directory by implementing a convention-over-configuration strategy with a repository-root `sop.config.json` helper, and generalized all SOP markdown files to replace absolute file paths/URLs with relative, configurable references.

---

## 🛠️ For the Nerds

- [save-editor] Implemented recursive deep object flattening, path traversal (`_getDeep`, `_setDeep`), and numeric type coercion within the `PureJsonEngine` renderer strategy to support arbitrary nested object graphs and array index structures dynamically.
- [i18n] Replaced vulnerable state mutation inside `src/renderer/i18n.js` (`loadLanguageState` and `setLocaleState`) with explicit version synchronization, guaranteeing `localeState.appVersion` is always retained from the main process's boot context or fetched dynamically via `electronAPI.getAppVersion()`.
- [i18n] Instrumentized both `src/renderer/i18n.js` and `src/main/startup.js` with comprehensive diagnostic telemetry logging (`[I18N][RENDERER]` and `[MAIN][BOOT]`) to trace appVersion assignment and state transitions.
- [tests] Created `tests/save-editor-contracts.test.js` validating standard Strategy interfaces, byte-level LZ-String compression alignment (RPG Maker MV), zlib inflation/deflation (RPG Maker MZ), LCG XOR cipher involution and Sum-Checksum byte calculation (Wolf RPG).
- [tests] Expanded `tests/save-editor-contracts.test.js` with rigorous test cases for `PureJsonFormat` to ensure high-fidelity JSON parsing, round-trip serialization preservation, and strict schema compliance.
- [save-editor] Fortified `docs/yumeshelf-save-editor.md` to document the newly established Strict Test Contracts standard and include modern node:test verification commands.
- [save-editor] Managed the pinned state globally using prefixed IDs (e.g. 'gold:GOLD', 'variables:id', 'switches:id', 'items:id') and persisted state to localStorage under context-aware keys ('yumeshelf_pinned_${gameKey}').
- [save-editor] Integrated star-toggle click handlers in createDataRow and checkbox-row to call state.savePinnedVariables and automatically trigger setupTabs() and renderTabContent() to keep the tabs and grid perfectly synchronized.
- [tooling] Pinned `web-tree-sitter` to version `0.20.8` to match Node.js environment requirements and compiled WASM grammars, implementing custom tree traversal visitors for JavaScript `function_declaration`, `method_definition`, and `lexical_declaration` nodes.
- [tooling] Refactored `smart-patcher.js` and `generate-repo-map.js` into exportable modules consumed by `SOP/cli.js`, replacing direct `process.exit()` calls with structured custom `Error` objects containing diagnostic `remediation` fields.
- [tooling] Introduced `SOP/tools/config-helper.js` to dynamically resolve repository paths and project metadata using the workspace CWD, allowing the entire SOP utility directory to remain completely universal.
