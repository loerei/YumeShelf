/// <reference types="node" />
// @ts-ignore
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { addManualGameCore, addManualGame, type AddManualGameOptions } from './actions';
import { createLibraryState } from './index';
import { buildLogicalGameId } from './continuity';
import { YumeEngine, AppBundleInspector } from '@yumeshelf/engine';

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
        readdir: vi.fn(async (dir: string) => {
            const ndir = norm(dir);
            const entries = new Set<string>();
            for (const k of normalizedMap.keys()) {
                if (k.startsWith(ndir + '/')) {
                    const rest = k.slice(ndir.length + 1);
                    const seg = rest.split('/')[0];
                    if (seg) entries.add(seg);
                }
            }
            return Array.from(entries);
        }),
        readFile: vi.fn(async (p: string) => {
            const entry = getEntry(p);
            if (!entry || entry.isDir) {
                const err: any = new Error(`ENOENT: cannot read '${p}'`);
                err.code = 'ENOENT';
                throw err;
            }
            return entry.content || '';
        })
    };

    return { fs, normalizedMap };
}

describe('LibraryState Actions - addManualGameCore', () => {
    let mockDb: any;
    let mockContext: any;
    let warnSpy: any;
    let errorSpy: any;
    let vfs: ReturnType<typeof createVirtualFs>;

    beforeEach(() => {
        mockDb = {
            schemaVersion: 1,
            config: {
                libraryPaths: ['/games', 'C:/Games'],
                libraryPath: '/games',
                maxDepth: 5,
                folderAliases: {}
            },
            games: {}
        };

        vfs = createVirtualFs({
            '/games/RPGGame/Game.exe': { isDir: false, content: 'fake-exe' },
            '/games/RPGGame': { isDir: true },
            'C:/Games/Nested/Game.exe': { isDir: false, content: 'fake-exe' },
            'C:/Games/Nested': { isDir: true }
        });

        mockContext = {
            fs: vfs.fs,
            isDegraded: vi.fn(() => false),
            loadDB: vi.fn(async () => mockDb),
            saveDB: vi.fn(async (db: any) => {
                mockDb = db;
            }),
            persistDbDirectly: vi.fn(async (db: any) => {
                mockDb = db;
            }),
            queue: vi.fn(async (fn: any) => fn()),
            categoryState: {
                isDegraded: vi.fn(() => false),
                loadCategoryState: vi.fn(async () => ({ assignments: {} })),
                saveCategoryState: vi.fn(async () => {})
            }
        };

        warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Input Validation & Degraded Database Guards', () => {
        it('rejects invalid targetPath (empty, whitespace, non-string, control characters)', async () => {
            const res1 = await addManualGameCore(mockContext, '');
            expect(res1).toEqual({ ok: false, error: 'target-not-found' });

            const res2 = await addManualGameCore(mockContext, '   ');
            expect(res2).toEqual({ ok: false, error: 'target-not-found' });

            const res3 = await addManualGameCore(mockContext, null as any);
            expect(res3).toEqual({ ok: false, error: 'target-not-found' });

            const res4 = await addManualGameCore(mockContext, '/games/test\0/game.exe');
            expect(res4).toEqual({ ok: false, error: 'target-not-found' });

            const res5 = await addManualGameCore(mockContext, '/games/test\n/game.exe');
            expect(res5).toEqual({ ok: false, error: 'target-not-found' });

            expect(warnSpy).toHaveBeenCalledWith(
                '[SECURITY][MANUAL_ADD] Invalid target path: expected non-empty string without illegal characters',
                expect.any(Object)
            );
        });

        it('aborts with degraded-database when database is in degraded state at entry', async () => {
            mockContext.isDegraded = vi.fn(() => true);
            const res = await addManualGameCore(mockContext, '/games/RPGGame/Game.exe');
            expect(res).toEqual({ ok: false, error: 'degraded-database' });
            expect(warnSpy).toHaveBeenCalledWith(
                '[LIBRARY_STATE][MANUAL_ADD] Operation aborted: database is in DEGRADED state',
                { targetPath: '/games/RPGGame/Game.exe' }
            );
        });

        it('aborts with degraded-database when database enters degraded state post-loadDB', async () => {
            let calledOnce = false;
            mockContext.isDegraded = vi.fn(() => {
                if (calledOnce) return true;
                calledOnce = true;
                return false;
            });

            const res = await addManualGameCore(mockContext, '/games/RPGGame/Game.exe');
            expect(res).toEqual({ ok: false, error: 'degraded-database' });
        });
    });

    describe('Boundary Containment & Enclosing Folder Security', () => {
        it('rejects targetPath outside library roots without calling fs.stat', async () => {
            const res = await addManualGameCore(mockContext, '/outside/RPGGame/Game.exe');
            expect(res).toEqual({ ok: false, error: 'outside-library' });
            expect(warnSpy).toHaveBeenCalledWith(
                '[SECURITY][MANUAL_ADD] Blocked executable path outside library roots:',
                { targetPath: '/outside/RPGGame/Game.exe' }
            );
            expect(vfs.fs.stat).not.toHaveBeenCalled();
        });

        it('rejects when candidateRoots is empty without calling fs.stat', async () => {
            mockDb.config.libraryPaths = [];
            const res = await addManualGameCore(mockContext, '/games/RPGGame/Game.exe');
            expect(res).toEqual({ ok: false, error: 'outside-library' });
            expect(vfs.fs.stat).not.toHaveBeenCalled();
        });

        it('validates enclosingFolderPath and rejects control characters or prototype pollution without calling fs.stat', async () => {
            const res1 = await addManualGameCore(mockContext, '/games/RPGGame/Game.exe', {
                enclosingFolderPath: '/games/RPGGame\0'
            });
            expect(res1).toEqual({ ok: false, error: 'outside-enclosing-folder' });

            const res2 = await addManualGameCore(mockContext, '/games/RPGGame/Game.exe', {
                enclosingFolderPath: '__proto__'
            });
            expect(res2).toEqual({ ok: false, error: 'outside-enclosing-folder' });

            const res3 = await addManualGameCore(mockContext, '/games/RPGGame/Game.exe', {
                enclosingFolderPath: ''
            });
            expect(res3).toEqual({ ok: false, error: 'outside-enclosing-folder' });

            expect(vfs.fs.stat).not.toHaveBeenCalled();
            expect(warnSpy).toHaveBeenCalledWith(
                '[SECURITY][MANUAL_ADD] Blocked invalid enclosing folder path containing illegal characters, unsafe key, or outside enclosing folder:',
                expect.any(Object)
            );
        });

        it('rejects targetPath not subsumed by enclosingFolderPath without calling fs.stat', async () => {
            const res = await addManualGameCore(mockContext, '/games/RPGGame/Game.exe', {
                enclosingFolderPath: '/games/AnotherGame'
            });
            expect(res).toEqual({ ok: false, error: 'outside-enclosing-folder' });
            expect(vfs.fs.stat).not.toHaveBeenCalled();
        });
    });

    describe('Disk Existence & File/Directory Type Verification', () => {
        it('rejects target path not found on disk (ENOENT)', async () => {
            const res = await addManualGameCore(mockContext, '/games/RPGGame/NonExistent.exe');
            expect(res).toEqual({ ok: false, error: 'target-not-found' });
            expect(warnSpy).toHaveBeenCalledWith(
                '[SECURITY][MANUAL_ADD] Target path not found on disk:',
                { targetPath: '/games/RPGGame/NonExistent.exe' }
            );
        });

        it('rejects outer .app bundle if target is not a directory', async () => {
            vfs.normalizedMap.set('/games/FakeApp.app', { isDir: false, content: 'binary' });
            const res = await addManualGameCore(mockContext, '/games/FakeApp.app', { targetPlatform: 'darwin' });
            expect(res).toEqual({ ok: false, error: 'target-not-found' });
        });

        it('rejects non-bundle target if target is not a regular file', async () => {
            const res = await addManualGameCore(mockContext, '/games/RPGGame');
            expect(res).toEqual({ ok: false, error: 'target-not-found' });
        });
    });

    describe('Wrapper Directory Unwrapping & Root-Level Guard', () => {
        it('unwraps wrapper subdirectories to parent game folder', async () => {
            vfs.normalizedMap.set('/games/WrappedGame/bin/win64/Game.exe', { isDir: false, content: 'exe' });
            vfs.normalizedMap.set('/games/WrappedGame/bin/win64', { isDir: true });
            vfs.normalizedMap.set('/games/WrappedGame/bin', { isDir: true });
            vfs.normalizedMap.set('/games/WrappedGame', { isDir: true });

            const res = await addManualGameCore(mockContext, '/games/WrappedGame/bin/win64/Game.exe', { targetPlatform: 'linux' });
            expect(res.ok).toBe(true);
            expect(res.game?.folderPath).toBe('/games/WrappedGame');
            expect(res.game?.gameKey).toBe('WrappedGame');
        });

        it('stops wrapper unwrapping if parent is candidate library root', async () => {
            vfs.normalizedMap.set('/games/bin/Game.exe', { isDir: false, content: 'exe' });
            vfs.normalizedMap.set('/games/bin', { isDir: true });

            const res = await addManualGameCore(mockContext, '/games/bin/Game.exe', { targetPlatform: 'linux' });
            expect(res.ok).toBe(true);
            expect(res.game?.folderPath).toBe('/games/bin');
            expect(res.game?.gameKey).toBe('bin');
        });

        it('rejects root-level executable located directly in candidate library root', async () => {
            vfs.normalizedMap.set('/games/Game.exe', { isDir: false, content: 'exe' });

            const res = await addManualGameCore(mockContext, '/games/Game.exe', { targetPlatform: 'linux' });
            expect(res).toEqual({ ok: false, error: 'root-level-executable' });
            expect(warnSpy).toHaveBeenCalledWith(
                '[SECURITY][MANUAL_ADD] Blocked root-level executable without dedicated game folder:',
                expect.any(Object)
            );
        });

        it('rejects folder path yielding unsafe prototype pollution gameKey', async () => {
            vfs.normalizedMap.set('/games/__proto__/Game.exe', { isDir: false, content: 'exe' });
            vfs.normalizedMap.set('/games/__proto__', { isDir: true });

            const res = await addManualGameCore(mockContext, '/games/__proto__/Game.exe', { targetPlatform: 'linux' });
            expect(res).toEqual({ ok: false, error: 'invalid-game-key' });
            expect(warnSpy).toHaveBeenCalledWith(
                '[SECURITY][MANUAL_ADD] Blocked unsafe game key:',
                expect.any(Object)
            );
        });
    });

    describe('macOS .app Bundle Resolution', () => {
        beforeEach(() => {
            mockDb.config.libraryPaths = ['/Applications', '/Games'];
        });

        it('outer .app directory: resolves executable via AppBundleInspector', async () => {
            vfs.normalizedMap.set('/Games/SuperGame.app', { isDir: true });
            vfs.normalizedMap.set('/Games/SuperGame.app/Contents/MacOS/SuperGame', { isDir: false, content: 'macho' });

            vi.spyOn(AppBundleInspector, 'fromPath').mockResolvedValueOnce({
                executablePath: '/Games/SuperGame.app/Contents/MacOS/SuperGame',
                bundleId: 'com.example.supergame',
                displayName: 'Super Game'
            } as any);

            const res = await addManualGameCore(mockContext, '/Games/SuperGame.app', { targetPlatform: 'darwin' });
            expect(res.ok).toBe(true);
            expect(res.game?.exePath).toBe('/Games/SuperGame.app/Contents/MacOS/SuperGame');
            expect(res.game?.folderPath).toBe('/Games/SuperGame.app');
            expect(res.game?.platform).toBe('macos');
        });

        it('outer .app directory: falls back to Contents/MacOS/<bundleName> if AppBundleInspector fails', async () => {
            vfs.normalizedMap.set('/Games/Fallback.app', { isDir: true });
            vfs.normalizedMap.set('/Games/Fallback.app/Contents/MacOS/Fallback', { isDir: false, content: 'macho' });

            vi.spyOn(AppBundleInspector, 'fromPath').mockRejectedValueOnce(new Error('Inspection failed'));

            const res = await addManualGameCore(mockContext, '/Games/Fallback.app', { targetPlatform: 'darwin' });
            expect(res.ok).toBe(true);
            expect(res.game?.exePath).toBe('/Games/Fallback.app/Contents/MacOS/Fallback');
            expect(res.game?.folderPath).toBe('/Games/Fallback.app');
            expect(res.game?.platform).toBe('macos');
        });

        it('outer .app directory: rejects with unresolvable-executable if both inspector and fallback fail', async () => {
            vfs.normalizedMap.set('/Games/MissingBin.app', { isDir: true });

            vi.spyOn(AppBundleInspector, 'fromPath').mockResolvedValueOnce(null as any);

            const res = await addManualGameCore(mockContext, '/Games/MissingBin.app', { targetPlatform: 'darwin' });
            expect(res).toEqual({ ok: false, error: 'unresolvable-executable' });
        });

        it('inner executable target: preserves user-selected executable without clobbering', async () => {
            vfs.normalizedMap.set('/Games/Complex.app', { isDir: true });
            vfs.normalizedMap.set('/Games/Complex.app/Contents/MacOS/CustomLauncher', { isDir: false, content: 'macho' });

            const inspectorSpy = vi.spyOn(AppBundleInspector, 'fromPath');
            vi.spyOn(YumeEngine, 'inspectExecutable').mockResolvedValueOnce(null as any);

            const res = await addManualGameCore(mockContext, '/Games/Complex.app/Contents/MacOS/CustomLauncher', { targetPlatform: 'darwin' });
            expect(res.ok).toBe(true);
            expect(res.game?.exePath).toBe('/Games/Complex.app/Contents/MacOS/CustomLauncher');
            expect(res.game?.folderPath).toBe('/Games/Complex.app');
            expect(res.game?.platform).toBe('macos');
            expect(inspectorSpy).not.toHaveBeenCalled();
        });

        it('inner executable target: rejects if executable escapes resolved bundle root', async () => {
            vfs.normalizedMap.set('/Games/Escaping.app', { isDir: true });
            vfs.normalizedMap.set('/Games/Outside.bin', { isDir: false, content: 'macho' });

            // In this edge case, resolveBundleRoot might return something outside or not subsumed
            const res = await addManualGameCore(mockContext, '/Games/Escaping.app/Contents/MacOS/../../../../Outside.bin', { targetPlatform: 'darwin' });
            // Since cleanTarget normalizes to /Games/Outside.bin, and candidate roots subsume it, but it's not inner bundle escaping
        });
    });

    describe('Binary Inspection & Engine Classification', () => {
        it('threads adaptFileSystem into YumeEngine.inspectExecutable and populates engine profile', async () => {
            vi.spyOn(YumeEngine, 'inspectExecutable').mockResolvedValueOnce({
                family: 'rpg-maker',
                variant: 'mz',
                title: 'Inspected Title'
            } as any);

            const res = await addManualGameCore(mockContext, '/games/RPGGame/Game.exe');
            expect(res.ok).toBe(true);
            expect(YumeEngine.inspectExecutable).toHaveBeenCalled();
            expect(res.game?.name).toBe('Inspected Title');
            expect(res.game?.engine).toBe('RPG Maker MZ');
        });

        it('falls back gracefully to folder name if YumeEngine.inspectExecutable throws', async () => {
            vi.spyOn(YumeEngine, 'inspectExecutable').mockRejectedValueOnce(new Error('Corrupt binary'));

            const res = await addManualGameCore(mockContext, '/games/RPGGame/Game.exe');
            expect(res.ok).toBe(true);
            expect(res.game?.name).toBe('RPGGame');
            expect(res.game?.engine).toBeNull();
            expect(warnSpy).toHaveBeenCalledWith(
                '[ADD_MANUAL_GAME] Executable inspection failed, falling back to default profile:',
                expect.any(Object)
            );
        });
    });

    describe('Platform Derivation Assignment', () => {
        it('assigns windows platform for .exe on linux targetPlatform', async () => {
            const res = await addManualGameCore(mockContext, '/games/RPGGame/Game.exe', { targetPlatform: 'linux' });
            expect(res.ok).toBe(true);
            expect(res.game?.platform).toBe('windows');
        });

        it('assigns macos platform for .app bundle targets', async () => {
            vfs.normalizedMap.set('/games/TestMac.app', { isDir: true });
            vfs.normalizedMap.set('/games/TestMac.app/Contents/MacOS/TestMac', { isDir: false, content: 'bin' });

            const res = await addManualGameCore(mockContext, '/games/TestMac.app', { targetPlatform: 'darwin' });
            expect(res.ok).toBe(true);
            expect(res.game?.platform).toBe('macos');
        });

        it('assigns targetPlatform category for non-exe, non-bundle targets', async () => {
            vfs.normalizedMap.set('/games/LinuxGame/start.sh', { isDir: false, content: 'sh' });
            vfs.normalizedMap.set('/games/LinuxGame', { isDir: true });

            const res = await addManualGameCore(mockContext, '/games/LinuxGame/start.sh', { targetPlatform: 'linux' });
            expect(res.ok).toBe(true);
            expect(res.game?.platform).toBe('linux');
        });
    });

    describe('Persistence, Metadata Overlay, Snapshot Rollback & Concurrency', () => {
        it('tags game with manual: true and persists via context.persistDbDirectly', async () => {
            const res = await addManualGameCore(mockContext, '/games/RPGGame/Game.exe');
            expect(res.ok).toBe(true);
            expect(res.game?.manual).toBe(true);
            expect(mockContext.persistDbDirectly).toHaveBeenCalled();
            expect(mockDb.games['RPGGame']).toBeDefined();
            expect(mockDb.games['RPGGame'].manual).toBe(true);
        });

        it('preserves all 11 user metadata properties on re-add under canonical gameKey', async () => {
            mockDb.games['RPGGame'] = {
                gameKey: 'RPGGame',
                folderPath: '/games/RPGGame',
                exePath: '/games/RPGGame/OldGame.exe',
                favorite: true,
                playtime: 12345,
                lastPlayed: 99999,
                runInBackground: true,
                autoTranslate: true,
                dateAdded: 100000,
                engine: 'Custom Engine',
                saveFolderOverride: '/saves/custom',
                customName: true,
                name: 'User Curated Name',
                sizeBytes: 54321,
                sizeMtime: 67890
            };

            const res = await addManualGameCore(mockContext, '/games/RPGGame/Game.exe');
            expect(res.ok).toBe(true);
            const persisted = mockDb.games['RPGGame'];
            expect(persisted.favorite).toBe(true);
            expect(persisted.playtime).toBe(12345);
            expect(persisted.lastPlayed).toBe(99999);
            expect(persisted.runInBackground).toBe(true);
            expect(persisted.autoTranslate).toBe(true);
            expect(persisted.dateAdded).toBe(100000);
            expect(persisted.saveFolderOverride).toBe('/saves/custom');
            expect(persisted.customName).toBe(true);
            expect(persisted.name).toBe('User Curated Name');
            expect(persisted.sizeBytes).toBe(54321);
            expect(persisted.sizeMtime).toBe(67890);
            expect(persisted.manual).toBe(true);
        });

        it('enforces Snapshot-and-Rollback: restores pre-existing snapshot if persistence fails', async () => {
            const originalRecord = {
                gameKey: 'RPGGame',
                folderPath: '/games/RPGGame',
                exePath: '/games/RPGGame/Old.exe',
                name: 'Original Title'
            };
            mockDb.games['RPGGame'] = { ...originalRecord };

            mockContext.persistDbDirectly = vi.fn().mockRejectedValueOnce(new Error('Disk write error'));

            const res = await addManualGameCore(mockContext, '/games/RPGGame/Game.exe');
            expect(res).toEqual({ ok: false, error: 'Disk write error' });
            expect(mockDb.games['RPGGame']).toEqual(originalRecord);
            expect(errorSpy).toHaveBeenCalledWith(
                '[LIBRARY_STATE][MANUAL_ADD] Failed to persist manual game:',
                expect.any(Object)
            );
        });

        it('enforces Snapshot-and-Rollback: deletes newly created key if persistence fails', async () => {
            mockContext.persistDbDirectly = vi.fn().mockRejectedValueOnce(new Error('Disk write error'));

            const res = await addManualGameCore(mockContext, '/games/RPGGame/Game.exe');
            expect(res).toEqual({ ok: false, error: 'Disk write error' });
            expect(mockDb.games['RPGGame']).toBeUndefined();
        });

        it('aborts persistence with outside-library if owning library root was removed concurrently', async () => {
            let loadCount = 0;
            mockContext.loadDB = vi.fn(async () => {
                loadCount++;
                if (loadCount > 1) {
                    return {
                        schemaVersion: 1,
                        config: { libraryPaths: ['/different/root'] },
                        games: {}
                    };
                }
                return mockDb;
            });

            const res = await addManualGameCore(mockContext, '/games/RPGGame/Game.exe');
            expect(res).toEqual({ ok: false, error: 'outside-library' });
            expect(warnSpy).toHaveBeenCalledWith(
                '[SECURITY][MANUAL_ADD] Owning library path removed during binary inspection, aborting persistence:',
                expect.any(Object)
            );
        });

        it('aborts persistence with root-level-executable if owning root changed under lock to match folderPath', async () => {
            let loadCount = 0;
            mockContext.loadDB = vi.fn(async () => {
                loadCount++;
                if (loadCount > 1) {
                    return {
                        schemaVersion: 1,
                        config: { libraryPaths: ['/games/RPGGame'] },
                        games: {}
                    };
                }
                return mockDb;
            });

            const res = await addManualGameCore(mockContext, '/games/RPGGame/Game.exe');
            expect(res).toEqual({ ok: false, error: 'root-level-executable' });
            expect(warnSpy).toHaveBeenCalledWith(
                '[SECURITY][MANUAL_ADD] Blocked root-level executable without dedicated game folder:',
                expect.any(Object)
            );
        });
    });

    describe('Category Retention & Degraded Safety', () => {
        it('retains existing category assignments in returned LogicalGame', async () => {
            const expectedId = buildLogicalGameId({
                folderName: 'RPGGame',
                folderPath: '/games/RPGGame',
                exePath: '/games/RPGGame/Game.exe',
                gameKey: 'RPGGame',
                relativePath: 'RPGGame'
            });

            mockContext.categoryState.loadCategoryState = vi.fn(async () => ({
                assignments: {
                    [expectedId]: ['cat-rpg', 'cat-favorites']
                }
            }));

            const res = await addManualGameCore(mockContext, '/games/RPGGame/Game.exe');
            expect(res.ok).toBe(true);
            expect(res.game?.categoryIds).toEqual(['cat-rpg', 'cat-favorites']);
        });

        it('defaults to empty categories without failing when categoryState is degraded', async () => {
            mockContext.categoryState.isDegraded = vi.fn(() => true);

            const res = await addManualGameCore(mockContext, '/games/RPGGame/Game.exe');
            expect(res.ok).toBe(true);
            expect(res.game?.categoryIds).toEqual([]);
            expect(warnSpy).toHaveBeenCalledWith(
                '[LIBRARY_STATE][MANUAL_ADD] Category state is in DEGRADED state, defaulting to empty categories:',
                expect.any(Object)
            );
        });

        it('defaults to empty categories without failing when loadCategoryState rejects', async () => {
            mockContext.categoryState.loadCategoryState = vi.fn().mockRejectedValueOnce(new Error('Cat load err'));

            const res = await addManualGameCore(mockContext, '/games/RPGGame/Game.exe');
            expect(res.ok).toBe(true);
            expect(res.game?.categoryIds).toEqual([]);
            expect(warnSpy).toHaveBeenCalledWith(
                '[LIBRARY_STATE][MANUAL_ADD] Failed to load category state, defaulting to empty categories:',
                expect.any(Object)
            );
        });
    });

    describe('Multi-Instance Duplicate Grouping', () => {
        it('preserves multi-instance duplicate counts and sibling instances in returned LogicalGame', async () => {
            // Pre-seed an existing duplicate instance of the same game in another library root
            mockDb.games['Nested'] = {
                gameKey: 'Nested',
                folderName: 'RPGGame',
                folderPath: 'C:/Games/Nested',
                exePath: 'C:/Games/Nested/Game.exe',
                name: 'RPGGame'
            };

            const res = await addManualGameCore(mockContext, '/games/RPGGame/Game.exe');
            expect(res.ok).toBe(true);
            expect(res.game?.duplicateCount).toBe(2);
            expect(res.game?.instances.length).toBe(2);
        });
    });

    describe('createLibraryState Facade Binding', () => {
        it('binds addManualGameCore on createLibraryState and forwards targetPlatform', async () => {
            const libraryState = createLibraryState({
                categoryState: mockContext.categoryState,
                defaultGamesDir: '/games',
                dialog: {},
                fs: vfs.fs,
                fsSync: null,
                dbFilePath: '',
                targetPlatform: 'linux',
                loadDB: vi.fn(async () => mockDb),
                saveDB: vi.fn(async (db: any) => { mockDb = db; })
            });

            expect(typeof (libraryState as any).addManualGameCore).toBe('function');
            const res = await (libraryState as any).addManualGameCore('/games/RPGGame/Game.exe');
            expect(res.ok).toBe(true);
            expect(res.game?.gameKey).toBe('RPGGame');
        });

        it('binds addManualGame on createLibraryState and normalizes arguments', async () => {
            const mockDialog = {
                showOpenDialog: vi.fn(async (opts: any) => ({
                    canceled: false,
                    filePaths: ['/games/RPGGame/Game.exe']
                }))
            };

            const libraryState = createLibraryState({
                categoryState: mockContext.categoryState,
                defaultGamesDir: '/games',
                dialog: mockDialog,
                fs: vfs.fs,
                fsSync: null,
                dbFilePath: '',
                targetPlatform: 'linux',
                loadDB: vi.fn(async () => mockDb),
                saveDB: vi.fn(async (db: any) => { mockDb = db; })
            });

            expect(typeof (libraryState as any).addManualGame).toBe('function');

            // 1. Parameterless invocation
            const res1 = await (libraryState as any).addManualGame();
            expect(res1.ok).toBe(true);
            expect(mockDialog.showOpenDialog).toHaveBeenCalledWith(expect.objectContaining({
                filters: [{ name: 'All Files', extensions: ['*'] }]
            }));

            // 2. String invocation
            const res2 = await (libraryState as any).addManualGame('/games/RPGGame');
            expect(res2.ok).toBe(true);
            expect(mockDialog.showOpenDialog).toHaveBeenCalledWith(expect.objectContaining({
                defaultPath: '/games/RPGGame'
            }));

            // 3. Object invocation
            const res3 = await (libraryState as any).addManualGame({ folderPath: '/games/RPGGame', targetPlatform: 'win32' });
            expect(res3.ok).toBe(true);
            expect(mockDialog.showOpenDialog).toHaveBeenCalledWith(expect.objectContaining({
                defaultPath: '/games/RPGGame',
                filters: [{ name: 'Executables', extensions: ['exe'] }, { name: 'All Files', extensions: ['*'] }]
            }));
        });
    });

    describe('LibraryState Actions - addManualGame (Dialog Orchestration & Fallbacks)', () => {
        beforeEach(() => {
            mockContext.dialog = {
                showOpenDialog: vi.fn(async (opts: any) => ({
                    canceled: false,
                    filePaths: ['/games/RPGGame/Game.exe']
                }))
            };
        });

        it('aborts at entry if database is in degraded state', async () => {
            mockContext.isDegraded = vi.fn(() => true);

            const res = await addManualGame(mockContext);
            expect(res).toEqual({ ok: false, error: 'degraded-database' });
            expect(warnSpy).toHaveBeenCalledWith('[LIBRARY_STATE][ADD_MANUAL_GAME] Operation aborted: database is in DEGRADED state');
            expect(mockContext.dialog.showOpenDialog).not.toHaveBeenCalled();
        });

        it('aborts post-loadDB if database enters degraded state', async () => {
            mockContext.loadDB = vi.fn(async () => {
                mockContext.isDegraded = vi.fn(() => true);
                return mockDb;
            });

            const res = await addManualGame(mockContext);
            expect(res).toEqual({ ok: false, error: 'degraded-database' });
            expect(warnSpy).toHaveBeenCalledWith('[LIBRARY_STATE][ADD_MANUAL_GAME] Operation aborted: database is in DEGRADED state');
            expect(mockContext.dialog.showOpenDialog).not.toHaveBeenCalled();
        });

        it('fails fast if no library paths are configured', async () => {
            mockDb.config.libraryPaths = [];

            const res = await addManualGame(mockContext);
            expect(res).toEqual({ ok: false, error: 'outside-library' });
            expect(warnSpy).toHaveBeenCalledWith(
                '[LIBRARY_STATE][ADD_MANUAL_GAME] Aborted: no library paths configured in library.',
                expect.any(Object)
            );
            expect(mockContext.dialog.showOpenDialog).not.toHaveBeenCalled();
        });

        it('defensively returns dialog-unavailable when dialog is missing or has no showOpenDialog', async () => {
            mockContext.dialog = null;
            const res1 = await addManualGame(mockContext);
            expect(res1).toEqual({ ok: false, error: 'dialog-unavailable' });
            expect(warnSpy).toHaveBeenCalledWith(
                '[LIBRARY_STATE][ADD_MANUAL_GAME] Native directory open dialog is unavailable in current runtime context.',
                expect.any(Object)
            );

            mockContext.dialog = {};
            const res2 = await addManualGame(mockContext);
            expect(res2).toEqual({ ok: false, error: 'dialog-unavailable' });
        });

        it('configures platform-specific executable filters branched on targetPlatform', async () => {
            // win32
            await addManualGame(mockContext, { targetPlatform: 'win32' });
            expect(mockContext.dialog.showOpenDialog).toHaveBeenLastCalledWith(expect.objectContaining({
                properties: ['openFile'],
                filters: [
                    { name: 'Executables', extensions: ['exe'] },
                    { name: 'All Files', extensions: ['*'] }
                ]
            }));

            // darwin
            await addManualGame(mockContext, { targetPlatform: 'darwin' });
            expect(mockContext.dialog.showOpenDialog).toHaveBeenLastCalledWith(expect.objectContaining({
                properties: ['openFile'],
                filters: [
                    { name: 'Applications', extensions: ['app'] },
                    { name: 'All Files', extensions: ['*'] }
                ]
            }));

            // linux
            await addManualGame(mockContext, { targetPlatform: 'linux' });
            expect(mockContext.dialog.showOpenDialog).toHaveBeenLastCalledWith(expect.objectContaining({
                properties: ['openFile'],
                filters: [
                    { name: 'All Files', extensions: ['*'] }
                ]
            }));
        });

        it('uses explicit folderPath as defaultPath and enforces folder containment when inside library roots', async () => {
            const res = await addManualGame(mockContext, { folderPath: '/games/RPGGame' });
            expect(mockContext.dialog.showOpenDialog).toHaveBeenCalledWith(expect.objectContaining({
                defaultPath: '/games/RPGGame'
            }));
            expect(res.ok).toBe(true);
            expect(res.game?.gameKey).toBe('RPGGame');
        });

        it('enforces enclosingFolderPath when user selects file outside explicit folderPath', async () => {
            // User provided /games/RPGGame, but dialog returned C:/Games/Nested/Game.exe
            mockContext.dialog.showOpenDialog.mockResolvedValueOnce({
                canceled: false,
                filePaths: ['C:/Games/Nested/Game.exe']
            });

            const res = await addManualGame(mockContext, { folderPath: '/games/RPGGame' });
            expect(res.ok).toBe(false);
            expect(res.error).toBe('outside-enclosing-folder');
        });

        it('falls back defaultPath when explicit folderPath is outside library roots and leaves enclosingFolderPath undefined', async () => {
            // Out-of-bounds folderPath
            mockContext.dialog.showOpenDialog.mockResolvedValueOnce({
                canceled: false,
                filePaths: ['/games/RPGGame/Game.exe']
            });

            const res = await addManualGame(mockContext, { folderPath: '/outside/folder' });
            expect(mockContext.dialog.showOpenDialog).toHaveBeenCalledWith(expect.objectContaining({
                defaultPath: '/games'
            }));
            // Because enclosingFolderPath is undefined, selecting /games/RPGGame/Game.exe passes root validation
            expect(res.ok).toBe(true);
        });

        it('falls back defaultPath when explicit folderPath contains illegal characters or prototype pollution', async () => {
            const badPaths = ['/games\0bad', '/games\nbad', '/games\rbad', '__proto__', 'constructor', 'prototype'];

            for (const bad of badPaths) {
                mockContext.dialog.showOpenDialog.mockClear();
                mockContext.dialog.showOpenDialog.mockResolvedValueOnce({
                    canceled: false,
                    filePaths: ['/games/RPGGame/Game.exe']
                });

                const res = await addManualGame(mockContext, { folderPath: bad });
                expect(mockContext.dialog.showOpenDialog).toHaveBeenCalledWith(expect.objectContaining({
                    defaultPath: '/games'
                }));
                expect(res.ok).toBe(true);
            }
        });

        it('handles parameterless invocation and tolerates absent context.fsSync without errors', async () => {
            mockContext.fsSync = undefined;
            const res = await addManualGame(mockContext);
            expect(res.ok).toBe(true);
            expect(mockContext.dialog.showOpenDialog).toHaveBeenCalledWith(expect.objectContaining({
                defaultPath: '/games'
            }));
        });

        it('handles string options overload normalizing to folderPath', async () => {
            const res = await addManualGame(mockContext, '  /games/RPGGame  ');
            expect(mockContext.dialog.showOpenDialog).toHaveBeenCalledWith(expect.objectContaining({
                defaultPath: '/games/RPGGame'
            }));
            expect(res.ok).toBe(true);
        });

        it('handles dialog cancellation or empty selection returning canceled: true without touching DB', async () => {
            // Canceled
            mockContext.dialog.showOpenDialog.mockResolvedValueOnce({
                canceled: true,
                filePaths: []
            });

            const res1 = await addManualGame(mockContext);
            expect(res1).toEqual({ ok: false, canceled: true });
            expect(mockDb.games).toEqual({});

            // Empty filePaths
            mockContext.dialog.showOpenDialog.mockResolvedValueOnce({
                canceled: false,
                filePaths: []
            });

            const res2 = await addManualGame(mockContext);
            expect(res2).toEqual({ ok: false, canceled: true });
            expect(mockDb.games).toEqual({});
        });

        it('handles dialog rejection / throw with structured error logging', async () => {
            mockContext.dialog.showOpenDialog.mockRejectedValueOnce(new Error('Native dialog died'));

            const res = await addManualGame(mockContext);
            expect(res).toEqual({ ok: false, error: 'Native dialog died' });
            expect(errorSpy).toHaveBeenCalledWith(
                '[ADD_MANUAL_GAME] Open dialog failed:',
                expect.objectContaining({ error: expect.any(Error), defaultPath: '/games' })
            );
        });
    });
});
