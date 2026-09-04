import { App, IpcMain, Shell } from 'electron';

export interface RegisterIpcOptions {
    app: App;
    ipcMain: IpcMain;
    shell?: Shell;
    dialog?: typeof import('electron').dialog;
    browserWindow?: typeof import('electron').BrowserWindow;
    appUpdateServices: any;
    categoryState: any;
    languagePackServices: any;
    libraryState: any;
    playtimeSessionManager: any;
    saveFolderResolver: any;
    saveEditorService: any;
    translationService: any;
    startupServices: any;
    defaultGamesDir: string;
    paths: any;
}
