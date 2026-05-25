// @ts-nocheck
export function bindIpcEvents({
    electronAPI,
    bootController,
    updateNotificationFeature,
    getAllGames,
    getCurrentSort,
    setAllGames,
    setRunningFlag,
    sortGames
}) {
    electronAPI.onBootStatus((payload) => {
        bootController.show(payload);
    });

    electronAPI.onGameStopped(async (payload) => {
        console.log('[FRONTEND] Received \'game-stopped\' event for gameKey:', payload ? payload.gameKey : 'unknown');
        if (payload && payload.gameKey) {
            setRunningFlag(payload.gameKey, false);
            console.log(`[FRONTEND] Set target.isRunning=false synchronously for ${payload.gameKey}`);
        }
        console.log('[FRONTEND] Fetching games from backend via getGames()');
        const games = await electronAPI.getGames();
        console.log(`[FRONTEND] Received ${games.length} games from backend`);
        setAllGames(games);
        console.log('[FRONTEND] Re-sorting grid cards');
        sortGames(getCurrentSort());
    });

    electronAPI.onGamePlaytimeUpdated(async (payload) => {
        console.log('[FRONTEND] Received \'game-playtime-updated\' event for gameKey:', payload ? payload.gameKey : 'unknown');
        const games = await electronAPI.getGames();
        console.log(`[FRONTEND] Fetched ${games.length} games after game-playtime-updated.`);
        setAllGames(games);
        sortGames(getCurrentSort());
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
    });
}
