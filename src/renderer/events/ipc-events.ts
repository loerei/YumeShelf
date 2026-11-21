import type { ObservableUiRuntimeStore } from '../state/ui-runtime-state';
import type { ElectronAPI } from '../../shared/types/ipc';
import { annotateGamesForDisplay } from '../game-annotations';
import { sanitizeUserPaths } from '../../shared/path-sanitizer';

export function bindIpcEvents(
  store: ObservableUiRuntimeStore,
  electronAPI: ElectronAPI = typeof window !== 'undefined' ? window.electronAPI : (undefined as any)
): () => void {
  let isDisposed = false;
  let latestReconciliationSeq = 0;
  const unsubscribes: Array<() => void> = [];

  if (typeof electronAPI?.onGamePlaytimeUpdated === 'function') {
    unsubscribes.push(
      electronAPI.onGamePlaytimeUpdated((payload: { gameKey?: string; accruedMs?: number } | null | undefined) => {
        if (isDisposed) return;
        const gameKey = typeof payload?.gameKey === 'string' ? payload.gameKey.trim() : null;
        const rawAccrued = payload?.accruedMs;
        const accruedMs = typeof rawAccrued === 'number' && Number.isFinite(rawAccrued) ? Math.max(0, rawAccrued) : 0;
        if (gameKey) {
          store.updateGamePlaytime(gameKey, accruedMs);
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
        }

        const currentSeq = ++latestReconciliationSeq;
        try {
          const games = await electronAPI.getGames();
          if (isDisposed || currentSeq !== latestReconciliationSeq) return;
          const { currentLibraryConfig, locationDisplayMode } = store.getSnapshot();
          const annotated = annotateGamesForDisplay(games, currentLibraryConfig ?? '', locationDisplayMode);
          store.setAllGames(annotated);
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
