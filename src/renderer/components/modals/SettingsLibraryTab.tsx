import React, { useEffect, useRef, useState } from 'react';
import type { PlatformInput } from '../../../shared/path-subsumption';
import type { FlattenedCategoryItem } from '../../domain/category-tree';
import type { LocaleStrings } from '../../i18n/locale-strings';
import { PathReorderList } from './PathReorderList';
import { SettingInfoTooltip } from './SettingInfoTooltip';

export type LibraryAsyncStatus = 'idle' | 'submitting' | 'success' | 'error';

export interface SettingsLibraryPathsListProps {
  libraryPaths: readonly string[];
  isMutating: boolean;
  isScanning: boolean;
  strings: LocaleStrings;
  pathListContainerRef: React.RefObject<HTMLDivElement | null>;
  pathItemRefs: React.MutableRefObject<Map<string, HTMLElement>>;
  onOpenPath: (dirPath: string) => void;
  onChangePath: (dirPath: string) => void;
  onRemovePath: (dirPath: string) => void;
}

export interface SettingsLibraryTabProps {
  language: string;
  strings: LocaleStrings;
  libraryPaths: readonly string[];
  folderAliases?: Readonly<Record<string, string>>;
  targetPlatform?: PlatformInput;
  exposeBetaOptions?: boolean;
  locationDisplayMode: 'parent' | 'full';
  titleDisplayMode: 'metadata' | 'legacy_folder';
  displayProductCodes: boolean;
  maxDepth: number;
  isUpdatingConfig: boolean;
  onLocationDisplayModeChange: (nextMode: 'parent' | 'full') => void;
  onUpdateDisplayConfig: (updates: {
    titleDisplayMode?: 'metadata' | 'legacy_folder';
    displayProductCodes?: boolean;
    autoAllowLargeSaves?: boolean;
  }) => void;
  onMaxDepthChange: (nextDepth: number) => void;
  isMutating: boolean;
  isScanning: boolean;
  isAddingGame: boolean;
  onAddLibraryPath: () => void;
  onAddManualGame: () => void;
  onOpenPath: (dirPath: string) => void;
  onChangePath: (dirPath: string) => void;
  onRemovePath: (dirPath: string) => void;
  onReorderPaths?: (newPaths: string[]) => Promise<void>;
  onShowToast?: (message: string) => void;
  pathListContainerRef: React.RefObject<HTMLDivElement | null>;
  pathItemRefs: React.MutableRefObject<Map<string, HTMLElement>>;
  /** Optional slot seam for replacing the default configured library paths list (e.g. PathReorderList). */
  renderPathsList?: (props: SettingsLibraryPathsListProps) => React.ReactNode;
  /** Optional ReactNode slot for replacing the default configured library paths list. */
  pathsListSlot?: React.ReactNode;

  // Category management
  flattenedCategories: readonly FlattenedCategoryItem[];
  isCreatingCategory: boolean;
  newCategoryName: string;
  categoryCreateStatus: LibraryAsyncStatus;
  categoryCreateError: string | null;
  newCategoryInputRef: React.RefObject<HTMLInputElement | null>;
  onStartCreateCategory: () => void;
  onCancelCreateCategory: () => void;
  onNewCategoryNameChange: (name: string) => void;
  onCreateCategorySubmit: (e: React.FormEvent) => void;

  renamingCategoryId: string | null;
  renameCategoryDraft: string;
  categoryRenameStatus: LibraryAsyncStatus;
  categoryRenameError: string | null;
  onStartRenameCategory: (categoryId: string, currentName: string) => void;
  onCancelRenameCategory: () => void;
  onRenameCategoryDraftChange: (draft: string) => void;
  onRenameCategorySubmit: (e: React.FormEvent, categoryId: string) => void;

  pendingDeleteCategoryId: string | null;
  isDeletingCategory: boolean;
  categoryDeleteError: string | null;
  onRequestDeleteCategory: (categoryId: string) => void;
  onCancelDeleteCategory: (categoryId: string) => void;
  onConfirmDeleteCategory: (categoryId: string, index: number) => void;

  categoryListContainerRef: React.RefObject<HTMLDivElement | null>;
  categoryItemRefs: React.MutableRefObject<Map<string, HTMLElement>>;
  deleteTriggerRefs: React.MutableRefObject<Map<string, HTMLButtonElement>>;
}

function DefaultLibraryPathsList({
  libraryPaths,
  isMutating,
  isScanning,
  strings,
  pathListContainerRef,
  pathItemRefs,
  onOpenPath,
  onChangePath,
  onRemovePath,
}: SettingsLibraryPathsListProps): React.JSX.Element {
  return (
    <div
      ref={pathListContainerRef}
      tabIndex={-1}
      className="library-paths-list"
      aria-label="Configured library paths"
    >
      {libraryPaths.length === 0 ? (
        <p className="empty-list-hint">
          {strings.settings_paths_empty || 'No library directories configured.'}
        </p>
      ) : (
        libraryPaths.map((dirPath) => {
          const canRemove = libraryPaths.length > 1;
          return (
            <div
              key={dirPath}
              ref={(el) => {
                if (el) {
                  pathItemRefs.current.set(dirPath, el);
                } else {
                  pathItemRefs.current.delete(dirPath);
                }
              }}
              tabIndex={-1}
              className="library-path-entry"
            >
              <span className="library-path-icon" aria-hidden="true">
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
              </span>
              <button
                type="button"
                className="library-path-link"
                title={dirPath}
                onClick={() => onOpenPath(dirPath)}
              >
                {dirPath}
              </button>
              <div className="library-path-actions">
                <button
                  type="button"
                  className="library-path-action-btn change-btn"
                  aria-label={`Change path ${dirPath}`}
                  aria-disabled={isMutating || isScanning}
                  style={isMutating || isScanning ? { pointerEvents: 'none' } : undefined}
                  onClick={() => onChangePath(dirPath)}
                >
                  {strings.change || 'Change'}
                </button>
                <button
                  type="button"
                  className="library-path-action-btn remove-btn"
                  aria-label={`Remove path ${dirPath}`}
                  disabled={!canRemove}
                  aria-disabled={!canRemove || isMutating || isScanning}
                  style={
                    !canRemove || isMutating || isScanning
                      ? { pointerEvents: 'none' }
                      : undefined
                  }
                  onClick={() => {
                    if (canRemove) onRemovePath(dirPath);
                  }}
                >
                  {strings.btn_remove || 'Remove'}
                </button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function MaxDepthStepper({
  value,
  onChange,
}: {
  value: number;
  onChange: (next: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const skipBlurCommitRef = useRef(false);

  useEffect(() => {
    skipBlurCommitRef.current = false;
    setDraft(String(value));
  }, [value]);

  const handleCommit = (fromEnter = false) => {
    const parsed = parseInt(draft, 10);
    if (Number.isFinite(parsed)) {
      skipBlurCommitRef.current = fromEnter;
      const clamped = Math.min(12, Math.max(0, parsed));
      setDraft(String(clamped));
      if (clamped !== value) {
        onChange(clamped);
      }
    } else {
      skipBlurCommitRef.current = false;
      setDraft(String(value));
    }
  };

  const atMin = value <= 0;
  const atMax = value >= 12;
  return (
    <div className="max-depth-stepper">
      <button
        type="button"
        className="max-depth-stepper-btn"
        title="Decrease max depth"
        aria-label="Decrease max depth"
        aria-disabled={atMin}
        style={atMin ? { pointerEvents: 'none' } : undefined}
        onClick={() => {
          if (!atMin) onChange(Math.max(0, value - 1));
        }}
      >
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M6 12h12" />
        </svg>
      </button>
      <input
        id="max-depth-input"
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={2}
        value={draft}
        aria-label="Max scan depth"
        onChange={(e) => {
          skipBlurCommitRef.current = false;
          setDraft(e.target.value);
        }}
        onBlur={() => {
          if (skipBlurCommitRef.current) {
            skipBlurCommitRef.current = false;
            return;
          }
          handleCommit(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            handleCommit(true);
          }
        }}
      />
      <button
        type="button"
        className="max-depth-stepper-btn"
        title="Increase max depth"
        aria-label="Increase max depth"
        aria-disabled={atMax}
        style={atMax ? { pointerEvents: 'none' } : undefined}
        onClick={() => {
          if (!atMax) onChange(Math.min(12, value + 1));
        }}
      >
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M12 6v12" />
          <path d="M6 12h12" />
        </svg>
      </button>
    </div>
  );
}

export function SettingsLibraryTab({
  language,
  strings,
  libraryPaths,
  folderAliases,
  targetPlatform,
  exposeBetaOptions = false,
  locationDisplayMode,
  titleDisplayMode,
  displayProductCodes,
  maxDepth,
  isUpdatingConfig,
  onLocationDisplayModeChange,
  onUpdateDisplayConfig,
  onMaxDepthChange,
  isMutating,
  isScanning,
  isAddingGame,
  onAddLibraryPath,
  onAddManualGame,
  onOpenPath,
  onChangePath,
  onRemovePath,
  onReorderPaths,
  onShowToast,
  pathListContainerRef,
  pathItemRefs,
  renderPathsList,
  pathsListSlot,
  flattenedCategories,
  isCreatingCategory,
  newCategoryName,
  categoryCreateStatus,
  categoryCreateError,
  newCategoryInputRef,
  onStartCreateCategory,
  onCancelCreateCategory,
  onNewCategoryNameChange,
  onCreateCategorySubmit,
  renamingCategoryId,
  renameCategoryDraft,
  categoryRenameStatus,
  categoryRenameError,
  onStartRenameCategory,
  onCancelRenameCategory,
  onRenameCategoryDraftChange,
  onRenameCategorySubmit,
  pendingDeleteCategoryId,
  isDeletingCategory,
  categoryDeleteError,
  onRequestDeleteCategory,
  onCancelDeleteCategory,
  onConfirmDeleteCategory,
  categoryListContainerRef,
  categoryItemRefs,
  deleteTriggerRefs,
}: SettingsLibraryTabProps): React.JSX.Element {
  const pathsListProps: SettingsLibraryPathsListProps = {
    libraryPaths,
    isMutating,
    isScanning,
    strings,
    pathListContainerRef,
    pathItemRefs,
    onOpenPath,
    onChangePath,
    onRemovePath,
  };

  return (
    <div
      id="settings-panel-library"
      role="tabpanel"
      aria-labelledby="settings-tab-library"
      className="settings-tab-panel"
    >
      <div className="setting-section">
        <div className="setting-item">
          <span className="setting-label">
            {language === 'en' ? 'Library Paths' : strings.path || 'Library Paths'}
          </span>
          <div className="setting-field-group">
            <button
              id="btn-add-library-path"
              type="button"
              className="small-btn text-btn"
              aria-disabled={isMutating || isScanning}
              style={isMutating || isScanning ? { pointerEvents: 'none' } : undefined}
              onClick={onAddLibraryPath}
            >
              {strings.btn_add_path || '+ Add Path'}
            </button>
            <button
              id="btn-add-manual-game"
              type="button"
              className="small-btn text-btn"
              aria-disabled={isMutating || isScanning}
              style={isMutating || isScanning ? { pointerEvents: 'none' } : undefined}
              onClick={onAddManualGame}
            >
              {isAddingGame ? 'Adding...' : strings.btn_add_game || '+ Add Game'}
            </button>
          </div>
        </div>

        {isScanning && (
          <div className="library-scan-status" role="status" aria-live="polite">
            <span className="scan-spinner" aria-hidden="true" />
            <span>Scanning library directories...</span>
          </div>
        )}

        {pathsListSlot !== undefined
          ? pathsListSlot
          : renderPathsList
            ? renderPathsList(pathsListProps)
            : (
              <PathReorderList
                paths={libraryPaths}
                disabled={isMutating || isScanning}
                strings={strings}
                folderAliases={folderAliases}
                targetPlatform={targetPlatform}
                pathListContainerRef={pathListContainerRef}
                pathItemRefs={pathItemRefs}
                onOpenPath={onOpenPath}
                onChangePath={onChangePath}
                onRemovePath={onRemovePath}
                onReorderPaths={onReorderPaths}
                onShowToast={onShowToast}
              />
            )}
      </div>

      <div className="setting-item">
        <div className="setting-label-with-info">
          <label htmlFor="max-depth-input">
            {language === 'en'
              ? 'Max Scan Depth'
              : strings.max_depth_label || 'Max Scan Depth'}
          </label>
          <SettingInfoTooltip
            text={
              strings.setting_max_depth_info ||
              'How many subfolder levels deep YumeShelf searches for games. Increase this if your games are inside nested folders (higher numbers take longer to scan).'
            }
          />
        </div>
        <div className="setting-control-zone">
          <MaxDepthStepper value={maxDepth} onChange={onMaxDepthChange} />
        </div>
      </div>

      <div className="setting-item">
        <div className="setting-label-with-info">
          <label htmlFor="location-display-select">
            {language === 'en'
              ? 'Location Display'
              : strings.location_display_label || 'Location Display'}
          </label>
          <SettingInfoTooltip
            text={
              strings.setting_location_display_info ||
              'Choose whether game cards show only the enclosing folder name or the full folder path.'
            }
          />
        </div>
        <div className="setting-control-zone">
          <select
            id="location-display-select"
            value={locationDisplayMode}
            onChange={(e) =>
              onLocationDisplayModeChange(e.target.value as 'parent' | 'full')
            }
          >
            <option value="parent">
              {language === 'en'
                ? 'Parent Folder'
                : strings.location_display_parent || 'Parent Folder'}
            </option>
            <option value="full">
              {language === 'en'
                ? 'Full Path'
                : strings.location_display_full || 'Full Path'}
            </option>
          </select>
        </div>
      </div>

      <div className="setting-item">
        <div className="setting-label-with-info">
          <label htmlFor="title-display-select">
            {strings.title_display_label || 'Title Display'}
          </label>
          <SettingInfoTooltip
            text={
              strings.setting_title_display_info ||
              "Choose whether cards show the game's detected title or the exact folder name on your drive."
            }
          />
        </div>
        <div className="setting-control-zone">
          <select
            id="title-display-select"
            value={titleDisplayMode}
            aria-disabled={isUpdatingConfig}
            style={isUpdatingConfig ? { pointerEvents: 'none', opacity: 0.6 } : undefined}
            onChange={(e) =>
              onUpdateDisplayConfig({
                titleDisplayMode: e.target.value as 'metadata' | 'legacy_folder',
              })
            }
          >
            <option value="metadata">
              {language === 'en'
                ? 'Metadata Title'
                : strings.title_display_metadata || 'Metadata Title'}
            </option>
            <option value="legacy_folder">
              {language === 'en'
                ? 'Folder Name'
                : strings.title_display_legacy || 'Folder Name'}
            </option>
          </select>
        </div>
      </div>

      <div className="setting-item">
        <div className="setting-label-with-info">
          <label htmlFor="product-codes-select">
            {language === 'en'
              ? 'Product Codes'
              : strings.display_codes_label || 'Product Codes'}
          </label>
          <SettingInfoTooltip
            text={
              strings.setting_product_codes_info ||
              'Show store catalog codes (like RJ or VJ) on game cards when found in the folder name.'
            }
          />
        </div>
        <div className="setting-control-zone">
          <select
            id="product-codes-select"
            value={displayProductCodes ? 'on' : 'off'}
            aria-disabled={isUpdatingConfig}
            style={isUpdatingConfig ? { pointerEvents: 'none', opacity: 0.6 } : undefined}
            onChange={(e) =>
              onUpdateDisplayConfig({
                displayProductCodes: e.target.value === 'on',
              })
            }
          >
            <option value="off">{strings.option_off || 'Off'}</option>
            <option value="on">{strings.option_on || 'On'}</option>
          </select>
        </div>
      </div>

      {exposeBetaOptions && (
        <div className="setting-section">
          <div className="setting-item">
            <span className="setting-label">
              {strings.settings_categories_label || 'Categories'}
          </span>
          <button
            type="button"
            className="small-btn text-btn"
            onClick={onStartCreateCategory}
          >
            {strings.btn_add_category || '+ Add Category'}
          </button>
        </div>

        {isCreatingCategory && (
          <form className="category-create-form" onSubmit={onCreateCategorySubmit}>
            <input
              ref={newCategoryInputRef}
              type="text"
              value={newCategoryName}
              aria-label="New category name"
              aria-invalid={categoryCreateError ? 'true' : undefined}
              aria-describedby={categoryCreateError ? 'category-create-error' : undefined}
              placeholder="Category name"
              onChange={(e) => onNewCategoryNameChange(e.target.value)}
            />
            <button
              type="submit"
              className="small-btn"
              aria-disabled={categoryCreateStatus === 'submitting'}
              style={
                categoryCreateStatus === 'submitting'
                  ? { pointerEvents: 'none', opacity: 0.6 }
                  : undefined
              }
            >
              {categoryCreateStatus === 'submitting' ? 'Saving...' : 'Create'}
            </button>
            <button
              type="button"
              className="small-btn secondary-btn"
              aria-disabled={categoryCreateStatus === 'submitting'}
              onClick={() => {
                if (categoryCreateStatus === 'submitting') return;
                onCancelCreateCategory();
              }}
            >
              Cancel
            </button>
            {categoryCreateError && (
              <p id="category-create-error" className="category-validation-error" role="alert">
                {categoryCreateError}
              </p>
            )}
          </form>
        )}

        <div
          ref={categoryListContainerRef}
          tabIndex={-1}
          className="category-list"
          aria-label="Categories list"
        >
          {flattenedCategories.length === 0 ? (
            <p className="empty-list-hint">
              {strings.settings_categories_empty || 'No categories created.'}
            </p>
          ) : (
            flattenedCategories.map((category, index) => (
              <div
                key={category.id}
                ref={(el) => {
                  if (el) {
                    categoryItemRefs.current.set(category.id, el);
                  } else {
                    categoryItemRefs.current.delete(category.id);
                  }
                }}
                tabIndex={-1}
                className="category-row"
              >
                {renamingCategoryId === category.id ? (
                  <form
                    className="category-rename-form"
                    onSubmit={(e) => onRenameCategorySubmit(e, category.id)}
                  >
                    <input
                      type="text"
                      value={renameCategoryDraft}
                      aria-label={`Rename category ${category.name}`}
                      aria-invalid={categoryRenameError ? 'true' : undefined}
                      aria-describedby={
                        categoryRenameError ? `category-rename-error-${category.id}` : undefined
                      }
                      onChange={(e) => onRenameCategoryDraftChange(e.target.value)}
                    />
                    <button
                      type="submit"
                      className="small-btn"
                      aria-disabled={categoryRenameStatus === 'submitting'}
                      style={
                        categoryRenameStatus === 'submitting'
                          ? { pointerEvents: 'none', opacity: 0.6 }
                          : undefined
                      }
                    >
                      {categoryRenameStatus === 'submitting' ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      type="button"
                      className="small-btn secondary-btn"
                      aria-disabled={categoryRenameStatus === 'submitting'}
                      onClick={() => {
                        if (categoryRenameStatus === 'submitting') return;
                        onCancelRenameCategory();
                      }}
                    >
                      Cancel
                    </button>
                    {categoryRenameError && (
                      <p
                        id={`category-rename-error-${category.id}`}
                        className="category-validation-error"
                        role="alert"
                      >
                        {categoryRenameError}
                      </p>
                    )}
                  </form>
                ) : (
                  <>
                    <span className="category-name">{category.trailLabel}</span>
                    <div className="category-actions">
                      <button
                        type="button"
                        className="small-btn"
                        aria-label={`Rename ${category.name}`}
                        onClick={() => onStartRenameCategory(category.id, category.name)}
                      >
                        Rename
                      </button>
                      <button
                        ref={(el) => {
                          if (el) {
                            deleteTriggerRefs.current.set(category.id, el);
                          } else {
                            deleteTriggerRefs.current.delete(category.id);
                          }
                        }}
                        type="button"
                        className="small-btn danger-btn"
                        aria-label={`Delete ${category.name}`}
                        onClick={() => onRequestDeleteCategory(category.id)}
                      >
                        Delete
                      </button>

                      {pendingDeleteCategoryId === category.id && (
                        <div
                          className="category-delete-confirm-popover"
                          role="dialog"
                          aria-label={`Confirm deletion of ${category.name}`}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                              e.preventDefault();
                              e.stopPropagation();
                              onCancelDeleteCategory(category.id);
                            }
                          }}
                        >
                          <p className="confirm-text">
                            Delete this category? Games in it will become uncategorized.
                          </p>
                          {categoryDeleteError && (
                            <p className="category-delete-error" role="alert">
                              {categoryDeleteError}
                            </p>
                          )}
                          <div className="confirm-actions">
                            <button
                              type="button"
                              className="small-btn danger-btn"
                              aria-disabled={isDeletingCategory}
                              style={
                                isDeletingCategory
                                  ? { pointerEvents: 'none', opacity: 0.6 }
                                  : undefined
                              }
                              onClick={() => onConfirmDeleteCategory(category.id, index)}
                            >
                              {isDeletingCategory ? 'Deleting...' : 'Delete'}
                            </button>
                            <button
                              type="button"
                              className="small-btn secondary-btn"
                              aria-disabled={isDeletingCategory}
                              style={
                                isDeletingCategory
                                  ? { pointerEvents: 'none', opacity: 0.6 }
                                  : undefined
                              }
                              onClick={() => onCancelDeleteCategory(category.id)}
                              autoFocus
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))
          )}
          </div>
        </div>
      )}
    </div>
  );
}
