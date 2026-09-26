import { normalizeLibraryConfigShape, isPlainObject, LibraryConfig } from './scanner';
import { type PlatformInput, normalizePathForPlatform, isSubsumedBy } from '../../shared/path-subsumption';

const PERMISSIBLE_CONFIG_KEYS = new Set<string>([
    'libraryPaths',
    'folderAliases',
    'telemetryEnabled',
    'titleDisplayMode',
    'displayProductCodes',
    'preferredLocale',
    'maxDepth',
    'autoLaunch',
    'minimizeToTray',
    'exposeBetaOptions'
]);

export async function resolveLibraryConfig(context: any): Promise<LibraryConfig | null> {
    const { defaultGamesDir, fsSync, loadDB, saveDB } = context;
    if (process.argv.some(arg => arg.toLowerCase() === '--welcome' || arg.toLowerCase() === '-w')) return null;

    const db = await loadDB();
    const config = normalizeLibraryConfigShape(db.config);

    if (config.libraryPaths.length === 0 && fsSync.existsSync(defaultGamesDir)) {
        config.libraryPaths = [defaultGamesDir];
        config.libraryPath = defaultGamesDir;
    }

    const hasGames = isPlainObject(db.games);
    const existingConfig = db.config ? normalizeLibraryConfigShape(db.config) : null;
    const configChanged = !existingConfig || JSON.stringify(existingConfig) !== JSON.stringify(config);

    if (configChanged && !context.isDegraded?.() && hasGames) {
        db.config = config;
        await saveDB(db);
    }
    return config;
}

export async function setupLibrary(context: any, type: 'default' | 'custom'): Promise<LibraryConfig | null> {
    const { defaultGamesDir, dialog, fsSync, loadDB, persistDbDirectly, saveDB, queue } = context;
    const saveFn = persistDbDirectly || saveDB;
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

    const persistTask = async () => {
        const db = await loadDB();
        const currentConfig = normalizeLibraryConfigShape(db.config);
        const nextConfig = normalizeLibraryConfigShape({
            ...currentConfig,
            libraryPaths: [nextLibraryPath]
        });
        db.config = nextConfig;
        await saveFn(db);
        return nextConfig;
    };

    return queue ? queue(persistTask) : persistTask();
}

export async function addLibraryPath(context: any): Promise<LibraryConfig | null> {
    const { dialog, loadDB, persistDbDirectly, saveDB, queue } = context;
    const saveFn = persistDbDirectly || saveDB;
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    if (result.canceled) return null;
    const nextPath = result.filePaths[0];

    const persistTask = async () => {
        const db = await loadDB();
        const config = normalizeLibraryConfigShape(db.config);

        if (!config.libraryPaths.includes(nextPath)) {
            config.libraryPaths.push(nextPath);
            config.libraryPath = config.libraryPaths[0] || '';
            db.config = config;
            await saveFn(db);
        }
        return config;
    };

    return queue ? queue(persistTask) : persistTask();
}

export async function removeLibraryPath(context: any, targetPath: string): Promise<LibraryConfig | null> {
    const { loadDB, persistDbDirectly, saveDB } = context;
    const saveFn = persistDbDirectly || saveDB;
    const db = await loadDB();
    const config = normalizeLibraryConfigShape(db.config);

    const index = config.libraryPaths.indexOf(targetPath);
    if (index !== -1 && config.libraryPaths.length > 1) {
        config.libraryPaths.splice(index, 1);
        config.libraryPath = config.libraryPaths[0] || '';
        db.config = config;
        await saveFn(db);
    }
    return config;
}

export async function changeLibraryPath(context: any, oldPath: string): Promise<LibraryConfig | null> {
    const { dialog, loadDB, persistDbDirectly, saveDB, queue } = context;
    const saveFn = persistDbDirectly || saveDB;
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

    const persistTask = async () => {
        const db = await loadDB();
        const config = normalizeLibraryConfigShape(db.config);
        const idx = config.libraryPaths.indexOf(oldPath);
        if (idx !== -1) {
            config.libraryPaths[idx] = newPath;
            config.libraryPath = config.libraryPaths[0] || '';
            db.config = config;
            await saveFn(db);
        }
        return config;
    };

    return queue ? queue(persistTask) : persistTask();
}

export async function updateLibraryConfig(
    context: any,
    updates: Partial<LibraryConfig> = {},
    targetPlatform?: PlatformInput
): Promise<LibraryConfig> {
    if (context.isDegraded?.() === true) {
        throw new Error('Database is in degraded state');
    }

    const { loadDB, persistDbDirectly, saveDB } = context;
    const saveFn = persistDbDirectly || saveDB;

    // Delete legacy singular property to prevent directory injection
    delete (updates as any).libraryPath;

    if (updates.libraryPaths !== undefined) {
        if (!Array.isArray(updates.libraryPaths) || updates.libraryPaths.length === 0 || updates.libraryPaths.some(p => typeof p !== 'string' || !p.trim())) {
            throw new Error('Invalid libraryPaths: expected non-empty array of non-empty path strings');
        }
        for (const item of updates.libraryPaths) {
            if (/\0|\r|\n/.test(item)) {
                console.warn('[SECURITY][CONFIG_PATH_INJECTION] Blocked invalid path containing illegal characters or invalid type in updateLibraryConfig:', { path: item });
                throw new Error('Invalid libraryPaths: path contains illegal characters');
            }
        }
    }

    if (updates.folderAliases !== undefined) {
        if (!isPlainObject(updates.folderAliases)) {
            throw new Error('Invalid folderAliases: expected plain object');
        }
    }

    const db = await loadDB();
    if (context.isDegraded?.() === true) {
        throw new Error('Database is in degraded state');
    }

    const currentConfig = normalizeLibraryConfigShape(db.config, targetPlatform);

    if (updates.libraryPaths !== undefined) {
        const currentCanonical = Array.from(new Set(currentConfig.libraryPaths.map(p => normalizePathForPlatform(p, targetPlatform))));
        if (currentCanonical.length === 0) throw new Error('Cannot reorder empty libraryPaths configuration');
        if (new Set(updates.libraryPaths.map(p => normalizePathForPlatform(p, targetPlatform))).size !== updates.libraryPaths.length) throw new Error('Duplicate libraryPaths in permutation');
        const updateCanonical = Array.from(new Set(updates.libraryPaths.map(p => normalizePathForPlatform(p, targetPlatform))));
        if (updateCanonical.length !== currentCanonical.length) throw new Error('Invalid libraryPaths permutation length');
        if (!updateCanonical.every(p => currentCanonical.includes(p))) {
            console.warn('[SECURITY][CONFIG_PATH_INJECTION] Blocked unauthorized library path in permutation:', {
                unauthorizedPaths: updateCanonical.filter(p => !currentCanonical.includes(p)),
                configuredRoots: currentConfig.libraryPaths
            });
            throw new Error('Unauthorized libraryPath in permutation');
        }
    }

    let mergedFolderAliases: Record<string, string> = { ...(currentConfig.folderAliases || {}) };

    if (updates.folderAliases !== undefined) {
        const preExistingCanonicalKeys = new Set(
            Object.keys(currentConfig.folderAliases || {}).map(k => normalizePathForPlatform(k, targetPlatform))
        );

        const sanitizedUpdatesAliases: Record<string, string> = {};

        for (const key of Object.keys(updates.folderAliases)) {
            if (!Object.prototype.hasOwnProperty.call(updates.folderAliases, key)) {
                continue;
            }
            if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
                continue;
            }
            if (typeof key !== 'string' || !key.trim()) {
                continue;
            }
            if (/\0|\r|\n/.test(key)) {
                console.warn('[SECURITY][CONFIG_ALIAS_INJECTION] Blocked folder alias key containing illegal characters:', { key });
                continue;
            }
            const canonicalKey = normalizePathForPlatform(key, targetPlatform);
            if (!canonicalKey || canonicalKey === '__proto__' || canonicalKey === 'constructor' || canonicalKey === 'prototype') {
                continue;
            }

            const isPreExisting = preExistingCanonicalKeys.has(canonicalKey);
            if (!isPreExisting) {
                const isContained = currentConfig.libraryPaths.some(root => isSubsumedBy(canonicalKey, root, targetPlatform));
                if (!isContained) {
                    console.warn('[SECURITY][CONFIG_ALIAS_INJECTION] Blocked unauthorized folder alias key outside library roots:', {
                        aliasKey: canonicalKey,
                        configuredRoots: currentConfig.libraryPaths
                    });
                    throw new Error('Unauthorized folder alias key outside library roots');
                }
            }

            const rawVal = (updates.folderAliases as any)[key];
            const val = typeof rawVal === 'string' ? rawVal.replace(/[\r\n\t\x00-\x1f]/g, '').trim().slice(0, 255) : '';
            sanitizedUpdatesAliases[canonicalKey] = val;
        }

        for (const [canonicalKey, val] of Object.entries(sanitizedUpdatesAliases)) {
            if (val) {
                mergedFolderAliases[canonicalKey] = val;
            } else {
                delete mergedFolderAliases[canonicalKey];
            }
        }
    }

    const filteredUpdates: Record<string, any> = {};
    for (const key of Object.keys(updates)) {
        if (PERMISSIBLE_CONFIG_KEYS.has(key)) {
            filteredUpdates[key] = (updates as any)[key];
        }
    }

    const mergedConfig: any = {
        ...currentConfig,
        ...filteredUpdates,
        ...(updates.folderAliases !== undefined ? { folderAliases: mergedFolderAliases } : {})
    };

    const nextConfig = normalizeLibraryConfigShape(mergedConfig, targetPlatform);

    const previousDbConfig = db.config ? JSON.parse(JSON.stringify(db.config)) : db.config;
    db.config = nextConfig;

    try {
        await saveFn(db);
    } catch (err) {
        db.config = previousDbConfig;
        console.error('[LIBRARY_STATE][CONFIG_UPDATE] Failed to persist configuration updates:', { updates, error: err });
        throw err;
    }

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
