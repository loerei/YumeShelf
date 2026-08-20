import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export const SESSION_SCHEMA_VERSION = 1;
export const SESSION_READ_RETRY_DELAY_MS = 40;
export const SESSION_READ_RETRY_COUNT = 3;
const ACTIVE_SESSION_STATUSES = new Set(['launching', 'running', 'finalizing']);

export interface SessionJournal {
    schemaVersion: number;
    sessionId: string;
    gameKey: string;
    exePath: string;
    cwd: string;
    mode: 'attach' | 'launch';
    helperPid: number;
    rootPid: number;
    startedAt: number;
    lastHeartbeatAt: number;
    accruedMs: number;
    status: string;
    endedAt: number;
    failureReason: string;
    filePath: string;
    runner?: string;
    runnerArgs?: string[];
    env?: Record<string, string>;
    targetPlatform?: 'windows' | 'linux';
}

export interface ActiveGameState {
    active: boolean;
    accruedMs: number;
    sessionIds: string[];
}

function toInteger(value: any, fallback = 0): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeSessionJournal(raw: any, filePath: string): SessionJournal {
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
        filePath,
        runner: raw?.runner ? String(raw.runner) : undefined,
        runnerArgs: Array.isArray(raw?.runnerArgs) ? raw.runnerArgs.map(String) : undefined,
        env: typeof raw?.env === 'object' && raw.env !== null ? { ...raw.env } : undefined,
        targetPlatform: raw?.targetPlatform === 'linux' ? 'linux' : raw?.targetPlatform === 'windows' ? 'windows' : undefined
    };
}

export function isActiveJournal(journal: SessionJournal): boolean {
    return ACTIVE_SESSION_STATUSES.has(journal.status);
}

export function isTransientSessionReadError(error: any): boolean {
    if (!error) return false;
    if (error.code === 'ENOENT') return true;
    return error instanceof SyntaxError;
}

export function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function readSessionJournal(filePath: string): Promise<SessionJournal> {
    let lastError: any = null;
    for (let attempt = 0; attempt < SESSION_READ_RETRY_COUNT; attempt += 1) {
        try {
            const raw = JSON.parse(await fs.readFile(filePath, 'utf8'));
            return normalizeSessionJournal(raw, filePath);
        } catch (error: any) {
            lastError = error;
            if (!isTransientSessionReadError(error) || attempt === SESSION_READ_RETRY_COUNT - 1) {
                throw error;
            }
            await delay(SESSION_READ_RETRY_DELAY_MS);
        }
    }
    throw lastError;
}

export async function writeSessionJournal(filePath: string, journal: SessionJournal): Promise<SessionJournal> {
    const nextPayload = {
        ...journal,
        schemaVersion: SESSION_SCHEMA_VERSION
    };
    const tempPath = `${filePath}.tmp`;
    await fs.writeFile(tempPath, `${JSON.stringify(nextPayload, null, 2)}\n`, 'utf8');
    await fs.rename(tempPath, filePath);
    return normalizeSessionJournal(nextPayload, filePath);
}

export async function removeSessionJournal(filePath: string): Promise<void> {
    try {
        await fs.unlink(filePath);
    } catch (error: any) {
        if (error && error.code !== 'ENOENT') {
            throw error;
        }
    }
}

export function aggregateActiveGameState(journals: SessionJournal[]): Map<string, ActiveGameState> {
    const stateByGameKey = new Map<string, ActiveGameState>();
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
