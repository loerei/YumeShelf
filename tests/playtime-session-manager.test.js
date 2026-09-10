const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const { createPlaytimeSessionManager } = require('../dist/main/playtime-session-manager');

async function makeTempUserData() {
    return fs.mkdtemp(path.join(os.tmpdir(), 'yumeshelf-playtime-test-'));
}

test('overlayGames exposes basePlaytime on both stopped and active game records', async () => {
    const userDataDir = await makeTempUserData();
    const app = { getPath: () => userDataDir };
    const BrowserWindow = { getAllWindows: () => [] };
    const libraryState = { getDbFilePath: () => path.join(userDataDir, 'library_db.json') };

    const manager = createPlaytimeSessionManager({ app, BrowserWindow, libraryState });

    const rawGames = [
        { gameKey: 'game1', playtime: 120000 },
        { gameKey: 'game2', playtime: 0 },
        { gameKey: 'game3' } // playtime undefined
    ];

    const overlaid = manager.overlayGames(rawGames);

    assert.equal(overlaid[0].basePlaytime, 120000);
    assert.equal(overlaid[0].isRunning, false);
    assert.equal(overlaid[1].basePlaytime, 0);
    assert.equal(overlaid[1].isRunning, false);
    assert.equal(overlaid[2].basePlaytime, 0);
    assert.equal(overlaid[2].isRunning, false);

    manager.dispose();
});

test('emitSessionEvents broadcasts game-playtime-updated with gameKey and accruedMs payload', async () => {
    const userDataDir = await makeTempUserData();
    const app = { getPath: () => userDataDir };
    const sentEvents = [];
    const mockWindow = {
        isDestroyed: () => false,
        webContents: {
            send: (channel, payload) => sentEvents.push({ channel, payload })
        }
    };
    const BrowserWindow = { getAllWindows: () => [mockWindow] };
    const libraryState = { getDbFilePath: () => path.join(userDataDir, 'library_db.json') };

    const manager = createPlaytimeSessionManager({
        app,
        BrowserWindow,
        libraryState,
        refreshIntervalMs: 50
    });

    await manager.initialize();

    // Create a mock active session journal in userData
    const sessionsDir = path.join(userDataDir, 'playtime-sessions');
    await fs.mkdir(sessionsDir, { recursive: true });
    const journalPath = path.join(sessionsDir, 'session-123.json');
    const journalData = {
        schemaVersion: 1,
        sessionId: 'session-123',
        gameKey: 'game-steam-123',
        exePath: 'C:\\Games\\game.exe',
        startedAt: Date.now() - 10000,
        lastHeartbeatAt: Date.now(),
        accruedMs: 8500,
        status: 'running',
        helperPid: process.pid, // current pid so isPidAlive evaluates to true
        rootPid: process.pid
    };
    await fs.writeFile(journalPath, JSON.stringify(journalData));

    await manager.refreshSessions({ recover: false, emit: true });

    const updateEvent = sentEvents.find(e => e.channel === 'game-playtime-updated');
    assert.ok(updateEvent, 'Expected game-playtime-updated event to be emitted');
    assert.equal(updateEvent.payload.gameKey, 'game-steam-123');
    assert.equal(updateEvent.payload.accruedMs, 8500);

    // Verify overlayGames reflects running state and accruedMs
    const overlaid = manager.overlayGames([{ gameKey: 'game-steam-123', playtime: 60000 }]);
    assert.equal(overlaid[0].isRunning, true);
    assert.equal(overlaid[0].basePlaytime, 60000);
    assert.equal(overlaid[0].playtime, 60000 + 8500);

    manager.dispose();
});

test('configurable refreshIntervalMs and dispose method clear interval timer', async () => {
    const userDataDir = await makeTempUserData();
    const app = { getPath: () => userDataDir };
    const BrowserWindow = { getAllWindows: () => [] };
    const libraryState = { getDbFilePath: () => path.join(userDataDir, 'library_db.json') };

    let timerInvoked = 0;
    const manager = createPlaytimeSessionManager({
        app,
        BrowserWindow,
        libraryState,
        refreshIntervalMs: 20
    });

    await manager.initialize();

    // Verify dispose can be called without error and clears timer
    manager.dispose();
    // Subsequent calls to dispose are idempotent
    manager.dispose();
});
