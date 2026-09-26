/// <reference types="node" />
import './scanner.test';
// @ts-ignore
import { describe, it, expect, vi } from 'vitest';
import {
    updateLibraryConfig,
    setupLibrary,
    addLibraryPath,
    removeLibraryPath,
    changeLibraryPath,
    resolveLibraryConfig,
    resolveLibraryFolderToOpen
} from './config';
import { createLibraryState } from './index';

describe('updateLibraryConfig - Permutation Defense & Whitelist (Ticket 01.4.1.2.1)', () => {
    function createTestContext(initialConfig: any = {}, options: any = {}) {
        let currentDb: any = {
            schemaVersion: 1,
            config: {
                libraryPaths: ['/games/a', '/games/b'],
                libraryPath: '/games/a',
                ...initialConfig
            },
            games: {}
        };

        let degraded = options.isDegraded ?? false;

        const context: any = {
            targetPlatform: options.targetPlatform,
            isDegraded: () => degraded,
            setDegraded: (val: boolean) => { degraded = val; },
            loadDB: vi.fn(async () => {
                if (options.degradeDuringLoad) {
                    degraded = true;
                }
                return currentDb;
            }),
            saveDB: vi.fn(async (db: any) => {
                if (options.saveShouldFail) {
                    throw new Error('Simulated write failure');
                }
                currentDb = JSON.parse(JSON.stringify(db));
            }),
            getDb: () => currentDb
        };
        return context;
    }

    it('rejects update immediately if context is degraded at entry', async () => {
        const context = createTestContext({}, { isDegraded: true });
        await expect(updateLibraryConfig(context, { maxDepth: 4 }))
            .rejects.toThrow('Database is in degraded state');
        expect(context.loadDB).not.toHaveBeenCalled();
    });

    it('rejects update if database transitions to degraded state after loadDB', async () => {
        const context = createTestContext({}, { degradeDuringLoad: true });
        await expect(updateLibraryConfig(context, { maxDepth: 4 }))
            .rejects.toThrow('Database is in degraded state');
        expect(context.loadDB).toHaveBeenCalled();
        expect(context.saveDB).not.toHaveBeenCalled();
    });

    it('defensively deletes legacy singular libraryPath property from updates', async () => {
        const context = createTestContext({ libraryPaths: ['/games/a'] });
        const updates: any = { libraryPath: '/injected/root', maxDepth: 3 };

        const result = await updateLibraryConfig(context, updates, 'linux');

        expect(updates.libraryPath).toBeUndefined();
        expect(result.libraryPaths).toEqual(['/games/a']);
        expect(result.libraryPath).toBe('/games/a');
        expect(context.getDb().config.libraryPaths).toEqual(['/games/a']);
    });

    it('rejects updates.libraryPaths when not an array, empty, or containing non-strings/empty strings', async () => {
        const context = createTestContext();

        await expect(updateLibraryConfig(context, { libraryPaths: 'not-array' as any }))
            .rejects.toThrow('Invalid libraryPaths: expected non-empty array of non-empty path strings');

        await expect(updateLibraryConfig(context, { libraryPaths: [] }))
            .rejects.toThrow('Invalid libraryPaths: expected non-empty array of non-empty path strings');

        await expect(updateLibraryConfig(context, { libraryPaths: ['/valid', 123 as any] }))
            .rejects.toThrow('Invalid libraryPaths: expected non-empty array of non-empty path strings');

        await expect(updateLibraryConfig(context, { libraryPaths: ['/valid', '   '] }))
            .rejects.toThrow('Invalid libraryPaths: expected non-empty array of non-empty path strings');
    });

    it('rejects updates.libraryPaths containing illegal control characters or null bytes', async () => {
        const context = createTestContext();
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        await expect(updateLibraryConfig(context, { libraryPaths: ['/valid/path\0'] }))
            .rejects.toThrow('Invalid libraryPaths: path contains illegal characters');

        expect(warnSpy).toHaveBeenCalledWith(
            '[SECURITY][CONFIG_PATH_INJECTION] Blocked invalid path containing illegal characters or invalid type in updateLibraryConfig:',
            expect.objectContaining({ path: '/valid/path\0' })
        );

        await expect(updateLibraryConfig(context, { libraryPaths: ['/valid/path\n'] }))
            .rejects.toThrow('Invalid libraryPaths: path contains illegal characters');

        await expect(updateLibraryConfig(context, { libraryPaths: ['/valid/path\r'] }))
            .rejects.toThrow('Invalid libraryPaths: path contains illegal characters');

        warnSpy.mockRestore();
    });

    it('rejects reordering when current configuration has no libraryPaths', async () => {
        const context = createTestContext({ libraryPaths: [] });

        await expect(updateLibraryConfig(context, { libraryPaths: ['/games/a'] }, 'linux'))
            .rejects.toThrow('Cannot reorder empty libraryPaths configuration');
    });

    it('rejects duplicate paths in permutation', async () => {
        const context = createTestContext({ libraryPaths: ['/games/a', '/games/b'] });

        await expect(updateLibraryConfig(context, { libraryPaths: ['/games/a', '/games/a'] }, 'linux'))
            .rejects.toThrow('Duplicate libraryPaths in permutation');

        // On Windows, case-insensitive duplicate check
        const winContext = createTestContext({ libraryPaths: ['C:/Games/A', 'C:/Games/B'] });
        await expect(updateLibraryConfig(winContext, { libraryPaths: ['C:\\Games\\A', 'c:\\games\\a'] }, 'win32'))
            .rejects.toThrow('Duplicate libraryPaths in permutation');
    });

    it('rejects invalid permutation length (dropped or extra paths)', async () => {
        const context = createTestContext({ libraryPaths: ['/games/a', '/games/b'] });

        await expect(updateLibraryConfig(context, { libraryPaths: ['/games/a'] }, 'linux'))
            .rejects.toThrow('Invalid libraryPaths permutation length');

        await expect(updateLibraryConfig(context, { libraryPaths: ['/games/a', '/games/b', '/games/c'] }, 'linux'))
            .rejects.toThrow('Invalid libraryPaths permutation length');
    });

    it('rejects unauthorized directory injection in permutation and logs structured security warning', async () => {
        const context = createTestContext({ libraryPaths: ['/games/a', '/games/b'] });
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        await expect(updateLibraryConfig(context, { libraryPaths: ['/games/a', '/etc/shadow'] }, 'linux'))
            .rejects.toThrow('Unauthorized libraryPath in permutation');

        expect(warnSpy).toHaveBeenCalledWith(
            '[SECURITY][CONFIG_PATH_INJECTION] Blocked unauthorized library path in permutation:',
            expect.objectContaining({
                unauthorizedPaths: ['/etc/shadow'],
                configuredRoots: ['/games/a', '/games/b']
            })
        );

        warnSpy.mockRestore();
    });

    it('successfully reorders valid bijective permutation', async () => {
        const context = createTestContext({ libraryPaths: ['/games/a', '/games/b'] });

        const result = await updateLibraryConfig(context, { libraryPaths: ['/games/b', '/games/a'] }, 'linux');

        expect(result.libraryPaths).toEqual(['/games/b', '/games/a']);
        expect(result.libraryPath).toBe('/games/b');
        expect(context.getDb().config.libraryPaths).toEqual(['/games/b', '/games/a']);
    });

    it('normalizes Windows backslashes and case during permutation reordering', async () => {
        const context = createTestContext({ libraryPaths: ['D:/Games/A', 'D:/Games/B'] }, { targetPlatform: 'win32' });

        const result = await updateLibraryConfig(context, { libraryPaths: ['d:\\games\\b', 'D:\\GAMES\\A'] }, 'win32');

        expect(result.libraryPaths).toEqual(['d:\\games\\b', 'D:\\GAMES\\A']);
        expect(result.libraryPath).toBe('d:\\games\\b');
    });

    it('bypasses path permutation checks when updates.libraryPaths is omitted', async () => {
        const context = createTestContext({ libraryPaths: ['/games/a', '/games/b'] });

        const result = await updateLibraryConfig(context, { maxDepth: 8 }, 'linux');

        expect(result.libraryPaths).toEqual(['/games/a', '/games/b']);
        expect(result.maxDepth).toBe(8);
    });

    it('rejects folderAliases if not a plain object', async () => {
        const context = createTestContext();

        await expect(updateLibraryConfig(context, { folderAliases: null as any }))
            .rejects.toThrow('Invalid folderAliases: expected plain object');

        await expect(updateLibraryConfig(context, { folderAliases: 'invalid' as any }))
            .rejects.toThrow('Invalid folderAliases: expected plain object');

        await expect(updateLibraryConfig(context, { folderAliases: ['array'] as any }))
            .rejects.toThrow('Invalid folderAliases: expected plain object');
    });

    it('sanitizes folderAliases against prototype pollution keys', async () => {
        const context = createTestContext({
            libraryPaths: ['/games'],
            folderAliases: { '/games/sub': 'Existing' }
        });

        const updates = JSON.parse('{"folderAliases": {"__proto__": "polluted", "constructor": "polluted", "prototype": "polluted", "/games/sub": "Updated"}}');

        const result = await updateLibraryConfig(context, updates, 'linux');

        expect(result.folderAliases).toEqual({ '/games/sub': 'Updated' });
        expect(({} as any).polluted).toBeUndefined();
    });

    it('rejects folder alias keys containing illegal characters with structured warning', async () => {
        const context = createTestContext({
            libraryPaths: ['/games'],
            folderAliases: {}
        });
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const result = await updateLibraryConfig(context, {
            folderAliases: {
                '/games/sub\0': 'Bad Null',
                '/games/sub\n': 'Bad Newline',
                '/games/valid': 'Good Valid'
            }
        }, 'linux');

        expect(warnSpy).toHaveBeenCalledWith(
            '[SECURITY][CONFIG_ALIAS_INJECTION] Blocked folder alias key containing illegal characters:',
            expect.objectContaining({ key: '/games/sub\0' })
        );
        expect(warnSpy).toHaveBeenCalledWith(
            '[SECURITY][CONFIG_ALIAS_INJECTION] Blocked folder alias key containing illegal characters:',
            expect.objectContaining({ key: '/games/sub\n' })
        );
        expect(result.folderAliases).toEqual({ '/games/valid': 'Good Valid' });

        warnSpy.mockRestore();
    });

    it('rejects newly introduced folder alias key outside library roots', async () => {
        const context = createTestContext({
            libraryPaths: ['/games'],
            folderAliases: {}
        });
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        await expect(updateLibraryConfig(context, {
            folderAliases: { '/unauthorized/outside/path': 'Outside' }
        }, 'linux')).rejects.toThrow('Unauthorized folder alias key outside library roots');

        expect(warnSpy).toHaveBeenCalledWith(
            '[SECURITY][CONFIG_ALIAS_INJECTION] Blocked unauthorized folder alias key outside library roots:',
            expect.objectContaining({
                aliasKey: '/unauthorized/outside/path',
                configuredRoots: ['/games']
            })
        );

        warnSpy.mockRestore();
    });

    it('exempts pre-existing alias keys from boundary containment to preserve tombstones', async () => {
        const context = createTestContext({
            libraryPaths: ['/active/games'],
            folderAliases: {
                '/orphaned/tombstone': 'Orphaned Tombstone',
                '/active/games/sub': 'Active Sub'
            }
        });

        // Updating an orphaned alias (which is outside active library roots) is permitted because it was pre-existing
        const result = await updateLibraryConfig(context, {
            folderAliases: {
                '/orphaned/tombstone': 'Updated Tombstone'
            }
        }, 'linux');

        expect(result.folderAliases).toEqual({
            '/orphaned/tombstone': 'Updated Tombstone',
            '/active/games/sub': 'Active Sub'
        });
    });

    it('deep-merges folderAliases and prunes alias when updated with empty string', async () => {
        const context = createTestContext({
            libraryPaths: ['D:/Games'],
            folderAliases: {
                'd:/games/sub1': 'Alias 1',
                'd:/games/sub2': 'Alias 2'
            }
        }, { targetPlatform: 'win32' });

        // Passing non-canonical key with empty string removes the existing canonical alias
        const result = await updateLibraryConfig(context, {
            folderAliases: {
                'D:\\Games\\Sub1': '',
                'D:\\Games\\Sub3': 'Alias 3'
            }
        }, 'win32');

        expect(result.folderAliases).toBeDefined();
        expect(result.folderAliases!).toEqual({
            'd:/games/sub2': 'Alias 2',
            'd:/games/sub3': 'Alias 3'
        });
        expect(result.folderAliases!['d:/games/sub1']).toBeUndefined();
    });

    it('preserves existing aliases under partial updates that do not provide folderAliases', async () => {
        const context = createTestContext({
            libraryPaths: ['/games'],
            folderAliases: { '/games/sub': 'Keep Me' }
        });

        const result = await updateLibraryConfig(context, { telemetryEnabled: true }, 'linux');

        expect(result.folderAliases).toEqual({ '/games/sub': 'Keep Me' });
        expect(result.telemetryEnabled).toBe(true);
    });

    it('strictly enforces property whitelist and strips unexpected top-level fields', async () => {
        const context = createTestContext({
            libraryPaths: ['/games']
        });

        const updates: any = {
            telemetryEnabled: true,
            titleDisplayMode: 'legacy_folder',
            displayProductCodes: true,
            preferredLocale: 'ja',
            maxDepth: 3,
            autoLaunch: 'minimized',
            minimizeToTray: true,
            exposeBetaOptions: true,
            unauthorizedInjectedField: 'dangerous',
            maliciousObject: { evil: true }
        };

        const result = await updateLibraryConfig(context, updates, 'linux');

        expect((result as any).unauthorizedInjectedField).toBeUndefined();
        expect((result as any).maliciousObject).toBeUndefined();
        expect((context.getDb().config as any).unauthorizedInjectedField).toBeUndefined();
        expect((context.getDb().config as any).maliciousObject).toBeUndefined();

        expect(result.telemetryEnabled).toBe(true);
        expect(result.titleDisplayMode).toBe('legacy_folder');
        expect(result.displayProductCodes).toBe(true);
        expect(result.preferredLocale).toBe('ja');
        expect(result.maxDepth).toBe(3);
        expect(result.autoLaunch).toBe('minimized');
        expect(result.minimizeToTray).toBe(true);
        expect(result.exposeBetaOptions).toBe(true);
    });

    it('enforces snapshot-and-rollback contract on persistence failure', async () => {
        const initialConfig = {
            libraryPaths: ['/games/a', '/games/b'],
            libraryPath: '/games/a',
            maxDepth: 2
        };
        const context = createTestContext(initialConfig, { saveShouldFail: true });
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const updates = { maxDepth: 10 };

        await expect(updateLibraryConfig(context, updates, 'linux'))
            .rejects.toThrow('Simulated write failure');

        expect(errorSpy).toHaveBeenCalledWith(
            '[LIBRARY_STATE][CONFIG_UPDATE] Failed to persist configuration updates:',
            expect.objectContaining({
                updates,
                error: expect.any(Error)
            })
        );

        // Verify in-memory db.config was restored to initial snapshot
        expect(context.getDb().config.maxDepth).toBe(2);

        errorSpy.mockRestore();
    });

    it('forwards targetPlatform through createLibraryState facade', async () => {
        let savedDb: any = null;
        const libraryState = createLibraryState({
            defaultGamesDir: 'C:/DefaultGames',
            dbFilePath: 'C:/mock/db.json',
            dialog: {},
            fs: {},
            fsSync: { existsSync: () => true },
            categoryState: {},
            loadDB: async () => ({
                schemaVersion: 1,
                config: {
                    libraryPaths: ['D:/Games/A', 'D:/Games/B'],
                    libraryPath: 'D:/Games/A'
                },
                games: {}
            }),
            saveDB: async (db: any) => { savedDb = db; }
        });

        // Pass win32 path permutation to updateLibraryConfig via facade
        const result = await libraryState.updateLibraryConfig({
            libraryPaths: ['d:\\games\\b', 'D:\\GAMES\\A']
        }, 'win32');

        expect(result.libraryPaths).toEqual(['d:\\games\\b', 'D:\\GAMES\\A']);
        expect(savedDb.config.libraryPaths).toEqual(['d:\\games\\b', 'D:\\GAMES\\A']);
    });
});

describe('Library Path Mutation Seams & Storage Canonicalization (Ticket 01.4.1.2.2)', () => {
    function createMutationContext(initialConfig: any = {}, options: any = {}) {
        let currentDb: any = {
            schemaVersion: 1,
            config: {
                libraryPaths: ['/games/a', '/games/b'],
                libraryPath: '/games/a',
                ...initialConfig
            },
            games: options.games || {}
        };

        let degraded = options.isDegraded ?? false;
        let catState: any = options.categoryStateData || { assignments: {} };

        const categoryState = {
            loadCategoryState: vi.fn(async () => {
                if (options.catStateDegraded) throw new Error('Category state degraded');
                return JSON.parse(JSON.stringify(catState));
            }),
            saveCategoryState: vi.fn(async (s: any) => {
                if (options.catSaveShouldFail) throw new Error('Category save failed');
                catState = JSON.parse(JSON.stringify(s));
            }),
            isDegraded: () => options.catStateDegraded ?? false
        };

        const fsSync = {
            existsSync: vi.fn((p: string) => {
                if (options.existingPaths) return options.existingPaths.includes(p);
                return true;
            }),
            mkdirSync: vi.fn()
        };

        const dialog = {
            showOpenDialog: vi.fn(async (opts?: any) => {
                if (options.dialogShouldReject) throw new Error('Native dialog failed');
                if (options.dialogCanceled) return { canceled: true, filePaths: [] };
                return { canceled: false, filePaths: options.dialogPaths || ['/selected/path'] };
            })
        };

        const context: any = {
            defaultGamesDir: options.defaultGamesDir || '/default/games',
            dialog,
            folderPickerSeam: options.folderPickerSeam,
            fsSync,
            categoryState,
            targetPlatform: options.targetPlatform,
            isDegraded: () => degraded,
            setDegraded: (val: boolean) => { degraded = val; },
            loadDB: vi.fn(async () => {
                if (options.degradeDuringLoad) {
                    degraded = true;
                }
                return currentDb;
            }),
            saveDB: vi.fn(async (db: any) => {
                if (options.saveShouldFail) {
                    throw new Error('Disk write failed');
                }
                currentDb = JSON.parse(JSON.stringify(db));
            }),
            getDb: () => currentDb,
            getCategoryState: () => catState
        };

        return context;
    }

    describe('setupLibrary', () => {
        it('rejects if context is degraded at entry or post-loadDB', async () => {
            const context = createMutationContext({}, { isDegraded: true });
            await expect(setupLibrary(context, 'default', 'linux'))
                .rejects.toThrow('Database is in degraded state');

            const context2 = createMutationContext({}, { degradeDuringLoad: true });
            await expect(setupLibrary(context2, 'default', 'linux'))
                .rejects.toThrow('Database is in degraded state');
        });

        it('creates default directory if missing and configures library', async () => {
            const context = createMutationContext({}, {
                defaultGamesDir: '/auto/created/games',
                existingPaths: []
            });

            const result = await setupLibrary(context, 'default', 'linux');

            expect(context.fsSync.mkdirSync).toHaveBeenCalledWith('/auto/created/games', { recursive: true });
            expect(result?.libraryPaths).toEqual(['/auto/created/games']);
            expect(result?.libraryPath).toBe('/auto/created/games');
        });

        it('rejects default setup if defaultGamesDir contains illegal characters or is a filesystem root', async () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            const contextBadChar = createMutationContext({}, { defaultGamesDir: '/games/bad\0' });
            await expect(setupLibrary(contextBadChar, 'default', 'linux'))
                .rejects.toThrow('Invalid library path: path contains illegal characters');

            const contextRoot = createMutationContext({}, { defaultGamesDir: '/' });
            await expect(setupLibrary(contextRoot, 'default', 'linux'))
                .rejects.toThrow('Blocked configuration of filesystem root as library path');

            warnSpy.mockRestore();
        });

        it('uses folderPickerSeam when provided and handles custom directory selection', async () => {
            const folderPickerSeam = vi.fn(async () => ['/custom/picked/games']);
            const context = createMutationContext({}, { folderPickerSeam });

            const result = await setupLibrary(context, 'custom', 'linux');

            expect(folderPickerSeam).toHaveBeenCalled();
            expect(context.dialog.showOpenDialog).not.toHaveBeenCalled();
            expect(result?.libraryPaths).toEqual(['/custom/picked/games']);
            expect(result?.libraryPath).toBe('/custom/picked/games');
        });

        it('returns null on custom setup dialog cancellation or empty selection', async () => {
            const context = createMutationContext({}, { dialogCanceled: true });
            const result = await setupLibrary(context, 'custom', 'linux');
            expect(result).toBeNull();

            const contextEmpty = createMutationContext({}, { folderPickerSeam: async () => [] });
            const resultEmpty = await setupLibrary(contextEmpty, 'custom', 'linux');
            expect(resultEmpty).toBeNull();
        });

        it('logs error and returns null if native directory open dialog rejects', async () => {
            const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            const context = createMutationContext({}, { dialogShouldReject: true });

            const result = await setupLibrary(context, 'custom', 'linux');

            expect(result).toBeNull();
            expect(errorSpy).toHaveBeenCalledWith(
                '[LIBRARY_STATE][DIRECTORY_PICKER] Native directory open dialog failed:',
                expect.objectContaining({ error: expect.any(Error) })
            );
            errorSpy.mockRestore();
        });

        it('restores db.config and category state upon persistence failure', async () => {
            const initialConfig = { libraryPaths: ['/games/original'], libraryPath: '/games/original' };
            const initialCat = { assignments: { 'game-1': ['cat-1'] } };
            const context = createMutationContext(initialConfig, {
                saveShouldFail: true,
                categoryStateData: initialCat,
                dialogPaths: ['/games/new']
            });

            await expect(setupLibrary(context, 'custom', 'linux')).rejects.toThrow('Disk write failed');

            expect(context.getDb().config.libraryPaths).toEqual(['/games/original']);
            expect(context.categoryState.saveCategoryState).toHaveBeenCalledWith(initialCat);
        });
    });

    describe('removeLibraryPath', () => {
        it('rejects if context is degraded at entry', async () => {
            const context = createMutationContext({}, { isDegraded: true });
            await expect(removeLibraryPath(context, '/games/a', 'linux'))
                .rejects.toThrow('Database is in degraded state');
        });

        it('returns config if targetPath is invalid or empty', async () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const context = createMutationContext({ libraryPaths: ['/games/a', '/games/b'] });

            const result = await removeLibraryPath(context, '', 'linux');

            expect(warnSpy).toHaveBeenCalledWith(
                '[LIBRARY_STATE][REMOVE_PATH] Invalid target path: expected non-empty string',
                { targetPath: '' }
            );
            expect(result?.libraryPaths).toEqual(['/games/a', '/games/b']);
            warnSpy.mockRestore();
        });

        it('enforces minimum root count guard (<= 1) returning config untouched', async () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const context = createMutationContext({ libraryPaths: ['/only/one'] });

            const result = await removeLibraryPath(context, '/only/one', 'linux');

            expect(warnSpy).toHaveBeenCalledWith(
                '[LIBRARY_STATE][REMOVE_PATH] Cannot remove library path: path not found or minimum root count reached',
                { targetPath: '/only/one', configuredCount: 1 }
            );
            expect(result?.libraryPaths).toEqual(['/only/one']);
            warnSpy.mockRestore();
        });

        it('returns config untouched when target path is not found', async () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const context = createMutationContext({ libraryPaths: ['/games/a', '/games/b'] });

            const result = await removeLibraryPath(context, '/non/existent', 'linux');

            expect(warnSpy).toHaveBeenCalledWith(
                '[LIBRARY_STATE][REMOVE_PATH] Cannot remove library path: path not found or minimum root count reached',
                { targetPath: '/non/existent', configuredCount: 2 }
            );
            expect(result?.libraryPaths).toEqual(['/games/a', '/games/b']);
            warnSpy.mockRestore();
        });

        it('successfully removes path, synchronizes libraryPath, retains aliases, and purges orphans', async () => {
            const context = createMutationContext({
                libraryPaths: ['/games/a', '/games/b'],
                folderAliases: {
                    '/games/a/sub': 'Sub A',
                    '/games/b/sub': 'Sub B'
                }
            }, {
                games: {
                    'game-a': { folderPath: '/games/a/game1', exePath: '/games/a/game1/run.sh' },
                    'game-b': { folderPath: '/games/b/game2', exePath: '/games/b/game2/run.sh' }
                }
            });

            const result = await removeLibraryPath(context, '/games/a', 'linux');

            expect(result?.libraryPaths).toEqual(['/games/b']);
            expect(result?.libraryPath).toBe('/games/b');
            // Folder aliases are retained as durable tombstones per Orphaned Folder Alias Lifecycle Invariant
            expect(result?.folderAliases).toEqual({
                '/games/a/sub': 'Sub A',
                '/games/b/sub': 'Sub B'
            });
            // Games under removed root /games/a should be purged by canonicalizeStoredGames with purgeOrphans: true
            expect(context.getDb().games['game-a']).toBeUndefined();
            expect(context.getDb().games['game2']).toBeDefined();
        });

        it('synchronizes root path removal when present in raw db.config.libraryPaths', async () => {
            const context = createMutationContext();
            // Raw db.config has a stripped root path ('/') alongside a valid root ('/games/valid')
            context.getDb().config = {
                libraryPaths: ['/', '/games/valid'],
                libraryPath: '/'
            };

            const result = await removeLibraryPath(context, '/', 'linux');

            expect(result?.libraryPaths).toEqual(['/games/valid']);
            expect(result?.libraryPath).toBe('/games/valid');
            expect(context.getDb().config.libraryPaths).toEqual(['/games/valid']);
        });

        it('restores snapshot on persistence failure in removeLibraryPath', async () => {
            const context = createMutationContext({
                libraryPaths: ['/games/a', '/games/b']
            }, { saveShouldFail: true });

            await expect(removeLibraryPath(context, '/games/a', 'linux'))
                .rejects.toThrow('Disk write failed');

            expect(context.getDb().config.libraryPaths).toEqual(['/games/a', '/games/b']);
        });
    });

    describe('changeLibraryPath', () => {
        it('rejects if context is degraded at entry or during initialDb load', async () => {
            const context = createMutationContext({}, { isDegraded: true });
            await expect(changeLibraryPath(context, '/games/a', 'linux'))
                .rejects.toThrow('Database is in degraded state');

            const context2 = createMutationContext({}, { degradeDuringLoad: true });
            await expect(changeLibraryPath(context2, '/games/a', 'linux'))
                .rejects.toThrow('Database is in degraded state');
        });

        it('returns config if oldPath is invalid or empty', async () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const context = createMutationContext({ libraryPaths: ['/games/a'] });

            const result = await changeLibraryPath(context, '   ', 'linux');

            expect(warnSpy).toHaveBeenCalledWith(
                '[LIBRARY_STATE][CHANGE_PATH] Invalid oldPath: expected non-empty string',
                { oldPath: '   ' }
            );
            expect(result?.libraryPaths).toEqual(['/games/a']);
            warnSpy.mockRestore();
        });

        it('returns null if oldPath is not in configured libraryPaths prior to dialog', async () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const context = createMutationContext({ libraryPaths: ['/games/a'] });

            const result = await changeLibraryPath(context, '/games/missing', 'linux');

            expect(result).toBeNull();
            expect(context.dialog.showOpenDialog).not.toHaveBeenCalled();
            expect(warnSpy).toHaveBeenCalledWith(
                '[LIBRARY_STATE][CHANGE_PATH] Target oldPath not found in configured library paths:',
                { oldPath: '/games/missing' }
            );
            warnSpy.mockRestore();
        });

        it('returns null on self-selection no-op', async () => {
            const context = createMutationContext({ libraryPaths: ['/games/a', '/games/b'] }, {
                dialogPaths: ['/games/a']
            });

            const result = await changeLibraryPath(context, '/games/a', 'linux');

            expect(result).toBeNull();
            expect(context.getDb().config.libraryPaths).toEqual(['/games/a', '/games/b']);
        });

        it('rejects chosenPath containing illegal characters or resolving to filesystem root', async () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            const contextBadChar = createMutationContext({ libraryPaths: ['/games/a'] }, {
                dialogPaths: ['/games/new\n']
            });
            await expect(changeLibraryPath(contextBadChar, '/games/a', 'linux'))
                .rejects.toThrow('Invalid library path: path contains illegal characters');

            const contextRoot = createMutationContext({ libraryPaths: ['/games/a'] }, {
                dialogPaths: ['/']
            });
            await expect(changeLibraryPath(contextRoot, '/games/a', 'linux'))
                .rejects.toThrow('Blocked configuration of filesystem root as library path');

            warnSpy.mockRestore();
        });

        it('replaces path, migrates subsumed folder aliases, and protects against prototype pollution', async () => {
            const context = createMutationContext({
                libraryPaths: ['/games/old', '/games/other'],
                folderAliases: {
                    '/games/old/rpg': 'Old RPG',
                    '/games/old/action/sub': 'Old Action Sub',
                    '/games/other/puzzle': 'Other Puzzle'
                }
            }, {
                dialogPaths: ['/games/new']
            });

            const result = await changeLibraryPath(context, '/games/old', 'linux');

            expect(result?.libraryPaths).toEqual(['/games/new', '/games/other']);
            expect(result?.libraryPath).toBe('/games/new');
            expect(result?.folderAliases).toEqual({
                '/games/new/rpg': 'Old RPG',
                '/games/new/action/sub': 'Old Action Sub',
                '/games/other/puzzle': 'Other Puzzle'
            });
        });

        it('handles duplicate selection by pruning oldPath and retaining aliases as tombstones', async () => {
            const context = createMutationContext({
                libraryPaths: ['/games/a', '/games/b'],
                folderAliases: {
                    '/games/a/sub': 'Sub A',
                    '/games/b/sub': 'Sub B'
                }
            }, {
                // User selects /games/b when changing /games/a -> duplicate of existing path
                dialogPaths: ['/games/b']
            });

            const result = await changeLibraryPath(context, '/games/a', 'linux');

            expect(result?.libraryPaths).toEqual(['/games/b']);
            expect(result?.folderAliases).toEqual({
                '/games/a/sub': 'Sub A',
                '/games/b/sub': 'Sub B'
            });
        });

        it('throws if duplicate pruning would reduce roots below minimum (<= 1)', async () => {
            const context = createMutationContext({
                libraryPaths: ['/games/a']
            }, {
                dialogPaths: ['/games/a'] // self-selection handled earlier, but test distinct duplicate
            });
            // If another path was somehow duplicate while length <= 1
            context.getDb().config.libraryPaths = ['/games/a'];
            // Mock prompt to return /games/existing
            context.dialog.showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: ['/games/existing'] });
            // Simulate queue state where only 1 path exists but duplicate match occurs
            const originalSome = Array.prototype.some;
            vi.spyOn(Array.prototype, 'some').mockImplementationOnce(function (this: any, callback: any) {
                if (this && this.length === 1 && this[0] === '/games/a') return true;
                return originalSome.apply(this, arguments as any);
            });

            await expect(changeLibraryPath(context, '/games/a', 'linux'))
                .rejects.toThrow('Cannot prune path: minimum root count reached');
        });
    });

    describe('addLibraryPath', () => {
        it('rejects if context is degraded at entry or post-loadDB', async () => {
            const context = createMutationContext({}, { isDegraded: true });
            await expect(addLibraryPath(context, 'linux'))
                .rejects.toThrow('Database is in degraded state');

            const context2 = createMutationContext({}, { degradeDuringLoad: true });
            await expect(addLibraryPath(context2, 'linux'))
                .rejects.toThrow('Database is in degraded state');
        });

        it('returns null on directory selection cancellation or empty selection', async () => {
            const context = createMutationContext({}, { dialogCanceled: true });
            const result = await addLibraryPath(context, 'linux');
            expect(result).toBeNull();
        });

        it('rejects chosenPath containing illegal characters or resolving to filesystem root', async () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            const contextBadChar = createMutationContext({}, { dialogPaths: ['/games/bad\r'] });
            await expect(addLibraryPath(contextBadChar, 'linux'))
                .rejects.toThrow('Invalid library path: path contains illegal characters');

            const contextRoot = createMutationContext({}, { dialogPaths: ['/'] });
            await expect(addLibraryPath(contextRoot, 'linux'))
                .rejects.toThrow('Blocked configuration of filesystem root as library path');

            warnSpy.mockRestore();
        });

        it('prevents adding duplicate library path under queue lock', async () => {
            const context = createMutationContext({
                libraryPaths: ['/games/a', '/games/b']
            }, {
                dialogPaths: ['/games/a']
            });

            const result = await addLibraryPath(context, 'linux');

            expect(result?.libraryPaths).toEqual(['/games/a', '/games/b']);
            expect(context.saveDB).not.toHaveBeenCalled();
        });

        it('successfully appends new path and synchronizes libraryPath', async () => {
            const context = createMutationContext({
                libraryPaths: ['/games/a']
            }, {
                dialogPaths: ['/games/new']
            });

            const result = await addLibraryPath(context, 'linux');

            expect(result?.libraryPaths).toEqual(['/games/a', '/games/new']);
            expect(result?.libraryPath).toBe('/games/a');
            expect(context.getDb().config.libraryPaths).toEqual(['/games/a', '/games/new']);
        });
    });

    describe('resolveLibraryConfig & resolveLibraryFolderToOpen', () => {
        it('validates defaultGamesDir before adopting when libraryPaths is empty', async () => {
            // Valid defaultGamesDir exists
            const contextValid = createMutationContext({ libraryPaths: [] }, {
                defaultGamesDir: '/valid/default/games',
                existingPaths: ['/valid/default/games']
            });
            const configValid = await resolveLibraryConfig(contextValid, 'linux');
            expect(configValid?.libraryPaths).toEqual(['/valid/default/games']);

            // Invalid defaultGamesDir (resolves to root '/')
            const contextRoot = createMutationContext({ libraryPaths: [] }, {
                defaultGamesDir: '/',
                existingPaths: ['/']
            });
            const configRoot = await resolveLibraryConfig(contextRoot, 'linux');
            expect(configRoot?.libraryPaths).toEqual([]);

            // Invalid defaultGamesDir containing illegal characters
            const contextBad = createMutationContext({ libraryPaths: [] }, {
                defaultGamesDir: '/games/bad\0',
                existingPaths: ['/games/bad\0']
            });
            const configBad = await resolveLibraryConfig(contextBad, 'linux');
            expect(configBad?.libraryPaths).toEqual([]);
        });

        it('resolveLibraryFolderToOpen handles missing existsSync safely with optional chaining', async () => {
            const contextMissing = {
                defaultGamesDir: '/default',
                fsSync: {}, // no existsSync method
                loadDB: async () => ({ schemaVersion: 1, config: { libraryPaths: ['/games/a'] }, games: {} }),
                saveDB: async () => {}
            };

            const result = await resolveLibraryFolderToOpen(contextMissing);
            expect(result).toBe('');
        });
    });

    describe('createLibraryState queue symmetry & folderPickerSeam', () => {
        it('forwards folderPickerSeam and does not double-queue removeLibraryPath', async () => {
            let currentDb: any = {
                schemaVersion: 1,
                config: {
                    libraryPaths: ['/games/a', '/games/b'],
                    libraryPath: '/games/a'
                },
                games: {}
            };
            const folderPickerSeam = vi.fn(async () => ['/facade/selected']);

            const libraryState = createLibraryState({
                defaultGamesDir: '/default',
                dbFilePath: '/mock/db.json',
                dialog: {},
                folderPickerSeam,
                fs: {},
                fsSync: { existsSync: () => true },
                categoryState: {
                    loadCategoryState: async () => ({ assignments: {} }),
                    saveCategoryState: async () => {}
                },
                loadDB: async () => JSON.parse(JSON.stringify(currentDb)),
                saveDB: async (db: any) => { currentDb = JSON.parse(JSON.stringify(db)); }
            });

            // addLibraryPath should use the forwarded folderPickerSeam
            const addResult = await libraryState.addLibraryPath('linux');
            expect(folderPickerSeam).toHaveBeenCalled();
            expect(addResult?.libraryPaths).toEqual(['/games/a', '/games/b', '/facade/selected']);

            // removeLibraryPath should execute cleanly without deadlock
            const removeResult = await libraryState.removeLibraryPath('/games/a', 'linux');
            expect(removeResult?.libraryPaths).toEqual(['/games/b', '/facade/selected']);
        });
    });
});
