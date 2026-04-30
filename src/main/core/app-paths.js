const path = require('path');

function createAppPaths(app, sourceRootDir) {
    const isDev = !app.isPackaged;
    return {
        isDev,
        defaultGamesDir: isDev
            ? path.join(sourceRootDir, '..', 'YumeShelf')
            : path.join(path.dirname(app.getPath('exe')), 'YumeShelf'),
        dbFile: path.join(app.getPath('userData'), 'library_db.json'),
        userLocalesDir: path.join(app.getPath('userData'), 'locales'),
        languagePackCacheDir: path.join(app.getPath('userData'), 'language-pack-cache'),
        languagePackManifestCacheFile: path.join(app.getPath('userData'), 'language-pack-cache', 'manifest.json'),
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
