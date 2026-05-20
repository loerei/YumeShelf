const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const fsSync = require('fs');
const os = require('os');
const path = require('path');

const { registerMainIpc } = require('../dist/main/ipc/register');

async function makeTempDir() {
    return fs.mkdtemp(path.join(os.tmpdir(), 'yumeshelf-settings-test-'));
}

test('registerMainIpc syncs autoLaunch from DB on startup (dev mode)', async () => {
    const tempDir = await makeTempDir();
    const dbFile = path.join(tempDir, 'library_db.json');
    
    // 1. Write mock library_db.json with autoLaunch: "minimized"
    const dbContent = {
        config: {
            autoLaunch: 'minimized',
            minimizeToTray: true
        }
    };
    await fs.writeFile(dbFile, JSON.stringify(dbContent, null, 2));

    // Mock Electron app
    let loginSettingsApplied = null;
    const appMock = {
        isPackaged: false,
        getPath(name) {
            return path.join(tempDir, name);
        },
        setLoginItemSettings(settings) {
            loginSettingsApplied = settings;
        }
    };

    // Mock ipcMain
    const ipcHandlers = {};
    const ipcListeners = {};
    const ipcMainMock = {
        handle(channel, handler) {
            ipcHandlers[channel] = handler;
        },
        on(channel, listener) {
            ipcListeners[channel] = listener;
        }
    };

    // Invoke registerMainIpc
    registerMainIpc({
        app: appMock,
        ipcMain: ipcMainMock,
        paths: { dbFile }
    });

    // Verify dev mode setup
    assert.equal(loginSettingsApplied, null, 'setLoginItemSettings should not be called in dev mode');
    
    // Retrieve registered get-auto-launch handler and invoke it
    assert.ok(ipcHandlers['get-auto-launch']);
    const autoLaunchValue = await ipcHandlers['get-auto-launch']();
    assert.equal(autoLaunchValue, 'minimized', 'devAutoLaunchState should have been initialized to minimized from the DB');
});

test('registerMainIpc syncs autoLaunch from DB on startup (packaged mode)', async () => {
    const tempDir = await makeTempDir();
    const dbFile = path.join(tempDir, 'library_db.json');
    
    // 1. Write mock library_db.json with autoLaunch: "on" (stored as true)
    const dbContent = {
        config: {
            autoLaunch: true,
            minimizeToTray: true
        }
    };
    await fs.writeFile(dbFile, JSON.stringify(dbContent, null, 2));

    // Mock Electron app
    let loginSettingsApplied = null;
    const appMock = {
        isPackaged: true,
        getPath(name) {
            return path.join(tempDir, name);
        },
        setLoginItemSettings(settings) {
            loginSettingsApplied = settings;
        },
        getLoginItemSettings() {
            return {
                openAtLogin: loginSettingsApplied ? loginSettingsApplied.openAtLogin : false,
                args: loginSettingsApplied ? loginSettingsApplied.args : []
            };
        }
    };

    // Mock ipcMain
    const ipcHandlers = {};
    const ipcMainMock = {
        handle(channel, handler) {
            ipcHandlers[channel] = handler;
        },
        on() {}
    };

    // Invoke registerMainIpc
    registerMainIpc({
        app: appMock,
        ipcMain: ipcMainMock,
        paths: { dbFile }
    });

    // Verify packaged mode setup
    assert.ok(loginSettingsApplied, 'setLoginItemSettings should be called in packaged mode');
    assert.equal(loginSettingsApplied.openAtLogin, true);
    assert.deepEqual(loginSettingsApplied.args, []);

    // Retrieve registered get-auto-launch handler and invoke it
    assert.ok(ipcHandlers['get-auto-launch']);
    const autoLaunchValue = await ipcHandlers['get-auto-launch']();
    assert.equal(autoLaunchValue, 'on', 'get-auto-launch should return correct value from OS settings');
});
