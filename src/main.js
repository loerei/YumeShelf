const { app, ipcMain, shell, dialog, protocol } = require('electron');
const fs = require('fs/promises');

const { createAppPaths } = require('./main/core/app-paths');
const { createCategoryState } = require('./main/category-state');
const { applyVersionOverride, registerPrivilegedSchemes, logBootDiagnostics } = require('./main/core/runtime-bootstrap');
const { installSafeConsole } = require('./main/core/safe-console');
const { downloadBuffer, ensureDir, isNetworkLikeError, readJsonFile, sha256Hex } = require('./main/core/shared-io');
const { compareNumericVersions } = require('./main/core/version-utils');
const { createIconPipeline } = require('./main/icon-pipeline/service');
const { registerMainIpc } = require('./main/ipc/register');
const { createInstallHandoffService } = require('./main/install-handoff');
const { createLanguagePackServices } = require('./main/language-packs/service');
const { createAppUpdateServices } = require('./main/app-updates');
const { createLibraryState } = require('./main/library-state');
const { createPlaytimeSessionManager } = require('./main/playtime-session-manager');
const saveFolderResolver = require('./main/save-folder-resolver/index');
const { createStartupServices } = require('./main/startup');
const { startMainRuntime, attachProcessDiagnostics } = require('./main/window/app-lifecycle');
const { createStatusBroadcaster } = require('./main/window/broadcast-status');
const { createMainWindow, logStartupDiagnostics } = require('./main/window/main-window');
const { createSaveEditorService } = require('./main/save-editor-service');

applyVersionOverride(app);
registerPrivilegedSchemes(protocol);
installSafeConsole();

const paths = createAppPaths(app, __dirname);

async function loadDB() {
    try {
        return JSON.parse(await fs.readFile(paths.dbFile, 'utf8'));
    } catch {
        return {};
    }
}

async function saveDB(db) {
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
    openExternalUrl: (url) => shell.openExternal(url),
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
    fsSync: require('fs'),
    loadDB,
    saveDB
});

const playtimeSessionManager = createPlaytimeSessionManager({
    app,
    BrowserWindow: require('electron').BrowserWindow,
    dbFilePath: paths.dbFile,
    libraryState
});

const startupServices = createStartupServices({
    app,
    checkForAppUpdate: () => appUpdateServices.checkForAppUpdate(),
    consumePostUpdateMarker: () => appUpdateServices.consumePostUpdateMarker(),
    prepareDeferredInstallOnLaunch: () => appUpdateServices.prepareDeferredInstallOnLaunch(),
    preparePlaytimeSessions: () => playtimeSessionManager.initialize(),
    overlayPlaytimeSessions: (games) => playtimeSessionManager.overlayGames(games),
    logAppUpdateDebug: (message) => appUpdateServices.logDebug(message),
    applyLanguagePackUpdates: languagePackServices.applyLanguagePackUpdates,
    buildLanguageState: languagePackServices.buildLanguageState,
    fetchLanguageManifest: languagePackServices.fetchLanguageManifest,
    getLanguagePackUpdateCandidates: languagePackServices.getLanguagePackUpdateCandidates,
    isNetworkLikeError: languagePackServices.isNetworkLikeError,
    loadGamesForConfig: (config) => libraryState.loadGamesForConfig(config),
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
    protocol: require('electron').protocol,
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
