const { execFile, exec } = require('child_process');
const path = require('path');
const { BrowserWindow } = require('electron');

function createPlaytimeTracker({ libraryState }) {
    let activeSessions = new Map(); // Key: parentPid -> { gameKey, parentPid, lastCheckTime }

    function checkActiveSessions() {
        if (activeSessions.size === 0) return;
        console.log(`[TRACKER] checkActiveSessions fired. Active sessions: ${activeSessions.size}`);

        exec('powershell -NoProfile -Command "Get-CimInstance Win32_Process | ForEach-Object { \\"{0},{1}\\" -f $_.ProcessId, $_.ParentProcessId }"', async (error, stdout) => {
            if (error) {
                console.error(`[TRACKER] PowerShell process map query failed:`, error);
                return;
            }
            if (!stdout) {
                console.warn(`[TRACKER] PowerShell returned empty stdout!`);
                return;
            }

            const lines = stdout.split(/\r?\n/);
            const procMap = [];
            for (let i = 0; i < lines.length; i++) {
                const parts = lines[i].trim().split(',');
                if (parts.length >= 2) {
                    const pid = parseInt(parts[0]);
                    const ppid = parseInt(parts[1]);
                    if (!isNaN(pid) && !isNaN(ppid)) {
                        procMap.push({ pid, ppid });
                    }
                }
            }

            const now = Date.now();
            for (const [parentPid, session] of activeSessions.entries()) {
                let activePids = new Set();
                let queue = [session.parentPid];
                let visited = new Set();

                while (queue.length > 0) {
                    const current = queue.shift();
                    if (visited.has(current)) continue;
                    visited.add(current);

                    const isRunning = procMap.some(p => p.pid === current);
                    if (isRunning) {
                        activePids.add(current);
                    }

                    const children = procMap.filter(p => p.ppid === current).map(p => p.pid);
                    queue.push(...children);
                }

                if (activePids.size > 0) {
                    const durationMs = now - session.lastCheckTime;
                    session.lastCheckTime = now;

                    if (durationMs > 0) {
                        await libraryState.addPlaytime(session.gameKey, durationMs);

                        BrowserWindow.getAllWindows().forEach((windowRef) => {
                            if (!windowRef || windowRef.isDestroyed()) return;
                            windowRef.webContents.send('game-playtime-updated', { gameKey: session.gameKey });
                        });
                    }
                } else {
                    console.log(`[TRACKER] No related active processes found for ${session.gameKey}. Session terminating.`);
                    activeSessions.delete(parentPid);

                    const durationMs = now - session.lastCheckTime;
                    if (durationMs > 0) {
                        await libraryState.addPlaytime(session.gameKey, durationMs);
                    }
                    await libraryState.markGameStopped(session.gameKey);

                    const hasOtherInstances = [...activeSessions.values()].some(s => s.gameKey === session.gameKey);
                    if (!hasOtherInstances) {
                        console.log(`[TRACKER] No other instances running for ${session.gameKey}, broadcasting game-stopped`);
                        BrowserWindow.getAllWindows().forEach((windowRef) => {
                            if (!windowRef || windowRef.isDestroyed()) return;
                            console.log(`[TRACKER] Dispatching game-stopped to window for ${session.gameKey}`);
                            windowRef.webContents.send('game-stopped', { gameKey: session.gameKey });
                        });
                    }
                }
            }
        });
    }

    function trackGameLaunch(gameKey, exePath) {
        console.log(`[TRACKER] trackGameLaunch called for gameKey: ${gameKey}, exePath: ${exePath}`);

        try {
            const child = execFile(exePath, { cwd: path.dirname(exePath) }, (error) => {
                if (error) {
                    console.error(`[TRACKER] execFile finished with error for ${gameKey}:`, error);
                } else {
                    console.log(`[TRACKER] execFile finished cleanly for ${gameKey}`);
                }
            });
            const parentPid = child.pid;
            console.log(`[TRACKER] Launched process for ${gameKey}, child.pid: ${parentPid}`);
            if (parentPid) {
                activeSessions.set(parentPid, {
                    gameKey,
                    parentPid,
                    lastCheckTime: Date.now()
                });
                
                child.on('exit', (code) => {
                    console.log(`[TRACKER] child process for ${gameKey} (PID ${parentPid}) exited with code ${code}. Checking sessions.`);
                    checkActiveSessions();
                });
            } else {
                console.error(`[TRACKER] parentPid is missing for ${gameKey}!`);
            }
        } catch (e) {
            console.error(`[TRACKER] Failed to spawn child process for ${gameKey}:`, e);
        }

        libraryState.markGameLaunched(gameKey).then(() => {
            BrowserWindow.getAllWindows().forEach((windowRef) => {
                if (!windowRef || windowRef.isDestroyed()) return;
                windowRef.webContents.send('game-playtime-updated', { gameKey });
            });
        });
    }

    setInterval(() => {
        checkActiveSessions();
    }, 5000);

    function isGameRunning(gameKey) {
        return [...activeSessions.values()].some(s => s.gameKey === gameKey);
    }

    return {
        trackGameLaunch,
        isGameRunning
    };
}

module.exports = {
    createPlaytimeTracker
};
