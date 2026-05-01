export function bindIpcEvents({
    electronAPI,
    bootController,
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
}
