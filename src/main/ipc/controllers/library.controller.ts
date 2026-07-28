import * as path from 'node:path';
import { TelemetryShipper } from '../../telemetry/shipper';
import { RegisterIpcOptions } from '../types';

function validateAndResolvePath(targetPath: unknown, libraryPaths: string[]): string | null {
    if (typeof targetPath !== 'string' || !targetPath.trim() || !libraryPaths || !Array.isArray(libraryPaths) || libraryPaths.length === 0) {
        return null;
    }
    try {
        const resolvedTarget = path.resolve(targetPath);
        const isSafe = libraryPaths.some((libPath) => {
            if (typeof libPath !== 'string' || !libPath) return false;
            const resolvedLib = path.resolve(libPath);
            const relative = path.relative(resolvedLib, resolvedTarget);
            return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
        });
        return isSafe ? resolvedTarget : null;
    } catch {
        return null;
    }
}

export class LibraryIpcController {
    constructor(private readonly options: RegisterIpcOptions) {}

    public registerHandlers(): void {
        const {
            ipcMain,
            shell,
            categoryState,
            libraryState,
            playtimeSessionManager,
            translationService,
            startupServices,
            defaultGamesDir
        } = this.options;

        if (!ipcMain) return;

        ipcMain.handle('check-config', async () => startupServices?.resolveLibraryConfig());
        ipcMain.handle('get-default-path', () => defaultGamesDir);
        ipcMain.handle('setup-library', async (_event, type) => libraryState?.setupLibrary(type));

        ipcMain.handle('update-library-config', async (_event, updates = {}) => {
            const result = await libraryState?.updateLibraryConfig(updates);
            if (updates && 'telemetryEnabled' in updates) {
                await TelemetryShipper.getInstance().setTelemetryEnabled(updates.telemetryEnabled);
            }
            return result;
        });

        ipcMain.handle('get-games', async () => {
            if (!playtimeSessionManager || !startupServices) return [];
            await playtimeSessionManager.refreshSessions({ recover: true, emit: false });
            const games = await startupServices.loadGamesForConfig(await startupServices.resolveLibraryConfig());
            return playtimeSessionManager.overlayGames(games).map((game: any) => {
                const { iconData, ...rest } = game;
                return rest;
            });
        });

        ipcMain.handle('get-category-tree', async () => categoryState?.getCategoryTree());
        ipcMain.handle('create-category', async (_event, payload = {}) => categoryState?.createCategory(payload));
        ipcMain.handle('rename-category', async (_event, { categoryId, name }) => categoryState?.renameCategory(categoryId, name));
        ipcMain.handle('delete-category', async (_event, categoryId) => categoryState?.deleteCategory(categoryId));
        ipcMain.handle('assign-game-categories', async (_event, { gameId, categoryIds }) => categoryState?.assignGameCategories(gameId, categoryIds));
        ipcMain.handle('remove-game-category', async (_event, { gameId, categoryId }) => categoryState?.removeGameFromCategory(gameId, categoryId));

        ipcMain.on('launch-yume', async (_event, { gameKey, exePath, runInBackground }) => {
            try {
                const record = await libraryState?.getGameRecord(gameKey);
                const trustedExe = record?.exePath ?? exePath;
                if (typeof trustedExe !== 'string' || !trustedExe.trim()) return;
                const safeExe = path.resolve(trustedExe);
                if (record?.autoTranslate) {
                    await translationService?.prepareTranslator(gameKey, safeExe);
                } else {
                    await translationService?.removeTranslator(safeExe);
                }
                await playtimeSessionManager?.launchTrackedGame(gameKey, safeExe, runInBackground);
            } catch (error) {
                console.error(`[PLAYTIME][SESSIONS] failed to launch tracked game ${gameKey}:`, error);
            }
        });

        ipcMain.on('open-folder', async () => {
            const libraryPath = await libraryState?.resolveLibraryFolderToOpen();
            if (typeof libraryPath === 'string' && libraryPath.trim().length > 0 && shell) {
                const safePath = path.resolve(libraryPath);
                shell.openPath(safePath);
            }
        });

        ipcMain.handle('rename-game', async (_event, { gameKey, newName }) => libraryState?.renameGame(gameKey, newName));
        ipcMain.handle('toggle-favorite', async (_event, gameKey) => libraryState?.toggleFavorite(gameKey));
        ipcMain.handle('toggle-run-in-background', async (_event, gameKey) => libraryState?.toggleRunInBackground(gameKey));
        ipcMain.handle('toggle-auto-translate', async (_event, gameKey) => libraryState?.toggleAutoTranslate(gameKey));

        ipcMain.on('reveal-game', async (_event, targetPath) => {
            const config = await libraryState?.resolveLibraryConfig();
            const safePath = validateAndResolvePath(targetPath, config?.libraryPaths || []);
            if (safePath) {
                shell?.showItemInFolder(safePath);
            } else {
                console.warn(`[SECURITY] Blocked unauthorized reveal-game path: ${targetPath}`);
            }
        });

        ipcMain.on('open-path', async (_event, targetPath) => {
            const config = await libraryState?.resolveLibraryConfig();
            const safePath = validateAndResolvePath(targetPath, config?.libraryPaths || []);
            if (safePath) {
                shell?.openPath(safePath);
            } else {
                console.warn(`[SECURITY] Blocked unauthorized open-path: ${targetPath}`);
            }
        });

        ipcMain.handle('delete-game', async (_event, targetPath) => {
            const config = await libraryState?.resolveLibraryConfig();
            const safePath = validateAndResolvePath(targetPath, config?.libraryPaths || []);
            if (safePath) {
                return shell?.trashItem(safePath);
            }
            return { ok: false, error: 'unauthorized-path' };
        });

        ipcMain.handle('library:add-path', async () => libraryState?.addLibraryPath());
        ipcMain.handle('library:remove-path', async (_event, targetPath) => libraryState?.removeLibraryPath(targetPath));
        ipcMain.handle('library:change-path', async (_event, oldPath) => libraryState?.changeLibraryPath(oldPath));
    }
}
