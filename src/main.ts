import { app, ipcMain, shell, dialog, protocol, BrowserWindow } from 'electron';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import net from 'node:net';

function getFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.unref();
        server.on('error', reject);
        server.listen(0, () => {
            const port = (server.address() as net.AddressInfo).port;
            server.close(() => resolve(port));
        });
    });
}

// Enable remote debugging port for HoverSource injection dynamically
let portToUse: string | null = null;

const extraArgs = process.env.ELECTRON_EXTRA_LAUNCH_ARGS;
if (extraArgs) {
    const match = extraArgs.match(/--remote-debugging-port=(\d+)/);
    if (match) {
        portToUse = match[1];
    }
}

if (app.commandLine.hasSwitch('remote-debugging-port')) {
    portToUse = app.commandLine.getSwitchValue('remote-debugging-port');
}

if (portToUse) {
    app.commandLine.appendSwitch('remote-debugging-port', portToUse);
    console.log(`[HoverSource] Remote debugging enabled on port ${portToUse}`);
} else {
    getFreePort().then(port => {
        app.commandLine.appendSwitch('remote-debugging-port', port.toString());
        console.log(`[HoverSource] Remote debugging enabled on port ${port}`);
    }).catch(err => {
        console.error('[HoverSource] Failed to find free port for remote debugging:', err);
    });
}

import { createAppPaths } from './main/core/app-paths';
import { createCategoryState } from './main/category-state';
import { applyVersionOverride, registerPrivilegedSchemes, logBootDiagnostics } from './main/core/runtime-bootstrap';
import { installSafeConsole } from './main/core/safe-console';
import { compareNumericVersions } from './main/core/version-utils';
import { createIconPipeline } from './main/icon-pipeline/service';
import { registerMainIpc } from './main/ipc/register';
import { createInstallHandoffService } from './main/install-handoff';
import { createLanguagePackServices } from './main/language-packs/service';
import { createAppUpdateServices } from './main/app-updates';
import { createLibraryState } from './main/library-state';
import { createPlaytimeSessionManager } from './main/playtime-session-manager';
import * as saveFolderResolver from './main/save-folder-resolver/index';
import { createStartupServices } from './main/startup';
import { startMainRuntime, attachProcessDiagnostics } from './main/window/app-lifecycle';
import { createStatusBroadcaster } from './main/window/broadcast-status';
import { createMainWindow, logStartupDiagnostics } from './main/window/main-window';
import { createSaveEditorService } from './main/save-editor';
import { TranslationService } from './main/translation/translation-service';

if (!app.isPackaged) {
    app.setName('YumeShelfDev');
}

const isSingleInstance = app.requestSingleInstanceLock();
if (!isSingleInstance) {
    app.quit();
    process.exit(0);
}

app.on('second-instance', () => {
    const mainWin = BrowserWindow.getAllWindows()[0];
    if (mainWin) {
        if (mainWin.isMinimized()) mainWin.restore();
        mainWin.show();
        mainWin.focus();
    }
});

applyVersionOverride(app);
registerPrivilegedSchemes(protocol);
installSafeConsole();

const paths = createAppPaths(app, __dirname);

const translationService = new TranslationService({
    translatorsDir: paths.translatorsDir,
    appVersion: app.getVersion(),
    broadcastStatus: createStatusBroadcaster('translation-status')
});

async function loadDB(): Promise<any> {
    try {
        return JSON.parse(await fs.readFile(paths.dbFile, 'utf8'));
    } catch {
        return {};
    }
}

async function saveDB(db: any): Promise<void> {
    await fs.writeFile(paths.dbFile, JSON.stringify(db, null, 2));
}

const languagePackServices = createLanguagePackServices({
    app,
    paths
});

const appUpdateServices = createAppUpdateServices({
    app,
    broadcastStatus: createStatusBroadcaster('app-update-status'),
    compareVersions: compareNumericVersions,
    openExternalUrl: (url: string) => shell.openExternal(url),
    startupNetworkTimeoutMs: 3500
});

const installHandoffService = createInstallHandoffService({
    app,
    markerFile: paths.installerFirstLaunchMarkerFile,
    fallbackMarkerFiles: paths.installerFirstLaunchFallbackMarkerFiles,
    logFile: paths.installerFirstLaunchLogFile
});

const categoryState = createCategoryState({
    fs,
    stateFile: paths.categoryStateFile
});

const libraryState = createLibraryState({
    categoryState,
    defaultGamesDir: paths.defaultGamesDir,
    dialog,
    fs,
    fsSync,
    loadDB,
    saveDB
});

const playtimeSessionManager = createPlaytimeSessionManager({
    app,
    BrowserWindow,
    dbFilePath: paths.dbFile,
    libraryState
});

const startupServices = createStartupServices({
    app,
    checkForAppUpdate: () => appUpdateServices.checkForAppUpdate(),
    consumePostUpdateMarker: () => appUpdateServices.consumePostUpdateMarker(),
    prepareDeferredInstallOnLaunch: () => appUpdateServices.prepareDeferredInstallOnLaunch(),
    preparePlaytimeSessions: () => playtimeSessionManager.initialize(),
    overlayPlaytimeSessions: (games: any) => playtimeSessionManager.overlayGames(games),
    logAppUpdateDebug: (message: string) => appUpdateServices.logDebug(message),
    applyLanguagePackUpdates: languagePackServices.applyLanguagePackUpdates,
    buildLanguageState: languagePackServices.buildLanguageState,
    fetchLanguageManifest: languagePackServices.fetchLanguageManifest,
    getLanguagePackUpdateCandidates: languagePackServices.getLanguagePackUpdateCandidates,
    isNetworkLikeError: languagePackServices.isNetworkLikeError,
    loadGamesForConfig: (config: any) => libraryState.loadGamesForConfig(config),
    resolveLibraryConfig: () => libraryState.resolveLibraryConfig(),
    getCategoryTree: () => categoryState.getCategoryTree(),
    startupNetworkTimeoutMs: 3500
});

const saveEditorService = createSaveEditorService({
    libraryState,
    saveFolderResolver
});

const iconPipeline = createIconPipeline({
    app,
    protocol,
    ipcMain,
    sourceRootDir: __dirname
});

logBootDiagnostics(app);
attachProcessDiagnostics(app);

app.whenReady().then(async () => {
    await installHandoffService.consumeManualInstallHandoff();
    await startMainRuntime({
        app,
        appUpdateServices,
        iconPipeline,
        ipcMain,
        shell,
        languagePackServices,
        libraryState,
        playtimeSessionManager,
        saveFolderResolver,
        startupServices,
        categoryState,
        saveEditorService,
        translationService,
        logStartupDiagnostics,
        paths,
        registerMainIpc,
        createMainWindow
    });
});

app.on('window-all-closed', async () => {
    if (translationService) {
        await translationService.stopProxy();
    }
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
