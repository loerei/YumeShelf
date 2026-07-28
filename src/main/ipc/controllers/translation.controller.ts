import { RegisterIpcOptions } from '../types';

export class TranslationIpcController {
    constructor(private readonly options: RegisterIpcOptions) {}

    public registerHandlers(): void {
        const { ipcMain, languagePackServices, libraryState, translationService } = this.options;
        if (!ipcMain) return;

        ipcMain.handle('get-language-pack-manifest', async () => {
            if (!languagePackServices) {
                return {
                    ok: false,
                    offline: false,
                    source: null,
                    error: 'services-unavailable',
                    repoUrl: null,
                    packs: []
                };
            }
            const result = await languagePackServices.fetchLanguageManifest();
            return {
                ok: result.ok,
                offline: result.offline,
                source: result.source,
                error: result.error,
                repoUrl: languagePackServices.repoUrl,
                packs: result.manifest ? result.manifest.packs : []
            };
        });

        ipcMain.handle('install-language-pack', async (_event, code) => languagePackServices?.installLanguagePack(code));

        ipcMain.handle('translation:check-support', async (_event, gameKey) => {
            const record = await libraryState?.getGameRecord(gameKey);
            if (!record?.exePath || !translationService) return { supported: false, engine: null };
            const engine = await translationService.detectEngineSupport(record.exePath);
            return { supported: !!engine, engine };
        });

        ipcMain.handle('translation:start-sync', async (_event, { gameKey, targetLang }) => {
            const record = await libraryState?.getGameRecord(gameKey);
            if (!record?.exePath || !translationService) return { success: false, error: 'game-not-found' };
            translationService.queueDeepSync(gameKey, record.exePath, targetLang, record.name);
            return { success: true };
        });

        ipcMain.handle('translation:cancel-sync', async (_event, gameKey) => {
            translationService?.cancelDeepSync(gameKey);
            return { success: true };
        });

        ipcMain.handle('translation:move-queue', async (_event, { gameKey, direction }) => {
            translationService?.moveQueue(gameKey, direction);
            return { success: true };
        });
    }
}
