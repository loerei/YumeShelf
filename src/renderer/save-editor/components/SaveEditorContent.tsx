import React, { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import {
  observeElementRect as defaultObserveElementRect,
  useVirtualizer,
} from '@tanstack/react-virtual';
import type { SaveFieldScalar } from '@yumeshelf/engine/types';
import {
  getTranslation,
  useActiveSaveTabId,
  useActiveTabFields,
  useSaveDirtyKeys,
  useSaveEditorDispatch,
  useSaveFileStatus,
  useSaveModifiedFields,
  useSaveSearchQuery,
  useSaveTranslations,
} from '../store/save-editor-store';
import { SaveFieldRow } from './SaveFieldRow';

export interface SaveEditorContentProps {
  onRetryLoad?: (fileName: string) => void;
  onChangeFile?: () => void;
}

/**
 * Pure virtualized table container consuming NormalizedSaveDto fields from
 * SaveEditorStore and delegating row rendering to memoized SaveFieldRow items.
 */
export function SaveEditorContent({
  onRetryLoad,
  onChangeFile,
}: SaveEditorContentProps): React.JSX.Element {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const fileStatus = useSaveFileStatus();
  const activeFields = useActiveTabFields();
  const activeTabId = useActiveSaveTabId();
  const searchQuery = useSaveSearchQuery();
  const modifiedFields = useSaveModifiedFields();
  const dirtyKeys = useSaveDirtyKeys();
  const translations = useSaveTranslations();
  const dispatch = useSaveEditorDispatch();

  const handleChange = useCallback(
    (id: string, val: SaveFieldScalar) => {
      dispatch.updateField(id, val);
    },
    [dispatch]
  );

  const handleClearSearchFilter = () => {
    // Transfer focus to scroll container fallback before unmounting empty-state view
    parentRef.current?.focus();
    dispatch.setSearchQuery('');
  };

  const rowVirtualizer = useVirtualizer({
    count: activeFields.length,
    enabled: fileStatus.state === 'loaded',
    getScrollElement: () => parentRef.current,
    estimateSize: (index: number) => {
      const field = activeFields[index];
      if (!field) return 88;
      return field.type === 'boolean' || typeof field.value === 'boolean' ? 48 : 88;
    },
    overscan: 8,
    getItemKey: (index: number) => activeFields[index]?.id ?? index,
    initialRect: { width: 800, height: 600 },
    observeElementRect: (instance, cb) =>
      defaultObserveElementRect(instance, (rect) => {
        // Preserve initialRect in headless DOM environments lacking layout engines (0x0)
        if (rect.width === 0 && rect.height === 0 && instance.options.initialRect) {
          cb(instance.options.initialRect);
          return;
        }
        cb(rect);
      }),
    measureElement: (element, _entry, instance) => {
      const height = element?.getBoundingClientRect()?.height;
      return height && height > 0
        ? Math.round(height)
        : instance.options.estimateSize(instance.indexFromElement(element));
    },
  });

  const activeFileName =
    fileStatus.state === 'loaded'
      ? fileStatus.dto.fileName
      : fileStatus.state === 'loading' || fileStatus.state === 'error'
        ? fileStatus.fileName
        : null;

  useLayoutEffect(() => {
    if (fileStatus.state === 'loaded') {
      rowVirtualizer.scrollToOffset(0);
    }
  }, [activeFileName, activeTabId, searchQuery, rowVirtualizer, fileStatus.state]);

  useEffect(() => {
    const el = parentRef.current;
    if (!el || typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(() => {
      rowVirtualizer.measure();
      for (const itemEl of rowVirtualizer.elementsCache.values()) {
        rowVirtualizer.measureElement(itemEl);
      }
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [rowVirtualizer]);

  const virtualRows =
    fileStatus.state === 'loaded' && activeFields.length > 0
      ? rowVirtualizer.getVirtualItems()
      : [];

  let content: React.ReactNode;
  if (fileStatus.state === 'idle') {
    content = (
      <div className="empty-state" role="status" aria-live="polite">
        Select a save file from the sidebar to view and edit its contents
      </div>
    );
  } else if (fileStatus.state === 'loading') {
    content = (
      <div className="loading" role="status" aria-live="polite" aria-busy="true">
        <div className="loading-spinner" aria-hidden="true" />
        <span>
          Loading {fileStatus.fileName}
          {typeof fileStatus.percent === 'number' ? ` (${fileStatus.percent}%)` : '...'}
        </span>
      </div>
    );
  } else if (fileStatus.state === 'error') {
    content = (
      <div className="save-editor-error-box" role="alert">
        <div className="save-editor-error-title">
          Failed to load {fileStatus.fileName}
        </div>
        <code>{fileStatus.errorMessage}</code>
        <div className="save-editor-error-actions">
          <button
            type="button"
            className="primary-btn"
            onClick={() => onRetryLoad?.(fileStatus.fileName)}
          >
            Retry
          </button>
          <button
            type="button"
            className="secondary-btn"
            onClick={() => onChangeFile?.()}
          >
            Choose Another File
          </button>
        </div>
      </div>
    );
  } else if (activeFields.length === 0) {
    content =
      searchQuery.trim().length > 0 ? (
        <div className="empty-state" role="status" aria-live="polite">
          <p>No matching variables found for &ldquo;{searchQuery.trim()}&rdquo;.</p>
          <button
            type="button"
            className="secondary-btn"
            onClick={handleClearSearchFilter}
          >
            Clear search filter
          </button>
        </div>
      ) : (
        <div className="empty-state" role="status" aria-live="polite">
          No variables exist in the selected category.
        </div>
      );
  } else {
    content = (
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualRows.map((virtualRow) => {
          const field = activeFields[virtualRow.index];
          if (!field) return null;

          const rawModified = Object.hasOwn(modifiedFields, field.id)
            ? modifiedFields[field.id]
            : undefined;
          const value: number | string | boolean =
            rawModified !== undefined && rawModified !== null
              ? rawModified
              : field.value;
          const isDirty = dirtyKeys.has(field.id);
          const normLabel = (field.label || '').normalize('NFC');
          const label = getTranslation(translations, normLabel) ?? field.label;

          return (
            <div
              key={virtualRow.key}
              ref={rowVirtualizer.measureElement}
              data-index={virtualRow.index}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
                isolation: 'isolate',
                overflow: 'hidden',
              }}
            >
              <SaveFieldRow
                field={field}
                value={value}
                isDirty={isDirty}
                label={label}
                onChange={handleChange}
              />
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      className="save-editor-content"
      tabIndex={-1}
      style={{ overflow: 'auto' }}
    >
      {content}
    </div>
  );
}
