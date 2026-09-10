// @ts-nocheck
import { formatPlaytime, timeSince } from '../utils/formatting';
import { getGameKey } from '../library-order';

function escapeCssSelector(value) {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
        return CSS.escape(value);
    }
    return String(value || '').replace(/([ #;?%&,.+*~':"!^$[\]()=>|/@])/g, String.raw`\$1`);
}

export function bindIpcEvents({
    electronAPI,
    bootController,
    updateNotificationFeature,
    getAllGames,
    getCurrentSort,
    setAllGames,
    setRunningFlag,
    sortGames,
    documentRef = typeof document !== 'undefined' ? document : null,
    getStrings
}) {
    electronAPI.onBootStatus((payload) => {
        bootController.show(payload);
    });

    electronAPI.onGameStopped(async (payload) => {
        console.log('[FRONTEND] Received \'game-stopped\' event for gameKey:', payload ? payload.gameKey : 'unknown');
        const gameKey = payload?.gameKey;
        if (gameKey) {
            if (typeof setRunningFlag === 'function') {
                setRunningFlag(gameKey, false);
            }
            console.log(`[FRONTEND] Set target.isRunning=false synchronously for ${gameKey}`);
        }

        const allGames = typeof getAllGames === 'function' ? (getAllGames() || []) : [];
        const target = allGames.find((game) => (
            game.gameId === gameKey
            || game.gameKey === gameKey
            || (Array.isArray(game.instances) && game.instances.some((instance) => (
                instance.gameId === gameKey
                || instance.gameKey === gameKey
            )))
        ));

        const now = Date.now();
        if (target) {
            delete target._sessionBasePlaytime;
            target.isRunning = false;
            target.lastPlayed = now;

            if (Array.isArray(target.instances)) {
                for (const instance of target.instances) {
                    if (instance.gameId === gameKey || instance.gameKey === gameKey) {
                        delete instance._sessionBasePlaytime;
                        instance.isRunning = false;
                        instance.lastPlayed = now;
                    }
                }
                target.isRunning = target.instances.some((inst) => inst.isRunning);
            }
        }

        // Fast synchronous DOM update (<100ms) before async library reload
        if (documentRef && target) {
            const recentStatusText = timeSince(target.lastPlayed, getStrings);

            const candidateKeys = new Set([
                typeof getGameKey === 'function' ? getGameKey(target) : null,
                target.gameId,
                target.gameKey,
                gameKey
            ].filter(Boolean));
            if (candidateKeys.size > 0) {
                const gridSelector = Array.from(candidateKeys)
                    .map((key) => `.game-card[data-game-key="${escapeCssSelector(key)}"]:not(.stack-overlay-card)`)
                    .join(', ');
                const gridCards = documentRef.querySelectorAll(gridSelector);
                gridCards.forEach((card) => {
                    const statusEl = card.querySelector('.game-status');
                    if (statusEl) statusEl.textContent = recentStatusText;
                });
            }

            const instanceCandidateKeys = new Set([
                gameKey,
                ...(Array.isArray(target.instances) ? target.instances.flatMap((i) => [i.gameKey, i.gameId, i.instanceId]) : [])
            ].filter(Boolean));
            if (instanceCandidateKeys.size > 0) {
                const overlaySelector = Array.from(instanceCandidateKeys)
                    .map((key) => `.stack-overlay-card[data-game-key="${escapeCssSelector(key)}"]`)
                    .join(', ');
                const overlayCards = documentRef.querySelectorAll(overlaySelector);
                overlayCards.forEach((card) => {
                    const statusEl = card.querySelector('.game-status');
                    if (statusEl) statusEl.textContent = recentStatusText;
                });
            }
        }

        try {
            console.log('[FRONTEND] Fetching games from backend via getGames()');
            const games = await electronAPI.getGames();
            console.log(`[FRONTEND] Received ${games.length} games from backend`);
            if (typeof setAllGames === 'function') {
                setAllGames(games);
            }
            console.log('[FRONTEND] Re-sorting grid cards');
            if (typeof sortGames === 'function') {
                sortGames(typeof getCurrentSort === 'function' ? getCurrentSort() : undefined);
            }
        } catch (error) {
            console.warn('[FRONTEND] Failed to reload games after game-stopped:', error);
        }
    });

    electronAPI.onGamePlaytimeUpdated(async (payload) => {
        console.log('[FRONTEND] Received \'game-playtime-updated\' event for gameKey:', payload ? payload.gameKey : 'unknown');
        const gameKey = payload?.gameKey;
        if (!gameKey) return;
        const rawAccrued = payload?.accruedMs;
        const safeAccruedMs = Number.isFinite(rawAccrued) ? Math.max(0, rawAccrued) : 0;

        const allGames = typeof getAllGames === 'function' ? (getAllGames() || []) : [];
        const target = allGames.find((game) => (
            game.gameId === gameKey
            || game.gameKey === gameKey
            || (Array.isArray(game.instances) && game.instances.some((instance) => (
                instance.gameId === gameKey
                || instance.gameKey === gameKey
            )))
        ));

        if (!target) {
            console.warn('[FRONTEND] Game not found for playtime update:', gameKey);
            return;
        }

        // Calibrate session baseline before setting running flag
        if (target._sessionBasePlaytime === undefined) {
            target._sessionBasePlaytime = target.basePlaytime ?? (target.isRunning ? Math.max(0, (target.playtime || 0) - safeAccruedMs) : (target.playtime || 0));
        }
        target.playtime = target._sessionBasePlaytime + safeAccruedMs;

        let activeChildInstance = null;
        if (Array.isArray(target.instances)) {
            for (const instance of target.instances) {
                if (instance.gameId === gameKey || instance.gameKey === gameKey) {
                    if (instance._sessionBasePlaytime === undefined) {
                        instance._sessionBasePlaytime = instance.basePlaytime ?? (instance.isRunning ? Math.max(0, (instance.playtime || 0) - safeAccruedMs) : (instance.playtime || 0));
                    }
                    instance.playtime = instance._sessionBasePlaytime + safeAccruedMs;
                    instance.isRunning = true;
                    activeChildInstance = instance;
                }
            }
        }

        if (typeof setRunningFlag === 'function') {
            setRunningFlag(gameKey, true);
        } else {
            target.isRunning = true;
        }

        // DOM update
        if (documentRef) {
            const strings = typeof getStrings === 'function' ? getStrings() : {};
            const playingText = strings?.status_playing || 'Playing';

            // 1. Representative cards in library grid
            const candidateKeys = new Set([
                typeof getGameKey === 'function' ? getGameKey(target) : null,
                target.gameId,
                target.gameKey,
                gameKey
            ].filter(Boolean));
            if (candidateKeys.size > 0) {
                const gridSelector = Array.from(candidateKeys)
                    .map((key) => `.game-card[data-game-key="${escapeCssSelector(key)}"]:not(.stack-overlay-card)`)
                    .join(', ');
                const gridCards = documentRef.querySelectorAll(gridSelector);
                gridCards.forEach((card) => {
                    const playtimeEl = card.querySelector('.game-playtime');
                    if (playtimeEl) playtimeEl.textContent = formatPlaytime(target.playtime);
                    const statusEl = card.querySelector('.game-status');
                    if (statusEl) statusEl.textContent = playingText;
                });
            }

            // 2. Child instance cards in an open duplicate stack overlay modal
            const instanceCandidateKeys = new Set([
                gameKey,
                activeChildInstance?.gameKey,
                activeChildInstance?.gameId,
                activeChildInstance?.instanceId
            ].filter(Boolean));
            if (instanceCandidateKeys.size > 0) {
                const overlaySelector = Array.from(instanceCandidateKeys)
                    .map((key) => `.stack-overlay-card[data-game-key="${escapeCssSelector(key)}"]`)
                    .join(', ');
                const overlayCards = documentRef.querySelectorAll(overlaySelector);
                overlayCards.forEach((card) => {
                    const playtimeEl = card.querySelector('.game-playtime');
                    const instancePlaytime = activeChildInstance ? activeChildInstance.playtime : target.playtime;
                    if (playtimeEl) playtimeEl.textContent = formatPlaytime(instancePlaytime);
                    const statusEl = card.querySelector('.game-status');
                    if (statusEl) statusEl.textContent = playingText;
                });
            }
        }
    });

    electronAPI.onTranslationStatus((payload) => {
        const isBlocking = ['preparing', 'downloading', 'extracting-binaries'].includes(payload.status);
        
        if (isBlocking) {
            const messageMap = {
                'preparing': 'Preparing Auto-Translator...',
                'downloading': `Downloading Translator (${Math.round((payload.progress || 0) * 100)}%)...`,
                'extracting-binaries': 'Extracting Translator binaries...'
            };

            bootController.show({
                key: null,
                fallbackText: messageMap[payload.status] || 'Setting up translation...',
                showProgress: true,
                progress: payload.progress,
                mode: 'startup'
            });
            return;
        }

        // Hide blocking screen when ready or finished
        if (payload.status === 'ready' || payload.status === 'error') {
            setTimeout(() => bootController.hide(), 800);
        }

        // Handle Background AOT translation toast
        if (['sync-extracting', 'syncing', 'synced', 'sync-error', 'sync-cancelled', 'sync-queued'].includes(payload.status)) {
            let card = document.getElementById('translation-progress-card');
            if (!card) {
                const host = document.getElementById('update-notification-host');
                if (host) {
                    card = document.createElement('div');
                    card.id = 'translation-progress-card';
                    card.className = 'update-notification-card';
                    card.style.display = 'none';
                    card.style.pointerEvents = 'auto';
                    card.innerHTML = `
                        <button class="update-notification-dismiss" id="translation-dismiss-btn" aria-label="Dismiss translation progress">×</button>
                        <div class="update-notification-eyebrow" style="color: var(--accent);">Translation Sync</div>
                        <h2 class="update-notification-title" id="translation-title">Syncing Game Text...</h2>
                        <div id="translation-progress-container" style="margin: 5px 0;">
                            <div class="loading-progress-track" style="height: 6px; background: rgba(255,255,255,0.05); border-radius: 3px; overflow: hidden; position: relative;">
                                <div class="loading-progress-bar" id="translation-progress-fill" style="position: absolute; inset: 0 auto 0 0; width: 0%; height: 100%; background: var(--accent); transition: width 0.3s ease; animation: none;"></div>
                            </div>
                        </div>
                        <p class="update-notification-message" id="translation-message">Preparing extraction...</p>
                        <button id="translation-cancel-btn" class="update-notification-action" style="margin-top: 8px; width: 100%; display: none; background: rgba(255, 95, 86, 0.1); color: #ff5f56; border: 1px solid rgba(255, 95, 86, 0.2); border-radius: 4px; padding: 4px 8px; cursor: pointer; font-size: 11px; font-weight: 500; transition: background 0.2s ease;">Cancel Sync</button>
                        
                        <div id="translation-queue-section" style="margin-top: 8px; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 8px; display: none; flex-direction: column; gap: 4px; pointer-events: auto;">
                            <div style="font-size: 9px; font-weight: 600; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px;">Pending Queue</div>
                            <div id="translation-queue-items" style="display: flex; flex-direction: column; gap: 4px; max-height: 120px; overflow-y: auto; padding-right: 2px;"></div>
                        </div>
                    `;
                    host.appendChild(card);
                    card.querySelector('#translation-dismiss-btn').onclick = () => {
                        card.style.display = 'none';
                    };
                }
            }

            if (card) {
                card.style.display = 'flex';
                const titleEl = card.querySelector('#translation-title');
                const messageEl = card.querySelector('#translation-message');
                const fillEl = card.querySelector('#translation-progress-fill');
                const cancelBtn = card.querySelector('#translation-cancel-btn');
                const queueSection = card.querySelector('#translation-queue-section');
                const queueItems = card.querySelector('#translation-queue-items');

                if (cancelBtn) {
                    if (['sync-extracting', 'syncing', 'sync-queued'].includes(payload.status)) {
                        cancelBtn.style.display = 'block';
                        cancelBtn.onclick = async () => {
                            if (payload.gameKey) {
                                cancelBtn.disabled = true;
                                cancelBtn.textContent = 'Cancelling...';
                                await electronAPI.cancelTranslationSync(payload.gameKey);
                            }
                        };
                    } else {
                        cancelBtn.style.display = 'none';
                    }
                }

                // Render pending queue list
                if (queueSection && queueItems) {
                    if (payload.queue && payload.queue.length > 0) {
                        queueSection.style.display = 'flex';
                        queueItems.innerHTML = '';
                        payload.queue.forEach((item, index) => {
                            const row = document.createElement('div');
                            row.style.cssText = 'display: flex; align-items: center; justify-content: space-between; background: rgba(255,255,255,0.03); border-radius: 4px; padding: 4px 6px; font-size: 11px; color: rgba(255,255,255,0.8); border: 1px solid rgba(255,255,255,0.02);';
                            row.innerHTML = `
                                <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 140px; font-weight: 500;">${item.gameName || 'Game'}</span>
                                <div style="display: flex; align-items: center; gap: 2px;">
                                    <button class="queue-btn-up" style="background: none; border: none; color: rgba(255,255,255,0.4); font-size: 10px; padding: 2px 4px; cursor: pointer; transition: color 0.2s;" title="Move Up">↑</button>
                                    <button class="queue-btn-down" style="background: none; border: none; color: rgba(255,255,255,0.4); font-size: 10px; padding: 2px 4px; cursor: pointer; transition: color 0.2s;" title="Move Down">↓</button>
                                    <button class="queue-btn-remove" style="background: none; border: none; color: #ff5f56; font-size: 10px; padding: 2px 4px; cursor: pointer; font-weight: bold; margin-left: 2px;" title="Remove">×</button>
                                </div>
                            `;
                            
                            // Wire Up button click
                            row.querySelector('.queue-btn-up').onclick = async (e) => {
                                e.stopPropagation();
                                await electronAPI.moveTranslationQueue({ gameKey: item.gameKey, direction: 'up' });
                            };

                            // Wire Down button click
                            row.querySelector('.queue-btn-down').onclick = async (e) => {
                                e.stopPropagation();
                                await electronAPI.moveTranslationQueue({ gameKey: item.gameKey, direction: 'down' });
                            };

                            // Wire Remove button click
                            row.querySelector('.queue-btn-remove').onclick = async (e) => {
                                e.stopPropagation();
                                await electronAPI.cancelTranslationSync(item.gameKey);
                            };

                            queueItems.appendChild(row);
                        });
                    } else {
                        queueSection.style.display = 'none';
                    }
                }

                if (payload.status === 'sync-queued') {
                    titleEl.textContent = 'Sync Queued';
                    messageEl.textContent = `Waiting in queue (Position: ${payload.queuePosition || 1})...`;
                    fillEl.style.width = '0%';
                } else if (payload.status === 'sync-extracting') {
                    titleEl.textContent = payload.activeJobName ? `Extracting: ${payload.activeJobName}` : 'Syncing Translation';
                    messageEl.textContent = 'Scanning database and maps for strings...';
                    fillEl.style.width = '0%';
                } else if (payload.status === 'syncing') {
                    titleEl.textContent = payload.activeJobName ? `Syncing: ${payload.activeJobName}` : 'Syncing Translation';
                    if (payload.translated !== undefined && payload.total !== undefined) {
                        messageEl.textContent = `Translating strings: ${payload.translated} / ${payload.total}`;
                    } else {
                        messageEl.textContent = `Translating and caching game text to local database...`;
                    }
                    fillEl.style.width = `${(payload.progress || 0) * 100}%`;
                } else if (payload.status === 'synced') {
                    titleEl.textContent = payload.activeJobName ? `Synced: ${payload.activeJobName}!` : 'Translation Synced!';
                    messageEl.textContent = 'All dialogue and UI components are fully translated locally.';
                    fillEl.style.width = '100%';
                    setTimeout(() => {
                        card.style.display = 'none';
                    }, 5000);
                } else if (payload.status === 'sync-cancelled') {
                    titleEl.textContent = 'Sync Cancelled';
                    messageEl.textContent = 'Translation sync job was cancelled.';
                    fillEl.style.width = '0%';
                    setTimeout(() => {
                        card.style.display = 'none';
                    }, 3000);
                } else if (payload.status === 'sync-error') {
                    titleEl.textContent = 'Sync Error';
                    messageEl.textContent = 'An error occurred during translation sync.';
                    fillEl.style.width = '0%';
                }
            }
        }
    });
}
