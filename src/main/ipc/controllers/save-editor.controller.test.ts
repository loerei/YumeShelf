import { afterEach, describe, it, expect, vi } from 'vitest';
import * as path from 'path';
import { SaveEditorIpcController } from './save-editor.controller';
import { createSaveEditorService } from '../../save-editor/index';

describe('SaveEditorIpcController & SaveEditorService (Manual Save Folder Selection)', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    function createIpcHarness(customOverrides: Record<string, any> = {}) {
        const handlers = new Map<string, (...args: any[]) => any>();
        const listeners = new Map<string, (...args: any[]) => any>();
        const appListeners = new Map<string, (...args: any[]) => any>();

        const mockIpcMain: any = {
            handle: vi.fn((channel: string, handler: (...args: any[]) => any) => {
                handlers.set(channel, handler);
            }),
            on: vi.fn((channel: string, listener: (...args: any[]) => any) => {
                listeners.set(channel, listener);
            }),
        };

        const mockApp: any = {
            on: vi.fn((event: string, listener: (...args: any[]) => any) => {
                appListeners.set(event, listener);
            }),
            emit: (event: string, ...args: any[]) => {
                appListeners.get(event)?.(...args);
            },
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
            openExternal: vi.fn(async (_url: string) => {}),
        };

        const mockDialog: any = {
            showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: ['C:\\Selected\\SaveFolder'] })),
            showMessageBox: vi.fn(async () => ({ response: 1 })),
        };

        const winListeners = new Map<string, (...args: any[]) => any>();
        const webContentsListeners = new Map<string, (...args: any[]) => any>();
        let windowOpenHandler: ((details: { url: string }) => any) | null = null;

        const mockWindowInstance: any = {
            id: 1,
            isDestroyed: vi.fn(() => false),
            isMinimized: vi.fn(() => false),
            restore: vi.fn(),
            focus: vi.fn(),
            destroy: vi.fn(),
            removeMenu: vi.fn(),
            setMenuBarVisibility: vi.fn(),
            loadFile: vi.fn(async () => {}),
            loadURL: vi.fn(async () => {}),
            on: vi.fn((event: string, cb: (...args: any[]) => void) => {
                winListeners.set(event, cb);
            }),
            emit: (event: string, ...args: any[]) => {
                winListeners.get(event)?.(...args);
            },
            webContents: {
                on: vi.fn((event: string, cb: (...args: any[]) => void) => {
                    webContentsListeners.set(event, cb);
                }),
                emit: (event: string, ...args: any[]) => {
                    webContentsListeners.get(event)?.(...args);
                },
                setWindowOpenHandler: vi.fn((cb: (details: { url: string }) => any) => {
                    windowOpenHandler = cb;
                }),
                getWindowOpenHandler: () => windowOpenHandler,
            },
        };

        const mockBrowserWindow: any = vi.fn(function () { return mockWindowInstance; });
        mockBrowserWindow.fromWebContents = vi.fn(() => mockWindowInstance);
        mockBrowserWindow.getFocusedWindow = vi.fn(() => mockWindowInstance);

        const options: any = {
            app: mockApp,
            ipcMain: mockIpcMain,
            libraryState: mockLibraryState,
            saveFolderResolver: mockSaveFolderResolver,
            saveEditorService: {},
            paths: {
                preloadPath: 'preload.js',
                mainWindowIconPath: 'icon.png',
                saveEditorHtmlPath: path.join('D:', 'Projects', 'YumeShelf', 'dist', 'renderer', 'save-editor.html'),
            },
            shell: mockShell,
            dialog: mockDialog,
            browserWindow: mockBrowserWindow,
            ...customOverrides,
        };

        const controller = new SaveEditorIpcController(options);
        controller.registerHandlers();

        return {
            controller,
            handlers,
            listeners,
            mockApp,
            mockIpcMain,
            mockLibraryState,
            mockSaveFolderResolver,
            mockShell,
            mockDialog,
            mockBrowserWindow,
            mockWindowInstance,
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

            for (const badKey of [
                '__proto__',
                'constructor',
                'prototype',
                '../evil',
                'a/../b',
                'a/__proto__',
                'a\\b',
                '/abs',
                'a/',
                'a//b',
                '',
                '   ',
                null,
                undefined,
                123 as any,
            ]) {
                const res = await handler({}, badKey);
                expect(res).toEqual({ ok: false, error: 'invalid-payload' });
            }
            expect(await handler({}, 'Parent/Game')).toEqual({ ok: false, error: 'no-record' });
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
            mockBrowserWindow.getFocusedWindow.mockReturnValueOnce(null as any);
            await handler({});
            expect(mockDialog.showOpenDialog).toHaveBeenCalledWith(expect.objectContaining({ properties: ['openDirectory'] }));
        });
    });

    describe('save-editor:open-window lifecycle, diagnostics, and security', () => {
        it('logs warning and does not crash when BrowserWindowConstructor is not available', () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            try {
                const { listeners } = createIpcHarness({ browserWindow: null });
                const listener = listeners.get('save-editor:open-window');
                expect(listener).toBeDefined();
                expect(() => listener!({}, 'valid-game')).not.toThrow();
                expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('BrowserWindowConstructor is not available'));
            } finally {
                warnSpy.mockRestore();
            }
        });

        it('validates gameKey ingress, configures sandbox: true, reuses/restores existing window, and cleans up on closed', () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const { listeners, mockBrowserWindow, mockWindowInstance } = createIpcHarness();
            const listener = listeners.get('save-editor:open-window')!;

            listener({}, '');
            listener({}, '   ');
            listener({}, null);
            listener({}, '../evil');
            listener({}, 'a\\b');
            listener({}, 'a/__proto__');
            expect(mockBrowserWindow).not.toHaveBeenCalled();

            listener({}, 'valid-game');
            expect(mockBrowserWindow).toHaveBeenCalledTimes(1);
            expect(mockBrowserWindow).toHaveBeenCalledWith(
                expect.objectContaining({
                    webPreferences: expect.objectContaining({
                        sandbox: true,
                        contextIsolation: true,
                        nodeIntegration: false,
                    }),
                })
            );

            mockWindowInstance.isMinimized.mockReturnValueOnce(true);
            listener({}, 'valid-game');
            expect(mockBrowserWindow).toHaveBeenCalledTimes(1);
            expect(mockWindowInstance.restore).toHaveBeenCalledTimes(1);
            expect(mockWindowInstance.focus).toHaveBeenCalledTimes(1);

            mockWindowInstance.emit('closed');
            listener({}, 'valid-game');
            expect(mockBrowserWindow).toHaveBeenCalledTimes(2);
            warnSpy.mockRestore();
        });

        it('buffers sanitized console-message entries and filters getLogEntries via sanitized gameKey', () => {
            const { controller, listeners, mockWindowInstance } = createIpcHarness({ diagnosticBufferCapacity: 3 });
            const listener = listeners.get('save-editor:open-window')!;

            listener({}, 'C:/Users/alice/game-1');
            mockWindowInstance.webContents.emit(
                'console-message',
                { sender: { isDestroyed: () => false } },
                2,
                'Loaded C:\\Users\\alice\\save.dat'
            );

            const buf = controller.getLogBuffer('C:/Users/alice/game-1');
            expect(buf.toArray()).toHaveLength(1);
            expect(buf.toArray()[0]).toContain('<USER_DIR>\\save.dat');
            expect(buf.toArray()[0]).not.toContain('alice');

            const filtered = controller.getLogEntries('C:/Users/alice/game-1');
            expect(filtered).toHaveLength(1);
        });

        it('handles render-process-gone crash recovery dialog (reopen on 0, close on 1, suppress on clean-exit / isQuitting)', async () => {
            vi.spyOn(console, 'error').mockImplementation(() => {});
            const { listeners, mockApp, mockBrowserWindow, mockDialog, mockWindowInstance } = createIpcHarness();
            const listener = listeners.get('save-editor:open-window')!;

            listener({}, 'valid-game');
            expect(mockBrowserWindow).toHaveBeenCalledTimes(1);

            // Reopen when user chooses 0
            mockDialog.showMessageBox.mockResolvedValueOnce({ response: 0 });
            await mockWindowInstance.webContents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 1 });
            expect(mockDialog.showMessageBox).toHaveBeenCalledTimes(1);
            expect(mockBrowserWindow).toHaveBeenCalledTimes(2);

            // Clean exit suppresses dialog
            mockDialog.showMessageBox.mockClear();
            await mockWindowInstance.webContents.emit('render-process-gone', {}, { reason: 'clean-exit', exitCode: 0 });
            expect(mockDialog.showMessageBox).not.toHaveBeenCalled();

            // isQuitting suppresses dialog
            listener({}, 'valid-game');
            mockApp.emit('before-quit');
            await mockWindowInstance.webContents.emit('render-process-gone', {}, { reason: 'killed', exitCode: 1 });
            expect(mockDialog.showMessageBox).not.toHaveBeenCalled();
        });

        it('enforces setWindowOpenHandler and will-navigate containment in dev and Windows case-insensitive prod', () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            vi.stubEnv('VITE_DEV_SERVER_URL', 'http://localhost:5173');
            const { listeners, mockShell, mockWindowInstance } = createIpcHarness({ platform: 'win32' });
            const listener = listeners.get('save-editor:open-window')!;

            listener({}, 'valid-game');
            expect(mockWindowInstance.loadURL).toHaveBeenCalledWith(
                'http://localhost:5173/save-editor.html?gameKey=valid-game'
            );

            const openHandler = mockWindowInstance.webContents.getWindowOpenHandler()!;
            expect(openHandler({ url: 'https://example.com' })).toEqual({ action: 'deny' });
            expect(mockShell.openExternal).toHaveBeenCalledWith('https://example.com/');

            // Dev origin allowed
            const devEvt = { preventDefault: vi.fn() };
            mockWindowInstance.webContents.emit('will-navigate', devEvt, 'http://localhost:5173/other');
            expect(devEvt.preventDefault).not.toHaveBeenCalled();

            // Case-insensitive Windows file path allowed
            const winFileEvt = { preventDefault: vi.fn() };
            mockWindowInstance.webContents.emit(
                'will-navigate',
                winFileEvt,
                'file:///d:/projects/yumeshelf/dist/renderer/save-editor.html?gameKey=valid-game'
            );
            expect(winFileEvt.preventDefault).not.toHaveBeenCalled();

            // Sibling directory traversal blocked
            const siblingEvt = { preventDefault: vi.fn() };
            mockWindowInstance.webContents.emit(
                'will-navigate',
                siblingEvt,
                'file:///D:/Projects/YumeShelf/dist/renderer-evil/save-editor.html'
            );
            expect(siblingEvt.preventDefault).toHaveBeenCalledTimes(1);
            warnSpy.mockRestore();
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

            const validAbsolute = path.resolve(process.cwd(), 'custom_save');
            const res = await handler({}, { gameKey: 'valid-game', folderPath: validAbsolute });
            expect(res).toEqual({ ok: true, saveFolderOverride: validAbsolute });
        });

        it('clears override when folderPath is empty string, whitespace, or null', async () => {
            const { handlers, mockLibraryState } = createIpcHarness();
            const handler = handlers.get('save-editor:set-save-folder-override')!;

            const resEmpty = await handler({}, { gameKey: 'valid-game', folderPath: '' });
            expect(resEmpty).toEqual({ ok: true, saveFolderOverride: null });

            const resWhitespace = await handler({}, { gameKey: 'valid-game', folderPath: '   ' });
            expect(resWhitespace).toEqual({ ok: true, saveFolderOverride: null });

            const resNull = await handler({}, { gameKey: 'valid-game', folderPath: null });
            expect(resNull).toEqual({ ok: true, saveFolderOverride: null });
            expect(mockLibraryState.setSaveFolderOverride).toHaveBeenLastCalledWith('valid-game', '');
        });

        it('sanitizes null bytes (\0 or %00) without throwing', async () => {
            const { handlers } = createIpcHarness();
            const handler = handlers.get('save-editor:set-save-folder-override')!;

            const withNullByte = path.resolve(process.cwd(), 'save\0%00folder');
            const expectedResolved = path.resolve(process.cwd(), 'savefolder');
            const res = await handler({}, { gameKey: 'valid-game', folderPath: withNullByte });
            expect(res).toEqual({ ok: true, saveFolderOverride: expectedResolved });
        });

        it('accepts Windows drive paths on all platforms without mangling', async () => {
            const { handlers } = createIpcHarness();
            const handler = handlers.get('save-editor:set-save-folder-override')!;

            const res = await handler({}, { gameKey: 'valid-game', folderPath: 'C:\\Games\\Valid\\save' });
            expect(res).toEqual({ ok: true, saveFolderOverride: 'C:\\Games\\Valid\\save' });
        });

        it('rejects prototype pollution keys in gameKey', async () => {
            const { handlers } = createIpcHarness();
            const handler = handlers.get('save-editor:set-save-folder-override')!;

            const safePath = path.resolve(process.cwd(), 'valid_save');
            for (const badKey of [
                '__proto__',
                'constructor',
                'prototype',
                '../evil',
                'a/../b',
                'a/__proto__',
                'a\\b',
                '',
                '   ',
                null,
                undefined,
            ]) {
                const res = await handler({}, { gameKey: badKey, folderPath: safePath });
                expect(res).toEqual({ ok: false, error: 'invalid-payload' });
            }
        });

        it('rejects non-string/non-null or missing folderPath with invalid-payload', async () => {
            const { handlers } = createIpcHarness();
            const handler = handlers.get('save-editor:set-save-folder-override')!;

            for (const badPath of [undefined, 123, true, {}, []]) {
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

            const testPath = path.resolve(process.cwd(), 'valid_save');
            const res = await handler({}, { gameKey: 'nonexistent-game', folderPath: testPath });
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

    describe('save-editor:load-data and save-editor:write-data options sanitization & contracted envelopes', () => {
        it('strips legacy data/metadata envelopes from save-editor:load-data to return strictly NormalizedSaveDto and sanitizes options', async () => {
            const mockNormalizedDto = {
                gameKey: 'valid-game',
                fileName: 'saveSlot1.json',
                strategy: 'tinc-double-aes-json',
                tabs: [{ id: 'variables', label: 'Variables', count: 1 }],
                fields: [{ id: 'variables:1', tabId: 'variables', key: '1', label: 'Gold', value: 500, type: 'number' }],
            };
            const mockSaveEditorService = {
                loadSaveData: vi.fn(async (_gameKey: string, _fileName: string, _options?: Record<string, unknown>) => ({
                    ...mockNormalizedDto,
                    data: { gold: 500, _userMappings: [] },
                    metadata: { variables: ['Gold'], switches: [] },
                })),
                writeSaveData: vi.fn(async (_gameKey: string, _fileName: string, _data: unknown, _options?: Record<string, unknown>) => ({ ok: true })),
            };
            const { handlers } = createIpcHarness({ saveEditorService: mockSaveEditorService });
            const handler = handlers.get('save-editor:load-data')!;
            expect(handler).toBeDefined();

            const maliciousOptions = {
                outerKey: 'testOuterKey',
                outerIv: 'testOuterIv',
                innerKey: 'testInnerKey',
                innerIv: 'testInnerIv',
                rawPlaintextFields: ['data_custom'],
                disallowedField: 'shouldBeStripped',
                __proto__: { evil: true },
                constructor: 'corrupt',
                prototype: 'polluted',
            };

            const res = await handler(
                { sender: { isDestroyed: () => false, send: vi.fn() } },
                {
                    gameKey: 'valid-game',
                    fileName: 'saveSlot1.json',
                    earlyExit: false,
                    stalenessTimeoutMs: 5000,
                    options: maliciousOptions,
                }
            );

            expect(res).toEqual(mockNormalizedDto);
            expect('data' in res).toBe(false);
            expect('metadata' in res).toBe(false);

            expect(mockSaveEditorService.loadSaveData).toHaveBeenCalledTimes(1);
            const callArgs = mockSaveEditorService.loadSaveData.mock.calls[0];
            expect(callArgs[0]).toBe('valid-game');
            expect(callArgs[1]).toBe('saveSlot1.json');
            const passedOptions = callArgs[2] as any;
            expect(passedOptions.outerKey).toBe('testOuterKey');
            expect(passedOptions.outerIv).toBe('testOuterIv');
            expect(passedOptions.innerKey).toBe('testInnerKey');
            expect(passedOptions.innerIv).toBe('testInnerIv');
            expect(passedOptions.rawPlaintextFields).toEqual(['data_custom']);
            expect(passedOptions.earlyExit).toBe(false);
            expect(passedOptions.stalenessTimeoutMs).toBe(5000);
            expect(passedOptions.disallowedField).toBeUndefined();
            expect(passedOptions.__proto__?.evil).toBeUndefined();
            expect(passedOptions.constructor).toBe(Object);
            expect(passedOptions.prototype).toBeUndefined();
            expect(typeof passedOptions.onProgress).toBe('function');
            expect(typeof passedOptions.shouldCancel).toBe('function');
        });

        it('sanitizes options, removes prototype pollution, and forwards valid updates to writeSaveData', async () => {
            const mockSaveEditorService: any = {
                loadSaveData: vi.fn(async () => ({})),
                writeSaveData: vi.fn(async () => ({ ok: true })),
            };
            const { handlers } = createIpcHarness({ saveEditorService: mockSaveEditorService });
            const handler = handlers.get('save-editor:write-data')!;
            expect(handler).toBeDefined();

            const maliciousOptions = {
                outerKey: 'writeOuterKey',
                innerKey: 'writeInnerKey',
                injectedEvil: 'dropTable',
                __proto__: { hacked: true },
            };

            const res = await handler(
                {},
                {
                    gameKey: 'valid-game',
                    fileName: 'saveSlot1.json',
                    updates: { 'variables:1': 100 },
                    options: maliciousOptions,
                }
            );
            expect(res).toEqual({ ok: true });

            expect(mockSaveEditorService.writeSaveData).toHaveBeenCalledTimes(1);
            const [gameKey, fileName, updates, sanitizedOpts] = mockSaveEditorService.writeSaveData.mock.calls[0];
            expect(gameKey).toBe('valid-game');
            expect(fileName).toBe('saveSlot1.json');
            expect(updates).toEqual({ 'variables:1': 100 });
            expect(sanitizedOpts.outerKey).toBe('writeOuterKey');
            expect(sanitizedOpts.innerKey).toBe('writeInnerKey');
            expect(sanitizedOpts.isUpdates).toBe(true);
            expect(sanitizedOpts.injectedEvil).toBeUndefined();
            expect(sanitizedOpts.__proto__?.hacked).toBeUndefined();
        });

        it('whitelists isUpdates, createBackup, encoding, maxBufferSizeBytes, and allowLargeSaves in ALLOWED_SAVE_OPTIONS and respects autoAllowLargeSaves config', async () => {
            const mockSaveEditorService: any = {
                loadSaveData: vi.fn(async () => ({})),
                writeSaveData: vi.fn(async () => ({ ok: true })),
            };
            const { handlers, mockLibraryState } = createIpcHarness({ saveEditorService: mockSaveEditorService });
            mockLibraryState.resolveLibraryConfig = vi.fn(async () => ({ autoAllowLargeSaves: true }));
            const writeHandler = handlers.get('save-editor:write-data')!;
            const loadHandler = handlers.get('save-editor:load-data')!;

            await loadHandler({}, { gameKey: ' Parent/ Game ', fileName: 'save01.json' });
            expect(mockSaveEditorService.loadSaveData).toHaveBeenCalledWith(
                ' Parent/ Game ',
                'save01.json',
                expect.objectContaining({
                    allowLargeSaves: true,
                    maxBufferSizeBytes: Number.POSITIVE_INFINITY,
                })
            );

            await writeHandler(
                {},
                {
                    gameKey: 'valid-game',
                    fileName: 'save01.json',
                    updates: { 'variables:1': 42 },
                    options: {
                        isUpdates: true,
                        createBackup: true,
                        encoding: 'utf8',
                        maxBufferSizeBytes: 1024 * 1024,
                        allowLargeSaves: false,
                        unknownOpt: 'stripped',
                    },
                }
            );
            const [, , , sanitizedOpts] = mockSaveEditorService.writeSaveData.mock.calls[0];
            expect(sanitizedOpts.maxBufferSizeBytes).toBe(Number.POSITIVE_INFINITY);
            expect(sanitizedOpts.allowLargeSaves).toBe(true);
            expect(sanitizedOpts.unknownOpt).toBeUndefined();
        });

        it('whitelists explicit maxBufferSizeBytes when autoAllowLargeSaves is false', async () => {
            const mockSaveEditorService: any = {
                writeSaveData: vi.fn(async () => ({ ok: true })),
            };
            const { handlers } = createIpcHarness({ saveEditorService: mockSaveEditorService });
            const handler = handlers.get('save-editor:write-data')!;

            await handler(
                {},
                {
                    gameKey: 'valid-game',
                    fileName: 'save01.json',
                    updates: { 'variables:1': 42 },
                    options: {
                        isUpdates: true,
                        createBackup: true,
                        encoding: 'utf8',
                        maxBufferSizeBytes: 1024 * 1024,
                        unknownOpt: 'stripped',
                    },
                }
            );

            expect(mockSaveEditorService.writeSaveData).toHaveBeenCalledTimes(1);
            const [, , , sanitizedOpts] = mockSaveEditorService.writeSaveData.mock.calls[0];
            expect(sanitizedOpts.isUpdates).toBe(true);
            expect(sanitizedOpts.createBackup).toBe(true);
            expect(sanitizedOpts.encoding).toBe('utf8');
            expect(sanitizedOpts.maxBufferSizeBytes).toBe(1024 * 1024);
            expect(sanitizedOpts.unknownOpt).toBeUndefined();
        });
    });

    describe('Channel-differentiated ingress validation, dual-envelope bridge, and error sanitization', () => {
        const BAD_FILENAMES = [
            '__proto__',
            'constructor',
            'prototype',
            '../evil.json',
            'sub/save.json',
            'sub\\save.json',
            'CON',
            'PRN.txt',
            'AUX',
            'NUL',
            'COM1',
            'LPT9.sav',
            'save.json:ads',
            'save\x00.json',
            'save\x07.json',
            'save.json.',
            'save.json ',
            '',
        ];

        it('save-editor:load-data throws invalid-payload on malformed gameKey or unsafe fileName and sanitizes service errors', async () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            try {
                const mockSaveEditorService = {
                    loadSaveData: vi.fn(async () => {
                        const err = new Error('ENOENT: C:\\Users\\John Doe\\AppData\\Local\\Saves\\save01.json missing');
                        err.stack = 'Error: ENOENT\n    at C:\\Users\\John Doe\\app\\main.js:10:5';
                        throw err;
                    }),
                };
                const { handlers } = createIpcHarness({ saveEditorService: mockSaveEditorService });
                const handler = handlers.get('save-editor:load-data')!;

                for (const badKey of [
                    '',
                    '  ',
                    '__proto__',
                    'constructor',
                    'prototype',
                    '../evil',
                    'a/../b',
                    './a',
                    '/abs',
                    'a/',
                    'a//b',
                    'a\\b',
                    'a/__proto__',
                    'a/constructor',
                    'a\0b',
                    null,
                ]) {
                    await expect(handler({}, { gameKey: badKey, fileName: 'save01.json' })).rejects.toThrow('invalid-payload');
                }
                for (const badFile of BAD_FILENAMES) {
                    await expect(handler({}, { gameKey: 'valid-game', fileName: badFile })).rejects.toThrow('invalid-payload');
                }
                expect(mockSaveEditorService.loadSaveData).not.toHaveBeenCalled();

                await expect(handler({}, { gameKey: 'Parent/Game', fileName: 'save01.json' })).rejects.toSatisfy((e: Error) => {
                    expect(e.message).not.toContain('John Doe');
                    expect(e.message).toContain('<USER_DIR>');
                    return true;
                });

                await expect(handler({}, { gameKey: 'valid-game', fileName: 'save01.json' })).rejects.toSatisfy((e: Error) => {
                    expect(e.message).not.toContain('John Doe');
                    expect(e.message).toContain('<USER_DIR>');
                    return true;
                });
                expect(errSpy).toHaveBeenCalledWith(
                    '[IPC][save-editor:load-data] Failed to load save file:',
                    expect.objectContaining({
                        gameKey: 'valid-game',
                        fileName: 'save01.json',
                        error: expect.not.stringContaining('John Doe'),
                        stack: expect.not.stringContaining('John Doe'),
                    })
                );
            } finally {
                warnSpy.mockRestore();
                errSpy.mockRestore();
            }
        });

        it('save-editor:list-files throws invalid-payload on malformed gameKey and sanitizes service errors', async () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            try {
                const mockSaveEditorService = {
                    listSaveFiles: vi.fn(async () => {
                        throw new Error('EACCES: C:\\Users\\John Doe\\AppData\\Roaming\\Saves denied');
                    }),
                };
                const { handlers } = createIpcHarness({ saveEditorService: mockSaveEditorService });
                const handler = handlers.get('save-editor:list-files')!;

                for (const badKey of [
                    '',
                    '  ',
                    '__proto__',
                    'constructor',
                    'prototype',
                    '../evil',
                    'a/../b',
                    './a',
                    '/abs',
                    'a/',
                    'a//b',
                    'a\\b',
                    'a/__proto__',
                    'a/constructor',
                    'a\0b',
                    null,
                    123,
                ]) {
                    await expect(handler({}, badKey)).rejects.toThrow('invalid-payload');
                }
                expect(mockSaveEditorService.listSaveFiles).not.toHaveBeenCalled();

                await expect(handler({}, 'Parent/Game')).rejects.toSatisfy((e: Error) => {
                    expect(e.message).not.toContain('John Doe');
                    expect(e.message).toContain('<USER_DIR>');
                    return true;
                });

                await expect(handler({}, 'valid-game')).rejects.toSatisfy((e: Error) => {
                    expect(e.message).not.toContain('John Doe');
                    expect(e.message).toContain('<USER_DIR>');
                    return true;
                });
                expect(errSpy).toHaveBeenCalledWith(
                    '[IPC][save-editor:list-files] Failed to list save files:',
                    expect.objectContaining({
                        error: expect.not.stringContaining('John Doe'),
                    })
                );
            } finally {
                warnSpy.mockRestore();
                errSpy.mockRestore();
            }
        });

        it('save-editor:cancel-load resolves { cancelled: false } on malformed parameters', async () => {
            const { handlers } = createIpcHarness();
            const handler = handlers.get('save-editor:cancel-load')!;

            expect(await handler({}, null)).toEqual({ cancelled: false });
            expect(await handler({}, { gameKey: '__proto__', fileName: 'save01.json' })).toEqual({ cancelled: false });
            expect(await handler({}, { gameKey: 'valid-game', fileName: '../evil.json' })).toEqual({ cancelled: false });
            expect(await handler({}, { gameKey: 'valid-game', fileName: 'save01.json' })).toEqual({ cancelled: false });
        });

        it('save-editor:rename-file and save-editor:delete-file validate filenames/gameKey and sanitize rethrown errors', async () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            try {
                const mockSaveEditorService = {
                    renameSaveFile: vi.fn(async () => {
                        throw new Error('EBUSY: C:\\Users\\John Doe\\Saves\\old.json locked');
                    }),
                    deleteSaveFile: vi.fn(async () => {
                        throw new Error('EPERM: C:\\Users\\John Doe\\Saves\\del.json denied');
                    }),
                };
                const { handlers } = createIpcHarness({ saveEditorService: mockSaveEditorService });
                const renameHandler = handlers.get('save-editor:rename-file')!;
                const deleteHandler = handlers.get('save-editor:delete-file')!;

                for (const badFile of BAD_FILENAMES) {
                    expect(await renameHandler({}, { gameKey: 'valid-game', oldFileName: badFile, newFileName: 'ok.json' })).toEqual({
                        ok: false,
                        error: 'invalid-payload',
                    });
                    expect(await renameHandler({}, { gameKey: 'valid-game', oldFileName: 'ok.json', newFileName: badFile })).toEqual({
                        ok: false,
                        error: 'invalid-payload',
                    });
                    expect(await deleteHandler({}, { gameKey: 'valid-game', fileName: badFile })).toEqual({
                        ok: false,
                        error: 'invalid-payload',
                    });
                }
                for (const badKey of ['../evil', 'a/../b', 'a/__proto__', 'a\\b', '/abs', 'a/', 'a//b']) {
                    expect(await renameHandler({}, { gameKey: badKey, oldFileName: 'ok.json', newFileName: 'ok2.json' })).toEqual({
                        ok: false,
                        error: 'invalid-payload',
                    });
                    expect(await deleteHandler({}, { gameKey: badKey, fileName: 'ok.json' })).toEqual({
                        ok: false,
                        error: 'invalid-payload',
                    });
                }
                expect(mockSaveEditorService.renameSaveFile).not.toHaveBeenCalled();
                expect(mockSaveEditorService.deleteSaveFile).not.toHaveBeenCalled();

                await expect(
                    renameHandler({}, { gameKey: 'Parent/Game', oldFileName: 'old.json', newFileName: 'new.json' })
                ).rejects.toSatisfy((e: Error) => {
                    expect(e.message).not.toContain('John Doe');
                    expect(e.message).toContain('<USER_DIR>');
                    return true;
                });

                await expect(
                    renameHandler({}, { gameKey: 'valid-game', oldFileName: 'old.json', newFileName: 'new.json' })
                ).rejects.toSatisfy((e: Error) => {
                    expect(e.message).not.toContain('John Doe');
                    expect(e.message).toContain('<USER_DIR>');
                    return true;
                });

                await expect(deleteHandler({}, { gameKey: 'valid-game', fileName: 'del.json' })).rejects.toSatisfy((e: Error) => {
                    expect(e.message).not.toContain('John Doe');
                    expect(e.message).toContain('<USER_DIR>');
                    return true;
                });
            } finally {
                warnSpy.mockRestore();
                errSpy.mockRestore();
            }
        });

        it('decommissions dead IPC channel save-editor:update-mapping', () => {
            const { handlers } = createIpcHarness();
            expect(handlers.has('save-editor:update-mapping')).toBe(false);
        });

        it('save-editor:write-data enforces mandatory updates, rejects legacy data-only payloads, path traversal, and prototype pollution with { ok: false, error: "invalid-payload" }', async () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            try {
                const mockSaveEditorService = {
                    writeSaveData: vi.fn(async () => ({ ok: true })),
                };
                const { handlers } = createIpcHarness({ saveEditorService: mockSaveEditorService });
                const handler = handlers.get('save-editor:write-data')!;

                // Missing updates or malformed root payload
                expect(await handler({}, { gameKey: 'valid-game', fileName: 'save01.json' })).toEqual({
                    ok: false,
                    error: 'invalid-payload',
                });
                expect(await handler({}, null)).toEqual({ ok: false, error: 'invalid-payload' });
                expect(await handler({}, [])).toEqual({ ok: false, error: 'invalid-payload' });

                // Legacy data-only payloads must resolve { ok: false, error: 'invalid-payload' }
                expect(
                    await handler({}, { gameKey: 'valid-game', fileName: 'save01.json', data: { gold: 5 } })
                ).toEqual({ ok: false, error: 'invalid-payload' });
                expect(
                    await handler(
                        {},
                        { gameKey: 'valid-game', fileName: 'save01.json', data: { gold: 5 }, options: { isUpdates: true } }
                    )
                ).toEqual({ ok: false, error: 'invalid-payload' });

                // Path traversal & prototype pollution identifiers in gameKey / fileName
                for (const badKey of [
                    '',
                    '  ',
                    '__proto__',
                    'constructor',
                    'prototype',
                    '../evil',
                    'a/../b',
                    './a',
                    '/abs',
                    'a/',
                    'a//b',
                    'a\\b',
                    'a/__proto__',
                    'a/constructor',
                    'a\0b',
                    null,
                ]) {
                    expect(
                        await handler({}, { gameKey: badKey, fileName: 'save01.json', updates: { 'variables:1': 5 } })
                    ).toEqual({ ok: false, error: 'invalid-payload' });
                }

                // Nested relative gameKeys must be accepted by write-data
                expect(
                    await handler({}, { gameKey: 'Parent/Game', fileName: 'save01.json', updates: { 'variables:1': 5 } })
                ).toEqual({ ok: true });
                expect(mockSaveEditorService.writeSaveData).toHaveBeenCalledWith(
                    'Parent/Game',
                    'save01.json',
                    { 'variables:1': 5 },
                    { isUpdates: true }
                );
                mockSaveEditorService.writeSaveData.mockClear();
                for (const badFile of BAD_FILENAMES) {
                    expect(
                        await handler({}, { gameKey: 'valid-game', fileName: badFile, updates: { 'variables:1': 5 } })
                    ).toEqual({ ok: false, error: 'invalid-payload' });
                }

                // Invalid updates type (null, array, primitive)
                for (const badUpdates of [null, [], 'str', 123, true]) {
                    expect(
                        await handler({}, { gameKey: 'valid-game', fileName: 'save01.json', updates: badUpdates })
                    ).toEqual({ ok: false, error: 'invalid-payload' });
                }

                // Envelope/option mismatch
                expect(
                    await handler(
                        {},
                        { gameKey: 'valid-game', fileName: 'save01.json', updates: { 'variables:1': 5 }, options: { isUpdates: false } }
                    )
                ).toEqual({ ok: false, error: 'invalid-payload' });
                expect(mockSaveEditorService.writeSaveData).not.toHaveBeenCalled();

                // Truly empty updates -> safe no-op { ok: true } without calling service
                expect(await handler({}, { gameKey: 'valid-game', fileName: 'save01.json', updates: {} })).toEqual({ ok: true });
                expect(mockSaveEditorService.writeSaveData).not.toHaveBeenCalled();

                // Non-empty updates where all keys are stripped -> { ok: false, error: 'invalid-payload' }
                const allBadUpdates = JSON.parse(
                    '{"__proto__:1":1,"constructor:1":2,"prototype:1":3,"variables:__proto__":4,"variables:a.prototype.b":5,"variables:constructor":6,"badkey":7,"variables:nan":null,"variables:obj":{}}'
                );
                delete allBadUpdates['variables:nan'];
                allBadUpdates['variables:nan'] = Number.NaN;
                expect(
                    await handler({}, { gameKey: 'valid-game', fileName: 'save01.json', updates: allBadUpdates })
                ).toEqual({ ok: false, error: 'invalid-payload' });
                expect(mockSaveEditorService.writeSaveData).not.toHaveBeenCalled();

                // Mixed valid + dangerous updates -> null-prototype dict with only valid scalars
                const mixedUpdates = JSON.parse(
                    '{"__proto__:x":1,"variables:a.__proto__.b":2,"variables:1":99,"switches:2":true,"strings:3":"hero","flags:4":null,"bad:arr":[1]}'
                );
                expect(
                    await handler({}, { gameKey: 'valid-game', fileName: 'save01.json', updates: mixedUpdates })
                ).toEqual({ ok: true });
                expect(mockSaveEditorService.writeSaveData).toHaveBeenCalledTimes(1);
                const [, , forwardedUpdates, forwardedOpts] = mockSaveEditorService.writeSaveData.mock.calls[0] as any[];
                expect(Object.getPrototypeOf(forwardedUpdates)).toBeNull();
                expect(forwardedUpdates).toEqual({
                    'variables:1': 99,
                    'switches:2': true,
                    'strings:3': 'hero',
                    'flags:4': null,
                });
                expect(forwardedOpts.isUpdates).toBe(true);
            } finally {
                warnSpy.mockRestore();
            }
        });

        it('save-editor:write-data preserves EBUSY code and sanitizes paths on updates failure', async () => {
            const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            try {
                const busyErr: any = new Error('EBUSY: resource busy, open C:\\Users\\John Doe\\Saves\\save01.json');
                busyErr.code = 'EBUSY';
                busyErr.stack = 'Error: EBUSY\n    at C:\\Users\\John Doe\\app\\fs.js:1:1';

                const mockSaveEditorService = {
                    writeSaveData: vi.fn(async () => {
                        throw busyErr;
                    }),
                };
                const { handlers } = createIpcHarness({ saveEditorService: mockSaveEditorService });
                const handler = handlers.get('save-editor:write-data')!;

                const res = await handler(
                    {},
                    { gameKey: 'valid-game', fileName: 'save01.json', updates: { 'variables:1': 10 } }
                );
                expect(res.ok).toBe(false);
                expect(res.code).toBe('EBUSY');
                expect(res.error).not.toContain('John Doe');
                expect(res.error).toContain('<USER_DIR>');
                expect(errSpy).toHaveBeenCalledWith(
                    '[IPC][save-editor:write-data] Write save data failed:',
                    expect.objectContaining({
                        code: 'EBUSY',
                        error: expect.not.stringContaining('John Doe'),
                        stack: expect.not.stringContaining('John Doe'),
                    })
                );
            } finally {
                errSpy.mockRestore();
                warnSpy.mockRestore();
            }
        });

        it('save-editor:load-translations and save-editor:save-translations validate BCP-47, limits, prototype keys, and sanitize errors', async () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            try {
                const mockSaveEditorService = {
                    loadTranslations: vi.fn(async () => ({ 'hero/name': 'Hero' })),
                    saveTranslations: vi.fn(async () => ({ ok: true })),
                };
                const { handlers } = createIpcHarness({ saveEditorService: mockSaveEditorService });
                const loadHandler = handlers.get('save-editor:load-translations')!;
                const saveHandler = handlers.get('save-editor:save-translations')!;

                // Invalid BCP-47 returns {} cleanly with sanitized warn
                expect(await loadHandler({}, 'C:\\Users\\John Doe\\bad')).toEqual({});
                expect(warnSpy).toHaveBeenCalledWith(
                    '[IPC][save-editor:load-translations] Invalid BCP-47 language tag:',
                    expect.objectContaining({ lang: expect.not.stringContaining('John Doe') })
                );
                expect(await loadHandler({}, 'en-US')).toEqual({ 'hero/name': 'Hero' });

                // Empty translations -> { ok: true } without calling service
                expect(await saveHandler({}, { lang: 'en', translations: {} })).toEqual({ ok: true });
                expect(mockSaveEditorService.saveTranslations).not.toHaveBeenCalled();

                // > 10,000 entries rejected
                const huge: Record<string, string> = {};
                for (let i = 0; i < 10001; i++) huge[`k${i}`] = 'v';
                expect(await saveHandler({}, { lang: 'en', translations: huge })).toEqual({
                    ok: false,
                    error: 'invalid-payload',
                });

                // All entries stripped (prototype keys / oversized key or value)
                const allBad = JSON.parse('{"__proto__":"x","constructor":"y"}');
                allBad['k'.repeat(301)] = 'ok';
                allBad['ok'] = 'v'.repeat(4097);
                expect(await saveHandler({}, { lang: 'en', translations: allBad })).toEqual({
                    ok: false,
                    error: 'invalid-payload',
                });

                // Slashes allowed in variable keys
                expect(
                    await saveHandler({}, { lang: 'ja', translations: { 'hero/hp': 'HP', constructor: 'bad' } })
                ).toEqual({ ok: true });
                expect(mockSaveEditorService.saveTranslations).toHaveBeenCalledWith('ja', { 'hero/hp': 'HP' });

                // Service rejection is caught, logged, and sanitized
                mockSaveEditorService.saveTranslations.mockRejectedValueOnce(
                    new Error('EACCES: C:\\Users\\John Doe\\translations.json denied')
                );
                const failRes = await saveHandler({}, { lang: 'ja', translations: { 'hero/hp': 'HP' } });
                expect(failRes.ok).toBe(false);
                expect(failRes.error).not.toContain('John Doe');
                expect(failRes.error).toContain('<USER_DIR>');
                expect(errSpy).toHaveBeenCalledWith(
                    '[IPC][save-editor:save-translations] Save translations failed:',
                    expect.objectContaining({
                        lang: 'ja',
                        error: expect.not.stringContaining('John Doe'),
                    })
                );
            } finally {
                warnSpy.mockRestore();
                errSpy.mockRestore();
            }
        });
    });

    describe('save-editor:translate-batch & save-editor:cancel-translate', () => {
        function createJsonResponse(body: unknown, init: { status?: number; statusText?: string; headers?: Record<string, string> } = {}): Response {
            const status = init.status ?? 200;
            const ok = status >= 200 && status < 300;
            return {
                ok,
                status,
                statusText: init.statusText ?? (ok ? 'OK' : 'Error'),
                headers: new Headers(init.headers ?? {}),
                json: vi.fn(async () => body),
            } as unknown as Response;
        }

        function createEventSender() {
            const listeners = new Map<string, Set<(...args: any[]) => void>>();
            let destroyed = false;
            return {
                sender: {
                    isDestroyed: vi.fn(() => destroyed),
                    once: vi.fn((ev: string, fn: (...args: any[]) => void) => {
                        if (!listeners.has(ev)) listeners.set(ev, new Set());
                        listeners.get(ev)!.add(fn);
                    }),
                    removeListener: vi.fn((ev: string, fn: (...args: any[]) => void) => {
                        listeners.get(ev)?.delete(fn);
                    }),
                },
                destroy: () => {
                    destroyed = true;
                    const set = listeners.get('destroyed');
                    if (set) {
                        for (const fn of [...set]) {
                            set.delete(fn);
                            fn();
                        }
                    }
                },
                listenerCount: (ev: string) => listeners.get(ev)?.size ?? 0,
            };
        }

        it('returns {} immediately on empty or empty-after-sanitization texts without calling fetchFn', async () => {
            const fetchFn = vi.fn();
            const { handlers } = createIpcHarness({ fetchFn });
            const handler = handlers.get('save-editor:translate-batch')!;

            expect(await handler({}, [], 'ja')).toEqual({});
            expect(await handler({}, { texts: ['   \r\n  ', '\t'], targetLang: 'ja' })).toEqual({});
            expect(fetchFn).not.toHaveBeenCalled();
        });

        it('validates ingress types, dual-format payloads, BCP-47 targetLang, and batch bounds', async () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const fetchFn = vi.fn(async () => createJsonResponse([[['こんにちは', 'hello']]]));
            const { handlers } = createIpcHarness({ fetchFn });
            const handler = handlers.get('save-editor:translate-batch')!;

            try {
                for (const bad of [null, 123, 'hello', ['ok', 42]]) {
                    await expect(handler({}, bad, 'ja')).rejects.toThrow('invalid-texts-array');
                }

                for (const badLang of ['', 'english', '123', 'ja/en', null, undefined]) {
                    await expect(handler({}, ['hello'], badLang)).rejects.toThrow('invalid-target-lang');
                }

                // > 100 items
                await expect(handler({}, Array.from({ length: 101 }, () => 'a'), 'ja')).rejects.toThrow('batch-query-too-large');
                // custom maxBatchSize
                await expect(handler({}, ['a', 'b', 'c'], 'ja', { maxBatchSize: 2 })).rejects.toThrow('batch-query-too-large');
                // single string > 300 chars
                await expect(handler({}, ['x'.repeat(301)], 'ja')).rejects.toThrow('batch-query-too-large');
                // aggregate > 2000 chars
                await expect(handler({}, Array.from({ length: 7 }, () => 'x'.repeat(290)), 'ja')).rejects.toThrow('batch-query-too-large');

                expect(fetchFn).not.toHaveBeenCalled();

                // Dual-format object payload works
                const res = await handler({}, { texts: ['hello'], targetLang: 'ja' });
                expect(res).toEqual({ hello: 'こんにちは' });
                expect(fetchFn).toHaveBeenCalledTimes(1);
            } finally {
                warnSpy.mockRestore();
            }
        });

        it('sanitizes embedded newlines and lone UTF-16 surrogates, preserves raw keys, and blocks prototype pollution', async () => {
            const fetchFn = vi.fn(async (url: string) => {
                const parsed = new URL(url);
                const q = parsed.searchParams.get('q') ?? '';
                const lines = q.split('\n');
                const translated = lines.map((l) => `T:${l}`).join('\n');
                return createJsonResponse([[[translated, q]]]);
            });
            const { handlers } = createIpcHarness({ fetchFn });
            const handler = handlers.get('save-editor:translate-batch')!;

            const rawNewline = 'hello\r\nworld';
            const rawLoneSurrogate = 'bad\uD800surrogate';
            const res = await handler({}, [rawNewline, rawLoneSurrogate, '__proto__', 'constructor', 'prototype'], 'ja');

            expect(res[rawNewline]).toBe('T:hello world');
            expect(res['hello world']).toBe('T:hello world');
            expect(res[rawLoneSurrogate]).toBe('T:bad\uFFFDsurrogate');
            expect(res['bad\uFFFDsurrogate']).toBe('T:bad\uFFFDsurrogate');
            expect(Object.prototype.hasOwnProperty.call(res, '__proto__')).toBe(false);
            expect(Object.prototype.hasOwnProperty.call(res, 'constructor')).toBe(false);
            expect(Object.prototype.hasOwnProperty.call(res, 'prototype')).toBe(false);
            expect(({} as any).polluted).toBeUndefined();
        });

        it('sub-partitions chunks by encoded byte length <= 1500 so GET URLs <= 2048 chars', async () => {
            const urls: string[] = [];
            const fetchFn = vi.fn(async (url: string) => {
                urls.push(url);
                const q = new URL(url).searchParams.get('q') ?? '';
                const lines = q.split('\n').map((s) => `t(${s})`).join('\n');
                return createJsonResponse([[[lines, q]]]);
            });
            const { handlers } = createIpcHarness({ fetchFn });
            const handler = handlers.get('save-editor:translate-batch')!;

            // 10 strings of 200 chars -> 2000 total chars (<= 2000 limit), but encoded > 1500 bytes when combined
            const texts = Array.from({ length: 10 }, (_, i) => `k${i}_` + 'a'.repeat(197));
            const res = await handler({}, texts, 'ja');

            expect(urls.length).toBeGreaterThan(1);
            for (const u of urls) {
                expect(u.length).toBeLessThanOrEqual(2048);
            }
            for (const t of texts) {
                expect(res[t]).toBe(`t(${t})`);
            }
        });

        it('retries transient socket errors and 5xx within deadline, sanitizing user paths in console.warn', async () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            let calls = 0;
            const fetchFn = vi.fn(async () => {
                calls++;
                if (calls === 1) {
                    const err: any = new TypeError('fetch failed');
                    err.cause = { code: 'ENOTFOUND' };
                    throw err;
                }
                if (calls === 2) {
                    return createJsonResponse({}, { status: 503, statusText: 'Service Unavailable' });
                }
                return createJsonResponse([[['成功', 'success']]]);
            });
            const { handlers } = createIpcHarness({ fetchFn });
            const handler = handlers.get('save-editor:translate-batch')!;

            try {
                const res = await handler({}, ['success'], 'ja', { timeoutMs: 10_000 });
                expect(res).toEqual({ success: '成功' });
                expect(fetchFn).toHaveBeenCalledTimes(3);
                expect(warnSpy).toHaveBeenCalledTimes(2);

                // Terminal failure with local user path in error & stack is sanitized
                const pathErr = Object.assign(
                    new Error('ECONNRESET reading C:\\Users\\John Doe\\cache.json'),
                    { code: 'ECONNRESET', stack: 'Error: at C:\\Users\\John Doe\\net.ts:10' }
                );
                const alwaysFailFetch = vi.fn(async () => {
                    throw pathErr;
                });
                const { handlers: failHandlers } = createIpcHarness({ fetchFn: alwaysFailFetch });
                const failHandler = failHandlers.get('save-editor:translate-batch')!;

                warnSpy.mockClear();
                await expect(failHandler({}, ['hello'], 'ja', { timeoutMs: 10_000 })).rejects.toThrow('ECONNRESET');
                expect(warnSpy).toHaveBeenCalledWith(
                    '[save-editor:translate-batch] Translation request failed after retries:',
                    expect.objectContaining({
                        error: expect.not.stringContaining('John Doe'),
                        stack: expect.not.stringContaining('John Doe'),
                    })
                );
            } finally {
                warnSpy.mockRestore();
            }
        });

        it('circuit-breaks immediately on HTTP 429 and rejects on non-200 or invalid upstream JSON', async () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            try {
                const fetch429 = vi.fn(async () => createJsonResponse({}, { status: 429, statusText: 'Too Many Requests' }));
                const { handlers: h429 } = createIpcHarness({ fetchFn: fetch429 });
                await expect(h429.get('save-editor:translate-batch')!({}, ['hello'], 'ja')).rejects.toThrow('HTTP 429: Too Many Requests');
                expect(fetch429).toHaveBeenCalledTimes(1);

                const fetch400 = vi.fn(async () => createJsonResponse({}, { status: 400, statusText: 'Bad Request' }));
                const { handlers: h400 } = createIpcHarness({ fetchFn: fetch400 });
                await expect(h400.get('save-editor:translate-batch')!({}, ['hello'], 'ja')).rejects.toThrow('HTTP 400: Bad Request');

                const fetchNonJson = vi.fn(async () => ({
                    ok: true,
                    status: 200,
                    statusText: 'OK',
                    headers: new Headers(),
                    json: vi.fn(async () => {
                        throw new SyntaxError('Unexpected token <');
                    }),
                }) as unknown as Response);
                const { handlers: hJson } = createIpcHarness({ fetchFn: fetchNonJson });
                await expect(hJson.get('save-editor:translate-batch')!({}, ['hello'], 'ja')).rejects.toThrow('invalid-upstream-response');

                const fetchBadShape = vi.fn(async () => createJsonResponse({ error: 'unexpected' }));
                const { handlers: hShape } = createIpcHarness({ fetchFn: fetchBadShape });
                await expect(hShape.get('save-editor:translate-batch')!({}, ['hello'], 'ja')).rejects.toThrow('invalid-upstream-response');
            } finally {
                warnSpy.mockRestore();
            }
        });

        it('handles line-count drift via bounded concurrent fallback (<= 4) with sanitized warnings and 429 circuit break', async () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            try {
                let inFlight = 0;
                let maxInFlight = 0;
                let callCount = 0;
                const fetchFn = vi.fn(async (url: string) => {
                    callCount++;
                    if (callCount === 1) {
                        // Batch call returns wrong number of lines (1 instead of 6)
                        return createJsonResponse([[['only one line', 'batch']]]);
                    }
                    inFlight++;
                    maxInFlight = Math.max(maxInFlight, inFlight);
                    await new Promise((r) => setTimeout(r, 10));
                    inFlight--;
                    const q = new URL(url).searchParams.get('q') ?? '';
                    if (q === 'item2') {
                        return createJsonResponse({}, { status: 500, statusText: 'Internal Server Error' });
                    }
                    if (q === 'C:\\Users\\John Doe\\secret') {
                        throw new Error('ECONNREFUSED C:\\Users\\John Doe\\proxy');
                    }
                    return createJsonResponse([[[`T:${q}`, q]]]);
                });

                const { handlers } = createIpcHarness({ fetchFn });
                const texts = ['item0', 'item1', 'item2', 'C:\\Users\\John Doe\\secret', 'item4', 'item5'];
                const res = await handlers.get('save-editor:translate-batch')!({}, texts, 'ja');

                expect(maxInFlight).toBeLessThanOrEqual(4);
                expect(res['item0']).toBe('T:item0');
                expect(res['item1']).toBe('T:item1');
                expect(res['item4']).toBe('T:item4');
                expect(res['item5']).toBe('T:item5');
                expect(res['item2']).toBeUndefined();

                const warnJson = JSON.stringify(warnSpy.mock.calls);
                expect(warnJson).not.toContain('John Doe');

                // HTTP 429 during fallback circuit-breaks immediately
                let fbCalls = 0;
                const fetch429Fallback = vi.fn(async () => {
                    fbCalls++;
                    if (fbCalls === 1) {
                        return createJsonResponse([[['wrong', 'batch']]]);
                    }
                    return createJsonResponse({}, { status: 429, statusText: 'Too Many Requests' });
                });
                const { handlers: h429 } = createIpcHarness({ fetchFn: fetch429Fallback });
                await expect(
                    h429.get('save-editor:translate-batch')!({}, ['a', 'b', 'c', 'd', 'e'], 'ja')
                ).rejects.toThrow('HTTP 429: Too Many Requests');
            } finally {
                warnSpy.mockRestore();
            }
        });

        it('supports save-editor:cancel-translate, duplicate jobId replacement, fake-timer cancellableSleep, fallback abort, and sender cleanup', async () => {
            const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            try {
                const { handlers } = createIpcHarness();
                const cancelHandler = handlers.get('save-editor:cancel-translate')!;

                // Invalid / unknown jobIds resolve { cancelled: false }
                expect(await cancelHandler({}, {})).toEqual({ cancelled: false });
                expect(await cancelHandler({}, { jobId: '' })).toEqual({ cancelled: false });
                expect(await cancelHandler({}, { jobId: 123 })).toEqual({ cancelled: false });
                expect(await cancelHandler({}, { jobId: 'unknown-job' })).toEqual({ cancelled: false });

                // Cancel mid-fetch + duplicate jobId replacement preserves replacement controller
                const signals: AbortSignal[] = [];
                const fetchHanging = vi.fn((_url: string, init?: RequestInit) => {
                    const sig = init?.signal!;
                    signals.push(sig);
                    return new Promise<Response>((_resolve, reject) => {
                        if (sig.aborted) {
                            reject(new DOMException('Aborted', 'AbortError'));
                            return;
                        }
                        sig.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
                    });
                });

                const { handlers: hHang } = createIpcHarness({ fetchFn: fetchHanging });
                const translate = hHang.get('save-editor:translate-batch')!;
                const cancel = hHang.get('save-editor:cancel-translate')!;
                const ev1 = createEventSender();
                const ev2 = createEventSender();

                const job1 = translate({ sender: ev1.sender }, ['hello'], 'ja', { jobId: 'job-dup' });
                await vi.waitFor(() => expect(signals.length).toBe(1));

                // Second call with same jobId aborts job1, but replacement remains cancellable
                const job2 = translate({ sender: ev2.sender }, ['world'], 'ja', { jobId: 'job-dup' });
                await vi.waitFor(() => expect(signals.length).toBe(2));

                expect(signals[0].aborted).toBe(true);
                await expect(job1).rejects.toMatchObject({ name: 'AbortError' });
                expect(ev1.listenerCount('destroyed')).toBe(0);

                // Replacement job2 is still active and cancellable
                expect(signals[1].aborted).toBe(false);
                expect(await cancel({}, { jobId: 'job-dup' })).toEqual({ cancelled: true });
                expect(signals[1].aborted).toBe(true);
                await expect(job2).rejects.toMatchObject({ name: 'AbortError' });
                expect(ev2.listenerCount('destroyed')).toBe(0);
                expect(await cancel({}, { jobId: 'job-dup' })).toEqual({ cancelled: false });

                // Cancel during runBoundedFallback aborts in-flight worker without false warnings
                warnSpy.mockClear();
                let fbStep = 0;
                const fbSignals: AbortSignal[] = [];
                const fetchFallbackAbort = vi.fn((_url: string, init?: RequestInit) => {
                    fbStep++;
                    if (fbStep === 1) {
                        return Promise.resolve(createJsonResponse([[['drift', 'batch']]]));
                    }
                    const sig = init?.signal!;
                    fbSignals.push(sig);
                    return new Promise<Response>((_resolve, reject) => {
                        sig.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
                    });
                });
                const { handlers: hFb } = createIpcHarness({ fetchFn: fetchFallbackAbort });
                const fbJob = hFb.get('save-editor:translate-batch')!({}, ['a', 'b'], 'ja', { jobId: 'job-fb' });
                await vi.waitFor(() => expect(fbSignals.length).toBeGreaterThan(0));
                expect(await hFb.get('save-editor:cancel-translate')!({}, { jobId: 'job-fb' })).toEqual({ cancelled: true });
                await expect(fbJob).rejects.toMatchObject({ name: 'AbortError' });
                // Only the line-count drift warning should have been logged, no false fallback item warnings
                expect(warnSpy).toHaveBeenCalledTimes(1);

                // Window destruction mid-flight aborts and cleans up without throwing
                const evDestroy = createEventSender();
                const fetchDestroy = vi.fn((_url: string, init?: RequestInit) => {
                    const sig = init?.signal!;
                    return new Promise<Response>((_resolve, reject) => {
                        sig.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
                    });
                });
                const { handlers: hDestroy } = createIpcHarness({ fetchFn: fetchDestroy });
                const destroyJob = hDestroy.get('save-editor:translate-batch')!({ sender: evDestroy.sender }, ['hi'], 'ja', { jobId: 'job-win' });
                await vi.waitFor(() => expect(fetchDestroy).toHaveBeenCalledTimes(1));
                evDestroy.destroy();
                await expect(destroyJob).rejects.toMatchObject({ name: 'AbortError' });
                expect(await hDestroy.get('save-editor:cancel-translate')!({}, { jobId: 'job-win' })).toEqual({ cancelled: false });

                // Fake timers: cancellableSleep aborts retry delay immediately without stalling
                vi.useFakeTimers();
                try {
                    const fetch503 = vi.fn(async () => createJsonResponse({}, { status: 503, statusText: 'Busy', headers: { 'Retry-After': '30' } }));
                    const { handlers: hSleep } = createIpcHarness({ fetchFn: fetch503 });
                    const sleepJob = hSleep.get('save-editor:translate-batch')!({}, ['hi'], 'ja', { jobId: 'job-sleep', timeoutMs: 60_000 });
                    await Promise.resolve();
                    await Promise.resolve();
                    expect(fetch503).toHaveBeenCalledTimes(1);
                    expect(await hSleep.get('save-editor:cancel-translate')!({}, { jobId: 'job-sleep' })).toEqual({ cancelled: true });
                    await expect(sleepJob).rejects.toMatchObject({ name: 'AbortError' });
                } finally {
                    vi.useRealTimers();
                }

                expect(logSpy).toHaveBeenCalledWith(
                    '[save-editor:translate-batch] Translation job cancelled:',
                    expect.objectContaining({ totalChunks: 1 })
                );
            } finally {
                logSpy.mockRestore();
                warnSpy.mockRestore();
            }
        });
    });
});
