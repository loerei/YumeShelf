import * as path from 'node:path';

export interface AppPathsInstance {
    isDev: boolean;
    defaultGamesDir: string;
    dbFile: string;
    categoryStateFile: string;
    installerFirstLaunchMarkerFile: string;
    installerFirstLaunchFallbackMarkerFiles: string[];
    installerFirstLaunchLogFile: string;
    userLocalesDir: string;
    translatorsDir: string;
    languagePackCacheDir: string;
    languagePackManifestCacheFile: string;
    builtInLocalesDir: string;
    localLanguagePackRoot: string;
    localLanguagePackManifestFile: string;
    localLanguagePacksDir: string;
    mainWindowIconPath: string;
    preloadPath: string;
    indexHtmlPath: string;
}

export interface ElectronAppInterface {
    isPackaged: boolean;
    getPath(name: string): string;
    getName(): string;
}

export function createAppPaths(app: ElectronAppInterface, sourceRootDir: string): AppPathsInstance {
    const isDev = !app.isPackaged;
    const userDataDir = app.getPath('userData');
    const appDataDir = app.getPath('appData');
    const appName = app.getName();
    return {
        isDev,
        defaultGamesDir: isDev
            ? path.join(sourceRootDir, '..', 'YumeShelf')
            : path.join(path.dirname(app.getPath('exe')), 'YumeShelf'),
        dbFile: path.join(appDataDir, 'YumeShelf', 'library_db.json'),
        categoryStateFile: path.join(appDataDir, 'YumeShelf', 'category_state.json'),
        installerFirstLaunchMarkerFile: path.join(userDataDir, 'install-handoff.ini'),
        installerFirstLaunchFallbackMarkerFiles: [
            path.join(appDataDir, appName, 'install-handoff.ini'),
            path.join(appDataDir, 'YumeShelf', 'install-handoff.ini'),
            path.join(appDataDir, 'yumeshelf', 'install-handoff.ini')
        ],
        installerFirstLaunchLogFile: path.join(userDataDir, 'install-handoff.log'),
        userLocalesDir: path.join(appDataDir, 'YumeShelf', 'locales'),
        translatorsDir: path.join(appDataDir, 'YumeShelf', 'translators'),
        languagePackCacheDir: path.join(appDataDir, 'YumeShelf', 'language-pack-cache'),
        languagePackManifestCacheFile: path.join(appDataDir, 'YumeShelf', 'language-pack-cache', 'manifest.json'),
        builtInLocalesDir: path.join(sourceRootDir, 'locales', 'builtins'),
        localLanguagePackRoot: path.join(sourceRootDir, '..', 'language-packs'),
        localLanguagePackManifestFile: path.join(sourceRootDir, '..', 'language-packs', 'manifest.json'),
        localLanguagePacksDir: path.join(sourceRootDir, '..', 'language-packs', 'packs'),
        mainWindowIconPath: path.join(sourceRootDir, '..', 'assets', 'yumeshelf_icon_highres_4096.png'),
        preloadPath: path.join(sourceRootDir, 'preload.js'),
        indexHtmlPath: isDev 
            ? path.join(sourceRootDir, '..', 'index.html') 
            : path.join(sourceRootDir, 'renderer', 'index.html')
    };
}
