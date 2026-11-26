import React, { useCallback, useMemo } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { LibraryViewItem } from '../library-stacks';
import type { GameEntry } from '../types/game';
import type { GameCardMenuAction, GameCardMenuPayload, GameCardProps } from './GameCard';
import type { StackCardProps } from './StackCard';

const INTERACTIVE_DRAG_GUARD_SELECTOR =
  'button, a, input, select, textarea, [role="button"], [role="menuitem"], [contenteditable], [data-interactive]';

export interface SortableGameCardProps {
  readonly id: string;
  readonly item: LibraryViewItem;
  readonly CardComponent: React.ComponentType<GameCardProps & React.RefAttributes<HTMLDivElement>>;
  readonly StackComponent: React.ComponentType<StackCardProps & React.RefAttributes<HTMLDivElement>>;
  readonly onToggleFavoriteGame?: (game: GameEntry) => void;
  readonly onToggleFavoriteStack?: (stack: LibraryViewItem) => void;
  readonly onLaunch?: (game: GameEntry) => void;
  readonly onOpenStack?: (stack: LibraryViewItem) => void;
  readonly onOpenSaveEditor?: (gameKey: string) => void;
  readonly onMenuAction?: (
    action: GameCardMenuAction,
    game: GameEntry,
    payload?: GameCardMenuPayload
  ) => void;
}

/**
 * Memoized `@dnd-kit/sortable` wrapper for `GameCard` and `StackCard` using direct props
 * (zero inline JSX `children`) so unaffected cards perform zero re-renders on playtime ticks.
 */
export const SortableGameCard = React.memo(
  React.forwardRef<HTMLDivElement, SortableGameCardProps>(function SortableGameCard(
    {
      id,
      item,
      CardComponent,
      StackComponent,
      onToggleFavoriteGame,
      onToggleFavoriteStack,
      onLaunch,
      onOpenStack,
      onOpenSaveEditor,
      onMenuAction,
    },
    forwardedRef
  ) {
    const canonicalKey = item.isStack ? item.groupKey : item.representativeKey;
    const sortableData = useMemo(
      () => ({ item, canonicalKey }),
      [item, canonicalKey]
    );

    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
      id,
      data: sortableData,
    });

    const mergedRef = useCallback(
      (node: HTMLDivElement | null) => {
        setNodeRef(node);
        if (typeof forwardedRef === 'function') {
          forwardedRef(node);
        } else if (forwardedRef) {
          (forwardedRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
        }
      },
      [setNodeRef, forwardedRef]
    );

    const sortableStyle = useMemo<React.CSSProperties | undefined>(() => {
      if (transform === null && transition === undefined && !isDragging) {
        return undefined;
      }
      return {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : undefined,
      };
    }, [transform, transition, isDragging]);

    const handlePointerDown = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        if ((e.target as HTMLElement | null)?.closest(INTERACTIVE_DRAG_GUARD_SELECTOR)) {
          return;
        }
        listeners?.onPointerDown?.(e);
      },
      [listeners]
    );

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLDivElement>) => {
        listeners?.onKeyDown?.(e);
      },
      [listeners]
    );

    const { role: _ignoredRole, tabIndex: _ignoredTabIndex, ...restAttributes } = attributes;

    if (item.isStack) {
      return (
        <StackComponent
          ref={mergedRef}
          stack={item}
          style={sortableStyle}
          {...restAttributes}
          {...listeners}
          onPointerDown={handlePointerDown}
          onKeyDown={handleKeyDown}
          onOpenStack={onOpenStack}
          onToggleFavorite={onToggleFavoriteStack}
          onMenuAction={onMenuAction}
        />
      );
    }

    return (
      <CardComponent
        ref={mergedRef}
        game={item.primaryGame}
        showPath={true}
        showDuplicateChip={true}
        launchMode="double"
        style={sortableStyle}
        {...restAttributes}
        {...listeners}
        onPointerDown={handlePointerDown}
        onKeyDown={handleKeyDown}
        onToggleFavorite={onToggleFavoriteGame}
        onLaunch={onLaunch}
        onOpenSaveEditor={onOpenSaveEditor}
        onMenuAction={onMenuAction}
      />
    );
  })
);
