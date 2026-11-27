import React, { useCallback, useMemo, useState } from 'react';
import { sanitizeUserPaths } from '../../shared/path-sanitizer';
import type {
  FolderSection as FolderSectionModel,
  LibrarySectionsProjection,
} from '../library/library-sections';
import type { LibraryViewItem } from '../library-stacks';
import { useStableItemIds } from '../hooks/useStableItemIds';
import type { UiStorageAdapter } from '../state/ui-runtime-state';
import { FolderAccordionToolbar } from './FolderAccordionToolbar';
import { FolderSection } from './FolderSection';

const COLLAPSED_FOLDERS_STORAGE_KEY = 'yumeshelf_collapsed_folders';

const defaultStorage: UiStorageAdapter =
  typeof localStorage !== 'undefined'
    ? localStorage
    : {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      };

const formatSanitizedError = (err: unknown) => ({
  error: sanitizeUserPaths(err instanceof Error ? err.message : err),
  stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
});

function readCollapsedFolders(
  storage: UiStorageAdapter,
  nowProvider: () => number = Date.now
): Set<string> {
  let raw: string | null = null;
  try {
    raw = storage.getItem(COLLAPSED_FOLDERS_STORAGE_KEY);
    if (!raw) return new Set<string>();
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const envelope = parsed as Record<string, unknown>;
      if (typeof envelope.schemaVersion === 'number' && envelope.schemaVersion > 1) {
        console.warn('[FolderAccordion] Ignoring collapsed folders with newer schemaVersion:', {
          schemaVersion: envelope.schemaVersion,
        });
        return new Set<string>();
      }
      if (envelope.schemaVersion === 1 && Array.isArray(envelope.collapsed)) {
        return new Set(
          envelope.collapsed.filter(
            (item): item is string => typeof item === 'string' && item.trim().length > 0
          )
        );
      }
    }
    throw new SyntaxError('Stored collapsed folders payload is malformed or invalid schema structure');
  } catch (err) {
    if (err instanceof SyntaxError && raw !== null) {
      console.warn(
        '[FolderAccordion] Corrupt collapsed folders payload encountered; quarantining:',
        formatSanitizedError(err)
      );
      const corruptKey = `yumeshelf_collapsed_folders_corrupt_${nowProvider()}`;
      try {
        storage.setItem(corruptKey, raw);
      } catch (storageErr) {
        console.warn(
          '[FolderAccordion] Failed during corrupt collapsed folders recovery:',
          formatSanitizedError(storageErr)
        );
      } finally {
        try {
          storage.removeItem(COLLAPSED_FOLDERS_STORAGE_KEY);
        } catch (removeErr) {
          console.warn(
            '[FolderAccordion] Failed during corrupt collapsed folders recovery:',
            formatSanitizedError(removeErr)
          );
        }
      }
    } else {
      console.warn(
        '[FolderAccordion] Failed to read collapsed folders from storage:',
        formatSanitizedError(err)
      );
    }
    return new Set<string>();
  }
}

function writeCollapsedFolders(nextSet: ReadonlySet<string>, storage: UiStorageAdapter): void {
  try {
    const existingRaw = storage.getItem(COLLAPSED_FOLDERS_STORAGE_KEY);
    if (existingRaw) {
      try {
        const existing: unknown = JSON.parse(existingRaw);
        if (
          existing &&
          typeof existing === 'object' &&
          !Array.isArray(existing) &&
          typeof (existing as Record<string, unknown>).schemaVersion === 'number' &&
          ((existing as Record<string, unknown>).schemaVersion as number) > 1
        ) {
          const existingVersion = (existing as Record<string, unknown>).schemaVersion;
          console.warn(
            '[FolderAccordion] Aborting write: collapsed folders schema version is newer than supported version:',
            {
              existingVersion,
              maxSupportedVersion: 1,
              internal_outcome: 'ABORTED',
              abort_reason: 'FUTURE_SCHEMA_VERSION',
            }
          );
          return;
        }
      } catch {
        // Ignore SyntaxError so corrupt non-JSON value in storage never aborts the write
      }
    }
    storage.setItem(
      COLLAPSED_FOLDERS_STORAGE_KEY,
      JSON.stringify({ schemaVersion: 1, collapsed: Array.from(nextSet) })
    );
  } catch (err) {
    console.warn('[FolderAccordion] Failed to persist collapsed folders:', formatSanitizedError(err));
  }
}

export interface MascotGridSlot {
  readonly targetScope: 'fav' | string; // 'fav' or matching folder section.path
  readonly insertIndex: number;
  readonly renderCard: (sectionScope: string) => React.ReactNode;
}

export interface FolderAccordionProps {
  readonly projection: LibrarySectionsProjection;
  readonly storage?: UiStorageAdapter;
  readonly nowProvider?: () => number;
  readonly renderItem: (item: LibraryViewItem, sectionScope?: string) => React.ReactNode;
  readonly isFiltered?: boolean;
  readonly renderTitle?: (section: FolderSectionModel) => React.ReactNode;
  readonly renderEmptyFolder?: (section: FolderSectionModel) => React.ReactNode;
  readonly isDragActive?: boolean;
  readonly mascotSlot?: MascotGridSlot | null;
  readonly renderSectionContainer?: (
    containerId: string,
    itemIds: readonly string[],
    renderGrid: (droppableRef?: React.Ref<HTMLDivElement>, isOver?: boolean) => React.ReactNode,
    options?: { readonly disabled?: boolean }
  ) => React.ReactNode;
}

/**
 * Renders tab-scoped Favorites and collapsible folder sections with persistent collapse state.
 */
export const FolderAccordion: React.FC<FolderAccordionProps> = ({
  projection,
  storage,
  nowProvider = Date.now,
  renderItem,
  isFiltered = false,
  renderTitle,
  renderEmptyFolder,
  isDragActive = false,
  mascotSlot = null,
  renderSectionContainer,
}) => {
  const resolvedStorage = storage ?? defaultStorage;
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(() =>
    readCollapsedFolders(resolvedStorage, nowProvider)
  );

  const handleToggleCollapse = useCallback(
    (folderPath: string) => {
      setCollapsedFolders((prev) => {
        const next = new Set(prev);
        if (next.has(folderPath)) {
          next.delete(folderPath);
        } else {
          next.add(folderPath);
        }
        writeCollapsedFolders(next, resolvedStorage);
        return next;
      });
    },
    [resolvedStorage]
  );

  const handleExpandAll = useCallback(() => {
    setCollapsedFolders(() => {
      const next = new Set<string>();
      writeCollapsedFolders(next, resolvedStorage);
      return next;
    });
  }, [resolvedStorage]);

  const handleCollapseAll = useCallback(() => {
    setCollapsedFolders(() => {
      const next = new Set<string>(
        (projection.folderSections ?? [])
          .filter((section) => section.isCollapsible)
          .map((section) => section.path)
      );
      writeCollapsedFolders(next, resolvedStorage);
      return next;
    });
  }, [projection.folderSections, resolvedStorage]);

  const favorites = projection.favoritesSection ?? [];
  const favItemIds = useStableItemIds(favorites, 'fav');
  const folderSections = projection.folderSections ?? [];
  const hasFavMascotSlot = mascotSlot?.targetScope === 'fav';
  const showFavorites =
    projection.effectiveTabId === 'fav' ||
    (projection.effectiveTabId === 'all' &&
      (favorites.length > 0 || Boolean(isDragActive) || hasFavMascotSlot));
  const showFolders = projection.effectiveTabId !== 'fav';

  const resolvedFolderMascotSlot = useMemo<MascotGridSlot | null>(() => {
    if (!mascotSlot || mascotSlot.targetScope === 'fav') {
      return null;
    }
    if (mascotSlot.targetScope === 'folder:auto') {
      if (folderSections.length === 0) return null;
      const selectedSection =
        folderSections.find((section) => !section.isCollapsible || !collapsedFolders.has(section.path)) ??
        folderSections[0];
      return {
        ...mascotSlot,
        targetScope: selectedSection.path,
      };
    }
    return mascotSlot;
  }, [mascotSlot, folderSections, collapsedFolders]);

  const renderFavGrid = (droppableRef?: React.Ref<HTMLDivElement>, isOver?: boolean) => {
    const renderedFavItems = favorites.map((item) => renderItem(item, 'fav'));
    if (hasFavMascotSlot && mascotSlot) {
      const idx = Math.max(0, Math.min(mascotSlot.insertIndex, renderedFavItems.length));
      renderedFavItems.splice(idx, 0, mascotSlot.renderCard('fav'));
    }
    return (
      <div
        ref={droppableRef}
        id="fav-grid"
        className={`game-grid grid-section drop-zone${isOver ? ' drag-over' : ''}`}
      >
        {renderedFavItems}
      </div>
    );
  };

  return (
    <div id="game-grid-wrapper" className="folder-accordion-container">
      {showFavorites &&
        (renderSectionContainer
          ? renderSectionContainer('fav', favItemIds, renderFavGrid)
          : renderFavGrid())}

      {showFavorites && showFolders && folderSections.length > 0 && (
        <div id="favorites-separator" className="favorites-separator-container">
          <div className="favorites-separator" />
        </div>
      )}

      {showFolders && (
        <>
          {projection.effectiveTabId === 'all' && (
            <FolderAccordionToolbar
              onExpandAll={handleExpandAll}
              onCollapseAll={handleCollapseAll}
            />
          )}
          {folderSections.map((section) => {
            const isExpanded = !section.isCollapsible || !collapsedFolders.has(section.path);
            return (
              <FolderSection
                key={section.path}
                section={section}
                isExpanded={isExpanded}
                onToggleCollapse={handleToggleCollapse}
                renderItem={renderItem}
                isFiltered={isFiltered}
                renderTitle={renderTitle}
                renderEmptyFolder={renderEmptyFolder}
                mascotSlot={resolvedFolderMascotSlot}
                renderSectionContainer={renderSectionContainer}
              />
            );
          })}
        </>
      )}
    </div>
  );
};
