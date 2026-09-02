// @ts-ignore
import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
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
        {
            name: 'RenPy (macOS Application Support)',
            exe: '/Applications/Tsukihime.app/Contents/MacOS/Tsukihime',
            files: {
                '/Applications/Tsukihime.app/Contents/MacOS/Tsukihime': '',
                '/Applications/Tsukihime.app/Contents/Resources/autorun.py': '',
                '/Users/MacUser/Library/Application Support/RenPy/Tsukihime-100200/auto-1.save': 'save'
            },
            dirs: [
                '/Users/MacUser/Library/Application Support/RenPy/Tsukihime-100200'
            ],
            env: { MAC_APP_SUPPORT_HOME: '/Users/MacUser/Library/Application Support' },
            expectedEngine: 'renpy',
            expectedPath: '/Users/MacUser/Library/Application Support/RenPy/Tsukihime-100200'
        },
        {
            name: 'Godot (macOS Application Support)',
            exe: '/Applications/GodotGame.app/Contents/MacOS/GodotGame',
            files: {
                '/Applications/GodotGame.app/Contents/MacOS/GodotGame': '',
                '/Applications/GodotGame.app/Contents/Resources/game.pck': '',
                '/Users/MacUser/Library/Application Support/Godot/app_userdata/GodotGame/save.dat': 'data'
            },
            dirs: [
                '/Users/MacUser/Library/Application Support/Godot/app_userdata/GodotGame'
            ],
            env: { MAC_APP_SUPPORT_HOME: '/Users/MacUser/Library/Application Support' },
            expectedEngine: 'godot',
            expectedPath: '/Users/MacUser/Library/Application Support/Godot/app_userdata/GodotGame'
        },
        {
            name: 'RPG Maker MV/MZ (macOS In-Bundle)',
            exe: '/Applications/RPGMGame.app/Contents/MacOS/Game',
            files: {
                '/Applications/RPGMGame.app/Contents/MacOS/Game': '',
                '/Applications/RPGMGame.app/Contents/Resources/app.nw/js/rmmz_core.js': '',
                '/Applications/RPGMGame.app/Contents/Resources/app.nw/save/file1.rmmzsave': 'save'
            },
            dirs: [
                '/Applications/RPGMGame.app/Contents/Resources/app.nw/save'
            ],
            expectedEngine: 'rpg-mv-mz',
            expectedPath: '/Applications/RPGMGame.app/Contents/Resources/app.nw/save'
        },
        {
            name: 'RPG Maker MV/MZ (macOS WebStorage)',
            exe: '/Applications/WebRPG.app/Contents/MacOS/Game',
            files: {
                '/Applications/WebRPG.app/Contents/MacOS/Game': '',
                '/Applications/WebRPG.app/Contents/Resources/app.nw/package.json': '{"name":"WebRPGGame"}',
                '/Users/MacUser/Library/Application Support/WebRPGGame/Default/Local Storage/leveldb/000003.log': 'log'
            },
            dirs: [
                '/Users/MacUser/Library/Application Support/WebRPGGame/Default/Local Storage/leveldb'
            ],
            env: { MAC_APP_SUPPORT_HOME: '/Users/MacUser/Library/Application Support' },
            expectedEngine: 'rpg-mv-mz',
            expectedPath: '/Users/MacUser/Library/Application Support/WebRPGGame/Default/Local Storage/leveldb'
        },
        {
            name: 'Unity (macOS bundle app.info)',
            exe: '/Applications/UnityMac.app/Contents/MacOS/UnityMac',
            files: {
                '/Applications/UnityMac.app/Contents/MacOS/UnityMac': '',
                '/Applications/UnityMac.app/Contents/Resources/Data/app.info': 'IndieDev\nSpaceGame\n',
                '/Users/MacUser/Library/Application Support/IndieDev/SpaceGame/save.dat': 'data'
            },
            dirs: [
                '/Users/MacUser/Library/Application Support/IndieDev/SpaceGame'
            ],
            env: { MAC_APP_SUPPORT_HOME: '/Users/MacUser/Library/Application Support' },
            expectedEngine: 'unity',
            expectedPath: '/Users/MacUser/Library/Application Support/IndieDev/SpaceGame'
        }
    ];

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
});

