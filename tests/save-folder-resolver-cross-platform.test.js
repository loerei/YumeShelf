const test = require('node:test');
const assert = require('node:assert/strict');

const { SaveFolderResolver } = require('../dist/main/save-folder-resolver');
const { MockFileSystemProvider } = require('../dist/main/save-folder-resolver/fs-provider');

test('Cross-Platform Save Resolver: RenPy discovers Linux ~/.renpy and Wine/Proton prefix saves', async (t) => {
    await t.test('resolves native Linux ~/.renpy save folder', async () => {
        const fs = new MockFileSystemProvider({
            HOME: '/home/gamer',
            XDG_DATA_HOME: '/home/gamer/.local/share'
        });
        fs.addFile('/games/RenPyGame/game/script.rpy');
        fs.addDirectory('/home/gamer/.renpy/RenPyGame-12345678');

        const resolver = new SaveFolderResolver(fs);
        const result = await resolver.resolve('/games/RenPyGame/RenPyGame.sh');

        assert.equal(result.engine, 'renpy');
        assert.equal(result.confidence, 'high');
        assert.equal(result.path, '/home/gamer/.renpy/RenPyGame-12345678');
    });

    await t.test('resolves RenPy save folder inside Wine/Proton prefix with dynamic username', async () => {
        const fs = new MockFileSystemProvider({
            HOME: '/home/gamer',
            WINEPREFIX: '/home/gamer/.wine'
        });
        fs.addFile('/games/WineRenPy/game/script.rpy');
        fs.addDirectory('/home/gamer/.wine/drive_c/users/steamuser/AppData/Roaming/RenPy/WineRenPy-9999');

        const resolver = new SaveFolderResolver(fs);
        const result = await resolver.resolve('/games/WineRenPy/WineRenPy.exe');

        assert.equal(result.engine, 'renpy');
        assert.equal(result.confidence, 'high');
        assert.equal(result.path, '/home/gamer/.wine/drive_c/users/steamuser/AppData/Roaming/RenPy/WineRenPy-9999');
    });
});

test('Cross-Platform Save Resolver: Unity discovers Linux XDG ~/.config/unity3d and Wine LocalLow saves', async (t) => {
    await t.test('resolves native Linux ~/.config/unity3d save folder via app.info', async () => {
        const fs = new MockFileSystemProvider({
            HOME: '/home/gamer',
            XDG_CONFIG_HOME: '/home/gamer/.config'
        });
        fs.addFile('/games/UnityNative/UnityPlayer.so');
        fs.addFile('/games/UnityNative/UnityNative_Data/app.info', 'MyStudio\nMyNativeGame');
        fs.addDirectory('/home/gamer/.config/unity3d/MyStudio/MyNativeGame');

        const resolver = new SaveFolderResolver(fs);
        const result = await resolver.resolve('/games/UnityNative/UnityNative.x86_64');

        assert.equal(result.engine, 'unity');
        assert.equal(result.confidence, 'high');
        assert.equal(result.path, '/home/gamer/.config/unity3d/MyStudio/MyNativeGame');
    });

    await t.test('resolves Unity save folder inside Proton compatdata prefix', async () => {
        const fs = new MockFileSystemProvider({
            HOME: '/home/gamer'
        });
        fs.addFile('/games/SteamUnity/UnityPlayer.dll');
        fs.addFile('/games/SteamUnity/SteamUnity_Data/app.info', 'IndieDev\nEpicQuest');
        fs.addDirectory('/home/gamer/.steam/steam/steamapps/compatdata/12345/pfx/drive_c/users/steamuser/AppData/LocalLow/IndieDev/EpicQuest');

        const resolver = new SaveFolderResolver(fs);
        const result = await resolver.resolve('/games/SteamUnity/SteamUnity.exe');

        assert.equal(result.engine, 'unity');
        assert.equal(result.confidence, 'high');
        assert.equal(result.path, '/home/gamer/.steam/steam/steamapps/compatdata/12345/pfx/drive_c/users/steamuser/AppData/LocalLow/IndieDev/EpicQuest');
    });
});

test('Cross-Platform Save Resolver: Godot discovers Linux ~/.local/share/godot and Wine Roaming saves', async (t) => {
    await t.test('resolves native Linux Godot save folder under XDG_DATA_HOME', async () => {
        const fs = new MockFileSystemProvider({
            HOME: '/home/gamer',
            XDG_DATA_HOME: '/home/gamer/.local/share'
        });
        fs.addFile('/games/GodotGame/game.pck');
        fs.addDirectory('/home/gamer/.local/share/godot/app_userdata/GodotGame');

        const resolver = new SaveFolderResolver(fs);
        const result = await resolver.resolve('/games/GodotGame/GodotGame.x86_64');

        assert.equal(result.engine, 'godot');
        assert.equal(result.confidence, 'high');
        assert.equal(result.path, '/home/gamer/.local/share/godot/app_userdata/GodotGame');
    });

    await t.test('resolves Godot save folder inside Wine prefix', async () => {
        const fs = new MockFileSystemProvider({
            HOME: '/home/gamer',
            WINEPREFIX: '/home/gamer/.wine'
        });
        fs.addFile('/games/GodotWine/game.pck');
        fs.addDirectory('/home/gamer/.wine/drive_c/users/wineuser/AppData/Roaming/Godot/app_userdata/GodotWine');

        const resolver = new SaveFolderResolver(fs);
        const result = await resolver.resolve('/games/GodotWine/GodotWine.exe');

        assert.equal(result.engine, 'godot');
        assert.equal(result.confidence, 'high');
        assert.equal(result.path, '/home/gamer/.wine/drive_c/users/wineuser/AppData/Roaming/Godot/app_userdata/GodotWine');
    });
});

test('Cross-Platform Save Resolver: Unreal discovers Linux Epic XDG paths and Wine Local saves', async (t) => {
    await t.test('resolves native Linux Unreal save folder under XDG_CONFIG_HOME/Epic', async () => {
        const fs = new MockFileSystemProvider({
            HOME: '/home/gamer',
            XDG_CONFIG_HOME: '/home/gamer/.config'
        });
        fs.addFile('/games/UnrealNative/Binaries/Linux/UnrealNative-Linux-Shipping');
        fs.addDirectory('/home/gamer/.config/Epic/UnrealNative/Saved/SaveGames');

        const resolver = new SaveFolderResolver(fs);
        const result = await resolver.resolve('/games/UnrealNative/Binaries/Linux/UnrealNative-Linux-Shipping');

        assert.equal(result.engine, 'unreal');
        assert.equal(result.confidence, 'high');
        assert.equal(result.path, '/home/gamer/.config/Epic/UnrealNative/Saved/SaveGames');
    });

    await t.test('resolves Unreal save folder inside Wine prefix', async () => {
        const fs = new MockFileSystemProvider({
            HOME: '/home/gamer',
            WINEPREFIX: '/home/gamer/.wine'
        });
        fs.addFile('/games/UnrealWine/Binaries/Win64/UnrealWine-Win64-Shipping.exe');
        fs.addDirectory('/home/gamer/.wine/drive_c/users/steamuser/AppData/Local/UnrealWine/Saved/SaveGames');

        const resolver = new SaveFolderResolver(fs);
        const result = await resolver.resolve('/games/UnrealWine/Binaries/Win64/UnrealWine-Win64-Shipping.exe');

        assert.equal(result.engine, 'unreal');
        assert.equal(result.confidence, 'high');
        assert.equal(result.path, '/home/gamer/.wine/drive_c/users/steamuser/AppData/Local/UnrealWine/Saved/SaveGames');
    });
});

test('Cross-Platform Save Resolver: AppData fuzzy matching finds Linux XDG Unity and Unreal saves', async () => {
    const fs = new MockFileSystemProvider({
        HOME: '/home/gamer',
        XDG_CONFIG_HOME: '/home/gamer/.config'
    });
    fs.addDirectory('/home/gamer/.config/unity3d/ObscureStudio/SpecialMysteryGame');

    const resolver = new SaveFolderResolver(fs);
    const result = await resolver.resolve('/games/RandomFolder/SpecialMysteryGame.x86_64');

    assert.equal(result.engine, 'unity');
    assert.equal(result.source, 'appdata');
    assert.equal(result.path, '/home/gamer/.config/unity3d/ObscureStudio/SpecialMysteryGame');
});

test('Cross-Platform Save Resolver (macOS): Unity resolves Application Support saves', async (t) => {
    await t.test('resolves macOS Unity save folder via app.info under Application Support', async () => {
        const fs = new MockFileSystemProvider({
            HOME: '/Users/macgamer',
            MAC_APP_SUPPORT_HOME: '/Users/macgamer/Library/Application Support'
        });
        fs.addFile('/Applications/UnityGame.app/Contents/MacOS/UnityGame');
        fs.addFile('/Applications/UnityGame.app/Contents/Resources/Data/app.info', 'IndieDev\nSpaceOdyssey\n');
        fs.addDirectory('/Users/macgamer/Library/Application Support/IndieDev/SpaceOdyssey');
        fs.addFile('/Users/macgamer/Library/Application Support/IndieDev/SpaceOdyssey/save.dat', 'data');

        const resolver = new SaveFolderResolver(fs);
        const result = await resolver.resolve('/Applications/UnityGame.app/Contents/MacOS/UnityGame');

        assert.equal(result.engine, 'unity');
        assert.equal(result.confidence, 'high');
        assert.equal(result.path, '/Users/macgamer/Library/Application Support/IndieDev/SpaceOdyssey');
    });

    await t.test('resolves macOS Unity save folder via unity.company.product directory pattern', async () => {
        const fs = new MockFileSystemProvider({
            HOME: '/Users/macgamer',
            MAC_APP_SUPPORT_HOME: '/Users/macgamer/Library/Application Support'
        });
        fs.addFile('/Applications/SpaceFlight.app/Contents/MacOS/SpaceFlight');
        fs.addFile('/Applications/SpaceFlight.app/Contents/Resources/Data/app.info', 'AeroCorp\nSpaceFlight\n');
        fs.addDirectory('/Users/macgamer/Library/Application Support/unity.AeroCorp.SpaceFlight');
        fs.addFile('/Users/macgamer/Library/Application Support/unity.AeroCorp.SpaceFlight/save.dat', 'data');

        const resolver = new SaveFolderResolver(fs);
        const result = await resolver.resolve('/Applications/SpaceFlight.app/Contents/MacOS/SpaceFlight');

        assert.equal(result.engine, 'unity');
        assert.equal(result.confidence, 'high');
        assert.equal(result.path, '/Users/macgamer/Library/Application Support/unity.AeroCorp.SpaceFlight');
    });
});

test('Cross-Platform Save Resolver (macOS): RPG Maker resolves In-Bundle and WebStorage saves', async (t) => {
    await t.test('resolves macOS RPG Maker in-bundle save directory', async () => {
        const fs = new MockFileSystemProvider({
            HOME: '/Users/macgamer'
        });
        fs.addFile('/Applications/RPGMGame.app/Contents/MacOS/Game');
        fs.addFile('/Applications/RPGMGame.app/Contents/Resources/app.nw/js/rmmz_core.js');
        fs.addDirectory('/Applications/RPGMGame.app/Contents/Resources/app.nw/save');
        fs.addFile('/Applications/RPGMGame.app/Contents/Resources/app.nw/save/file1.rmmzsave', 'save');

        const resolver = new SaveFolderResolver(fs);
        const result = await resolver.resolve('/Applications/RPGMGame.app/Contents/MacOS/Game');

        assert.equal(result.engine, 'rpg-mv-mz');
        assert.equal(result.confidence, 'high');
        assert.equal(result.source, 'deterministic');
        assert.equal(result.path, '/Applications/RPGMGame.app/Contents/Resources/app.nw/save');
    });

    await t.test('resolves macOS RPG Maker WebStorage leveldb saves via package.json name', async () => {
        const fs = new MockFileSystemProvider({
            HOME: '/Users/macgamer',
            MAC_APP_SUPPORT_HOME: '/Users/macgamer/Library/Application Support'
        });
        fs.addFile('/Applications/WebRPG.app/Contents/MacOS/Game');
        fs.addFile('/Applications/WebRPG.app/Contents/Resources/app.nw/package.json', JSON.stringify({ name: 'EpicQuestWeb' }));
        fs.addDirectory('/Users/macgamer/Library/Application Support/EpicQuestWeb/Default/Local Storage/leveldb');
        fs.addFile('/Users/macgamer/Library/Application Support/EpicQuestWeb/Default/Local Storage/leveldb/000003.log', 'log');

        const resolver = new SaveFolderResolver(fs);
        const result = await resolver.resolve('/Applications/WebRPG.app/Contents/MacOS/Game');

        assert.equal(result.engine, 'rpg-mv-mz');
        assert.equal(result.confidence, 'high');
        assert.equal(result.source, 'appdata');
        assert.equal(result.path, '/Users/macgamer/Library/Application Support/EpicQuestWeb/Default/Local Storage/leveldb');
    });
});

test('Cross-Platform Save Resolver (macOS): RenPy resolves Application Support saves', async (t) => {
    await t.test('resolves native macOS RenPy Application Support saves', async () => {
        const fs = new MockFileSystemProvider({
            HOME: '/Users/macgamer',
            MAC_APP_SUPPORT_HOME: '/Users/macgamer/Library/Application Support'
        });
        fs.addFile('/Applications/Tsukihime.app/Contents/MacOS/Tsukihime');
        fs.addFile('/Applications/Tsukihime.app/Contents/Resources/autorun.py');
        fs.addDirectory('/Users/macgamer/Library/Application Support/RenPy/Tsukihime-100200');
        fs.addFile('/Users/macgamer/Library/Application Support/RenPy/Tsukihime-100200/auto-1.save', 'save');

        const resolver = new SaveFolderResolver(fs);
        const result = await resolver.resolve('/Applications/Tsukihime.app/Contents/MacOS/Tsukihime');

        assert.equal(result.engine, 'renpy');
        assert.equal(result.confidence, 'high');
        assert.equal(result.source, 'appdata');
        assert.equal(result.path, '/Users/macgamer/Library/Application Support/RenPy/Tsukihime-100200');
    });
});

test('Cross-Platform Save Resolver (macOS): Godot resolves Application Support app_userdata saves', async (t) => {
    await t.test('resolves native macOS Godot app_userdata saves', async () => {
        const fs = new MockFileSystemProvider({
            HOME: '/Users/macgamer',
            MAC_APP_SUPPORT_HOME: '/Users/macgamer/Library/Application Support'
        });
        fs.addFile('/Applications/GodotMacGame.app/Contents/MacOS/GodotMacGame');
        fs.addFile('/Applications/GodotMacGame.app/Contents/Resources/game.pck');
        fs.addDirectory('/Users/macgamer/Library/Application Support/Godot/app_userdata/GodotMacGame');
        fs.addFile('/Users/macgamer/Library/Application Support/Godot/app_userdata/GodotMacGame/save.dat', 'data');

        const resolver = new SaveFolderResolver(fs);
        const result = await resolver.resolve('/Applications/GodotMacGame.app/Contents/MacOS/GodotMacGame');

        assert.equal(result.engine, 'godot');
        assert.equal(result.confidence, 'high');
        assert.equal(result.source, 'appdata');
        assert.equal(result.path, '/Users/macgamer/Library/Application Support/Godot/app_userdata/GodotMacGame');
    });
});

test('Cross-Platform Save Resolver (macOS): Unreal resolves Epic Application Support saves', async (t) => {
    await t.test('resolves native macOS Unreal Engine saves under Application Support/Epic', async () => {
        const fs = new MockFileSystemProvider({
            HOME: '/Users/macgamer',
            MAC_APP_SUPPORT_HOME: '/Users/macgamer/Library/Application Support'
        });
        fs.addFile('/Applications/UnrealGame.app/Contents/MacOS/UnrealGame-Mac-Shipping');
        fs.addFile('/Applications/UnrealGame.app/Contents/UE5');
        fs.addDirectory('/Users/macgamer/Library/Application Support/Epic/UnrealGame/Saved/SaveGames');
        fs.addFile('/Users/macgamer/Library/Application Support/Epic/UnrealGame/Saved/SaveGames/Save01.sav', 'data');

        const resolver = new SaveFolderResolver(fs);
        const result = await resolver.resolve('/Applications/UnrealGame.app/Contents/MacOS/UnrealGame-Mac-Shipping');

        assert.equal(result.engine, 'unreal');
        assert.equal(result.confidence, 'high');
        assert.equal(result.source, 'appdata');
        assert.equal(result.path, '/Users/macgamer/Library/Application Support/Epic/UnrealGame/Saved/SaveGames');
    });
});

test('Save Editor Drivers: unityMonoBin and renpy format contracts', async () => {
    const unityMonoBin = require('../dist/main/save-editor/formats/unity-mono-bin').default;
    const renpy = require('../dist/main/save-editor/formats/renpy').default;

    assert.equal(unityMonoBin.match('save.bin'), true);
    assert.equal(unityMonoBin.match('save.rpgsave'), false);
    assert.equal(renpy.match('1-LT1.save'), true);
    assert.equal(renpy.match('save.json'), false);
});

test('DefaultFileSystemProvider: path helper methods return strings', async () => {
    const { DefaultFileSystemProvider } = require('../dist/main/save-folder-resolver/fs-provider');
    const provider = new DefaultFileSystemProvider();

    assert.equal(typeof provider.getHomeDir(), 'string');
    assert.equal(typeof provider.getXdgConfigHome(), 'string');
    assert.equal(typeof provider.getXdgDataHome(), 'string');

    const prefixRoots = await provider.getWinePrefixRoots();
    assert.ok(Array.isArray(prefixRoots));

    const appDataPaths = await provider.getWineAppDataPaths('/non-existent-prefix', 'Roaming');
    assert.deepEqual(appDataPaths, []);
});
