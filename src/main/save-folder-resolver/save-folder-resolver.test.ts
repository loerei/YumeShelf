// @ts-ignore
import { describe, it, expect } from 'vitest';
import { SaveFolderResolver } from './index';
import { MockFileSystemProvider } from './fs-provider';

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
});

