import React, { useEffect, useRef, useState } from 'react';
import type { ElectronAPI } from '../../shared/types/ipc';
import { AppErrorBoundary } from '../components/AppErrorBoundary';
import {
  SaveEditorStoreProvider,
  useSaveEditorDispatch,
  useSaveEditorStore,
  useSaveFileStatus,
  type ObservableSaveEditorStore,
} from './store/save-editor-store';
import { SaveEditorSidebar } from './components/sidebar/SaveEditorSidebar';
import { SaveEditorTabs } from './components/SaveEditorTabs';
import { SaveEditorSearchBar } from './components/SaveEditorSearchBar';
import { SaveEditorFilterBar } from './components/SaveEditorFilterBar';
import { SaveEditorContent } from './components/SaveEditorContent';
import { SaveEditorFooter } from './components/SaveEditorFooter';
import { useFindShortcut } from '../hooks/useFindShortcut';

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
  onClose,
  initialFile,
}: SaveEditorShellProps): React.JSX.Element {
  const fileStatus = useSaveFileStatus();
  const dispatch = useSaveEditorDispatch();
  const store = useSaveEditorStore();
  const retryCounterRef = useRef(0);
  const sidebarListFocusRef = useRef<HTMLDivElement | null>(null);
  const [retryRequest, setRetryRequest] = useState<{
    fileName: string;
    requestId: number;
    allowLargeSaves?: boolean;
  } | null>(null);

  useFindShortcut(
    () => document.querySelector('input.save-editor-search') as HTMLInputElement | null,
    fileStatus.state === 'loaded'
  );

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const isTextTypingTarget = (target: EventTarget | null): boolean => {
      const el =
        target instanceof HTMLElement
          ? target
          : document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
      if (!el) return false;
      if (el.closest('[role="dialog"]')) return true;
      if (el.tagName === 'TEXTAREA' || el.isContentEditable) return true;
      if (el.tagName === 'INPUT') {
        const inputType = (el as HTMLInputElement).type;
        return [
          'text',
          'search',
          'number',
          'password',
          'email',
          'tel',
          'url',
        ].includes(inputType);
      }
      return false;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (store.getSnapshot().fileStatus.state !== 'loaded') return;
      if (isTextTypingTarget(e.target)) return;

      if (e.shiftKey && e.key === 'Enter') {
        const saveBtn = document.querySelector(
          '.save-editor-footer .save-btn'
        ) as HTMLButtonElement | null;
        if (saveBtn && saveBtn.getAttribute('aria-disabled') !== 'true') {
          e.preventDefault();
          saveBtn.click();
        }
        return;
      }

      if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
      const key = e.key.toLowerCase();
      const currentFilters = store.getSnapshot().filters;
      if (key === 'e') {
        e.preventDefault();
        dispatch.setFilter({ showEmpty: !currentFilters.showEmpty });
      } else if (key === 'i') {
        e.preventDefault();
        dispatch.setFilter({ showImportant: !currentFilters.showImportant });
      } else if (key === 'x') {
        e.preventDefault();
        dispatch.setFilter({ exactMatch: !currentFilters.exactMatch });
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [store, dispatch]);

  const handleRetryLoad = (fileName: string, options?: { allowLargeSaves?: boolean }) => {
    setRetryRequest({
      fileName,
      requestId: ++retryCounterRef.current,
      ...(options?.allowLargeSaves ? { allowLargeSaves: true } : {}),
    });
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
            <div
              className={
                fileStatus.state === 'loaded'
                  ? 'save-editor-top-bar save-editor-tabs-wrapper is-loaded'
                  : 'save-editor-top-bar save-editor-tabs-wrapper'
              }
              style={fileStatus.state === 'loaded' ? undefined : { display: 'none' }}
            >
              <SaveEditorTabs />
              <div className="save-editor-actions">
                <div className="save-editor-search-row">
                  <SaveEditorSearchBar />
                </div>
                <SaveEditorFilterBar />
              </div>
            </div>
            <SaveEditorContent
              onRetryLoad={handleRetryLoad}
              onChangeFile={handleChangeFile}
            />
          </main>
        </div>
        <SaveEditorFooter onClose={onClose} />
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
