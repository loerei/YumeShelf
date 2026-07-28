import * as fsSync from 'node:fs';
import { RegisterIpcOptions } from '../types';

export class AppIpcController {
    private devAutoLaunchState: string = 'off';

    constructor(private readonly options: RegisterIpcOptions) {}

    private parseAutoLaunchSetting(configVal: unknown): { openAtLogin: boolean; args: string[]; value: string } {
        let value = 'off';
        if (configVal === 'minimized') {
            value = 'minimized';
        } else if (configVal === 'on' || configVal === 'true' || configVal === true) {
            value = 'on';
        }
        const openAtLogin = (value === 'on' || value === 'minimized');
        const args = (value === 'minimized') ? ['--minimized'] : [];
        return { openAtLogin, args, value };
    }

    public initStartupAutoLaunch(): void {
        const { app, paths } = this.options;
        if (!app || !paths?.dbFile || !fsSync.existsSync(paths.dbFile)) return;

        try {
            const db = JSON.parse(fsSync.readFileSync(paths.dbFile, 'utf8'));
            if (!db?.config) return;

            const { openAtLogin, args, value } = this.parseAutoLaunchSetting(db.config.autoLaunch);

            if (app.isPackaged) {
                app.setLoginItemSettings({
                    openAtLogin,
                    path: app.getPath('exe'),
                    args
                });
                console.log(`[AUTO-LAUNCH][STARTUP] Synced OS startup settings: openAtLogin=${openAtLogin}, args=${JSON.stringify(args)}`);
            } else {
                this.devAutoLaunchState = value;
                console.log(`[AUTO-LAUNCH][DEV][STARTUP] Synced devAutoLaunchState: ${this.devAutoLaunchState}`);
            }
        } catch (e) {
            console.error('[AUTO-LAUNCH][STARTUP] Failed to sync autoLaunch on startup:', e);
        }
    }

    public registerHandlers(): void {
        const { app, ipcMain, shell, appUpdateServices, languagePackServices, startupServices } = this.options;
        if (!ipcMain) return;

        ipcMain.handle('get-app-version', async () => app?.getVersion());
        ipcMain.handle('get-language-state', async () => languagePackServices?.buildLanguageState());
        ipcMain.handle('bootstrap-app', async (event, options = {}) => startupServices?.bootstrapAppState(event.sender, options));

        ipcMain.handle('log-app-update-debug', async (_event, message) => {
            if (appUpdateServices && typeof appUpdateServices.logDebug === 'function') {
                await appUpdateServices.logDebug(String(message || ''));
            }
            return { ok: true };
        });

        ipcMain.handle('start-app-update-download', async () => appUpdateServices?.startBackgroundDownload());
        ipcMain.handle('restart-and-install-app-update', async () => appUpdateServices?.restartAndInstallDownloadedUpdate());
        ipcMain.handle('schedule-app-update-next-launch', async () => appUpdateServices?.scheduleInstallOnNextLaunch());
        ipcMain.handle('begin-deferred-app-update-install', async () => appUpdateServices?.beginDeferredInstallOnLaunch());
        ipcMain.handle('open-app-update-download-page', async () => appUpdateServices?.openAppUpdateDownloadPage());

        ipcMain.handle('open-external-url', async (_event, url) => {
            const normalizedUrl = String(url || '').trim();
            if (!/^https?:\/\//i.test(normalizedUrl)) {
                return { ok: false, reason: 'invalid-url' };
            }
            if (shell) {
                await shell.openExternal(normalizedUrl);
            }
            return { ok: true };
        });

        ipcMain.handle('is-dev', () => app ? !app.isPackaged : true);

        this.initStartupAutoLaunch();

        ipcMain.handle('set-auto-launch', async (_event, value) => {
            try {
                const openAtLogin = (value === 'on' || value === 'minimized' || value === true);
                const args = (value === 'minimized') ? ['--minimized'] : [];
                if (app?.isPackaged) {
                    app.setLoginItemSettings({
                        openAtLogin,
                        path: app.getPath('exe'),
                        args
                    });
                } else {
                    if (value === 'minimized') {
                        this.devAutoLaunchState = 'minimized';
                    } else if (openAtLogin) {
                        this.devAutoLaunchState = 'on';
                    } else {
                        this.devAutoLaunchState = 'off';
                    }
                    console.log(`[AUTO-LAUNCH][DEV] Skipped OS startup registration (openAtLogin: ${openAtLogin}, args: ${JSON.stringify(args)})`);
                }
                return { success: true };
            } catch (error: any) {
                console.error('[AUTO-LAUNCH] Failed to set startup settings:', error);
                return { success: false, error: error.message };
            }
        });

        ipcMain.handle('get-auto-launch', async () => {
            try {
                if (!app?.isPackaged) {
                    return this.devAutoLaunchState;
                }
                const settings = app.getLoginItemSettings() as any;
                if (!settings.openAtLogin) return 'off';
                if (settings.args?.includes('--minimized')) {
                    return 'minimized';
                }
                return 'on';
            } catch {
                return 'off';
            }
        });
    }
}
