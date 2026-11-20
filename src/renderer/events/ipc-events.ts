import type { ObservableUiRuntimeStore } from '../state/ui-runtime-state';
import type { GameEntry } from '../types/game';
import type { ElectronAPI } from '../../shared/types/ipc';
import { annotateGamesForDisplay } from '../game-annotations';
import { sanitizeUserPaths } from '../../shared/path-sanitizer';

export interface IpcBindingLegacyOptions {
  bootController?: { show(payload?: unknown): void; hide(): void; render?(payload?: unknown): void };
  setAllGames?: (games: readonly GameEntry[]) => void;
  sortGames?: (type?: string) => void;
  setRunningFlag?: (gameKey: string, isRunning: boolean) => void;
  updateNotificationFeature?: unknown;
}

export function bindIpcEvents(
  store: ObservableUiRuntimeStore,
  legacyOptions?: IpcBindingLegacyOptions,
  electronAPI: ElectronAPI = typeof window !== 'undefined' ? window.electronAPI : (undefined as unknown as ElectronAPI)
): () => void {
  let isDisposed = false;
  let latestReconciliationSeq = 0;
  const unsubscribes: Array<() => void> = [];

  let hideTimeout: ReturnType<typeof setTimeout> | null = null;

  if (typeof electronAPI?.onBootStatus === 'function') {
    unsubscribes.push(
      electronAPI.onBootStatus((payload) => {
        if (isDisposed) return;
        legacyOptions?.bootController?.show(payload);
      })
    );
  }

  if (typeof electronAPI?.onTranslationStatus === 'function') {
    unsubscribes.push(
      electronAPI.onTranslationStatus((payload: unknown) => {
        if (isDisposed || !payload || typeof payload !== 'object') return;
        const raw = payload as { status?: string; progress?: number };
        const status = typeof raw.status === 'string' ? raw.status : '';
        const rawProgress = raw.progress;
        const progress =
          typeof rawProgress === 'number' && Number.isFinite(rawProgress)
            ? Math.max(0, Math.min(1, rawProgress))
            : 0;

        const isBlocking = ['preparing', 'downloading', 'extracting-binaries'].includes(status);
        if (isBlocking) {
          if (hideTimeout !== null) {
            clearTimeout(hideTimeout);
            hideTimeout = null;
          }
          const messageMap: Record<string, string> = {
            preparing: 'Preparing Auto-Translator...',
            downloading: `Downloading Translator (${Math.round(progress * 100)}%)...`,
            'extracting-binaries': 'Extracting Translator binaries...',
          };
          legacyOptions?.bootController?.show({
            key: null,
            fallbackText: messageMap[status] || 'Setting up translation...',
            showProgress: true,
            progress,
            mode: 'startup',
          });
          return;
        }

        if (status === 'ready' || status === 'error') {
          if (hideTimeout !== null) {
            clearTimeout(hideTimeout);
          }
          hideTimeout = setTimeout(() => {
            if (isDisposed) return;
            legacyOptions?.bootController?.hide();
            hideTimeout = null;
          }, 800);
        }
      })
    );
  }

  if (typeof electronAPI?.onGamePlaytimeUpdated === 'function') {
    unsubscribes.push(
      electronAPI.onGamePlaytimeUpdated((payload: { gameKey?: string; accruedMs?: number } | null | undefined) => {
        if (isDisposed) return;
        const gameKey = typeof payload?.gameKey === 'string' ? payload.gameKey.trim() : null;
        const rawAccrued = payload?.accruedMs;
        const accruedMs = typeof rawAccrued === 'number' && Number.isFinite(rawAccrued) ? Math.max(0, rawAccrued) : 0;
        if (gameKey) {
          store.updateGamePlaytime(gameKey, accruedMs);
          legacyOptions?.setRunningFlag?.(gameKey, true);
        }
      })
    );
  }

  if (typeof electronAPI?.onGameStopped === 'function') {
    unsubscribes.push(
      electronAPI.onGameStopped(async (payload: { gameKey?: string } | null | undefined) => {
        if (isDisposed) return;
        const gameKey = typeof payload?.gameKey === 'string' ? payload.gameKey.trim() : null;
        if (gameKey) {
          store.setGameRunning(gameKey, false);
          legacyOptions?.setRunningFlag?.(gameKey, false);
        }

        const currentSeq = ++latestReconciliationSeq;
        try {
          const games = await electronAPI.getGames();
          if (isDisposed || currentSeq !== latestReconciliationSeq) return;
          const { currentLibraryConfig, locationDisplayMode } = store.getSnapshot();
          const annotated = annotateGamesForDisplay(games, currentLibraryConfig ?? '', locationDisplayMode);
          store.setAllGames(annotated);
          legacyOptions?.setAllGames?.(annotated);
          legacyOptions?.sortGames?.();
        } catch (err) {
          console.error('[IpcEvents] Failed to reconcile games on stop:', {
            gameKey: sanitizeUserPaths(gameKey),
            error: sanitizeUserPaths(err instanceof Error ? err.message : String(err)),
            stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
          });
        }
      })
    );
  }

  return () => {
    isDisposed = true;
    if (hideTimeout !== null) {
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }
    unsubscribes.forEach((unsub) => {
      try {
        if (typeof unsub === 'function') {
          unsub();
        }
      } catch (err) {
        console.warn('[IpcDispatcher] Unsubscribe failed during teardown:', {
          error: sanitizeUserPaths(err instanceof Error ? err.message : err),
          stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
        });
      }
    });
    unsubscribes.length = 0;
  };
}
