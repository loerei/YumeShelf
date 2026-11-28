import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sanitizeUserPaths } from '../shared/path-sanitizer';
import type { ElectronAPI } from '../shared/types/ipc';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { Header } from './components/Header';
import { LibraryGrid } from './components/LibraryGrid';
import { MascotWidget } from './components/MascotWidget';
import { AboutModal } from './components/modals/AboutModal';
import { DuplicateStackModal } from './components/modals/DuplicateStackModal';
import { LanguagePackModal } from './components/modals/LanguagePackModal';
import { Modal } from './components/modals/Modal';
import { SettingsModal } from './components/modals/SettingsModal';
import { LibraryStateProvider } from './context/LibraryStateContext';
import { useLocaleStrings } from './i18n/locale-strings';
import { useBootstrapLibrary } from './hooks/useBootstrapLibrary';
import { useLibraryActions } from './hooks/useLibraryActions';
import type { LibraryViewItem } from './library-stacks';
import { MascotProvider } from './providers/MascotProvider';
import { NotificationProvider, useNotification } from './providers/NotificationProvider';
import { OverlayProvider, useOverlay } from './providers/OverlayProvider';
import { TooltipProvider } from './providers/TooltipProvider';
import type { ISaveEditorLauncher } from './services/save-editor-launcher';
import {
  createUiRuntimeState,
  type ObservableUiRuntimeStore,
  type UiStorageAdapter,
} from './state/ui-runtime-state';
import { migrateUiPreferences } from './state/ui-storage-migrations';
import type { GameEntry } from './types/game';
import { applyTheme } from './utils/theme';

export interface AppProps {
  readonly store?: ObservableUiRuntimeStore;
  readonly electronAPI?: ElectronAPI;
  readonly launcher?: ISaveEditorLauncher;
  readonly storage?: UiStorageAdapter;
  readonly onRefreshError?: (error: Error) => void;
}

export interface AppShellProps {
  readonly store: ObservableUiRuntimeStore;
  readonly electronAPI?: ElectronAPI;
  readonly launcher?: ISaveEditorLauncher;
  readonly storage?: UiStorageAdapter;
  readonly onRefreshError?: (error: Error) => void;
}

export function AppShell({
  store,
  electronAPI,
  launcher,
  storage,
  onRefreshError,
}: AppShellProps): React.ReactElement {
  const api = electronAPI ?? (typeof window !== 'undefined' ? window.electronAPI : undefined);
  const { activeModalState, activeModal, isModalOpen, getModalPayload, closeModal, openModal } =
    useOverlay();
  const { showToast, setFallbackFocusTarget } = useNotification();
  const localeStrings = useLocaleStrings();
  const gridContainerRef = useRef<HTMLDivElement | null>(null);
  const duplicateStackContainerRef = useRef<HTMLDivElement | null>(null);
  const loadingOverlayRef = useRef<HTMLDivElement | null>(null);

  const handleRefreshError = useCallback(
    (err: Error) => {
      onRefreshError?.(err);
      showToast(`Library refresh failed: ${sanitizeUserPaths(err.message) || 'Check folder access'}`);
    },
    [onRefreshError, showToast]
  );

  const bootstrapState = useBootstrapLibrary(store, api, storage, handleRefreshError);
  const hasShownNoticeRef = useRef(false);

  useEffect(() => {
    if (bootstrapState.status === 'success' && gridContainerRef.current) {
      setFallbackFocusTarget(gridContainerRef.current);
    }
    return () => {
      setFallbackFocusTarget(null);
    };
  }, [bootstrapState.status, setFallbackFocusTarget]);

  useEffect(() => {
    if (bootstrapState.status === 'loading') {
      loadingOverlayRef.current?.focus();
    }
  }, [bootstrapState.status]);

  const pendingDeleteGame = getModalPayload('delete-game')?.game ?? null;
  const [targetFocusGameKey, setTargetFocusGameKey] = useState<string | null>(null);

  useEffect(() => {
    if (
      bootstrapState.status === 'success' &&
      bootstrapState.data?.postUpdateNotice?.version &&
      !hasShownNoticeRef.current
    ) {
      hasShownNoticeRef.current = true;
      showToast(`Application updated to v${bootstrapState.data.postUpdateNotice.version}`);
    }
  }, [bootstrapState, showToast]);

  const {
    isDeletingGame,
    handleMenuAction,
    handleToggleFavorite,
    handleFavoriteError,
    handleLaunch,
    handleOpenSaveEditor,
    handleConfirmDelete,
    handleCloseDeleteModal,
  } = useLibraryActions({
    store,
    electronAPI: api,
    launcher,
    storage,
    showToast,
    launchingGameTemplate: localeStrings.launching_game,
    openModal,
    closeModal,
    isModalOpen,
    getModalPayload,
    onTargetFocusGameKey: setTargetFocusGameKey,
  });

  const handleOpenStack = useCallback(
    (stack: LibraryViewItem) => {
      openModal('duplicate-stack', { groupKey: stack.groupKey });
    },
    [openModal]
  );

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
            <h2 className="loading-title">Starting YumeShelf</h2>
            <p className="loading-status">Preparing startup pipeline</p>
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
    <>
      <Header
        libraryPaths={
          bootstrapState.status === 'success'
            ? bootstrapState.data.config?.libraryPaths?.length
              ? bootstrapState.data.config.libraryPaths
              : bootstrapState.data.config?.libraryPath
                ? [bootstrapState.data.config.libraryPath]
                : undefined
            : undefined
        }
        onOpenFolder={(folderPath) => {
          if (folderPath && api?.openPath) {
            api.openPath(folderPath);
          } else {
            api?.openFolder?.();
          }
        }}
        onSelectGame={(gameKey) => {
          const games = store.getSnapshot().allGames;
          let targetGame: GameEntry | undefined;
          for (const g of games) {
            if (
              g.gameKey === gameKey ||
              g.gameId === gameKey ||
              g.primaryInstance?.gameKey === gameKey
            ) {
              targetGame = g;
              break;
            }
            const matchedInstance = g.instances?.find(
              (inst) => inst.gameKey === gameKey || inst.gameId === gameKey
            );
            if (matchedInstance) {
              targetGame = matchedInstance;
              break;
            }
          }
          if (targetGame) handleLaunch(targetGame);
        }}
        onRefreshLibrary={bootstrapState.refresh}
        isRefreshing={bootstrapState.isRefreshing}
        onOpenSettings={() => openModal('settings')}
      />
      <LibraryGrid
        containerRef={gridContainerRef}
        electronAPI={api}
        storage={storage}
        focusTargetKey={activeModalState.type === null ? targetFocusGameKey : null}
        onFocusHandled={() => setTargetFocusGameKey(null)}
        onFavoriteError={handleFavoriteError}
        onShowToast={showToast}
        onRefreshLibrary={bootstrapState.refresh}
        onOpenStack={handleOpenStack}
        onOpenSaveEditor={handleOpenSaveEditor}
        onLaunch={handleLaunch}
        onMenuAction={handleMenuAction}
      />
      <MascotWidget />
      {isModalOpen('settings') && (
        <SettingsModal
          isOpen
          onClose={() => closeModal('settings')}
          fallbackFocusRef={gridContainerRef}
          electronAPI={api}
          storage={storage}
          onOpenLanguagePack={() => openModal('language-pack')}
          onOpenAbout={() => openModal('about')}
        />
      )}
      {isModalOpen('about') && (
        <AboutModal
          isOpen
          onClose={() => closeModal('about')}
          fallbackFocusRef={gridContainerRef}
          electronAPI={api}
        />
      )}
      {isModalOpen('language-pack') && (
        <LanguagePackModal
          isOpen
          onClose={() => closeModal('language-pack')}
          fallbackFocusRef={gridContainerRef}
          electronAPI={api}
          storage={storage}
        />
      )}
      {isModalOpen('duplicate-stack') && (
        <DuplicateStackModal
          isOpen
          containerRef={duplicateStackContainerRef}
          fallbackFocusRef={gridContainerRef}
          groupKey={getModalPayload('duplicate-stack')?.groupKey ?? ''}
          focusTargetKey={activeModal === 'duplicate-stack' ? targetFocusGameKey : null}
          onFocusHandled={() => setTargetFocusGameKey(null)}
          onClose={(targetKey) => {
            closeModal('duplicate-stack');
            if (targetKey) {
              setTargetFocusGameKey(targetKey);
            }
          }}
          onOpenSaveEditor={handleOpenSaveEditor}
          onToggleFavorite={handleToggleFavorite}
          onLaunch={handleLaunch}
          onMenuAction={handleMenuAction}
        />
      )}
      <Modal
        isOpen={Boolean(pendingDeleteGame)}
        onClose={handleCloseDeleteModal}
        modalType="delete-game"
        title="Delete Game from Library"
        fallbackFocusRef={
          isModalOpen('duplicate-stack') ? duplicateStackContainerRef : gridContainerRef
        }
      >
        <Modal.Header>Delete Game from Library</Modal.Header>
        <Modal.Body>
          <p>
            Are you sure you want to delete{' '}
            <strong>{pendingDeleteGame?.title || pendingDeleteGame?.name}</strong>? This action
            will move the game folder to the system trash.
          </p>
        </Modal.Body>
        <Modal.Footer>
          <button
            type="button"
            className="secondary-btn"
            autoFocus
            onClick={handleCloseDeleteModal}
            aria-disabled={isDeletingGame}
            style={isDeletingGame ? { pointerEvents: 'none' } : undefined}
          >
            Cancel
          </button>
          <button
            type="button"
            className="danger-btn"
            onClick={() => {
              if (!isDeletingGame) handleConfirmDelete();
            }}
            aria-disabled={isDeletingGame}
            style={isDeletingGame ? { pointerEvents: 'none' } : undefined}
          >
            {isDeletingGame ? 'Deleting...' : 'Delete'}
          </button>
        </Modal.Footer>
      </Modal>
    </>
  );
}

export function App({
  store: storeProp,
  electronAPI,
  launcher,
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
    <AppErrorBoundary electronAPI={electronAPI}>
      <LibraryStateProvider store={resolvedStore}>
        <TooltipProvider>
          <OverlayProvider>
            <NotificationProvider electronAPI={electronAPI}>
              <MascotProvider storage={effectiveStorage}>
                <AppShell
                  store={resolvedStore}
                  electronAPI={electronAPI}
                  launcher={launcher}
                  storage={effectiveStorage}
                  onRefreshError={onRefreshError}
                />
              </MascotProvider>
            </NotificationProvider>
          </OverlayProvider>
        </TooltipProvider>
      </LibraryStateProvider>
    </AppErrorBoundary>
  );
}

export default App;
