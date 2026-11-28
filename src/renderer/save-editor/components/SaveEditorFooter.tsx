import React, { useCallback, useEffect, useRef } from 'react';
import type { ElectronAPI } from '../../../shared/types/ipc';
import { sanitizeUserPaths } from '../../../shared/path-sanitizer';
import {
  useIsMutatingFile,
  useSaveDirtyState,
  useSaveEditorDispatch,
  useSaveEditorStore,
  useSaveElectronAPI,
  useSaveFileStatus,
  useSaveOperationStatus,
} from '../store/save-editor-store';
import { useLocaleStrings } from '../../i18n/locale-strings';

export interface SaveEditorFooterProps {
  electronAPI?: ElectronAPI;
  onClose?: () => void;
  saveActionRef?: React.RefObject<(() => boolean) | null>;
}

/**
 * Independent persistent footer for committing Save Editor updates without
 * focus eviction across pristine, saving, error, or file-mutation states.
 */
export function SaveEditorFooter({
  electronAPI,
  onClose,
  saveActionRef,
}: SaveEditorFooterProps): React.JSX.Element {
  const store = useSaveEditorStore();
  const saveStatus = useSaveOperationStatus();
  const { isDirty } = useSaveDirtyState();
  const fileStatus = useSaveFileStatus();
  const isMutatingFile = useIsMutatingFile();
  const dispatch = useSaveEditorDispatch();
  const contextElectronAPI = useSaveElectronAPI();
  const strings = useLocaleStrings(undefined, electronAPI ?? contextElectronAPI ?? null);
  const isSavingRef = useRef(false);

  const handleSave = useCallback(async () => {
    // Synchronous re-entrancy latch to block duplicate dispatches before React re-render
    if (isSavingRef.current) return;
    if (
      !isDirty ||
      saveStatus.state === 'saving' ||
      isMutatingFile ||
      fileStatus.state !== 'loaded'
    ) {
      return;
    }

    if (!store) return;
    const snapshot = store.getSnapshot();
    if (
      snapshot.fileStatus.state !== 'loaded' ||
      snapshot.isMutatingFile ||
      snapshot.dirtyKeys.size === 0 ||
      snapshot.saveStatus.state === 'saving'
    ) {
      return;
    }

    const targetGameKey = snapshot.gameKey || snapshot.fileStatus.dto.gameKey;
    const targetFileName = snapshot.fileStatus.dto.fileName;
    const inFlightUpdates = { ...snapshot.modifiedFields };

    isSavingRef.current = true;
    dispatch.setSaving();

    try {
      const api =
        electronAPI ??
        contextElectronAPI ??
        (typeof window !== 'undefined' ? window.electronAPI : undefined);
      if (!api?.writeSaveData) {
        throw new Error('writeSaveData API unavailable');
      }

      const allowLargeSaves =
        snapshot.fileStatus.state === 'loaded' && snapshot.fileStatus.allowLargeSaves === true;

      const result = await api.writeSaveData({
        gameKey: targetGameKey,
        fileName: targetFileName,
        updates: inFlightUpdates,
        ...(allowLargeSaves ? { options: { allowLargeSaves: true } } : {}),
      });

      if (!result || result.ok !== true) {
        const rawErrorMsg = result?.error || 'Save failed';
        const sanitizedErrorMsg = sanitizeUserPaths(rawErrorMsg);
        console.error('[SaveEditorFooter] Write save data rejected:', {
          gameKey: sanitizeUserPaths(targetGameKey),
          fileName: sanitizeUserPaths(targetFileName),
          error: sanitizedErrorMsg,
          ...(result?.code ? { code: sanitizeUserPaths(result.code) } : {}),
        });
        dispatch.setSaveError(sanitizedErrorMsg, targetFileName);
        return;
      }

      dispatch.setSaved(inFlightUpdates, targetFileName);
    } catch (err) {
      const rawErrorMsg =
        err instanceof Error
          ? err.message || 'Save failed'
          : String(err || 'Save failed');
      const sanitizedMsg = sanitizeUserPaths(rawErrorMsg);
      console.error('[SaveEditorFooter] Write save data exception:', {
        gameKey: sanitizeUserPaths(targetGameKey),
        fileName: sanitizeUserPaths(targetFileName),
        error: sanitizedMsg,
        stack:
          err instanceof Error && err.stack
            ? sanitizeUserPaths(err.stack)
            : undefined,
      });
      dispatch.setSaveError(sanitizedMsg, targetFileName);
    } finally {
      isSavingRef.current = false;
    }
  }, [
    store,
    isDirty,
    saveStatus.state,
    isMutatingFile,
    fileStatus.state,
    electronAPI,
    contextElectronAPI,
    dispatch,
  ]);

  const isSaving = saveStatus.state === 'saving';
  const isActionDisabled =
    !isDirty || isSaving || isMutatingFile || fileStatus.state !== 'loaded';

  useEffect(() => {
    if (!saveActionRef) return;
    saveActionRef.current = () => {
      if (isActionDisabled) return false;
      void handleSave();
      return true;
    };
    return () => {
      saveActionRef.current = null;
    };
  }, [saveActionRef, isActionDisabled, handleSave]);

  const handleCancel = () => {
    if (onClose) {
      onClose();
    } else if (typeof window !== 'undefined') {
      window.close();
    }
  };

  return (
    <div className="save-editor-footer">
      {saveStatus.state === 'error' && (
        <div
          className="save-editor-error-box save-editor-footer-error"
          role="alert"
        >
          <span className="save-editor-error-title">
            {strings.save_editor_save_error_title || 'Failed to save changes:'}
          </span>
          <span>{saveStatus.errorMessage}</span>
        </div>
      )}
      <div
        className="save-editor-footer-status"
        role="status"
        aria-live="polite"
      >
        {saveStatus.state === 'saved' && <span>{strings.save_editor_saved || 'Saved'}</span>}
      </div>
      <button
        type="button"
        className="secondary-btn cancel-btn"
        onClick={handleCancel}
      >
        {strings.save_editor_cancel || 'Cancel'}
      </button>
      <button
        type="button"
        className={
          isSaving ? 'primary-btn save-btn is-saving' : 'primary-btn save-btn'
        }
        aria-label={strings.save_editor_save || 'Save Changes'}
        aria-disabled={isActionDisabled}
        aria-busy={isSaving || undefined}
        style={isActionDisabled ? { pointerEvents: 'none' } : undefined}
        onClick={handleSave}
      >
        {isSaving ? (
          <>
            <svg
              className="save-editor-spinner"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle
                cx="12"
                cy="12"
                r="10"
                strokeDasharray="32"
                strokeDashoffset="12"
              />
            </svg>
            <span>{strings.save_editor_saving || 'Saving...'}</span>
          </>
        ) : (
          strings.save_editor_save || 'Save Changes'
        )}
      </button>
    </div>
  );
}
