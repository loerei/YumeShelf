import { useCallback, useMemo, useRef, useState } from 'react';
import { sanitizeUserPaths } from '../../shared/path-sanitizer';
import type { ElectronAPI } from '../../shared/types/ipc';
import type { GameCardMenuAction, GameCardMenuPayload } from '../components/GameCard';
import { getGameKey, readStoredCustomOrder, resolveCustomOrder } from '../library-order';
import {
  buildGroupKey,
  buildLibraryViewItems,
  findGameEntryByKey,
  resolveFavoriteLockKey,
} from '../library-stacks';
import type { OverlayContextValue } from '../providers/OverlayProvider';
import {
  ElectronSaveEditorLauncher,
  type ISaveEditorLauncher,
} from '../services/save-editor-launcher';
import type { ObservableUiRuntimeStore, UiStorageAdapter } from '../state/ui-runtime-state';
import type { GameEntry } from '../types/game';

export interface UseLibraryActionsOptions {
  readonly store: ObservableUiRuntimeStore;
  readonly electronAPI?: ElectronAPI;
  readonly launcher?: ISaveEditorLauncher;
  readonly storage?: UiStorageAdapter;
  readonly showToast: (message: string, durationMs?: number) => void;
  readonly launchingGameTemplate?: string;
  readonly openModal: OverlayContextValue['openModal'];
  readonly closeModal: OverlayContextValue['closeModal'];
  readonly isModalOpen: OverlayContextValue['isModalOpen'];
  readonly getModalPayload: OverlayContextValue['getModalPayload'];
  readonly onTargetFocusGameKey: (key: string | null) => void;
}

export interface UseLibraryActionsResult {
  readonly isDeletingGame: boolean;
  readonly handleMenuAction: (
    action: GameCardMenuAction,
    game: GameEntry,
    payload?: GameCardMenuPayload
  ) => Promise<void>;
  readonly handleToggleFavorite: (game: GameEntry) => Promise<void>;
  readonly handleFavoriteError: (err: Error, gameKey: string) => void;
  readonly handleLaunch: (game: GameEntry) => void;
  readonly handleOpenSaveEditor: (gameKey: string) => void;
  readonly handleConfirmDelete: () => Promise<void>;
  readonly handleCloseDeleteModal: () => void;
}

export interface RecalculateAfterGameDeletionOptions {
  readonly allGames: readonly GameEntry[];
  readonly deletedGame: GameEntry;
  readonly activeCategoryId: string | null;
  readonly currentSort: string;
  readonly storage?: UiStorageAdapter;
  readonly activeDuplicateStackGroupKey?: string | null;
}

export interface RecalculateAfterGameDeletionResult {
  readonly nextGames: GameEntry[];
  readonly survivingFocusKey: string | null;
  readonly nextDuplicateStackGroupKey: string | null;
}

export function recalculateAfterGameDeletion({
  allGames,
  deletedGame,
  activeCategoryId,
  currentSort,
  storage,
  activeDuplicateStackGroupKey = null,
}: RecalculateAfterGameDeletionOptions): RecalculateAfterGameDeletionResult {
  const key = deletedGame.gameKey || deletedGame.gameId || '';

  const parentStack = allGames.find(
    (g) =>
      Array.isArray(g.instances) &&
      g.instances.length > 1 &&
      g.instances.some(
        (inst) =>
          (inst.gameKey || inst.gameId) === key ||
          Boolean(deletedGame.folderPath && inst.folderPath === deletedGame.folderPath)
      )
  );

  let survivingFocusKey: string | null = null;
  if (parentStack && Array.isArray(parentStack.instances)) {
    const instIdx = parentStack.instances.findIndex(
      (inst) =>
        (inst.gameKey || inst.gameId) === key ||
        Boolean(deletedGame.folderPath && inst.folderPath === deletedGame.folderPath)
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
    const visibleGames = activeCategoryId
      ? allGames.filter((g) => g.categoryIds?.includes(activeCategoryId))
      : allGames;
    const customOrder =
      currentSort === 'custom'
        ? resolveCustomOrder(allGames, readStoredCustomOrder(storage))
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
  let nextDuplicateStackGroupKey: string | null = null;

  for (const entry of allGames) {
    if (Array.isArray(entry.instances) && entry.instances.length > 1) {
      const remaining = entry.instances.filter(
        (inst) =>
          (inst.gameKey || inst.gameId) !== key &&
          (!deletedGame.folderPath || inst.folderPath !== deletedGame.folderPath)
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
        if (remaining.length > 1 && activeDuplicateStackGroupKey) {
          const prevGroupKey = buildGroupKey(entry);
          const nextGroupKey = buildGroupKey(updatedEntry);
          if (
            nextGroupKey &&
            nextGroupKey !== prevGroupKey &&
            activeDuplicateStackGroupKey === prevGroupKey
          ) {
            nextDuplicateStackGroupKey = nextGroupKey;
          }
        }
        continue;
      }
    }
    const entryKey = entry.gameKey || entry.gameId || '';
    if (
      entryKey === key ||
      (deletedGame.folderPath && entry.folderPath === deletedGame.folderPath)
    ) {
      continue;
    }
    nextGames.push(entry);
  }

  return {
    nextGames,
    survivingFocusKey,
    nextDuplicateStackGroupKey,
  };
}

export function useLibraryActions({
  store,
  electronAPI,
  launcher,
  storage,
  showToast,
  launchingGameTemplate,
  openModal,
  closeModal,
  isModalOpen,
  getModalPayload,
  onTargetFocusGameKey,
}: UseLibraryActionsOptions): UseLibraryActionsResult {
  const api = electronAPI ?? (typeof window !== 'undefined' ? window.electronAPI : undefined);
  const resolvedLauncher = useMemo(
    () => launcher ?? new ElectronSaveEditorLauncher(api),
    [launcher, api]
  );

  const [isDeletingGame, setIsDeletingGame] = useState(false);
  const isDeletingGameRef = useRef(false);
  const inFlightFavoriteKeysRef = useRef<Set<string>>(new Set());

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
      const resolvedKey = game.primaryInstance?.gameKey || game.gameKey;
      const resolvedExe = game.primaryInstance?.exePath || game.exePath;
      const resolvedRunInBg = game.primaryInstance?.runInBackground ?? game.runInBackground;
      api?.launchYume?.({
        gameKey: resolvedKey,
        exePath: resolvedExe,
        runInBackground: resolvedRunInBg,
      });
      const displayName =
        game.primaryInstance?.name || game.name || game.folderName || resolvedKey;
      if (api?.launchYume && resolvedExe && displayName) {
        const template = launchingGameTemplate || 'Launching {name}...';
        showToast(template.replace('{name}', displayName));
      }
    },
    [api, launchingGameTemplate, showToast]
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
            openModal('delete-game', { game });
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
    [api, store, storage, showToast, openModal]
  );

  const handleConfirmDelete = useCallback(async () => {
    const pendingDeleteGame = getModalPayload('delete-game')?.game ?? null;
    if (!pendingDeleteGame?.folderPath || !api?.deleteGame || isDeletingGameRef.current) return;
    isDeletingGameRef.current = true;
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

      const snapshot = store.getSnapshot();
      const activeDuplicateStackGroupKey = isModalOpen('duplicate-stack')
        ? (getModalPayload('duplicate-stack')?.groupKey ?? null)
        : null;

      const { nextGames, survivingFocusKey, nextDuplicateStackGroupKey } =
        recalculateAfterGameDeletion({
          allGames: snapshot.allGames,
          deletedGame: pendingDeleteGame,
          activeCategoryId: snapshot.activeCategoryId,
          currentSort: snapshot.currentSort,
          storage,
          activeDuplicateStackGroupKey,
        });

      if (nextDuplicateStackGroupKey) {
        closeModal('delete-game');
        openModal('duplicate-stack', { groupKey: nextDuplicateStackGroupKey });
      }

      store.setAllGames(nextGames);
      onTargetFocusGameKey(survivingFocusKey ?? '__GRID_CONTAINER__');
      closeModal('delete-game');
    } catch (err) {
      console.error('[AppShell] Game deletion failed:', {
        gameKey: sanitizeUserPaths(pendingDeleteGame.gameKey || pendingDeleteGame.gameId),
        folderPath: sanitizeUserPaths(pendingDeleteGame.folderPath),
        error: sanitizeUserPaths(err instanceof Error ? err.message : String(err)),
        stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
      });
      showToast('Failed to delete game folder');
    } finally {
      isDeletingGameRef.current = false;
      setIsDeletingGame(false);
    }
  }, [
    api,
    store,
    storage,
    showToast,
    isModalOpen,
    getModalPayload,
    closeModal,
    openModal,
    onTargetFocusGameKey,
  ]);

  const handleCloseDeleteModal = useCallback(() => {
    if (isDeletingGameRef.current || isDeletingGame) return;
    const pendingDeleteGame = getModalPayload('delete-game')?.game ?? null;
    const cancelledKey = pendingDeleteGame?.gameKey || pendingDeleteGame?.gameId || null;
    closeModal('delete-game');
    if (cancelledKey) {
      onTargetFocusGameKey(cancelledKey);
    }
  }, [isDeletingGame, getModalPayload, closeModal, onTargetFocusGameKey]);

  return {
    isDeletingGame,
    handleMenuAction,
    handleToggleFavorite,
    handleFavoriteError,
    handleLaunch,
    handleOpenSaveEditor,
    handleConfirmDelete,
    handleCloseDeleteModal,
  };
}
