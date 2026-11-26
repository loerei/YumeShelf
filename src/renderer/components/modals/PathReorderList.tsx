import React, { useEffect, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { sanitizeUserPaths } from '../../../shared/path-sanitizer';
import type { PlatformInput } from '../../../shared/path-subsumption';
import type { LocaleStrings } from '../../i18n/locale-strings';
import { PathRowOverlay, SortablePathRow } from './SortablePathRow';

export interface PathReorderListProps {
  readonly paths: readonly string[];
  readonly disabled: boolean;
  readonly strings: LocaleStrings;
  readonly folderAliases?: Readonly<Record<string, string>>;
  readonly targetPlatform?: PlatformInput;
  readonly pathListContainerRef: React.RefObject<HTMLDivElement | null>;
  readonly pathItemRefs: React.MutableRefObject<Map<string, HTMLElement>>;
  readonly onOpenPath: (dirPath: string) => void;
  readonly onChangePath: (dirPath: string) => void;
  readonly onRemovePath: (dirPath: string) => void;
  readonly onReorderPaths?: (newPaths: string[]) => Promise<void>;
  readonly onShowToast?: (message: string) => void;
}

export function PathReorderList({
  paths,
  disabled,
  strings,
  folderAliases,
  targetPlatform,
  pathListContainerRef,
  pathItemRefs,
  onOpenPath,
  onChangePath,
  onRemovePath,
  onReorderPaths,
  onShowToast,
}: PathReorderListProps): React.JSX.Element {
  const [activeDragPath, setActiveDragPath] = useState<string | null>(null);
  const [optimisticOrder, setOptimisticOrder] = useState<readonly string[] | null>(null);

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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const orderedIds = optimisticOrder ?? paths;

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragPath(String(event.active.id));
  };

  const handleDragCancel = () => {
    setActiveDragPath(null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveDragPath(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = orderedIds.indexOf(String(active.id));
    const newIndex = orderedIds.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

    const newPaths = arrayMove([...orderedIds], oldIndex, newIndex);
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
  };

  const canRemove = orderedIds.length > 1;

  return (
    <div
      ref={pathListContainerRef}
      tabIndex={-1}
      className="library-paths-list"
      aria-label="Configured library paths"
    >
      {orderedIds.length === 0 ? (
        <p className="empty-list-hint">
          {strings.settings_paths_empty || 'No library directories configured.'}
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <SortableContext items={[...orderedIds]} strategy={verticalListSortingStrategy}>
            {orderedIds.map((dirPath) => (
              <SortablePathRow
                key={dirPath}
                dirPath={dirPath}
                canRemove={canRemove}
                disabled={disabled}
                strings={strings}
                folderAliases={folderAliases}
                targetPlatform={targetPlatform}
                pathItemRefs={pathItemRefs}
                onOpenPath={onOpenPath}
                onChangePath={onChangePath}
                onRemovePath={onRemovePath}
              />
            ))}
          </SortableContext>
          <DragOverlay style={{ zIndex: 'var(--zIndex-path-row-drag, 2100)', pointerEvents: 'none' }}>
            {activeDragPath ? (
              <PathRowOverlay
                dirPath={activeDragPath}
                canRemove={canRemove}
                disabled={disabled}
                strings={strings}
                folderAliases={folderAliases}
                targetPlatform={targetPlatform}
                onOpenPath={onOpenPath}
                onChangePath={onChangePath}
                onRemovePath={onRemovePath}
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}
