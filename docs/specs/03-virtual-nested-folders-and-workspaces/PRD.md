# PRD 03: Virtual Nested Folders (App Folders) & Dual Workspace Views ("Favorite Desk" vs "Library")

## Problem Statement

Power users who maintain large collections of visual novels, RPGs, and indie games often organize their libraries into deep mental hierarchies (such as `Genre -> Studio -> Game Series -> Versions`). 

Currently, achieving this level of organization on disk requires users to manually create nested directories, extract nested archives, and rename files. However, having a launcher physically manipulate or move files on disk introduces severe risks: path length limit violations (e.g. Windows `MAX_PATH` 260-character ceiling), disk space exhaustion during extraction, archive password friction, and irreversible corruption of the user's custom directory structure.

Furthermore, as game libraries scale beyond 50+ titles, a flat grid view with pinned favorites becomes cluttered and overwhelming. Users lack a dedicated, distraction-free space for actively played or favorite games while maintaining a comprehensive, structured archive for their full collection.

## Preparatory Refactoring & Architectural Governance

### 4-Axis Codebase Readiness Scorecard
| Quality Axis | Pre-Refactor Friction Diagnosed | Target Architecture Seam |
| :--- | :--- | :--- |
| **Maintainability** | Uncoordinated direct `fs.writeFile` in `saveDB` invoked across `actions.ts`, `config.ts`, `loader.ts` without serialization. | `AtomicWriteCoordinator` in `src/main/library-state/write-coordinator.ts` with in-memory state caching and synchronous shutdown flush. |
| **Extensibility** | Tree domain models and cycle validation buried inside renderer modules, inaccessible to main process rescan loader per `tsconfig.main.json`. | Headless shared module `src/shared/virtual-tree/` containing pure data types, invariants, and reducers. |
| **Debuggability** | Gesture timing, velocity thresholds, and windowing bounds hardcoded inside DOM event listeners in `drag-drop-grid.ts`. | Headless utility seams `gesture-timer.ts` and `virtual-grid-windowing.ts` with injectable `IClock` and options parameters. |
| **Updatability** | Strict whitelist in `normalizeLibraryConfigShape` discards undeclared settings, wiping new view preferences on rescan. | Explicitly whitelisted `legacyMode` and `activeWorkspaceMode` properties in `LibraryConfig`. |

### Architectural Transition Mapping (3-Dimension Taxonomy)
| Architectural Dimension | Current Tangled Landing Zone | Proposed Paved Landing Zone |
| :--- | :--- | :--- |
| **Module Structure** | Uncoordinated `saveDB` in `src/main/library-state/index.ts:72-83` writing directly to disk via `fs.writeFile`; tree domain logic and invariants absent from codebase. | Deep module `[NEW] src/main/library-state/write-coordinator.ts` (`AtomicWriteCoordinator`); pure shared domain package `[NEW] src/shared/virtual-tree/` (`types.ts`, `invariants.ts`, `manager.ts`). |
| **Dependency Path** | Scattered pointer listeners directly in `src/renderer/drag-drop-grid.ts`; unwindowed full-catalog DOM rendering in `src/renderer/library-grid.ts`. | Decoupled execution paths isolated behind parameter seams: `[NEW] src/renderer/utils/gesture-timer.ts` (`IClock`) and `[NEW] src/renderer/utils/virtual-grid-windowing.ts` (`WindowingOptions`). |
| **Code Locations** | Tangled persistence calls across `actions.ts`, `config.ts`, `loader.ts` risking concurrent read-modify-write races; undeclared properties dropped by `scanner.ts` whitelist. | Concentrated locality through `libraryState.saveDB()` / `mutate()` and `libraryState.flushSync()`; normalized whitelist in `normalizeLibraryConfigShape`. |

### Kent Beck Tidying Execution Sequence ($S \to B$)

#### Phase 1 Preparatory Tidying
1. **$S$ Structural Tidying (Ticket 01.1.1)**: Extract `AtomicWriteCoordinator` (*New Interface, Old Impl*) into `src/main/library-state/write-coordinator.ts` and route all `saveDB` and `loadDB` operations through it with `flushSync()` on `app.on('before-quit')`.
2. **$S$ Structural Tidying (Ticket 03.1.1)**: Author pure headless `[NEW] src/shared/virtual-tree/types.ts` and `[NEW] src/shared/virtual-tree/invariants.ts` (*Extract Helper*) with shared types, root immutability, cycle detection, and depth clamping.
3. **$S$ Structural Tidying (Ticket 03.1.2)**: Author pure headless `[NEW] src/shared/virtual-tree/manager.ts` (*Extract Helper*) implementing `VirtualTreeManager` mutations and `findAncestryPath`.
4. **$B$ Behavioral Change (Ticket 01.1.2)**: Extend `DatabaseSchema` and IPC interfaces (*Normalize Symmetries*).
5. **$S$ Structural Tidying (Ticket 01.1.3)**: Author `UiRuntimeState` centralized accessors (*Extract Helper*) in `src/renderer/state/ui-runtime-state.ts` and controller bindings in `app-composition.ts`.
6. **$B$ Behavioral Change (Ticket 01.2)**: Wire migration seam into `src/renderer/lifecycle/bootstrap.ts:runRendererBootstrap` (*Guard Clauses*).
7. **$S$ Structural Tidying (Ticket 08.1)**: Mount dual-container isolation shell and `#workspace-mode-toggle-btn` in `src/index.html` and `dom-refs.ts` (*New Interface, Old Impl*), establishing the new container interface seam while keeping legacy grid rendering intact behind it.
8. **$B$ Behavioral Change (Ticket 08.2)**: Implement settings legacy mode toggle and visibility controller.
9. **$B$ Behavioral Change (Ticket 03.2)**: Reconcile rescan lifecycle with `virtualTree` and `favoriteOrder`.

#### Phase 2 Preparatory Tidying
10. **$S$ Structural Tidying (Ticket 04.1.1)**: Author headless `[NEW] src/renderer/utils/folder-preview.ts` (*Extract Helper*) with `PreviewOptions` parameter seam and short-circuit thumbnail extraction without DOM coupling.
11. **$S$ Structural Tidying (Ticket 04.2)**: Author headless `[NEW] src/renderer/utils/virtual-grid-windowing.ts` (*Extract Helper*) with `WindowingOptions`, `AutoScrollOptions`, viewport culling calculations, and coordinate-to-item mapping seam without DOM coupling.
12. **$S$ Structural Tidying (Ticket 05.1.1.1)**: Author headless `[NEW] src/renderer/utils/folder-sort.ts` (*Extract Helper*) implementing heterogeneous partition sorting without DOM coupling.
13. **$B$ Behavioral Change (Tickets 04.1.2, 05.1.1.2, 05.1.2, 05.2)**: Mount 2x2 folder preview cards, virtualized grid root view with dynamic card recycling, in-place drill-down, and semantic breadcrumb navigation.

#### Phase 3 Behavioral Changes
14. **$B$ Behavioral Change (Tickets 07.1.1, 07.1.2, 07.2)**: Mount 1-click header toggle between Favorite Desk (flat grid) and Library Mode (`07.1.1`), optimistic favorite star updates (`07.1.2`), and global search query engine consuming `findAncestryPath` (`07.2`).

#### Phase 4 Preparatory Tidying
15. **$S$ Structural Tidying (Ticket 02)**: Author `[NEW] src/renderer/utils/gesture-timer.ts` (*Extract Helper*) with `DragGestureOptions` and `IClock` parameter seam without touching legacy `drag-drop-grid.ts`.
16. **$B$ Behavioral Change (Tickets 06.1.1, 06.1.2.1, 06.1.2.2, 06.2.1.1, 06.2.1.2, 06.2.2)**: Virtualized grid drag reorder (`06.1.1`), card drag folder creation (`06.1.2.1`), folder card drop insertion (`06.1.2.2`), breadcrumb drop reparenting (`06.2.1.1`), edge auto-scroll (`06.2.1.2`), and spring-loaded hover navigation (`06.2.2`).

## Solution

1. **Virtual Nested Folders (iOS/Android-Style App Folders)**:
   - Allow users to drag and drop game cards onto each other on the UI grid to create virtual folders, or drop cards into existing folders.
   - Support virtual folder nesting up to a cumulative maximum depth of 16 levels (`depth <= 16`), with cold-start depth clamping and cyclic ancestry move rejection.
   - Closed folder cards maintain standard game card dimensions and display an automated 2x2 preview matrix of 1 to 4 game icons from within the folder.
   - Clicking a folder navigates into an **In-Place Grid Drill-down** view with breadcrumb navigation (`Home > Genre > Studio > ...`) located directly below the header.
   - **Spring-Loaded Drag & Breadcrumb Navigation**:
     - Hovering a dragged card over an existing folder card for >= 2 seconds automatically triggers an in-place drill-down into that folder, enabling multi-level deep drops in a single continuous drag.
     - Hovering a dragged card over a parent folder name in the breadcrumbs bar highlights the target and triggers an in-place drill-up after >= 2 seconds, while an immediate drop moves the game to the end of that parent folder with a toaster notification.
   - The entire hierarchy is virtual and stored in YumeShelf's local metadata database (`db.json`). Zero files, directories, or archives on the user's physical hard drive are moved, renamed, or modified.

2. **Dual Workspace Views ("Favorite Desk" vs "Library")**:
   - Introduce two distinct view modes easily accessible via a 1-click SVG icon toggle on the header (next to the Sort control):
     - **Favorite Desk**: A clean, focused, flat grid showing only favorited game cards. Supports all standard sorting presets (Recently Played, Date Added / Newest, A-Z, Custom Drag-and-Drop) independently of Library folder positions. Favorite Desk operates as a strictly flat grid. Drag-and-drop on Favorite Desk is exclusively restricted to 1D reordering of `favoriteOrder`. Folder creation gestures (holding a dragged card over another card for 300ms) and dropping folders onto Favorite Desk are strictly prohibited.
     - **Library**: The complete hierarchical view containing virtual folders, sub-folders, and unorganized game cards at the root level.

3. **Legacy Mode & Settings Toggle**:
   - Keep the existing flat grid with standard sorting and pinned favorites as the default "Legacy Mode".
   - Allow users to switch between Legacy Mode and Virtual Folder / Workspace View Mode in the Settings page without data loss.

## User Stories

1. As a player with a large game library, I want to drag one game card over another and hold for 300ms, so that I can group them into a new virtual folder without touching my filesystem.
2. As a player, I want to drag additional game cards into an existing folder, so that I can keep related games organized in one place.
3. As a player, I want to hold a dragged card over an existing folder for 2 seconds, so that the grid opens into that folder and lets me place the card at an exact position or inside a deeper subfolder in one drag.
4. As a player, I want to drag a virtual folder into another virtual folder, so that I can build multi-level hierarchies up to 16 levels deep (`Publisher > Game Series > Versions`).
5. As a player, I want closed folder cards to match standard card dimensions and show an automated 2x2 preview of up to 4 game icons, so that the grid layout remains uniform and recognizable.
6. As a player, I want to click on a folder card to transition the grid into that folder's contents, so that I can inspect and launch any game inside that folder.
7. As a player, I want to see a breadcrumb navigation bar below the header when inside a folder, so that I know my current depth and can jump back to any parent level with one click.
8. As a player, I want to drag a game card onto a breadcrumb parent item, so that I can move a game up to any ancestor folder immediately (or hold for 2 seconds to navigate there).
9. As a player, I want an empty folder to automatically delete itself when its last game is removed, so that I do not have to manually clean up empty containers.
10. As a player, I want to dissolve a folder via its 3-dot context menu, so that all its contents are moved out to the parent level and the folder container is removed.
11. As a player, I want to double-click on a folder's title (or use the 3-dot menu) to rename it inline, so that I can label my collections clearly.
12. As a player, I want a 1-click icon button on the header to switch between "Favorite Desk" and "Library", so that I can instantly access my most played games without visual clutter.
13. As a player viewing the "Favorite Desk", I want to see a flat grid of all favorited cards with full sorting options (Recently Played, Newest, A-Z, Custom Order), so that I have a clean dashboard of games I am currently playing.
14. As a player viewing the "Library", I want to see my complete folder tree and unorganized cards at the root level, so that I can browse my entire catalog.
15. As a player, I want to toggle a game's favorite status from anywhere (inside a folder or from the card dropdown), so that it immediately reflects on my "Favorite Desk".
16. As a player searching for a game in Folder Mode, I want search to query the entire library globally and display parent folder badges, so that I can quickly find and launch any title across all folders.
17. As a player who prefers the original layout, I want a setting to keep the default "Legacy Mode", so that my existing workflow remains unchanged.
18. As a player, I want all virtual folder arrangements to persist in `db.json` across app restarts and library rescans, so that I never lose my custom organization.
19. As a player, when a new game is discovered during a library rescan, I want it to appear at the root level of the Library, so that I can easily find and categorize it.
20. As a player, when a game is deleted from disk and removed during a library rescan, I want the system to cleanly prune the missing game from both `virtualTree` and `db.favoriteOrder` without corrupting the surrounding folder hierarchy.
21. As a player, I want launching games, tracking playtime, editing saves, and configuring translations to work identically whether a game is inside a virtual folder, on the Favorite Desk, or on the root grid.

## Implementation Decisions

### Virtual Hierarchy Data Model & Persistence
- Virtual folders are represented as a recursive tree data structure stored directly in `db.json`:
```typescript
interface DatabaseSchema {
    games: Record<string, any>;
    virtualTree?: VirtualFolderNode;
    favoriteOrder?: string[];
    titleResolutionConfig?: Record<string, any>;
    schemaVersion?: number;                       // Monotonic integer: 0/1 (legacy), 2 (PRD 03)
    config: LibraryConfig & {
        legacyMode?: boolean;                         // Default: true (Legacy Mode active)
        activeWorkspaceMode?: 'favorites' | 'library'; // Default: 'library'
    };
}

interface VirtualFolderNode {
    id: string;
    name: string;
    type: 'folder';
    children: Array<VirtualFolderNode | VirtualGameRefNode>;
    dateCreated: number;
}

interface VirtualGameRefNode {
    type: 'game';
    gameKey: string;
}
```
- Physical game records continue to be keyed by `gameKey`. The virtual folder tree stores only references (`gameKey`) and display hierarchy, completely decoupled from physical file paths.
- **Shared Module Architecture Landing Location**:
  `VirtualTreeManager`, tree validation (cycle detection, depth $\le 16$ clamping), tree data types (`VirtualFolderNode`, `VirtualGameRefNode`, `AncestryItem`), ancestry resolution (`findAncestryPath`), standardized `moveNode`, and rescan reconciliation utilities reside in `[NEW] src/shared/virtual-tree/` (e.g. `src/shared/virtual-tree/types.ts`, `invariants.ts`, and `manager.ts`).
  Exported invariant validation functions in `invariants.ts`:
  - `assertUniqueFolderIds(tree: VirtualFolderNode): boolean`
  - `assertUniqueGameKeys(tree: VirtualFolderNode): boolean`
  - `assertNoPrototypePollution(tree: unknown): boolean`
  - `validateTreeInvariants(tree: unknown, options?: TreeManagerOptions): { ok: boolean; error?: string }`
  `validateTreeInvariants` performs top-level root container invariance and recursive schema/type enforcement on every node in the hierarchy:
  - Validates that the top-level root container satisfies `isRootNode(tree)`: `isPlainObject(tree) === true`, `tree.type === 'folder'`, and `tree.id === 'root'`. If the top-level tree fails any of these criteria, immediately returns `{ ok: false, error: 'invalid-root-node' }`.
  - Rejects null, non-objects, and prototype pollution keys (`__proto__`, `constructor`, `prototype`).
  - Maintains a `visited = new Set<unknown>()` of traversed object references during recursive descent (or executes `detectCycle` prior to deep recursion). If an object reference is encountered more than once, immediately returns `{ ok: false, error: 'cyclic-tree-detected' }` without recursing further.
  - Enforces depth ceiling (`depth <= (options?.maxDepth || 16)`) during recursion, returning `{ ok: false, error: 'max-depth-exceeded' }` if any node exceeds `maxDepth`.
  - Enforces that `node.type` is strictly `'folder'` or `'game'`. Any unknown type returns `{ ok: false, error: 'invalid-node-type' }`.
  - If `node.type === 'folder'`: `node.id` must be a non-empty string ($\le 100$ chars) matching safe identifier pattern `^[a-zA-Z0-9_-]+$` that does NOT match prototype keys (`__proto__`, `constructor`, `prototype`); `node.name` must be a string with `node.name.trim().length > 0 && node.name.trim().length <= (options?.maxNameLength || 100)` containing no control characters (`\0`, `\r`, `\n`); `node.children` must be an Array; `node.dateCreated` must be a valid finite number (`Number.isFinite(node.dateCreated)`).
  - If `node.type === 'game'`: `node.gameKey` must be a non-empty string ($\le 500$ chars) containing no ASCII control characters (`\0`, `\r`, `\n`) or prototype keys; `node.children` must NOT exist.
  - Enforces strictly disjoint namespaces between folder identifiers and game keys: no `VirtualGameRefNode.gameKey` may equal `'root'` or `tree.id`, and all folder `id`s and game `gameKey`s within the tree must form disjoint sets (`folderIds.has(node.gameKey) === false`). If an identifier collision is detected, immediately returns `{ ok: false, error: 'identifier-collision-detected' }`.
  - Cumulative node count across the tree must not exceed `options?.maxTotalNodes || 10000`.
  ```typescript
  export interface AncestryItem {
    id: string;
    name: string;
  }

  export interface TreeManagerOptions {
    maxDepth?: number;          // default: 16
    maxNameLength?: number;     // default: 100
    idGenerator?: () => string; // default: () => crypto.randomUUID()
    now?: () => number;         // default: () => Date.now()
    maxTotalNodes?: number;     // default: 10000
  }

  export interface VirtualTreeManager {
    createFolder(tree: VirtualFolderNode, name: string, targetItemKeysOrIds: string[], parentFolderId?: string): { folder: VirtualFolderNode; ok: boolean };
    renameFolder(tree: VirtualFolderNode, folderId: string, newName: string): boolean;
    moveNode(tree: VirtualFolderNode, sourceIdOrKey: string, targetFolderId: string, targetIndex?: number): boolean;
    dissolveFolder(tree: VirtualFolderNode, folderId: string): boolean;
    pruneEmptyFolders(tree: VirtualFolderNode): boolean;
    pruneMissingGames(tree: VirtualFolderNode, validGameKeys: Set<string>): { prunedKeys: string[] };
    findAncestryPath(tree: VirtualFolderNode, targetNodeIdOrKey: string): AncestryItem[];
  }
  ```
  `VirtualTreeManager` enforces strict input validation and mutation guards:
  - In `createFolder(tree, name, targetItemKeysOrIds, parentFolderId?)`: validates `name` via `validateNodeName(name, options?.maxNameLength || 100)` (falling back safely to `'New Folder'` if invalid or whitespace-only); guards `parentFolderId` (defaulting to `'root'`) and rejects prototype keys (`__proto__`, `constructor`, `prototype`); ensures parent container indexing uses prototype-less structures (`Map<string, VirtualFolderNode>` or `Object.create(null)`); deduplicates `targetItemKeysOrIds` and rejects prototype keys. Rejects or filters out any target ID matching `'root'`, `tree.id`, or `parentFolderId`; if `targetItemKeysOrIds` contains `'root'` or `tree.id`, immediately returns `{ folder: null as any, ok: false }` to prevent reparenting the root container into a child folder. Enforces depth bounds check: validates that `parentFolderId` resolves to an existing `VirtualFolderNode` whose depth satisfies `parentDepth < (options?.maxDepth || 16)`; if the parent container is already at `maxDepth`, or if any target item is a folder whose subtree would cause cumulative depth to exceed `maxDepth`, returns `{ folder: null as any, ok: false }` immediately.
  - In `moveNode(tree, sourceIdOrKey, targetFolderId, targetIndex?)`: returns `false` immediately if `sourceIdOrKey === targetFolderId` (self-target move rejection). Locates `sourceIdOrKey` within `tree`; if `sourceIdOrKey` cannot be located in the tree hierarchy (or if its containing parent folder cannot be resolved), returns `false` immediately without modifying tree references, throwing `TypeError`, or triggering empty container auto-pruning checks. Verifies that `targetFolderId` exists in the tree hierarchy and that the resolved target node strictly satisfies `targetNode.type === 'folder'`; if `targetNode` does not exist or `targetNode.type !== 'folder'`, returns `false` immediately without modifying or removing the source node. Validates `targetIndex`, if provided, as a finite non-negative integer clamped to `[0, targetFolder.children.length]`. If `sourceIdOrKey` represents a folder node, queries `findAncestryPath(tree, targetFolderId)`; if `findAncestryPath(tree, targetFolderId).some(item => item.id === sourceIdOrKey)` is `true`, the target is a descendant of the moved folder—returns `false` immediately without modifying tree references, preventing isolated directed cycles and permanent subtree loss. Furthermore, when `sourceIdOrKey` is a folder, calculate cumulative depth `targetFolderDepth + getSubtreeDepth(sourceFolder)` and verify that `targetFolderDepth + getSubtreeDepth(sourceFolder) <= (options?.maxDepth || 16)`; if cumulative depth would exceed `maxDepth`, returns `false` immediately without modifying tree references.
  - In `findAncestryPath(tree, targetNodeIdOrKey)`: maintains an internal `visited = new Set<string>()` of traversed folder IDs and enforces a recursion depth ceiling ($\le 16$, matching `options.maxDepth`), immediately returning an empty array if a duplicate folder ID or excessive depth is encountered to prevent stack overflow DoS.
  - Root container mutation guards: `dissolveFolder` and `renameFolder` return `false` immediately if `folderId === 'root'` or `folderId === tree.id`. In `moveNode`, guard against moving the root container itself: return `false` if `sourceIdOrKey === 'root'` or `sourceIdOrKey === tree.id`. Explicitly permit `targetFolderId === 'root'`, allowing items to be reparented or dragged out of subfolders directly into the Library root. In `moveNode(tree, sourceIdOrKey, targetFolderId, targetIndex?: number)`, condition automatic empty folder dissolution strictly on inter-folder movement:
  - When moving a node, the source containing folder must ONLY be pruned/dissolved if `sourceContainingFolder.id !== targetFolderId` AND `sourceContainingFolder.id !== 'root'` AND `sourceContainingFolder.id !== tree.id` AND `sourceContainingFolder.children.length === 0` (stopping at root or a non-empty ancestor).
  - If `sourceContainingFolder.id === targetFolderId` (intra-folder reordering), perform array repositioning (`splice`) and do NOT trigger empty folder pruning checks, preserving single-child folders during 1D grid drag-and-drop.
  This satisfies User Story 9 without accidental self-dissolution during intra-folder reordering. `VirtualTreeManager` and `invariants.ts` accept `TreeManagerOptions` (defaulting to `maxDepth: 16`, `maxNameLength: 100`, `maxTotalNodes: 10000`, `idGenerator: () => crypto.randomUUID()`, `now: () => Date.now()`). This enables direct imports by both Main process (`src/main/library-state/loader.ts`) and Renderer modules (`src/renderer/`) without cross-process boundary violations per `tsconfig.main.json`.
- **Canonical `IClock` Seam in Shared Module**:
  The canonical `IClock` interface is defined in `[NEW] src/shared/virtual-tree/types.ts` (or `[NEW] src/shared/types/clock.ts`) to comply with `tsconfig.main.json` architectural boundaries between Main process and Renderer:
  ```typescript
  export interface IClock {
    now(): number;
    setTimeout(callback: () => void, ms: number): any;
    clearTimeout(id: any): void;
    requestAnimationFrame?(callback: (timestamp: number) => void): any;
    cancelAnimationFrame?(id: any): void;
  }
  ```
  Renderer utilities (`src/renderer/utils/gesture-timer.ts`) re-export `IClock` for renderer consumers.
- **Configuration Whitelist Extension**:
  `LibraryConfig` interface and `normalizeLibraryConfigShape` in `src/main/library-state/scanner.ts` are extended to recognize, validate, and preserve `legacyMode?: boolean` (default: `true`) and `activeWorkspaceMode?: 'favorites' | 'library'` (default: `'library'`). All unrecognized or undeclared properties are strictly stripped during config saves and rescans.
- **Unified `AtomicWriteCoordinator`**:
  - All database reads and writes route through `[NEW] src/main/library-state/write-coordinator.ts` (`AtomicWriteCoordinator`).
  - Formalize injectable seams in `WriteCoordinatorOptions`:
    ```typescript
    export interface WriteCoordinatorOptions {
      dbFilePath?: string;
      debounceMs?: number;
      clock?: IClock;
      processStartTime?: number;
      fs?: any;
      fsSync?: any;
      retryDelayMs?: number;
      maxRetryAttempts?: number;
      loadDB?: () => Promise<any>;
      saveDB?: (db: any) => Promise<void>;
    }
    ```
  - Expose authoritative in-memory state via `getLatestDB()` or `mutate<T>(mutator: (db: DatabaseSchema) => Promise<T> | T): Promise<T>`. Inside `mutate`, serialize all in-flight and cold-start concurrent calls through a private promise queue (`private queue = Promise.resolve()`) so that game actions (`actions.ts`), config updates (`config.ts`), and scanner rescan results (`loader.ts`) do not read stale disk snapshots or overwrite concurrent mutations. Inside the serialized queue step, if `this.cachedDb === null`, await `this.loadDB()` (or disk loader); if `this.cachedDb` remains null or undefined (such as on cold start, empty file, or fresh install), lazily initialize `this.cachedDb = migrateStorage({})` (producing the canonical default V2 schema: `{ schemaVersion: 2, games: {}, virtualTree: { id: 'root', name: 'Root', type: 'folder', children: [], dateCreated: Date.now() }, favoriteOrder: [], titleResolutionConfig: {}, config: normalizeLibraryConfigShape({ legacyMode: true, activeWorkspaceMode: 'library' }) }`) before snapshotting. Enforce in-memory transactional snapshot isolation via clean working copy pattern: pass `workingCopy = structuredClone(this.cachedDb)` to `mutator(workingCopy)`, and ONLY assign `this.cachedDb = workingCopy` and increment `writeGeneration` AFTER `mutator` successfully resolves without throwing or rejecting. If `mutator` throws an error or rejects (such as during invariant checking, schema validation, or unexpected exceptions), `this.cachedDb` remains untouched, preventing exposure of uncommitted or corrupted state to concurrent readers before rejecting the returned promise and advancing the private promise queue. In `getLatestDB()`, return `structuredClone(this.cachedDb ?? migrateStorage({}))` to prevent external callers from mutating `cachedDb` outside of `coordinator.mutate()` and eliminate null dereferences on uninitialized reads.
  - Refactor `saveDB` and `loadDB` in `src/main/library-state/index.ts` to delegate to `AtomicWriteCoordinator`. When `this.saveDB` delegate is provided, `AtomicWriteCoordinator` commits mutations by awaiting `this.saveDB(this.cachedDb)` and bypasses disk temporary file authoring. In direct disk operations, guard `if (!this.dbFilePath) throw new Error('Cannot write to disk: dbFilePath is undefined')`.
  - Author atomic temporary files matching `.${path.basename(this.dbFilePath)}.tmp.${process.pid}.${Date.now()}.${++this.tempFileCounter}` strictly in `path.dirname(this.dbFilePath)` to avoid cross-device (`EXDEV`) errors on partitioned disks. Before creating or opening temporary files in either debounced async writes or `flushSync()`, verify that `path.dirname(this.dbFilePath)` exists; if not, call `fsSync.mkdirSync(path.dirname(this.dbFilePath), { recursive: true })` (or `await fs.mkdir(dir, { recursive: true })`), preserving parity with `src/main/library-state/index.ts:74-81`.
  - In `AtomicWriteCoordinator`, explicitly close the temporary file descriptor (`closeSync(fd)` / `fileHandle.close()`) immediately after `fsyncSync(fd)` / `fileHandle.sync()` and prior to `renameSync` / `fs.rename`, preventing Win32 `MoveFileExW` sharing violations (`EPERM`/`EBUSY`).
  - Concurrency control and retry backoff in async write path: maintain an internal `writeGeneration` counter incremented monotonically on every mutation; serialize asynchronous disk writes using an internal promise queue / mutex lock; include bounded retry backoff for Windows file locks (`EBUSY`/`EPERM`) up to 3 attempts with 10ms delay; only clear `isDirty` if the written generation matches the latest in-memory generation (immediately re-arming the debounce timer if newer mutations arrived during write). Wrap the debounced async temp write, descriptor close, and bounded rename retry loop in a `try...catch` block. If all rename attempts fail (e.g. Windows file lock persisting beyond 3 retries):
    1. Retain `this.isDirty = true` (do NOT mark dirty state clean).
    2. Asynchronously unlink the unrenamed temporary file via `fs.unlink(tempPath).catch(() => {})` to prevent leaking temp files.
    3. Log diagnostic warning to `safe-console.warn('[WRITE-COORDINATOR][ERROR] Debounced async write failed, retrying...', error)`.
    4. Re-arm the debounce timer with backoff (500ms) so pending mutations are re-attempted on subsequent ticks.
    5. Catch errors to prevent unhandled promise rejections.
  - In `flushSync(): void`: unconditionally cancel pending debounce timers, increment `writeGeneration`, and set `this.isShuttingDown = true` FIRST upon entry, BEFORE checking `if (!this.isDirty || !this.dbFilePath) return;`. This permanently seals the coordinator against accepting or retaining late mutations during app quit. Execute sequential retries for `renameSync` up to `maxRetryAttempts` (default 3) using `options.retryDelayMs` (default 0 in test harnesses). Prohibit synchronous wall-clock busy-wait loops. Under Windows lock collisions, do NOT execute destructive in-place truncation (`writeFileSync(this.dbFilePath, ...)` with default `'w'` flag) as it risks 0-byte corruption during `before-quit`. Instead, retain the fsynced `tempPath` on disk (do NOT unlink in `finally`), attempt an emergency copy to `.${path.basename(this.dbFilePath)}.bak` wrapped in a defensive `try...catch` block to ensure shutdown never crashes on filesystem errors, and log the lock collision error to `safe-console`.
  - Prior to executing schema migrations where `currentVersion < TARGET_VERSION`, verify whether `this.dbFilePath` exists on disk. If it exists, create an un-mutated backup snapshot `.${path.basename(this.dbFilePath)}.v${currentVersion}.bak` in `path.dirname(this.dbFilePath)` using atomic file copy (`fsSync.copyFileSync`) before executing migration steps and rewriting the database file.
  - Partitioned startup crash recovery sweep: guard sweep with `if (!this.dbFilePath || typeof this.dbFilePath !== 'string') return;` and check `fsSync.existsSync(dir)` before reading. Inspect candidate temporary files matching dynamically compiled regex `new RegExp('^\\.' + escapeRegExp(path.basename(this.dbFilePath)) + '\\.tmp\\.\\d+\\.\\d+(?:\\.\\d+)?$')` in `path.dirname(this.dbFilePath)`.
    - **Path A (Corrupted / Absent Database)**: If `this.dbFilePath` does not exist, is 0-byte truncated, fails JSON parsing, or fails structural validation (`!isPlainObject(existingDb) || !isPlainObject(existingDb.config)` or failing to satisfy either `isPlainObject(existingDb.games)` or valid unmigrated legacy flat game records, or `existingDb.virtualTree && !validateTreeInvariants(existingDb.virtualTree).ok`), inspect candidate temporary files matching the recovery regex. Filter candidates for non-empty, parseable JSON satisfying strict `DatabaseSchema` structural validation: must contain both `games` (`isPlainObject(candidate.games)`) and `config` (`isPlainObject(candidate.config)`). If `candidate.virtualTree` is present, it MUST be validated via `validateTreeInvariants(candidate.virtualTree)` requiring `{ ok: true }`; if invalid, the candidate is rejected. If `candidate.favoriteOrder` is present, it must be an array of non-empty strings ($\le 500$ chars, length $\le 10000$) free of control characters and prototype keys. If valid candidates survive, sort descending by `mtimeMs` and restore the newest candidate to `this.dbFilePath`. If zero temp candidates survive, inspect candidate backup snapshots matching both `.${path.basename(this.dbFilePath)}.bak` and `.${path.basename(this.dbFilePath)}.v*.bak` (sorting candidate backups by `mtimeMs` descending). For pre-V2 backups (`bak.schemaVersion === undefined || bak.schemaVersion < 2`), require `isPlainObject(bak.config)` and valid game records (either `isPlainObject(bak.games)` or legacy flat records); for V2+ backups (`bak.schemaVersion >= 2`), require `isPlainObject(bak.games) && isPlainObject(bak.config)`, `validateTreeInvariants(bak.virtualTree).ok === true`, and valid `favoriteOrder`. If valid, restore to `this.dbFilePath`.
    - **Path B (Valid Existing Database)**: Only entered if `this.dbFilePath` exists on disk, `statSync(this.dbFilePath).size > 0`, successfully parses as valid JSON, AND satisfies structural validation: `isPlainObject(existingDb) && isPlainObject(existingDb.config)` AND either `isPlainObject(existingDb.games)` (with `!existingDb.virtualTree || validateTreeInvariants(existingDb.virtualTree).ok === true`) OR `(existingDb.schemaVersion === undefined && Object.keys(existingDb).some(k => !['config', 'schemaVersion'].includes(k) && isPlainObject(existingDb[k]) && typeof existingDb[k].folderPath === 'string'))` (valid unmigrated legacy database). If `this.dbFilePath` fails these structural criteria (including 0-byte, empty `{}`, or missing config), route to Path A; healthy legacy databases are preserved in Path B and protected from being overwritten by empty candidates, allowing `migrateStorage` in `loadDB` to execute $M_{0 \to 1} \to M_{1 \to 2}$. When entering Path B, obtain `dbMtime = fsSync.statSync(this.dbFilePath).mtimeMs`. Inspect candidate temporary files and filter ONLY candidates where `candidate.mtimeMs > dbMtime`. For each newer candidate, verify that it is non-empty, successfully parses as valid JSON, and satisfies strict `DatabaseSchema` structural validation: (1) `isPlainObject(candidate.games) && isPlainObject(candidate.config)`, (2) candidate `games` collection must not be empty if the existing on-disk database contains games (`Object.keys(candidate.games).length > 0` if `Object.keys(existingDb.games).length > 0`), guarding against empty or truncated temp files while permitting valid candidate game counts less than the existing count due to legitimate disk deletions, (3) if `candidate.virtualTree` is present, `validateTreeInvariants(candidate.virtualTree).ok === true`, and (4) if `candidate.favoriteOrder` is present, it passes array string bounds and prototype rejection. If a newer valid candidate exists, restore the newest valid candidate to `this.dbFilePath`. If any candidate fails strict schema/invariant validation or has `mtimeMs <= dbMtime`, strictly DO NOT touch `this.dbFilePath` and do NOT restore backup files. Log a diagnostic recovery warning for invalid candidates and unlink them during subsequent cleanup sweep, leaving the existing healthy database intact.
    - In `sweepOrphanedTempFiles`, wrap candidate file inspection and unlinking operations in defensive `try...catch` blocks to intercept transient filesystem errors (`EBUSY`, `EPERM`, `ENOENT`). Log diagnostic warnings to `safe-console.warn('[WRITE-COORDINATOR][SWEEP] Recovery warning:', error)` without aborting coordinator instantiation or crashing application startup.
    - **Cleanup**: Only after recovery evaluation completes, unlink all remaining orphaned temporary files matching the recovery regex older than `this.processStartTime` (defaulting to `options.processStartTime ?? (options.clock?.now ? options.clock.now() : Date.now())`).
  - **Storage Schema Migration Runner**:
    Establish an explicit, isolated sequential schema migration runner `migrateStorage(raw: any): DatabaseSchema` in `src/main/library-state/migrations.ts` executed during storage initialization inside `AtomicWriteCoordinator.loadDB` (or `libraryState.initStorage`) before any domain loader, IPC handler, or UI component mounts. The runner inspects `raw.schemaVersion ?? 0` and executes discrete, one-way sequential migration units:
    - $M_{0 \to 1}$: Canonicalize database root envelope: ensure `games: Record<string, any>`. When migrating candidate legacy keys into `latestDb.games`, verify that `isPlainObject(value) && typeof value.folderPath === 'string' && typeof value.exePath === 'string'` (preserving parity with legacy `readLegacyGames`). Delete legacy flat keys and non-object or un-recognized top-level junk keys that do not match `KNOWN_TOP_LEVEL_SCHEMA_KEYS`. Normalize `config` via `normalizeLibraryConfigShape`, default `titleResolutionConfig: raw.titleResolutionConfig || {}`, and assign `schemaVersion = 1`. In `src/main/library-state/loader.ts:loadGamesForConfig`, candidate game records not matched by exact `gameKey` or exact `folderPath` must be evaluated against un-matched records in `storedGames` using descendant path containment (`isDescendantPath(storedRecord.folderPath, candidate.folderPath)`). When a unique descendant match is found (`descendantMatches.length === 1`), transfer stored user metadata (`name`, `customName`, `favorite`, `playtime`, `lastPlayed`, `dateAdded`) to candidate and prune obsolete ancestor key from `latestDb.games` (preserving legacy top-level record migration parity and passing `tests/library-state.test.js:105-139`).
    - $M_{1 \to 2}$: Advance schema to V2: ensure `virtualTree = raw.virtualTree || { id: 'root', name: 'Root', type: 'folder', children: [], dateCreated: Date.now() }`, `favoriteOrder = Array.isArray(raw.favoriteOrder) ? raw.favoriteOrder : []`, initialize workspace defaults `config.legacyMode = raw.config?.legacyMode ?? true` and `config.activeWorkspaceMode = raw.config?.activeWorkspaceMode ?? 'library'`, and assign `schemaVersion = 2`.
    If `raw.schemaVersion < 2`, await immediate atomic file persistence to disk (using `writeAtomicJson` or atomic replacement with descriptor close and fsync) before resolving `loadDB` and returning `db` to callers, bypassing the 150ms debounced timer during initial storage upgrade to guarantee durability. Remove all ad-hoc `latestDb.schemaVersion = 2` stamping scattered across unrelated mutation handlers (restricting schema version advancement exclusively to `migrateStorage`).
  - Expose `dispose(): void` to clear debounce timers and unlink pending temporary files. Expose public testability seam `waitForPendingWrites(): Promise<void>` (or `whenIdle(): Promise<void>`) on `IWriteCoordinator` and `AtomicWriteCoordinator` that tracks in-flight asynchronous write promises and active debounce timers, resolving when all active debounce timers and background disk replacement operations have settled, providing a deterministic verification seam for unit test suites and shutdown hooks without requiring wall-clock `sleep()` statements.
  - The write coordinator encapsulates debounced write coalescing (`debounceMs?: number`, default 150), atomic temp file replacement, and dirty-state tracking.
  - `AtomicWriteCoordinator` maintains a monotonically increasing generation token (`writeGeneration: number`) and an active shutdown flag (`isShuttingDown: boolean`). In `mutate`, if `this.isShuttingDown === true`, reject incoming mutations immediately with `throw new Error('AtomicWriteCoordinator is shut down; mutations rejected')`, preventing late shutdown calls (e.g. `finalizeTrackedSession` during `before-quit`) from creating unpersisted dirty in-memory state after `flushSync()`. When `flushSync()` is invoked during `app.on('before-quit')`, it cancels pending debounce timers, increments `writeGeneration`, sets `isShuttingDown = true`, and executes the synchronous disk write using `fsSync` primitives. In-flight async callbacks verify their captured generation token before attempting file replacement (`fs.rename`), discarding their write and unlinking their temporary file (`fs.unlink(tempPath).catch(() => {})`) if obsolete to prevent overwriting shutdown state, leaking orphaned temp files, or triggering Windows file-locking collisions (`EPERM`/`EBUSY`).
  - In `src/main/library-state/index.ts`, pass `coordinator: IWriteCoordinator` on the internal `context` object assembled in `createLibraryState` and update the internal `LibraryContext` type definition accordingly. This guarantees `loader.ts:loadGamesForConfig`, `actions.ts`, and `config.ts` have typed access to `context.coordinator.mutate((latestDb) => { ... })` to commit reconciled state atomically without lost updates. Extend `LibraryContext` options to accept `writeCoordinatorOptions?: WriteCoordinatorOptions` (or `debounceMs?: number`). `createLibraryState` forwards these options directly to `AtomicWriteCoordinator`. When custom persistence delegates (`loadDB`/`saveDB`) are provided without an explicit `debounceMs`, default `debounceMs` to `0` to guarantee immediate synchronous persistence in unit test harnesses (`tests/library-state.test.js`).
- **Canonical IPC Channels & Boundary Symmetry**:
  - `get-virtual-tree` $\to$ Returns `{ tree?: VirtualFolderNode | null; favoriteOrder?: string[] }`.
  - `save-virtual-tree` $\to$ Accepts `VirtualFolderNode`, sanitizes or rejects unsafe prototype keys (`__proto__`, `constructor`, `prototype`), enforces cumulative ceiling `maxTotalNodes: 10000` across virtual tree and favorites, validates incoming tree against structural invariants (`isRootNode`, `!detectCycle`, `assertDepthWithinBounds(tree, 16)`, unique folder IDs, unique game keys via composite `validateTreeInvariants(tree)`), returns `Promise<{ ok: boolean; error?: string }>` (returning `{ ok: false, error: 'invalid-tree-invariants' }` on failure), and persists to `db.json` atomically via `AtomicWriteCoordinator.mutate`.
  - `save-favorite-order` $\to$ Accepts `order: string[]`, rejects prototype keys (`__proto__`, `constructor`, `prototype`). Ingress handler validates `Array.isArray(order) && order.every(k => typeof k === 'string' && k.trim().length > 0 && k.length <= 500 && !k.includes('\0'))`. Resolves candidate keys using `buildLogicalGames` or accepts both physical `gameKey` and logical `gameId`, resolving each to canonical physical `primaryInstance.gameKey` before validating against `latestDb.games` strictly using `Object.hasOwn(latestDb.games, key) && Boolean(latestDb.games[key]?.favorite) === true` (pruning un-favorited keys). Bounds array length (<= 10000 items), deduplicates entries, returns `Promise<{ ok: boolean; error?: string }>` (returning `{ ok: false, error: 'invalid-favorite-order-payload' }` on failure without throwing), and persists `favoriteOrder` to `db.json` atomically via `AtomicWriteCoordinator.mutate`.
  - `migrate-virtual-workspace` $\to$ Canonical IPC channel for cold-start transactional workspace migration. Accepts payload `{ tree: VirtualFolderNode; favoriteOrder: string[]; configUpdates?: Partial<LibraryConfig> }`. Ingress validates `isPlainObject(payload) && isPlainObject(payload.tree) && Array.isArray(payload.favoriteOrder) && payload.favoriteOrder.every(k => typeof k === 'string' && k.trim().length > 0 && k.length <= 500 && !k.includes('\0'))`. Rejects prototype keys on `payload` and `payload.configUpdates` via `assertNoPrototypePollution`. If validation fails, immediately returns `{ ok: false, error: 'invalid-migration-payload' }`. Treats `payload.configUpdates` as a partial patch: extracts only explicitly declared workspace properties (`legacyMode?: boolean`, `activeWorkspaceMode?: 'favorites' | 'library'`), validates their types/enums, rejects all undeclared or privileged keys (prohibiting/stripping `libraryPaths` and `libraryPath`), and merges the extracted updates onto `latestDb.config` via `latestDb.config = normalizeLibraryConfigShape({ ...latestDb.config, ...extractedUpdates })`, preventing defaults from clobbering existing configuration fields. Symmetrically resolves and validates `payload.favoriteOrder` (resolving candidate keys to canonical physical `primaryInstance.gameKey`, rejecting prototype keys, bounding array length <= 10000 and strings <= 500, pruning un-favorited keys, and deduplicating entries). Returns `Promise<{ ok: boolean; error?: string }>`. Handler in `src/main/ipc/controllers/library.controller.ts` delegates to `libraryState.migrateVirtualWorkspace(payload)`. Executes inside a single `coordinator.mutate` transaction: performs deterministic key-order reconciliation: validates `payload.tree` via `validateTreeInvariants(payload.tree)`, reorders existing root child items in `latestDb.virtualTree.children` to match the sequence declared in `payload.tree.children` (appending any newly discovered games not present in `payload.tree` to the end of root children), assigns `latestDb.favoriteOrder = payload.favoriteOrder`, and assigns `latestDb.config = normalizeLibraryConfigShape({ ...latestDb.config, ...extractedUpdates })`. If validation fails, rolls back without persisting.
  - `update-library-config` $\to$ Authoritative IPC channel for persisting configuration updates. Handler in `src/main/ipc/controllers/library.controller.ts` validates that `updates` is a non-null plain object (`isPlainObject(updates)`), rejects prototype pollution keys (`__proto__`, `constructor`, `prototype`) on `updates` via `assertNoPrototypePollution(updates)`, prohibits and strips privileged path settings (`libraryPaths`, `libraryPath`) across BOTH defensive layers (in `library.controller.ts` on IPC ingress and in `src/main/library-state/config.ts:updateLibraryConfig` prior to merging updates) before processing configuration modifications, while permitting all valid non-privileged `LibraryConfig` properties (including workspace flags `activeWorkspaceMode`, `legacyMode`, as well as general preferences `titleDisplayMode`, `displayProductCodes`, `minimizeToTray`, `exposeBetaOptions`, `telemetryEnabled`, etc.).
  - In storage migration runner $M_{0 \to 1}$ in `src/main/library-state/migrations.ts`, legacy flat game records are migrated into `latestDb.games` and removed from the root envelope using `KNOWN_TOP_LEVEL_SCHEMA_KEYS = new Set(['config', 'games', 'virtualTree', 'favoriteOrder', 'titleResolutionConfig', 'schemaVersion'])`. Once at `schemaVersion >= 1`, `loader.ts` operates exclusively on `latestDb.games` with zero top-level key scanning.
  - Type declarations scheduled in `src/shared/types/ipc.d.ts` (`ElectronAPI`), handler registrations in `src/main/ipc/controllers/library.controller.ts`, and facade methods in `src/main/library-state/index.ts`.
  - `preload.ts` exposes `electronAPI.getVirtualTree()`, `electronAPI.saveVirtualTree(tree)`, `electronAPI.saveFavoriteOrder(order)`, and `electronAPI.migrateVirtualWorkspace(payload)`.
- **Favorite Order Symmetrical State Contract**:
  In `src/main/library-state/actions.ts:toggleFavorite`, `electronAPI.toggleFavorite(gameKey)` returns `Promise<boolean>` (`true` if favorited, `false` if un-favorited), enforcing prototype rejection (`__proto__`, `constructor`, `prototype`). The `toggle-favorite` IPC handler in `src/main/ipc/controllers/library.controller.ts` and `actions.ts:toggleFavorite` validates: `if (typeof gameKey !== 'string' || !gameKey.trim() || gameKey.length > 500 || gameKey.includes('\0') || gameKey === '__proto__' || gameKey === 'constructor' || gameKey === 'prototype') throw new Error('invalid-game-key');` and if the game group is missing (`!targetGroup`), rejects with `throw new Error('game-not-found')` rather than returning `false`, ensuring validation and lookup failures reject the returned promise. Defensively initialize `latestDb.favoriteOrder = Array.isArray(latestDb.favoriteOrder) ? latestDb.favoriteOrder : [];` prior to operations. To prevent zombie favorites across multi-instance or versioned games, eliminate asymmetric single-instance updates: resolve the enclosing logical game group via `buildLogicalGames(normalizedGames)` (matching by physical `instance.gameKey` or logical `game.id` / continuity signature). Symmetrically update all instances and favorite order together:
  1. Synchronize `favorite = nextFavorite` across ALL physical instances in `latestDb.games` belonging to that logical game group (`targetGroup.instances.forEach(instance => { if (latestDb.games[instance.gameKey]) latestDb.games[instance.gameKey].favorite = nextFavorite; })`).
  2. Symmetrically update `latestDb.favoriteOrder`: when `nextFavorite === true`, resolve the canonical primary physical key (`primaryKey = targetGroup.primaryInstance?.gameKey || targetGroup.instances[0].gameKey`) and append `primaryKey` to `latestDb.favoriteOrder` (preventing duplicate entries); when `nextFavorite === false`, filter out all instance keys belonging to that logical game group (`const instanceKeys = new Set(targetGroup.instances.map(i => i.gameKey)); latestDb.favoriteOrder = latestDb.favoriteOrder.filter(key => !instanceKeys.has(key));`).
  Mutations are committed atomically via `AtomicWriteCoordinator.mutate`.
  On the client side, favorite star clicks execute an immediate optimistic UI state toggle (<100ms) with asynchronous IPC dispatch. Client-side `UiRuntimeState.favoriteOrder` is updated immediately in-memory (appending on favorite, removing on un-favorite) in addition to toggling `game.favorite` so that Favorite Desk reflects active ordering instantly without requiring application reload. The optimistic controller accepts an optional parameter seam `showToastPillFn?: (message: string) => void` (defaulting to `showToastPill`, with `src/renderer/ui/toast-pill.ts` guarding `typeof document !== 'undefined'` against Node runner crashes) and treats any boolean return value (`typeof res === 'boolean'`) as successful persistence; only if the IPC call rejects, throws, or returns a non-boolean error does it trigger UI rollback and display an error toast via `showToastPillFn('Failed to update favorite status')`. Verification seam is exposed as `toggleFavoriteFn?: (gameKey: string) => Promise<boolean>` for headless testing.
- **Rescan Referential Integrity & Startup Race Prevention**:
  - In `src/main/library-state/loader.ts:loadGamesForConfig`, because storage migration runner $M_{1 \to 2}$ authoritatively initializes `virtualTree` at storage boot, the loader unconditionally assumes the canonical V2 schema, executing referential reconciliation on every rescan without conditional bypass heuristics.
  - Defensively ensure root container initialization before accessing children:
    `if (!latestDb.virtualTree) latestDb.virtualTree = { id: 'root', name: 'Root', type: 'folder', children: [], dateCreated: Date.now() };`.
  - During library rescan reconciliation in `src/main/library-state/loader.ts:loadGamesForConfig`, after asynchronous disk scanning and candidate statting complete, tree reconciliation and persistence execute inside `context.coordinator.mutate((latestDb) => { ... })`:
    - Pre-rescan snapshot: capture `const previousGames = { ...latestDb.games };` at the beginning of the mutation transaction before updating `latestDb.games`, maintaining lexical access to pre-scan records throughout reconciliation steps.
    1. For every entry in `nextGames`, resolve surviving user records strictly using `Object.hasOwn` (rejecting prototype property keys `__proto__`, `constructor`, `prototype`, `toString`, `valueOf`, `hasOwnProperty`): `const sourceRecord = Object.hasOwn(latestDb.games, gameKey) ? latestDb.games[gameKey] : (record.migratedFromGameKey && Object.hasOwn(latestDb.games, record.migratedFromGameKey) ? latestDb.games[record.migratedFromGameKey] : undefined);` and preserve live mutable user fields: `favorite`, `playtime`, `lastPlayed`, `autoTranslate`, `runInBackground`, `saveFolderOverride`, and `customName`/`name` (when `customName === true`).
    2. Commit scanned game records: `latestDb.games = nextGames;`.
    3. Merge configuration safely: apply newly scanned parameters over existing configuration while explicitly preserving user workspace modes: `latestDb.config = normalizeLibraryConfigShape({ ...latestDb.config, ...normalizedConfig, legacyMode: latestDb.config?.legacyMode ?? normalizedConfig.legacyMode, activeWorkspaceMode: latestDb.config?.activeWorkspaceMode ?? normalizedConfig.activeWorkspaceMode })`.
    4. Persist title resolution config: assign `latestDb.titleResolutionConfig = { titleDisplayMode: normalizedConfig.titleDisplayMode, displayProductCodes: normalizedConfig.displayProductCodes, preferredLocale: normalizedConfig.preferredLocale };`, preserving parity with `src/main/library-state/loader.ts:195-199` and `DatabaseSchema.titleResolutionConfig`.
    5. If any physical instance belonging to a candidate's logical game group is already present in `virtualTree`, do NOT append secondary instances to `virtualTree.children` at root.
    6. If a candidate game has a `migratedFromGameKey` differing from `gameKey`, check whether `gameKey` is already present elsewhere in `virtualTree`. If `gameKey` already exists, prune the stale `migratedFromGameKey` node to preserve the `assertUniqueGameKeys` invariant; otherwise, update its `VirtualGameRefNode.gameKey` in-place within `virtualTree` from `migratedFromGameKey` to `gameKey`, preserving its existing folder location and nesting depth.
    7. Logical game instance repointing with uniqueness enforcement: For any `VirtualGameRefNode` in `virtualTree` whose physical `gameKey` is missing from `nextGames`, inspect `previousGames[missingGameKey]` to compute its continuity signature and logical identity (`buildContinuitySignature(previousRecord)` and `buildLogicalGameId(previousRecord)`) against `buildLogicalGames(normalizedNextGames)`. If a surviving instance exists on disk in `nextGames`, only repoint `VirtualGameRefNode.gameKey` in-place to `primaryInstance.gameKey` if `primaryInstance.gameKey` is NOT already present elsewhere in `virtualTree`. Crucially, propagate live mutable user state (specifically `favorite = true` and cumulative `playtime`) from `previousGames[missingGameKey]` to `nextGames[primaryInstance.gameKey]` so that subsequent `favoriteOrder` reconciliation retains the favorite placement. If `primaryInstance.gameKey` is already in `virtualTree`, prune the orphaned node instead of repointing to prevent duplicate key invariant failures (`assertUniqueGameKeys`). Repoint and deduplicate `latestDb.favoriteOrder` so `primaryInstance.gameKey` appears at most once. Only prune nodes from `virtualTree` whose logical game groups have zero surviving physical instances on disk.
    8. Stage `favoriteOrder` reconciliation: Stage 1 updates migrated keys in-place and deduplicates (`Array.from(new Set(...))`); Stage 2 repoints surviving instances of logical game groups when a physical version is removed; Stage 3 prunes dead and un-favorited keys only after Stages 1 and 2 complete, resolves surviving games via `buildLogicalGames(normalizedNextGames)` to extract canonical primary physical keys (`primaryInstance.gameKey`) for each logical game where `Boolean(game.favorite) === true`, appends any favorited primary keys not already present in `latestDb.favoriteOrder`, followed by deduplication: `const canonicalFavoriteKeys = buildLogicalGames(normalizedNextGames).filter((game: any) => Boolean(game.favorite)).map((game: any) => game.primaryInstance.gameKey); latestDb.favoriteOrder = Array.from(new Set([...(latestDb.favoriteOrder || []).filter((key: string) => Boolean(nextGames[key]?.favorite)), ...canonicalFavoriteKeys]));`.
    9. Newly discovered games present on disk (`nextGames`) but missing from `virtualTree` (without a `migratedFromGameKey` match) are appended as `VirtualGameRefNode` to `virtualTree.children` at root level.
    10. After pruning missing games, recursive post-order cleanup is executed to automatically dissolve empty folders (preserving `root`).
    11. Persist the reconciled state atomically via `AtomicWriteCoordinator.mutate`.
  - In `src/renderer/startup.ts:initApp`, execute startup initialization in strict sequential order:
    1. Resolve configuration (`bootstrapData?.config` or `electronAPI.checkConfig()`).
    2. Resolve library games (`bootstrapData?.games` or `await electronAPI.getGames()`).
    3. Sequentially invoke `await electronAPI.getVirtualTree()` (or read `bootstrapData?.virtualTree`). Awaiting games resolution before `getVirtualTree()` guarantees that during rescan cycles where disk scanning occurs, scanner rescan reconciliation in `src/main/library-state/loader.ts:loadGamesForConfig` completes its physical disk inspection, reconciles game additions/deletions/moves, and writes the reconciled tree into `AtomicWriteCoordinator` before the renderer retrieves the virtual tree snapshot.
    4. If legacy custom order exists in client storage (`localStorage.getItem('yumeshelf_custom_order')`) and library games are present (`games.length > 0`): trigger one-time order import via `electronAPI.migrateVirtualWorkspace(payload)` (or `import-legacy-custom-order`). Upon successful resolution, remove legacy data via `localStorage.removeItem('yumeshelf_custom_order')`. On fresh installs (where legacy custom order is absent), zero IPC migration calls are dispatched, eliminating fresh install migration deadlock.
    5. Commit the resulting `virtualTree` and `favoriteOrder` into `UiRuntimeState`.

#### Legacy Custom Order Migration
On application startup under PRD 03, the Main process storage migration runner $M_{1 \to 2}$ authoritatively initializes root `virtualTree`, `favoriteOrder`, and `schemaVersion: 2` at storage boot. The renderer startup pipeline in `src/renderer/startup.ts:initApp` is scoped strictly to a one-time legacy custom order importer: if and only if `localStorage.getItem('yumeshelf_custom_order')` exists and valid games are present (`games.length > 0`), it reads `yumeshelf_custom_order` from `storage` (`localStorage`), reconciles stored keys against the active `games` collection, maps each entry to its canonical physical `gameKey` (`game.primaryInstance?.gameKey || game.gameKey`, resolving logical alias identifiers), filters the mapped entries through `seenCanonicalKeys = new Set<string>()` to eliminate duplicate physical keys resulting from canonical alias mapping, maps the reconciled sequence into `virtualTree.children`, extracts favorited keys into `favoriteOrder`, and dispatches an atomic compound transaction (`migrate-virtual-workspace` in `AtomicWriteCoordinator.mutate`) persisting reconciled `virtualTree` and `favoriteOrder`. Upon successful resolution, the client unconditionally deletes legacy data via `localStorage.removeItem('yumeshelf_custom_order')`. On fresh installs, `yumeshelf_custom_order` is absent, so zero migration IPC calls are dispatched. In `src/renderer/library-order.ts:normalizeCustomOrder`, expose an optional storage injection seam `storage?: Storage` (defaulting to `globalThis.localStorage`) in `normalizeCustomOrder` (and provide a corresponding `mockLocalStorage` test fixture) to guarantee deterministic headless execution in Vitest Node environments without browser window globals.

### UI Interaction & Spring-Loaded Drag Mechanics
- **Snapshot Capture & UI Rollback on Save Failure**: All interactive controllers mutating `virtualTree` (`createFolderDrillDownController`, `createCardDragGroupingController`, `createFolderDropInsertionController`, `createBreadcrumbDropController`, `createDragReorderController`) must accept an optional parameter seam `showToastPillFn?: (message: string) => void` (defaulting to `showToastPill`, with `src/renderer/ui/toast-pill.ts` guarding `typeof document !== 'undefined'`) and must capture a snapshot of previous tree state before applying in-memory modifications. Upon successful gesture completion, controllers dispatch `electronAPI.saveVirtualTree(tree)`. If the IPC call resolves with `{ ok: false }` or rejects, the controller immediately rolls back `UiRuntimeState.virtualTree` to the captured snapshot, re-renders the active grid view, and displays an error toast notification via `showToastPillFn('Failed to save folder changes')`.
- **Creation Delay**: Dragging Card A over Card B must be held for 300ms before triggering folder creation visual styling, preventing accidental grouping during simple reordering.
- **Spring-Loaded Drill-Down**: Hovering over a closed folder card or a breadcrumb link for >= 2000ms triggers an in-place grid transition into that folder while preserving the ongoing drag session. In `createDragSpringNavigationController` (and drag gesture handlers), pointer capture (`setPointerCapture`) and drag session event listeners must be attached to a persistent container element (`#virtual-folder-container`, `#game-grid-wrapper`, or `window`) that survives grid transitions, rather than to the ephemeral dragged card element, preventing `lostpointercapture` aborts during virtualized DOM card recycling. An automated test in `src/renderer/controllers/drag-spring-navigation.test.ts` verifies that pointer listeners remain active on the persistent container throughout DOM card transitions.
- **Folder Drag Insertion & Nesting Scope**: Both `VirtualGameRefNode` (game cards) and `VirtualFolderNode` (folder cards) are valid drag sources for folder drop insertion. Dropping a game card or folder card onto another closed folder card invokes standardized `VirtualTreeManager.moveNode(tree: VirtualFolderNode, sourceIdOrKey: string, targetFolderId: string, targetIndex?: number): boolean` guarded by `detectCycle` and cumulative depth clamping ($\le 16$), satisfying User Story 4.
- **Breadcrumbs Bar**: Rendered via `<nav id="breadcrumbs-bar" class="breadcrumbs-bar" style="display: none;" aria-label="Breadcrumb"></nav>` mounted directly below the header bar and above `#game-grid-wrapper` in `src/index.html` and bound in `RendererRefs` (`refs.breadcrumbsBar`). Visible in the DOM ONLY when `activeWorkspaceMode === 'library'` AND `currentPath.length > 0`. Breadcrumb item labels are set via `textContent` or HTML entity escaping to prevent XSS. When switching to "Favorite Desk", the breadcrumbs bar container is hidden (`display: none`), preserving `currentPath` in memory so that returning to "Library" mode seamlessly restores the active breadcrumb path.
- **Preview Matrix & Accessibility Hygiene**: Closed folder cards render a CSS grid containing up to 4 thumbnail icons from the first 4 child game nodes. Visible folder titles rendered on folder cards, inline renaming inputs, and folder action menus MUST be assigned via `element.textContent = folderName` or sanitized via `escapeHtml(folderName)` prior to HTML template interpolation. Accessibility labels must be assigned safely via `element.setAttribute('aria-label', ...)` or by escaping `folderName` via `escapeHtml(folderName)` before interpolation to prevent DOM attribute injection vulnerabilities.
- **Navigation Stack Auto-Clamping**:
  When a virtual folder is dissolved via its context menu or pruned during library rescan reconciliation due to disk deletions, the renderer navigation controller must validate `currentPath: string[]` against the updated `virtualTree`. If the currently viewed folder or any ancestor in `currentPath` no longer exists, `currentPath` must automatically clamp to the nearest surviving ancestor, or fallback to `root` (`[]`), immediately re-rendering child items and updating the breadcrumbs bar.
- **Uniform Grid Virtualization & Windowing**:
  - Implement virtualized grid viewport windowing and DOM recycling uniformly across all item counts in Virtual Folder mode. The number of simultaneously mounted DOM cards is computed dynamically:
    `activeCardCount = (Math.ceil(viewportHeight / (cardHeight + gapPx)) + overscanRows * 2) * columnCount`
    This bounds memory usage while guaranteeing viewports on high-resolution displays (e.g. 1440p, 4K) never experience card starvation or blank grid gaps.
  - Spring-loaded drag-and-drop hit testing, coordinate-to-item mapping, and edge auto-scrolling calculate target positions exclusively using a single virtual data coordinate pipeline rather than branching on item count or querying unmounted DOM elements.
- **Operational Parameter Seams**:
  Headless operational utilities in `src/renderer/utils/` must accept configurable parameter interfaces and must not hardcode internal operational constants:
  - `IClock` and `MockClock`:
    ```typescript
    export interface IClock {
      now(): number;
      setTimeout(callback: () => void, ms: number): any;
      clearTimeout(id: any): void;
      requestAnimationFrame?(callback: (timestamp: number) => void): any;
      cancelAnimationFrame?(id: any): void;
    }
    export interface MockClock extends IClock {
      advanceTime(ms: number): void;
      getPendingTimerCount(): number;
      requestAnimationFrame(callback: (timestamp: number) => void): any;
      cancelAnimationFrame(id: any): void;
    }
    ```
    In `MockClock`, implement concrete shared test utility factory `createMockClock(): MockClock` (in `src/shared/testing/mock-clock.ts` or `src/renderer/testing/mock-clock.ts`). Specify that `MockClock.advanceTime(ms: number)` executes queued `requestAnimationFrame` callbacks in discrete, bounded 16ms frame steps rather than draining the queue in an unbounded `while (queue.length > 0)` loop, invoking queued callbacks with `clock.now()` timestamps and preventing infinite recursion when callbacks continuously re-queue themselves via `rAF(loop)`. This guarantees animation loops in `drag-edge-scroll.test.ts` and `drag-spring-navigation.test.ts` advance deterministically without freezing.
  - `DragGestureOptions`:
    ```typescript
    export interface DragGestureOptions {
      creationDelayMs?: number;           // default: 300
      dwellDelayMs?: number;              // default: 2000
      velocityThresholdPxPerSec?: number; // default: 500
      slopPx?: number;                    // default: 10
    }
    ```
  - `WindowingOptions`:
    ```typescript
    export interface WindowingOptions {
      cardWidth?: number;                 // default: 200
      cardHeight?: number;                // default: 252
      gapPx?: number;                     // default: 20
      overscanRows?: number;              // default: 1
    }

    export interface VirtualGridHitResult {
      itemIndex: number;
      rowIndex: number;
      colIndex: number;
    }

    export function calculateVirtualGridHit(
      pointerX: number,
      pointerY: number,
      containerRect: { top: number; left: number; width: number; height: number },
      scrollTop: number,
      totalItems: number,
      options?: WindowingOptions
    ): VirtualGridHitResult | null;
    ```
    The grid viewport controller (`createVirtualizedGridController`) in Phase 2 accepts optional parameter seams `windowingOptions?: WindowingOptions` and `resizeObserverClass?: any`, defensively guards observer initialization via `if (typeof ResizeObserver !== 'undefined' || options?.resizeObserverClass)`, propagates `windowingOptions` directly to `calculateWindowingBounds` in `src/renderer/utils/virtual-grid-windowing.ts` for headless testability, disconnects the observer in `dispose(): void`, and permits injecting a mock observer in headless unit test suites. In Phase 4, the drag reorder controller (`createDragReorderController`) and intermediate gesture controllers accept optional parameter seams `dragGestureOptions?: DragGestureOptions`, `autoScrollOptions?: AutoScrollOptions`, and `clock?: IClock`, propagating them directly to `DragGestureTimer` (for deterministic testability with `MockClock`) and `calculateEdgeScrollVelocity`, and exposing `dispose(): void` for teardown.
  - `PreviewOptions`:
    ```typescript
    export interface PreviewOptions {
      maxThumbnails?: number;             // default: 4
      maxDepth?: number;                  // default: 2
    }
    ```
  - `AutoScrollOptions`:
    ```typescript
    export interface AutoScrollOptions {
      edgeThresholdPx?: number;       // default: 40
      maxVelocityPx?: number;         // default: 25 (per-frame ceiling)
      scrollStepMultiplier?: number;  // default: 1.5
    }

    export function calculateEdgeScrollVelocity(
      pointerY: number,
      containerRect: { top: number; bottom: number },
      options?: AutoScrollOptions
    ): number;
    ```
- **Architectural Landing Locations for Operational Utilities**:
  - `[NEW] src/shared/types/clock.ts` or `src/shared/virtual-tree/types.ts` (`IClock`, `MockClock`)
  - `[NEW] src/renderer/utils/gesture-timer.ts` (`DragGestureOptions`, re-exported `IClock`, `dispose()`)
  - `[NEW] src/renderer/utils/virtual-grid-windowing.ts` (`WindowingOptions`, `AutoScrollOptions`, `calculateVirtualGridHit`, `calculateEdgeScrollVelocity`)
  - `[NEW] src/renderer/utils/folder-preview.ts` (`PreviewOptions`)
  - `[NEW] src/main/library-state/write-coordinator.ts` (`AtomicWriteCoordinator`, `dispose()`)
  - Animation frame provider resolution in `createDragEdgeScrollController` and `createDragSpringNavigationController`:
    ```typescript
    const rAF = clock?.requestAnimationFrame
      ? ((cb: (timestamp: number) => void) => clock.requestAnimationFrame(cb))
      : (typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame
        : (cb: (timestamp: number) => void) => (clock ? clock.setTimeout(() => cb(clock.now()), 16) : setTimeout(() => cb(Date.now()), 16)));
    const cAF = clock?.cancelAnimationFrame
      ? ((id: any) => clock.cancelAnimationFrame(id))
      : (typeof cancelAnimationFrame === 'function'
        ? cancelAnimationFrame
        : (id: any) => (clock ? clock.clearTimeout(id) : clearTimeout(id)));
    ```
  - In `createGlobalSearchController`: add injectable parameter seams `clock?: IClock` and `debounceMs?: number` (default: 150ms, 0 in test harnesses).

### Workspace Modes & Header Layout
- Header layout: `[Logo/Title] [Search Input] [Favorite Desk / Library Toggle Icon] [Refresh] [Sort Dropdown] [Settings]`. The Header Workspace Mode Toggle (`<button class="header-icon-btn workspace-mode-toggle-btn" id="workspace-mode-toggle-btn" style="display: none;" type="button" aria-label="Toggle Workspace Mode"></button>`) is explicitly mounted in `src/index.html` (inside `.controls` adjacent to `#sort-btn`) and registered as `refs.workspaceToggleBtn` in `dom-refs.ts` during Phase 1 scaffolding (`08.1`). It is conditionally hidden (`display: none`) whenever `config.legacyMode === true`, and rendered visible only when `config.legacyMode === false` (symmetrical to `#category-filter-container` and `#legacy-grid-container`), verified via `src/renderer/bootstrap/dom-shell-isolation.test.ts`.
- **Favorite Desk**: Displays a flat grid of all games with `favorite === true`, supporting custom reordering and sort presets independently of folder hierarchy. Operates as a strictly flat 1D grid with folder creation and folder dropping disabled.
- **Library**: Displays the virtual folder hierarchy at the current drill-down path.
- **Heterogeneous Virtual Folder Children Sorting**:
  - Accept canonical UI sort keys: `'date'` (alias for `'dateAdded'`), `'played'` (alias for `'lastPlayed'`), `'az'`, and `'custom'`.
  - **`custom` mode**: Children maintain their exact sequence in `node.children` without folder-pinning partitioning.
  - **`az` mode**: Folders are pinned at top sorted alphabetically by `name`; games are listed below sorted alphabetically by resolved game title.
  - **`played` / `date` modes**: Folders are pinned at top sorted by `name` or `dateCreated`; games are listed below sorted by `lastPlayed` or `dateAdded`.
- **Global Search**: Search bar queries across all games in the library, requiring that query matching and match highlighting in `createGlobalSearchController` either escape regex metacharacters (`query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')`) or utilize case-insensitive substring searching (`String.prototype.includes` / `indexOf`) and safe string splitting to prevent unhandled `SyntaxError` crashes, require that match highlighting construct DOM nodes safely using `document.createElement('mark')` and `document.createTextNode()`, or pass all non-matching string segments through `escapeHtml(...)` before template string assembly (preventing DOM-based XSS when titles contain special characters), displaying parent path badges (e.g., `In: Visual Novels / Key`) and empty state query banners (`No games found matching '{query}'`), strictly encoding text via `textContent` or HTML entity escaping to prevent XSS. Clearing search restores the user to their previous folder drill-down location.
- **Category Filter Inactivation**:
  When Virtual Folder Mode is active (`config.legacyMode === false`), the Category filter container element (`#category-filter-container`, accessed via `domRefs.containers.categoryFilter`) is completely hidden from the header and its filtering logic bypassed in the state manager. In Legacy Mode (`config.legacyMode === true`), `#category-filter-container` remains active and visible.

### Downstream Continuity & Extension Seams
To guarantee seamless architectural continuity with planned downstream epics while preventing feature creep or duplicate implementations (per `Context.md` Decision 7):
- **Card Action Menu Extension Seam (Epic 04 Marketplace & Tool Manager)**: Folder and game card context menus must expose a pluggable action item provider hook (`cardActionMenuProviders?: Array<ICardActionMenuProvider>`). Downstream Epic 04 will register cascading community tools, task runners, and custom launch actions through this seam without modifying card rendering or DOM structure.
- **Platform-Agnostic Gesture & Shortcut Seams (Epic 05 macOS Implementation)**: Viewport controllers, gesture listeners, and keyboard handlers must consume normalized keyboard and pointer abstractions (`IClock`, standard `KeyboardEvent.code` mappings such as `Backspace`/`Delete` for navigating up hierarchies), ensuring downstream Epic 05 operates on macOS without altering gesture state machines or timing constants.
- **Strict Anti-Duplication Enforcement**: Epic 03 strictly prohibits implementing, duplicating, or anticipating downstream capabilities. It must NOT contain community tool registries, task runner supervisors, or macOS-specific process adapters.

## Testing Decisions & Verification Plan

### 1. Automated Test Execution Commands

#### Main Process & Shared Module Test Suites (Node Native Runner)
Executed via `npm run test:single -- <path>` or `node --test "<path>"` (requires prior compilation via `npm run compile:main` or `npm run build:main` to generate CommonJS artifacts in `dist/main/` and `dist/shared/`):
```bash
npm run test:single -- tests/virtual-tree-invariants.test.js
npm run test:single -- tests/virtual-folder-tree.test.js
npm run test:single -- tests/write-coordinator.test.js
npm run test:single -- tests/virtual-tree-persistence.test.js
npm run test:single -- tests/settings-sync.test.js
npm run test:single -- tests/rescan-tree-lifecycle.test.js
npm run test:single -- tests/library-state.test.js
```
- **Discrete Output Assertions**:
  - `tests/virtual-tree-invariants.test.js`: stdout contains `'✔ VirtualTree invariants'` and `'ℹ pass 12'` with exit code 0.
  - `tests/virtual-folder-tree.test.js`: stdout contains `'✔ VirtualTreeManager reducer'` and `'ℹ pass 15'` with exit code 0.
  - `tests/write-coordinator.test.js`: stdout contains `'✔ AtomicWriteCoordinator'` and `'ℹ pass 8'` with exit code 0.
  - `tests/virtual-tree-persistence.test.js`: stdout contains `'✔ virtual-tree IPC persistence'` and `'ℹ pass 10'` with exit code 0.
  - `tests/settings-sync.test.js`: stdout contains `'✔ registerMainIpc syncs'` and `'ℹ pass 3'` with exit code 0.
  - `tests/rescan-tree-lifecycle.test.js`: stdout contains `'✔ rescan reconciliation'` and `'ℹ pass 9'` with exit code 0.
  - `tests/library-state.test.js`: stdout contains `'✔ scan exposes nested games'` and `'ℹ pass 13'` with exit code 0.

#### Renderer UI & Component Test Suites (Vitest Runner)
Executed via `npm run test:vitest -- <path>`:
```bash
npm run test:vitest -- src/renderer/bootstrap/dom-shell-isolation.test.ts
npm run test:vitest -- src/renderer/controllers/settings-legacy-toggle.test.ts
npm run test:vitest -- src/renderer/state/ui-runtime-state.test.ts
npm run test:vitest -- src/renderer/lifecycle/custom-order-migration.test.ts
npm run test:vitest -- src/renderer/utils/folder-preview.test.ts
npm run test:vitest -- src/renderer/ui-components/folder-card.test.ts
npm run test:vitest -- src/renderer/utils/virtual-grid-windowing.test.ts
npm run test:vitest -- src/renderer/utils/folder-sort.test.ts
npm run test:vitest -- src/renderer/views/folder-grid-view.test.ts
npm run test:vitest -- src/renderer/controllers/folder-drill-down.test.ts
npm run test:vitest -- src/renderer/controllers/folder-navigation.test.ts
npm run test:vitest -- src/renderer/controllers/workspace-views.test.ts
npm run test:vitest -- src/renderer/state/favorite-sync.test.ts
npm run test:vitest -- src/renderer/search/global-search.test.ts
npm run test:vitest -- src/renderer/utils/drag-gestures.test.ts
npm run test:vitest -- src/renderer/controllers/drag-reorder.test.ts
npm run test:vitest -- src/renderer/controllers/card-drag-grouping.test.ts
npm run test:vitest -- src/renderer/controllers/folder-drop-insertion.test.ts
npm run test:vitest -- src/renderer/controllers/breadcrumb-drop.test.ts
npm run test:vitest -- src/renderer/controllers/drag-edge-scroll.test.ts
npm run test:vitest -- src/renderer/controllers/drag-spring-navigation.test.ts
```
- **Pass Criteria**: Each Vitest command standard output contains '✓ ' followed by the relative path from 'src/' (e.g. '✓ renderer/bootstrap/dom-shell-isolation.test.ts'), reports 'Test Files  1 passed (1)' with 0 failed test suites, and exits with process code 0.

### 2. Pass Criteria, Teardown & Handle Cleanup Assertions
- All test suites must complete with 0 failed assertions and process exit code 0.
- All stateful controllers, gesture timers, and coordinators (`createFolderDrillDownController`, `createFolderNavigationController`, `createBreadcrumbDropController`, `createDragEdgeScrollController`, `createDragSpringNavigationController`, `createWorkspaceViewsController`, `createGlobalSearchController`, `createSettingsLegacyToggleController`, `createVirtualizedGridController`, `createDragReorderController`, `createCardDragGroupingController`, `createFolderDropInsertionController`, `createFavoriteSyncController`, `DragGestureTimer`, `AtomicWriteCoordinator`) must implement explicit `dispose(): void` methods.
- Test suites must invoke `afterEach(() => controller.dispose())` to guarantee zero timer leaks, DOM listener leaks, unhandled rejections, or open file descriptors across tests and hot-reloads.

### 3. Edge-Case Verification Matrix

| User Story | Core Behavior / Edge Case | Test Suite & Verification Method |
| :--- | :--- | :--- |
| **US 1** | Drag card over card with 300ms hold delay to create new folder | `src/renderer/controllers/card-drag-grouping.test.ts` (MockClock 300ms trigger) |
| **US 2** | Drag card onto existing closed folder card to insert | `src/renderer/controllers/folder-drop-insertion.test.ts` (MoveNode invocation) |
| **US 3** | Hover dragged card over closed folder for 2000ms to spring-open | `src/renderer/controllers/drag-spring-navigation.test.ts` (MockClock 2000ms transition) |
| **US 4** | Drag folder into folder up to depth 16; reject circular moves | `tests/virtual-tree-invariants.test.js`, `src/renderer/controllers/folder-drop-insertion.test.ts` |
| **US 5** | Closed folder cards render 2x2 preview matrix (1-4 icons) | `src/renderer/utils/folder-preview.test.ts`, `src/renderer/ui-components/folder-card.test.ts` |
| **US 6** | Click folder card or press Enter to drill down in-place | `src/renderer/controllers/folder-drill-down.test.ts` (Grid transition & focus) |
| **US 7** | Semantic breadcrumbs bar below header with 1-click jump back | `src/renderer/controllers/folder-navigation.test.ts` (Click navigation & escaping) |
| **US 8** | Drop card onto breadcrumb to reparent; 2000ms hover drill-up | `src/renderer/controllers/breadcrumb-drop.test.ts`, `src/renderer/controllers/drag-spring-navigation.test.ts` |
| **US 9** | Automatically delete/dissolve empty folder when last game leaves | `tests/virtual-folder-tree.test.js` (PruneEmptyFolders recursive cleanup) |
| **US 10** | Dissolve folder via context menu moving items to parent | `tests/virtual-folder-tree.test.js`, `src/renderer/controllers/folder-drill-down.test.ts` |
| **US 11** | Inline rename folder via title double-click or context menu | `tests/virtual-folder-tree.test.js`, `src/renderer/ui-components/folder-card.test.ts` |
| **US 12** | 1-click header icon toggle between Favorite Desk and Library | `src/renderer/controllers/workspace-views.test.ts` (SVG toggle click & IPC update) |
| **US 13** | Favorite Desk flat grid with independent sorting presets | `src/renderer/controllers/workspace-views.test.ts` (Sorting & empty state) |
| **US 14** | Library view displays hierarchical folders and root cards | `src/renderer/views/folder-grid-view.test.ts` (Windowed partition rendering) |
| **US 15** | Global optimistic favorite star toggle with rollback on IPC error | `src/renderer/state/favorite-sync.test.ts`, `tests/virtual-tree-persistence.test.js` |
| **US 16** | Global search across folders with ancestry badges & restore | `src/renderer/search/global-search.test.ts` (Query matching, debounce seam & clear restore) |
| **US 17** | Legacy Mode settings toggle cleanly switches grids without loss | `src/renderer/controllers/settings-legacy-toggle.test.ts`, `src/renderer/bootstrap/dom-shell-isolation.test.ts` |
| **US 18** | Virtual folders persist in `db.json` across restarts and flushSync | `tests/write-coordinator.test.js`, `tests/virtual-tree-persistence.test.js` |
| **US 19** | Rescan discovers new physical games and adds to Library root | `tests/rescan-tree-lifecycle.test.js` (Root append & deduplication) |
| **US 20** | Rescan prunes deleted games symmetrically from tree & favorites | `tests/rescan-tree-lifecycle.test.js` (Symmetrical pruning & empty folder cleanup) |
| **US 21** | Launch, playtime, save editor, translation work inside folders | `src/renderer/views/folder-grid-view.test.ts`, `src/renderer/ui-components/folder-card.test.ts` |
| **Tech 1** | Pointer cancel, target switch, or velocity > 500px/s aborts dwell | `src/renderer/utils/drag-gestures.test.ts` (Timer cancellation) |
| **Tech 2** | Dynamic grid card recycling and virtual viewport edge auto-scrolling | `src/renderer/utils/virtual-grid-windowing.test.ts`, `src/renderer/controllers/drag-edge-scroll.test.ts` |
| **Tech 3** | Heterogeneous virtual folder children sorting (custom, az, played, date) | `src/renderer/utils/folder-sort.test.ts` |
| **Tech 4** | Drag reorder velocity clamping and drop index calculation | `src/renderer/controllers/drag-reorder.test.ts` |
| **Tech 5** | UI runtime state initialization, tree caching, and reactive observers | `src/renderer/state/ui-runtime-state.test.ts` |
| **Tech 6** | Legacy custom order migration transactional seeding and gating | `src/renderer/lifecycle/custom-order-migration.test.ts` |
| **Tech 7** | Pluggable card action menu provider hook (`cardActionMenuProviders`) | `src/renderer/ui-components/folder-card.test.ts` (Extension seam rendering) |

## Out of Scope

- **Automatic Version Parsing**: Automatically guessing SemVer strings (`v1.0.3`, `0.15b`) across arbitrary indie upload naming conventions is out of scope. Users can organize versions manually via virtual folders or card renaming.
- **In-App Archive Extraction / File Moving**: YumeShelf will NOT move, unzip, or manage physical archive files on disk. The filesystem remains strictly read-only and non-destructive.
- **Sandboxed VM Execution**: Running games inside ephemeral Windows Sandbox / Hyper-V containers or managing VM save sync pipelines is out of scope.
- **Downstream Epic Capabilities (Epics 04 & 05)**: Community add-on registries, tool runners, cascading marketplace menus (belonging to Epic 04), and macOS-specific process supervisors or Wine/Whisky runners (belonging to Epic 05) are strictly out of scope. Epic 03 exposes clean extension seams (`cardActionMenuProviders`, `IClock`) without implementing downstream features.

## Further Notes

- Keyboard accessibility: Pressing `Escape` or `Backspace` inside a folder navigates up one level in the breadcrumbs hierarchy. Pressing `Enter` on a focused folder card opens it.
