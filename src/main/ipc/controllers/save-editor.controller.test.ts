// @ts-ignore
import { describe, it, expect, vi } from 'vitest';
import * as path from 'path';
import { SaveEditorIpcController } from './save-editor.controller';
import { createSaveEditorService } from '../../save-editor/index';

describe('SaveEditorIpcController & SaveEditorService (Manual Save Folder Selection)', () => {
    function createIpcHarness(customOverrides: Record<string, any> = {}) {
        const handlers = new Map<string, (...args: any[]) => any>();
        const listeners = new Map<string, (...args: any[]) => any>();

        const mockIpcMain: any = {
            handle: vi.fn((channel: string, handler: (...args: any[]) => any) => {
                handlers.set(channel, handler);
            }),
            on: vi.fn((channel: string, listener: (...args: any[]) => any) => {
                listeners.set(channel, listener);
            }),
        };

        const mockLibraryState: any = {
            getGameRecord: vi.fn(async (key: string) => {
                if (key === 'valid-game') {
                    return { name: 'Valid Game', exePath: 'C:\\Games\\Valid\\game.exe', saveFolderOverride: undefined };
                }
                if (key === 'missing-override-game') {
                    return { name: 'Missing Game', exePath: 'C:\\Games\\Missing\\game.exe', saveFolderOverride: 'C:\\Missing\\Save' };
                }
                return null;
            }),
            setSaveFolderOverride: vi.fn(async (key: string, folder: string) => {
                if (key === 'valid-game') {
                    return { ok: true, saveFolderOverride: folder || null };
                }
                return null;
            }),
        };

        const mockSaveFolderResolver: any = {
            resolveSaveFolder: vi.fn(async (exePath: string, override?: string) => {
                if (override === 'C:\\Missing\\Save') {
                    return { path: 'C:\\Missing\\Save', engine: 'user-override', confidence: 'none', source: 'override', overrideMissing: true };
                }
                return { path: 'C:\\Games\\Valid\\savedata', engine: 'rpg-mv-mz', confidence: 'high', source: 'deterministic' };
            }),
        };

        const mockShell: any = {
            openPath: vi.fn(async (_p: string) => ''),
        };

        const mockDialog: any = {
            showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: ['C:\\Selected\\SaveFolder'] })),
        };

        const mockBrowserWindow: any = {
            fromWebContents: vi.fn(() => ({ id: 1 })),
            getFocusedWindow: vi.fn(() => ({ id: 1 })),
        };

        const options: any = {
            ipcMain: mockIpcMain,
            libraryState: mockLibraryState,
            saveFolderResolver: mockSaveFolderResolver,
            saveEditorService: {},
            paths: { preloadPath: 'preload.js', mainWindowIconPath: 'icon.png' },
            shell: mockShell,
            dialog: mockDialog,
            browserWindow: mockBrowserWindow,
            ...customOverrides,
        };

        const controller = new SaveEditorIpcController(options);
        controller.registerHandlers();

        return {
            handlers,
            listeners,
            mockIpcMain,
            mockLibraryState,
            mockSaveFolderResolver,
            mockShell,
            mockDialog,
            mockBrowserWindow,
        };
    }

    describe('save-folder:open', () => {
        it('returns ok: true with normalized native path on success', async () => {
            const { handlers, mockShell } = createIpcHarness();
            const handler = handlers.get('save-folder:open')!;
            expect(handler).toBeDefined();

            const res = await handler({}, 'valid-game');
            expect(res).toEqual({
                ok: true,
                path: path.normalize('C:\\Games\\Valid\\savedata'),
            });
            expect(mockShell.openPath).toHaveBeenCalledWith(path.normalize('C:\\Games\\Valid\\savedata'));
        });

        it('returns error: no-record when game record is missing or has no exePath', async () => {
            const { handlers } = createIpcHarness();
            const handler = handlers.get('save-folder:open')!;

            const resUnknown = await handler({}, 'unknown-game');
            expect(resUnknown).toEqual({ ok: false, error: 'no-record' });
        });

        it('returns error: override-missing when override is configured but missing on disk', async () => {
            const { handlers } = createIpcHarness();
            const handler = handlers.get('save-folder:open')!;

            const res = await handler({}, 'missing-override-game');
            expect(res).toEqual({ ok: false, error: 'override-missing' });
        });

        it('returns shell error message when shell.openPath fails', async () => {
            const { handlers, mockShell } = createIpcHarness();
            mockShell.openPath.mockResolvedValueOnce('Failed to open directory');
            const handler = handlers.get('save-folder:open')!;

            const res = await handler({}, 'valid-game');
            expect(res).toEqual({ ok: false, error: 'Failed to open directory' });
        });

        it('returns error: no-shell when shell or shell.openPath is missing', async () => {
            const { handlers } = createIpcHarness({ shell: {} });
            const handler = handlers.get('save-folder:open')!;

            const res = await handler({}, 'valid-game');
            expect(res).toEqual({ ok: false, error: 'no-shell' });
        });

        it('returns error: invalid-payload on prototype pollution keys or empty gameKey', async () => {
            const { handlers } = createIpcHarness();
            const handler = handlers.get('save-folder:open')!;

            for (const badKey of ['__proto__', 'constructor', 'prototype', '', '   ', null, undefined, 123 as any]) {
                const res = await handler({}, badKey);
                expect(res).toEqual({ ok: false, error: 'invalid-payload' });
            }
        });
    });

    describe('save-editor:select-directory', () => {
        it('returns folderPath when user selects a directory', async () => {
            const { handlers, mockDialog } = createIpcHarness();
            const handler = handlers.get('save-editor:select-directory')!;

            const res = await handler({});
            expect(res).toEqual({ canceled: false, folderPath: 'C:\\Selected\\SaveFolder' });
            expect(mockDialog.showOpenDialog).toHaveBeenCalled();
        });

        it('returns canceled: true when user cancels dialog or no path selected', async () => {
            const { handlers, mockDialog } = createIpcHarness();
            mockDialog.showOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] });
            const handler = handlers.get('save-editor:select-directory')!;

            const res = await handler({});
            expect(res).toEqual({ canceled: true, folderPath: null });
        });

        it('returns canceled: true without throwing when dialog throws or is missing', async () => {
            const { handlers, mockDialog } = createIpcHarness();
            mockDialog.showOpenDialog.mockRejectedValueOnce(new Error('Dialog crashed'));
            const handler = handlers.get('save-editor:select-directory')!;

            const res = await handler({});
            expect(res).toEqual({ canceled: true, folderPath: null });

            const { handlers: noDialogHandlers } = createIpcHarness({ dialog: null });
            const noDialogHandler = noDialogHandlers.get('save-editor:select-directory')!;
            const noDialogRes = await noDialogHandler({});
            expect(noDialogRes).toEqual({ canceled: true, folderPath: null });
        });

        it('falls back to getFocusedWindow when fromWebContents returns null, and windowless when both null', async () => {
            const focusedWin = { id: 2 };
            const mockBrowserWindow = {
                fromWebContents: vi.fn(() => null),
                getFocusedWindow: vi.fn(() => focusedWin),
            };
            const mockDialog = {
                showOpenDialog: vi.fn(async (_winOrOpts: any) => ({ canceled: false, filePaths: ['C:\\Focused\\SaveFolder'] })),
            };
            const { handlers } = createIpcHarness({ browserWindow: mockBrowserWindow, dialog: mockDialog });
            const handler = handlers.get('save-editor:select-directory')!;

            const res = await handler({});
            expect(res).toEqual({ canceled: false, folderPath: 'C:\\Focused\\SaveFolder' });
            expect(mockDialog.showOpenDialog).toHaveBeenCalledWith(focusedWin, expect.anything());

            // When both are null, it calls showOpenDialog without window parameter
            mockBrowserWindow.getFocusedWindow.mockReturnValueOnce(null);
            await handler({});
            expect(mockDialog.showOpenDialog).toHaveBeenCalledWith(expect.objectContaining({ properties: ['openDirectory'] }));
        });
    });

    describe('open-save-editor-window headless safety', () => {
        it('logs warning and does not crash when BrowserWindowConstructor is not available', () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            try {
                const { listeners } = createIpcHarness({ browserWindow: null });
                const listener = listeners.get('open-save-editor-window');
                expect(listener).toBeDefined();
                expect(() => listener!({}, 'valid-game')).not.toThrow();
                expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('BrowserWindowConstructor is not available'));
            } finally {
                warnSpy.mockRestore();
            }
        });
    });

    describe('set-save-folder-override & save-editor:set-save-folder-override', () => {
        it('is registered under both channels', () => {
            const { handlers } = createIpcHarness();
            expect(handlers.has('set-save-folder-override')).toBe(true);
            expect(handlers.has('save-editor:set-save-folder-override')).toBe(true);
        });

        it('sets valid absolute folder path successfully', async () => {
            const { handlers } = createIpcHarness();
            const handler = handlers.get('save-editor:set-save-folder-override')!;

            const validAbsolute = path.resolve('C:/Games/Valid/custom_save');
            const res = await handler({}, { gameKey: 'valid-game', folderPath: validAbsolute });
            expect(res).toEqual({ ok: true, saveFolderOverride: validAbsolute });
        });

        it('clears override when folderPath is empty string or whitespace', async () => {
            const { handlers } = createIpcHarness();
            const handler = handlers.get('save-editor:set-save-folder-override')!;

            const resEmpty = await handler({}, { gameKey: 'valid-game', folderPath: '' });
            expect(resEmpty).toEqual({ ok: true, saveFolderOverride: null });

            const resWhitespace = await handler({}, { gameKey: 'valid-game', folderPath: '   ' });
            expect(resWhitespace).toEqual({ ok: true, saveFolderOverride: null });
        });

        it('sanitizes null bytes (\0 or %00) without throwing', async () => {
            const { handlers } = createIpcHarness();
            const handler = handlers.get('save-editor:set-save-folder-override')!;

            const withNullByte = 'C:\\Games\\Valid\\save\0%00folder';
            const expectedResolved = path.resolve('C:\\Games\\Valid\\savefolder');
            const res = await handler({}, { gameKey: 'valid-game', folderPath: withNullByte });
            expect(res).toEqual({ ok: true, saveFolderOverride: expectedResolved });
        });

        it('rejects prototype pollution keys in gameKey', async () => {
            const { handlers } = createIpcHarness();
            const handler = handlers.get('save-editor:set-save-folder-override')!;

            for (const badKey of ['__proto__', 'constructor', 'prototype', '', '   ', null, undefined]) {
                const res = await handler({}, { gameKey: badKey, folderPath: 'C:\\Save' });
                expect(res).toEqual({ ok: false, error: 'invalid-payload' });
            }
        });

        it('rejects non-string or missing folderPath with invalid-payload', async () => {
            const { handlers } = createIpcHarness();
            const handler = handlers.get('save-editor:set-save-folder-override')!;

            for (const badPath of [null, undefined, 123, true, {}, []]) {
                const res = await handler({}, { gameKey: 'valid-game', folderPath: badPath });
                expect(res).toEqual({ ok: false, error: 'invalid-payload' });
            }
        });

        it('rejects UNC network paths and mixed slash variants with invalid-payload', async () => {
            const { handlers } = createIpcHarness();
            const handler = handlers.get('save-editor:set-save-folder-override')!;

            const uncPaths = [
                '\\\\server\\share\\saves',
                '//server/share/saves',
                '\\/server/share/saves',
                '/\\server/share/saves',
            ];

            for (const unc of uncPaths) {
                const res = await handler({}, { gameKey: 'valid-game', folderPath: unc });
                expect(res).toEqual({ ok: false, error: 'invalid-payload' });
            }
        });

        it('rejects relative paths with invalid-payload', async () => {
            const { handlers } = createIpcHarness();
            const handler = handlers.get('save-editor:set-save-folder-override')!;

            const res = await handler({}, { gameKey: 'valid-game', folderPath: './relative/path' });
            expect(res).toEqual({ ok: false, error: 'invalid-payload' });
        });

        it('returns error: game-not-found when database record is missing', async () => {
            const { handlers } = createIpcHarness();
            const handler = handlers.get('save-editor:set-save-folder-override')!;

            const res = await handler({}, { gameKey: 'nonexistent-game', folderPath: 'C:\\Save' });
            expect(res).toEqual({ ok: false, error: 'game-not-found' });
        });
    });

    describe('SaveEditorService.listSaveFiles shielding', () => {
        it('immediately returns [] when saveFolderResolver returns overrideMissing: true', async () => {
            const mockLibraryState = {
                getGameRecord: vi.fn(async () => ({
                    name: 'Missing Save Game',
                    exePath: 'C:\\Games\\Missing\\game.exe',
                    saveFolderOverride: 'C:\\Missing\\Save',
                })),
            };

            const mockSaveFolderResolver = {
                resolveSaveFolder: vi.fn(async () => ({
                    path: 'C:\\Missing\\Save',
                    engine: 'user-override' as const,
                    confidence: 'none' as const,
                    source: 'override' as const,
                    overrideMissing: true,
                })),
            };

            const service = createSaveEditorService({
                libraryState: mockLibraryState,
                saveFolderResolver: mockSaveFolderResolver,
            });

            const files = await service.listSaveFiles('missing-game');
            expect(files).toEqual([]);
        });
    });
});
