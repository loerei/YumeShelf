// @ts-ignore
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setFolderAlias } from './actions';
import { createLibraryState } from './index';

describe('LibraryState Actions - setFolderAlias', () => {
    let mockDb: any;
    let mockContext: any;
    let warnSpy: any;
    let errorSpy: any;

    beforeEach(() => {
        mockDb = {
            schemaVersion: 1,
            config: {
                libraryPaths: ['/games'],
                libraryPath: '/games',
                maxDepth: 5,
                folderAliases: {}
            },
            games: {}
        };

        mockContext = {
            isDegraded: vi.fn(() => false),
            loadDB: vi.fn(async () => mockDb),
            saveDB: vi.fn(async (db: any) => {
                mockDb = db;
            }),
            persistDbDirectly: vi.fn(async (db: any) => {
                mockDb = db;
            })
        };

        warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
        delete (Object.prototype as any).favorite;
    });

    describe('Alias Persistence & Canonical Indexing', () => {
        it('persists alias in config.folderAliases under canonical path key', async () => {
            const result = await setFolderAlias(mockContext, '/games/rpg', 'My RPG', 'linux');

            expect(result.ok).toBe(true);
            expect(result.config?.folderAliases?.['/games/rpg']).toBe('My RPG');
            expect(mockDb.config.folderAliases['/games/rpg']).toBe('My RPG');
            expect(mockContext.persistDbDirectly).toHaveBeenCalled();
        });

        it('falls back to saveDB if persistDbDirectly is not defined', async () => {
            delete mockContext.persistDbDirectly;
            const result = await setFolderAlias(mockContext, '/games/rpg', 'My RPG', 'linux');

            expect(result.ok).toBe(true);
            expect(mockDb.config.folderAliases['/games/rpg']).toBe('My RPG');
            expect(mockContext.saveDB).toHaveBeenCalled();
        });
    });

    describe('Input Validation & Prototype Defense', () => {
        it('rejects empty, whitespace, null, undefined, and non-string folderPath', async () => {
            const res1 = await setFolderAlias(mockContext, '', 'Alias');
            expect(res1).toEqual({ ok: false, error: 'invalid-folder-path' });

            const res2 = await setFolderAlias(mockContext, '   ', 'Alias');
            expect(res2).toEqual({ ok: false, error: 'invalid-folder-path' });

            const res3 = await setFolderAlias(mockContext, null as any, 'Alias');
            expect(res3).toEqual({ ok: false, error: 'invalid-folder-path' });

            const res4 = await setFolderAlias(mockContext, undefined as any, 'Alias');
            expect(res4).toEqual({ ok: false, error: 'invalid-folder-path' });

            const res5 = await setFolderAlias(mockContext, 123 as any, 'Alias');
            expect(res5).toEqual({ ok: false, error: 'invalid-folder-path' });

            expect(warnSpy).toHaveBeenCalledWith(
                '[SECURITY][SET_FOLDER_ALIAS] Blocked invalid folder path containing illegal characters or unsafe key:',
                expect.any(Object)
            );
        });

        it('rejects folderPath containing null bytes or newline control characters', async () => {
            const resNull = await setFolderAlias(mockContext, '/games/test\0game', 'Alias');
            expect(resNull).toEqual({ ok: false, error: 'invalid-folder-path' });

            const resNewline = await setFolderAlias(mockContext, '/games/test\ngame', 'Alias');
            expect(resNewline).toEqual({ ok: false, error: 'invalid-folder-path' });

            const resReturn = await setFolderAlias(mockContext, '/games/test\rgame', 'Alias');
            expect(resReturn).toEqual({ ok: false, error: 'invalid-folder-path' });
        });

        it('rejects prototype pollution keys across raw and normalized forms', async () => {
            const unsafeKeys = [
                '__proto__',
                'constructor',
                'prototype',
                './__proto__',
                'foo/../constructor',
                '__PROTO__',
                'prototype/'
            ];

            for (const key of unsafeKeys) {
                const res = await setFolderAlias(mockContext, key, 'Malicious');
                expect(res).toEqual({ ok: false, error: 'invalid-folder-path' });
            }

            expect((Object.prototype as any).Malicious).toBeUndefined();
        });
    });

    describe('Degraded Database State Guards', () => {
        it('aborts at entry if database is in degraded state before loadDB', async () => {
            mockContext.isDegraded.mockReturnValue(true);

            const result = await setFolderAlias(mockContext, '/games/rpg', 'Alias');
            expect(result).toEqual({ ok: false, error: 'degraded-database' });
            expect(warnSpy).toHaveBeenCalledWith(
                '[LIBRARY_STATE][SET_FOLDER_ALIAS] Operation aborted: database is in DEGRADED state',
                { folderPath: '/games/rpg', alias: 'Alias' }
            );
            expect(mockContext.loadDB).not.toHaveBeenCalled();
        });

        it('aborts post-loadDB if database entered degraded state', async () => {
            let loadDbCalled = false;
            mockContext.loadDB.mockImplementation(async () => {
                loadDbCalled = true;
                return mockDb;
            });
            mockContext.isDegraded.mockImplementation(() => loadDbCalled);

            const result = await setFolderAlias(mockContext, '/games/rpg', 'Alias');
            expect(result).toEqual({ ok: false, error: 'degraded-database' });
            expect(warnSpy).toHaveBeenCalledWith(
                '[LIBRARY_STATE][SET_FOLDER_ALIAS] Operation aborted: database is in DEGRADED state',
                { folderPath: '/games/rpg', alias: 'Alias' }
            );
            expect(mockContext.saveDB).not.toHaveBeenCalled();
        });
    });

    describe('Boundary Validation & Durable Tombstones', () => {
        it('rejects newly introduced folder paths outside configured library paths', async () => {
            const result = await setFolderAlias(mockContext, '/outside/secret', 'Secret Game', 'linux');
            expect(result).toEqual({ ok: false, error: 'outside-library' });
            expect(warnSpy).toHaveBeenCalledWith(
                '[SECURITY][SET_FOLDER_ALIAS] Blocked unauthorized folder path outside library roots:',
                { folderPath: '/outside/secret' }
            );
            expect(mockDb.config.folderAliases['/outside/secret']).toBeUndefined();
        });

        it('permits updating or clearing pre-existing alias tombstones outside library paths', async () => {
            mockDb.config.folderAliases = {
                '/old-drive/orphaned-folder': 'Old Tombstone'
            };

            // Updating pre-existing tombstone
            const resUpdate = await setFolderAlias(mockContext, '/old-drive/orphaned-folder', 'Updated Tombstone', 'linux');
            expect(resUpdate.ok).toBe(true);
            expect(mockDb.config.folderAliases['/old-drive/orphaned-folder']).toBe('Updated Tombstone');

            // Clearing pre-existing tombstone
            const resClear = await setFolderAlias(mockContext, '/old-drive/orphaned-folder', '', 'linux');
            expect(resClear.ok).toBe(true);
            expect(mockDb.config.folderAliases['/old-drive/orphaned-folder']).toBeUndefined();
        });
    });

    describe('Alias Sanitization & Deletion on Empty String', () => {
        it('strips non-printable and newline control characters, and trims whitespace', async () => {
            const dirtyAlias = '  \tGame\r\nTitle\x00With\x1fTabs   ';
            const result = await setFolderAlias(mockContext, '/games/rpg', dirtyAlias, 'linux');

            expect(result.ok).toBe(true);
            expect(mockDb.config.folderAliases['/games/rpg']).toBe('GameTitleWithTabs');
        });

        it('bounds alias to maximum 255 characters', async () => {
            const longAlias = 'A'.repeat(300);
            const result = await setFolderAlias(mockContext, '/games/rpg', longAlias, 'linux');

            expect(result.ok).toBe(true);
            expect(mockDb.config.folderAliases['/games/rpg']).toBe('A'.repeat(255));
            expect(mockDb.config.folderAliases['/games/rpg'].length).toBe(255);
        });

        it('deletes alias key when alias is empty string or only whitespace', async () => {
            mockDb.config.folderAliases = {
                '/games/rpg': 'Pre-existing'
            };

            const result = await setFolderAlias(mockContext, '/games/rpg', '   ', 'linux');
            expect(result.ok).toBe(true);
            expect(mockDb.config.folderAliases['/games/rpg']).toBeUndefined();
        });

        it('coerces non-string alias to empty string and prunes key', async () => {
            mockDb.config.folderAliases = {
                '/games/rpg': 'Pre-existing'
            };

            const result = await setFolderAlias(mockContext, '/games/rpg', null as any, 'linux');
            expect(result.ok).toBe(true);
            expect(mockDb.config.folderAliases['/games/rpg']).toBeUndefined();
        });
    });

    describe('Snapshot-and-Rollback Contract', () => {
        it('restores in-memory folderAliases on persistence failure and logs error', async () => {
            mockDb.config.folderAliases = {
                '/games/existing': 'Existing'
            };

            const diskError = new Error('Disk I/O failure');
            mockContext.saveDB.mockRejectedValueOnce(diskError);
            mockContext.persistDbDirectly.mockRejectedValueOnce(diskError);

            const result = await setFolderAlias(mockContext, '/games/new', 'New Game', 'linux');

            expect(result).toEqual({ ok: false, error: 'Disk I/O failure' });
            expect(errorSpy).toHaveBeenCalledWith(
                '[LIBRARY_STATE][SET_FOLDER_ALIAS] Failed to persist folder alias:',
                expect.objectContaining({
                    folderPath: '/games/new',
                    alias: 'New Game',
                    error: diskError
                })
            );
            // Snapshot restored
            expect(mockDb.config.folderAliases).toEqual({
                '/games/existing': 'Existing'
            });
        });
    });

    describe('createLibraryState Facade Integration', () => {
        it('forwards setFolderAlias through libraryState facade and serializedQueue', async () => {
            const state = createLibraryState({
                categoryState: null,
                defaultGamesDir: '/games',
                dialog: null,
                fs: null,
                fsSync: null,
                dbFilePath: '',
                loadDB: vi.fn(async () => mockDb),
                saveDB: vi.fn(async (db: any) => {
                    mockDb = db;
                })
            });

            const result = await state.setFolderAlias('/games/facade-game', 'Facade Title');
            expect(result.ok).toBe(true);
            expect(mockDb.config.folderAliases['/games/facade-game']).toBe('Facade Title');
        });
    });
});
