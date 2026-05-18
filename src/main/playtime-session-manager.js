const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const {
    SESSION_SCHEMA_VERSION,
    isActiveJournal,
    readSessionJournal,
    writeSessionJournal,
    removeSessionJournal,
    aggregateActiveGameState,
    delay
} = require('./playtime-session-manager/journal');

const {
    isPidAlive,
    spawnHelper,
    injectRunInBackgroundDll
} = require('./playtime-session-manager/injector');

const SESSION_REFRESH_INTERVAL_MS = 5000;
const SESSION_ATTACH_RETRY_GRACE_MS = 15000;

function createPlaytimeSessionManager({
    app,
    BrowserWindow,
    dbFilePath,
    libraryState
}) {
    const sessionsDir = path.join(app.getPath('userData'), 'playtime-sessions');
    const helperLogPath = path.join(app.getPath('userData'), 'playtime-helper.log');
    let refreshTimer = null;
    let currentJournals = [];
    let currentGameState = new Map();
    const pendingAttachRetries = new Map();

    function log(message) {
        console.log(`[PLAYTIME][SESSIONS] ${message}`);
    }

    async function ensureSessionInfrastructure() {
        await fs.mkdir(sessionsDir, { recursive: true });
    }

    function getSessionJournalPath(sessionId) {
        return path.join(sessionsDir, `${sessionId}.json`);
    }

    async function listSessionJournalPaths() {
        await ensureSessionInfrastructure();
        const entries = await fs.readdir(sessionsDir, { withFileTypes: true });
        return entries
            .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
            .map((entry) => path.join(sessionsDir, entry.name));
    }

    async function loadAllSessionJournals() {
        const journalPaths = await listSessionJournalPaths();
        const journals = [];
        for (const filePath of journalPaths) {
            try {
                journals.push(await readSessionJournal(filePath));
            } catch (error) {
                console.error(`[PLAYTIME][SESSIONS] Failed to read session journal ${filePath}:`, error);
            }
        }
        return journals;
    }

    async function finalizeStaleJournal(journal, reason = 'stale-session-finalized') {
        const endedAt = journal.lastHeartbeatAt || journal.startedAt || Date.now();
        log(`finalizing stale session gameKey=${journal.gameKey} sessionId=${journal.sessionId} accruedMs=${journal.accruedMs} endedAt=${endedAt} reason=${reason}`);
        await libraryState.finalizeTrackedSession(journal.gameKey, journal.accruedMs, endedAt, journal.exePath);
        await removeSessionJournal(journal.filePath);
    }

    function shouldRetryAttach(sessionId) {
        const now = Date.now();
        const lastAttempt = pendingAttachRetries.get(sessionId) || 0;
        if ((now - lastAttempt) < SESSION_ATTACH_RETRY_GRACE_MS) {
            return false;
        }
        pendingAttachRetries.set(sessionId, now);
        return true;
    }

    async function recoverJournal(journal) {
        if (journal.status === 'completed') {
            await removeSessionJournal(journal.filePath);
            return { changed: true };
        }

        if (journal.status === 'failed') {
            if ((journal.accruedMs || 0) > 0) {
                await finalizeStaleJournal(journal, journal.failureReason || 'failed-session-finalized');
            } else {
                await removeSessionJournal(journal.filePath);
            }
            return { changed: true };
        }

        const helperAlive = isPidAlive(journal.helperPid);
        const rootAlive = isPidAlive(journal.rootPid);
        if (helperAlive && isActiveJournal(journal)) {
            return { changed: false };
        }

        if (!helperAlive && rootAlive) {
            if (shouldRetryAttach(journal.sessionId)) {
                log(`helper missing for sessionId=${journal.sessionId}; spawning attach helper for rootPid=${journal.rootPid}`);
                spawnHelper({ app, dbFilePath, helperLogPath, log }, 'attach', journal.filePath);
                return { changed: true };
            }
            return { changed: false };
        }

        if (!helperAlive && !rootAlive) {
            await finalizeStaleJournal(journal, 'helper-and-root-missing');
            return { changed: true };
        }

        return { changed: false };
    }

    function emitSessionEvents(nextGameState) {
        const affectedGameKeys = new Set([
            ...currentGameState.keys(),
            ...nextGameState.keys()
        ]);

        affectedGameKeys.forEach((gameKey) => {
            const previous = currentGameState.get(gameKey) || { active: false, accruedMs: 0 };
            const next = nextGameState.get(gameKey) || { active: false, accruedMs: 0 };
            if (previous.active && !next.active) {
                BrowserWindow.getAllWindows().forEach((windowRef) => {
                    if (!windowRef || windowRef.isDestroyed()) return;
                    windowRef.webContents.send('game-stopped', { gameKey });
                });
                return;
            }

            if (next.active && (!previous.active || previous.accruedMs !== next.accruedMs || previous.sessionIds?.length !== next.sessionIds?.length)) {
                BrowserWindow.getAllWindows().forEach((windowRef) => {
                    if (!windowRef || windowRef.isDestroyed()) return;
                    windowRef.webContents.send('game-playtime-updated', { gameKey });
                });
            }
        });
    }

    async function refreshSessions({ recover = false, emit = true } = {}) {
        await ensureSessionInfrastructure();
        let journals = await loadAllSessionJournals();

        if (recover) {
            let changed = false;
            for (const journal of journals) {
                const result = await recoverJournal(journal);
                changed = changed || !!result.changed;
            }
            if (changed) {
                journals = await loadAllSessionJournals();
            }
        }

        const nextGameState = aggregateActiveGameState(journals);
        if (emit) {
            emitSessionEvents(nextGameState);
        }
        currentJournals = journals;
        currentGameState = nextGameState;
        return journals;
    }

    async function initialize() {
        await refreshSessions({ recover: true, emit: false });
        if (!refreshTimer) {
            refreshTimer = setInterval(() => {
                refreshSessions({ recover: true, emit: true }).catch((error) => {
                    console.error('[PLAYTIME][SESSIONS] periodic refresh failed:', error);
                });
            }, SESSION_REFRESH_INTERVAL_MS);
        }
    }

    async function launchTrackedGame(gameKey, exePath, runInBackground = false) {
        if (!refreshTimer) {
            await initialize();
        }
        const sessionId = crypto.randomUUID();
        const journalPath = getSessionJournalPath(sessionId);
        const now = Date.now();
        const initialJournal = {
            schemaVersion: SESSION_SCHEMA_VERSION,
            sessionId,
            gameKey,
            exePath,
            cwd: path.dirname(exePath),
            mode: 'launch',
            helperPid: 0,
            rootPid: 0,
            startedAt: now,
            lastHeartbeatAt: now,
            accruedMs: 0,
            status: 'launching'
        };

        await ensureSessionInfrastructure();
        await writeSessionJournal(journalPath, initialJournal);
        try {
            const helperPid = spawnHelper({ app, dbFilePath, helperLogPath, log }, 'launch', journalPath);
            if (helperPid > 0) {
                await writeSessionJournal(journalPath, {
                    ...initialJournal,
                    helperPid
                });
                
                if (runInBackground) {
                    injectRunInBackgroundDll({ app, log, readSessionJournal, delay }, journalPath).catch(err => {
                        console.error('[PLAYTIME][SESSIONS] Failed to inject background DLL:', err);
                    });
                }
            }
        } catch (error) {
            await writeSessionJournal(journalPath, {
                ...initialJournal,
                status: 'failed',
                failureReason: String((error && error.message) || error || 'failed-to-spawn-helper')
            });
            throw error;
        }

        await refreshSessions({ recover: false, emit: true });
        return sessionId;
    }

    function overlayGames(games) {
        return games.map((game) => {
            const instanceGameIds = Array.isArray(game.instances) && game.instances.length > 0
                ? game.instances.map((instance) => instance.gameId)
                : [game.gameId || game.gameKey];
            const runtimes = instanceGameIds
                .map((gameId) => currentGameState.get(gameId))
                .filter(Boolean);
            const accruedMs = runtimes.reduce((sum, runtime) => sum + Math.max(0, runtime.accruedMs || 0), 0);
            const isRunning = runtimes.some((runtime) => runtime.active);
            if (!isRunning) {
                return {
                    ...game,
                    isRunning: false
                };
            }
            return {
                ...game,
                isRunning: true,
                playtime: (game.playtime || 0) + accruedMs
            };
        });
    }

    function getRuntimeSnapshot() {
        return {
            journals: currentJournals.map((journal) => ({ ...journal })),
            gameState: [...currentGameState.entries()].map(([gameKey, state]) => ({
                gameKey,
                ...state
            }))
        };
    }

    return {
        initialize,
        launchTrackedGame,
        overlayGames,
        refreshSessions,
        getRuntimeSnapshot
    };
}

module.exports = {
    SESSION_SCHEMA_VERSION,
    createPlaytimeSessionManager
};
