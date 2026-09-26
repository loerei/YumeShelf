/// <reference types="node" />
import './scanner.test';
// @ts-ignore
import { describe, it, expect, vi } from 'vitest';
import { updateLibraryConfig } from './config';
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
