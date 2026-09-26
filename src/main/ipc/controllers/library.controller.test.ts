// @ts-ignore
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LibraryIpcController } from './library.controller';
import { TelemetryShipper } from '../../telemetry/shipper';

describe('LibraryIpcController - update-library-config', () => {
    let handlers: Map<string, (...args: any[]) => any>;
    let mockIpcMain: any;
    let mockLibraryState: any;
    let controller: LibraryIpcController;

    beforeEach(() => {
        handlers = new Map();
        mockIpcMain = {
            handle: vi.fn((channel: string, handler: (...args: any[]) => any) => {
                handlers.set(channel, handler);
            }),
            on: vi.fn(),
        };

        mockLibraryState = {
            updateLibraryConfig: vi.fn(async (updates: any) => ({
                libraryPaths: ['/games'],
                libraryPath: '/games',
                maxDepth: 5,
                autoLaunch: false,
                minimizeToTray: false,
                ...updates
            }))
        };

        controller = new LibraryIpcController({
            ipcMain: mockIpcMain,
            libraryState: mockLibraryState,
        } as any);

        controller.registerHandlers();
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        try {
            await TelemetryShipper.getInstance().setTelemetryEnabled(false);
        } catch {
            // ignore cleanup errors
        }
    });

    it('rejects invalid payload: null, undefined, primitive, or array', async () => {
        const handler = handlers.get('update-library-config')!;
        expect(handler).toBeDefined();

        await expect(handler({}, null)).rejects.toThrow('Invalid config updates payload: expected object');
        await expect(handler({}, undefined)).rejects.toThrow('Invalid config updates payload: expected object');
        await expect(handler({}, 'not an object')).rejects.toThrow('Invalid config updates payload: expected object');
        await expect(handler({}, 123)).rejects.toThrow('Invalid config updates payload: expected object');
        await expect(handler({}, ['an', 'array'])).rejects.toThrow('Invalid config updates payload: expected object');
        expect(mockLibraryState.updateLibraryConfig).not.toHaveBeenCalled();
    });

    it('delegates valid updates cleanly to libraryState.updateLibraryConfig', async () => {
        const handler = handlers.get('update-library-config')!;
        const updates = { titleDisplayMode: 'metadata' as const };

        const result = await handler({}, updates);

        expect(mockLibraryState.updateLibraryConfig).toHaveBeenCalledWith(updates);
        expect(result).toMatchObject({ titleDisplayMode: 'metadata' });
    });

    it('syncs TelemetryShipper state when telemetryEnabled is boolean', async () => {
        const handler = handlers.get('update-library-config')!;
        const telemetrySpy = vi.spyOn(TelemetryShipper.getInstance(), 'setTelemetryEnabled').mockResolvedValue(undefined);

        const updates = { telemetryEnabled: true };
        const result = await handler({}, updates);

        expect(mockLibraryState.updateLibraryConfig).toHaveBeenCalledWith(updates);
        expect(telemetrySpy).toHaveBeenCalledWith(true);
        expect(result).toMatchObject({ telemetryEnabled: true });
    });

    it('does not invoke TelemetryShipper when telemetryEnabled is omitted or non-boolean', async () => {
        const handler = handlers.get('update-library-config')!;
        const telemetrySpy = vi.spyOn(TelemetryShipper.getInstance(), 'setTelemetryEnabled').mockResolvedValue(undefined);

        await handler({}, { maxDepth: 4 });
        expect(telemetrySpy).not.toHaveBeenCalled();

        await handler({}, { telemetryEnabled: 'invalid' as any });
        expect(telemetrySpy).not.toHaveBeenCalled();
    });

    it('does not call TelemetryShipper when libraryState.updateLibraryConfig rejects', async () => {
        const handler = handlers.get('update-library-config')!;
        mockLibraryState.updateLibraryConfig.mockRejectedValueOnce(new Error('Unauthorized libraryPath in permutation'));
        const telemetrySpy = vi.spyOn(TelemetryShipper.getInstance(), 'setTelemetryEnabled').mockResolvedValue(undefined);

        await expect(handler({}, { telemetryEnabled: true, libraryPaths: ['/bad'] }))
            .rejects.toThrow('Unauthorized libraryPath in permutation');

        expect(telemetrySpy).not.toHaveBeenCalled();
    });

    it('catches and logs telemetry error without throwing from IPC handler', async () => {
        const handler = handlers.get('update-library-config')!;
        const telemetryError = new Error('Disk write failed');
        vi.spyOn(TelemetryShipper.getInstance(), 'setTelemetryEnabled').mockRejectedValueOnce(telemetryError);
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const result = await handler({}, { telemetryEnabled: false });

        expect(mockLibraryState.updateLibraryConfig).toHaveBeenCalled();
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            '[LIBRARY_CONTROLLER] Failed to sync telemetry shipper state:',
            expect.objectContaining({
                telemetryEnabled: false,
                error: telemetryError
            })
        );
        expect(result).toBeDefined();
    });
});

describe('LibraryIpcController - toggle-favorite', () => {
    let handlers: Map<string, (...args: any[]) => any>;
    let mockIpcMain: any;
    let mockLibraryState: any;
    let controller: LibraryIpcController;

    beforeEach(() => {
        handlers = new Map();
        mockIpcMain = {
            handle: vi.fn((channel: string, handler: (...args: any[]) => any) => {
                handlers.set(channel, handler);
            }),
            on: vi.fn(),
        };

        mockLibraryState = {
            toggleFavorite: vi.fn(async (_gameKey: string, _targetFavorite?: boolean) => true)
        };

        controller = new LibraryIpcController({
            ipcMain: mockIpcMain,
            libraryState: mockLibraryState,
        } as any);

        controller.registerHandlers();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('forwards gameKey and targetFavorite to libraryState.toggleFavorite', async () => {
        const handler = handlers.get('toggle-favorite');
        expect(handler).toBeDefined();

        mockLibraryState.toggleFavorite.mockResolvedValueOnce(true);
        const res1 = await handler!({}, 'game-123', true);
        expect(mockLibraryState.toggleFavorite).toHaveBeenCalledWith('game-123', true);
        expect(res1).toBe(true);

        mockLibraryState.toggleFavorite.mockResolvedValueOnce(false);
        const res2 = await handler!({}, 'game-123', false);
        expect(mockLibraryState.toggleFavorite).toHaveBeenCalledWith('game-123', false);
        expect(res2).toBe(false);

        mockLibraryState.toggleFavorite.mockResolvedValueOnce(true);
        const res3 = await handler!({}, 'game-123', undefined);
        expect(mockLibraryState.toggleFavorite).toHaveBeenCalledWith('game-123', undefined);
        expect(res3).toBe(true);
    });
});

describe('LibraryIpcController - library:set-folder-alias', () => {
    let handlers: Map<string, (...args: any[]) => any>;
    let mockIpcMain: any;
    let mockLibraryState: any;
    let controller: LibraryIpcController;

    beforeEach(() => {
        handlers = new Map();
        mockIpcMain = {
            handle: vi.fn((channel: string, handler: (...args: any[]) => any) => {
                handlers.set(channel, handler);
            }),
            on: vi.fn(),
        };

        mockLibraryState = {
            setFolderAlias: vi.fn(async (folderPath: string, alias: string) => ({
                ok: true,
                config: {
                    libraryPaths: ['/games'],
                    folderAliases: { [folderPath]: alias }
                }
            }))
        };

        controller = new LibraryIpcController({
            ipcMain: mockIpcMain,
            libraryState: mockLibraryState,
        } as any);

        controller.registerHandlers();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('rejects malformed or non-object payloads returning invalid-payload', async () => {
        const handler = handlers.get('library:set-folder-alias');
        expect(handler).toBeDefined();

        const malformedPayloads = [
            null,
            undefined,
            'not an object',
            123,
            [],
            {},
            { folderPath: '/games/rpg' },
            { alias: 'My Alias' },
            { folderPath: 123, alias: 'My Alias' },
            { folderPath: '/games/rpg', alias: 123 },
            { folderPath: null, alias: 'My Alias' }
        ];

        for (const payload of malformedPayloads) {
            const res = await handler!({}, payload);
            expect(res).toEqual({ ok: false, error: 'invalid-payload' });
        }

        expect(mockLibraryState.setFolderAlias).not.toHaveBeenCalled();
    });

    it('delegates valid payload to libraryState.setFolderAlias and returns result', async () => {
        const handler = handlers.get('library:set-folder-alias');
        expect(handler).toBeDefined();

        const validPayload = { folderPath: '/games/my-game', alias: 'My Game Title' };
        const result = await handler!({}, validPayload);

        expect(mockLibraryState.setFolderAlias).toHaveBeenCalledWith('/games/my-game', 'My Game Title');
        expect(result.ok).toBe(true);
        expect(result.config?.folderAliases?.['/games/my-game']).toBe('My Game Title');
    });
});

