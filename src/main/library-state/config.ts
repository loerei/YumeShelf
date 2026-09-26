import { normalizeLibraryConfigShape, isPlainObject, LibraryConfig } from './scanner';
import { type PlatformInput, normalizePathForPlatform, isSubsumedBy } from '../../shared/path-subsumption';
import { canonicalizeStoredGames } from './migrations';

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

async function promptDirectoryPicker(context: any, options: any = {}): Promise<string | null> {
    try {
        let result: any;
        if (typeof context.folderPickerSeam === 'function') {
            result = await context.folderPickerSeam(options);
        } else if (context.dialog?.showOpenDialog) {
            result = await context.dialog.showOpenDialog(options);
        } else {
            return null;
        }
        const chosenPath = Array.isArray(result)
            ? (result[0] || null)
            : (result?.canceled ? null : result?.filePaths?.[0] || null);
        return chosenPath;
    } catch (err) {
        console.error('[LIBRARY_STATE][DIRECTORY_PICKER] Native directory open dialog failed:', { error: err });
        return null;
    }
}

async function snapshotCategoryStateSafely(
    context: any,
    action: string,
    targetPath: string
): Promise<any> {
    try {
        if (context.categoryState?.loadCategoryState) {
            const rawCat = await context.categoryState.loadCategoryState();
            return rawCat ? JSON.parse(JSON.stringify(rawCat)) : null;
        }
    } catch (err) {
        console.warn('[LIBRARY_STATE][CONFIG_MUTATION] Failed to snapshot category state prior to path mutation:', {
            action,
            targetPath,
            error: err
        });
    }
    return null;
}

async function rollbackCategoryStateSafely(
    context: any,
    catStateSnapshot: any,
    action: string,
    targetPath: string,
    primaryErr: any
): Promise<void> {
    try {
        if (catStateSnapshot && context.categoryState?.saveCategoryState) {
            await context.categoryState.saveCategoryState(catStateSnapshot);
        }
    } catch (rollbackErr) {
        console.error('[LIBRARY_STATE][CONFIG_MUTATION] Secondary category rollback failed:', {
            action,
            targetPath,
            rollbackErr,
            originalError: primaryErr
        });
    }
}

export async function resolveLibraryConfig(context: any, targetPlatform?: PlatformInput): Promise<LibraryConfig | null> {
    const { defaultGamesDir, fsSync, loadDB, saveDB } = context;
    if (process.argv.some(arg => arg.toLowerCase() === '--welcome' || arg.toLowerCase() === '-w')) return null;

    const db = await loadDB();
    const config = normalizeLibraryConfigShape(db.config, targetPlatform);

    if (config.libraryPaths.length === 0) {
        if (
            typeof defaultGamesDir === 'string' &&
            defaultGamesDir.trim().length > 0 &&
            !/\0|\r|\n/.test(defaultGamesDir)
        ) {
            const canonicalDefault = normalizePathForPlatform(defaultGamesDir.trim(), targetPlatform);
            if (
                canonicalDefault &&
                canonicalDefault !== '/' &&
                !/^[A-Za-z]:\/?$/.test(canonicalDefault) &&
                Boolean(fsSync?.existsSync?.(defaultGamesDir))
            ) {
                config.libraryPaths = [defaultGamesDir];
                config.libraryPath = defaultGamesDir;
            }
        }
    }

    const hasGames = isPlainObject(db.games);
    const existingConfig = db.config ? normalizeLibraryConfigShape(db.config, targetPlatform) : null;
    const configChanged = !existingConfig || JSON.stringify(existingConfig) !== JSON.stringify(config);

    if (configChanged && !context.isDegraded?.() && hasGames) {
        db.config = config;
        await saveDB(db);
    }
    return config;
}

export async function setupLibrary(
    context: any,
    type: 'default' | 'custom',
    targetPlatform?: PlatformInput
): Promise<LibraryConfig | null> {
    if (context.isDegraded?.() === true) {
        throw new Error('Database is in degraded state');
    }

    const { defaultGamesDir, fsSync, loadDB, persistDbDirectly, saveDB, queue } = context;
    const saveFn = persistDbDirectly || saveDB;

    await loadDB();
    if (context.isDegraded?.() === true) {
        throw new Error('Database is in degraded state');
    }

    let nextLibraryPath = '';

    if (type === 'default') {
        nextLibraryPath = defaultGamesDir;
        if (
            typeof nextLibraryPath !== 'string' ||
            !nextLibraryPath.trim() ||
            /\0|\r|\n/.test(nextLibraryPath)
        ) {
            console.warn('[SECURITY][CONFIG_PATH_INJECTION] Blocked invalid path containing illegal characters:', { path: nextLibraryPath });
            throw new Error('Invalid library path: path contains illegal characters');
        }
        const canonicalPath = normalizePathForPlatform(nextLibraryPath.trim(), targetPlatform);
        if (!canonicalPath || canonicalPath === '/' || /^[A-Za-z]:\/?$/.test(canonicalPath)) {
            console.warn('[SECURITY][CONFIG] Blocked configuration of filesystem root as library path:', { targetPath: nextLibraryPath });
            throw new Error('Blocked configuration of filesystem root as library path');
        }
        const sanitizedPath = nextLibraryPath.trim().replace(/[\\/]+$/, '');
        if (Boolean(fsSync?.existsSync && !fsSync.existsSync(sanitizedPath))) {
            fsSync.mkdirSync?.(sanitizedPath, { recursive: true });
        }
        nextLibraryPath = sanitizedPath;
    } else {
        const chosenPath = await promptDirectoryPicker(context, { properties: ['openDirectory'] });
        if (!chosenPath) {
            return null;
        }
        if (
            typeof chosenPath !== 'string' ||
            !chosenPath.trim() ||
            /\0|\r|\n/.test(chosenPath)
        ) {
            console.warn('[SECURITY][CONFIG_PATH_INJECTION] Blocked invalid path containing illegal characters:', { path: chosenPath });
            throw new Error('Invalid library path: path contains illegal characters');
        }
        const canonicalPath = normalizePathForPlatform(chosenPath.trim(), targetPlatform);
        if (!canonicalPath || canonicalPath === '/' || /^[A-Za-z]:\/?$/.test(canonicalPath)) {
            console.warn('[SECURITY][CONFIG] Blocked configuration of filesystem root as library path:', { targetPath: chosenPath });
            throw new Error('Blocked configuration of filesystem root as library path');
        }
        const sanitizedPath = chosenPath.trim().replace(/[\\/]+$/, '');
        nextLibraryPath = sanitizedPath;
    }

    const persistTask = async () => {
        const db = await loadDB();
        if (context.isDegraded?.() === true) {
            throw new Error('Database is in degraded state');
        }
        const currentConfig = normalizeLibraryConfigShape(db.config, targetPlatform);
        const nextConfig = normalizeLibraryConfigShape({
            ...currentConfig,
            libraryPaths: [nextLibraryPath],
            folderAliases: currentConfig.folderAliases || {}
        }, targetPlatform);
        nextConfig.libraryPath = nextConfig.libraryPaths[0] || '';

        const configSnapshot = db.config ? {
            ...db.config,
            libraryPaths: [...(db.config.libraryPaths || [])],
            folderAliases: { ...(db.config.folderAliases || {}) }
        } : db.config;
        const gamesSnapshot = db.games ? JSON.parse(JSON.stringify(db.games)) : db.games;
        const catStateSnapshot = await snapshotCategoryStateSafely(context, 'setupLibrary', nextLibraryPath);

        db.config = nextConfig;

        try {
            await canonicalizeStoredGames(db, context.categoryState, nextConfig.libraryPaths, targetPlatform);
            await saveFn(db);
            return nextConfig;
        } catch (err) {
            db.config = configSnapshot;
            db.games = gamesSnapshot;
            await rollbackCategoryStateSafely(context, catStateSnapshot, 'setupLibrary', nextLibraryPath, err);
            console.error('[LIBRARY_STATE][CONFIG_MUTATION] Failed to persist library path mutation:', { action: 'setupLibrary', targetPath: nextLibraryPath, error: err });
            throw err;
        }
    };

    return queue ? queue(persistTask) : persistTask();
}

export async function addLibraryPath(
    context: any,
    targetPlatform?: PlatformInput
): Promise<LibraryConfig | null> {
    if (context.isDegraded?.() === true) {
        throw new Error('Database is in degraded state');
    }

    const { loadDB, persistDbDirectly, saveDB, queue } = context;
    const saveFn = persistDbDirectly || saveDB;

    await loadDB();
    if (context.isDegraded?.() === true) {
        throw new Error('Database is in degraded state');
    }

    const chosenPath = await promptDirectoryPicker(context, { properties: ['openDirectory'] });
    if (!chosenPath) {
        return null;
    }

    if (
        typeof chosenPath !== 'string' ||
        !chosenPath.trim() ||
        /\0|\r|\n/.test(chosenPath)
    ) {
        console.warn('[SECURITY][CONFIG_PATH_INJECTION] Blocked invalid path containing illegal characters:', { path: chosenPath });
        throw new Error('Invalid library path: path contains illegal characters');
    }

    const canonicalPath = normalizePathForPlatform(chosenPath.trim(), targetPlatform);
    if (!canonicalPath || canonicalPath === '/' || /^[A-Za-z]:\/?$/.test(canonicalPath)) {
        console.warn('[SECURITY][CONFIG] Blocked configuration of filesystem root as library path:', { targetPath: chosenPath });
        throw new Error('Blocked configuration of filesystem root as library path');
    }
    const sanitizedChosenPath = chosenPath.trim().replace(/[\\/]+$/, '');

    const persistTask = async () => {
        const db = await loadDB();
        if (context.isDegraded?.() === true) {
            throw new Error('Database is in degraded state');
        }
        const config = normalizeLibraryConfigShape(db.config, targetPlatform);

        if (config.libraryPaths.some(p => normalizePathForPlatform(p, targetPlatform) === canonicalPath)) {
            return config;
        }

        const configSnapshot = db.config ? {
            ...db.config,
            libraryPaths: [...(db.config.libraryPaths || [])],
            folderAliases: { ...(db.config.folderAliases || {}) }
        } : db.config;
        const gamesSnapshot = db.games ? JSON.parse(JSON.stringify(db.games)) : db.games;
        const catStateSnapshot = await snapshotCategoryStateSafely(context, 'addLibraryPath', sanitizedChosenPath);

        config.libraryPaths.push(sanitizedChosenPath);
        config.libraryPath = config.libraryPaths[0] || '';
        db.config = config;

        try {
            await canonicalizeStoredGames(db, context.categoryState, config.libraryPaths, targetPlatform);
            await saveFn(db);
            return config;
        } catch (err) {
            db.config = configSnapshot;
            db.games = gamesSnapshot;
            await rollbackCategoryStateSafely(context, catStateSnapshot, 'addLibraryPath', sanitizedChosenPath, err);
            console.error('[LIBRARY_STATE][CONFIG_MUTATION] Failed to persist library path mutation:', { action: 'addLibraryPath', targetPath: sanitizedChosenPath, error: err });
            throw err;
        }
    };

    return queue ? queue(persistTask) : persistTask();
}

export async function removeLibraryPath(
    context: any,
    targetPath: string,
    targetPlatform?: PlatformInput
): Promise<LibraryConfig | null> {
    if (context.isDegraded?.() === true) {
        throw new Error('Database is in degraded state');
    }

    const { loadDB, persistDbDirectly, saveDB, queue } = context;
    const saveFn = persistDbDirectly || saveDB;

    if (typeof targetPath !== 'string' || !targetPath.trim()) {
        console.warn('[LIBRARY_STATE][REMOVE_PATH] Invalid target path: expected non-empty string', { targetPath });
        const db = await loadDB();
        if (context.isDegraded?.() === true) {
            throw new Error('Database is in degraded state');
        }
        return normalizeLibraryConfigShape(db.config, targetPlatform);
    }

    const persistTask = async () => {
        const db = await loadDB();
        if (context.isDegraded?.() === true) {
            throw new Error('Database is in degraded state');
        }
        const config = normalizeLibraryConfigShape(db.config, targetPlatform);
        const targetCanonical = normalizePathForPlatform(targetPath, targetPlatform);
        const index = config.libraryPaths.findIndex(
            p => normalizePathForPlatform(p, targetPlatform) === targetCanonical
        );

        if (index === -1) {
            const isRootTarget = targetCanonical === '/' || /^[A-Za-z]:\/?$/.test(targetCanonical);
            const rawPaths = Array.isArray(db.config?.libraryPaths)
                ? db.config.libraryPaths
                : (db.config?.libraryPath ? [db.config.libraryPath] : []);
            const wasPresentInRaw = rawPaths.some(
                (p: any) => typeof p === 'string' && normalizePathForPlatform(p, targetPlatform) === targetCanonical
            );

            if (isRootTarget && wasPresentInRaw) {
                if (config.libraryPaths.length === 0) {
                    console.warn('[LIBRARY_STATE][REMOVE_PATH] Cannot remove library path: path not found or minimum root count reached', { targetPath, configuredCount: 0 });
                    return config;
                }
                const configSnapshot = db.config ? {
                    ...db.config,
                    libraryPaths: [...(db.config.libraryPaths || [])],
                    folderAliases: { ...(db.config.folderAliases || {}) }
                } : db.config;
                const gamesSnapshot = db.games ? JSON.parse(JSON.stringify(db.games)) : db.games;
                const catStateSnapshot = await snapshotCategoryStateSafely(context, 'removeLibraryPath', targetPath);

                config.libraryPath = config.libraryPaths[0] || '';
                config.folderAliases = { ...(config.folderAliases || {}) };
                db.config = config;

                try {
                    await canonicalizeStoredGames(db, context.categoryState, config.libraryPaths, targetPlatform, { purgeOrphans: true });
                    await saveFn(db);
                    return config;
                } catch (err) {
                    db.config = configSnapshot;
                    db.games = gamesSnapshot;
                    await rollbackCategoryStateSafely(context, catStateSnapshot, 'removeLibraryPath', targetPath, err);
                    console.error('[LIBRARY_STATE][CONFIG_MUTATION] Failed to persist library path mutation:', { action: 'removeLibraryPath', targetPath, error: err });
                    throw err;
                }
            } else {
                console.warn('[LIBRARY_STATE][REMOVE_PATH] Cannot remove library path: path not found or minimum root count reached', { targetPath, configuredCount: config.libraryPaths.length });
                return config;
            }
        }

        if (config.libraryPaths.length <= 1) {
            console.warn('[LIBRARY_STATE][REMOVE_PATH] Cannot remove library path: path not found or minimum root count reached', { targetPath, configuredCount: config.libraryPaths.length });
            return config;
        }

        const configSnapshot = db.config ? {
            ...db.config,
            libraryPaths: [...(db.config.libraryPaths || [])],
            folderAliases: { ...(db.config.folderAliases || {}) }
        } : db.config;
        const gamesSnapshot = db.games ? JSON.parse(JSON.stringify(db.games)) : db.games;
        const catStateSnapshot = await snapshotCategoryStateSafely(context, 'removeLibraryPath', targetPath);

        config.libraryPaths = config.libraryPaths.filter((_, i) => i !== index);
        config.libraryPath = config.libraryPaths[0] || '';
        config.folderAliases = { ...(config.folderAliases || {}) };
        db.config = config;

        try {
            await canonicalizeStoredGames(db, context.categoryState, config.libraryPaths, targetPlatform, { purgeOrphans: true });
            await saveFn(db);
            return config;
        } catch (err) {
            db.config = configSnapshot;
            db.games = gamesSnapshot;
            await rollbackCategoryStateSafely(context, catStateSnapshot, 'removeLibraryPath', targetPath, err);
            console.error('[LIBRARY_STATE][CONFIG_MUTATION] Failed to persist library path mutation:', { action: 'removeLibraryPath', targetPath, error: err });
            throw err;
        }
    };

    return queue ? queue(persistTask) : persistTask();
}

export async function changeLibraryPath(
    context: any,
    oldPath: string,
    targetPlatform?: PlatformInput
): Promise<LibraryConfig | null> {
    if (context.isDegraded?.() === true) {
        throw new Error('Database is in degraded state');
    }

    const { loadDB, persistDbDirectly, saveDB, queue } = context;
    const saveFn = persistDbDirectly || saveDB;

    if (typeof oldPath !== 'string' || !oldPath.trim()) {
        console.warn('[LIBRARY_STATE][CHANGE_PATH] Invalid oldPath: expected non-empty string', { oldPath });
        const db = await loadDB();
        if (context.isDegraded?.() === true) {
            throw new Error('Database is in degraded state');
        }
        return normalizeLibraryConfigShape(db.config, targetPlatform);
    }

    const initialDb = await loadDB();
    if (context.isDegraded?.() === true) {
        throw new Error('Database is in degraded state');
    }
    const currentConfig = normalizeLibraryConfigShape(initialDb.config, targetPlatform);
    const oldCanonical = normalizePathForPlatform(oldPath, targetPlatform);
    const oldIndex = currentConfig.libraryPaths.findIndex(
        p => normalizePathForPlatform(p, targetPlatform) === oldCanonical
    );
    if (oldIndex === -1) {
        console.warn('[LIBRARY_STATE][CHANGE_PATH] Target oldPath not found in configured library paths:', { oldPath });
        return null;
    }

    const chosenPath = await promptDirectoryPicker(context, {
        properties: ['openDirectory'],
        defaultPath: oldPath
    });
    if (!chosenPath) {
        return null;
    }

    if (
        typeof chosenPath !== 'string' ||
        !chosenPath.trim() ||
        /\0|\r|\n/.test(chosenPath)
    ) {
        console.warn('[SECURITY][CONFIG_PATH_INJECTION] Blocked invalid path containing illegal characters:', { path: chosenPath });
        throw new Error('Invalid library path: path contains illegal characters');
    }

    const canonicalPath = normalizePathForPlatform(chosenPath.trim(), targetPlatform);
    if (!canonicalPath || canonicalPath === '/' || /^[A-Za-z]:\/?$/.test(canonicalPath)) {
        console.warn('[SECURITY][CONFIG] Blocked configuration of filesystem root as library path:', { targetPath: chosenPath });
        throw new Error('Blocked configuration of filesystem root as library path');
    }
    const sanitizedChosenPath = chosenPath.trim().replace(/[\\/]+$/, '');

    if (canonicalPath === oldCanonical) {
        return null;
    }

    const persistTask = async () => {
        const db = await loadDB();
        if (context.isDegraded?.() === true) {
            throw new Error('Database is in degraded state');
        }
        const config = normalizeLibraryConfigShape(db.config, targetPlatform);
        const targetIndex = config.libraryPaths.findIndex(
            p => normalizePathForPlatform(p, targetPlatform) === oldCanonical
        );
        if (targetIndex === -1) {
            console.warn('[LIBRARY_STATE][CHANGE_PATH] Target oldPath no longer found in configured library paths during persist task:', {
                oldPath,
                configuredRoots: config.libraryPaths
            });
            return null;
        }

        const configSnapshot = db.config ? {
            ...db.config,
            libraryPaths: [...(db.config.libraryPaths || [])],
            folderAliases: { ...(db.config.folderAliases || {}) }
        } : db.config;
        const gamesSnapshot = db.games ? JSON.parse(JSON.stringify(db.games)) : db.games;
        const catStateSnapshot = await snapshotCategoryStateSafely(context, 'changeLibraryPath', sanitizedChosenPath);

        const isDuplicateOfExisting = config.libraryPaths.some(
            p => normalizePathForPlatform(p, targetPlatform) === canonicalPath &&
                 normalizePathForPlatform(p, targetPlatform) !== oldCanonical
        );

        if (isDuplicateOfExisting) {
            if (config.libraryPaths.length <= 1) {
                throw new Error('Cannot prune path: minimum root count reached');
            }
            config.libraryPaths = config.libraryPaths.filter((_, i) => i !== targetIndex);
            config.folderAliases = { ...(config.folderAliases || {}) };
        } else {
            config.libraryPaths[targetIndex] = sanitizedChosenPath;
            const nextAliases: Record<string, string> = {};
            for (const [aliasKey, aliasVal] of Object.entries(config.folderAliases || {})) {
                const canonicalAliasKey = normalizePathForPlatform(aliasKey, targetPlatform);
                if (isSubsumedBy(canonicalAliasKey, oldCanonical, targetPlatform)) {
                    let newKey = canonicalPath;
                    if (canonicalAliasKey !== oldCanonical) {
                        const subpath = canonicalAliasKey.slice(
                            oldCanonical.endsWith('/') ? oldCanonical.length : oldCanonical.length + 1
                        );
                        newKey = subpath
                            ? (canonicalPath.endsWith('/') ? `${canonicalPath}${subpath}` : `${canonicalPath}/${subpath}`)
                            : canonicalPath;
                    }
                    const canonicalNewKey = normalizePathForPlatform(newKey, targetPlatform);
                    if (canonicalNewKey && !['__proto__', 'constructor', 'prototype'].includes(canonicalNewKey)) {
                        nextAliases[canonicalNewKey] = aliasVal as string;
                    }
                } else {
                    if (canonicalAliasKey && !['__proto__', 'constructor', 'prototype'].includes(canonicalAliasKey)) {
                        nextAliases[canonicalAliasKey] = aliasVal as string;
                    }
                }
            }
            config.folderAliases = nextAliases;
        }

        config.libraryPath = config.libraryPaths[0] || '';
        db.config = config;

        try {
            await canonicalizeStoredGames(
                db,
                context.categoryState,
                config.libraryPaths,
                targetPlatform,
                isDuplicateOfExisting ? { purgeOrphans: true } : undefined
            );
            await saveFn(db);
            return config;
        } catch (err) {
            db.config = configSnapshot;
            db.games = gamesSnapshot;
            await rollbackCategoryStateSafely(context, catStateSnapshot, 'changeLibraryPath', sanitizedChosenPath, err);
            console.error('[LIBRARY_STATE][CONFIG_MUTATION] Failed to persist library path mutation:', { action: 'changeLibraryPath', targetPath: sanitizedChosenPath, error: err });
            throw err;
        }
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
            if (Boolean(fsSync?.existsSync?.(p))) return p;
        }
    }
    if (Boolean(fsSync?.existsSync?.(defaultGamesDir))) {
        return defaultGamesDir;
    }
    return '';
}
