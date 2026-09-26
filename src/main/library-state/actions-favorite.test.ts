// @ts-ignore
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { toggleFavorite } from './actions';
import { createLibraryState } from './index';

describe('LibraryState Actions - toggleFavorite', () => {
    let mockDb: any;
    let mockContext: any;
    let warnSpy: any;
    let errorSpy: any;

    beforeEach(() => {
        mockDb = {
            schemaVersion: 1,
            config: { libraryPaths: ['/games'] },
            games: {
                'game-1': {
                    gameKey: 'game-1',
                    folderPath: '/games/GameOne',
                    folderName: 'GameOne',
                    exePath: '/games/GameOne/Game.exe',
                    favorite: false
                }
            }
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

    describe('Basic Toggle & Explicit Boolean Targeting', () => {
        it('toggles favorite from false to true when targetFavorite is omitted', async () => {
            mockDb.games['game-1'].favorite = false;
            const result = await toggleFavorite(mockContext, 'game-1');

            expect(result).toBe(true);
            expect(mockDb.games['game-1'].favorite).toBe(true);
            expect(mockContext.persistDbDirectly).toHaveBeenCalled();
        });

        it('falls back to saveDB when persistDbDirectly is omitted from context', async () => {
            delete mockContext.persistDbDirectly;
            mockDb.games['game-1'].favorite = false;
            const result = await toggleFavorite(mockContext, 'game-1');

            expect(result).toBe(true);
            expect(mockDb.games['game-1'].favorite).toBe(true);
            expect(mockContext.saveDB).toHaveBeenCalled();
        });

        it('toggles favorite from true to false when targetFavorite is omitted', async () => {
            mockDb.games['game-1'].favorite = true;
            const result = await toggleFavorite(mockContext, 'game-1');

            expect(result).toBe(false);
            expect(mockDb.games['game-1'].favorite).toBe(false);
        });

        it('explicitly sets favorite to true when targetFavorite is true (even if already true)', async () => {
            mockDb.games['game-1'].favorite = true;
            const result = await toggleFavorite(mockContext, 'game-1', true);

            expect(result).toBe(true);
            expect(mockDb.games['game-1'].favorite).toBe(true);
        });

        it('explicitly sets favorite to false when targetFavorite is false (even if already false)', async () => {
            mockDb.games['game-1'].favorite = false;
            const result = await toggleFavorite(mockContext, 'game-1', false);

            expect(result).toBe(false);
            expect(mockDb.games['game-1'].favorite).toBe(false);
        });

        it('falls back to toggle inversion when targetFavorite is non-boolean', async () => {
            mockDb.games['game-1'].favorite = false;
            const res1 = await toggleFavorite(mockContext, 'game-1', undefined);
            expect(res1).toBe(true);

            const res2 = await toggleFavorite(mockContext, 'game-1', null as any);
            expect(res2).toBe(false);

            const res3 = await toggleFavorite(mockContext, 'game-1', 'true' as any);
            expect(res3).toBe(true);
        });
    });

    describe('Logical Group Resolution & Scoped Instance Matching', () => {
        it('updates authentic storage key when toggled via logical path ID without creating phantom record', async () => {
            mockDb.games = {
                'stored-key-1': {
                    gameKey: 'stored-key-1',
                    relativePath: 'a/x.exe',
                    folderPath: '/games/a',
                    folderName: 'a', // short name (< 4 chars) yields no continuity signature, resolving to path:
                    exePath: '/games/a/x.exe',
                    favorite: false
                }
            };

            const logicalKey = 'path:a/x.exe';
            const result = await toggleFavorite(mockContext, logicalKey, true);

            expect(result).toBe(true);
            expect(mockDb.games['stored-key-1'].favorite).toBe(true);
            expect(mockDb.games[logicalKey]).toBeUndefined();
            expect(Object.keys(mockDb.games)).toEqual(['stored-key-1']);
        });

        it('updates authentic storage key when toggled via logical game signature ID without creating phantom record', async () => {
            mockDb.games = {
                'stored-key-2': {
                    gameKey: 'stored-key-2',
                    relativePath: 'GameTwo/Game.exe',
                    folderPath: '/games/GameTwo',
                    folderName: 'GameTwo',
                    exePath: '/games/GameTwo/Game.exe',
                    favorite: false
                }
            };

            const logicalKey = 'game:folder:gametwo|exe:game';
            const result = await toggleFavorite(mockContext, logicalKey, true);

            expect(result).toBe(true);
            expect(mockDb.games['stored-key-2'].favorite).toBe(true);
            expect(mockDb.games[logicalKey]).toBeUndefined();
            expect(Object.keys(mockDb.games)).toEqual(['stored-key-2']);
        });

        it('symmetrically propagates favorite across multi-instance siblings sharing continuity signature', async () => {
            mockDb.games = {
                'inst-steam': {
                    gameKey: 'inst-steam',
                    folderPath: '/lib1/RJ123456_Game',
                    folderName: 'RJ123456_Game',
                    exePath: '/lib1/RJ123456_Game/Game.exe',
                    favorite: false
                },
                'inst-dlsite': {
                    gameKey: 'inst-dlsite',
                    folderPath: '/lib2/RJ123456_Game',
                    folderName: 'RJ123456_Game',
                    exePath: '/lib2/RJ123456_Game/Game.exe',
                    favorite: false
                }
            };

            // Toggle via first instance key
            const res1 = await toggleFavorite(mockContext, 'inst-steam');
            expect(res1).toBe(true);
            expect(mockDb.games['inst-steam'].favorite).toBe(true);
            expect(mockDb.games['inst-dlsite'].favorite).toBe(true);

            // Toggle via logical continuity ID
            const res2 = await toggleFavorite(mockContext, 'game:id:RJ123456');
            expect(res2).toBe(false);
            expect(mockDb.games['inst-steam'].favorite).toBe(false);
            expect(mockDb.games['inst-dlsite'].favorite).toBe(false);
        });

        it('symmetrically propagates favorite across multi-instance path games across roots without continuity signature', async () => {
            mockDb.games = {
                'rootA/Game1': {
                    gameKey: 'rootA/Game1',
                    relativePath: 'Game1',
                    folderPath: '/rootA/Game1',
                    exePath: '/rootA/Game1/Game.exe',
                    favorite: false
                },
                'rootB/Game1': {
                    gameKey: 'rootB/Game1',
                    relativePath: 'Game1',
                    folderPath: '/rootB/Game1',
                    exePath: '/rootB/Game1/Game.exe',
                    favorite: false
                }
            };

            const res = await toggleFavorite(mockContext, 'rootA/Game1', true);
            expect(res).toBe(true);
            expect(mockDb.games['rootA/Game1'].favorite).toBe(true);
            expect(mockDb.games['rootB/Game1'].favorite).toBe(true);
        });

        it('derives currentFavorite from group aggregate (matchedKeys.some)', async () => {
            // Sibling 1 is favorite, sibling 2 is not
            mockDb.games = {
                'inst-1': {
                    gameKey: 'inst-1',
                    folderPath: '/lib1/RJ999999_A',
                    folderName: 'RJ999999_A',
                    exePath: '/lib1/RJ999999_A/app.exe',
                    favorite: true
                },
                'inst-2': {
                    gameKey: 'inst-2',
                    folderPath: '/lib2/RJ999999_B',
                    folderName: 'RJ999999_B',
                    exePath: '/lib2/RJ999999_B/app.exe',
                    favorite: false
                }
            };

            // Because inst-1 is favorite, currentFavorite is true -> toggle inverts to false
            const res = await toggleFavorite(mockContext, 'game:id:RJ999999');
            expect(res).toBe(false);
            expect(mockDb.games['inst-1'].favorite).toBe(false);
            expect(mockDb.games['inst-2'].favorite).toBe(false);
        });
    });

    describe('Degraded Database State Guards', () => {
        it('aborts at entry and throws Error if database is degraded, before loadDB', async () => {
            mockContext.isDegraded.mockReturnValue(true);

            await expect(toggleFavorite(mockContext, 'game-1')).rejects.toThrow('Database is in degraded state');
            expect(warnSpy).toHaveBeenCalledWith(
                '[LIBRARY_STATE][TOGGLE_FAVORITE] Operation aborted: database is in DEGRADED state',
                { gameKey: 'game-1' }
            );
            expect(mockContext.loadDB).not.toHaveBeenCalled();
            expect(mockDb.games['game-1'].favorite).toBe(false);
        });

        it('aborts immediately following loadDB if database is degraded, before mutating games', async () => {
            let loadDbCalled = false;
            mockContext.loadDB.mockImplementation(async () => {
                loadDbCalled = true;
                return mockDb;
            });
            mockContext.isDegraded.mockImplementation(() => loadDbCalled);

            await expect(toggleFavorite(mockContext, 'game-1')).rejects.toThrow('Database is in degraded state');
            expect(warnSpy).toHaveBeenCalledWith(
                '[LIBRARY_STATE][TOGGLE_FAVORITE] Operation aborted: database is in DEGRADED state',
                { gameKey: 'game-1' }
            );
            expect(mockDb.games['game-1'].favorite).toBe(false);
            expect(mockContext.saveDB).not.toHaveBeenCalled();
        });
    });

    describe('Input Validation & Missing Key Rejection', () => {
        it('rejects invalid or missing gameKey types', async () => {
            await expect(toggleFavorite(mockContext, '' as any)).rejects.toThrow('Game not found: ');
            await expect(toggleFavorite(mockContext, '   ' as any)).rejects.toThrow('Game not found:    ');
            await expect(toggleFavorite(mockContext, null as any)).rejects.toThrow('Game not found: null');
            await expect(toggleFavorite(mockContext, undefined as any)).rejects.toThrow('Game not found: undefined');
            await expect(toggleFavorite(mockContext, 123 as any)).rejects.toThrow('Game not found: 123');
        });

        it('throws when target gameKey is not found in database', async () => {
            await expect(toggleFavorite(mockContext, 'unknown-game')).rejects.toThrow('Game not found: unknown-game');
            await expect(toggleFavorite(mockContext, 'path:unknown/path')).rejects.toThrow('Game not found: path:unknown/path');
            await expect(toggleFavorite(mockContext, 'game:id:RJ000000')).rejects.toThrow('Game not found: game:id:RJ000000');
        });
    });

    describe('Prototype Pollution Defense', () => {
        it('rejects __proto__, constructor, and prototype as gameKey at entry', async () => {
            await expect(toggleFavorite(mockContext, '__proto__')).rejects.toThrow('Game not found: __proto__');
            await expect(toggleFavorite(mockContext, 'constructor')).rejects.toThrow('Game not found: constructor');
            await expect(toggleFavorite(mockContext, 'prototype')).rejects.toThrow('Game not found: prototype');

            expect((Object.prototype as any).favorite).toBeUndefined();
        });

        it('ignores unsafe prototype keys in sibling entries and does not pollute Object.prototype', async () => {
            mockDb.games = {
                'game-1': {
                    gameKey: 'game-1',
                    folderPath: '/games/RJ111111',
                    folderName: 'RJ111111',
                    exePath: '/games/RJ111111/Game.exe',
                    favorite: false
                },
                '__proto__': {
                    gameKey: '__proto__',
                    folderPath: '/games/RJ111111',
                    folderName: 'RJ111111',
                    exePath: '/games/RJ111111/Game.exe',
                    favorite: false
                }
            };

            await toggleFavorite(mockContext, 'game-1', true);

            expect(mockDb.games['game-1'].favorite).toBe(true);
            expect((Object.prototype as any).favorite).toBeUndefined();
        });
    });

    describe('Snapshot-and-Rollback Contract', () => {
        it('reverts in-memory favorite states upon persistence failure and re-throws error', async () => {
            mockDb.games = {
                'inst-1': {
                    gameKey: 'inst-1',
                    folderPath: '/games/RJ222222',
                    folderName: 'RJ222222',
                    exePath: '/games/RJ222222/Game.exe',
                    favorite: false
                },
                'inst-2': {
                    gameKey: 'inst-2',
                    folderPath: '/backup/RJ222222',
                    folderName: 'RJ222222',
                    exePath: '/backup/RJ222222/Game.exe',
                    favorite: false
                }
            };

            const persistError = new Error('Disk write failed');
            mockContext.saveDB.mockRejectedValueOnce(persistError);
            mockContext.persistDbDirectly.mockRejectedValueOnce(persistError);

            await expect(toggleFavorite(mockContext, 'inst-1', true)).rejects.toThrow('Disk write failed');

            expect(errorSpy).toHaveBeenCalledWith(
                '[LIBRARY_STATE][TOGGLE_FAVORITE] Failed to persist favorite toggle:',
                expect.objectContaining({
                    gameKey: 'inst-1',
                    targetFavorite: true,
                    error: persistError
                })
            );

            // In-memory records reverted to false
            expect(mockDb.games['inst-1'].favorite).toBe(false);
            expect(mockDb.games['inst-2'].favorite).toBe(false);
        });

        it('guards rollback restore loop against prototype pollution', async () => {
            mockDb.games = {
                'game-1': {
                    gameKey: 'game-1',
                    folderPath: '/games/GameOne',
                    folderName: 'GameOne',
                    exePath: '/games/GameOne/Game.exe',
                    favorite: false
                }
            };

            mockContext.saveDB.mockRejectedValueOnce(new Error('Persistence failed'));
            mockContext.persistDbDirectly.mockRejectedValueOnce(new Error('Persistence failed'));

            await expect(toggleFavorite(mockContext, 'game-1', true)).rejects.toThrow('Persistence failed');
            expect((Object.prototype as any).favorite).toBeUndefined();
        });
    });

    describe('createLibraryState integration', () => {
        it('forwards targetFavorite through libraryState facade and serializedQueue', async () => {
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

            const res = await state.toggleFavorite('game-1', true);
            expect(res).toBe(true);
            expect(mockDb.games['game-1'].favorite).toBe(true);
        });
    });
});
