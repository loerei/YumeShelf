const path = require('path');

function createAppPaths(app, sourceRootDir) {
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
        languagePackCacheDir: path.join(appDataDir, 'YumeShelf', 'language-pack-cache'),
        languagePackManifestCacheFile: path.join(appDataDir, 'YumeShelf', 'language-pack-cache', 'manifest.json'),
        builtInLocalesDir: path.join(sourceRootDir, 'locales', 'builtins'),
        localLanguagePackRoot: path.join(sourceRootDir, '..', 'language-packs'),
        localLanguagePackManifestFile: path.join(sourceRootDir, '..', 'language-packs', 'manifest.json'),
        localLanguagePacksDir: path.join(sourceRootDir, '..', 'language-packs', 'packs'),
        mainWindowIconPath: path.join(sourceRootDir, '..', 'assets', 'yumeshelf_icon_highres_4096.png'),
        preloadPath: path.join(sourceRootDir, 'preload.js'),
        indexHtmlPath: path.join(sourceRootDir, 'index.html')
    };
}

module.exports = {
    createAppPaths
};
