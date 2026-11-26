# 01 — Shelf Tabs Horizontal Drag-and-Drop Reordering ($B$)

## Epic
[Epic 09.2: Folder Drag-and-Drop Reordering & Card FLIP Animation](file:///d:/Projects/YumeShelf/docs/specs/09.2-folder-dnd-and-card-flip/PRD.md)

## Status
ready-for-agent

## Blocked by
- [00 — Preparatory Refactoring: @dnd-kit Dependencies, Settings Library Tab & Drag Tokens ($S$)](file:///d:/Projects/YumeShelf/docs/specs/09.2-folder-dnd-and-card-flip/tickets/00-preparatory-dnd-deps-settings-tab-and-tokens.md)

## What to Build
> **Scope Guard:** Implement only horizontal drag reordering on `ShelfTabs.tsx` and its persistence callback in `LibraryGrid.tsx`; preserve all Epic 09.1 tab selection, roving `tabIndex`, zero-favorite fallback, and overflow scroll behavior. Do NOT alter, restyle, or remove anything unasked.

Add `@dnd-kit` horizontal drag-and-drop reordering to `ShelfTabs.tsx`:

- [ ] 1. **[NEW]** [`src/renderer/components/SortableTabItem.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/SortableTabItem.tsx), **[MODIFY]** [`src/renderer/components/ShelfTabs.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/ShelfTabs.tsx), & **[MODIFY]** [`src/styles/folder-sort.css`](file:///d:/Projects/YumeShelf/src/styles/folder-sort.css) — **Horizontal `@dnd-kit` Tab Reordering**:
  - Add optional `onTabReorder?: (oldOrder: readonly string[], newOrder: readonly string[], movedPath?: string) => Promise<void> | void` and `onShowToast?: (message: string) => void` props on `ShelfTabs.tsx` while preserving existing `effectiveTabId`, `resolveFallbackEffectiveTabId`, and `targetPlatform?: PlatformInput` (zero direct `electronAPI` or `useNotification()` coupling inside `ShelfTabs.tsx`).
  - Wrap draggable folder tabs (only folder tabs, never pinned `"All Folders"` or `"Favorites"`) in `DndContext` and `SortableContext` with `horizontalListSortingStrategy`, `PointerSensor` (`distance: 5`), and `KeyboardSensor` configured with `{ coordinateGetter: sortableKeyboardCoordinates }` imported from `@dnd-kit/sortable` (so folder tabs up to `240px` wide reorder across adjacent tabs in a single `ArrowRight` step). Mount `<DndContext>` outside `<div className="shelf-tabs-list" role="tablist">` (keeping `<SortableContext>` inside `role="tablist"` around the folder `<SortableTabItem>`s) so `@dnd-kit`'s internal `<DndLiveRegion role="status">` is not rendered as a direct child of `role="tablist"`:
    ```ts
    import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';

    const sensors = useSensors(
      useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
      useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );
    ```
    Track active tab drag state (`const [activeDragTabId, setActiveDragTabId] = useState<string | null>(null);`, deriving `isDraggingTab = activeDragTabId !== null`) via `DndContext`'s `onDragStart` (`setActiveDragTabId(String(active.id))`), `onDragEnd` (calling `setActiveDragTabId(null)` **synchronously** at the very start of `onDragEnd` before `if (!over || active.id === over.id) return;` and before `await onTabReorder(...)`), and `onDragCancel` (`setActiveDragTabId(null)`).
  - In `SortableTabItem.tsx`, wrap the component in `React.forwardRef<HTMLButtonElement, SortableTabItemProps>` and merge `useSortable`'s `setNodeRef` with `forwardedRef` via a `useCallback` ref handler:
    ```tsx
    export const SortableTabItem = React.forwardRef<HTMLButtonElement, SortableTabItemProps>(
      function SortableTabItem({ id, isActive, onTabKeyDown, index, ... }, forwardedRef) {
        const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
        const mergedRef = useCallback(
          (node: HTMLButtonElement | null) => {
            setNodeRef(node);
            if (typeof forwardedRef === 'function') {
              forwardedRef(node);
            } else if (forwardedRef) {
              forwardedRef.current = node;
            }
          },
          [setNodeRef, forwardedRef]
        );
        ...
        return <button ref={mergedRef} {...attributes} role="tab" tabIndex={isActive ? 0 : -1} ... />;
      }
    );
    ```
    In `ShelfTabs.tsx`, pass `ref={(node) => { if (node) tabRefs.current.set(tab.id, node); else tabRefs.current.delete(tab.id); }}` to `<SortableTabItem>` so `tabRefs.current.get(targetTab.id)?.focus()` and `tabEl?.scrollIntoView?.(...)` receive the live `HTMLButtonElement`. Spread `{...attributes}` *before* `role="tab"` and `tabIndex={isActive ? 0 : -1}` (or omit `role` and `tabIndex` from `attributes`), dim the stationary source `SortableTabItem` when `isDragging` is `true` (`style={{ ...sortableStyle, opacity: isDragging ? 0.4 : undefined }}`), and compose `onKeyDown` so both `listeners?.onKeyDown?.(e)` and `handleTabKeyDown(e, index)` execute without overwriting roving arrow/Home/End navigation. Update the guard at the top of `handleTabKeyDown` in `ShelfTabs.tsx` to `if (event.defaultPrevented || isDraggingTab) return;` so `@dnd-kit`'s `KeyboardSensor` (whose `window`-level bubble-phase `keydown` listener runs after React's `onKeyDown`) does not also switch the active tab and steal DOM focus when handling `ArrowLeft`/`ArrowRight` during a keyboard drag.
  - Pinned Tab Protection: reject insertion before or between pinned tabs (`"All Folders"`, `"Favorites"`).
  - Render the matching active tab inside `<DragOverlay style={{ zIndex: 'var(--zIndex-tab-drag, 500)', pointerEvents: 'none' }}>` with the `is-drag-overlay` class on `.shelf-tab` when `activeDragTabId !== null`, and add `.shelf-tab.is-drag-overlay` in `src/styles/folder-sort.css` (`background: var(--card-bg); border-color: var(--accent); color: var(--text-main); box-shadow: var(--menu-shadow);`) so inactive transparent tabs remain opaque over adjacent tabs during drag.
  - On `onDragEnd`:
    - Reset drag state synchronously (`setActiveDragTabId(null)`), then apply null/cancelled-drop & identity guard before `arrayMove`:
      ```ts
      setActiveDragTabId(null);
      if (!over || active.id === over.id) return;
      const oldIndex = orderedIds.indexOf(String(active.id));
      const newIndex = orderedIds.indexOf(String(over.id));
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;
      ```
    - Keep `ShelfTabs.tsx` pure over `sections` (`FolderSection[]`): store `optimisticOrder: readonly string[] | null` (when `optimisticOrder` is active, derive the rendered folder tabs by mapping `optimisticOrder` against the live `sections` map — filtering out any removed paths and appending any newly added `sections` not present in `optimisticOrder` — and fall back to `propOrder` when `optimisticOrder` is `null`), track `commitSeqRef = useRef(0)`, `pendingCommitsRef = useRef(0)`, and `needsPropSyncRef = useRef(false)`, and clear `optimisticOrder` ONLY on current-sequence failure OR when external `sections` props sync after all in-flight commits finish:
      ```ts
      const commitSeqRef = useRef(0);
      const pendingCommitsRef = useRef(0);
      const needsPropSyncRef = useRef(false);
      const sectionsOrderKey = sections.map((s) => s.path).join('\0');

      useEffect(() => {
        if (pendingCommitsRef.current === 0) {
          needsPropSyncRef.current = false;
          setOptimisticOrder(null);
        } else {
          needsPropSyncRef.current = true;
        }
      }, [sectionsOrderKey]);
      ```
    - Compute `oldOrder` and `newOrder` over `orderedIds`, optimistically update `optimisticOrder`, and `await onTabReorder?.(oldOrder, newOrder, movedPath)`. In `catch (err)` (importing `sanitizeUserPaths` from `../../shared/path-sanitizer`): always log sanitized error diagnostics, and roll back `optimisticOrder` + invoke `onShowToast?.(strings.toast_tab_reorder_failed)` ONLY when `seq === commitSeqRef.current` (suppressing stale UI rollback and stale toast on superseded drags while never swallowing failed IPC diagnostics):
      ```ts
      const seq = ++commitSeqRef.current;
      pendingCommitsRef.current += 1;
      needsPropSyncRef.current = false;
      setOptimisticOrder(newOrder);
      try {
        await onTabReorder?.(oldOrder, newOrder, movedPath);
      } catch (err) {
        console.error('[ShelfTabs] Failed to reorder folder tabs:', {
          movedPath: sanitizeUserPaths(movedPath ?? ''),
          error: sanitizeUserPaths(err instanceof Error ? err.message : String(err)),
          stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
        });
        if (seq === commitSeqRef.current) {
          setOptimisticOrder(null);
          onShowToast?.(strings.toast_tab_reorder_failed);
        }
      } finally {
        pendingCommitsRef.current -= 1;
        if (pendingCommitsRef.current === 0 && needsPropSyncRef.current) {
          needsPropSyncRef.current = false;
          setOptimisticOrder(null);
        }
      }
      ```
- [ ] 2. **[MODIFY]** [`src/shared/path-subsumption.ts`](file:///d:/Projects/YumeShelf/src/shared/path-subsumption.ts) & **[MODIFY]** [`src/renderer/components/LibraryGrid.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/LibraryGrid.tsx) — **NFD/NFC Normalization & `onTabReorder` Persistence / Subsumption**:
  - In `src/shared/path-subsumption.ts` (`normalizePathForPlatform`), normalize Unicode to `'NFC'` when `resolved === 'darwin'` (`const input = resolved === 'darwin' ? p.normalize('NFC') : p;` before trimming/cleaning) so `normalizePathForPlatform`, `isSubsumedBy`, `subsumeLibraryPaths`, and `reorderLibraryPathsWithSubsumption` handle APFS/HFS+ NFD paths symmetrically with `normalizeLibraryPath` (`getCanonicalRoots`).
  - Pass `onTabReorder` and `onShowToast` to `<ShelfTabs />`. Inside `LibraryGrid.tsx`'s `onTabReorder` handler, guard with a monotonic `reorderSeqRef` (`const seq = ++reorderSeqRef.current`) so stale resolved `updateLibraryConfig` responses do not call `dispatch.setCurrentLibraryConfig` out of order, compute the full bijective configuration permutation using `rootPaths` (`currentLibraryConfig.libraryPaths`) before IPC persistence, and sync `useLibraryState()` on success:
    ```ts
    const seq = ++reorderSeqRef.current;
    const nextLibraryPaths = reorderLibraryPathsWithSubsumption(
      [...rootPaths],
      [...newOrder],
      targetPlatform
    );
    const updatedConfig = await api?.updateLibraryConfig?.({ libraryPaths: nextLibraryPaths });
    const latestConfig = store.getSnapshot().currentLibraryConfig;
    if (seq === reorderSeqRef.current) {
      const nextConfig = updatedConfig ?? (latestConfig ? { ...latestConfig, libraryPaths: nextLibraryPaths } : null);
      if (nextConfig) {
        dispatch.setCurrentLibraryConfig(nextConfig);
      }
    }
    ```
  - Let `onTabReorder` propagate any IPC rejection cleanly to `ShelfTabs.tsx`'s catch boundary (single-point sanitized logging without duplicate logs).
- [ ] 3. **[MODIFY]** [`src/shared/path-subsumption.test.ts`](file:///d:/Projects/YumeShelf/src/shared/path-subsumption.test.ts), **[MODIFY]** [`src/renderer/components/ShelfTabs.test.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/ShelfTabs.test.tsx), & **[MODIFY]** [`src/renderer/components/LibraryGrid.test.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/LibraryGrid.test.tsx) — **Vitest Unit & Component Tests**:
  - In `src/shared/path-subsumption.test.ts`, add a concrete `darwin` NFD/NFC test case verifying `reorderLibraryPathsWithSubsumption` preserves exact output array order and original NFD/NFC configured strings for both parent roots and subsumed child paths when `allConfiguredPaths` contains NFD strings and `reorderedRootPaths` contains NFC `section.path` strings.
  - Verify in `ShelfTabs.test.tsx` that:
    - Horizontal drag reorder invokes `onTabReorder(oldOrder, newOrder, movedPath)`, protects pinned tabs from displacement, preserves `role="tab"`, roving `tabIndex`, and arrow/Home/End keyboard navigation on `SortableTabItem`-wrapped folder tabs (asserting that pressing `ArrowRight` / `ArrowLeft` / `Home` / `End` moves `document.activeElement` synchronously to the target folder `<button role="tab">` element, not just invoking `onTabSelect`); in the `KeyboardSensor` (`Space` -> `ArrowRight` -> `Space`) reorder test, mock `Element.prototype.getBoundingClientRect` on `.shelf-tab` elements with realistic non-overlapping widths `>= 80px` (e.g., `120px` per tab, `left: index * 120`, `width: 120`, restored in `afterEach`) so a single `ArrowRight` step genuinely exercises `sortableKeyboardCoordinates`, and assert that `onTabSelect` is NOT invoked when `ArrowRight` is pressed while a keyboard drag is active, and that pressing `ArrowRight` *after* the keyboard drag completes (and after an `Escape` cancel) resumes invoking `onTabSelect` normally.
    - Cancelled/off-target drops (`over === null`) are no-ops, and external `sections` prop updates sync cleanly.
    - `<DragOverlay>` renders the active tab label during drag, clears on drop (`onDragEnd`) and `Escape` (`onDragCancel`), and sets `style.opacity === '0.4'` on the stationary source `SortableTabItem` while dragging.
    - Rejected `onTabReorder` rolls back local tab order, calls `onShowToast(strings.toast_tab_reorder_failed)`, and emits sanitized `console.error` (no raw `<USER_DIR>` paths).
    - Deterministic deferred-Promise concurrent-drag test (zero `setTimeout`/real timers): when Drag #1 rejects after Drag #2 resolves, Drag #2's order is preserved and `onShowToast` is suppressed for the superseded Drag #1 rejection.
  - **Anti-Tautology Test-Harness Invariant (`happy-dom`)**: Tests verifying `role="tab"`, `tabIndex`, `onKeyDown` composition, and `DndContext` behavior **MUST NOT** mock `@dnd-kit/sortable` (`useSortable` `attributes`/`listeners`) or replace `DndContext` with a trivial stub. Exercise real `@dnd-kit/core` and `@dnd-kit/sortable` in `happy-dom` using `KeyboardSensor` (`Space` -> `Arrow*` -> `Space`) or `PointerSensor` with mocked `Element.prototype.getBoundingClientRect` on sortable elements (restored in `afterEach`).
  - Verify in `LibraryGrid.test.tsx` that `onTabReorder` preserves subsumed child paths via `reorderLibraryPathsWithSubsumption(rootPaths, ...)` (including a `darwin` NFD-configured `rootPaths` vs NFC-projected `newOrder` test case) and calls `dispatch.setCurrentLibraryConfig` on success (ignoring stale out-of-order responses).

## Acceptance Criteria
- [ ] Draggable folder tabs reorder horizontally via `@dnd-kit` (including single-step `KeyboardSensor` reordering via `sortableKeyboardCoordinates` across folder tabs up to `240px` wide), pass `oldOrder`/`newOrder` over `sections` to `onTabReorder`, normalize `darwin` NFD/NFC paths in `normalizePathForPlatform`, compute canonical `libraryPaths` permutation via `reorderLibraryPathsWithSubsumption(rootPaths, ...)`, persist via `updateLibraryConfig`, and update `dispatch.setCurrentLibraryConfig` (guarded by monotonic sequence refs against out-of-order responses).
- [ ] Pinned tabs (`"All Folders"`, `"Favorites"`) cannot be dragged or displaced; `over === null` drops are no-ops; `<DragOverlay>` renders the active tab preview during drag (clearing on drop/cancel) while dimming the source `SortableTabItem` (`opacity: 0.4`); `role="tab"`, roving `tabIndex`, `forwardRef` + merged `setNodeRef` ref forwarding (`document.activeElement` moves synchronously to the target folder `<button role="tab">`), and arrow/Home/End navigation are preserved on `SortableTabItem`-wrapped folder tabs.
- [ ] Failed persistence logs sanitized `console.error` (no raw `<USER_DIR>` paths), rolls back local tab order cleanly with `toast_tab_reorder_failed` when current, and suppresses stale rollback/toast when superseded by a newer drag.
- [ ] Execute automated verification command: `npm run test:vitest -- src/shared/path-subsumption.test.ts src/renderer/components/ShelfTabs.test.tsx src/renderer/components/LibraryGrid.test.tsx && npm run typecheck`.

## Verification Command
```bash
npm run test:vitest -- src/shared/path-subsumption.test.ts src/renderer/components/ShelfTabs.test.tsx src/renderer/components/LibraryGrid.test.tsx && npm run typecheck
```
