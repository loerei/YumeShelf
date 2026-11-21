import React from 'react';
import { useLocaleStrings } from '../../i18n/locale-strings';
import {
  useActiveSaveTabId,
  useSaveEditorDispatch,
  useSaveElectronAPI,
  useSaveFilters,
} from '../store/save-editor-store';

/**
 * Renders Save Editor visibility and search-scope filter checkboxes below the search bar.
 */
export const SaveEditorFilterBar: React.FC = () => {
  const activeTabId = useActiveSaveTabId();
  const filters = useSaveFilters();
  const dispatch = useSaveEditorDispatch();
  const contextApi = useSaveElectronAPI();
  const strings = useLocaleStrings(undefined, contextApi ?? null);

  return (
    <div
      className="save-editor-filters"
      role="group"
      aria-label={strings.save_editor_filters_aria || 'Save variable filters'}
    >
      <label className="save-editor-filter-check">
        <input
          type="checkbox"
          className="show-empty-check"
          checked={filters.showEmpty}
          onChange={(e) => dispatch.setFilter({ showEmpty: e.target.checked })}
        />
        <span>{strings.save_editor_show_empty || 'Show empty variables'}</span>
      </label>

      <label className="save-editor-filter-check">
        <input
          type="checkbox"
          className="show-important-check"
          checked={filters.showImportant}
          onChange={(e) => dispatch.setFilter({ showImportant: e.target.checked })}
        />
        <span>{strings.save_editor_show_important || 'Always show important'}</span>
      </label>

      <label className="save-editor-filter-check">
        <input
          type="checkbox"
          className="exact-match-check"
          checked={filters.exactMatch}
          onChange={(e) => dispatch.setFilter({ exactMatch: e.target.checked })}
        />
        <span>{strings.save_editor_exact || 'Exact match'}</span>
      </label>

      <div className="filter-divider" aria-hidden="true" />

      <label className="save-editor-filter-check">
        <input
          type="checkbox"
          className="search-name-check"
          checked={filters.searchName}
          onChange={(e) => dispatch.setFilter({ searchName: e.target.checked })}
        />
        <span>{strings.save_editor_search_name || 'Name'}</span>
      </label>

      <label className="save-editor-filter-check">
        <input
          type="checkbox"
          className="search-value-check"
          checked={filters.searchValue}
          onChange={(e) => dispatch.setFilter({ searchValue: e.target.checked })}
        />
        <span>{strings.save_editor_search_value || 'Value'}</span>
      </label>

      <label className="save-editor-filter-check">
        <input
          type="checkbox"
          className="search-index-check"
          checked={filters.searchIndex}
          onChange={(e) => dispatch.setFilter({ searchIndex: e.target.checked })}
        />
        <span>{strings.save_editor_search_index || 'Index (ID)'}</span>
      </label>

      {activeTabId === 'switches' && (
        <>
          <div className="filter-divider switch-filters-only" aria-hidden="true" />

          <label className="save-editor-filter-check switch-filters-only">
            <input
              type="checkbox"
              className="switch-true-check"
              checked={filters.switchFilter === 'true'}
              onChange={(e) =>
                dispatch.setFilter({ switchFilter: e.target.checked ? 'true' : 'all' })
              }
            />
            <span>{strings.save_editor_true_only || 'ON only'}</span>
          </label>

          <label className="save-editor-filter-check switch-filters-only">
            <input
              type="checkbox"
              className="switch-false-check"
              checked={filters.switchFilter === 'false'}
              onChange={(e) =>
                dispatch.setFilter({ switchFilter: e.target.checked ? 'false' : 'all' })
              }
            />
            <span>{strings.save_editor_false_only || 'OFF only'}</span>
          </label>
        </>
      )}
    </div>
  );
};
