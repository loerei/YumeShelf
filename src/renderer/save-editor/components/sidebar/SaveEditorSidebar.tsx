import React, { useEffect, useRef, useState } from 'react';
import type { ElectronAPI } from '../../../../shared/types/ipc';
import { sanitizeUserPaths } from '../../../../shared/path-sanitizer';
import { Modal } from '../../../components/modals/Modal';
import { useLocaleStrings } from '../../../i18n/locale-strings';
import {
  useIsMutatingFile,
  useSaveDirtyKeys,
  useSaveEditorDispatch,
  useSaveElectronAPI,
  useSaveGameKey,
  useSaveOperationStatus,
} from '../../store/save-editor-store';
import { SaveFolderBar } from './SaveFolderBar';
import { SaveFileList } from './SaveFileList';

export interface SaveEditorSidebarProps {
  gameKey?: string;
  electronAPI?: ElectronAPI;
  initialFile?: string;
  retryRequest?: { readonly fileName: string; readonly requestId: number } | null;
  listFocusRef?: React.RefObject<HTMLDivElement | null>;
}

interface ResolvedFolderState {
  path: string | null;
  isOverride: boolean;
  isMissing: boolean;
}

export function SaveEditorSidebar(props: SaveEditorSidebarProps) {
  const contextGameKey = useSaveGameKey();
  const gameKey = props.gameKey ?? contextGameKey;
  const contextApi = useSaveElectronAPI();
  const electronAPI =
    props.electronAPI ?? contextApi ?? (typeof window !== 'undefined' ? window.electronAPI : undefined);
  const strings = useLocaleStrings(undefined, props.electronAPI ?? contextApi ?? null);

  const saveStatus = useSaveOperationStatus();
  const isMutatingFile = useIsMutatingFile();
  const dirtyKeys = useSaveDirtyKeys();
  const dispatch = useSaveEditorDispatch();

  const [folderRevision, setFolderRevision] = useState(0);
  const [folderRetryCount, setFolderRetryCount] = useState(0);
  const folderReqSeqRef = useRef(0);

  const [folderInfo, setFolderInfo] = useState<ResolvedFolderState>({
    path: null,
    isOverride: false,
    isMissing: false,
  });
  const [isFolderLoading, setIsFolderLoading] = useState(false);
  const [folderError, setFolderError] = useState<string | null>(null);
  const [pendingFolderAction, setPendingFolderAction] = useState<'select' | 'reset' | null>(null);
  const sidebarFallbackRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!gameKey || typeof electronAPI?.getSaveFolder !== 'function') {
      setIsFolderLoading(false);
      return;
    }

    const reqId = ++folderReqSeqRef.current;
    setIsFolderLoading(true);
    setFolderError(null);

    electronAPI
      .getSaveFolder(gameKey)
      .then((info) => {
        if (reqId !== folderReqSeqRef.current) return;
        const resolvedPath =
          typeof info?.path === 'string'
            ? info.path
            : typeof (info as { folderPath?: string | null })?.folderPath === 'string'
              ? (info as { folderPath?: string | null }).folderPath!
              : null;
        const isOverride = Boolean(
          (info as { isOverride?: boolean })?.isOverride ??
            (info?.source === 'override' || info?.engine === 'user-override')
        );
        const isMissing = Boolean(
          (info as { isMissing?: boolean })?.isMissing ?? info?.overrideMissing ?? false
        );
        setFolderInfo({
          path: resolvedPath,
          isOverride,
          isMissing,
        });
        setIsFolderLoading(false);
      })
      .catch((err: unknown) => {
        if (reqId !== folderReqSeqRef.current) return;
        const rawMsg = err instanceof Error ? err.message : String(err);
        setFolderError(sanitizeUserPaths(rawMsg || 'Failed to resolve save folder'));
        setIsFolderLoading(false);
      });

    return () => {
      folderReqSeqRef.current += 1;
    };
  }, [gameKey, electronAPI, folderRetryCount]);

  const executeSelectDirectory = async () => {
    if (typeof electronAPI?.selectSaveFolder !== 'function') return;
    try {
      const result = await electronAPI.selectSaveFolder();
      if (!result) return;
      if (typeof result === 'object' && result.canceled) return;
      const pickedPath =
        typeof result === 'string'
          ? result
          : (result.folderPath ?? (result as { path?: string | null }).path ?? null);
      if (!pickedPath) return;

      if (typeof electronAPI.setSaveFolderOverride === 'function') {
        const res = await electronAPI.setSaveFolderOverride({
          gameKey,
          folderPath: pickedPath,
        });
        if (res && res.ok === false) {
          setFolderError(sanitizeUserPaths(res.error || 'Failed to set save folder override'));
          return;
        }
      }

      setFolderInfo({
        path: pickedPath,
        isOverride: true,
        isMissing: false,
      });
      setFolderError(null);
      dispatch.setFileIdle();
      setFolderRevision((rev) => rev + 1);
    } catch (err: unknown) {
      const rawMsg = err instanceof Error ? err.message : String(err);
      setFolderError(sanitizeUserPaths(rawMsg || 'Failed to select save folder'));
    }
  };

  const executeResetDirectory = async () => {
    if (typeof electronAPI?.setSaveFolderOverride !== 'function') return;
    try {
      const res = await electronAPI.setSaveFolderOverride({
        gameKey,
        folderPath: null,
      });
      if (res && res.ok === false) {
        setFolderError(sanitizeUserPaths(res.error || 'Failed to reset save folder override'));
        return;
      }

      const fallbackPath =
        res?.saveFolderOverride ?? (res as { path?: string | null })?.path ?? null;
      setFolderInfo({
        path: fallbackPath,
        isOverride: false,
        isMissing: false,
      });
      setFolderError(null);
      dispatch.setFileIdle();
      setFolderRevision((rev) => rev + 1);
    } catch (err: unknown) {
      const rawMsg = err instanceof Error ? err.message : String(err);
      setFolderError(sanitizeUserPaths(rawMsg || 'Failed to reset save folder'));
    }
  };

  const handleSelectDirectory = async () => {
    if (dirtyKeys.size > 0) {
      setPendingFolderAction('select');
      return;
    }
    await executeSelectDirectory();
  };

  const handleResetDirectory = async () => {
    if (dirtyKeys.size > 0) {
      setPendingFolderAction('reset');
      return;
    }
    await executeResetDirectory();
  };

  const handleCancelPendingFolderAction = () => {
    setPendingFolderAction(null);
  };

  const handleConfirmPendingFolderAction = () => {
    const action = pendingFolderAction;
    setPendingFolderAction(null);
    if (action === 'select') {
      void executeSelectDirectory();
    } else if (action === 'reset') {
      void executeResetDirectory();
    }
  };

  return (
    <aside ref={sidebarFallbackRef} tabIndex={-1} className="save-editor-sidebar">
      <SaveFolderBar
        saveDir={folderInfo.path}
        isOverride={folderInfo.isOverride}
        isMissing={folderInfo.isMissing}
        isLoading={isFolderLoading}
        folderError={folderError}
        onRetryFolder={() => setFolderRetryCount((c) => c + 1)}
        disabled={saveStatus.state === 'saving' || isMutatingFile}
        onSelectDirectory={handleSelectDirectory}
        onResetDirectory={handleResetDirectory}
      />
      <SaveFileList
        gameKey={gameKey}
        electronAPI={electronAPI}
        folderRevision={folderRevision}
        initialFile={props.initialFile}
        retryRequest={props.retryRequest}
        listFocusRef={props.listFocusRef}
      />
      <Modal
        isOpen={pendingFolderAction !== null}
        onClose={handleCancelPendingFolderAction}
        title="Unsaved Changes"
        fallbackFocusRef={sidebarFallbackRef}
      >
        <Modal.Header>Unsaved Changes</Modal.Header>
        <Modal.Body>
          <p>{strings.save_editor_unsaved_confirm || 'You have unsaved changes. Discard them?'}</p>
        </Modal.Body>
        <Modal.Footer>
          <button
            type="button"
            className="secondary-btn"
            onClick={handleCancelPendingFolderAction}
          >
            {strings.save_editor_cancel || 'Cancel'}
          </button>
          <button
            type="button"
            className="danger-btn"
            onClick={handleConfirmPendingFolderAction}
          >
            Discard Changes
          </button>
        </Modal.Footer>
      </Modal>
    </aside>
  );
}
