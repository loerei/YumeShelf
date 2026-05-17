const fs = require('fs/promises');
const path = require('path');

const SESSION_SCHEMA_VERSION = 1;
const SESSION_READ_RETRY_DELAY_MS = 40;
const SESSION_READ_RETRY_COUNT = 3;
const ACTIVE_SESSION_STATUSES = new Set(['launching', 'running', 'finalizing']);

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

module.exports = {
    SESSION_SCHEMA_VERSION,
    normalizeSessionJournal,
    isActiveJournal,
    readSessionJournal,
    writeSessionJournal,
    removeSessionJournal,
    aggregateActiveGameState,
    delay
};
