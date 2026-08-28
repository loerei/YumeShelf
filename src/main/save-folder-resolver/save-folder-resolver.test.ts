// @ts-ignore
import { describe, it, expect } from 'vitest';
import { SaveFolderResolver } from './index';
import { MockFileSystemProvider } from './fs-provider';

describe('SaveFolderResolver (Deepened Engine & Location Discovery)', () => {
    it('resolves user override path directly', async () => {
        const fs = new MockFileSystemProvider();
        fs.addDirectory('C:/CustomSaves/MyGame');
        const resolver = new SaveFolderResolver(fs);

        const result = await resolver.resolve('C:/Games/MyGame/game.exe', 'C:/CustomSaves/MyGame');
        expect(result).toEqual({
            path: 'C:/CustomSaves/MyGame',
            engine: 'user-override',
            confidence: 'high',
            source: 'override'
        });
    });

    it('detects and resolves RPG Maker MV/MZ save folder', async () => {
        const fs = new MockFileSystemProvider();
        fs.addFile('C:/Games/RPGGame/www/js/main.js');
        fs.addDirectory('C:/Games/RPGGame/www/save');
        const resolver = new SaveFolderResolver(fs);

        const result = await resolver.resolve('C:/Games/RPGGame/Game.exe');
        expect(result.engine).toBe('rpg-mv-mz');
        expect(result.confidence).toBe('high');
        expect(result.path).toBe('C:/Games/RPGGame/www/save');
    });

    it('detects and resolves RenPy save folder', async () => {
        const fs = new MockFileSystemProvider({ APPDATA: 'C:/Users/TestUser/AppData/Roaming' });
        fs.addFile('C:/Games/VisualNovel/game/script.rpy');
        fs.addDirectory('C:/Users/TestUser/AppData/Roaming/RenPy/VisualNovel-123456');
        const resolver = new SaveFolderResolver(fs);

        const result = await resolver.resolve('C:/Games/VisualNovel/VisualNovel.exe');
        expect(result.engine).toBe('renpy');
        expect(result.confidence).toBe('high');
        expect(result.path).toBe('C:/Users/TestUser/AppData/Roaming/RenPy/VisualNovel-123456');
    });

    it('detects and resolves Unity save folder via app.info', async () => {
        const fs = new MockFileSystemProvider({ USERPROFILE: 'C:/Users/TestUser' });
        fs.addFile('C:/Games/UnityGame/UnityPlayer.dll');
        fs.addFile('C:/Games/UnityGame/UnityGame_Data/app.info', 'MyStudio\nMyCoolGame');
        fs.addDirectory('C:/Users/TestUser/AppData/LocalLow/MyStudio/MyCoolGame');
        const resolver = new SaveFolderResolver(fs);

        const result = await resolver.resolve('C:/Games/UnityGame/UnityGame.exe');
        expect(result.engine).toBe('unity');
        expect(result.confidence).toBe('high');
        expect(result.path).toBe('C:/Users/TestUser/AppData/LocalLow/MyStudio/MyCoolGame');
    });

    it('detects and resolves Godot save folder', async () => {
        const fs = new MockFileSystemProvider({ APPDATA: 'C:/Users/TestUser/AppData/Roaming' });
        fs.addFile('C:/Games/GodotGame/game.pck');
        fs.addDirectory('C:/Users/TestUser/AppData/Roaming/Godot/app_userdata/GodotGame');
        const resolver = new SaveFolderResolver(fs);

        const result = await resolver.resolve('C:/Games/GodotGame/GodotGame.exe');
        expect(result.engine).toBe('godot');
        expect(result.confidence).toBe('high');
        expect(result.path).toBe('C:/Users/TestUser/AppData/Roaming/Godot/app_userdata/GodotGame');
    });

    it('detects and resolves TyranoBuilder save folder', async () => {
        const fs = new MockFileSystemProvider();
        fs.addDirectory('C:/Games/TyranoGame/tyrano');
        fs.addDirectory('C:/Games/TyranoGame/tyrano/savedata');
        const resolver = new SaveFolderResolver(fs);

        const result = await resolver.resolve('C:/Games/TyranoGame/Game.exe');
        expect(result.engine).toBe('tyranobuilder');
        expect(result.confidence).toBe('high');
        expect(result.path).toBe('C:/Games/TyranoGame/tyrano/savedata');
    });

    it('falls back to heuristic scan when engine deterministic path is not found', async () => {
        const fs = new MockFileSystemProvider();
        fs.addFile('C:/Games/UnknownGame/savedata/save01.sav');
        const resolver = new SaveFolderResolver(fs);

        const result = await resolver.resolve('C:/Games/UnknownGame/Game.exe');
        expect(result.engine).toBe('unknown');
        expect(result.confidence).toBe('high');
        expect(result.source).toBe('heuristic');
        expect(result.path).toBe('C:/Games/UnknownGame/savedata');
    });
});

