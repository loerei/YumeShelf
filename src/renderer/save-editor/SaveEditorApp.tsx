import React, { useRef, useState } from 'react';
import type { ElectronAPI } from '../../shared/types/ipc';
import { AppErrorBoundary } from '../components/AppErrorBoundary';
import {
  SaveEditorStoreProvider,
  useSaveEditorDispatch,
  type ObservableSaveEditorStore,
} from './store/save-editor-store';
import { SaveEditorSidebar } from './components/sidebar/SaveEditorSidebar';
import { SaveEditorTabs } from './components/SaveEditorTabs';
import { SaveEditorSearchBar } from './components/SaveEditorSearchBar';
import { SaveEditorContent } from './components/SaveEditorContent';
import { SaveEditorFooter } from './components/SaveEditorFooter';

export interface SaveEditorAppProps {
  gameKey?: string;
  initialFile?: string;
  store?: ObservableSaveEditorStore;
  electronAPI?: ElectronAPI;
  onClose?: () => void;
}

export interface SaveEditorShellProps {
  onClose: () => void;
  initialFile?: string;
}

export function SaveEditorShell({
  onClose: _onClose,
  initialFile,
}: SaveEditorShellProps): React.JSX.Element {
  const dispatch = useSaveEditorDispatch();
  const retryCounterRef = useRef(0);
  const sidebarListFocusRef = useRef<HTMLDivElement | null>(null);
  const [retryRequest, setRetryRequest] = useState<{
    fileName: string;
    requestId: number;
  } | null>(null);

  const handleRetryLoad = (fileName: string) => {
    setRetryRequest({ fileName, requestId: ++retryCounterRef.current });
  };

  const handleChangeFile = () => {
    dispatch.setFileIdle();
    sidebarListFocusRef.current?.focus();
  };

  return (
    <div className="save-editor-overlay">
      <div className="save-editor-panel">
        <div className="save-editor-body">
          <SaveEditorSidebar
            initialFile={initialFile}
            retryRequest={retryRequest}
            listFocusRef={sidebarListFocusRef}
          />
          <main className="save-editor-main">
            <div className="save-editor-top-bar">
              <SaveEditorTabs />
              <SaveEditorSearchBar />
            </div>
            <SaveEditorContent
              onRetryLoad={handleRetryLoad}
              onChangeFile={handleChangeFile}
            />
          </main>
        </div>
        <SaveEditorFooter />
      </div>
    </div>
  );
}

/**
 * Root application component for the standalone Save Editor window.
 * Resolves initialization parameters from props or URL query string without
 * localStorage side-channels and enforces error boundary isolation.
 */
export function SaveEditorApp({
  gameKey,
  initialFile,
  store,
  electronAPI,
  onClose,
}: SaveEditorAppProps): React.JSX.Element {
  let queryGameKey = '';
  let queryFile = '';
  if (typeof window !== 'undefined') {
    try {
      const params = new URLSearchParams(window.location.search);
      queryGameKey = params.get('gameKey')?.trim() ?? '';
      queryFile = params.get('file')?.trim() ?? '';
    } catch {
      queryGameKey = '';
      queryFile = '';
    }
  }

  const resolvedGameKey = gameKey !== undefined ? gameKey.trim() : queryGameKey;
  const resolvedInitialFile =
    initialFile !== undefined ? (initialFile.trim() || undefined) : (queryFile || undefined);

  if (!resolvedGameKey && !store) {
    return (
      <div className="save-editor-error-banner" role="alert">
        Missing required gameKey parameter
      </div>
    );
  }

  const handleClose =
    onClose ??
    (() => {
      if (typeof window !== 'undefined') {
        window.close();
      }
    });

  return (
    <AppErrorBoundary electronAPI={electronAPI}>
      <SaveEditorStoreProvider
        gameKey={resolvedGameKey}
        store={store}
        electronAPI={electronAPI}
      >
        <SaveEditorShell onClose={handleClose} initialFile={resolvedInitialFile} />
      </SaveEditorStoreProvider>
    </AppErrorBoundary>
  );
}
