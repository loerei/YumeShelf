# 01 — Headless Library Section Projections & Library Stacks Custom Order ($B$)

## Epic
[Epic 09.1: Sort by Folder — Core View & Folder Management](file:///d:/Projects/YumeShelf/docs/specs/09.1-sort-by-folder-core/PRD.md)

## Status
ready-for-agent

## Blocked by
- [00 — Preparatory Refactoring: Flat Grid Seam, Core IPC Contracts & Canonical Sort ($S$)](file:///d:/Projects/YumeShelf/docs/specs/09.1-sort-by-folder-core/tickets/00-preparatory-flat-grid-and-core-ipc-seams.md)

## What to Build
> **Scope Guard:** Implement only what is explicitly specified; preserve initial intended UXUI and all unmentioned existing behaviors (including existing flat sort modes `date`, `played`, `az`, `custom`). Do NOT alter, restyle, or remove anything unasked.

Implement the pure, strictly-typed headless domain projection module `src/renderer/library/library-sections.ts` and update `src/renderer/library-stacks.ts` for projecting library sections across all view modes and shelf tabs:

- [ ] 1. **[NEW]** [`src/renderer/library/library-sections.ts`](file:///d:/Projects/YumeShelf/src/renderer/library/library-sections.ts) — **`mapGameToRootFolder(game: GameEntry | LibraryViewItem, rootPathsOrCanonicalRoots: readonly string[], targetPlatform?: PlatformInput): string | null`**:
  - Define exact exported TypeScript interfaces using `LibraryViewItem` (from [`src/renderer/library-stacks.ts`](file:///d:/Projects/YumeShelf/src/renderer/library-stacks.ts)) with zero `any` types:
    ```ts
    export interface FolderSection {
      readonly path: string;
      readonly displayName: string;
      readonly games: readonly LibraryViewItem[];
      readonly isEmpty: boolean;
      readonly isCollapsible: boolean;
    }

    export interface ProjectLibrarySectionsParams {
      readonly items: readonly LibraryViewItem[];
      readonly currentSort: string;
      readonly activeTabId: string;
      readonly rootPaths: readonly string[];
      readonly folderAliases?: Readonly<Record<string, string>>;
      readonly targetPlatform?: PlatformInput;
    }

    export interface LibrarySectionsProjection {
      readonly effectiveTabId: string;
      readonly favoritesSection?: readonly LibraryViewItem[];
      readonly allGamesSection?: readonly LibraryViewItem[];
      readonly folderSections?: readonly FolderSection[];
      readonly allFolderSections?: readonly FolderSection[];
    }
    ```
  - Accepts pre-computed canonical roots (`canonicalRoots: readonly string[]`) or resolves canonical roots by pre-normalizing `[...rootPaths]` to NFC when `resolvePlatform(targetPlatform) === 'darwin'` before calling `subsumeLibraryPaths(..., targetPlatform)` and evaluating path containment via `normalizeLibraryPath` (segment-boundary prefix matching on NFC-normalized `darwin` paths without altering `src/shared/path-subsumption.ts` contracts).
  - Guard against duplicate trailing separators on drive roots (`const rootWithSep = normRoot.endsWith(sep) ? normRoot : (normRoot + sep);`), ensuring drive roots like `C:/` or `D:/` match direct children without double-separator distortion.
  - Defensively checks for mascot cards or missing folder paths using a local narrow type (`type MascotAwareGameEntry = GameEntry & { readonly isMascotCard?: boolean }`) rather than accessing an undeclared `GameEntry.isMascotCard` field (`const targetGame: MascotAwareGameEntry | undefined = 'primaryGame' in game ? game.primaryGame : game; if (!targetGame || targetGame.isMascotCard || !targetGame.folderPath) return null;`), supporting both `LibraryViewItem` stack items and raw `GameEntry` items.
- [ ] 2. **[NEW]** [`src/renderer/library/library-sections.ts`](file:///d:/Projects/YumeShelf/src/renderer/library/library-sections.ts) — **`projectLibrarySections(params: ProjectLibrarySectionsParams): LibrarySectionsProjection` & `selectFolderTabProjection`**:
  - Define and export `normalizeLibraryPath(p: string, targetPlatform?: PlatformInput): string` that applies `.normalize('NFC')` when `resolvePlatform(targetPlatform) === 'darwin'` before calling `normalizePathForPlatform(p, targetPlatform)`, and extract internal pre-normalized root descriptor helpers (`NormalizedRootEntry`, `prepareNormalizedRoots`, `matchNormalizedRoot`) so `projectLibrarySections` pre-normalizes `rootPaths` to NFC on `darwin` before computing `canonicalRoots = subsumeLibraryPaths(normalizedInputRoots, params.targetPlatform)` once, calls `prepareNormalizedRoots(canonicalRoots, params.targetPlatform)` once ($O(K)$), pre-normalizes `params.folderAliases` keys once into a `Map<string, string>` ($O(M)$) via `normalizeLibraryPath` rather than scanning `Object.entries(folderAliases)` per canonical root ($O(K \cdot M)$), and groups `params.items` into a `Map<string, LibraryViewItem[]>` in a single $O(N)$ pass via `matchNormalizedRoot` ($O(N + K^2 + M)$ total path normalizations rather than $O(N \cdot K^2)$ or $O(N \cdot K)$, while keeping exported `mapGameToRootFolder` self-contained and NFC-aware for single-item callers):
    ```ts
    export function normalizeLibraryPath(p: string, targetPlatform?: PlatformInput): string {
      if (typeof p !== 'string') return '';
      const input = resolvePlatform(targetPlatform) === 'darwin' ? p.normalize('NFC') : p;
      return normalizePathForPlatform(input, targetPlatform);
    }

    interface NormalizedRootEntry {
      readonly rawRoot: string;
      readonly normRoot: string;
      readonly prefix: string;
    }

    function prepareNormalizedRoots(
      canonicalRoots: readonly string[],
      targetPlatform?: PlatformInput
    ): readonly NormalizedRootEntry[] {
      const entries: NormalizedRootEntry[] = [];
      for (const rawRoot of canonicalRoots) {
        const normRoot = normalizeLibraryPath(rawRoot, targetPlatform);
        if (!normRoot) continue;
        const prefix = normRoot.endsWith('/') ? normRoot : `${normRoot}/`;
        entries.push({ rawRoot, normRoot, prefix });
      }
      return entries;
    }

    function matchNormalizedRoot(
      rawFolderPath: string,
      normalizedRoots: readonly NormalizedRootEntry[],
      targetPlatform?: PlatformInput
    ): string | null {
      const normGame = normalizeLibraryPath(rawFolderPath, targetPlatform);
      if (!normGame) return null;
      for (const entry of normalizedRoots) {
        if (normGame === entry.normRoot || normGame.startsWith(entry.prefix)) {
          return entry.rawRoot;
        }
      }
      return null;
    }
    ```
  - Apply `normalizeLibraryPath` (with `.normalize('NFC')` when `resolvePlatform(targetPlatform) === 'darwin'`) uniformly across **all** path inputs — `game.folderPath` / `rawFolderPath`, `rootPaths` (including `subsumeLibraryPaths` ingress), `activeTabId`, and `folderAliases` keys — so macOS APFS/HFS+ NFD-decomposed directory names match NFC-encoded `LibraryConfig` paths and NFD/NFC duplicate or parent/child roots deduplicate and subsume cleanly.
  - Iterates over `canonicalRoots` (not raw `params.rootPaths`) when generating `folderSections` for the `'all'` shelf tab:
    - **Non-folder sorts** (`date`, `played`, `az`, `custom`): `{ effectiveTabId: params.activeTabId, favoritesSection, allGamesSection }`.
    - **Folder sort** (`folder`):
      - Populate `allFolderSections` with the complete canonical `FolderSection` list across all `'folder'` tab states (`'all'`, `'fav'`, `'<folder-id>'`, and fallback `'all'`) so `ShelfTabs` always renders all folder tabs regardless of which tab is active, while keeping `folderSections` tab-scoped for `FolderAccordion`.
      - **Tab `all`**: `{ effectiveTabId: 'all', favoritesSection, folderSections, allFolderSections }` where each `FolderSection` has `path`, `displayName` (resolved safely via own-property check passing `params.targetPlatform` against `folderAliases`, falling back to exported `export function getFolderBaseName(folderPath: string): string` whenever no alias exists or `alias.trim() === ''`, where `getFolderBaseName('/')` returns `'/'` rather than `''` after stripping trailing separators), `games: readonly LibraryViewItem[]`, `isEmpty`, `isCollapsible: true`. Favorited games appear in both favorites and folder sections (dual placement). Subsumed child paths are aggregated under their ancestor root.
      - **Tab `fav`**: `{ effectiveTabId: 'fav', favoritesSection, allFolderSections }` (falling back to `'all'` when `favoritesSection` is empty).
      - **Tab `<folder-id>`**: single folder section with `isCollapsible: false` and `effectiveTabId` equal to the matched canonical root path, alongside `allFolderSections`. If `activeTabId` is neither `'all'` nor `'fav'` and does not match any valid folder path in `canonicalRoots` (evaluated via `normalizeLibraryPath`), safely fall back to projecting the `'all'` tab view (`{ effectiveTabId: 'all', favoritesSection, folderSections, allFolderSections }`).
    - Export a lightweight $O(K)$ helper `selectFolderTabProjection(baseProjection: LibrarySectionsProjection, activeTabId: string, targetPlatform?: PlatformInput): LibrarySectionsProjection` encapsulating `'all'`, `'fav'` (falling back to `baseProjection` when `favoritesSection` is empty), and `normalizeLibraryPath`-matched `<folder-id>` resolution (returning `{ effectiveTabId: matched.path, favoritesSection, folderSections: [{ ...matched, isCollapsible: false }], allFolderSections }` on match, or `baseProjection` on fallback) so UI coordinators (`LibraryGrid.tsx`) reuse the exact headless tab-projection logic without duplicating path normalization.
    - Defensively handles mascot cards (`isMascotCard: true` via `MascotAwareGameEntry`), keeping them visible in flat sorts without throwing unhandled path errors.
- [ ] 3. **[MODIFY]** [`src/renderer/library-stacks.ts`](file:///d:/Projects/YumeShelf/src/renderer/library-stacks.ts):
  - In `buildLibraryViewItems` and `compareGames` (which already pre-indexes `orderIndex: ReadonlyMap<string, number> | null`), extend the custom-order branch from `type === 'custom'` to `type === 'custom' || type === 'folder'`, bounding sorting complexity to $O(N \log N)$ and ensuring unmapped game keys resolve to `Number.MAX_SAFE_INTEGER`. (Coordinator `LibraryGrid.tsx` extends its `customOrder` resolution gate to `currentSort === 'custom' || currentSort === 'folder'` in Ticket `04`.)
  - Export a new helper `getGroupedKeysForGame(targetGame: GameEntry | LibraryViewItem): string[]` returning all sibling game keys alongside the primary key, deduplicated.
- [ ] 4. **[NEW]** [`src/renderer/library/library-sections.test.ts`](file:///d:/Projects/YumeShelf/src/renderer/library/library-sections.test.ts) & **[MODIFY]** [`src/renderer/library-stacks.test.ts`](file:///d:/Projects/YumeShelf/src/renderer/library-stacks.test.ts) — **Vitest Unit Tests**:
  - `library-sections.test.ts` (explicit Given-When-Then unit tests with concrete expected literals):
    1. Dual favorite game placement in top section and owning folder section.
    2. Empty folder placeholder projection.
    3. Active tab filtering (`all`, `fav`, individual folder ID), retention of `allFolderSections` across `'fav'` and `<folder-id>` tabs, fallback to `'all'` tab when `activeTabId` refers to an invalid folder path, and direct unit tests on `selectFolderTabProjection` for `'fav'` empty fallback and invalid `<folder-id>` fallback.
    4. Folder display name resolution with `folderAliases` own-property lookup (including whitespace-only alias fallback `{ 'C:/Games': '   ' }` -> `getFolderBaseName('C:/Games') === 'Games'`) and POSIX root `getFolderBaseName('/') === '/'`.
    5. MultiOS in-memory virtual testing across Windows, Linux, and macOS.
    6. Nested parent/child library path subsumption aggregation under ancestor roots.
    7. **Drive-root trailing separator boundary**: `mapGameToRootFolder` with `rootPaths: ['C:/']` and a game at `C:/GameA` (and `C:\\GameA`) returns `'C:/'` without double-separator distortion.
    8. **Mascot card & missing `folderPath` boundary**: `mapGameToRootFolder` returns `null` for `{ ...game, isMascotCard: true }` and `{ ...game, folderPath: undefined }`, and `projectLibrarySections` keeps mascot cards in flat sorts without throwing.
    9. **Case-variant, separator-variant, and prototype-key normalization boundaries**: `projectLibrarySections` resolves `activeTabId` (e.g. `'C:\\Games\\'` matching canonical root `'c:/games'` under `targetPlatform: 'win32'`, and case-sensitive mismatch falling back to `'all'` under `targetPlatform: 'linux'`) and `folderAliases` own-property lookup (including non-polluting lookup for `'constructor'` / `'toString'` keys).
    10. **macOS Unicode NFC/NFD boundary**: Under `targetPlatform: 'darwin'`, NFD-decomposed `game.folderPath` (e.g. `"/Users/me/Games/e\u0301/GameA"`) matches NFC-encoded `rootPaths` (`"/Users/me/Games/\u00e9"`) in both `mapGameToRootFolder` and `projectLibrarySections`, NFD/NFC `rootPaths` deduplicate/subsume cleanly at `subsumeLibraryPaths` ingress, and NFD-decomposed `folderAliases` / `activeTabId` inputs match NFC-encoded `LibraryConfig` paths cleanly.
  - `library-stacks.test.ts`: Sorting determinism for `folder` sort mode with $O(1)$ pre-indexed `customOrder` and `getGroupedKeysForGame` for multi-instance games, preserving all existing test cases.

## Acceptance Criteria
- [ ] `FolderSection`, `ProjectLibrarySectionsParams`, and `LibrarySectionsProjection` (using `LibraryViewItem` and `effectiveTabId`) are exported with zero `any` types and `MascotAwareGameEntry` narrow guard.
- [ ] `mapGameToRootFolder` extracts root folders accurately for single games (including drive roots `'C:/'` without double-separator distortion and `darwin` NFC/NFD normalization on `game.folderPath` and `rootPaths` ingress) and multi-instance stacks across Windows, Linux, and macOS, returning `null` for `isMascotCard: true` and missing `folderPath` with strict TypeScript types (zero `any`).
- [ ] `projectLibrarySections` and `selectFolderTabProjection` use exported `normalizeLibraryPath` and pre-normalized root/alias descriptors (`prepareNormalizedRoots`, `matchNormalizedRoot`, and $O(M)$ `Map<string, string>` for `folderAliases`, bounding total path normalizations to $O(N + K^2 + M)$), pre-normalize `rootPaths` to NFC on `darwin` before `subsumeLibraryPaths`, project sections for `'all'`, `'fav'`, and individual folder tabs with dual favorite placement, populate `allFolderSections` with all canonical folder sections in `'folder'` sort mode regardless of active tab, resolve platform-sensitive case/separator-variant `activeTabId` and `game.folderPath` (including `darwin` NFC/NFD normalization) and own-property `folderAliases` lookups safely (including `'constructor'`/`'toString'`), and keep mascot cards in flat sorts without throwing.
- [ ] Subsumed child folder paths are aggregated under their ancestor root without orphan sections.
- [ ] `compareGames` supports `folder` sort using $O(1)$ pre-indexed `customOrder`, and `getGroupedKeysForGame` is exported and tested.
- [ ] Execute automated verification command: `npm run test:vitest -- src/renderer/library/library-sections.test.ts src/renderer/library-stacks.test.ts && npm run typecheck`.

## Verification Command
```bash
npm run test:vitest -- src/renderer/library/library-sections.test.ts src/renderer/library-stacks.test.ts && npm run typecheck
```
