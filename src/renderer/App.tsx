import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sanitizeUserPaths } from '../shared/path-sanitizer';
import type { ElectronAPI } from '../shared/types/ipc';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import type { GameCardMenuAction, GameCardMenuPayload } from './components/GameCard';
import { Header } from './components/Header';
import { LibraryGrid } from './components/LibraryGrid';
import { MascotWidget } from './components/MascotWidget';
import { AboutModal } from './components/modals/AboutModal';
import { DuplicateStackModal } from './components/modals/DuplicateStackModal';
import { LanguagePackModal } from './components/modals/LanguagePackModal';
import { Modal } from './components/modals/Modal';
import { SettingsModal, type MascotPreferences } from './components/modals/SettingsModal';
import { LibraryStateProvider } from './context/LibraryStateContext';
import { useBootstrapLibrary } from './hooks/useBootstrapLibrary';
import { getGameKey, readStoredCustomOrder, resolveCustomOrder } from './library-order';
import {
  buildGroupKey,
  buildLibraryViewItems,
  findGameEntryByKey,
  resolveFavoriteLockKey,
  type LibraryViewItem,
} from './library-stacks';
import { NotificationProvider, useNotification } from './providers/NotificationProvider';
import { OverlayProvider, useOverlay } from './providers/OverlayProvider';
import { TooltipProvider } from './providers/TooltipProvider';
import {
  ElectronSaveEditorLauncher,
  type ISaveEditorLauncher,
} from './services/save-editor-launcher';
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
  const resolvedLauncher = useMemo(
    () => launcher ?? new ElectronSaveEditorLauncher(api),
    [launcher, api]
  );
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

  const [mascotPreferences, setMascotPreferences] = useState<MascotPreferences>(() => {
    const rawVol = storage?.getItem('yumeshelf_mascot_volume');
    const parsedVol = rawVol !== null && rawVol !== undefined && rawVol !== '' ? Number(rawVol) : 20;
    return {
      show: storage?.getItem('yumeshelf_mascot_show') !== 'off',
      scale: Number(storage?.getItem('yumeshelf_mascot_scale')) || 100,
      sound: storage?.getItem('yumeshelf_mascot_sound') || 'squeaker',
      volume: Number.isFinite(parsedVol) ? parsedVol : 20,
    };
  });

  const [pendingDeleteGame, setPendingDeleteGame] = useState<GameEntry | null>(null);
  const [isDeletingGame, setIsDeletingGame] = useState(false);
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

  const handleFavoriteError = useCallback(
    (err: Error, gameKey: string) => {
      console.error('[AppShell] Failed to toggle favorite:', {
        gameKey: sanitizeUserPaths(gameKey),
        error: sanitizeUserPaths(err.message),
        stack: err.stack ? sanitizeUserPaths(err.stack) : undefined,
      });
      showToast('Failed to update favorite status');
    },
    [showToast]
  );

  const inFlightFavoriteKeysRef = useRef<Set<string>>(new Set());

  const handleToggleFavorite = useCallback(
    async (game: GameEntry) => {
      if (!game) return;
      const key = getGameKey(game);
      if (!key) return;
      const currentGames = store.getSnapshot().allGames;
      const lockKey = resolveFavoriteLockKey(key, currentGames) ?? key;
      if (inFlightFavoriteKeysRef.current.has(lockKey)) return;
      inFlightFavoriteKeysRef.current.add(lockKey);

      const nextFav = !game.favorite;
      store.updateGame(key, { favorite: nextFav });
      try {
        if (!api?.toggleFavorite) {
          throw new Error('Electron API toggleFavorite is unavailable');
        }
        const res = await api.toggleFavorite(key, nextFav);
        if (typeof res === 'boolean' && res !== nextFav) {
          console.warn(
            '[AppShell] toggleFavorite backend rejected state change; reverting optimistic state:',
            {
              gameKey: sanitizeUserPaths(key),
              requested: nextFav,
              backendState: res,
            }
          );
          const latestEntry = findGameEntryByKey(store.getSnapshot().allGames, key);
          if (latestEntry && latestEntry.favorite !== res) {
            store.updateGame(key, { favorite: res });
          }
          showToast('Failed to update favorite status');
        }
      } catch (err) {
        store.updateGame(key, { favorite: !nextFav });
        console.error('[AppShell] Failed to toggle favorite:', {
          gameKey: sanitizeUserPaths(key),
          error: sanitizeUserPaths(err instanceof Error ? err.message : String(err)),
          stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
        });
        showToast('Failed to update favorite status');
      } finally {
        inFlightFavoriteKeysRef.current.delete(lockKey);
      }
    },
    [api, store, showToast]
  );

  const handleLaunch = useCallback(
    (game: GameEntry) => {
      if (!game) return;
      api?.launchYume?.({
        gameKey: game.primaryInstance?.gameKey || game.gameKey,
        exePath: game.primaryInstance?.exePath || game.exePath,
        runInBackground: game.primaryInstance?.runInBackground ?? game.runInBackground,
      });
    },
    [api]
  );

  const handleOpenSaveEditor = useCallback(
    (gameKey: string) => {
      resolvedLauncher.open(gameKey).catch((err) => {
        const sanitizedError = sanitizeUserPaths(err instanceof Error ? err.message : String(err));
        console.error('[AppShell] Failed to open save editor:', {
          gameKey: sanitizeUserPaths(gameKey),
          error: sanitizedError,
          stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
        });
        showToast(`Failed to open save editor: ${sanitizedError || 'Window launch failed'}`);
      });
    },
    [resolvedLauncher, showToast]
  );

  const handleOpenStack = useCallback(
    (stack: LibraryViewItem) => {
      openModal('duplicate-stack', { groupKey: stack.groupKey });
    },
    [openModal]
  );

  const handleMenuAction = useCallback(
    async (action: GameCardMenuAction, game: GameEntry, payload?: GameCardMenuPayload) => {
      if (!game) return;
      const key = game.gameKey || game.gameId || '';
      const formatErr = (e: unknown) => ({
        error: sanitizeUserPaths(e instanceof Error ? e.message : String(e)),
        stack: e instanceof Error && e.stack ? sanitizeUserPaths(e.stack) : undefined,
      });
      try {
        switch (action) {
          case 'rename': {
            const trimmedName = payload?.newName?.trim();
            if (!trimmedName || trimmedName === game.name || !key) return;
            try {
              const success = await api?.renameGame?.({ gameKey: key, newName: trimmedName });
              if (success) {
                store.updateGame(key, { name: trimmedName, title: trimmedName });
                showToast('Game renamed successfully');
              } else {
                console.warn(
                  `[AppShell] Failed to rename game: backend mutation returned false for gameKey "${sanitizeUserPaths(key)}"`
                );
                showToast('Failed to rename game');
              }
            } catch (err) {
              console.error(
                `[AppShell] Error invoking renameGame for gameKey "${sanitizeUserPaths(key)}":`,
                formatErr(err)
              );
              showToast('Failed to rename game');
            }
            break;
          }
          case 'reveal': {
            const targetExe = game.exePath || game.primaryInstance?.exePath;
            if (targetExe) {
              api?.revealGame?.(targetExe);
            }
            break;
          }
          case 'open-saves': {
            if (!key || !api?.openSaveFolder) return;
            const res = await api.openSaveFolder(key);
            if (!res?.ok) {
              if (res?.error === 'override-missing') {
                showToast('Configured save folder not found');
              } else if (res?.error === 'not-found' || res?.error === 'no-record') {
                showToast('No save folder found');
              } else {
                showToast(
                  `Failed to open save folder${res?.error ? `: ${sanitizeUserPaths(res.error)}` : ''}`
                );
              }
            }
            break;
          }
          case 'set-save-folder': {
            if (!key || !api?.selectSaveFolder || !api?.setSaveFolderOverride) return;
            const selected = await api.selectSaveFolder();
            if (selected?.canceled || !selected?.folderPath) return;
            const res = await api.setSaveFolderOverride({
              gameKey: key,
              folderPath: selected.folderPath,
            });
            if (res?.ok) {
              store.updateGame(key, { saveFolderOverride: selected.folderPath });
              showToast('Save folder path updated');
            } else {
              showToast(
                `Failed to set save folder${res?.error ? `: ${sanitizeUserPaths(res.error)}` : ''}`
              );
            }
            break;
          }
          case 'reset-save-folder': {
            if (!key || !api?.setSaveFolderOverride) return;
            const res = await api.setSaveFolderOverride({ gameKey: key, folderPath: '' });
            if (res?.ok) {
              store.updateGame(key, { saveFolderOverride: null });
              showToast('Save folder reset to auto-detect');
            } else {
              showToast('Failed to reset save folder');
            }
            break;
          }
          case 'toggle-live-tl': {
            if (!key || !api?.toggleAutoTranslate) return;
            const nextAutoTranslate = await api.toggleAutoTranslate(key);
            store.updateGame(key, { autoTranslate: Boolean(nextAutoTranslate) });
            break;
          }
          case 'tl-sync': {
            if (!key || !api?.startTranslationSync) return;
            const BCP47_REGEX = /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/;
            let targetLang = 'en';
            const explicitRaw =
              typeof payload?.targetLang === 'string'
                ? payload.targetLang.trim().toLowerCase()
                : '';
            if (explicitRaw) {
              targetLang = BCP47_REGEX.test(explicitRaw) ? explicitRaw : 'en';
            } else {
              let storedLang = 'en';
              try {
                const rawStored = storage?.getItem?.('yumeshelf_lang');
                const trimmed =
                  typeof rawStored === 'string' ? rawStored.trim().toLowerCase() : '';
                storedLang = BCP47_REGEX.test(trimmed) ? trimmed : 'en';
              } catch (err) {
                console.warn('[AppShell] Failed to read yumeshelf_lang from storage:', {
                  error: sanitizeUserPaths(err instanceof Error ? err.message : String(err)),
                });
              }
              if (api.getLanguageState) {
                try {
                  const langState = await api.getLanguageState();
                  const availableCodes = new Set(
                    [...(langState?.builtIn ?? []), ...(langState?.installed ?? [])]
                      .map((p) => String(p.code || '').trim().toLowerCase())
                      .filter(Boolean)
                  );
                  targetLang =
                    availableCodes.size > 0 && !availableCodes.has(storedLang) ? 'en' : storedLang;
                } catch (err) {
                  console.warn(
                    '[AppShell] Failed to get active language state for tl-sync, preserving stored language:',
                    {
                      candidate: storedLang,
                      error: sanitizeUserPaths(err instanceof Error ? err.message : String(err)),
                    }
                  );
                  targetLang = storedLang;
                }
              } else {
                targetLang = storedLang;
              }
            }
            try {
              await api.startTranslationSync({ gameKey: key, targetLang });
            } catch (err) {
              console.error('[AppShell] Failed to start translation sync:', formatErr(err));
              showToast('Failed to start translation sync');
            }
            break;
          }
          case 'toggle-bg': {
            if (!key || !api?.toggleRunInBackground) return;
            const nextRunInBg = await api.toggleRunInBackground(key);
            store.updateGame(key, { runInBackground: Boolean(nextRunInBg) });
            break;
          }
          case 'delete': {
            setPendingDeleteGame(game);
            break;
          }
          default: {
            console.warn(`[AppShell] Unhandled menu action key: "${String(action)}"`);
            break;
          }
        }
      } catch (err) {
        console.error(
          `[AppShell] Menu action "${action}" failed for ${sanitizeUserPaths(key)}:`,
          formatErr(err)
        );
      }
    },
    [api, store, storage, showToast]
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!pendingDeleteGame?.folderPath || !api?.deleteGame || isDeletingGame) return;
    setIsDeletingGame(true);
    try {
      const res = await api.deleteGame(pendingDeleteGame.folderPath);
      if (res && typeof res === 'object' && 'ok' in res && !res.ok) {
        const resObj = res as { error?: string; reason?: string };
        const errorDetail = resObj.error || resObj.reason || 'Unknown error';
        console.error('[AppShell] Game deletion rejected:', {
          gameKey: sanitizeUserPaths(pendingDeleteGame.gameKey || pendingDeleteGame.gameId),
          folderPath: sanitizeUserPaths(pendingDeleteGame.folderPath),
          error: sanitizeUserPaths(errorDetail),
        });
        showToast('Failed to delete game folder');
        return;
      }
      const key = pendingDeleteGame.gameKey || pendingDeleteGame.gameId || '';
      const allCurrentGames = store.getSnapshot().allGames;

      const parentStack = allCurrentGames.find(
        (g) =>
          Array.isArray(g.instances) &&
          g.instances.length > 1 &&
          g.instances.some(
            (inst) =>
              (inst.gameKey || inst.gameId) === key ||
              Boolean(pendingDeleteGame.folderPath && inst.folderPath === pendingDeleteGame.folderPath)
          )
      );

      let survivingFocusKey: string | null = null;
      if (parentStack && Array.isArray(parentStack.instances)) {
        const instIdx = parentStack.instances.findIndex(
          (inst) =>
            (inst.gameKey || inst.gameId) === key ||
            Boolean(pendingDeleteGame.folderPath && inst.folderPath === pendingDeleteGame.folderPath)
        );
        if (instIdx !== -1) {
          const remainingInstances = parentStack.instances.filter((_, idx) => idx !== instIdx);
          if (remainingInstances.length > 1) {
            const neighbor = parentStack.instances[instIdx + 1] ?? parentStack.instances[instIdx - 1];
            survivingFocusKey = neighbor ? neighbor.gameKey || neighbor.gameId || null : null;
          } else if (remainingInstances.length === 1) {
            survivingFocusKey =
              remainingInstances[0].gameKey || remainingInstances[0].gameId || null;
          }
        }
      }

      if (!survivingFocusKey) {
        const { activeCategoryId, currentSort } = store.getSnapshot();
        const visibleGames = activeCategoryId
          ? allCurrentGames.filter((g) => g.categoryIds?.includes(activeCategoryId))
          : allCurrentGames;
        const customOrder =
          currentSort === 'custom'
            ? resolveCustomOrder(allCurrentGames, readStoredCustomOrder(storage))
            : null;
        const { items: visibleViewItems } = buildLibraryViewItems(
          visibleGames,
          currentSort,
          customOrder
        );

        const targetIdx = visibleViewItems.findIndex(
          (item) =>
            item.representativeKey === key ||
            item.groupKey === key ||
            item.games.some((g) => (g.gameKey || g.gameId) === key)
        );

        if (targetIdx !== -1) {
          const neighbor = visibleViewItems[targetIdx + 1] ?? visibleViewItems[targetIdx - 1];
          survivingFocusKey = neighbor
            ? neighbor.isStack
              ? neighbor.groupKey
              : neighbor.representativeKey
            : null;
        }
      }

      const nextGames: GameEntry[] = [];
      for (const entry of allCurrentGames) {
        if (Array.isArray(entry.instances) && entry.instances.length > 1) {
          const remaining = entry.instances.filter(
            (inst) =>
              (inst.gameKey || inst.gameId) !== key &&
              (!pendingDeleteGame.folderPath || inst.folderPath !== pendingDeleteGame.folderPath)
          );
          if (remaining.length === 0) {
            continue;
          }
          if (remaining.length !== entry.instances.length) {
            const nextPrimary =
              remaining.find(
                (inst) =>
                  (inst.gameKey || inst.gameId) ===
                  (entry.primaryInstance?.gameKey || entry.primaryInstance?.gameId)
              ) ?? remaining[0];
            const updatedEntry: GameEntry = {
              ...entry,
              ...nextPrimary,
              instances: remaining,
              primaryInstance: nextPrimary,
              duplicateCount: remaining.length > 1 ? remaining.length : 0,
              favorite: remaining.some((i) => Boolean(i.favorite)),
              playtime: remaining.reduce((sum, i) => sum + (i.playtime || 0), 0),
              isRunning: remaining.some((i) => Boolean(i.isRunning)),
            };
            nextGames.push(updatedEntry);
            if (remaining.length > 1 && isModalOpen('duplicate-stack')) {
              const prevGroupKey = buildGroupKey(entry);
              const nextGroupKey = buildGroupKey(updatedEntry);
              if (
                nextGroupKey &&
                nextGroupKey !== prevGroupKey &&
                getModalPayload('duplicate-stack')?.groupKey === prevGroupKey
              ) {
                openModal('duplicate-stack', { groupKey: nextGroupKey });
              }
            }
            continue;
          }
        }
        const entryKey = entry.gameKey || entry.gameId || '';
        if (
          entryKey === key ||
          (pendingDeleteGame.folderPath && entry.folderPath === pendingDeleteGame.folderPath)
        ) {
          continue;
        }
        nextGames.push(entry);
      }
      store.setAllGames(nextGames);
      setTargetFocusGameKey(survivingFocusKey ?? '__GRID_CONTAINER__');
      setPendingDeleteGame(null);
    } catch (err) {
      console.error('[AppShell] Game deletion failed:', {
        gameKey: sanitizeUserPaths(pendingDeleteGame.gameKey || pendingDeleteGame.gameId),
        folderPath: sanitizeUserPaths(pendingDeleteGame.folderPath),
        error: sanitizeUserPaths(err instanceof Error ? err.message : String(err)),
        stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
      });
      showToast('Failed to delete game folder');
    } finally {
      setIsDeletingGame(false);
    }
  }, [
    pendingDeleteGame,
    isDeletingGame,
    api,
    store,
    storage,
    showToast,
    isModalOpen,
    getModalPayload,
    openModal,
  ]);

  const handleCloseDeleteModal = useCallback(() => {
    if (isDeletingGame) return;
    const cancelledKey = pendingDeleteGame?.gameKey || pendingDeleteGame?.gameId || null;
    setPendingDeleteGame(null);
    if (cancelledKey) {
      setTargetFocusGameKey(cancelledKey);
    }
  }, [isDeletingGame, pendingDeleteGame]);

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
        onSelectGame={(gameKey) => {
          const targetGame = store.getSnapshot().allGames.find(
            (g) =>
              g.gameKey === gameKey ||
              g.gameId === gameKey ||
              g.primaryInstance?.gameKey === gameKey
          );
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
        onRefreshLibrary={bootstrapState.refresh}
        onOpenStack={handleOpenStack}
        onOpenSaveEditor={handleOpenSaveEditor}
        onLaunch={handleLaunch}
        onMenuAction={handleMenuAction}
      />
      <MascotWidget {...mascotPreferences} storage={storage} />
      {isModalOpen('settings') && (
        <SettingsModal
          isOpen
          onClose={() => closeModal('settings')}
          fallbackFocusRef={gridContainerRef}
          electronAPI={api}
          storage={storage}
          onMascotSettingsChanged={setMascotPreferences}
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
              <AppShell
                store={resolvedStore}
                electronAPI={electronAPI}
                launcher={launcher}
                storage={effectiveStorage}
                onRefreshError={onRefreshError}
              />
            </NotificationProvider>
          </OverlayProvider>
        </TooltipProvider>
      </LibraryStateProvider>
    </AppErrorBoundary>
  );
}

export default App;
