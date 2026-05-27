// @ts-nocheck
const scanner = require('./scanner');
const { normalizeLibraryConfigShape } = scanner;

async function resolveLibraryConfig(context) {
    const { defaultGamesDir, fsSync, loadDB, saveDB } = context;
    if (process.argv.some(arg => arg.toLowerCase() === '--welcome' || arg.toLowerCase() === '-w')) return null;

    const db = await loadDB();
    const config = normalizeLibraryConfigShape(db.config);

    if (!config.libraryPath && fsSync.existsSync(defaultGamesDir)) {
        config.libraryPath = defaultGamesDir;
    } else if (config.libraryPath && !fsSync.existsSync(config.libraryPath) && fsSync.existsSync(defaultGamesDir)) {
        config.libraryPath = defaultGamesDir;
    }

    db.config = config;
    await saveDB(db);
    return config;
}

async function setupLibrary(context, type) {
    const { defaultGamesDir, dialog, fsSync, loadDB, saveDB } = context;
    const db = await loadDB();
    const currentConfig = normalizeLibraryConfigShape(db.config);
    let nextLibraryPath = '';

    if (type === 'default') {
        nextLibraryPath = defaultGamesDir;
        if (!fsSync.existsSync(nextLibraryPath)) {
            fsSync.mkdirSync(nextLibraryPath, { recursive: true });
        }
    } else {
        const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
        if (result.canceled) return null;
        nextLibraryPath = result.filePaths[0];
    }

    const nextConfig = normalizeLibraryConfigShape({
        ...currentConfig,
        libraryPath: nextLibraryPath
    });
    db.config = nextConfig;
    await saveDB(db);
    return nextConfig;
}

async function updateLibraryConfig(context, updates = {}) {
    const { loadDB, saveDB } = context;
    const db = await loadDB();
    const currentConfig = normalizeLibraryConfigShape(db.config);
    const nextConfig = normalizeLibraryConfigShape({
        ...currentConfig,
        ...updates
    });
    db.config = nextConfig;
    await saveDB(db);
    return nextConfig;
}

async function resolveLibraryFolderToOpen(context) {
    const { defaultGamesDir, fsSync } = context;
    const config = await resolveLibraryConfig(context);
    if (config?.libraryPath && fsSync.existsSync(config.libraryPath)) {
        return config.libraryPath;
    }
    if (fsSync.existsSync(defaultGamesDir)) {
        return defaultGamesDir;
    }
    return '';
}

module.exports = {
    resolveLibraryConfig,
    setupLibrary,
    updateLibraryConfig,
    resolveLibraryFolderToOpen
};
