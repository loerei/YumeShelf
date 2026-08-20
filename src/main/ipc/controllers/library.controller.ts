import * as fs from 'node:fs';
import * as path from 'node:path';
import { TelemetryShipper } from '../../telemetry/shipper';
import { isPathWithinLibrary } from '../path-validator';
import { RegisterIpcOptions } from '../types';
import { GameRunnerService } from '../../game-runner';

async function resolveValidatedLibraryPath(libraryState: any, targetPath: unknown): Promise<string | null> {
    if (typeof targetPath !== 'string' || !targetPath.trim()) return null;
    const config = await libraryState?.resolveLibraryConfig();
    if (!config?.libraryPaths) return null;
    const safePath = path.resolve(targetPath);
    if (isPathWithinLibrary(safePath, config.libraryPaths) && fs.existsSync(safePath)) {
        return safePath;
    }
    return null;
}

export class LibraryIpcController {
    private readonly gameRunnerService: GameRunnerService;

    constructor(private readonly options: RegisterIpcOptions) {
        this.gameRunnerService = new GameRunnerService();
    }

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

        ipcMain.handle('get-runner-settings', async () => this.gameRunnerService.getSettings());
        ipcMain.handle('set-runner-settings', async (_event, updates = {}) => this.gameRunnerService.updateSettings(updates));
        ipcMain.handle('detect-installed-runners', async (_event, forceRefresh = false) => this.gameRunnerService.getDetectedRunners(Boolean(forceRefresh)));

        ipcMain.on('launch-yume', async (_event, { gameKey, exePath, runInBackground }) => {
            try {
                const record = await libraryState?.getGameRecord(gameKey);
                const trustedExe = record?.exePath ?? exePath;
                if (typeof trustedExe !== 'string' || !trustedExe.trim()) return;
                const safeExe = path.resolve(trustedExe);
                if (fs.existsSync(safeExe)) {
                    if (record?.autoTranslate) {
                        await translationService?.prepareTranslator(gameKey, safeExe);
                    } else {
                        await translationService?.removeTranslator(safeExe);
                    }

                    const launchParams = await this.gameRunnerService.resolveLaunch(
                        { platform: record?.platform, exePath: safeExe, gameKey },
                        record?.runnerConfig
                    );

                    await playtimeSessionManager?.launchTrackedGame(gameKey, safeExe, runInBackground, launchParams);
                }
            } catch (error) {
                console.error(`[PLAYTIME][SESSIONS] failed to launch tracked game ${gameKey}:`, error);
            }
        });

        ipcMain.on('open-folder', async () => {
            const libraryPath = await libraryState?.resolveLibraryFolderToOpen();
            if (typeof libraryPath === 'string' && libraryPath.trim().length > 0 && shell) {
                const safePath = path.resolve(libraryPath);
                if (fs.existsSync(safePath)) {
                    shell.openPath(safePath);
                }
            }
        });

        ipcMain.handle('rename-game', async (_event, { gameKey, newName }) => libraryState?.renameGame(gameKey, newName));
        ipcMain.handle('toggle-favorite', async (_event, gameKey) => libraryState?.toggleFavorite(gameKey));
        ipcMain.handle('toggle-run-in-background', async (_event, gameKey) => libraryState?.toggleRunInBackground(gameKey));
        ipcMain.handle('toggle-auto-translate', async (_event, gameKey) => libraryState?.toggleAutoTranslate(gameKey));

        ipcMain.on('reveal-game', async (_event, targetPath) => {
            const safePath = await resolveValidatedLibraryPath(libraryState, targetPath);
            if (safePath) {
                shell?.showItemInFolder(safePath);
            } else {
                console.warn(`[SECURITY] Blocked unauthorized reveal-game path: ${targetPath}`);
            }
        });

        ipcMain.on('open-path', async (_event, targetPath) => {
            const safePath = await resolveValidatedLibraryPath(libraryState, targetPath);
            if (safePath) {
                shell?.openPath(safePath);
            } else {
                console.warn(`[SECURITY] Blocked unauthorized open-path: ${targetPath}`);
            }
        });

        ipcMain.handle('delete-game', async (_event, targetPath) => {
            const safePath = await resolveValidatedLibraryPath(libraryState, targetPath);
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
