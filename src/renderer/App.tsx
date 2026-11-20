import React, { useEffect, useMemo, useRef } from 'react';
import { sanitizeUserPaths } from '../shared/path-sanitizer';
import type { ElectronAPI } from '../shared/types/ipc';
import { Header } from './components/Header';
import { LibraryGrid } from './components/LibraryGrid';
import { LibraryStateProvider } from './context/LibraryStateContext';
import { useBootstrapLibrary } from './hooks/useBootstrapLibrary';
import {
  createUiRuntimeState,
  type ObservableUiRuntimeStore,
  type UiStorageAdapter,
} from './state/ui-runtime-state';
import { migrateUiPreferences } from './state/ui-storage-migrations';
import { applyTheme } from './utils/theme';

export interface AppProps {
  readonly store?: ObservableUiRuntimeStore;
  readonly electronAPI?: ElectronAPI;
  readonly storage?: UiStorageAdapter;
  readonly onRefreshError?: (error: Error) => void;
}

export interface AppShellProps {
  readonly store?: ObservableUiRuntimeStore;
  readonly electronAPI?: ElectronAPI;
  readonly storage?: UiStorageAdapter;
  readonly onRefreshError?: (error: Error) => void;
}

export function AppShell({
  store,
  electronAPI,
  storage,
  onRefreshError,
}: AppShellProps): React.ReactElement {
  const api = electronAPI ?? (typeof window !== 'undefined' ? window.electronAPI : undefined);
  const bootstrapState = useBootstrapLibrary(store, api, storage, onRefreshError);
  const loadingOverlayRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (bootstrapState.status === 'loading') {
      loadingOverlayRef.current?.focus();
    }
  }, [bootstrapState.status]);

  if (bootstrapState.status === 'loading') {
    return (
      <div
        ref={loadingOverlayRef}
        className="loading-overlay"
        tabIndex={-1}
        role="status"
        aria-live="polite"
      >
        <div className="loading-panel">
          <div className="loading-spinner" />
          <div className="loading-copy">
            <div className="loading-title">Starting YumeShelf</div>
            <div className="loading-status">Preparing startup pipeline</div>
          </div>
        </div>
      </div>
    );
  }

  if (bootstrapState.status === 'installing-update') {
    return (
      <div className="loading-overlay" data-mode="update" role="status" aria-live="polite">
        <div className="loading-panel">
          <div className="loading-copy">
            <h2 className="loading-title">Installing Update</h2>
            <p className="loading-status">
              {bootstrapState.statusText || 'Applying update package...'}
            </p>
            <div className="loading-progress-track">
              <div className="loading-progress-bar" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (bootstrapState.status === 'error') {
    return (
      <div className="loading-overlay" role="alert">
        <div className="loading-panel">
          <div className="loading-copy">
            <h2 className="loading-title">Startup Failed</h2>
            <p className="loading-status">
              {sanitizeUserPaths(
                bootstrapState.error?.message ?? 'An unexpected error occurred during startup'
              )}
            </p>
            <div className="loading-actions">
              <button type="button" className="primary-btn" autoFocus onClick={bootstrapState.retry}>
                Retry
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Header
        onRefreshLibrary={bootstrapState.refresh}
        isRefreshing={bootstrapState.isRefreshing}
      />
      <main className="app-main">
        <LibraryGrid
          electronAPI={api}
          storage={storage}
          onRefreshLibrary={bootstrapState.refresh}
        />
      </main>
    </div>
  );
}

export function App({
  store: storeProp,
  electronAPI,
  storage,
  onRefreshError,
}: AppProps): React.ReactElement {
  const effectiveStorage = useMemo(
    () => storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined),
    [storage]
  );

  const themeAppliedRef = useRef(false);
  if (!themeAppliedRef.current) {
    themeAppliedRef.current = true;
    applyTheme(undefined, effectiveStorage);
  }

  const resolvedStore = useMemo(() => {
    if (storeProp) return storeProp;
    if (effectiveStorage) {
      migrateUiPreferences(effectiveStorage);
    }
    return createUiRuntimeState(effectiveStorage);
  }, [storeProp, effectiveStorage]);

  return (
    <LibraryStateProvider store={resolvedStore}>
      <AppShell
        electronAPI={electronAPI}
        storage={effectiveStorage}
        onRefreshError={onRefreshError}
      />
    </LibraryStateProvider>
  );
}

export default App;
