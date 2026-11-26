import React, {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  observeElementRect as defaultObserveElementRect,
  useVirtualizer,
} from '@tanstack/react-virtual';
import type { SaveFieldScalar } from '@yumeshelf/engine/types';
import { formatBytesMiB, parseSaveTooLargeError } from '../../../shared/save-size-limit';
import { useLocaleStrings } from '../../i18n/locale-strings';
import {
  buildVirtualRows,
  computeGridColumnCount,
  type SaveVirtualRow,
} from '../domain/save-view-model';
import {
  getTranslation,
  useActiveSaveTabId,
  useSaveCollapsedSections,
  useSaveDirtyKeys,
  useSaveEditorDispatch,
  useSaveEditorSelector,
  useSaveElectronAPI,
  useSaveFileStatus,
  useSaveFilters,
  useSaveModifiedFields,
  useSavePinnedIds,
  useSaveSearchQuery,
  useSaveTranslations,
} from '../store/save-editor-store';
import { SaveFieldRow } from './SaveFieldRow';

export interface SaveEditorContentProps {
  onRetryLoad?: (fileName: string, options?: { allowLargeSaves?: boolean }) => void;
}

const EMPTY_VIRTUAL_ROWS: readonly SaveVirtualRow[] = [];
const EMPTY_SECTION_TAB_IDS: readonly string[] = [];

/**
 * Pure virtualized responsive grid container consuming NormalizedSaveDto fields from
 * SaveEditorStore and delegating card rendering to memoized SaveFieldRow items.
 */
export function SaveEditorContent({
  onRetryLoad,
}: SaveEditorContentProps): React.JSX.Element {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const scrollViewportRef = useRef<HTMLDivElement | null>(null);
  const stickyBtnRef = useRef<HTMLButtonElement | null>(null);
  const stickyPushOffsetRef = useRef<number>(0);
  const fileStatus = useSaveFileStatus();
  const pristineFieldsByTab = useSaveEditorSelector((s) => s.pristineFieldsByTab);
  const activeTabId = useActiveSaveTabId();
  const searchQuery = useSaveSearchQuery();
  const filters = useSaveFilters();
  const pinnedIds = useSavePinnedIds();
  const collapsedSections = useSaveCollapsedSections();
  const modifiedFields = useSaveModifiedFields();
  const dirtyKeys = useSaveDirtyKeys();
  const translations = useSaveTranslations();
  const dispatch = useSaveEditorDispatch();
  const contextApi = useSaveElectronAPI();
  const strings = useLocaleStrings(undefined, contextApi ?? null);

  const [containerWidth, setContainerWidth] = useState<number>(800);
  const columnCount = computeGridColumnCount(containerWidth);
  const largeSaveTipId = useId();
  const [autoAllowLargeSavesChecked, setAutoAllowLargeSavesChecked] = useState(false);
  const [isProceedingLargeSave, setIsProceedingLargeSave] = useState(false);
  const [expandingTabs, setExpandingTabs] = useState<ReadonlySet<string>>(() => new Set());
  const [prevCollapsed, setPrevCollapsed] = useState<ReadonlySet<string>>(collapsedSections);
  const expandTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [stickySection, setStickySection] = useState<{
    readonly index: number;
    readonly tabId: string;
    readonly label: string;
    readonly count: number;
    readonly isCollapsed: boolean;
  } | null>(null);

  if (prevCollapsed !== collapsedSections) {
    setPrevCollapsed(collapsedSections);
    if (fileStatus.state === 'loaded') {
      let changed = false;
      const next = new Set(expandingTabs);
      for (const tabId of prevCollapsed) {
        if (!collapsedSections.has(tabId) && !next.has(tabId)) {
          next.add(tabId);
          changed = true;
        }
      }
      for (const tabId of collapsedSections) {
        if (next.has(tabId)) {
          next.delete(tabId);
          changed = true;
        }
      }
      if (changed) {
        setExpandingTabs(next);
      }
    }
  }

  const handleChange = useCallback(
    (id: string, val: SaveFieldScalar) => {
      dispatch.updateField(id, val);
    },
    [dispatch]
  );

  const handleTogglePin = useCallback(
    (id: string) => {
      dispatch.togglePin(id);
    },
    [dispatch]
  );

  const handleClearSearchFilter = () => {
    // Transfer focus to scroll container fallback before unmounting empty-state view
    contentRef.current?.focus();
    dispatch.setSearchQuery('');
  };

  const { rows, totalFilteredFields, sectionTabIds } = useMemo(() => {
    if (fileStatus.state !== 'loaded') {
      return {
        rows: EMPTY_VIRTUAL_ROWS,
        totalFilteredFields: 0,
        sectionTabIds: EMPTY_SECTION_TAB_IDS,
      };
    }
    return buildVirtualRows({
      dto: fileStatus.dto,
      pristineFieldsByTab,
      activeTabId,
      query: searchQuery,
      filters,
      pinnedIds,
      collapsedSections,
      translations,
      strings,
      columnCount,
      getTranslationFn: getTranslation,
    });
  }, [
    fileStatus,
    pristineFieldsByTab,
    activeTabId,
    searchQuery,
    filters,
    pinnedIds,
    collapsedSections,
    translations,
    strings,
    columnCount,
  ]);

  const sectionHeaders = useMemo(() => {
    const list: Array<{
      readonly index: number;
      readonly tabId: string;
      readonly label: string;
      readonly count: number;
      readonly isCollapsed: boolean;
    }> = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row && row.kind === 'section-header') {
        list.push({
          index: i,
          tabId: row.tabId,
          label: row.label,
          count: row.count,
          isCollapsed: row.isCollapsed,
        });
      }
    }
    return list;
  }, [rows]);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    enabled: fileStatus.state === 'loaded',
    getScrollElement: () => scrollViewportRef.current,
    estimateSize: (index: number) => {
      const row = rows[index];
      if (!row) return 104;
      if (row.kind === 'section-header') return 48;
      return row.isBooleanRow ? 64 : 104;
    },
    overscan: 8,
    getItemKey: (index: number) => rows[index]?.key ?? index,
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

  useEffect(() => {
    const timers = expandTimersRef.current;
    for (const [tabId, timer] of timers.entries()) {
      if (!expandingTabs.has(tabId)) {
        clearTimeout(timer);
        timers.delete(tabId);
      }
    }
    for (const tabId of expandingTabs) {
      if (!timers.has(tabId)) {
        const timer = setTimeout(() => {
          timers.delete(tabId);
          setExpandingTabs((curr) => {
            if (!curr.has(tabId)) return curr;
            const next = new Set(curr);
            next.delete(tabId);
            return next;
          });
        }, 180);
        timers.set(tabId, timer);
      }
    }
  }, [expandingTabs]);

  useEffect(() => {
    const timers = expandTimersRef.current;
    return () => {
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

  const syncStickyHeader = useCallback(() => {
    const scrollEl = scrollViewportRef.current;
    if (
      !scrollEl ||
      fileStatus.state !== 'loaded' ||
      activeTabId !== 'all' ||
      sectionHeaders.length === 0
    ) {
      stickyPushOffsetRef.current = 0;
      setStickySection((curr) => (curr === null ? curr : null));
      return;
    }

    const scrollTop = scrollEl.scrollTop;
    const padTop =
      typeof window !== 'undefined'
        ? Number.parseFloat(window.getComputedStyle(scrollEl).paddingTop) || 0
        : 0;
    const measurements = rowVirtualizer.measurementsCache;

    const getHeaderTop = (rowIndex: number): number => {
      const m = measurements[rowIndex];
      if (m) return m.start + padTop;
      const offset = rowVirtualizer.getOffsetForIndex(rowIndex, 'start');
      return (offset ? offset[0] : rowIndex * 48) + padTop;
    };

    let activePos = -1;
    for (let i = 0; i < sectionHeaders.length; i++) {
      if (getHeaderTop(sectionHeaders[i]!.index) < scrollTop) {
        activePos = i;
      } else {
        break;
      }
    }

    if (activePos < 0) {
      stickyPushOffsetRef.current = 0;
      setStickySection((curr) => (curr === null ? curr : null));
      return;
    }

    const active = sectionHeaders[activePos]!;
    if (active.isCollapsed) {
      stickyPushOffsetRef.current = 0;
      setStickySection((curr) => (curr === null ? curr : null));
      return;
    }

    const nextHeader = sectionHeaders[activePos + 1];
    const stickyHeight = stickyBtnRef.current?.offsetHeight || 39;
    let pushOffset = 0;
    if (nextHeader) {
      const distanceToNext = getHeaderTop(nextHeader.index) - scrollTop;
      if (distanceToNext < stickyHeight) {
        pushOffset = Math.max(-stickyHeight, distanceToNext - stickyHeight);
      }
    }

    stickyPushOffsetRef.current = pushOffset;
    if (stickyBtnRef.current) {
      stickyBtnRef.current.style.transform =
        pushOffset === 0 ? '' : `translateY(${pushOffset}px)`;
    }

    setStickySection((curr) => {
      if (
        curr &&
        curr.tabId === active.tabId &&
        curr.index === active.index &&
        curr.label === active.label &&
        curr.count === active.count &&
        curr.isCollapsed === active.isCollapsed
      ) {
        return curr;
      }
      return active;
    });
  }, [activeTabId, fileStatus.state, rowVirtualizer, sectionHeaders]);

  const handleStickyHeaderClick = useCallback(() => {
    if (!stickySection) return;
    const scrollEl = scrollViewportRef.current;
    const measurements = rowVirtualizer.measurementsCache;
    const m = measurements[stickySection.index];
    const fallbackOffset = rowVirtualizer.getOffsetForIndex(stickySection.index, 'start');
    const targetTop = Math.max(0, m ? m.start : (fallbackOffset ? fallbackOffset[0] : 0));

    dispatch.toggleSection(stickySection.tabId);
    rowVirtualizer.scrollToOffset(targetTop);
    scrollEl?.scrollTo?.({ top: targetTop });
  }, [dispatch, rowVirtualizer, stickySection]);

  useLayoutEffect(() => {
    if (fileStatus.state === 'loaded') {
      rowVirtualizer.scrollToOffset(0);
      scrollViewportRef.current?.scrollTo?.({ top: 0 });
    }
    stickyPushOffsetRef.current = 0;
    setStickySection(null);
  }, [activeFileName, activeTabId, searchQuery, filters, rowVirtualizer, fileStatus.state]);

  useLayoutEffect(() => {
    syncStickyHeader();
  }, [syncStickyHeader, rows]);

  useLayoutEffect(() => {
    if (stickyBtnRef.current) {
      const pushOffset = stickyPushOffsetRef.current;
      stickyBtnRef.current.style.transform =
        pushOffset === 0 ? '' : `translateY(${pushOffset}px)`;
    }
  }, [stickySection]);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const updateContainerWidth = () => {
      const measured = el.clientWidth;
      if (measured <= 0) return;
      const computed =
        typeof window !== 'undefined' ? window.getComputedStyle(el) : null;
      const padLeft = computed ? Number.parseFloat(computed.paddingLeft) || 0 : 0;
      const padRight = computed ? Number.parseFloat(computed.paddingRight) || 0 : 0;
      const innerWidth = Math.max(0, measured - padLeft - padRight);
      if (innerWidth > 0) {
        setContainerWidth((prev) => (prev === innerWidth ? prev : innerWidth));
      }
    };

    updateContainerWidth();

    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(() => {
      updateContainerWidth();
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
    fileStatus.state === 'loaded' && rows.length > 0
      ? rowVirtualizer.getVirtualItems()
      : [];

  let content: React.ReactNode;
  if (fileStatus.state === 'idle') {
    content = (
      <div className="empty-state" role="status" aria-live="polite">
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM17 21v-8H7v8M7 3v5h8" />
        </svg>
        <p>{strings.save_editor_select_title || 'Select a save file from the sidebar to view and edit its contents'}</p>
      </div>
    );
  } else if (fileStatus.state === 'loading') {
    content = (
      <div className="loading" role="status" aria-live="polite" aria-busy="true">
        <div className="loading-spinner" aria-hidden="true" />
        <span>
          {(strings.save_editor_loading_file || 'Loading {file}').replace('{file}', fileStatus.fileName)}
          {typeof fileStatus.percent === 'number' ? ` (${fileStatus.percent}%)` : '...'}
        </span>
      </div>
    );
  } else if (fileStatus.state === 'error') {
    const largeSaveInfo = parseSaveTooLargeError(fileStatus.errorMessage);
    if (largeSaveInfo) {
      const handleProceedLargeSave = async () => {
        if (isProceedingLargeSave) return;
        setIsProceedingLargeSave(true);
        try {
          if (autoAllowLargeSavesChecked && typeof contextApi?.updateLibraryConfig === 'function') {
            await contextApi.updateLibraryConfig({ autoAllowLargeSaves: true }).catch((err) => {
              console.warn('[SaveEditorContent] Failed to persist autoAllowLargeSaves setting:', err);
            });
          }
          onRetryLoad?.(fileStatus.fileName, { allowLargeSaves: true });
        } finally {
          setIsProceedingLargeSave(false);
        }
      };

      const sizeDesc =
        largeSaveInfo.actualBytes !== null
          ? (
              strings.save_editor_large_file_desc ||
              'This save file is {size}, which is larger than the 64 MB limit.'
            ).replace('{size}', formatBytesMiB(largeSaveInfo.actualBytes))
          : strings.save_editor_large_file_desc_unknown ||
            'This save file expands beyond the 64 MB limit.';

      const warningInfoText =
        strings.setting_auto_allow_large_saves_info ||
        'Very large save files can take longer to open and use more memory while editing.';

      content = (
        <div className="save-editor-large-file-state" role="alert">
          <div className="save-editor-large-file-title">
            {strings.save_editor_large_file_title || 'Large Save File (>64 MB)'}
          </div>
          <p className="save-editor-large-file-desc">{sizeDesc}</p>
          <div className="save-editor-large-file-opt">
            <label>
              <input
                type="checkbox"
                checked={autoAllowLargeSavesChecked}
                onChange={(e) => setAutoAllowLargeSavesChecked(e.target.checked)}
              />
              <span>
                {strings.save_editor_large_file_auto_allow ||
                  'Always allow saves over 64 MB from now on'}
              </span>
            </label>
            <span className="save-editor-info-wrap">
              <button
                type="button"
                className="save-editor-info-btn"
                aria-label={warningInfoText}
                aria-describedby={largeSaveTipId}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 3a.9.9 0 1 1 0 1.8A.9.9 0 0 1 8 4zm-.75 3h1.5v5h-1.5V7z" />
                </svg>
              </button>
              <span id={largeSaveTipId} role="tooltip" className="save-editor-info-tooltip">
                {warningInfoText}
              </span>
            </span>
          </div>
          <div className="save-editor-large-file-actions">
            <button
              type="button"
              className="primary-btn"
              aria-disabled={isProceedingLargeSave}
              onClick={() => void handleProceedLargeSave()}
            >
              {strings.save_editor_large_file_proceed || 'Proceed anyway'}
            </button>
          </div>
        </div>
      );
    } else {
      content = (
        <div className="save-editor-error-box" role="alert">
          <div className="save-editor-error-title">
            {(strings.save_editor_failed_load_file || 'Failed to load {file}').replace('{file}', fileStatus.fileName)}
          </div>
          <code>{fileStatus.errorMessage}</code>
          <div className="save-editor-error-actions">
            <button
              type="button"
              className="primary-btn"
              onClick={() => onRetryLoad?.(fileStatus.fileName)}
            >
              {strings.save_editor_retry || 'Retry'}
            </button>
          </div>
        </div>
      );
    }
  } else if (totalFilteredFields === 0) {
    content =
      searchQuery.trim().length > 0 ? (
        <div className="empty-state" role="status" aria-live="polite">
          <p>{strings.save_editor_no_results || `No matching variables found for "${searchQuery.trim()}".`}</p>
          <button
            type="button"
            className="secondary-btn"
            onClick={handleClearSearchFilter}
          >
            {strings.save_editor_clear_search_filter || 'Clear search filter'}
          </button>
        </div>
      ) : (
        <div className="empty-state" role="status" aria-live="polite">
          {strings.save_editor_no_data_in_category || 'No variables exist in the selected category.'}
        </div>
      );
  } else {
    content = (
      <div key={activeFileName ?? 'loaded'} className="save-editor-loaded-stage">
        {activeTabId === 'all' && sectionTabIds.length > 0 && (
          <div className="all-tab-controls">
            <button
              type="button"
              className="all-tab-btn"
              onClick={() => dispatch.expandAllSections()}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="15 3 21 3 21 9" />
                <polyline points="9 21 3 21 3 15" />
                <line x1="21" y1="3" x2="14" y2="10" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
              <span>{strings.save_editor_expand_all || 'Expand All'}</span>
            </button>
            <button
              type="button"
              className="all-tab-btn"
              onClick={() => dispatch.collapseAllSections(sectionTabIds)}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="4 14 10 14 10 20" />
                <polyline points="20 10 14 10 14 4" />
                <line x1="14" y1="10" x2="21" y2="3" />
                <line x1="10" y1="14" x2="3" y2="21" />
              </svg>
              <span>{strings.save_editor_collapse_all || 'Collapse All'}</span>
            </button>
          </div>
        )}
        <div className="save-editor-viewport-frame">
          {stickySection && (
            <div className="save-section-sticky-overlay">
              <button
                ref={stickyBtnRef}
                type="button"
                className="save-section-header save-section-header--sticky"
                aria-expanded={!stickySection.isCollapsed}
                onClick={handleStickyHeaderClick}
              >
                <span className="save-section-title">{stickySection.label}</span>
                <span className="save-section-count">({stickySection.count})</span>
              </button>
            </div>
          )}
          <div
            ref={scrollViewportRef}
            className="save-editor-scroll-viewport"
            onScroll={syncStickyHeader}
          >
            <div
              className="save-editor-virtual-spacer"
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {virtualRows.map((virtualRow) => {
                const row = rows[virtualRow.index];
                if (!row) return null;

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
                    {row.kind === 'section-header' ? (
                      <button
                        type="button"
                        className={
                          row.isCollapsed ? 'save-section-header collapsed' : 'save-section-header'
                        }
                        aria-expanded={!row.isCollapsed}
                        onClick={() => dispatch.toggleSection(row.tabId)}
                      >
                        <span className="save-section-title">{row.label}</span>
                        <span className="save-section-count">({row.count})</span>
                      </button>
                    ) : (
                      <div
                        className={
                          row.fields[0]?.tabId && expandingTabs.has(row.fields[0].tabId)
                            ? 'save-grid-virtual-row save-grid-virtual-row--expanding'
                            : 'save-grid-virtual-row'
                        }
                        style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}
                      >
                        {row.fields.map((field) => {
                          const rawModified = Object.hasOwn(modifiedFields, field.id)
                            ? modifiedFields[field.id]
                            : undefined;
                          const value: number | string | boolean =
                            rawModified !== undefined && rawModified !== null
                              ? rawModified
                              : field.value;
                          const isDirty = dirtyKeys.has(field.id);
                          const normLabel = (field.label || '').normalize('NFC');
                          const translatedLabel = getTranslation(translations, normLabel);
                          const isTranslated = Boolean(
                            translatedLabel && translatedLabel !== field.label
                          );
                          const label = translatedLabel ?? field.label;

                          return (
                            <SaveFieldRow
                              key={field.id}
                              field={field}
                              value={value}
                              isDirty={isDirty}
                              isTranslated={isTranslated}
                              isPinned={pinnedIds.has(field.id)}
                              label={label}
                              onChange={handleChange}
                              onTogglePin={handleTogglePin}
                              pinLabelTemplate={strings.save_editor_pin_field_aria}
                              unpinLabelTemplate={strings.save_editor_unpin_field_aria}
                              pinTitle={strings.save_editor_pin_field_title}
                              unpinTitle={strings.save_editor_unpin_field_title}
                              deltaWasTemplate={strings.save_editor_delta_was}
                              deltaChangedText={strings.save_editor_delta_changed}
                              invalidNumberText={strings.save_editor_invalid_number}
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={contentRef}
      className="save-editor-content"
      tabIndex={-1}
    >
      {content}
    </div>
  );
}
