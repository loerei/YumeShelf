# 02 — Folder Sort Core Styles, Header Option & 4-Language Locales ($B$)

## Epic
[Epic 09.1: Sort by Folder — Core View & Folder Management](file:///d:/Projects/YumeShelf/docs/specs/09.1-sort-by-folder-core/PRD.md)

## Status
ready-for-agent

## Blocked by
- [00 — Preparatory Refactoring: Flat Grid Seam, Core IPC Contracts & Canonical Sort ($S$)](file:///d:/Projects/YumeShelf/docs/specs/09.1-sort-by-folder-core/tickets/00-preparatory-flat-grid-and-core-ipc-seams.md)

## What to Build
> **Scope Guard:** Implement only what is explicitly specified; preserve initial intended UXUI and all unmentioned existing styles, elevation tokens, header controls, and locale keys. Do NOT install `@dnd-kit` or add drag-overlay tokens/locales in this ticket (those belong to Epic 09.2).

Add the shelf-tabs elevation token, create the core folder-sort stylesheet, wire the `'folder'` sort option in `Header.tsx`, and add all non-drag folder-sort localization keys across all 4 locale files:

- [x] 1. **[MODIFY]** [`src/styles/theme.css`](file:///d:/Projects/YumeShelf/src/styles/theme.css) — **Shelf Tabs Elevation Token**:
  - Add `--zIndex-shelf-tabs: 200;` aligned with the existing elevation scale (`--zIndex-dropdown: 1000`, `--zIndex-widget: 1600`, `--zIndex-modal: 2000`, `--zIndex-overlay: 6000`).
- [x] 2. **[NEW]** [`src/styles/folder-sort.css`](file:///d:/Projects/YumeShelf/src/styles/folder-sort.css) & **[MODIFY]** [`src/style.css`](file:///d:/Projects/YumeShelf/src/style.css) — **Dedicated Folder Sort Stylesheet**:
  - Create `src/styles/folder-sort.css` and add `@import "./styles/folder-sort.css";` in [`src/style.css`](file:///d:/Projects/YumeShelf/src/style.css) **after** `settings.css` and **before** `responsive.css` (preserving existing cascade order without touching other stylesheets).
  - **Shelf Tabs Bar**: sticky positioning (`position: sticky; top: 0; z-index: var(--zIndex-shelf-tabs, 200); background-color: var(--bg-color); border-bottom: 1px solid var(--border-color);`), flex-row containment for `.shelf-tabs-bar`, `.shelf-tabs-list` (`role="tablist"`), and `.shelf-tab-scroll-btn`, tab item styling with clean `<button>` UA resets (`color`, `background`, `border`, `font`), active indicator, count badges, overflow scroll buttons (`aria-disabled="true"` styling), and bounded flex truncation on `.shelf-tab` / `.shelf-tab-label` with `flex-shrink: 0` on `.shelf-tab-count`:
    ```css
    .shelf-tabs-bar {
      position: sticky;
      top: 0;
      z-index: var(--zIndex-shelf-tabs, 200);
      display: flex;
      align-items: center;
      gap: 4px;
      background-color: var(--bg-color);
      border-bottom: 1px solid var(--border-color);
    }

    .shelf-tabs-list {
      flex: 1 1 0%;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 6px;
      overflow-x: auto;
      scrollbar-width: none;
    }

    .shelf-tabs-list::-webkit-scrollbar {
      display: none;
    }

    .shelf-tab-scroll-btn {
      flex-shrink: 0;
      background: transparent;
      border: none;
      padding: 6px;
      color: var(--text-sub);
      font: inherit;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      border-radius: 6px;
    }

    .shelf-tab-scroll-btn:hover:not([aria-disabled="true"]) {
      color: var(--text-main);
      background: var(--hover-bg);
    }

    .shelf-tab-scroll-btn:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }

    .shelf-tab-scroll-btn[aria-disabled="true"] {
      opacity: 0.35;
      cursor: default;
    }

    .shelf-tab {
      flex-shrink: 0;
      max-width: 240px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .shelf-tab-label {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .shelf-tab-count {
      flex-shrink: 0;
    }
    ```
  - **Accordion Transitions**: GPU-accelerated CSS Grid rows (`grid-template-rows: 0fr <-> 1fr`), `.is-collapsed` modifier, and chevron rotation using SVG icons bound to `currentColor` with explicit `width`/`height`. Ensure `.folder-section-grid-inner` includes `min-height: 0;` and only applies `overflow: hidden` when `.is-collapsed` or `.is-transitioning` is present, defaulting to `overflow: visible` when expanded and idle. Include `@media (prefers-reduced-motion: reduce)` block disabling transitions for instantaneous (0ms) state changes.
  - **Section Header & Toggle Resets / Truncation**: explicit `<button>` UA resets (`background`, `border`, `color`, `font`, `padding`) on `.folder-section-toggle`, plus `min-width: 0` and ellipsis truncation on `.library-section-header` / `.folder-section-title-slot` with `flex-shrink: 0` on `.folder-section-toggle` and `.library-section-count`:
    ```css
    .library-section-header {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .folder-section-toggle {
      flex-shrink: 0;
      background: transparent;
      border: none;
      padding: 4px;
      color: var(--text-sub);
      font: inherit;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      border-radius: 6px;
    }

    .folder-section-toggle:hover {
      color: var(--text-main);
      background: var(--hover-bg);
    }

    .library-section-count {
      flex-shrink: 0;
    }

    .folder-section-title-slot {
      display: flex;
      align-items: center;
      flex: 0 1 auto;
      min-width: 0;
    }

    .folder-section-title {
      margin: 0;
      font-size: inherit;
      font-weight: inherit;
      min-width: 0;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      border-radius: 4px;
    }

    .folder-section-title[tabindex] {
      cursor: pointer;
    }

    .folder-section-title[tabindex]:hover {
      color: var(--accent);
    }

    .folder-section-title:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }
    ```
  - **Accordion Toolbar**: `.folder-accordion-toolbar` flex layout with gap and button spacing for Expand All / Collapse All (with explicit `<button>` UA resets or reusing `.secondary-btn` / `.small-btn` from `base.css`).
  - **Empty Folder Prompt**: `.empty-folder-prompt` / `.manual-add-btn` spanning all grid columns with explicit `<button>` UA resets (`background`, `border`, `color`, `font`), hover states, and busy state (`aria-busy="true"` / `aria-disabled="true"`):
    ```css
    .empty-folder-prompt,
    .manual-add-btn {
      grid-column: 1 / -1;
      min-height: 120px;
      width: 100%;
      background: transparent;
      color: var(--text-sub);
      font: inherit;
      border: 2px dashed var(--border-color);
      border-radius: 12px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      cursor: pointer;
      transition: border-color 0.2s ease, background-color 0.2s ease, color 0.2s ease;
    }

    .empty-folder-prompt:hover,
    .manual-add-btn:hover {
      border-color: var(--accent);
      background: var(--field-hover-bg);
      color: var(--text-main);
    }

    .manual-add-btn[aria-disabled="true"] {
      opacity: 0.6;
      cursor: wait;
    }
    ```
  - **Inline Title Input**: `.library-section-header .rename-input` scoped styling overriding card-level centered styling (`width: 90%; text-align: center; margin: 0 auto;`) with flex-bounded left alignment and header token styling:
    ```css
    .library-section-header .rename-input {
      flex: 1 1 auto;
      min-width: 0;
      width: auto;
      max-width: 100%;
      margin: 0;
      text-align: left;
    }

    .library-section-header .rename-input[aria-invalid="true"] {
      border-color: var(--danger-btn-bg);
    }
    ```
- [x] 3. **[MODIFY]** Localization JSON Files ([`src/locales/builtins/en.json`](file:///d:/Projects/YumeShelf/src/locales/builtins/en.json), [`src/locales/builtins/ja.json`](file:///d:/Projects/YumeShelf/src/locales/builtins/ja.json), [`src/locales/builtins/zh.json`](file:///d:/Projects/YumeShelf/src/locales/builtins/zh.json), [`language-packs/packs/vi.json`](file:///d:/Projects/YumeShelf/language-packs/packs/vi.json), [`language-packs/templates/en.sample.json`](file:///d:/Projects/YumeShelf/language-packs/templates/en.sample.json)) — **4-Language Schema & Template Parity**:
  - Add identical key sets across all 4 locale files and `language-packs/templates/en.sample.json` (automatically typed on `useLocaleStrings()` via `DefaultLocaleStrings` in [`src/renderer/i18n/locale-strings.ts`](file:///d:/Projects/YumeShelf/src/renderer/i18n/locale-strings.ts)):
  - Folder sorting & accordion: `sort_folder`, `all_folders`, `favorites`, `shelf_folders_aria`, `expand_all`, `collapse_all`, `toggle_folder`, `rename_folder_hint`.
  - Manual game addition: `manual_add_prompt`, `add_game_to_folder`, `no_matching_games_in_folder`, `empty_folder_selecting`.
  - Shelf tabs navigation: `scroll_tabs_left`, `scroll_tabs_right`.
  - Rename & manual-add error toasts: `toast_folder_rename_failed`, `toast_manual_add_failed`, `error_target_not_found`, `error_outside_library`, `error_outside_enclosing_folder`, `error_root_level_executable`, `error_unresolvable_executable`, `error_degraded_database`.
- [x] 4. **[MODIFY]** [`src/renderer/components/Header.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/Header.tsx) & **[MODIFY]** [`src/renderer/components/Header.test.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/Header.test.tsx) — **Add "By Folder" Sort Option**:
  - Add `{ id: 'folder', label: strings.sort_folder || 'By Folder' }` to the `useMemo` `sortOptions` array inside `HeaderView` in `Header.tsx` (the array rendered at runtime, adding `strings.sort_folder` to the `useMemo` dependency list; also sync or remove the unused module-level `SORT_OPTIONS` constant), updating the expected sort-item count in `Header.test.tsx` from `4` to `5` and asserting the `'By Folder'` option while preserving all existing assertions for `date`, `played`, `az`, and `custom`.
- [x] 5. **[NEW]** [`src/renderer/styles/folder-sort.test.ts`](file:///d:/Projects/YumeShelf/src/renderer/styles/folder-sort.test.ts) — **Stylesheet Contract Verification**:
  - Following the `readFileSync` stylesheet contract testing pattern in `src/renderer/components/LibraryGrid.test.tsx:630-647` (resolving stylesheet paths from repo root via `resolve(__dirname, '../../..')` to match the `renderer` project glob `src/renderer/**/*.{test,spec}.{ts,tsx}` in `vitest.config.ts` without modifying shared test harness configuration), assert:
    - `src/styles/theme.css` defines `--zIndex-shelf-tabs:\s*200;`.
    - `src/style.css` contains `@import "./styles/folder-sort.css";` strictly after `@import "./styles/settings.css";` and before `@import "./styles/responsive.css";` (`settingsIdx < folderSortIdx && folderSortIdx < responsiveIdx`).
    - `src/styles/folder-sort.css` defines `.folder-section-grid-inner` with `min-height: 0;` and without unconditional `overflow: hidden` (gating `overflow: hidden` behind `.is-collapsed` / `.is-transitioning`), `@media (prefers-reduced-motion: reduce)`, explicit `<button>` UA resets (`background`, `border`, `color`, `font`) on `.shelf-tab-scroll-btn`, `.folder-section-toggle`, and `.empty-folder-prompt` / `.manual-add-btn`, `.shelf-tabs-list` (`flex: 1 1 0%`, `min-width: 0`, `overflow-x: auto`) and `.shelf-tab-scroll-btn` (`flex-shrink: 0`), `.folder-section-title-slot` (`min-width: 0`), `.folder-section-title` (`text-overflow: ellipsis; white-space: nowrap;`), `.library-section-header .rename-input[aria-invalid="true"]` (`border-color: var(--danger-btn-bg)`), `.shelf-tab-label` (`text-overflow: ellipsis`), and `flex-shrink: 0` on `.folder-section-toggle`, `.library-section-count`, and `.shelf-tab-count`.

## Acceptance Criteria
- [x] `--zIndex-shelf-tabs: 200` is defined in `src/styles/theme.css`.
- [x] `src/styles/folder-sort.css` is created and imported in `src/style.css` after `settings.css` and before `responsive.css`, with `.folder-section-grid-inner` including `min-height: 0;` and applying `overflow: hidden` only under `.is-collapsed` or `.is-transitioning`, reduced-motion bypass, and explicit `<button>` UA resets (`background`, `border`, `color`, `font`) covering shelf tab items, `.shelf-tab-scroll-btn`, `.folder-section-toggle`, `.folder-accordion-toolbar button` (or `.secondary-btn`/`.small-btn`), and `.empty-folder-prompt` / `.manual-add-btn`.
- [x] *Given* `.shelf-tabs-bar` contains left/right `.shelf-tab-scroll-btn` controls and `.shelf-tabs-list` (`role="tablist"`), *when* the combined width of `.shelf-tab` items exceeds the window width, *then* `.shelf-tabs-list` (`flex: 1 1 0%; min-width: 0; overflow-x: auto;`) constrains its layout width (`scrollWidth > clientWidth`) and both `.shelf-tab-scroll-btn` controls (`flex-shrink: 0`) remain visible and clickable within the window bounds.
- [x] *Given* a folder section or shelf tab with a long unbroken `displayName`, *when* rendered in `folder-sort.css`, *then* `.folder-section-title-slot` (`display: flex; align-items: center; flex: 0 1 auto; min-width: 0;`), `.folder-section-title` (`margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;` plus `:focus-visible` outline unclipped by the slot wrapper), `.library-section-header .rename-input[aria-invalid="true"]` (`border-color: var(--danger-btn-bg);`), and `.shelf-tab-label` apply ellipsis truncation with `min-width: 0`, and adjacent toggle/count badges (`.folder-section-toggle`, `.library-section-count`, `.shelf-tab-count`) apply `flex-shrink: 0`.
- [x] `src/renderer/styles/folder-sort.test.ts` enforces the CSS elevation token, `src/style.css` import ordering, conditional overflow/reduced-motion rules, UA resets, and truncation/flex-shrink contracts.
- [x] `"By Folder"` (`folder`) sort option is wired in `Header.tsx` via `useLocaleStrings().sort_folder` with `Header.test.tsx` passing.
- [x] All 4 localization files (`en.json`, `ja.json`, `zh.json`, `vi.json`) and `language-packs/templates/en.sample.json` contain identical new key sets including `favorites`.
- [x] Execute automated verification command: `npm run test:vitest -- src/renderer/components/Header.test.tsx src/renderer/i18n/locale-strings.test.ts src/renderer/styles/folder-sort.test.ts && npm run typecheck`.

## Verification Command
```bash
npm run test:vitest -- src/renderer/components/Header.test.tsx src/renderer/i18n/locale-strings.test.ts src/renderer/styles/folder-sort.test.ts && npm run typecheck
```
