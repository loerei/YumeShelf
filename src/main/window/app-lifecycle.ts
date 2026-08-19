export function attachProcessDiagnostics(app: any): void {
    app.on('ready', () => {
        console.log(`[MAIN][LIFECYCLE] ready fired pid=${process.pid}`);
    });

    app.on('child-process-gone', (_event: any, details: any) => {
        console.error(`[MAIN][PROCESS] child-process-gone ${JSON.stringify(details)}`);
    });

    app.on('render-process-gone', (_event: any, _webContents: any, details: any) => {
        console.error(`[MAIN][PROCESS] render-process-gone ${JSON.stringify(details)}`);
    });
}

export interface MainRuntimeConfig {
    app: any;
    appUpdateServices: any;
    categoryState: any;
    iconPipeline: any;
    ipcMain: any;
    languagePackServices: any;
    libraryState: any;
    logStartupDiagnostics: (app: any) => void;
    paths: any;
    playtimeSessionManager: any;
    registerMainIpc: any;
    saveFolderResolver: any;
    saveEditorService: any;
    translationService: any;
    shell: any;
    startupServices: any;
    createMainWindow: any;
}

export async function startMainRuntime({
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
    translationService,
    shell,
    startupServices,
    createMainWindow
}: MainRuntimeConfig): Promise<void> {
    iconPipeline.registerProtocolHandler();
    logStartupDiagnostics(app);

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
        translationService,
        startupServices,
        defaultGamesDir: paths.defaultGamesDir,
        paths
    });
    iconPipeline.registerIpcHandler();

    const launchedAfterUpdate = process.argv.includes('--after-update');
    createMainWindow({
        app,
        paths,
        launchedAfterUpdate
    });
}
