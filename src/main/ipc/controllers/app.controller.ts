import * as fsSync from 'node:fs';
import { RegisterIpcOptions } from '../types';

export type DevAutoLaunchState = 'off' | 'on' | 'minimized';

export class AppIpcController {
    private devAutoLaunchState: DevAutoLaunchState = 'off';

    constructor(private readonly options: RegisterIpcOptions) {}

    private isAppPackaged(): boolean {
        const app = this.options.app;
        if (!app) return false;
        if (typeof app.isPackaged === 'boolean') return app.isPackaged;
        if (typeof app.isPackaged === 'function') return (app.isPackaged as any)();
        return false;
    }

    private parseAutoLaunchSetting(configVal: unknown): { openAtLogin: boolean; args: string[]; value: DevAutoLaunchState } {
        let value: DevAutoLaunchState = 'off';
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
            const raw = fsSync.readFileSync(paths.dbFile, 'utf8');
            const data = JSON.parse(raw);
            const rawAutoLaunch = data.config?.autoLaunch ?? data.autoLaunch;
            const { openAtLogin, args, value } = this.parseAutoLaunchSetting(rawAutoLaunch);

            if (!this.isAppPackaged()) {
                this.devAutoLaunchState = value;
                console.log(`[AUTO-LAUNCH][DEV][STARTUP] Synced devAutoLaunchState: ${this.devAutoLaunchState}`);
                return;
            }

            if (typeof app.setLoginItemSettings === 'function') {
                app.setLoginItemSettings({ openAtLogin, args });
                console.log(`[AUTO-LAUNCH][STARTUP] Synced OS startup settings: openAtLogin=${openAtLogin}, args=${JSON.stringify(args)}`);
            }
        } catch (error) {
            console.error('[AUTO-LAUNCH][STARTUP] Failed to sync autoLaunch settings:', error);
        }
    }

    public registerHandlers(): void {
        const { ipcMain, app, shell, startupServices, appUpdateServices, languagePackServices, paths } = this.options;
        if (!ipcMain) return;

        this.initStartupAutoLaunch();

        ipcMain.handle('get-app-version', () => (typeof app?.getVersion === 'function' ? app.getVersion() : '1.5.12'));
        ipcMain.handle('is-dev', () => !this.isAppPackaged());

        ipcMain.handle('get-language-state', async () => languagePackServices?.buildLanguageState());
        ipcMain.handle('bootstrap-app', async (event, options = {}) => {
            const bootstrapData = await startupServices?.bootstrapAppState(event.sender, options);
            if (typeof startupServices?.triggerBackgroundChecks === 'function') {
                setImmediate(() => {
                    void startupServices.triggerBackgroundChecks(options);
                });
            }
            return bootstrapData;
        });

        ipcMain.handle('log-app-update-debug', async (_event, message: unknown) => {
            if (typeof appUpdateServices?.logDebug === 'function') {
                const text = typeof message === 'string' ? message : JSON.stringify(message ?? '');
                await appUpdateServices.logDebug(text);
            }
            return { ok: true };
        });

        ipcMain.handle('start-app-update-download', async () => appUpdateServices?.startBackgroundDownload());
        ipcMain.handle('restart-and-install-app-update', async () => appUpdateServices?.restartAndInstallDownloadedUpdate());
        ipcMain.handle('schedule-app-update-next-launch', async () => appUpdateServices?.scheduleInstallOnNextLaunch());
        ipcMain.handle('begin-deferred-app-update-install', async () => appUpdateServices?.beginDeferredInstallOnLaunch());
        ipcMain.handle('open-app-update-download-page', async () => appUpdateServices?.openAppUpdateDownloadPage());

        ipcMain.handle('open-external-url', async (_event, url: unknown) => {
            const normalizedUrl = typeof url === 'string' ? url.trim() : '';
            if (!/^https?:\/\//i.test(normalizedUrl)) {
                return { ok: false, reason: 'invalid-url' };
            }
            await shell?.openExternal(normalizedUrl);
            return { ok: true };
        });

        ipcMain.handle('update:check', async () => appUpdateServices?.checkForAppUpdate());
        ipcMain.handle('update:download', async () => appUpdateServices?.startBackgroundDownload());
        ipcMain.handle('update:quit-and-install', () => appUpdateServices?.restartAndInstallDownloadedUpdate());

        ipcMain.handle('set-auto-launch', async (_event, enabled: unknown) => {
            const { openAtLogin, args, value } = this.parseAutoLaunchSetting(enabled);

            if (!this.isAppPackaged()) {
                this.devAutoLaunchState = value;
                console.log(`[AUTO-LAUNCH][DEV] Dev mode detected, mocking setAutoLaunch to: ${this.devAutoLaunchState}`);
                return { success: true, devMode: true, state: this.devAutoLaunchState };
            }

            try {
                if (typeof app?.setLoginItemSettings === 'function') {
                    app.setLoginItemSettings({ openAtLogin, args });
                }
                return { success: true };
            } catch (error: any) {
                console.error('[AUTO-LAUNCH] Failed to set login item settings:', error);
                return { success: false, error: error.message };
            }
        });

        ipcMain.handle('get-auto-launch', async () => {
            if (!this.isAppPackaged()) {
                console.log(`[AUTO-LAUNCH][DEV] Dev mode detected, returning mocked state: ${this.devAutoLaunchState}`);
                return this.devAutoLaunchState;
            }

            try {
                if (typeof app?.getLoginItemSettings === 'function') {
                    const settings: any = app.getLoginItemSettings();
                    const openAtLogin = settings.openAtLogin;
                    const hasMinimizedArg = Array.isArray(settings.args) && settings.args.includes('--minimized');
                    if (openAtLogin && hasMinimizedArg) return 'minimized';
                    if (openAtLogin) return 'on';
                    return 'off';
                }
                return 'off';
            } catch (error: any) {
                console.error('[AUTO-LAUNCH] Failed to get login item settings:', error);
                return 'off';
            }
        });

        ipcMain.handle('app:get-full-config', async () => startupServices?.resolveFullConfig());
        ipcMain.handle('app:relaunch-yumeshelf', () => {
            if (typeof app?.relaunch === 'function' && typeof app?.exit === 'function') {
                app.relaunch();
                app.exit(0);
            }
        });

        ipcMain.on('exit-app', () => {
            if (typeof app?.quit === 'function') {
                app.quit();
            }
        });

        ipcMain.handle('app:read-backup-history', async () => {
            if (!paths?.backupsDir || !fsSync.existsSync(paths.backupsDir)) return [];
            try {
                const files = fsSync.readdirSync(paths.backupsDir).filter((file) => file.endsWith('.json'));
                return files.map((file) => {
                    const filePath = `${paths.backupsDir}/${file}`;
                    const stats = fsSync.statSync(filePath);
                    return { fileName: file, path: filePath, mtime: stats.mtimeMs, size: stats.size };
                }).sort((a, b) => b.mtime - a.mtime);
            } catch (error) {
                console.error('[BACKUP-HISTORY] Failed to read backups dir:', error);
                return [];
            }
        });
    }
}
