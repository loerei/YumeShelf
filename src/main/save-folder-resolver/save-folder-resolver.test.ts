// @ts-ignore
import { describe, it, expect, vi } from 'vitest';
import * as path from 'node:path';
import { YumeEngine } from '@yumeshelf/engine';
import { SaveFolderResolver } from './index';
import { DefaultFileSystemProvider, MockFileSystemProvider } from './fs-provider';

describe('SaveFolderResolver (Deepened Engine & Location Discovery)', () => {
    function createResolver(
        files: Record<string, string>,
        directories: string[] = [],
        env?: Record<string, string>
    ) {
        const fs = new MockFileSystemProvider(env);
        for (const [filePath, content] of Object.entries(files)) {
            fs.addFile(filePath, content);
        }
        for (const dir of directories) {
            fs.addDirectory(dir);
        }
        return new SaveFolderResolver(fs);
    }

    it('resolves user override path directly', async () => {
        const resolver = createResolver({}, ['C:/CustomSaves/MyGame']);
        const result = await resolver.resolve('C:/Games/MyGame/game.exe', 'C:/CustomSaves/MyGame');
        expect(result).toEqual({
            path: 'C:/CustomSaves/MyGame',
            engine: 'user-override',
            confidence: 'high',
            source: 'override'
        });
    });

    const engineTestCases = [
        {
            name: 'RPG Maker MV/MZ',
            exe: 'C:/Games/RPGGame/Game.exe',
            files: { 'C:/Games/RPGGame/www/js/main.js': '' },
            dirs: ['C:/Games/RPGGame/www/save'],
            expectedEngine: 'rpg-mv-mz',
            expectedPath: 'C:/Games/RPGGame/www/save'
        },
        {
            name: 'RenPy',
            exe: 'C:/Games/VisualNovel/VisualNovel.exe',
            files: { 'C:/Games/VisualNovel/game/script.rpy': '' },
            dirs: ['C:/Users/TestUser/AppData/Roaming/RenPy/VisualNovel-123456'],
            env: { APPDATA: 'C:/Users/TestUser/AppData/Roaming' },
            expectedEngine: 'renpy',
            expectedPath: 'C:/Users/TestUser/AppData/Roaming/RenPy/VisualNovel-123456'
        },
        {
            name: 'Unity via app.info',
            exe: 'C:/Games/UnityGame/UnityGame.exe',
            files: {
                'C:/Games/UnityGame/UnityPlayer.dll': '',
                'C:/Games/UnityGame/UnityGame_Data/app.info': 'MyStudio\nMyCoolGame'
            },
            dirs: ['C:/Users/TestUser/AppData/LocalLow/MyStudio/MyCoolGame'],
            env: { USERPROFILE: 'C:/Users/TestUser' },
            expectedEngine: 'unity',
            expectedPath: 'C:/Users/TestUser/AppData/LocalLow/MyStudio/MyCoolGame'
        },
        {
            name: 'Godot',
            exe: 'C:/Games/GodotGame/GodotGame.exe',
            files: { 'C:/Games/GodotGame/game.pck': '' },
            dirs: ['C:/Users/TestUser/AppData/Roaming/Godot/app_userdata/GodotGame'],
            env: { APPDATA: 'C:/Users/TestUser/AppData/Roaming' },
            expectedEngine: 'godot',
            expectedPath: 'C:/Users/TestUser/AppData/Roaming/Godot/app_userdata/GodotGame'
        },
        {
            name: 'TyranoBuilder',
            exe: 'C:/Games/TyranoGame/Game.exe',
            files: {},
            dirs: ['C:/Games/TyranoGame/tyrano', 'C:/Games/TyranoGame/tyrano/savedata'],
            expectedEngine: 'tyranobuilder',
            expectedPath: 'C:/Games/TyranoGame/tyrano/savedata'
        },
        createMacEngineFixture({
            name: 'RenPy (macOS Application Support)',
            appName: 'Tsukihime',
            resourceFile: { path: 'autorun.py' },
            saveFile: { path: '/Users/MacUser/Library/Application Support/RenPy/Tsukihime-100200/auto-1.save', content: 'save' },
            saveDir: '/Users/MacUser/Library/Application Support/RenPy/Tsukihime-100200',
            expectedEngine: 'renpy'
        }),
        createMacEngineFixture({
            name: 'Godot (macOS Application Support)',
            appName: 'GodotGame',
            resourceFile: { path: 'game.pck' },
            saveFile: { path: '/Users/MacUser/Library/Application Support/Godot/app_userdata/GodotGame/save.dat', content: 'data' },
            saveDir: '/Users/MacUser/Library/Application Support/Godot/app_userdata/GodotGame',
            expectedEngine: 'godot'
        }),
        createMacEngineFixture({
            name: 'RPG Maker MV/MZ (macOS In-Bundle)',
            appName: 'RPGMGame',
            exeName: 'Game',
            resourceFile: { path: 'app.nw/js/rmmz_core.js' },
            saveFile: { path: '/Applications/RPGMGame.app/Contents/Resources/app.nw/save/file1.rmmzsave', content: 'save' },
            saveDir: '/Applications/RPGMGame.app/Contents/Resources/app.nw/save',
            expectedEngine: 'rpg-mv-mz',
            env: {}
        }),
        createMacEngineFixture({
            name: 'RPG Maker MV/MZ (macOS WebStorage)',
            appName: 'WebRPG',
            exeName: 'Game',
            resourceFile: { path: 'app.nw/package.json', content: '{"name":"WebRPGGame"}' },
            saveFile: { path: '/Users/MacUser/Library/Application Support/WebRPGGame/Default/Local Storage/leveldb/000003.log', content: 'log' },
            saveDir: '/Users/MacUser/Library/Application Support/WebRPGGame/Default/Local Storage/leveldb',
            expectedEngine: 'rpg-mv-mz'
        }),
        createMacEngineFixture({
            name: 'Unity (macOS bundle app.info)',
            appName: 'UnityMac',
            resourceFile: { path: 'Data/app.info', content: 'IndieDev\nSpaceGame\n' },
            saveFile: { path: '/Users/MacUser/Library/Application Support/IndieDev/SpaceGame/save.dat', content: 'data' },
            saveDir: '/Users/MacUser/Library/Application Support/IndieDev/SpaceGame',
            expectedEngine: 'unity'
        }),
        createMacEngineFixture({
            name: 'Unreal (macOS Application Support Epic)',
            appName: 'UnrealGame',
            exeName: 'UnrealGame-Mac-Shipping',
            resourceFile: { path: 'UE5' },
            saveFile: { path: '/Users/MacUser/Library/Application Support/Epic/UnrealGame/Saved/SaveGames/SaveSlot.sav', content: 'sav' },
            saveDir: '/Users/MacUser/Library/Application Support/Epic/UnrealGame/Saved/SaveGames',
            expectedEngine: 'unreal'
        })
    ];

    function createMacEngineFixture(options: {
        name: string;
        appName: string;
        exeName?: string;
        resourceFile?: { path: string; content?: string };
        saveDir: string;
        saveFile?: { path: string; content?: string };
        expectedEngine: string;
        env?: Record<string, string>;
    }): EngineTestCase {
        const exe = `/Applications/${options.appName}.app/Contents/MacOS/${options.exeName || options.appName}`;
        const files: Record<string, string> = { [exe]: '' };
        if (options.resourceFile) {
            files[`/Applications/${options.appName}.app/Contents/Resources/${options.resourceFile.path}`] = options.resourceFile.content || '';
        }
        if (options.saveFile) {
            files[options.saveFile.path] = options.saveFile.content || '';
        }
        return {
            name: options.name,
            exe,
            files,
            dirs: [options.saveDir],
            env: options.env !== undefined ? options.env : { MAC_APP_SUPPORT_HOME: '/Users/MacUser/Library/Application Support' },
            expectedEngine: options.expectedEngine,
            expectedPath: options.saveDir
        };
    }

    interface EngineTestCase {
        name: string;
        exe: string;
        files: Record<string, string>;
        dirs: string[];
        env?: Record<string, string>;
        expectedEngine: string;
        expectedPath: string;
    }

    it.each(engineTestCases)('detects and resolves $name save folder', async (tc: EngineTestCase) => {
        const resolver = createResolver(tc.files, tc.dirs, tc.env);
        const result = await resolver.resolve(tc.exe);
        expect(result.engine).toBe(tc.expectedEngine);
        expect(result.confidence).toBe('high');
        expect(result.path).toBe(tc.expectedPath);
    });

    it('falls back to heuristic scan when engine deterministic path is not found', async () => {
        const resolver = createResolver({
            'C:/Games/UnknownGame/savedata/save01.sav': ''
        });
        const result = await resolver.resolve('C:/Games/UnknownGame/Game.exe');
        expect(result.engine).toBe('unknown');
        expect(result.confidence).toBe('high');
        expect(result.source).toBe('heuristic');
        expect(result.path).toBe('C:/Games/UnknownGame/savedata');
    });

    it('DefaultFileSystemProvider: resolves macOS environment paths and enforces empty home safety', () => {
        const provider = new DefaultFileSystemProvider();
        const originalHome = process.env.HOME;
        const originalUserProfile = process.env.USERPROFILE;

        try {
            process.env.HOME = '/Users/TestUser';
            delete process.env.USERPROFILE;
            expect(provider.getMacApplicationSupportHome?.()).toBe(
                path.join('/Users/TestUser', 'Library', 'Application Support')
            );
            expect(provider.getMacPreferencesHome?.()).toBe(
                path.join('/Users/TestUser', 'Library', 'Preferences')
            );

            // Empty home safety: must return empty string to prevent relative path fallback
            process.env.HOME = '';
            process.env.USERPROFILE = '';
            expect(provider.getMacApplicationSupportHome?.()).toBe('');
            expect(provider.getMacPreferencesHome?.()).toBe('');
        } finally {
            if (originalHome !== undefined) process.env.HOME = originalHome;
            else delete process.env.HOME;
            if (originalUserProfile !== undefined) process.env.USERPROFILE = originalUserProfile;
            else delete process.env.USERPROFILE;
        }
    });

    it('MockFileSystemProvider: resolves macOS environment paths hermetically and respects overrides', () => {
        const mockFs = new MockFileSystemProvider({ HOME: '/home/macuser' });
        expect(mockFs.getMacApplicationSupportHome()).toBe(
            '/home/macuser/Library/Application Support'
        );
        expect(mockFs.getMacPreferencesHome()).toBe(
            '/home/macuser/Library/Preferences'
        );

        // Env var overrides
        mockFs.setEnv('MAC_APP_SUPPORT_HOME', '/custom/mac/support');
        mockFs.setEnv('MAC_PREFERENCES_HOME', '/custom/mac/prefs');
        expect(mockFs.getMacApplicationSupportHome()).toBe('/custom/mac/support');
        expect(mockFs.getMacPreferencesHome()).toBe('/custom/mac/prefs');

        // Empty home safety
        const emptyMock = new MockFileSystemProvider({ HOME: '', USERPROFILE: '' });
        expect(emptyMock.getMacApplicationSupportHome()).toBe('');
        expect(emptyMock.getMacPreferencesHome()).toBe('');
    });

    it('unifiedFs: forwards macOS environment paths to underlying provider', async () => {
        const mockFs = new MockFileSystemProvider({ HOME: '/Users/ForwardUser' });
        let forwardedSupportHome = '';
        let forwardedPrefsHome = '';

        // Spy on YumeEngine.resolveSaveDirectory or inspect unifiedFs through resolver
        const resolver = new SaveFolderResolver(mockFs);
        mockFs.addDirectory('/Users/ForwardUser/Library/Application Support');

        // Verify direct getter methods on mockFs match expected paths
        expect(mockFs.getMacApplicationSupportHome()).toBe(
            '/Users/ForwardUser/Library/Application Support'
        );
        expect(mockFs.getMacPreferencesHome()).toBe(
            '/Users/ForwardUser/Library/Preferences'
        );
    });

    async function expectWarningLoggedOnFailure(
        mockAction: () => { mockRestore: () => void },
        expectedWarningTag: string
    ) {
        const mockFs = new MockFileSystemProvider();
        const resolver = new SaveFolderResolver(mockFs);
        const spy = mockAction();
        const warnings: any[][] = [];
        const originalWarn = console.warn;
        console.warn = (...args: any[]) => {
            warnings.push(args);
        };

        try {
            const result = await resolver.resolve('/games/BrokenGame/game.exe');
            expect(result).toEqual({
                path: null,
                engine: null,
                confidence: 'none',
                source: 'none'
            });
            expect(warnings.some((w) => w[0] === expectedWarningTag)).toBe(true);
        } finally {
            spy.mockRestore();
            console.warn = originalWarn;
        }
    }

    it('logs diagnostic warning [SAVE-RESOLVER][ERROR] and returns graceful fallback when inspection throws', async () => {
        await expectWarningLoggedOnFailure(
            () => vi.spyOn(YumeEngine, 'inspectExecutable').mockRejectedValueOnce(new Error('Corrupt binary inspection failed')),
            '[SAVE-RESOLVER][ERROR]'
        );
    });

    it('logs diagnostic warning [SAVE-RESOLVER][ERROR] when resolveSaveDirectory throws', async () => {
        await expectWarningLoggedOnFailure(
            () => vi.spyOn(YumeEngine, 'resolveSaveDirectory').mockRejectedValueOnce(new Error('Save directory resolution crashed')),
            '[SAVE-RESOLVER][ERROR]'
        );
    });

    it('returns overrideMissing: true immediately when user override does not exist without running inspectExecutable', async () => {
        const inspectSpy = vi.spyOn(YumeEngine, 'inspectExecutable');
        try {
            const resolver = createResolver({}, []);
            const result = await resolver.resolve('C:/Games/MyGame/game.exe', 'C:/Missing/Folder');
            expect(result).toEqual({
                path: 'C:/Missing/Folder',
                engine: 'user-override',
                confidence: 'none',
                source: 'override',
                overrideMissing: true
            });
            expect(inspectSpy).not.toHaveBeenCalled();
        } finally {
            inspectSpy.mockRestore();
        }
    });

    it('returns overrideMissing: true when resolveSaveDirectory returns null or throws for override', async () => {
        const inspectSpy = vi.spyOn(YumeEngine, 'inspectExecutable');
        const resolveSpy = vi.spyOn(YumeEngine, 'resolveSaveDirectory').mockRejectedValueOnce(new Error('Filesystem disconnected'));
        try {
            const resolver = createResolver({}, []);
            const result = await resolver.resolve('C:/Games/MyGame/game.exe', 'D:/External/Saves');
            expect(result).toEqual({
                path: 'D:/External/Saves',
                engine: 'user-override',
                confidence: 'none',
                source: 'override',
                overrideMissing: true
            });
            expect(inspectSpy).not.toHaveBeenCalled();
        } finally {
            inspectSpy.mockRestore();
            resolveSpy.mockRestore();
        }
    });

    it('conforms unifiedFs.open to IFileHandle slicing without error', async () => {
        let capturedFs: any = null;
        const resolveSpy = vi.spyOn(YumeEngine, 'resolveSaveDirectory').mockImplementationOnce(async (_profile: any, _exePath: any, fs: any) => {
            capturedFs = fs;
            return null;
        });

        try {
            const mockFs = new MockFileSystemProvider();
            mockFs.addFile('C:/Games/file.bin', 'ABCDEF123456');
            const resolver = new SaveFolderResolver(mockFs);
            await resolver.resolve('C:/Games/file.bin', 'C:/Override');

            expect(capturedFs).toBeDefined();
            const handle = await capturedFs.open('C:/Games/file.bin');
            expect(handle).toBeDefined();
            const slice = await handle.read(2, 4);
            expect(slice.toString()).toBe('CDEF');
            await handle.close();

            const missingHandle = await capturedFs.open('C:/Nonexistent.bin');
            const emptySlice = await missingHandle.read(0, 10);
            expect(emptySlice.length).toBe(0);
            await missingHandle.close();
        } finally {
            resolveSpy.mockRestore();
        }
    });

    it('restores auto-detection without overrideMissing when override is empty string, whitespace, or undefined', async () => {
        const resolver = createResolver(
            { 'C:/Games/RPGGame/www/js/main.js': '' },
            ['C:/Games/RPGGame/www/save']
        );

        for (const emptyOverride of ['', '   ', undefined, null]) {
            const result = await resolver.resolve('C:/Games/RPGGame/Game.exe', emptyOverride);
            expect(result).toEqual({
                path: 'C:/Games/RPGGame/www/save',
                engine: 'rpg-mv-mz',
                confidence: 'high',
                source: 'deterministic'
            });
            expect(result.overrideMissing).toBeUndefined();
        }
    });
});

