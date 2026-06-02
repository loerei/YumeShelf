import { ElectronAPI } from '../../shared/types/ipc';
import { GameEntry } from '../state/types';

export interface BindIpcEventsOptions {
    electronAPI: ElectronAPI;
    bootController: any;
    updateNotificationFeature: any;
    getAllGames: () => GameEntry[];
    getCurrentSort: () => string;
    setAllGames: (games: GameEntry[], config?: any) => void;
    setRunningFlag: (gameKey: string, isRunning: boolean) => void;
    sortGames: (sortType: string) => void;
}

export function bindIpcEvents({
    electronAPI,
    bootController,
    updateNotificationFeature,
    getAllGames,
    getCurrentSort,
    setAllGames,
    setRunningFlag,
    sortGames
}: BindIpcEventsOptions) {
    electronAPI.on('boot-status', (payload) => {
        bootController.show(payload);
    });

    electronAPI.on('game-stopped', async (payload) => {
        console.log('[FRONTEND] Received \'game-stopped\' event for gameKey:', payload ? payload.gameKey : 'unknown');
        if (payload && payload.gameKey) {
            setRunningFlag(payload.gameKey, false);
            console.log(`[FRONTEND] Set target.isRunning=false synchronously for ${payload.gameKey}`);
        }
        console.log('[FRONTEND] Fetching games from backend via getGames()');
        const games = await electronAPI.invoke('get-games');
        console.log(`[FRONTEND] Received ${games.length} games from backend`);
        setAllGames(games);
        console.log('[FRONTEND] Re-sorting grid cards');
        sortGames(getCurrentSort());
    });

    electronAPI.on('game-playtime-updated', async (payload) => {
        console.log('[FRONTEND] Received \'game-playtime-updated\' event for gameKey:', payload ? payload.gameKey : 'unknown');
        const games = await electronAPI.invoke('get-games');
        console.log(`[FRONTEND] Fetched ${games.length} games after game-playtime-updated.`);
        setAllGames(games);
        sortGames(getCurrentSort());
    });

    electronAPI.on('translation-status', (payload: any) => {
        const isBlocking = ['preparing', 'downloading', 'extracting-binaries'].includes(payload.status);
        
        if (isBlocking) {
            const messageMap: Record<string, string> = {
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
                    
                    const dismissBtn = card.querySelector('#translation-dismiss-btn') as HTMLElement | null;
                    if (dismissBtn) {
                        dismissBtn.onclick = () => {
                            if (card) card.style.display = 'none';
                        };
                    }
                }
            }

            if (card) {
                card.style.display = 'flex';
                const titleEl = card.querySelector('#translation-title') as HTMLElement | null;
                const messageEl = card.querySelector('#translation-message') as HTMLElement | null;
                const fillEl = card.querySelector('#translation-progress-fill') as HTMLElement | null;
                const cancelBtn = card.querySelector('#translation-cancel-btn') as HTMLButtonElement | null;
                const queueSection = card.querySelector('#translation-queue-section') as HTMLElement | null;
                const queueItems = card.querySelector('#translation-queue-items') as HTMLElement | null;

                if (cancelBtn) {
                    if (['sync-extracting', 'syncing', 'sync-queued'].includes(payload.status)) {
                        cancelBtn.style.display = 'block';
                        cancelBtn.onclick = async () => {
                            if (payload.gameKey) {
                                cancelBtn.disabled = true;
                                cancelBtn.textContent = 'Cancelling...';
                                await electronAPI.invoke('translation:cancel-sync', payload.gameKey);
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
                        payload.queue.forEach((item: any) => {
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
                            const upBtn = row.querySelector('.queue-btn-up') as HTMLElement | null;
                            if (upBtn) {
                                upBtn.onclick = async (e) => {
                                    e.stopPropagation();
                                    await electronAPI.invoke('translation:move-queue', { gameKey: item.gameKey, direction: 'up' });
                                };
                            }

                            // Wire Down button click
                            const downBtn = row.querySelector('.queue-btn-down') as HTMLElement | null;
                            if (downBtn) {
                                downBtn.onclick = async (e) => {
                                    e.stopPropagation();
                                    await electronAPI.invoke('translation:move-queue', { gameKey: item.gameKey, direction: 'down' });
                                };
                            }

                            // Wire Remove button click
                            const removeBtn = row.querySelector('.queue-btn-remove') as HTMLElement | null;
                            if (removeBtn) {
                                removeBtn.onclick = async (e) => {
                                    e.stopPropagation();
                                    await electronAPI.invoke('translation:cancel-sync', item.gameKey);
                                };
                            }

                            queueItems.appendChild(row);
                        });
                    } else {
                        queueSection.style.display = 'none';
                    }
                }

                if (titleEl && messageEl && fillEl) {
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
                            if (card) card.style.display = 'none';
                        }, 5000);
                    } else if (payload.status === 'sync-cancelled') {
                        titleEl.textContent = 'Sync Cancelled';
                        messageEl.textContent = 'Translation sync job was cancelled.';
                        fillEl.style.width = '0%';
                        setTimeout(() => {
                            if (card) card.style.display = 'none';
                        }, 3000);
                    } else if (payload.status === 'sync-error') {
                        titleEl.textContent = 'Sync Error';
                        messageEl.textContent = 'An error occurred during translation sync.';
                        fillEl.style.width = '0%';
                    }
                }
            }
        }
    });
}
