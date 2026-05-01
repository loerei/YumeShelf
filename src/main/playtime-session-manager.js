const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { assertPlaytimeHelperExists, resolvePlaytimeHelperPath } = require('./playtime-helper-paths');

const SESSION_SCHEMA_VERSION = 1;
const SESSION_REFRESH_INTERVAL_MS = 5000;
const SESSION_ATTACH_RETRY_GRACE_MS = 15000;
const SESSION_READ_RETRY_DELAY_MS = 40;
const SESSION_READ_RETRY_COUNT = 3;
const ACTIVE_SESSION_STATUSES = new Set(['launching', 'running', 'finalizing']);

function isPidAlive(pid) {
    if (!Number.isInteger(pid) || pid <= 0) {
        return false;
    }
    try {
        process.kill(pid, 0);
        return true;
    } catch (_) {
        return false;
    }
}

function toInteger(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeSessionJournal(raw, filePath) {
    const sessionId = String(raw?.sessionId || path.basename(filePath, path.extname(filePath))).trim();
    const startedAt = toInteger(raw?.startedAt, Date.now());
    const lastHeartbeatAt = toInteger(raw?.lastHeartbeatAt, startedAt);
    return {
        schemaVersion: toInteger(raw?.schemaVersion, SESSION_SCHEMA_VERSION),
        sessionId,
        gameKey: String(raw?.gameKey || '').trim(),
        exePath: String(raw?.exePath || '').trim(),
        cwd: String(raw?.cwd || '').trim(),
        mode: raw?.mode === 'attach' ? 'attach' : 'launch',
        helperPid: toInteger(raw?.helperPid, 0),
        rootPid: toInteger(raw?.rootPid, 0),
        startedAt,
        lastHeartbeatAt,
        accruedMs: Math.max(0, toInteger(raw?.accruedMs, 0)),
        status: String(raw?.status || 'launching').trim() || 'launching',
        endedAt: raw?.endedAt ? toInteger(raw.endedAt, 0) : 0,
        failureReason: raw?.failureReason ? String(raw.failureReason) : '',
        filePath
    };
}

function isActiveJournal(journal) {
    return ACTIVE_SESSION_STATUSES.has(journal.status);
}

function isTransientSessionReadError(error) {
    if (!error) return false;
    if (error.code === 'ENOENT') return true;
    return error instanceof SyntaxError;
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readSessionJournal(filePath) {
    let lastError = null;
    for (let attempt = 0; attempt < SESSION_READ_RETRY_COUNT; attempt += 1) {
        try {
            const raw = JSON.parse(await fs.readFile(filePath, 'utf8'));
            return normalizeSessionJournal(raw, filePath);
        } catch (error) {
            lastError = error;
            if (!isTransientSessionReadError(error) || attempt === SESSION_READ_RETRY_COUNT - 1) {
                throw error;
            }
            await delay(SESSION_READ_RETRY_DELAY_MS);
        }
    }
    throw lastError;
}

async function writeSessionJournal(filePath, journal) {
    const nextPayload = {
        ...journal,
        schemaVersion: SESSION_SCHEMA_VERSION
    };
    const tempPath = `${filePath}.tmp`;
    await fs.writeFile(tempPath, `${JSON.stringify(nextPayload, null, 2)}\n`, 'utf8');
    await fs.rename(tempPath, filePath);
    return normalizeSessionJournal(nextPayload, filePath);
}

async function removeSessionJournal(filePath) {
    try {
        await fs.unlink(filePath);
    } catch (error) {
        if (error && error.code !== 'ENOENT') {
            throw error;
        }
    }
}

function aggregateActiveGameState(journals) {
    const stateByGameKey = new Map();
    journals.filter(isActiveJournal).forEach((journal) => {
        if (!journal.gameKey) return;
        const current = stateByGameKey.get(journal.gameKey) || {
            active: false,
            accruedMs: 0,
            sessionIds: []
        };
        current.active = true;
        current.accruedMs += Math.max(0, journal.accruedMs || 0);
        current.sessionIds.push(journal.sessionId);
        stateByGameKey.set(journal.gameKey, current);
    });
    return stateByGameKey;
}

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

    function buildHelperArgs(mode, journalPath) {
        return [
            mode,
            '--journal',
            journalPath,
            '--db',
            dbFilePath,
            '--log',
            helperLogPath
        ];
    }

    function spawnHelper(mode, journalPath) {
        const helperPath = assertPlaytimeHelperExists(resolvePlaytimeHelperPath({ app }));
        const args = buildHelperArgs(mode, journalPath);
        log(`spawning helper mode=${mode} journal=${journalPath}`);
        const child = spawn(helperPath, args, {
            detached: true,
            stdio: 'ignore'
        });
        child.unref();
        return child.pid || 0;
    }

    async function finalizeStaleJournal(journal, reason = 'stale-session-finalized') {
        const endedAt = journal.lastHeartbeatAt || journal.startedAt || Date.now();
        log(`finalizing stale session gameKey=${journal.gameKey} sessionId=${journal.sessionId} accruedMs=${journal.accruedMs} endedAt=${endedAt} reason=${reason}`);
        await libraryState.finalizeTrackedSession(journal.gameKey, journal.accruedMs, endedAt);
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
                spawnHelper('attach', journal.filePath);
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

    async function launchTrackedGame(gameKey, exePath) {
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
            const helperPid = spawnHelper('launch', journalPath);
            if (helperPid > 0) {
                await writeSessionJournal(journalPath, {
                    ...initialJournal,
                    helperPid
                });
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
            const runtime = currentGameState.get(game.gameKey);
            if (!runtime || !runtime.active) {
                return {
                    ...game,
                    isRunning: false
                };
            }
            return {
                ...game,
                isRunning: true,
                playtime: (game.playtime || 0) + runtime.accruedMs
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
