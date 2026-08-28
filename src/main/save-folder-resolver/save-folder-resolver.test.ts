// @ts-ignore
import { describe, it, expect } from 'vitest';
import { SaveFolderResolver } from './index';
import { MockFileSystemProvider } from './fs-provider';

describe('SaveFolderResolver (Deepened Engine & Location Discovery)', () => {
    function createResolverWithFiles(
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
        const resolver = createResolverWithFiles({}, ['C:/CustomSaves/MyGame']);
        const result = await resolver.resolve('C:/Games/MyGame/game.exe', 'C:/CustomSaves/MyGame');
        expect(result).toEqual({
            path: 'C:/CustomSaves/MyGame',
            engine: 'user-override',
            confidence: 'high',
            source: 'override'
        });
    });

    it('detects and resolves RPG Maker MV/MZ save folder', async () => {
        const resolver = createResolverWithFiles(
            { 'C:/Games/RPGGame/www/js/main.js': '' },
            ['C:/Games/RPGGame/www/save']
        );
        const result = await resolver.resolve('C:/Games/RPGGame/Game.exe');
        expect(result.engine).toBe('rpg-mv-mz');
        expect(result.confidence).toBe('high');
        expect(result.path).toBe('C:/Games/RPGGame/www/save');
    });

    it('detects and resolves RenPy save folder', async () => {
        const resolver = createResolverWithFiles(
            { 'C:/Games/VisualNovel/game/script.rpy': '' },
            ['C:/Users/TestUser/AppData/Roaming/RenPy/VisualNovel-123456'],
            { APPDATA: 'C:/Users/TestUser/AppData/Roaming' }
        );
        const result = await resolver.resolve('C:/Games/VisualNovel/VisualNovel.exe');
        expect(result.engine).toBe('renpy');
        expect(result.confidence).toBe('high');
        expect(result.path).toBe('C:/Users/TestUser/AppData/Roaming/RenPy/VisualNovel-123456');
    });

    it('detects and resolves Unity save folder via app.info', async () => {
        const resolver = createResolverWithFiles(
            {
                'C:/Games/UnityGame/UnityPlayer.dll': '',
                'C:/Games/UnityGame/UnityGame_Data/app.info': 'MyStudio\nMyCoolGame'
            },
            ['C:/Users/TestUser/AppData/LocalLow/MyStudio/MyCoolGame'],
            { USERPROFILE: 'C:/Users/TestUser' }
        );
        const result = await resolver.resolve('C:/Games/UnityGame/UnityGame.exe');
        expect(result.engine).toBe('unity');
        expect(result.confidence).toBe('high');
        expect(result.path).toBe('C:/Users/TestUser/AppData/LocalLow/MyStudio/MyCoolGame');
    });

    it('detects and resolves Godot save folder', async () => {
        const resolver = createResolverWithFiles(
            { 'C:/Games/GodotGame/game.pck': '' },
            ['C:/Users/TestUser/AppData/Roaming/Godot/app_userdata/GodotGame'],
            { APPDATA: 'C:/Users/TestUser/AppData/Roaming' }
        );
        const result = await resolver.resolve('C:/Games/GodotGame/GodotGame.exe');
        expect(result.engine).toBe('godot');
        expect(result.confidence).toBe('high');
        expect(result.path).toBe('C:/Users/TestUser/AppData/Roaming/Godot/app_userdata/GodotGame');
    });

    it('detects and resolves TyranoBuilder save folder', async () => {
        const resolver = createResolverWithFiles({}, [
            'C:/Games/TyranoGame/tyrano',
            'C:/Games/TyranoGame/tyrano/savedata'
        ]);
        const result = await resolver.resolve('C:/Games/TyranoGame/Game.exe');
        expect(result.engine).toBe('tyranobuilder');
        expect(result.confidence).toBe('high');
        expect(result.path).toBe('C:/Games/TyranoGame/tyrano/savedata');
    });

    it('falls back to heuristic scan when engine deterministic path is not found', async () => {
        const resolver = createResolverWithFiles({
            'C:/Games/UnknownGame/savedata/save01.sav': ''
        });
        const result = await resolver.resolve('C:/Games/UnknownGame/Game.exe');
        expect(result.engine).toBe('unknown');
        expect(result.confidence).toBe('high');
        expect(result.source).toBe('heuristic');
        expect(result.path).toBe('C:/Games/UnknownGame/savedata');
    });
});

