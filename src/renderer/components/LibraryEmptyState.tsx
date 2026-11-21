import React, { useRef, useState } from 'react';
import { sanitizeUserPaths } from '../../shared/path-sanitizer';
import type { ElectronAPI } from '../../shared/types/ipc';

export interface LibraryEmptyStateProps {
  electronAPI?: ElectronAPI;
  onRefreshLibrary?: () => Promise<void> | void;
  onSetupSuccess?: () => void;
}

export function LibraryEmptyState({
  electronAPI,
  onRefreshLibrary,
  onSetupSuccess,
}: LibraryEmptyStateProps): React.ReactElement {
  const [loadingMode, setLoadingMode] = useState<'default' | 'custom' | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const chooseFolderBtnRef = useRef<HTMLButtonElement | null>(null);

  const handleDismissError = () => {
    setSetupError(null);
    // Symmetrical focus retention: return focus to primary action CTA on error banner unmount
    chooseFolderBtnRef.current?.focus();
  };

  const handleSetup = async (mode: 'default' | 'custom') => {
    if (loadingMode !== null) return;
    setLoadingMode(mode);
    setSetupError(null);
    try {
      const api = electronAPI ?? (typeof window !== 'undefined' ? window.electronAPI : undefined);
      if (!api?.setupLibrary) {
        throw new Error('Library setup API is unavailable in current environment');
      }
      const success = await api.setupLibrary(mode);
      if (success) {
        onSetupSuccess?.();
        await onRefreshLibrary?.();
      } else {
        // User canceled folder selection or initialization did not complete
        setLoadingMode(null);
      }
    } catch (err) {
      const rawMsg =
        err instanceof Error
          ? err.message
          : 'Failed to initialize library folder. Please verify directory permissions.';
      const sanitizedMsg = sanitizeUserPaths(rawMsg);
      setSetupError(sanitizedMsg);
      console.error(`[LibraryEmptyState] Setup library (${mode}) failed:`, {
        mode,
        error: sanitizedMsg,
        stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
      });
    } finally {
      setLoadingMode(null);
    }
  };

  const isSettingUp = loadingMode !== null;

  return (
    <div className="library-empty-state" role="status" aria-live="polite">
      <h2 className="library-empty-title">Your library is empty</h2>
      <p className="library-empty-description">
        Add a game folder or initialize the default library location to get started.
      </p>

      {setupError && (
        <div className="library-empty-error" role="alert">
          <span>{setupError}</span>
          <button
            type="button"
            className="small-btn"
            onClick={handleDismissError}
            aria-label="Dismiss setup error"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="library-empty-actions">
        <button
          ref={chooseFolderBtnRef}
          type="button"
          className="primary-btn"
          aria-disabled={isSettingUp}
          style={isSettingUp ? { pointerEvents: 'none' } : undefined}
          onClick={() => handleSetup('custom')}
        >
          {loadingMode === 'custom' ? (
            <>
              <svg
                className="icon-svg loading-spin"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
              </svg>
              <span>Choosing Folder...</span>
            </>
          ) : (
            'Choose Folder'
          )}
        </button>
        <button
          type="button"
          className="secondary-btn"
          aria-disabled={isSettingUp}
          style={isSettingUp ? { pointerEvents: 'none' } : undefined}
          onClick={() => handleSetup('default')}
        >
          {loadingMode === 'default' ? (
            <>
              <svg
                className="icon-svg loading-spin"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
              </svg>
              <span>Creating Default Folder...</span>
            </>
          ) : (
            'Create Default /YumeShelf/ Folder'
          )}
        </button>
      </div>
    </div>
  );
}

export interface FilteredEmptyStateProps {
  onClearFilter: () => void;
  categoryName?: string;
}

export const FilteredEmptyState: React.FC<FilteredEmptyStateProps> = ({
  onClearFilter,
  categoryName,
}) => {
  return (
    <div className="filtered-empty-state" role="status" aria-live="polite">
      <p className="library-empty-title">
        {categoryName
          ? `No games found in "${categoryName}".`
          : 'No games match your current filter.'}
      </p>
      <p className="library-empty-description">
        Try adjusting your search query or clear the active category filter.
      </p>
      <div className="library-empty-actions">
        <button type="button" className="secondary-btn" onClick={onClearFilter}>
          Clear Filter
        </button>
      </div>
    </div>
  );
};
