import React, { useContext, useRef, useState } from 'react';
import { useLocaleStrings } from '../../../i18n/locale-strings';
import { SaveEditorElectronApiContext } from '../../store/save-editor-store';

export interface SaveFolderBarProps {
  saveDir: string | null;
  isOverride?: boolean;
  isMissing?: boolean;
  disabled?: boolean;
  isLoading?: boolean;
  folderError?: string | null;
  onRetryFolder?: () => void;
  onSelectDirectory: () => Promise<void>;
  onResetDirectory: () => Promise<void>;
}

export function SaveFolderBar({
  saveDir,
  isOverride,
  isMissing,
  disabled = false,
  isLoading = false,
  folderError = null,
  onRetryFolder,
  onSelectDirectory,
  onResetDirectory,
}: SaveFolderBarProps) {
  const [isActionPending, setIsActionPending] = useState(false);
  const contextApi = useContext(SaveEditorElectronApiContext) ?? null;
  const strings = useLocaleStrings(undefined, contextApi);
  const changeBtnRef = useRef<HTMLButtonElement | null>(null);
  const retryBtnRef = useRef<HTMLButtonElement | null>(null);
  const displayPath = isLoading ? 'Resolving save folder...' : (saveDir || 'Default Save Directory');
  const isControlsDisabled = disabled || isActionPending || isLoading;

  const handleRetry = () => {
    if (isControlsDisabled || !onRetryFolder) return;
    if (typeof document !== 'undefined' && document.activeElement === retryBtnRef.current) {
      changeBtnRef.current?.focus();
    }
    onRetryFolder();
  };

  const handleSelect = async () => {
    if (isControlsDisabled) return;
    setIsActionPending(true);
    try {
      await onSelectDirectory();
    } finally {
      setIsActionPending(false);
    }
  };

  const handleReset = async () => {
    if (isControlsDisabled) return;
    setIsActionPending(true);
    try {
      await onResetDirectory();
      // Symmetrical focus retention: transfer focus to surviving trigger before Reset unmounts
      changeBtnRef.current?.focus();
    } finally {
      setIsActionPending(false);
    }
  };

  return (
    <div className={`save-folder-bar ${isMissing ? 'has-missing-folder' : ''}`.trim()}>
      <div className="save-folder-header">
        <span className="save-folder-label">Save Folder</span>
        {isOverride && <span className="save-folder-badge">Override</span>}
      </div>
      <div className="save-folder-path" title={displayPath} style={{ minWidth: 0 }}>
        {displayPath}
      </div>
      {folderError && !isLoading ? (
        <div className="save-folder-missing-alert" role="alert">
          <span>{folderError}</span>
          {onRetryFolder && (
            <button
              ref={retryBtnRef}
              type="button"
              className="small-btn secondary-btn"
              onClick={handleRetry}
              aria-disabled={isControlsDisabled}
              style={isControlsDisabled ? { pointerEvents: 'none', opacity: 0.5 } : undefined}
            >
              {strings.save_editor_retry || 'Retry'}
            </button>
          )}
        </div>
      ) : (
        isMissing && !isLoading && (
          <div className="save-folder-missing-alert" role="alert">
            {strings.save_editor_override_missing || 'Configured save folder not found'}
          </div>
        )
      )}
      <div className="save-folder-actions">
        <button
          ref={changeBtnRef}
          type="button"
          className="small-btn secondary-btn"
          onClick={handleSelect}
          aria-disabled={isControlsDisabled}
          style={isControlsDisabled ? { pointerEvents: 'none', opacity: 0.5 } : undefined}
          title="Choose save directory"
          aria-label="Choose save directory"
        >
          {isActionPending ? 'Choosing...' : 'Change...'}
        </button>
        {isOverride && (
          <button
            type="button"
            className="small-btn secondary-btn"
            onClick={handleReset}
            aria-disabled={isControlsDisabled}
            style={isControlsDisabled ? { pointerEvents: 'none', opacity: 0.5 } : undefined}
            title="Reset to default save directory"
            aria-label="Reset to default save directory"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
