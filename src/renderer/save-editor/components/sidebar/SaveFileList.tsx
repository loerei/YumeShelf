import React, { useRef, useState, useEffect, useLayoutEffect } from 'react';
import type { ElectronAPI } from '../../../../shared/types/ipc';
import { sanitizeUserPaths } from '../../../../shared/path-sanitizer';
import { Modal } from '../../../components/modals/Modal';
import { isCancellationError } from '../../../utils/errors';
import {
  useSaveDirtyKeys,
  useSaveEditorDispatch,
  useSaveElectronAPI,
  useSaveFileStatus,
  useSaveGameKey,
  useSaveOperationStatus,
} from '../../store/save-editor-store';
import { SaveFileActions } from './SaveFileActions';

export interface SaveFileListProps {
  gameKey?: string;
  files?: string[];
  activeFileName?: string | null;
  onSelectFile?: (fileName: string) => void;
  loadingFileName?: string | null;
  isSaving?: boolean;
  electronAPI?: ElectronAPI;
  renderItemActions?: (fileName: string) => React.ReactNode;
  onDeleteFile?: (fileName: string) => Promise<void>;
  onRenameFile?: (fileName: string, nextName: string) => Promise<void>;
  folderRevision?: number;
  initialFile?: string;
  retryRequest?: { readonly fileName: string; readonly requestId: number } | null;
  listFocusRef?: React.RefObject<HTMLDivElement | null>;
}

export interface SaveFileListViewProps {
  files?: string[];
  activeFileName?: string | null;
  loadingFileName?: string | null;
  isSaving?: boolean;
  openPopoverFileName?: string | null;
  onOpenPopoverFileNameChange?: (fileName: string | null) => void;
  onSelectFile?: (fileName: string) => void;
  renderItemActions?: (fileName: string) => React.ReactNode;
  onDeleteFile?: (fileName: string) => Promise<void>;
  onRenameFile?: (fileName: string, nextName: string) => Promise<void>;
  listFocusRef?: React.RefObject<HTMLDivElement | null>;
}

const INTERACTIVE_DESCENDANT_SELECTOR =
  'button, a, input, select, textarea, [role="button"], [data-interactive="true"]';
const EMPTY_LIST_SENTINEL = Symbol('EMPTY_LIST');

export function SaveFileListView({
  files = [],
  activeFileName = null,
  loadingFileName = null,
  isSaving = false,
  openPopoverFileName,
  onOpenPopoverFileNameChange,
  onSelectFile,
  renderItemActions,
  onDeleteFile,
  onRenameFile,
  listFocusRef,
}: SaveFileListViewProps) {
  const [renamingFileName, setRenamingFileName] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [deletingFileName, setDeletingFileName] = useState<string | null>(null);
  const [internalOpenPopoverFileName, setInternalOpenPopoverFileName] = useState<string | null>(
    null
  );

  const resolvedOpenPopoverFileName =
    openPopoverFileName !== undefined ? openPopoverFileName : internalOpenPopoverFileName;
  const handleOpenPopoverFileNameChange = (target: string | null) => {
    if (openPopoverFileName !== undefined && onOpenPopoverFileNameChange !== undefined) {
      onOpenPopoverFileNameChange(target);
    } else {
      setInternalOpenPopoverFileName(target);
      onOpenPopoverFileNameChange?.(target);
    }
  };

  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const listContainerRef = useRef<HTMLDivElement | null>(null);
  const emptyContainerRef = useRef<HTMLDivElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  type PendingRenameFocus =
    | { type: 'input'; fileName: string }
    | {
        type: 'item';
        primaryFileName: string;
        fallbackFileName: string;
        fallbackFocused: boolean;
      };

  const pendingFocusTargetRef = useRef<string | typeof EMPTY_LIST_SENTINEL | null>(null);
  const pendingRenameFocusRef = useRef<PendingRenameFocus | null>(null);
  const restoreFocusOnCommitRef = useRef(true);
  const isDeletingRef = useRef(false);
  const isCommittingRef = useRef(false);
  const isCancellingRef = useRef(false);
  const isCommittedRef = useRef(false);

  useLayoutEffect(() => {
    if (renamingFileName !== null) {
      const pending = pendingRenameFocusRef.current;
      if (
        pending?.type === 'input' &&
        renamingFileName === pending.fileName &&
        renameInputRef.current
      ) {
        renameInputRef.current.focus();
        const lastDotIndex = pending.fileName.lastIndexOf('.');
        if (lastDotIndex > 0) {
          renameInputRef.current.setSelectionRange(0, lastDotIndex);
        } else {
          renameInputRef.current.select();
        }
        pendingRenameFocusRef.current = null;
      }
      return;
    }

    // Always reset cancellation guard when exiting rename mode, even if restoreFocus was false
    isCancellingRef.current = false;
    const pending = pendingRenameFocusRef.current;
    if (pending?.type === 'item') {
      const primaryEl = itemRefs.current.get(pending.primaryFileName);
      const fallbackEl = itemRefs.current.get(pending.fallbackFileName);
      if (primaryEl) {
        const activeEl = document.activeElement;
        const canTransferFromFallback =
          !pending.fallbackFocused ||
          !activeEl ||
          activeEl === document.body ||
          !activeEl.isConnected ||
          activeEl === fallbackEl;
        if (canTransferFromFallback) {
          primaryEl.focus();
        }
        pendingRenameFocusRef.current = null;
      } else if (!pending.fallbackFocused) {
        fallbackEl?.focus();
        if (
          pending.primaryFileName !== pending.fallbackFileName &&
          files.includes(pending.fallbackFileName)
        ) {
          pending.fallbackFocused = true;
        } else {
          pendingRenameFocusRef.current = null;
        }
      } else if (!files.includes(pending.fallbackFileName)) {
        pendingRenameFocusRef.current = null;
      }
    }
  }, [renamingFileName, files]);

  const startRename = (fileName: string) => {
    if (
      isCommittingRef.current ||
      renamingFileName !== null ||
      isDeletingRef.current ||
      deletingFileName !== null
    ) {
      return;
    }
    isCancellingRef.current = false;
    isCommittedRef.current = false;
    pendingRenameFocusRef.current = { type: 'input', fileName };
    setRenamingFileName(fileName);
    setDraftName(fileName);
    setRenameError(null);
  };

  const cancelRename = (
    fileName: string,
    options: { restoreFocus?: boolean } = { restoreFocus: true }
  ) => {
    if (isCancellingRef.current || isCommittingRef.current) return;
    const { restoreFocus = true } = options;
    isCancellingRef.current = true;
    pendingRenameFocusRef.current = restoreFocus
      ? {
          type: 'item',
          primaryFileName: fileName,
          fallbackFileName: fileName,
          fallbackFocused: false,
        }
      : null;
    setRenamingFileName(null);
    setRenameError(null);
  };

  const commitRename = async (
    fileName: string,
    options: { restoreFocus?: boolean } = { restoreFocus: true }
  ) => {
    if (isCommittingRef.current || isCancellingRef.current || isCommittedRef.current) return;
    const { restoreFocus = true } = options;
    const normalizedDraft = draftName.trim().normalize('NFC');
    const normalizedFile = fileName.normalize('NFC');

    if (!normalizedDraft) {
      setRenameError('File name cannot be empty');
      renameInputRef.current?.focus();
      return;
    }
    if (/[\\/:*?"<>|]/.test(normalizedDraft)) {
      setRenameError('Name contains invalid characters');
      renameInputRef.current?.focus();
      return;
    }
    if (normalizedDraft === normalizedFile) {
      cancelRename(fileName, { restoreFocus });
      return;
    }

    isCommittingRef.current = true;
    restoreFocusOnCommitRef.current = restoreFocus;
    try {
      await onRenameFile?.(fileName, normalizedDraft);
      isCommittedRef.current = true;
      pendingRenameFocusRef.current = restoreFocusOnCommitRef.current
        ? {
            type: 'item',
            primaryFileName: normalizedDraft,
            fallbackFileName: fileName,
            fallbackFocused: false,
          }
        : null;
      setRenamingFileName((prev) => (prev === fileName ? null : prev));
      setRenameError(null);
    } catch (err: any) {
      setRenameError(sanitizeUserPaths(err?.message || 'Failed to rename save file'));
      renameInputRef.current?.focus();
    } finally {
      isCommittingRef.current = false;
    }
  };

  const handleDelete = async (fileName: string) => {
    if (isDeletingRef.current || deletingFileName !== null) return;
    isDeletingRef.current = true;

    const idx = files.indexOf(fileName);
    if (idx === -1) {
      isDeletingRef.current = false;
      return;
    }
    const nextTargetName = files[idx + 1] ?? files[idx - 1] ?? EMPTY_LIST_SENTINEL;

    pendingFocusTargetRef.current = nextTargetName;
    pendingRenameFocusRef.current = null;
    setDeletingFileName(fileName);

    try {
      await onDeleteFile?.(fileName);
    } catch (error) {
      const rawMsg = error instanceof Error ? error.message : String(error);
      console.error('[SaveFileListView] Failed to delete save file:', {
        fileName: sanitizeUserPaths(fileName),
        error: sanitizeUserPaths(rawMsg),
        stack: error instanceof Error && error.stack ? sanitizeUserPaths(error.stack) : undefined,
      });
      pendingFocusTargetRef.current = null;
      throw error;
    } finally {
      isDeletingRef.current = false;
      setDeletingFileName(null);
    }
  };

  const handleSelectSlot = (fileName: string) => {
    if (
      isDeletingRef.current ||
      deletingFileName !== null ||
      isSaving ||
      isCommittingRef.current ||
      Boolean(renamingFileName) ||
      fileName === loadingFileName
    ) {
      return;
    }
    onSelectFile?.(fileName);
  };

  const handleButtonKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, fileName: string) => {
    if (e.defaultPrevented) return;

    const currentIndex = files.indexOf(fileName);
    if (currentIndex === -1) return;

    let targetFile: string | undefined;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      targetFile = files[Math.min(currentIndex + 1, files.length - 1)];
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      targetFile = files[Math.max(currentIndex - 1, 0)];
    } else if (e.key === 'Home') {
      e.preventDefault();
      targetFile = files[0];
    } else if (e.key === 'End') {
      e.preventDefault();
      targetFile = files[files.length - 1];
    }

    if (targetFile) {
      itemRefs.current.get(targetFile)?.focus();
    }
  };

  const handleRowClick = (e: React.MouseEvent<HTMLDivElement>, fileName: string) => {
    if (e.defaultPrevented) return;
    // Prevent row selection if click occurred inside buttons, inputs, actions, or popovers
    if ((e.target as HTMLElement).closest(INTERACTIVE_DESCENDANT_SELECTOR)) return;
    itemRefs.current.get(fileName)?.focus();
    handleSelectSlot(fileName);
  };

  // Deterministic post-render focus retention targeting focusable button elements
  useEffect(() => {
    if (!pendingFocusTargetRef.current) return;

    if (pendingFocusTargetRef.current === EMPTY_LIST_SENTINEL) {
      emptyContainerRef.current?.focus();
    } else {
      const targetBtn = itemRefs.current.get(pendingFocusTargetRef.current);
      if (targetBtn) {
        targetBtn.focus();
      } else if (files.length > 0 && files[0] && itemRefs.current.get(files[0])) {
        itemRefs.current.get(files[0])?.focus();
      } else {
        listContainerRef.current?.focus();
      }
    }
    pendingFocusTargetRef.current = null;
  }, [files]);

  if (files.length === 0) {
    return (
      <div
        ref={(el) => {
          emptyContainerRef.current = el;
          if (listFocusRef) {
            (listFocusRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
          }
        }}
        className="save-file-list-empty"
        role="status"
        aria-live="polite"
        tabIndex={-1}
        style={{ outline: 'none' }}
      >
        <span>No save files found in directory</span>
      </div>
    );
  }

  return (
    <div
      ref={(el) => {
        listContainerRef.current = el;
        if (listFocusRef) {
          (listFocusRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
        }
      }}
      className="save-file-list"
      role="list"
      aria-label="Save file slots"
      data-testid="save-file-list"
      tabIndex={-1}
    >
      {files.map((fileName) => {
        const isActive = fileName === activeFileName;
        const isLoading = fileName === loadingFileName;
        const isRenaming = fileName === renamingFileName;

        return (
          <div
            key={fileName}
            role="listitem"
            className={`save-file-item ${isActive ? 'active' : ''} ${isLoading ? 'loading' : ''} ${resolvedOpenPopoverFileName === fileName ? 'has-open-popover' : ''}`.trim()}
            onClick={(e) => handleRowClick(e, fileName)}
          >
            {isRenaming ? (
              <div className="save-file-rename-container" data-interactive="true">
                <input
                  ref={renameInputRef}
                  className="save-file-rename-input"
                  value={draftName}
                  onChange={(e) => {
                    setDraftName(e.target.value);
                    if (renameError) setRenameError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void commitRename(fileName, { restoreFocus: true });
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      cancelRename(fileName, { restoreFocus: true });
                    }
                  }}
                  onBlur={(e) => {
                    if (isCommittingRef.current) {
                      if (e.relatedTarget) {
                        restoreFocusOnCommitRef.current = false;
                      }
                      return;
                    }
                    if (isCancellingRef.current || isCommittedRef.current) {
                      if (e.relatedTarget) {
                        pendingRenameFocusRef.current = null;
                      }
                      return;
                    }
                    void commitRename(fileName, { restoreFocus: !e.relatedTarget });
                  }}
                />
                {renameError && (
                  <div className="save-editor-rename-tooltip" role="alert">
                    {renameError}
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                ref={(el) => {
                  if (el) itemRefs.current.set(fileName, el);
                  else itemRefs.current.delete(fileName);
                }}
                className="save-file-item-main-btn"
                onClick={() => handleSelectSlot(fileName)}
                onKeyDown={(e) => handleButtonKeyDown(e, fileName)}
                aria-current={isActive ? 'true' : undefined}
                aria-busy={isLoading ? 'true' : undefined}
                aria-disabled={
                  Boolean(deletingFileName) ||
                  Boolean(renamingFileName) ||
                  fileName === loadingFileName ||
                  isSaving
                    ? 'true'
                    : undefined
                }
              >
                <span className="save-file-name">{fileName}</span>
              </button>
            )}

            {renderItemActions ? (
              <div className="save-file-actions" data-interactive="true">
                {renderItemActions(fileName)}
              </div>
            ) : (
              <SaveFileActions
                fileName={fileName}
                onStartRename={() => startRename(fileName)}
                onDelete={() => handleDelete(fileName)}
                disabled={
                  Boolean(renamingFileName) || isLoading || Boolean(deletingFileName) || isSaving
                }
                isConfirmOpen={resolvedOpenPopoverFileName === fileName}
                onConfirmOpenChange={(open) => {
                  if (open) {
                    handleOpenPopoverFileNameChange(fileName);
                  } else if (resolvedOpenPopoverFileName === fileName) {
                    handleOpenPopoverFileNameChange(null);
                  }
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function SaveFileList(props: SaveFileListProps) {
  const contextGameKey = useSaveGameKey();
  const gameKey = props.gameKey ?? contextGameKey;
  const fileStatus = useSaveFileStatus();
  const saveStatus = useSaveOperationStatus();
  const dirtyKeys = useSaveDirtyKeys();
  const dispatch = useSaveEditorDispatch();
  const contextApi = useSaveElectronAPI();
  const electronAPI =
    props.electronAPI ?? contextApi ?? (typeof window !== 'undefined' ? window.electronAPI : undefined);

  const [fetchedFiles, setFetchedFiles] = useState<string[]>([]);
  const [prevGameKey, setPrevGameKey] = useState<string>(gameKey);
  if (gameKey !== prevGameKey) {
    setPrevGameKey(gameKey);
    setFetchedFiles([]);
  }

  const [openPopoverFileName, setOpenPopoverFileName] = useState<string | null>(null);
  const [pendingSwitchSlot, setPendingSwitchSlot] = useState<string | null>(null);
  const listFallbackRef = useRef<HTMLDivElement | null>(null);

  const activeUnsubscribeRef = useRef<(() => void) | null>(null);
  const activeLoadingSlotRef = useRef<string | null>(null);
  const currentLoadTokenRef = useRef(0);

  const files = props.files ?? fetchedFiles;
  const activeFileName =
    props.activeFileName !== undefined
      ? props.activeFileName
      : fileStatus.state === 'loaded'
        ? fileStatus.dto.fileName
        : null;
  const loadingFileName =
    props.loadingFileName !== undefined
      ? props.loadingFileName
      : fileStatus.state === 'loading'
        ? fileStatus.fileName
        : null;
  const isSaving = props.isSaving !== undefined ? props.isSaving : saveStatus.state === 'saving';

  const abortInFlightLoad = () => {
    if (activeLoadingSlotRef.current) {
      activeUnsubscribeRef.current?.();
      activeUnsubscribeRef.current = null;
      const cancelledSlot = activeLoadingSlotRef.current;
      electronAPI?.cancelLoadSaveData?.({ gameKey, fileName: cancelledSlot })?.catch?.((err) => {
        console.warn('[SaveFileList] Failed to cancel in-flight save data load:', {
          gameKey: sanitizeUserPaths(gameKey),
          fileName: sanitizeUserPaths(cancelledSlot),
          error: sanitizeUserPaths(err instanceof Error ? err.message : String(err)),
        });
      });
      activeLoadingSlotRef.current = null;
    }
  };

  const invalidatePendingLoads = () => {
    currentLoadTokenRef.current += 1;
    abortInFlightLoad();
  };

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    setFetchedFiles([]);
    setOpenPopoverFileName(null);

    if (!gameKey || typeof electronAPI?.listSaveFiles !== 'function') {
      return () => {
        controller.abort();
      };
    }

    electronAPI
      .listSaveFiles(gameKey)
      .then((list) => {
        if (signal.aborted) {
          setFetchedFiles([]);
          return;
        }
        setFetchedFiles(Array.isArray(list) ? list : []);
      })
      .catch((err) => {
        if (signal.aborted || isCancellationError(err)) {
          setFetchedFiles([]);
          return;
        }
        const rawMsg = err instanceof Error ? err.message : String(err);
        console.error('[SaveFileList] Failed to list save files:', {
          gameKey: sanitizeUserPaths(gameKey),
          error: sanitizeUserPaths(rawMsg),
        });
        setFetchedFiles([]);
      });

    return () => {
      controller.abort();
      setFetchedFiles([]);
    };
  }, [gameKey, electronAPI, props.folderRevision]);

  // Symmetrical unmount teardown
  useEffect(() => {
    return () => {
      invalidatePendingLoads();
    };
  }, [gameKey, electronAPI]);

  // Invalidate pending loads and cancel in-flight requests on folder revision change
  useEffect(() => {
    invalidatePendingLoads();
  }, [props.folderRevision]);

  const handleSelectSlot = async (fileName: string, options?: { forceDiscard?: boolean }) => {
    if (fileName === activeLoadingSlotRef.current) return;

    // Intercept slot switch if active session has uncommitted modifications
    if (dirtyKeys.size > 0 && !options?.forceDiscard) {
      setPendingSwitchSlot(fileName);
      return;
    }

    // 1. Synchronously abort in-flight load of previous slot
    abortInFlightLoad();

    props.onSelectFile?.(fileName);

    if (typeof electronAPI?.loadSaveData !== 'function') {
      return;
    }

    const loadToken = ++currentLoadTokenRef.current;
    activeLoadingSlotRef.current = fileName;
    dispatch.setFileLoading(fileName);

    if (typeof electronAPI?.onSaveLoadProgress === 'function') {
      activeUnsubscribeRef.current = electronAPI.onSaveLoadProgress((prog) => {
        if (
          loadToken === currentLoadTokenRef.current &&
          prog?.gameKey === gameKey &&
          prog?.fileName === fileName
        ) {
          const safePercent =
            typeof prog?.percent === 'number' && Number.isFinite(prog.percent)
              ? Math.max(0, Math.min(100, Math.round(prog.percent)))
              : undefined;
          dispatch.setFileProgress(fileName, safePercent);
        }
      });
    }

    try {
      const { forceDiscard: _forceDiscard, ...loadOptions } = options ?? {};
      const res = await electronAPI.loadSaveData({ gameKey, fileName, ...loadOptions });
      if (loadToken !== currentLoadTokenRef.current) return;
      dispatch.setFileLoaded(res);
    } catch (err: any) {
      if (loadToken !== currentLoadTokenRef.current) return;
      if (isCancellationError(err)) {
        dispatch.setFileIdle();
      } else {
        const rawMsg = err instanceof Error ? err.message : String(err);
        const sanitizedMsg = sanitizeUserPaths(rawMsg);
        console.error('[SaveFileList] Failed to load save file:', {
          gameKey: sanitizeUserPaths(gameKey),
          fileName: sanitizeUserPaths(fileName),
          error: sanitizedMsg,
          stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
        });
        dispatch.setFileError(fileName, sanitizedMsg);
      }
    } finally {
      if (loadToken === currentLoadTokenRef.current) {
        activeUnsubscribeRef.current?.();
        activeUnsubscribeRef.current = null;
        activeLoadingSlotRef.current = null;
      }
    }
  };

  useEffect(() => {
    if (props.retryRequest && props.retryRequest.requestId > 0) {
      void handleSelectSlot(props.retryRequest.fileName);
    }
  }, [props.retryRequest?.requestId]);

  const initialFileAppliedRef = useRef(false);
  useEffect(() => {
    if (
      !initialFileAppliedRef.current &&
      props.initialFile &&
      fileStatus.state === 'idle' &&
      files.includes(props.initialFile)
    ) {
      initialFileAppliedRef.current = true;
      void handleSelectSlot(props.initialFile);
    }
  }, [props.initialFile, fileStatus.state, files]);

  const handleCancelDiscardSwitch = () => {
    setPendingSwitchSlot(null);
  };

  const handleConfirmDiscardSwitch = () => {
    const targetFileName = pendingSwitchSlot;
    setPendingSwitchSlot(null);
    if (targetFileName) {
      void handleSelectSlot(targetFileName, { forceDiscard: true });
    }
  };

  const handleRenameFile = async (oldFileName: string, newFileName: string) => {
    if (props.onRenameFile) {
      await props.onRenameFile(oldFileName, newFileName);
      return;
    }
    const normOld = oldFileName.normalize('NFC');
    const normNew = newFileName.trim().normalize('NFC');
    dispatch.setMutatingFile(true);
    try {
      let resolvedNewName = normNew;
      if (typeof electronAPI?.renameSaveFile === 'function') {
        const res = await electronAPI.renameSaveFile({
          gameKey,
          oldFileName: normOld,
          newFileName: normNew,
        });
        if (res && res.ok === false) {
          throw new Error(res.message || res.error || 'Failed to rename save file');
        }
        if (typeof res?.fileName === 'string' && res.fileName.trim()) {
          resolvedNewName = res.fileName.trim().normalize('NFC');
        }
      }
      setFetchedFiles((prev) =>
        prev.map((f) => (f.normalize('NFC') === normOld ? resolvedNewName : f))
      );
      if (activeFileName !== null && activeFileName.normalize('NFC') === normOld) {
        dispatch.renameActiveFile(resolvedNewName, normOld);
      }
    } finally {
      dispatch.setMutatingFile(false);
    }
  };

  const handleDeleteFile = async (fileName: string) => {
    if (props.onDeleteFile) {
      await props.onDeleteFile(fileName);
      return;
    }
    const normTarget = fileName.normalize('NFC');
    dispatch.setMutatingFile(true);
    try {
      if (typeof electronAPI?.deleteSaveFile === 'function') {
        const res = await electronAPI.deleteSaveFile({
          gameKey,
          fileName,
        });
        if (res && res.ok === false) {
          throw new Error((res as { error?: string }).error || 'Failed to delete save file');
        }
      }
      if (
        activeLoadingSlotRef.current &&
        activeLoadingSlotRef.current.normalize('NFC') === normTarget
      ) {
        invalidatePendingLoads();
        dispatch.setFileIdle();
      } else if (
        (activeFileName !== null && activeFileName.normalize('NFC') === normTarget) ||
        (fileStatus.state === 'error' && fileStatus.fileName.normalize('NFC') === normTarget)
      ) {
        dispatch.setFileIdle();
      }
      setFetchedFiles((prev) => prev.filter((f) => f.normalize('NFC') !== normTarget));
    } finally {
      dispatch.setMutatingFile(false);
    }
  };

  return (
    <div ref={listFallbackRef} tabIndex={-1} className="save-file-list-wrapper">
      <SaveFileListView
        files={files}
        activeFileName={activeFileName}
        loadingFileName={loadingFileName}
        isSaving={isSaving}
        openPopoverFileName={openPopoverFileName}
        onOpenPopoverFileNameChange={setOpenPopoverFileName}
        onSelectFile={(fileName) => {
          void handleSelectSlot(fileName);
        }}
        renderItemActions={props.renderItemActions}
        onDeleteFile={handleDeleteFile}
        onRenameFile={handleRenameFile}
        listFocusRef={props.listFocusRef}
      />
      <Modal
        isOpen={pendingSwitchSlot !== null}
        onClose={handleCancelDiscardSwitch}
        title="Unsaved Changes"
        fallbackFocusRef={listFallbackRef}
      >
        <Modal.Header>Unsaved Changes</Modal.Header>
        <Modal.Body>
          <p>You have unsaved changes. Discard them and load {pendingSwitchSlot}?</p>
        </Modal.Body>
        <Modal.Footer>
          <button type="button" className="secondary-btn" onClick={handleCancelDiscardSwitch}>
            Cancel
          </button>
          <button type="button" className="danger-btn" onClick={handleConfirmDiscardSwitch}>
            Discard Changes
          </button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
