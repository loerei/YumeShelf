import React, { useCallback } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export interface SortableTabItemProps {
  readonly id: string;
  readonly htmlId: string;
  readonly label: string;
  readonly count?: number;
  readonly isActive: boolean;
  readonly index: number;
  readonly onSelect: (id: string) => void;
  readonly onTabKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => void;
}

/**
 * Draggable folder tab item for ShelfTabs, wrapping `@dnd-kit/sortable`
 * while preserving `role="tab"`, roving `tabIndex`, and ref forwarding for keyboard focus.
 */
export const SortableTabItem = React.forwardRef<HTMLButtonElement, SortableTabItemProps>(
  function SortableTabItem(
    { id, htmlId, label, count, isActive, index, onSelect, onTabKeyDown },
    forwardedRef
  ) {
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

    const sortableStyle: React.CSSProperties = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.4 : undefined,
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
      listeners?.onKeyDown?.(e);
      onTabKeyDown(e, index);
    };

    return (
      <button
        ref={mergedRef}
        id={htmlId}
        type="button"
        {...attributes}
        {...listeners}
        role="tab"
        aria-selected={isActive}
        tabIndex={isActive ? 0 : -1}
        className={`shelf-tab${isActive ? ' is-active' : ''}`}
        style={sortableStyle}
        onClick={() => onSelect(id)}
        onKeyDown={handleKeyDown}
      >
        <span className="shelf-tab-label">{label}</span>
        {count !== undefined && <span className="shelf-tab-count">{count}</span>}
      </button>
    );
  }
);
