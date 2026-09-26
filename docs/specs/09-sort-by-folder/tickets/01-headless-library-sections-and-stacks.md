# 01 — Headless Library Section Projections & Library Stacks Custom Order ($B$)

## Epic
[Epic 09: Sort by Folder](file:///d:/Projects/YumeShelf/docs/specs/09-sort-by-folder/PRD.md)

## What to build
Implement the pure, headless domain projection module `src/renderer/library/library-sections.ts` and update `src/renderer/library-stacks.ts` for projecting library sections across all view modes and shelf tabs:
1. **`mapGameToRootFolder(game, rootPathsOrCanonicalRoots, targetPlatform)`**:
   - Accepts pre-computed canonical roots (`canonicalRoots: string[]`) or resolves canonical roots via `subsumeLibraryPaths(rootPaths, targetPlatform)` before evaluating path containment via `isSubsumedBy(gamePath, root, targetPlatform)` from [`src/shared/path-subsumption.ts`](file:///d:/Projects/YumeShelf/src/shared/path-subsumption.ts).
   - Guard against duplicate trailing separators on drive roots (`const rootWithSep = normRoot.endsWith(sep) ? normRoot : (normRoot + sep);`), ensuring drive roots like `C:/` or `D:/` match direct children without double-separator distortion.
   - Defensively checks for mascot cards or missing folder paths (`const targetGame = game?.primaryGame || game; if (!targetGame || targetGame.isMascotCard || !targetGame.folderPath) return null;`), supporting both multi-instance stack items and raw game entries.
2. **`projectLibrarySections(params)`**:
   - Computes canonical roots via `subsumeLibraryPaths(params.rootPaths, params.targetPlatform)` and iterates over `canonicalRoots` (not raw `params.rootPaths`) when generating `folderSections` for the `'all'` shelf tab:
     - **Non-folder sorts** (`date`, `played`, `az`, `custom`): `{ favoritesSection, allGamesSection }`.
     - **Folder sort** (`folder`):
       - **Tab `all`**: `{ favoritesSection, folderSections }` where each folder section has `path`, `displayName` (resolved safely via own-property check passing `params.targetPlatform`: `const normalizedKey = normalizePathForPlatform(path, params.targetPlatform); (folderAliases && Object.prototype.hasOwnProperty.call(folderAliases, normalizedKey) && folderAliases[normalizedKey]?.trim()) ? folderAliases[normalizedKey].trim() : getFolderBaseName(path)`), `games`, `isEmpty`, `isCollapsible: true`. Favorited games appear in both favorites and folder sections (dual placement). Subsumed child paths are aggregated under their ancestor root.
       - **Tab `fav`**: `{ favoritesSection }`.
       - **Tab `<folder-id>`**: single folder section with `isCollapsible: false`. If `activeTabId` is neither `'all'` nor `'fav'` and does not match any valid folder path in `canonicalRoots` (evaluated via platform-normalized comparison), safely fall back to projecting the `'all'` tab view (`{ favoritesSection, folderSections }`).
     - Defensively handles mascot cards (`isMascotCard: true`), keeping them visible in flat sorts without throwing unhandled path errors.
3. **`src/renderer/library-stacks.ts`**:
   - In `buildLibraryViewItems`, when `type === 'custom' || type === 'folder'`, normalize and supply `customOrder`. Pre-index `customOrder` into an $O(1)$ key-to-index lookup `Map<string, number>` prior to sorting, bounding sorting complexity strictly to $O(N \log N)$ and preventing main-thread event loop freezes.
   - In `compareGames`, sort games using $O(1)$ map lookups against pre-indexed `customOrder` so that card reordering within folder containers persists and projects deterministically instead of reverting to alphabetical order on re-render. Guarantee that unmapped game keys resolve to `Number.MAX_SAFE_INTEGER`.
   - Update `getGroupedKeysForGame(targetGame: GameEntry): string[]` to inspect `targetGame.instances` when present, returning an array of all sibling keys alongside the primary key, deduplicated.

## Blocked by
- [Epic 07: Storage Schema Migration & Domain Core](file:///d:/Projects/YumeShelf/docs/specs/07-storage-schema-migration-and-domain-core/PRD.md)
- [Epic 08: React & Virtual DOM Migration Foundation](file:///d:/Projects/YumeShelf/docs/specs/08-react-migration/PRD.md)

## Status
todo

## Target Files

### [NEW] [`src/renderer/library/library-sections.ts`](file:///d:/Projects/YumeShelf/src/renderer/library/library-sections.ts)
- Pure, headless projection module:
  - `mapGameToRootFolder(game: any, rootPathsOrCanonicalRoots: string[], targetPlatform?: PlatformInput): string | null`
  - `projectLibrarySections(params: { allGames: any[]; favorites: any[]; rootPaths: string[]; folderAliases?: Record<string, string>; activeTabId: string; sortType: string; targetPlatform?: PlatformInput; }): { favoritesSection?: any; allGamesSection?: any; folderSections?: any[]; }`

### [NEW] [`src/renderer/library/library-sections.test.ts`](file:///d:/Projects/YumeShelf/src/renderer/library/library-sections.test.ts)
- Comprehensive Vitest unit tests:
  1. Dual favorite game placement in top section and owning folder section.
  2. Empty folder placeholder projection.
  3. Active tab filtering (`all`, `fav`, individual folder ID) and fallback to `'all'` tab when `activeTabId` refers to an invalid folder path.
  4. Folder display name resolution with `folderAliases` lookup verifying own properties (`Object.prototype.hasOwnProperty.call`).
  5. MultiOS in-memory virtual testing across Windows, Linux, and macOS.
  6. Nested parent/child library path subsumption aggregation under ancestor roots.

### [MODIFY] [`src/renderer/library-stacks.ts`](file:///d:/Projects/YumeShelf/src/renderer/library-stacks.ts)
- Update `buildLibraryViewItems` and `compareGames` to support `folder` sort mode with $O(1)$ pre-indexed `customOrder`.
- Update `getGroupedKeysForGame` to inspect `targetGame.instances`.

### [NEW] [`src/renderer/library-stacks.test.ts`](file:///d:/Projects/YumeShelf/src/renderer/library-stacks.test.ts)
- Comprehensive Vitest unit tests for sorting determinism and grouped keys.

## Acceptance Criteria
- [ ] `mapGameToRootFolder` extracts root folders accurately for single games and multi-instance stacks across Windows, Linux, and macOS.
- [ ] `projectLibrarySections` projects sections for `'all'`, `'fav'`, and individual folder tabs with dual favorite placement.
- [ ] Subsumed child folder paths are aggregated under their ancestor root without orphan sections.
- [ ] `compareGames` in `library-stacks.ts` supports `folder` sort using $O(1)$ pre-indexed `customOrder`.
- [ ] `npm run test:vitest -- src/renderer/library/library-sections.test.ts src/renderer/library-stacks.test.ts` and `npm run typecheck` pass cleanly.

## Verification Command
```bash
npm run test:vitest -- src/renderer/library/library-sections.test.ts src/renderer/library-stacks.test.ts && npm run typecheck
```
