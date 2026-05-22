import 'dotenv/config';
import { app, ipcMain, shell, dialog, protocol, BrowserWindow } from 'electron';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import { TelemetryShipper } from './main/telemetry/shipper';

// Import local services via require due to CommonJS module exports
const { createAppPaths } = require('./main/core/app-paths');
const { createCategoryState } = require('./main/category-state');
const { applyVersionOverride, registerPrivilegedSchemes, logBootDiagnostics } = require('./main/core/runtime-bootstrap');
const { installSafeConsole } = require('./main/core/safe-console');
const { registerMainIpc } = require('./main/ipc/register');
const { createInstallHandoffService } = require('./main/install-handoff');
const { createLanguagePackServices } = require('./main/language-packs/service');
const { createAppUpdateServices } = require('./main/app-updates');
const { createLibraryState } = require('./main/library-state');
const { createPlaytimeSessionManager } = require('./main/playtime-session-manager');
const { createStartupServices } = require('./main/startup');
const { startMainRuntime, attachProcessDiagnostics } = require('./main/window/app-lifecycle');
const { createStatusBroadcaster } = require('./main/window/broadcast-status');
const { createMainWindow, logStartupDiagnostics } = require('./main/window/main-window');
const { createSaveEditorService } = require('./main/save-editor');
const { createIconPipeline } = require('./main/icon-pipeline/service');

const saveFolderResolver = require('./main/save-folder-resolver/index');

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

// Initialize Telemetry Shipper immediately on boot
TelemetryShipper.getInstance().initialize(app, paths).catch(err => {
    console.error('[TELEMETRY] Failed to initialize TelemetryShipper:', err);
});

async function loadDB() {
    try {
        return JSON.parse(await fs.readFile(paths.dbFile, 'utf8'));
    } catch {
        return {};
    }
}

async function saveDB(db: any) {
    await fs.writeFile(paths.dbFile, JSON.stringify(db, null, 2));
}

const languagePackServices = createLanguagePackServices({
    app,
    paths
});

const appUpdateServices = createAppUpdateServices({
    app,
    broadcastStatus: createStatusBroadcaster('app-update-status'),
    compareVersions: () => 0, // Fallback if required
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
        logStartupDiagnostics,
        paths,
        registerMainIpc,
        createMainWindow
    });
});

app.on('window-all-closed', () => {
    // Flush telemetry before closing the application
    TelemetryShipper.getInstance().flush().catch(err => {
        console.error('[TELEMETRY] Failed to flush telemetry on exit:', err);
    }).finally(() => {
        if (process.platform !== 'darwin') {
            app.quit();
        }
    });
});
