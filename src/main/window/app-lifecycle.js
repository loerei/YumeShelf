function attachProcessDiagnostics(app) {
    app.on('ready', () => {
        console.log(`[MAIN][LIFECYCLE] ready fired pid=${process.pid}`);
    });

    app.on('child-process-gone', (_event, details) => {
        console.error(`[MAIN][PROCESS] child-process-gone ${JSON.stringify(details)}`);
    });

    app.on('render-process-gone', (_event, _webContents, details) => {
        console.error(`[MAIN][PROCESS] render-process-gone ${JSON.stringify(details)}`);
    });
}

async function startMainRuntime({
    app,
    appUpdateServices,
    categoryState,
    iconPipeline,
    ipcMain,
    languagePackServices,
    libraryState,
    logStartupDiagnostics,
    paths,
    playtimeSessionManager,
    registerMainIpc,
    saveFolderResolver,
    saveEditorService,
    shell,
    startupServices,
    createMainWindow
}) {
    iconPipeline.registerProtocolHandler();
    logStartupDiagnostics(app);

    const launchedAfterUpdate = process.argv.includes('--after-update');
    createMainWindow({
        app,
        paths,
        launchedAfterUpdate
    });

    registerMainIpc({
        app,
        ipcMain,
        shell,
        appUpdateServices,
        categoryState,
        languagePackServices,
        libraryState,
        playtimeSessionManager,
        saveFolderResolver,
        saveEditorService,
        startupServices,
        defaultGamesDir: paths.defaultGamesDir
    });
    iconPipeline.registerIpcHandler();
}

module.exports = {
    attachProcessDiagnostics,
    startMainRuntime
};
