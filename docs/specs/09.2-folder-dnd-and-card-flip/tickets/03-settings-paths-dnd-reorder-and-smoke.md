# 03 — Settings Library Paths Drag Reorder & Runtime Smoke Gate ($B$)

## Epic
[Epic 09.2: Folder Drag-and-Drop Reordering & Card FLIP Animation](file:///d:/Projects/YumeShelf/docs/specs/09.2-folder-dnd-and-card-flip/PRD.md)

## Status
ready-for-agent

## Blocked by
- [00 — Preparatory Refactoring: @dnd-kit Dependencies, Settings Library Tab & Drag Tokens ($S$)](file:///d:/Projects/YumeShelf/docs/specs/09.2-folder-dnd-and-card-flip/tickets/00-preparatory-dnd-deps-settings-tab-and-tokens.md)
- [02.2 — Non-Drag Card Layout FLIP Animation ($B$)](file:///d:/Projects/YumeShelf/docs/specs/09.2-folder-dnd-and-card-flip/tickets/02.2-non-drag-card-layout-flip.md)

## What to Build
> **Scope Guard:** Implement only vertical path drag reordering inside `SettingsLibraryTab.tsx` and the terminal runtime smoke gate; preserve initial intended UXUI and all unmentioned existing behaviors in `SettingsLibraryTab.tsx` and `SettingsModal.tsx`. Do NOT alter, restyle, or remove anything unasked.

Implement vertical drag-and-drop reordering for configured library paths inside `SettingsLibraryTab.tsx` (extracted in Ticket `00`), synchronize folder sequence declaratively with `LibraryGrid.tsx`, and run the terminal Epic 09.2 smoke check:

- [ ] 1. **[NEW]** [`src/renderer/components/modals/PathReorderList.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/modals/PathReorderList.tsx), **[NEW]** [`src/renderer/components/modals/SortablePathRow.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/modals/SortablePathRow.tsx), **[MODIFY]** [`src/renderer/components/modals/SettingsLibraryTab.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/modals/SettingsLibraryTab.tsx), **[MODIFY]** [`src/renderer/components/modals/SettingsModal.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/modals/SettingsModal.tsx), & **[MODIFY]** [`src/styles/settings.css`](file:///d:/Projects/YumeShelf/src/styles/settings.css) — **Settings Library Paths Drag Reorder with `@dnd-kit`**:
  - Wrap configured library paths in `PathReorderList.tsx` using vertical `SortableContext` (`verticalListSortingStrategy`) with `useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))`, mounted inside `SettingsLibraryTab.tsx` while keeping `SettingsModal.tsx` free of drag state. Track `activeDragPath: string | null` in `onDragStart` (reset `setActiveDragPath(null)` **synchronously** at the top of `onDragEnd` before `if (!over || active.id === over.id) return;` and in `onDragCancel`), and render `<DragOverlay style={{ zIndex: 'var(--zIndex-path-row-drag, 2100)', pointerEvents: 'none' }}>` with the dragged `.library-path-entry.is-drag-overlay` preview without attaching `pathItemRefs` (so the temporary overlay clone cannot overwrite the live row's element reference in `pathItemRefs.current`). Thread `readonly targetPlatform?: PlatformInput` from `SettingsModalProps` -> `SettingsLibraryTabProps` -> `PathReorderListProps` -> `SortablePathRowProps` (defaulting to `undefined` -> `resolvePlatform()`).
  - `SortablePathRow.tsx`:
    - Dim the stationary source row when `isDragging` is `true` (`opacity: isDragging ? 0.4 : undefined` merged into the row `style`).
    - Grip handle (`.grip-handle`) with `type="button"`, `aria-label={strings.reorder_library_path}`, `data-tooltip={strings.drag_to_reorder}` (YumeShelf's accessible tooltip primitive, never `title` alone), `aria-disabled={disabled}`, `style={disabled ? { pointerEvents: 'none' } : undefined}` (NEVER native HTML `disabled={disabled}`, matching `SettingsModal.tsx:1189-1190`, so Chromium does not evict `document.activeElement` to `document.body` during keyboard drag completion), and inline SVG grip icon (`width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"` with 6 `<circle>` dots).
    - Pass `disabled` to `useSortable({ id: dirPath, disabled })` so `@dnd-kit` blocks drag activation while `isMutating || isScanning`.
    - Folder alias display: first check own-property `Object.prototype.hasOwnProperty.call(folderAliases, dirPath)`, and if absent, normalize `dirPath` with `normalizeLibraryPath(dirPath, targetPlatform)` and match against normalized own-property keys of `folderAliases` (`Object.entries(folderAliases)` using `normalizeLibraryPath(key, targetPlatform)`), requiring `typeof alias === 'string' && alias.trim() !== ''` (matching `library-sections.ts` parity across Windows/macOS paths so cleared/whitespace aliases do not render empty alias badges). Render any non-empty trimmed alias with `<span className="library-path-alias" data-tooltip={alias}>{alias}</span>`.
    - Preserve 100% of existing `.library-path-entry` elements and callbacks from `SettingsModal.tsx`: `pathItemRefs` ref forwarding, `.library-path-icon`, `.library-path-link` (`api?.openPath?.(dirPath)`), `.change-btn` (`handleChangePath`), and `.remove-btn` (`handleRemovePath` with neighbor/container focus handoff).
  - In `src/styles/settings.css`, add scroll containment on `.library-paths-list` (`max-height: 180px; overflow-y: auto; scrollbar-gutter: stable;`) plus `.grip-handle` UA resets and `.library-path-alias` truncation using existing `theme.css` tokens (drag overlay uses `var(--zIndex-path-row-drag, 2100)`):
    ```css
    .library-paths-list {
        max-height: 180px;
        overflow-y: auto;
        scrollbar-gutter: stable;
    }

    .library-path-entry.is-drag-overlay {
        background: var(--card-bg);
        border-color: var(--accent);
        box-shadow: var(--menu-shadow);
    }

    .grip-handle {
        flex-shrink: 0;
        background: transparent;
        border: none;
        padding: 4px;
        border-radius: 4px;
        color: var(--text-sub);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: grab;
        transition: color 0.15s ease, background-color 0.15s ease;
    }

    .grip-handle:hover:not([aria-disabled="true"]) {
        color: var(--text-main);
        background: var(--hover-bg);
    }

    .grip-handle:active:not([aria-disabled="true"]) {
        cursor: grabbing;
    }

    .grip-handle:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
    }

    .grip-handle[aria-disabled="true"] {
        opacity: 0.3;
        cursor: default;
        pointer-events: none;
    }

    @media (prefers-reduced-motion: reduce) {
        .grip-handle {
            transition: none;
        }
    }

    .library-path-alias {
        flex: 0 1 auto;
        min-width: 0;
        max-width: 140px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 11px;
        padding: 2px 6px;
        border-radius: 4px;
        background: var(--chip-bg);
        border: 1px solid var(--border-color);
        color: var(--text-sub);
    }
    ```
  - Wire `onReorderPaths: (newPaths: string[]) => Promise<void>`, `disabled={isMutating || isScanning}`, and `onShowToast: (message: string) => void` from `SettingsModal.tsx` -> `SettingsLibraryTab.tsx` -> `PathReorderList.tsx`. Inside `SettingsModal.tsx`'s `onReorderPaths`:
    - If `isMutating || isScanning` is `true`, throw an explicit error (never silently `return undefined`, so `PathReorderList.tsx` rolls back `optimisticOrder` and notifies via `toast_path_reorder_failed`).
    - Wrap the IPC call in `setIsMutating(true)` / `try ... finally { if (isMountedRef.current) setIsMutating(false); }`, guard with a monotonic `reorderSeqRef` (`const seq = ++reorderSeqRef.current`), call `const updatedConfig = await api?.updateLibraryConfig?.({ libraryPaths: newPaths })`, read `const latestConfig = store.getSnapshot().currentLibraryConfig` after `await` instead of stale render-closure `config`, and update `if (seq === reorderSeqRef.current) { const nextConfig = updatedConfig ?? (latestConfig ? { ...latestConfig, libraryPaths: newPaths } : null); if (nextConfig) { store.setCurrentLibraryConfig(nextConfig); onLibraryPathsUpdated?.(nextConfig.libraryPaths); } }` so a superseded `onReorderPaths` response cannot emit a stale `onLibraryPathsUpdated` callback. Let rejections propagate cleanly to `PathReorderList.tsx`'s catch boundary.
  - On `onDragEnd` in `PathReorderList.tsx`:
    - Null/cancelled-drop & identity guard before `arrayMove`:
      ```ts
      setActiveDragPath(null);
      if (!over || active.id === over.id) return;
      const oldIndex = orderedIds.indexOf(String(active.id));
      const newIndex = orderedIds.indexOf(String(over.id));
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;
      ```
    - Store `optimisticOrder: readonly string[] | null` (rendering `optimisticOrder ?? paths`), track `commitSeqRef = useRef(0)`, `pendingCommitsRef = useRef(0)`, and `needsPropSyncRef = useRef(false)`, and clear `optimisticOrder` ONLY on current-sequence failure OR when external `paths` props sync after all in-flight commits finish:
      ```ts
      const commitSeqRef = useRef(0);
      const pendingCommitsRef = useRef(0);
      const needsPropSyncRef = useRef(false);

      useEffect(() => {
        if (pendingCommitsRef.current === 0) {
          needsPropSyncRef.current = false;
          setOptimisticOrder(null);
        } else {
          needsPropSyncRef.current = true;
        }
      }, [paths]);
      ```
    - Optimistically update `optimisticOrder`, `await onReorderPaths?.(newPaths)`, and in `catch (err)` (importing `sanitizeUserPaths` from `../../../shared/path-sanitizer`), always log sanitized `console.error`, while rolling back `optimisticOrder` and calling `onShowToast?.(strings.toast_path_reorder_failed)` ONLY when `seq === commitSeqRef.current` (suppressing stale UI rollback/toast on superseded drags):
      ```ts
      const seq = ++commitSeqRef.current;
      pendingCommitsRef.current += 1;
      needsPropSyncRef.current = false;
      setOptimisticOrder(newPaths);
      try {
        await onReorderPaths?.(newPaths);
      } catch (err) {
        console.error('[PathReorderList] Failed to reorder library paths:', {
          pathCount: newPaths.length,
          error: sanitizeUserPaths(err instanceof Error ? err.message : String(err)),
          stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
        });
        if (seq === commitSeqRef.current) {
          setOptimisticOrder(null);
          onShowToast?.(strings.toast_path_reorder_failed);
        }
      } finally {
        pendingCommitsRef.current -= 1;
        if (pendingCommitsRef.current === 0 && needsPropSyncRef.current) {
          needsPropSyncRef.current = false;
          setOptimisticOrder(null);
        }
      }
      ```
- [ ] 2. **Main Library Folder Section Reordering Coordination**:
  - Verify `LibraryGrid.tsx` updates folder section sequence declaratively from canonical roots in `useLibraryState()` whenever paths are reordered in `ShelfTabs.tsx` or `SettingsLibraryTab.tsx`.
- [ ] 3. **[NEW]** [`src/renderer/components/modals/path-dnd.test.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/modals/path-dnd.test.tsx) & **[MODIFY]** [`src/renderer/components/modals/SettingsModal.test.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/modals/SettingsModal.test.tsx) — **Vitest Unit Tests**:
  - Verify vertical drag reordering calls `updateLibraryConfig`, updates `store.setCurrentLibraryConfig` on drop, asserts that `store.setCurrentLibraryConfig({ ...config, libraryPaths: reorderedPaths })` immediately updates `LibraryGrid`'s rendered `FolderSection` order, preserves `.change-btn` and `.library-path-link` functionality, and existing `SettingsModal.test.tsx` passes 100% (scoping `role="status"` queries in `SettingsModal.test.tsx` to `.library-scan-status` or `aria-live="polite"` to avoid `@dnd-kit` `DndLiveRegion` ambiguity).
  - Verify edge cases & concurrency guards in `path-dnd.test.tsx`:
    - Cancelled/off-target drops (`over === null`) are no-ops, and external `paths` prop updates sync cleanly.
    - Rejected `onReorderPaths` rolls back path order, calls `onShowToast(strings.toast_path_reorder_failed)`, and emits sanitized `console.error` (no raw `<USER_DIR>` paths).
    - Deterministic deferred-Promise concurrent-drag test (zero `setTimeout`/real timers): when Drag #1 rejects after Drag #2 resolves, Drag #2's `libraryPaths` order is preserved and `onShowToast` is suppressed for the superseded Drag #1 rejection.
    - `isMutating || isScanning` lock: when `SettingsModal` has `isMutating || isScanning` active (e.g., pending `removeLibraryPath` or `addLibraryPath` rescan), `PathReorderList` receives `disabled={true}` (`aria-disabled="true"` on `.grip-handle`) and `onReorderPaths` rejects/rolls back without persisting stale `optimisticOrder`; when a keyboard-initiated reorder (`Space` -> `Arrow*` -> `Space` on `.grip-handle`) triggers a pending `onReorderPaths` promise (`isMutating === true`), `.grip-handle` sets `aria-disabled="true"` (not native `disabled`) and retains `document.activeElement` without evicting focus to `document.body`.
    - `SortablePathRow` `folderAliases` normalized lookup: passing `targetPlatform="win32"` via props (without mutating `process.platform`) displays the alias when `folderAliases` is keyed by `c:/games/vn` and `libraryPaths` contains `C:\Games\VN`.
    - `.grip-handle` exposes `aria-label={strings.reorder_library_path}` and `data-tooltip={strings.drag_to_reorder}`, and non-empty trimmed aliases render `.library-path-alias` with `data-tooltip={alias}`.
    - `<DragOverlay>` renders the dragged `.library-path-entry` preview during drag, clears on drop (`onDragEnd`) and cancel (`onDragCancel`), and sets `style.opacity === '0.4'` on the stationary source `SortablePathRow` while dragging.
  - **Anti-Tautology Test-Harness Invariant (`happy-dom`)**: Tests verifying `DndContext` reordering, `SortablePathRow` `attributes`/`listeners` wiring, and preserved `.change-btn`/`.library-path-link` interactions **MUST NOT** mock `@dnd-kit/sortable` (`useSortable` `attributes`/`listeners`) or replace `DndContext` with a trivial stub. Exercise real `@dnd-kit/core` and `@dnd-kit/sortable` in `happy-dom` using `KeyboardSensor` (`Space` -> `Arrow*` -> `Space`) or `PointerSensor` with mocked `Element.prototype.getBoundingClientRect` on sortable elements (restored in `afterEach`).
- [ ] 4. **Terminal Real-Runtime UI Smoke Gate (Epic 09.2)**:
  - Run `npm test && npm run typecheck` and boot `npm start` to verify horizontal shelf tab drag, multi-container `GameCard`/`StackCard` drag-drop, non-drag favorite FLIP animation, vertical Settings path drag, and zero console/CSP/visual regressions across light/dark themes.

## Acceptance Criteria
- [ ] Configured library paths in `SettingsLibraryTab.tsx` reorder vertically via `@dnd-kit` using `PathReorderList.tsx` and `SortablePathRow.tsx` with localized grip handle labels/tooltips (`aria-label={strings.reorder_library_path}`, `data-tooltip={strings.drag_to_reorder}`), `.library-path-alias` truncation (`min-width: 0`, `data-tooltip={alias}`), normalized `folderAliases` lookup (`targetPlatform` seam), `<DragOverlay>` preview with source row dimming (`opacity: 0.4`), and `aria-disabled` focus retention during `isMutating || isScanning`.
- [ ] `over === null` drops are no-ops; reordered paths persist via `updateLibraryConfig` (reading `store.getSnapshot().currentLibraryConfig` after `await` with monotonic sequence guards), synchronize immediately with `LibraryGrid.tsx`, log sanitized `console.error` on failure, and roll back with `toast_path_reorder_failed` when current (suppressing stale rollback/toast when superseded).
- [ ] Real-runtime smoke check passes with zero console/CSP errors and zero visual regressions.
- [ ] Execute automated verification command: `npm run test:vitest -- src/renderer/components/modals/path-dnd.test.tsx src/renderer/components/modals/SettingsModal.test.tsx && npm run typecheck`.

## Verification Command
```bash
npm run test:vitest -- src/renderer/components/modals/path-dnd.test.tsx src/renderer/components/modals/SettingsModal.test.tsx && npm run typecheck
```
