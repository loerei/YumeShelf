/// <reference types="node" />
// @ts-ignore
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadGamesForConfig } from './loader';
import { YumeEngine } from '@yumeshelf/engine';

function makeConfig(libraryPaths: string[], libraryPath = libraryPaths[0] || ''): any {
    return {
        libraryPaths,
        libraryPath,
        maxDepth: 5,
        autoLaunch: false,
        minimizeToTray: false,
        folderAliases: {},
        titleDisplayMode: 'metadata',
        displayProductCodes: false
    };
}

function createVirtualFs(files: Record<string, { isDir?: boolean; content?: string; mtimeMs?: number; birthtimeMs?: number }>) {
    const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '');

    const normalizedMap = new Map<string, { isDir?: boolean; content?: string; mtimeMs?: number; birthtimeMs?: number }>();
    for (const [k, v] of Object.entries(files)) {
        normalizedMap.set(norm(k), v);
    }

    const exists = (p: string) => {
        const np = norm(p);
        if (normalizedMap.has(np)) return true;
        for (const k of normalizedMap.keys()) {
            if (k.startsWith(np + '/')) return true;
        }
        return false;
    };

    const getEntry = (p: string) => {
        const np = norm(p);
        if (normalizedMap.has(np)) return normalizedMap.get(np)!;
        if (exists(np)) return { isDir: true, mtimeMs: 1000, birthtimeMs: 1000 };
        return null;
    };

    const fs: any = {
        stat: vi.fn(async (p: string) => {
            const entry = getEntry(p);
            if (!entry) {
                const err: any = new Error(`ENOENT: no such file or directory, stat '${p}'`);
                err.code = 'ENOENT';
                throw err;
            }
            return {
                isFile: () => !entry.isDir,
                isDirectory: () => !!entry.isDir,
                mtimeMs: entry.mtimeMs || 1000,
                birthtimeMs: entry.birthtimeMs || 1000,
                size: entry.content ? entry.content.length : 0
            };
        }),
        readdir: vi.fn(async (dir: string, opts?: any) => {
            const ndir = norm(dir);
            const prefix = ndir ? ndir + '/' : '';
            const names = new Set<string>();
            const dirents: any[] = [];

            for (const [k, v] of normalizedMap.entries()) {
                if (k.startsWith(prefix) && k !== ndir) {
                    const rest = k.slice(prefix.length);
                    const seg = rest.split('/')[0];
                    if (!names.has(seg)) {
                        names.add(seg);
                        const isDir = rest.includes('/') || !!v.isDir;
                        dirents.push({
                            name: seg,
                            isFile: () => !isDir,
                            isDirectory: () => isDir
                        });
                    }
                }
            }
            if (opts?.withFileTypes) return dirents;
            return Array.from(names);
        }),
        readFile: vi.fn(async (p: string) => {
            const entry = getEntry(p);
            if (!entry || entry.isDir) {
                const err: any = new Error(`ENOENT: no such file or directory, open '${p}'`);
                err.code = 'ENOENT';
                throw err;
            }
            return Buffer.from(entry.content || '');
        }),
        exists: vi.fn(async (p: string) => exists(p))
    };

    const fsSync: any = {
        existsSync: vi.fn((p: string) => exists(p)),
        statSync: vi.fn((p: string, opts?: any) => {
            const entry = getEntry(p);
            if (!entry) {
                if (opts?.throwIfNoEntry === false) return undefined;
                const err: any = new Error(`ENOENT: no such file or directory, stat '${p}'`);
                err.code = 'ENOENT';
                throw err;
            }
            return {
                isFile: () => !entry.isDir,
                isDirectory: () => !!entry.isDir,
                mtimeMs: entry.mtimeMs || 1000,
                birthtimeMs: entry.birthtimeMs || 1000,
                size: entry.content ? entry.content.length : 0
            };
        })
    };

    return { fs, fsSync };
}

describe('loader.ts - Canonical Loader Subsumption Reconciliation & Continuity (Ticket 01.4.3.2)', () => {
    let warnSpy: any;
    let infoSpy: any;
    let errorSpy: any;

    beforeEach(() => {
        warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
        errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        warnSpy.mockRestore();
        infoSpy.mockRestore();
        errorSpy.mockRestore();
        vi.restoreAllMocks();
    });

    // 1. Verifies owningLibPath and gameKey derivation resolves to topmost ancestor root via subsumeLibraryPaths
    it('1. resolves owningLibPath and gameKey to topmost ancestor root via subsumeLibraryPaths', async () => {
        const { fs, fsSync } = createVirtualFs({
            'D:/Games': { isDir: true },
            'D:/Games/Nested': { isDir: true },
            'D:/Games/Nested/GameOne': { isDir: true },
            'D:/Games/Nested/GameOne/Game.exe': { isDir: false, content: 'exe' }
        });

        let savedDb: any = null;
        const context = {
            fs,
            fsSync,
            targetPlatform: 'win32',
            loadDB: vi.fn(async () => ({ schemaVersion: 1, config: { libraryPaths: ['D:/Games', 'D:/Games/Nested'] }, games: {} })),
            saveDB: vi.fn(async (db: any) => { savedDb = db; }),
            categoryState: { loadCategoryState: async () => ({ assignments: {} }) }
        };

        const result = await loadGamesForConfig(context, makeConfig(['D:/Games', 'D:/Games/Nested']), 'win32');

        expect(result.length).toBe(1);
        expect(result[0].gameKey).toBe('Nested/GameOne');
        expect(result[0].relativePath).toBe('Nested/GameOne');
        expect(savedDb.games['Nested/GameOne']).toBeDefined();
    });

    // 2. Verifies stored manual game records (record.manual === true) are retained during library scans when executable and folder exist on disk
    it('2. retains stored manual game records when executable and folder exist on physical disk', async () => {
        const { fs, fsSync } = createVirtualFs({
            'D:/Games': { isDir: true },
            'D:/Games/CustomManual': { isDir: true },
            'D:/Games/CustomManual/launcher.bin': { isDir: false, content: 'bin' }
        });

        let savedDb: any = null;
        const initialDb = {
            schemaVersion: 1,
            config: { libraryPaths: ['D:/Games'] },
            games: {
                'CustomManual': {
                    manual: true,
                    folderPath: 'D:/Games/CustomManual',
                    exePath: 'D:/Games/CustomManual/launcher.bin',
                    name: 'Custom Manual Title',
                    engine: 'CustomEngine',
                    platform: 'windows'
                }
            }
        };

        const context = {
            fs,
            fsSync,
            targetPlatform: 'win32',
            loadDB: vi.fn(async () => JSON.parse(JSON.stringify(initialDb))),
            saveDB: vi.fn(async (db: any) => { savedDb = db; }),
            categoryState: { loadCategoryState: async () => ({ assignments: {} }) }
        };

        const result = await loadGamesForConfig(context, makeConfig(['D:/Games']), 'win32');

        expect(result.length).toBe(1);
        expect(result[0].manual).toBe(true);
        expect(result[0].gameKey).toBe('CustomManual');
        expect(result[0].exePath).toBe('D:/Games/CustomManual/launcher.bin');
        expect(savedDb.games['CustomManual'].manual).toBe(true);
    });

    // 3. Verifies deduplication of manual game records via O(N + M) set lookups
    it('3. deduplicates manual game records against freshly scanned games and duplicate entries', async () => {
        const { fs, fsSync } = createVirtualFs({
            'D:/Games': { isDir: true },
            'D:/Games/GameA': { isDir: true },
            'D:/Games/GameA/Game.exe': { isDir: false, content: 'exe' }
        });

        let savedDb: any = null;
        const initialDb = {
            schemaVersion: 1,
            config: { libraryPaths: ['D:/Games'] },
            games: {
                'GameA': {
                    manual: true,
                    folderPath: 'D:/Games/GameA',
                    exePath: 'D:/Games/GameA/Game.exe',
                    name: 'Manual Game A'
                },
                'OldGameA': {
                    manual: true,
                    folderPath: 'D:/Games/GameA',
                    exePath: 'D:/Games/GameA/Game.exe',
                    name: 'Duplicate Folder Manual'
                }
            }
        };

        const context = {
            fs,
            fsSync,
            targetPlatform: 'win32',
            loadDB: vi.fn(async () => JSON.parse(JSON.stringify(initialDb))),
            saveDB: vi.fn(async (db: any) => { savedDb = db; }),
            categoryState: { loadCategoryState: async () => ({ assignments: {} }) }
        };

        const result = await loadGamesForConfig(context, makeConfig(['D:/Games']), 'win32');

        expect(result.length).toBe(1);
        expect(result[0].gameKey).toBe('GameA');
        expect(Object.keys(savedDb.games).length).toBe(1);
    });

    // 4. Verifies manual game records residing on inactive library paths (inactivePaths) are unconditionally preserved without disk checks
    it('4. preserves records on inactive library paths unconditionally without physical disk checks', async () => {
        const { fs, fsSync } = createVirtualFs({
            'D:/Active': { isDir: true },
            'D:/Active/ActiveGame': { isDir: true },
            'D:/Active/ActiveGame/Game.exe': { isDir: false, content: 'exe' }
            // 'E:/Offline' is NOT present in virtual filesystem
        });

        let savedDb: any = null;
        const initialDb = {
            schemaVersion: 1,
            config: { libraryPaths: ['D:/Active', 'E:/Offline'] },
            games: {
                'ActiveGame': {
                    folderPath: 'D:/Active/ActiveGame',
                    exePath: 'D:/Active/ActiveGame/Game.exe',
                    name: 'Active Game'
                },
                'OfflineGameKey': {
                    manual: true,
                    folderPath: 'E:/Offline/OfflineGame',
                    exePath: 'E:/Offline/OfflineGame/Launcher.exe',
                    name: 'Offline Preserved Game'
                }
            }
        };

        const context = {
            fs,
            fsSync,
            targetPlatform: 'win32',
            loadDB: vi.fn(async () => JSON.parse(JSON.stringify(initialDb))),
            saveDB: vi.fn(async (db: any) => { savedDb = db; }),
            categoryState: { loadCategoryState: async () => ({ assignments: {} }) }
        };

        const result = await loadGamesForConfig(context, makeConfig(['D:/Active', 'E:/Offline'], 'D:/Active'), 'win32');

        expect(result.length).toBe(2);
        expect(savedDb.games['OfflineGameKey']).toBeDefined();
        expect(savedDb.games['OfflineGameKey'].name).toBe('Offline Preserved Game');
    });

    // 5. Verifies manual game records whose paths no longer exist on active mounted library roots are purged
    it('5. purges active-path manual games when missing from physical disk', async () => {
        const { fs, fsSync } = createVirtualFs({
            'D:/Games': { isDir: true }
            // CustomManual folder is missing from disk
        });

        let savedDb: any = null;
        const initialDb = {
            schemaVersion: 1,
            config: { libraryPaths: ['D:/Games'] },
            games: {
                'DeletedGame': {
                    manual: true,
                    folderPath: 'D:/Games/DeletedGame',
                    exePath: 'D:/Games/DeletedGame/Game.exe',
                    name: 'Deleted Game'
                }
            }
        };

        const context = {
            fs,
            fsSync,
            targetPlatform: 'win32',
            loadDB: vi.fn(async () => JSON.parse(JSON.stringify(initialDb))),
            saveDB: vi.fn(async (db: any) => { savedDb = db; }),
            categoryState: { loadCategoryState: async () => ({ assignments: {} }) }
        };

        const result = await loadGamesForConfig(context, makeConfig(['D:/Games']), 'win32');

        expect(result.length).toBe(0);
        expect(savedDb.games['DeletedGame']).toBeUndefined();
        expect(infoSpy).toHaveBeenCalledWith(
            expect.stringContaining('[LOADER][MANUAL_PURGE]'),
            expect.objectContaining({ reason: 'missing-from-disk' })
        );
    });

    // 6. Verifies manual game records whose parent library path has been removed from config.libraryPaths are purged
    it('6. purges manual games whose parent library path has been removed from authoritative libraryPaths', async () => {
        const { fs, fsSync } = createVirtualFs({
            'D:/Active': { isDir: true },
            'D:/RemovedRoot/OldManual': { isDir: true },
            'D:/RemovedRoot/OldManual/Game.exe': { isDir: false, content: 'exe' }
        });

        let savedDb: any = null;
        const initialDb = {
            schemaVersion: 1,
            config: { libraryPaths: ['D:/Active'] }, // D:/RemovedRoot was removed!
            games: {
                'OldManual': {
                    manual: true,
                    folderPath: 'D:/RemovedRoot/OldManual',
                    exePath: 'D:/RemovedRoot/OldManual/Game.exe',
                    name: 'Orphan Manual'
                }
            }
        };

        const context = {
            fs,
            fsSync,
            targetPlatform: 'win32',
            loadDB: vi.fn(async () => JSON.parse(JSON.stringify(initialDb))),
            saveDB: vi.fn(async (db: any) => { savedDb = db; }),
            categoryState: { loadCategoryState: async () => ({ assignments: {} }) }
        };

        const result = await loadGamesForConfig(context, makeConfig(['D:/Active']), 'win32');

        expect(result.length).toBe(0);
        expect(savedDb.games['OldManual']).toBeUndefined();
        expect(infoSpy).toHaveBeenCalledWith(
            expect.stringContaining('[LOADER][MANUAL_PURGE]'),
            expect.objectContaining({ reason: 'outside-library-roots' })
        );
    });

    // 7. Verifies user-selected manual game exePath and engine are preserved during rescan overlays when binary exists on disk
    it('7. preserves user-selected manual exePath, engine, and platform during rescan overlays', async () => {
        const { fs, fsSync } = createVirtualFs({
            'D:/Games': { isDir: true },
            'D:/Games/Game1': { isDir: true },
            'D:/Games/Game1/default.exe': { isDir: false, content: 'default' },
            'D:/Games/Game1/custom_launcher.exe': { isDir: false, content: 'custom' }
        });

        let savedDb: any = null;
        const initialDb = {
            schemaVersion: 1,
            config: { libraryPaths: ['D:/Games'] },
            games: {
                'Game1': {
                    manual: true,
                    folderPath: 'D:/Games/Game1',
                    exePath: 'D:/Games/Game1/custom_launcher.exe',
                    engine: 'CustomEngine',
                    platform: 'windows',
                    favorite: true
                }
            }
        };

        const context = {
            fs,
            fsSync,
            targetPlatform: 'win32',
            loadDB: vi.fn(async () => JSON.parse(JSON.stringify(initialDb))),
            saveDB: vi.fn(async (db: any) => { savedDb = db; }),
            categoryState: { loadCategoryState: async () => ({ assignments: {} }) }
        };

        const result = await loadGamesForConfig(context, makeConfig(['D:/Games']), 'win32');

        expect(result.length).toBe(1);
        expect(result[0].manual).toBe(true);
        expect(result[0].exePath).toBe('D:/Games/Game1/custom_launcher.exe');
        expect(result[0].engine).toBe('CustomEngine');
        expect(result[0].favorite).toBe(true);
    });

    // 8. Verifies cross-platform inactive path evaluation using isSubsumedBy and full resolvedPlatform propagation
    it('8. propagates resolvedPlatform symmetrically across loader and continuity helpers', async () => {
        const { fs, fsSync } = createVirtualFs({
            '/mnt/games': { isDir: true },
            '/mnt/games/linux_game': { isDir: true },
            '/mnt/games/linux_game/game.x86_64': { isDir: false, content: 'elf' }
        });

        let savedDb: any = null;
        const initialDb = {
            schemaVersion: 1,
            config: { libraryPaths: ['/mnt/games', '/mnt/offline'] },
            games: {
                'offline_key': {
                    folderPath: '/mnt/offline/sub/game',
                    exePath: '/mnt/offline/sub/game/start.sh',
                    name: 'Offline Linux'
                }
            }
        };

        const context = {
            fs,
            fsSync,
            targetPlatform: 'linux',
            loadDB: vi.fn(async () => JSON.parse(JSON.stringify(initialDb))),
            saveDB: vi.fn(async (db: any) => { savedDb = db; }),
            categoryState: { loadCategoryState: async () => ({ assignments: {} }) }
        };

        const result = await loadGamesForConfig(context, makeConfig(['/mnt/games', '/mnt/offline'], '/mnt/games'), 'linux');

        expect(result.length).toBe(2);
        expect(savedDb.games['offline_key']).toBeDefined();
        expect(savedDb.games['linux_game']).toBeDefined();
    });

    // 9. Verifies regular scanned games reconcile cleanly alongside preserved manual games
    it('9. reconciles regular scanned games and preserved manual games in the same scan', async () => {
        const { fs, fsSync } = createVirtualFs({
            'D:/Games': { isDir: true },
            'D:/Games/ScannedGame': { isDir: true },
            'D:/Games/ScannedGame/Game.exe': { isDir: false, content: 'exe' },
            'D:/Games/ManualGame': { isDir: true },
            'D:/Games/ManualGame/binary.bin': { isDir: false, content: 'bin' }
        });

        let savedDb: any = null;
        const initialDb = {
            schemaVersion: 1,
            config: { libraryPaths: ['D:/Games'] },
            games: {
                'ManualGame': {
                    manual: true,
                    folderPath: 'D:/Games/ManualGame',
                    exePath: 'D:/Games/ManualGame/binary.bin',
                    name: 'Manual Game'
                }
            }
        };

        const context = {
            fs,
            fsSync,
            targetPlatform: 'win32',
            loadDB: vi.fn(async () => JSON.parse(JSON.stringify(initialDb))),
            saveDB: vi.fn(async (db: any) => { savedDb = db; }),
            categoryState: { loadCategoryState: async () => ({ assignments: {} }) }
        };

        const result = await loadGamesForConfig(context, makeConfig(['D:/Games']), 'win32');

        expect(result.length).toBe(2);
        const keys = result.map((g: any) => g.gameKey).sort();
        expect(keys).toEqual(['ManualGame', 'ScannedGame']);
    });

    // 10. Verifies persistPhase respects latestDb.config.libraryPaths preventing path resurrection
    it('10. respects latestDb.config.libraryPaths preventing resurrection of concurrently deleted paths', async () => {
        const { fs, fsSync } = createVirtualFs({
            'D:/Games': { isDir: true },
            'D:/Games/Game1': { isDir: true },
            'D:/Games/Game1/Game.exe': { isDir: false, content: 'exe' },
            'D:/ConcurrentlyRemoved': { isDir: true },
            'D:/ConcurrentlyRemoved/StaleGame': { isDir: true },
            'D:/ConcurrentlyRemoved/StaleGame/Game.exe': { isDir: false, content: 'exe' }
        });

        let savedDb: any = null;
        // In loadDB call inside persistPhase, the config has had D:/ConcurrentlyRemoved removed!
        let loadCount = 0;
        const context = {
            fs,
            fsSync,
            targetPlatform: 'win32',
            loadDB: vi.fn(async () => {
                loadCount++;
                if (loadCount === 1) {
                    return {
                        schemaVersion: 1,
                        config: { libraryPaths: ['D:/Games', 'D:/ConcurrentlyRemoved'] },
                        games: {}
                    };
                }
                // Concurrently updated DB under lock
                return {
                    schemaVersion: 1,
                    config: { libraryPaths: ['D:/Games'] },
                    games: {}
                };
            }),
            saveDB: vi.fn(async (db: any) => { savedDb = db; }),
            categoryState: { loadCategoryState: async () => ({ assignments: {} }) }
        };

        const result = await loadGamesForConfig(context, makeConfig(['D:/Games', 'D:/ConcurrentlyRemoved']), 'win32');

        expect(savedDb.config.libraryPaths).toEqual(['D:/Games']);
        expect(savedDb.games['StaleGame']).toBeUndefined();
        expect(result.length).toBe(1);
        expect(result[0].gameKey).toBe('Game1');
    });

    // 11. Verifies single atomic persistence of games.json in persistPhase with zero runtime sniffing
    it('11. performs a single atomic persistence call in persistPhase without legacy envelope mutations', async () => {
        const { fs, fsSync } = createVirtualFs({
            'D:/Games': { isDir: true },
            'D:/Games/Game1': { isDir: true },
            'D:/Games/Game1/Game.exe': { isDir: false, content: 'exe' }
        });

        const saveFn = vi.fn(async () => {});
        const context = {
            fs,
            fsSync,
            targetPlatform: 'win32',
            loadDB: vi.fn(async () => ({ schemaVersion: 1, config: { libraryPaths: ['D:/Games'] }, games: {} })),
            saveDB: saveFn,
            categoryState: { loadCategoryState: async () => ({ assignments: {} }) }
        };

        await loadGamesForConfig(context, makeConfig(['D:/Games']), 'win32');

        expect(saveFn).toHaveBeenCalledTimes(1);
        const persistedPayload = saveFn.mock.calls[0][0];
        expect(persistedPayload.schemaVersion).toBe(1);
        expect(persistedPayload.games).toBeDefined();
    });

    // 12. Verifies Stage 1 stale manual executable fallback
    it('12. falls back to scanned candidate with warning [LOADER][MANUAL_EXE_FALLBACK] when stored manual executable is missing, invalid, or directory', async () => {
        const { fs, fsSync } = createVirtualFs({
            'D:/Games': { isDir: true },
            'D:/Games/Game1': { isDir: true },
            'D:/Games/Game1/scanned.exe': { isDir: false, content: 'scanned' },
            'D:/Games/Game1/SubDir': { isDir: true } // directory, not file!
        });

        let savedDb: any = null;
        const initialDb = {
            schemaVersion: 1,
            config: { libraryPaths: ['D:/Games'] },
            games: {
                'Game1': {
                    manual: true,
                    folderPath: 'D:/Games/Game1',
                    exePath: 'D:/Games/Game1/missing.exe',
                    engine: 'OldEngine',
                    platform: 'linux',
                    favorite: true,
                    playtime: 1500
                }
            }
        };

        const context = {
            fs,
            fsSync,
            targetPlatform: 'win32',
            loadDB: vi.fn(async () => JSON.parse(JSON.stringify(initialDb))),
            saveDB: vi.fn(async (db: any) => { savedDb = db; }),
            categoryState: { loadCategoryState: async () => ({ assignments: {} }) }
        };

        const result = await loadGamesForConfig(context, makeConfig(['D:/Games']), 'win32');

        expect(result.length).toBe(1);
        expect(result[0].exePath.replace(/\\/g, '/')).toBe('D:/Games/Game1/scanned.exe');
        expect(result[0].manual).toBe(false);
        expect(result[0].favorite).toBe(true);
        expect(result[0].playtime).toBe(1500);

        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('[LOADER][MANUAL_EXE_FALLBACK]'),
            expect.objectContaining({
                gameKey: 'Game1',
                missingExe: 'D:/Games/Game1/missing.exe',
                fallbackExe: expect.stringMatching(/[\\/]scanned\.exe$/)
            })
        );
    });

    // 13. Verifies Stage 2 inactive sweeps prototype pollution defense, string validation, and collision defense
    it('13. guards Stage 2 inactive sweep against prototype pollution, malformed keys, and collisions', async () => {
        const { fs, fsSync } = createVirtualFs({
            'D:/Active': { isDir: true },
            'D:/Active/Game1': { isDir: true },
            'D:/Active/Game1/Game.exe': { isDir: false, content: 'exe' }
        });

        let savedDb: any = null;
        const initialDb = {
            schemaVersion: 1,
            config: { libraryPaths: ['D:/Active', 'E:/Offline'] },
            games: {
                '__proto__': { folderPath: 'E:/Offline/Pollution' },
                'constructor': { folderPath: 'E:/Offline/Constructor' },
                'bad1': { folderPath: '   ' },
                'bad2': { folderPath: null },
                'Game1': { folderPath: 'E:/Offline/CollidingGame' }, // collides with Stage 1 Game1
                'ValidOffline': { folderPath: 'E:/Offline/ValidGame', name: 'Valid Offline' }
            }
        };

        const context = {
            fs,
            fsSync,
            targetPlatform: 'win32',
            loadDB: vi.fn(async () => JSON.parse(JSON.stringify(initialDb))),
            saveDB: vi.fn(async (db: any) => { savedDb = db; }),
            categoryState: { loadCategoryState: async () => ({ assignments: {} }) }
        };

        const result = await loadGamesForConfig(context, makeConfig(['D:/Active', 'E:/Offline'], 'D:/Active'), 'win32');

        expect(savedDb.games['ValidOffline']).toBeDefined();
        // Collision defense: Game1 in nextGames is the scanned game under D:/Active, not E:/Offline!
        expect(savedDb.games['Game1'].folderPath.replace(/\\/g, '/')).toBe('D:/Active/Game1');
        // Unsafe keys are skipped
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('[LOADER][UNSAFE_INACTIVE_KEY]'),
            expect.anything()
        );
    });

    // 14. Verifies total-offline library roots (normalizedConfig.libraryPaths.length > 0 and activePaths.length === 0)
    it('14. preserves offline games via Stage 2 when all library paths are offline (activePaths.length === 0)', async () => {
        const { fs, fsSync } = createVirtualFs({}); // empty host fs, activePaths is []

        let savedDb: any = null;
        const initialDb = {
            schemaVersion: 1,
            config: { libraryPaths: ['E:/OfflineDrive/Games'] },
            games: {
                'OfflineGame': {
                    folderPath: 'E:/OfflineDrive/Games/GameA',
                    exePath: 'E:/OfflineDrive/Games/GameA/Game.exe',
                    name: 'Offline Game A'
                }
            }
        };

        const context = {
            fs,
            fsSync,
            targetPlatform: 'win32',
            loadDB: vi.fn(async () => JSON.parse(JSON.stringify(initialDb))),
            saveDB: vi.fn(async (db: any) => { savedDb = db; }),
            categoryState: { loadCategoryState: async () => ({ assignments: {} }) }
        };

        const result = await loadGamesForConfig(context, makeConfig(['E:/OfflineDrive/Games']), 'win32');

        expect(result.length).toBe(1);
        expect(result[0].name).toBe('Offline Game A');
        expect(savedDb.games['OfflineGame']).toBeDefined();
    });

    // 15. Verifies Stage 4 coordinate validation ordering: corrupt manual game records emit [LOADER][MANUAL_CORRUPT]
    it('15. verifies Stage 4 coordinate validation precedes deduplication and root containment checks', async () => {
        const { fs, fsSync } = createVirtualFs({
            'D:/Games': { isDir: true }
        });

        let savedDb: any = null;
        const initialDb = {
            schemaVersion: 1,
            config: { libraryPaths: ['D:/Games'] },
            games: {
                'CorruptManual1': {
                    manual: true,
                    folderPath: '',
                    exePath: 'D:/Games/Game/Game.exe'
                },
                'CorruptManual2': {
                    manual: true,
                    folderPath: 'D:/Games/Game',
                    exePath: ''
                },
                'CorruptManual3': {
                    manual: true,
                    folderPath: 'D:/Games/\0nullbyte',
                    exePath: 'D:/Games/Game/Game.exe'
                }
            }
        };

        const context = {
            fs,
            fsSync,
            targetPlatform: 'win32',
            loadDB: vi.fn(async () => JSON.parse(JSON.stringify(initialDb))),
            saveDB: vi.fn(async (db: any) => { savedDb = db; }),
            categoryState: { loadCategoryState: async () => ({ assignments: {} }) }
        };

        await loadGamesForConfig(context, makeConfig(['D:/Games']), 'win32');

        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('[LOADER][MANUAL_CORRUPT]'),
            expect.objectContaining({ gameKey: 'CorruptManual1' })
        );
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('[LOADER][MANUAL_CORRUPT]'),
            expect.objectContaining({ gameKey: 'CorruptManual2' })
        );
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('[LOADER][MANUAL_CORRUPT]'),
            expect.objectContaining({ gameKey: 'CorruptManual3' })
        );
        // Did not reach MANUAL_PURGE
        expect(infoSpy).not.toHaveBeenCalledWith(
            expect.stringContaining('[LOADER][MANUAL_PURGE]'),
            expect.objectContaining({ gameKey: 'CorruptManual1' })
        );
    });

    // 16. Verifies Stage 1 user-renamed title preservation
    it('16. preserves customName and curated title across rescans', async () => {
        const { fs, fsSync } = createVirtualFs({
            'D:/Games': { isDir: true },
            'D:/Games/GameFolder': { isDir: true },
            'D:/Games/GameFolder/Game.exe': { isDir: false, content: 'exe' }
        });

        let savedDb: any = null;
        const initialDb = {
            schemaVersion: 1,
            config: { libraryPaths: ['D:/Games'] },
            games: {
                'GameFolder': {
                    name: 'My Curated Title',
                    customName: true
                }
            }
        };

        const context = {
            fs,
            fsSync,
            targetPlatform: 'win32',
            loadDB: vi.fn(async () => JSON.parse(JSON.stringify(initialDb))),
            saveDB: vi.fn(async (db: any) => { savedDb = db; }),
            categoryState: { loadCategoryState: async () => ({ assignments: {} }) }
        };

        const result = await loadGamesForConfig(context, makeConfig(['D:/Games']), 'win32');

        expect(result.length).toBe(1);
        expect(result[0].name).toBe('My Curated Title');
        expect(result[0].customName).toBe(true);
        expect(savedDb.games['GameFolder'].name).toBe('My Curated Title');
        expect(savedDb.games['GameFolder'].customName).toBe(true);
    });

    // 17. Verifies context.isDegraded?.() === true in loadGamesForConfig
    it('17. bypasses filesystem candidate scanning and persistence when database is degraded at entry', async () => {
        const { fs, fsSync } = createVirtualFs({
            'D:/Games': { isDir: true },
            'D:/Games/GameFolder': { isDir: true },
            'D:/Games/GameFolder/Game.exe': { isDir: false, content: 'exe' }
        });

        const initialDb = {
            schemaVersion: 1,
            config: { libraryPaths: ['D:/Games'] },
            games: {
                'DegradedCachedGame': {
                    folderPath: 'D:/Games/DegradedCachedGame',
                    name: 'Degraded Cached Game'
                }
            }
        };

        const saveFn = vi.fn(async () => {});
        const context = {
            fs,
            fsSync,
            targetPlatform: 'win32',
            isDegraded: () => true,
            loadDB: vi.fn(async () => JSON.parse(JSON.stringify(initialDb))),
            saveDB: saveFn,
            categoryState: { loadCategoryState: vi.fn(async () => ({ assignments: {} })) }
        };

        const result = await loadGamesForConfig(context, makeConfig(['D:/Games']), 'win32');

        expect(result.length).toBe(1);
        expect(result[0].gameKey).toBe('DegradedCachedGame');
        expect(saveFn).not.toHaveBeenCalled();
        expect(fs.readdir).not.toHaveBeenCalled();
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('[LOADER] Library database is in DEGRADED state, skipping scan and persistence:'),
            expect.objectContaining({ isDegraded: true })
        );
    });

    // 18. Verifies context.isDegraded?.() === true in persistPhase
    it('18. executes Stages 1-4 but aborts persistence when database enters degraded state prior to persistence', async () => {
        const { fs, fsSync } = createVirtualFs({
            'D:/Games': { isDir: true },
            'D:/Games/Game1': { isDir: true },
            'D:/Games/Game1/Game.exe': { isDir: false, content: 'exe' }
        });

        let degraded = false;
        const saveFn = vi.fn(async () => {});
        let loadCount = 0;
        const context = {
            fs,
            fsSync,
            targetPlatform: 'win32',
            isDegraded: () => degraded,
            loadDB: vi.fn(async () => {
                loadCount++;
                if (loadCount === 2) {
                    degraded = true; // trips degraded state right before persistence
                }
                return {
                    schemaVersion: 1,
                    config: { libraryPaths: ['D:/Games'] },
                    games: {}
                };
            }),
            persistDbDirectly: saveFn,
            categoryState: { loadCategoryState: async () => ({ assignments: {} }) }
        };

        const result = await loadGamesForConfig(context, makeConfig(['D:/Games']), 'win32');

        expect(result.length).toBe(1);
        expect(result[0].gameKey).toBe('Game1');
        expect(saveFn).not.toHaveBeenCalled();
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('[LOADER] Persistence aborted: database is in DEGRADED state.'),
            expect.objectContaining({ isDegraded: true })
        );
    });

    // 19. Verifies in-memory virtual filesystem provider adaptFileSystem(fs) is threaded into YumeEngine
    it('19. threads adaptFileSystem into YumeEngine executable inspection and directory size calculation', async () => {
        const { fs, fsSync } = createVirtualFs({
            'D:/Games': { isDir: true },
            'D:/Games/Game1': { isDir: true },
            'D:/Games/Game1/Game.exe': { isDir: false, content: 'exe' }
        });

        const inspectSpy = vi.spyOn(YumeEngine, 'inspectExecutable').mockResolvedValue({
            engine: 'RPGMaker',
            architecture: 'x64'
        } as any);

        const sizeSpy = vi.spyOn(YumeEngine, 'calculateDirectorySize').mockResolvedValue({
            sizeBytes: 12345,
            mtimeMs: 2000
        });

        const context = {
            fs,
            fsSync,
            targetPlatform: 'win32',
            loadDB: vi.fn(async () => ({ schemaVersion: 1, config: { libraryPaths: ['D:/Games'] }, games: {} })),
            saveDB: vi.fn(async () => {}),
            categoryState: { loadCategoryState: async () => ({ assignments: {} }) }
        };

        await loadGamesForConfig(context, makeConfig(['D:/Games']), 'win32');

        expect(inspectSpy).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({ stat: expect.any(Function), readdir: expect.any(Function) })
        );
        expect(sizeSpy).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({ stat: expect.any(Function), readdir: expect.any(Function) })
        );
    });

    // Additional coverage: Snapshot-and-Rollback contract
    it('enforces Snapshot-and-Rollback contract restoring latestDb.games and latestDb.config upon persistence rejection', async () => {
        const { fs, fsSync } = createVirtualFs({
            'D:/Games': { isDir: true },
            'D:/Games/Game1': { isDir: true },
            'D:/Games/Game1/Game.exe': { isDir: false, content: 'exe' }
        });

        const originalGames = { 'Old': { name: 'Old' } };
        const originalConfig = { libraryPaths: ['D:/Games'], libraryPath: 'D:/Games' };
        const dbInstance = {
            schemaVersion: 1,
            config: originalConfig,
            games: originalGames
        };

        const context = {
            fs,
            fsSync,
            targetPlatform: 'win32',
            dbFilePath: 'D:/games.json',
            loadDB: vi.fn(async () => dbInstance),
            persistDbDirectly: vi.fn(async () => {
                throw new Error('EACCES: permission denied, write');
            }),
            categoryState: { loadCategoryState: async () => ({ assignments: {} }) }
        };

        await expect(loadGamesForConfig(context, makeConfig(['D:/Games']), 'win32')).rejects.toThrow('EACCES');

        expect(dbInstance.games).toBe(originalGames);
        expect(dbInstance.config).toBe(originalConfig);
        expect(errorSpy).toHaveBeenCalledWith(
            expect.stringContaining('[LOADER][PERSIST_FAIL]'),
            expect.objectContaining({ dbFilePath: 'D:/games.json' })
        );
    });

    // Additional coverage: Darwin .app bundle directory rejection
    it('rejects .app bundle directories as exePath on Darwin in both Stage 1 and Stage 4', async () => {
        const { fs, fsSync } = createVirtualFs({
            '/Applications/Games': { isDir: true },
            '/Applications/Games/Game1': { isDir: true },
            '/Applications/Games/Game1/Game.app': { isDir: true }, // directory!
            '/Applications/Games/Game1/fallback.sh': { isDir: false, content: 'sh' }
        });

        const initialDb = {
            schemaVersion: 1,
            config: { libraryPaths: ['/Applications/Games'] },
            games: {
                'Game1': {
                    manual: true,
                    folderPath: '/Applications/Games/Game1',
                    exePath: '/Applications/Games/Game1/Game.app', // directory!
                    name: 'Directory Exe Game'
                },
                'ManualDirectoryGame': {
                    manual: true,
                    folderPath: '/Applications/Games/Game1',
                    exePath: '/Applications/Games/Game1/Game.app',
                    name: 'Directory Exe Manual'
                }
            }
        };

        let savedDb: any = null;
        const context = {
            fs,
            fsSync,
            targetPlatform: 'darwin',
            loadDB: vi.fn(async () => JSON.parse(JSON.stringify(initialDb))),
            saveDB: vi.fn(async (db: any) => { savedDb = db; }),
            categoryState: { loadCategoryState: async () => ({ assignments: {} }) }
        };

        const result = await loadGamesForConfig(context, makeConfig(['/Applications/Games']), 'darwin');

        // Stage 1 falls back to fallback.sh and reverts manual to false
        expect(result[0].manual).toBe(false);
        expect(result[0].exePath.replace(/\\/g, '/')).toBe('/Applications/Games/Game1/fallback.sh');
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('[LOADER][MANUAL_EXE_FALLBACK]'),
            expect.anything()
        );
    });

    // Additional coverage: Stage 4 folder containment purge (escaping executable)
    it('purges manual games whose executable escapes folder boundary with reason executable-escapes-folder', async () => {
        const { fs, fsSync } = createVirtualFs({
            'D:/Games': { isDir: true },
            'D:/Games/FolderA': { isDir: true },
            'C:/Other/Escaped.exe': { isDir: false, content: 'exe' }
        });

        const initialDb = {
            schemaVersion: 1,
            config: { libraryPaths: ['D:/Games'] },
            games: {
                'EscapedManual': {
                    manual: true,
                    folderPath: 'D:/Games/FolderA',
                    exePath: 'C:/Other/Escaped.exe',
                    name: 'Escaped Manual'
                }
            }
        };

        const context = {
            fs,
            fsSync,
            targetPlatform: 'win32',
            loadDB: vi.fn(async () => JSON.parse(JSON.stringify(initialDb))),
            saveDB: vi.fn(async () => {}),
            categoryState: { loadCategoryState: async () => ({ assignments: {} }) }
        };

        const result = await loadGamesForConfig(context, makeConfig(['D:/Games']), 'win32');

        expect(result.length).toBe(0);
        expect(infoSpy).toHaveBeenCalledWith(
            expect.stringContaining('[LOADER][MANUAL_PURGE]'),
            expect.objectContaining({ reason: 'executable-escapes-folder' })
        );
    });

    // Additional coverage: Stage 4 root-level executable purge
    it('purges manual games located at library root level with reason root-level-executable', async () => {
        const { fs, fsSync } = createVirtualFs({
            'D:/Games': { isDir: true },
            'D:/Games/RootGame.exe': { isDir: false, content: 'exe' }
        });

        const initialDb = {
            schemaVersion: 1,
            config: { libraryPaths: ['D:/Games'] },
            games: {
                'RootManual': {
                    manual: true,
                    folderPath: 'D:/Games',
                    exePath: 'D:/Games/RootGame.exe',
                    name: 'Root Manual'
                }
            }
        };

        const context = {
            fs,
            fsSync,
            targetPlatform: 'win32',
            loadDB: vi.fn(async () => JSON.parse(JSON.stringify(initialDb))),
            saveDB: vi.fn(async () => {}),
            categoryState: { loadCategoryState: async () => ({ assignments: {} }) }
        };

        const result = await loadGamesForConfig(context, makeConfig(['D:/Games']), 'win32');

        expect(result.length).toBe(0);
        expect(infoSpy).toHaveBeenCalledWith(
            expect.stringContaining('[LOADER][MANUAL_PURGE]'),
            expect.objectContaining({ reason: 'root-level-executable' })
        );
    });
});
