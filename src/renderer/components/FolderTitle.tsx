import React, { useEffect, useRef, useState } from 'react';
import { sanitizeUserPaths } from '../../shared/path-sanitizer';
import { resolveLocalizedErrorCode, useLocaleStrings } from '../i18n/locale-strings';

export interface FolderRenameResult {
  readonly ok: boolean;
  readonly error?: string;
}

export interface FolderTitleProps {
  readonly folderPath: string;
  readonly displayName: string;
  readonly onRenameFolder: (folderPath: string, newAlias: string) => Promise<FolderRenameResult>;
  readonly onShowToast?: (message: string) => void;
}

type FolderTitleState =
  | { readonly status: 'idle' }
  | { readonly status: 'editing'; readonly draft: string; readonly hasError: boolean }
  | { readonly status: 'submitting'; readonly draft: string };

/**
 * Pure presentational inline folder title supporting click / F2 / Enter rename.
 */
export const FolderTitle: React.FC<FolderTitleProps> = ({
  folderPath,
  displayName,
  onRenameFolder,
  onShowToast,
}) => {
  const strings = useLocaleStrings();
  const [state, setState] = useState<FolderTitleState>({ status: 'idle' });

  const headingRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const isSubmittingRef = useRef(false);
  const isCancelingRef = useRef(false);
  const shouldFocusHeadingRef = useRef(false);
  const shouldFocusInputRef = useRef(false);

  const hasEditError = state.status === 'editing' ? state.hasError : false;

  useEffect(() => {
    if (state.status === 'idle') {
      isCancelingRef.current = false;
      if (shouldFocusHeadingRef.current) {
        shouldFocusHeadingRef.current = false;
        headingRef.current?.focus();
      }
    }
  }, [state.status]);

  useEffect(() => {
    if (state.status === 'editing' && shouldFocusInputRef.current) {
      shouldFocusInputRef.current = false;
      inputRef.current?.focus();
    }
  }, [state.status, hasEditError]);

  useEffect(() => {
    if (state.status === 'editing' && !hasEditError) {
      inputRef.current?.select();
    }
  }, [state.status, hasEditError]);

  const enterEditMode = () => {
    isSubmittingRef.current = false;
    isCancelingRef.current = false;
    shouldFocusInputRef.current = false;
    setState({ status: 'editing', draft: displayName, hasError: false });
  };

  const handleCommit = async (restoreFocusOnExit: boolean) => {
    if (isCancelingRef.current || isSubmittingRef.current || state.status !== 'editing') return;
    const trimmedValue = state.draft.trim();
    if (trimmedValue === displayName) {
      if (restoreFocusOnExit) {
        shouldFocusHeadingRef.current = true;
      }
      setState({ status: 'idle' });
      return;
    }

    isSubmittingRef.current = true;
    setState({ status: 'submitting', draft: state.draft });
    try {
      const res = await onRenameFolder(folderPath, trimmedValue);
      if (res?.ok) {
        if (restoreFocusOnExit) {
          shouldFocusHeadingRef.current = true;
        }
        setState({ status: 'idle' });
        return;
      }

      console.warn('[FolderTitle] Folder rename failed:', {
        folderPath: sanitizeUserPaths(folderPath),
        error: sanitizeUserPaths(res?.error ?? 'unknown'),
      });
      shouldFocusInputRef.current = true;
      setState({ status: 'editing', draft: state.draft, hasError: true });
      onShowToast?.(resolveLocalizedErrorCode(strings, res?.error, strings.toast_folder_rename_failed));
    } catch (err) {
      console.error('[FolderTitle] Folder rename rejected:', {
        folderPath: sanitizeUserPaths(folderPath),
        error: sanitizeUserPaths(err instanceof Error ? err.message : String(err)),
        stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
      });
      shouldFocusInputRef.current = true;
      setState({ status: 'editing', draft: state.draft, hasError: true });
      onShowToast?.(strings.toast_folder_rename_failed);
    } finally {
      isSubmittingRef.current = false;
    }
  };

  if (state.status === 'idle') {
    return (
      <div
        ref={headingRef}
        role="heading"
        aria-level={3}
        className="folder-section-title"
        tabIndex={0}
        aria-description={strings.rename_folder_hint}
        title={displayName}
        onClick={enterEditMode}
        onKeyDown={(e) => {
          if (e.key === 'F2' || e.key === 'Enter') {
            e.preventDefault();
            enterEditMode();
          }
        }}
      >
        {displayName}
      </div>
    );
  }

  const isSubmitting = state.status === 'submitting';

  return (
    <input
      ref={inputRef}
      type="text"
      className="rename-input"
      value={state.draft}
      autoFocus
      readOnly={isSubmitting}
      aria-busy={isSubmitting ? 'true' : undefined}
      aria-invalid={hasEditError ? 'true' : undefined}
      aria-label={strings.rename_folder_hint}
      onChange={(e) => {
        if (state.status === 'editing') {
          setState({ status: 'editing', draft: e.target.value, hasError: false });
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          void handleCommit(true);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          if (isSubmittingRef.current || state.status === 'submitting') return;
          isCancelingRef.current = true;
          shouldFocusHeadingRef.current = true;
          setState({ status: 'idle' });
        }
      }}
      onBlur={(e) => {
        void handleCommit(!e.relatedTarget);
      }}
    />
  );
};
