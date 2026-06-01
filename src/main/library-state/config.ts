import { normalizeLibraryConfigShape, LibraryConfig } from './scanner';

export async function resolveLibraryConfig(context: any): Promise<LibraryConfig | null> {
    const { defaultGamesDir, fsSync, loadDB, saveDB } = context;
    if (process.argv.some(arg => arg.toLowerCase() === '--welcome' || arg.toLowerCase() === '-w')) return null;

    const db = await loadDB();
    const config = normalizeLibraryConfigShape(db.config);

    if (config.libraryPaths.length === 0 && fsSync.existsSync(defaultGamesDir)) {
        config.libraryPaths = [defaultGamesDir];
        config.libraryPath = defaultGamesDir;
    }

    db.config = config;
    await saveDB(db);
    return config;
}

export async function setupLibrary(context: any, type: 'default' | 'custom'): Promise<LibraryConfig | null> {
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
        libraryPaths: [nextLibraryPath]
    });
    db.config = nextConfig;
    await saveDB(db);
    return nextConfig;
}

export async function addLibraryPath(context: any): Promise<LibraryConfig | null> {
    const { dialog, loadDB, saveDB } = context;
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    if (result.canceled) return null;
    const nextPath = result.filePaths[0];

    const db = await loadDB();
    const config = normalizeLibraryConfigShape(db.config);

    if (!config.libraryPaths.includes(nextPath)) {
        config.libraryPaths.push(nextPath);
        config.libraryPath = config.libraryPaths[0] || '';
        db.config = config;
        await saveDB(db);
    }
    return config;
}

export async function removeLibraryPath(context: any, targetPath: string): Promise<LibraryConfig | null> {
    const { loadDB, saveDB } = context;
    const db = await loadDB();
    const config = normalizeLibraryConfigShape(db.config);

    const index = config.libraryPaths.indexOf(targetPath);
    if (index !== -1 && config.libraryPaths.length > 1) {
        config.libraryPaths.splice(index, 1);
        config.libraryPath = config.libraryPaths[0] || '';
        db.config = config;
        await saveDB(db);
    }
    return config;
}

export async function changeLibraryPath(context: any, oldPath: string): Promise<LibraryConfig | null> {
    const { dialog, loadDB, saveDB } = context;
    const dbForCheck = await loadDB();
    const configForCheck = normalizeLibraryConfigShape(dbForCheck.config);
    const targetIndex = configForCheck.libraryPaths.indexOf(oldPath);
    if (targetIndex === -1) return null;

    const result = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        defaultPath: oldPath
    });
    if (result.canceled) return null;
    const newPath = result.filePaths[0];

    const db = await loadDB();
    const config = normalizeLibraryConfigShape(db.config);
    const idx = config.libraryPaths.indexOf(oldPath);
    if (idx !== -1) {
        config.libraryPaths[idx] = newPath;
        config.libraryPath = config.libraryPaths[0] || '';
        db.config = config;
        await saveDB(db);
    }
    return config;
}

export async function updateLibraryConfig(context: any, updates: Partial<LibraryConfig> = {}): Promise<LibraryConfig> {
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

export async function resolveLibraryFolderToOpen(context: any): Promise<string> {
    const { defaultGamesDir, fsSync } = context;
    const config = await resolveLibraryConfig(context);
    if (config?.libraryPaths) {
        for (const p of config.libraryPaths) {
            if (fsSync.existsSync(p)) return p;
        }
    }
    if (fsSync.existsSync(defaultGamesDir)) {
        return defaultGamesDir;
    }
    return '';
}
