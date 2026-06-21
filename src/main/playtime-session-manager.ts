import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import {
    SESSION_SCHEMA_VERSION,
    isActiveJournal,
    readSessionJournal,
    writeSessionJournal,
    removeSessionJournal,
    aggregateActiveGameState,
    delay,
    SessionJournal,
    ActiveGameState
} from './playtime-session-manager/journal';
import {
    isPidAlive,
    spawnHelper,
    injectRunInBackgroundDll
} from './playtime-session-manager/injector';

const SESSION_REFRESH_INTERVAL_MS = 5000;
const SESSION_ATTACH_RETRY_GRACE_MS = 15000;

export interface PlaytimeSessionManagerOptions {
    app: any;
    BrowserWindow: any;
    dbFilePath: string;
    libraryState: any;
}

export interface PlaytimeSessionManager {
    initialize(): Promise<void>;
    launchTrackedGame(gameKey: string, exePath: string, runInBackground?: boolean): Promise<string>;
    overlayGames(games: any[]): any[];
    refreshSessions(options?: { recover?: boolean; emit?: boolean }): Promise<SessionJournal[]>;
    getRuntimeSnapshot(): { journals: SessionJournal[]; gameState: any[] };
}

export function createPlaytimeSessionManager({
    app,
    BrowserWindow,
    dbFilePath,
    libraryState
}: PlaytimeSessionManagerOptions): PlaytimeSessionManager {
    const sessionsDir = path.join(app.getPath('userData'), 'playtime-sessions');
    const helperLogPath = path.join(app.getPath('userData'), 'playtime-helper.log');
    let refreshTimer: NodeJS.Timeout | null = null;
    let currentJournals: SessionJournal[] = [];
    let currentGameState = new Map<string, ActiveGameState>();
    const pendingAttachRetries = new Map<string, number>();

    function log(message: string): void {
        console.log(`[PLAYTIME][SESSIONS] ${message}`);
    }

    async function ensureSessionInfrastructure(): Promise<void> {
        await fs.mkdir(sessionsDir, { recursive: true });
    }

    function getSessionJournalPath(sessionId: string): string {
        return path.join(sessionsDir, `${sessionId}.json`);
    }

    async function listSessionJournalPaths(): Promise<string[]> {
        await ensureSessionInfrastructure();
        const entries = await fs.readdir(sessionsDir, { withFileTypes: true });
        return entries
            .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
            .map((entry) => path.join(sessionsDir, entry.name));
    }

    async function loadAllSessionJournals(): Promise<SessionJournal[]> {
        const journalPaths = await listSessionJournalPaths();
        const journals: SessionJournal[] = [];
        for (const filePath of journalPaths) {
            try {
                journals.push(await readSessionJournal(filePath));
            } catch (error) {
                console.error(`[PLAYTIME][SESSIONS] Failed to read session journal ${filePath}:`, error);
            }
        }
        return journals;
    }

    async function finalizeStaleJournal(journal: SessionJournal, reason = 'stale-session-finalized'): Promise<void> {
        const endedAt = journal.lastHeartbeatAt || journal.startedAt || Date.now();
        log(`finalizing stale session gameKey=${journal.gameKey} sessionId=${journal.sessionId} accruedMs=${journal.accruedMs} endedAt=${endedAt} reason=${reason}`);
        await libraryState.finalizeTrackedSession(journal.gameKey, journal.accruedMs, endedAt, journal.exePath);
        await removeSessionJournal(journal.filePath);
    }

    function shouldRetryAttach(sessionId: string): boolean {
        const now = Date.now();
        const lastAttempt = pendingAttachRetries.get(sessionId) || 0;
        if ((now - lastAttempt) < SESSION_ATTACH_RETRY_GRACE_MS) {
            return false;
        }
        pendingAttachRetries.set(sessionId, now);
        return true;
    }

    async function recoverJournal(journal: SessionJournal): Promise<{ changed: boolean }> {
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

    function emitSessionEvents(nextGameState: Map<string, ActiveGameState>): void {
        const affectedGameKeys = new Set<string>([
            ...currentGameState.keys(),
            ...nextGameState.keys()
        ]);

        affectedGameKeys.forEach((gameKey) => {
            const previous = currentGameState.get(gameKey) || { active: false, accruedMs: 0 };
            const next = nextGameState.get(gameKey) || { active: false, accruedMs: 0 };
            if (previous.active && !next.active) {
                BrowserWindow.getAllWindows().forEach((windowRef: any) => {
                    if (!windowRef || windowRef.isDestroyed()) return;
                    windowRef.webContents.send('game-stopped', { gameKey });
                });
                return;
            }

            if (next.active && (!previous.active || previous.accruedMs !== next.accruedMs || previous.sessionIds?.length !== next.sessionIds?.length)) {
                BrowserWindow.getAllWindows().forEach((windowRef: any) => {
                    if (!windowRef || windowRef.isDestroyed()) return;
                    windowRef.webContents.send('game-playtime-updated', { gameKey });
                });
            }
        });
    }

    async function refreshSessions({ recover = false, emit = true } = {}): Promise<SessionJournal[]> {
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

    async function initialize(): Promise<void> {
        await refreshSessions({ recover: true, emit: false });
        if (!refreshTimer) {
            refreshTimer = setInterval(() => {
                refreshSessions({ recover: true, emit: true }).catch((error) => {
                    console.error('[PLAYTIME][SESSIONS] periodic refresh failed:', error);
                });
            }, SESSION_REFRESH_INTERVAL_MS);
        }
    }

    async function launchTrackedGame(gameKey: string, exePath: string, runInBackground = false): Promise<string> {
        if (!refreshTimer) {
            await initialize();
        }
        const sessionId = crypto.randomUUID();
        const journalPath = getSessionJournalPath(sessionId);
        const now = Date.now();
        const initialJournal: SessionJournal = {
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
            status: 'launching',
            endedAt: 0,
            failureReason: '',
            filePath: journalPath
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
        } catch (error: any) {
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

    function overlayGames(games: any[]): any[] {
        return games.map((game) => {
            const instanceGameIds = Array.isArray(game.instances) && game.instances.length > 0
                ? game.instances.map((instance: any) => instance.gameId)
                : [game.gameId || game.gameKey];
            const runtimes = instanceGameIds
                .map((gameId: string) => currentGameState.get(gameId))
                .filter((x: any): x is ActiveGameState => !!x);
            const accruedMs = runtimes.reduce((sum: number, runtime: ActiveGameState) => sum + Math.max(0, runtime.accruedMs || 0), 0);
            const isRunning = runtimes.some((runtime: ActiveGameState) => runtime.active);
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
