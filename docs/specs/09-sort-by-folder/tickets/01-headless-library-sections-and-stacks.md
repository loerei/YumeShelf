# 01 — Headless Library Section Projections & Library Stacks Custom Order ($B$)

## Epic
[Epic 09: Sort by Folder](file:///d:/Projects/YumeShelf/docs/specs/09-sort-by-folder/PRD.md)

## What to build
> **Scope Guard:** Implement only what is explicitly specified; preserve initial intended UXUI and all unmentioned existing behaviors (including existing flat sort modes `date`, `played`, `az`, `custom`). Do NOT alter, restyle, or remove anything unasked.

Implement the pure, strictly-typed headless domain projection module `src/renderer/library/library-sections.ts` and update `src/renderer/library-stacks.ts` for projecting library sections across all view modes and shelf tabs:
- [ ] 1. **[NEW]** [`src/renderer/library/library-sections.ts`](file:///d:/Projects/YumeShelf/src/renderer/library/library-sections.ts) — **`mapGameToRootFolder(game: GameEntry | LibraryViewItem, rootPathsOrCanonicalRoots: readonly string[], targetPlatform?: PlatformInput): string | null`**:
   - Define exported TypeScript interfaces (`FolderSection`, `LibrarySectionsProjection`, `ProjectLibrarySectionsParams`) with zero `any` types.
   - Accepts pre-computed canonical roots (`canonicalRoots: readonly string[]`) or resolves canonical roots via `subsumeLibraryPaths(rootPaths, targetPlatform)` before evaluating path containment via `isSubsumedBy(gamePath, root, targetPlatform)` from [`src/shared/path-subsumption.ts`](file:///d:/Projects/YumeShelf/src/shared/path-subsumption.ts).
   - Guard against duplicate trailing separators on drive roots (`const rootWithSep = normRoot.endsWith(sep) ? normRoot : (normRoot + sep);`), ensuring drive roots like `C:/` or `D:/` match direct children without double-separator distortion.
   - Defensively checks for mascot cards or missing folder paths (`const targetGame = 'primaryGame' in game ? game.primaryGame : game; if (!targetGame || targetGame.isMascotCard || !targetGame.folderPath) return null;`), supporting both `LibraryViewItem` stack items and raw `GameEntry` items.
- [ ] 2. **[NEW]** [`src/renderer/library/library-sections.ts`](file:///d:/Projects/YumeShelf/src/renderer/library/library-sections.ts) — **`projectLibrarySections(params: ProjectLibrarySectionsParams): LibrarySectionsProjection`**:
   - Computes canonical roots via `subsumeLibraryPaths(params.rootPaths, params.targetPlatform)` and iterates over `canonicalRoots` (not raw `params.rootPaths`) when generating `folderSections` for the `'all'` shelf tab:
     - **Non-folder sorts** (`date`, `played`, `az`, `custom`): `{ favoritesSection, allGamesSection }`.
     - **Folder sort** (`folder`):
       - **Tab `all`**: `{ favoritesSection, folderSections }` where each folder section has `path`, `displayName` (resolved safely via own-property check passing `params.targetPlatform`: `const normalizedKey = normalizePathForPlatform(path, params.targetPlatform); (folderAliases && Object.prototype.hasOwnProperty.call(folderAliases, normalizedKey) && folderAliases[normalizedKey]?.trim()) ? folderAliases[normalizedKey].trim() : getFolderBaseName(path)`), `games`, `isEmpty`, `isCollapsible: true`. Favorited games appear in both favorites and folder sections (dual placement). Subsumed child paths are aggregated under their ancestor root.
       - **Tab `fav`**: `{ favoritesSection }`.
       - **Tab `<folder-id>`**: single folder section with `isCollapsible: false`. If `activeTabId` is neither `'all'` nor `'fav'` and does not match any valid folder path in `canonicalRoots` (evaluated via platform-normalized comparison), safely fall back to projecting the `'all'` tab view (`{ favoritesSection, folderSections }`).
     - Defensively handles mascot cards (`isMascotCard: true`), keeping them visible in flat sorts without throwing unhandled path errors.
- [ ] 3. **[MODIFY]** [`src/renderer/library-stacks.ts`](file:///d:/Projects/YumeShelf/src/renderer/library-stacks.ts):
   - In `buildLibraryViewItems` and `compareGames` (which already pre-indexes `orderIndex: ReadonlyMap<string, number> | null`), extend the custom-order branch from `type === 'custom'` to `type === 'custom' || type === 'folder'`, bounding sorting complexity to $O(N \log N)$ and ensuring unmapped game keys resolve to `Number.MAX_SAFE_INTEGER`.
   - Ensure `getGroupedKeysForGame(targetGame: GameEntry | LibraryViewItem): string[]` returns all sibling game keys alongside the primary key, deduplicated.
- [ ] 4. **[NEW]** [`src/renderer/library/library-sections.test.ts`](file:///d:/Projects/YumeShelf/src/renderer/library/library-sections.test.ts) & **[MODIFY]** [`src/renderer/library-stacks.test.ts`](file:///d:/Projects/YumeShelf/src/renderer/library-stacks.test.ts) — **Vitest Unit Tests**:
   - `library-sections.test.ts`: (1) Dual favorite game placement in top section and owning folder section, (2) Empty folder placeholder projection, (3) Active tab filtering (`all`, `fav`, individual folder ID) and fallback to `'all'` tab when `activeTabId` refers to an invalid folder path, (4) Folder display name resolution with `folderAliases` lookup verifying own properties (`Object.prototype.hasOwnProperty.call`), (5) MultiOS in-memory virtual testing across Windows, Linux, and macOS, (6) Nested parent/child library path subsumption aggregation under ancestor roots.
   - `library-stacks.test.ts`: Sorting determinism for `folder` sort mode with $O(1)$ pre-indexed `customOrder` and grouped keys for multi-instance games, preserving all existing test cases.

## Blocked by
- [Epic 07: Storage Schema Migration & Domain Core](file:///d:/Projects/YumeShelf/docs/specs/07-storage-schema-migration-and-domain-core/PRD.md)
- [Epic 08: React & Virtual DOM Migration Foundation](file:///d:/Projects/YumeShelf/docs/specs/08-react-migration/PRD.md)

## Status
todo

## Acceptance Criteria
- [ ] `mapGameToRootFolder` extracts root folders accurately for single games and multi-instance stacks across Windows, Linux, and macOS with strict TypeScript types (zero `any`).
- [ ] `projectLibrarySections` projects sections for `'all'`, `'fav'`, and individual folder tabs with dual favorite placement.
- [ ] Subsumed child folder paths are aggregated under their ancestor root without orphan sections.
- [ ] `compareGames` in `library-stacks.ts` supports `folder` sort using $O(1)$ pre-indexed `customOrder` with `Number.MAX_SAFE_INTEGER` fallback.
- [ ] `npm run test:vitest -- src/renderer/library/library-sections.test.ts src/renderer/library-stacks.test.ts` and `npm run typecheck` pass cleanly.

## Verification Command
```bash
npm run test:vitest -- src/renderer/library/library-sections.test.ts src/renderer/library-stacks.test.ts && npm run typecheck
```
