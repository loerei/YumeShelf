import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useDndContext,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import { sanitizeUserPaths } from '../../shared/path-sanitizer';
import type { PlatformInput } from '../../shared/path-subsumption';
import { GameCard, type GameCardProps } from '../components/GameCard';
import { StackCard, type StackCardProps } from '../components/StackCard';
import { useLocaleStrings } from '../i18n/locale-strings';
import { readStoredCustomOrder, writeCustomOrder } from '../library-order';
import { getGroupedKeysForGame, type LibraryViewItem } from '../library-stacks';
import type { UiStorageAdapter } from '../state/ui-runtime-state';
import { validateGameCardDrop, type GameDndContainerId } from './card-drop-validator';

const POINTER_SENSOR_OPTIONS = { activationConstraint: { distance: 5 } };

const defaultStorage: UiStorageAdapter =
  typeof localStorage !== 'undefined'
    ? localStorage
    : {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      };

interface ActiveDragContextValue {
  readonly sourceContainerId: GameDndContainerId;
  readonly item: LibraryViewItem;
}

interface GameDndZoneContextValue {
  readonly activeDragContext: ActiveDragContextValue | null;
  readonly knownContainers: ReadonlySet<GameDndContainerId>;
  readonly currentSort: string;
  readonly favorites: readonly LibraryViewItem[];
  readonly targetPlatform?: PlatformInput;
}

const GameDndZoneContext = createContext<GameDndZoneContextValue | null>(null);

interface DroppableSortableZoneProps {
  readonly containerId: GameDndContainerId;
  readonly itemIds: readonly string[];
  readonly renderGrid: (droppableRef?: React.Ref<HTMLDivElement>, isOver?: boolean) => React.ReactNode;
  readonly disabled?: boolean;
}

const DroppableSortableZone: React.FC<DroppableSortableZoneProps> = ({
  containerId,
  itemIds,
  renderGrid,
  disabled = false,
}) => {
  const zoneCtx = useContext(GameDndZoneContext);
  const { setNodeRef, isOver } = useDroppable({ id: containerId, disabled: Boolean(disabled) });
  const { over } = useDndContext();

  const knownContainers = zoneCtx?.knownContainers;
  const activeDragContext = zoneCtx?.activeDragContext ?? null;

  const overContainerId =
    (over?.data.current?.sortable?.containerId as GameDndContainerId | undefined) ??
    (over && knownContainers?.has(String(over.id)) ? String(over.id) : null);

  const isTargetOver = Boolean(isOver) || overContainerId === containerId;
  const showDragOver =
    isTargetOver &&
    !disabled &&
    activeDragContext !== null &&
    zoneCtx !== null &&
    validateGameCardDrop({
      sourceContainerId: activeDragContext.sourceContainerId,
      targetContainerId: containerId,
      item: activeDragContext.item,
      currentSort: zoneCtx.currentSort,
      favorites: zoneCtx.favorites,
      targetPlatform: zoneCtx.targetPlatform,
    });

  return (
    <SortableContext id={containerId} items={itemIds as string[]} disabled={Boolean(disabled)}>
      {renderGrid(disabled ? undefined : setNodeRef, showDragOver)}
    </SortableContext>
  );
};

export interface GameDndContextProps {
  readonly currentSort: string;
  readonly viewItems: readonly LibraryViewItem[];
  readonly favorites: readonly LibraryViewItem[];
  readonly resolvedCustomOrder: readonly string[] | null;
  readonly knownContainerIds: readonly GameDndContainerId[];
  readonly storage?: UiStorageAdapter;
  readonly targetPlatform?: PlatformInput;
  readonly onDragStateChange?: (isDragging: boolean) => void;
  readonly onCommitFavoriteToggle: (
    item: LibraryViewItem,
    targetFavorite: boolean
  ) => Promise<'committed' | 'skipped' | 'failed'>;
  readonly onCustomOrderChange?: (nextOrder: readonly string[]) => void;
  readonly onSetSort: (sort: string) => void;
  readonly onShowToast?: (message: string) => void;
  readonly CardComponent?: React.ComponentType<GameCardProps & React.RefAttributes<HTMLDivElement>>;
  readonly StackComponent?: React.ComponentType<StackCardProps & React.RefAttributes<HTMLDivElement>>;
  readonly children: (helpers: {
    renderSectionContainer: (
      containerId: GameDndContainerId,
      itemIds: readonly string[],
      renderGrid: (droppableRef?: React.Ref<HTMLDivElement>, isOver?: boolean) => React.ReactNode,
      options?: { readonly disabled?: boolean }
    ) => React.ReactNode;
  }) => React.ReactNode;
}

/**
 * Multi-container `@dnd-kit` drag-and-drop coordinator for `GameCard` and `StackCard` items
 * across flat (`fav`/`unfav`) and folder (`fav`/root folder sections) grids.
 */
export const GameDndContext: React.FC<GameDndContextProps> = ({
  currentSort,
  viewItems,
  favorites,
  resolvedCustomOrder,
  knownContainerIds,
  storage,
  targetPlatform,
  onDragStateChange,
  onCommitFavoriteToggle,
  onCustomOrderChange,
  onSetSort,
  onShowToast,
  CardComponent = GameCard,
  StackComponent = StackCard,
  children,
}) => {
  const strings = useLocaleStrings();
  const resolvedStorage = storage ?? defaultStorage;

  const [activeDragContext, setActiveDragContext] = useState<ActiveDragContextValue | null>(null);
  const isDraggingRef = useRef(false);
  const onDragStateChangeRef = useRef(onDragStateChange);
  onDragStateChangeRef.current = onDragStateChange;
  const commitSeqRef = useRef(0);

  const sensors = useSensors(
    useSensor(PointerSensor, POINTER_SENSOR_OPTIONS)
  );

  const knownContainers = useMemo(
    () => new Set<GameDndContainerId>(knownContainerIds),
    [knownContainerIds]
  );

  useEffect(() => {
    return () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        setActiveDragContext(null);
        onDragStateChangeRef.current?.(false);
      }
    };
  }, []);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const sourceContainerId = event.active.data.current?.sortable?.containerId as
      | GameDndContainerId
      | undefined;
    const item = event.active.data.current?.item as LibraryViewItem | undefined;
    if (!sourceContainerId || !item) return;

    isDraggingRef.current = true;
    setActiveDragContext({ sourceContainerId, item });
    onDragStateChangeRef.current?.(true);
  }, []);

  const handleDragCancel = useCallback(() => {
    isDraggingRef.current = false;
    setActiveDragContext(null);
    onDragStateChangeRef.current?.(false);
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      isDraggingRef.current = false;
      setActiveDragContext(null);
      onDragStateChangeRef.current?.(false);

      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const sourceContainerId = active.data.current?.sortable?.containerId as
        | GameDndContainerId
        | undefined;
      const targetContainerId =
        (over.data.current?.sortable?.containerId as GameDndContainerId | undefined) ??
        (knownContainers.has(String(over.id)) ? String(over.id) : null);

      const activeItem = active.data.current?.item as LibraryViewItem | undefined;
      const overItem = over.data.current?.item as LibraryViewItem | undefined;

      if (!sourceContainerId || !targetContainerId || !activeItem) return;

      // Same-container background-drop no-op guard
      if (knownContainers.has(String(over.id)) && sourceContainerId === targetContainerId) {
        return;
      }

      if (
        !validateGameCardDrop({
          sourceContainerId,
          targetContainerId,
          item: activeItem,
          currentSort,
          favorites,
          targetPlatform,
        })
      ) {
        return;
      }

      const seq = ++commitSeqRef.current;
      const prevSort = currentSort;
      const storedOrder = readStoredCustomOrder(resolvedStorage);
      const prevStoredOrder = storedOrder;

      const viewItemKeys = viewItems.flatMap((item) => getGroupedKeysForGame(item));
      const seen = new Set<string>();
      const baselineOrder: string[] = [];
      const appendUnique = (keys: readonly string[]) => {
        for (const key of keys) {
          if (key && !seen.has(key)) {
            seen.add(key);
            baselineOrder.push(key);
          }
        }
      };

      if (currentSort !== 'custom' && currentSort !== 'folder') {
        appendUnique(viewItemKeys);
        appendUnique(resolvedCustomOrder ?? storedOrder);
        appendUnique(storedOrder);
      } else {
        appendUnique(resolvedCustomOrder ?? storedOrder);
        appendUnique(storedOrder);
        appendUnique(viewItemKeys);
      }

      let nextOrder = baselineOrder;
      let orderMutated = false;

      if (overItem) {
        const activeSet = new Set(getGroupedKeysForGame(activeItem));
        const overSet = new Set(getGroupedKeysForGame(overItem));
        const activeFirstIndex = baselineOrder.findIndex((k) => activeSet.has(k));
        const overFirstIndex = baselineOrder.findIndex((k) => overSet.has(k));

        if (activeFirstIndex !== -1 && overFirstIndex !== -1 && activeFirstIndex !== overFirstIndex) {
          const activeToMove = baselineOrder.filter((k) => activeSet.has(k));
          const remaining = baselineOrder.filter((k) => !activeSet.has(k));

          if (activeFirstIndex < overFirstIndex) {
            let lastOverIndex = -1;
            for (let i = remaining.length - 1; i >= 0; i--) {
              if (overSet.has(remaining[i])) {
                lastOverIndex = i;
                break;
              }
            }
            if (lastOverIndex !== -1) {
              remaining.splice(lastOverIndex + 1, 0, ...activeToMove);
            }
          } else {
            const firstOverIndex = remaining.findIndex((k) => overSet.has(k));
            if (firstOverIndex !== -1) {
              remaining.splice(firstOverIndex, 0, ...activeToMove);
            }
          }
          nextOrder = remaining;
          orderMutated = true;
        }
      }

      const isCrossZone = sourceContainerId !== targetContainerId;
      const shouldSwitchToCustom = currentSort !== 'custom' && currentSort !== 'folder';

      if (orderMutated || shouldSwitchToCustom) {
        writeCustomOrder(nextOrder, resolvedStorage);
        onCustomOrderChange?.(nextOrder);
      }
      if (shouldSwitchToCustom) {
        onSetSort('custom');
      }

      if (!isCrossZone) {
        return;
      }

      const targetFavorite = targetContainerId === 'fav';
      const rollbackOrderAndSort = () => {
        writeCustomOrder(prevStoredOrder, resolvedStorage);
        onCustomOrderChange?.(resolvedCustomOrder ?? prevStoredOrder);
        if (shouldSwitchToCustom) {
          onSetSort(prevSort);
        }
      };

      try {
        const outcome = await onCommitFavoriteToggle(activeItem, targetFavorite);
        if (outcome === 'skipped') {
          if (seq === commitSeqRef.current) {
            rollbackOrderAndSort();
          }
        } else if (outcome === 'failed') {
          if (seq === commitSeqRef.current) {
            rollbackOrderAndSort();
            onShowToast?.(strings.toast_favorite_update_failed || 'Failed to update favorite status');
          }
        }
      } catch (err) {
        const itemKey = activeItem.isStack ? activeItem.groupKey : activeItem.representativeKey;
        console.error('[GameDndContext] Failed to commit favorite toggle on drop:', {
          sourceContainerId: sanitizeUserPaths(sourceContainerId),
          targetContainerId: sanitizeUserPaths(targetContainerId),
          itemKey: sanitizeUserPaths(itemKey),
          error: sanitizeUserPaths(err instanceof Error ? err.message : String(err)),
          stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
        });
        if (seq === commitSeqRef.current) {
          rollbackOrderAndSort();
          onShowToast?.(strings.toast_favorite_update_failed || 'Failed to update favorite status');
        }
      }
    },
    [
      knownContainers,
      currentSort,
      favorites,
      targetPlatform,
      resolvedStorage,
      viewItems,
      resolvedCustomOrder,
      onCustomOrderChange,
      onSetSort,
      onCommitFavoriteToggle,
      onShowToast,
      strings.toast_favorite_update_failed,
    ]
  );

  const renderSectionContainer = useCallback(
    (
      containerId: GameDndContainerId,
      itemIds: readonly string[],
      renderGrid: (droppableRef?: React.Ref<HTMLDivElement>, isOver?: boolean) => React.ReactNode,
      options?: { readonly disabled?: boolean }
    ) => (
      <DroppableSortableZone
        containerId={containerId}
        itemIds={itemIds}
        renderGrid={renderGrid}
        disabled={options?.disabled}
      />
    ),
    []
  );

  const zoneContextValue = useMemo<GameDndZoneContextValue>(
    () => ({
      activeDragContext,
      knownContainers,
      currentSort,
      favorites,
      targetPlatform,
    }),
    [activeDragContext, knownContainers, currentSort, favorites, targetPlatform]
  );

  return (
    <GameDndZoneContext.Provider value={zoneContextValue}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        {children({ renderSectionContainer })}
        <DragOverlay style={{ zIndex: 'var(--zIndex-card-drag, 1650)', pointerEvents: 'none' }}>
          {activeDragContext ? (
            activeDragContext.item.isStack ? (
              <StackComponent stack={activeDragContext.item} />
            ) : (
              <CardComponent
                game={activeDragContext.item.primaryGame}
                showPath={true}
                showDuplicateChip={true}
                launchMode="double"
              />
            )
          ) : null}
        </DragOverlay>
      </DndContext>
    </GameDndZoneContext.Provider>
  );
};
