import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { YumeEngine, getExeStem, type GameEngineProfile } from '../dist/index.js';
import { MockFileSystemProvider } from './fixtures/mock-fs-provider.ts';

describe('Headless Save Resolvers (YumeEngine.resolveSaveDirectory)', () => {
  it('resolves user override path directly with high confidence and lists files', async () => {
    const fs = new MockFileSystemProvider();
    fs.mkdir('C:/CustomSaves/MyGame');
    fs.writeFile('C:/CustomSaves/MyGame/slot1.sav', 'save data');
    fs.writeFile('C:/CustomSaves/MyGame/slot2.sav', 'save data');

    const profile: GameEngineProfile = {
      tag: 'Others',
      family: 'unknown',
      arch: 'x64',
      runtime: 'native',
      saveStrategy: 'custom',
      detectedBy: 'manual',
    };

    const result = await YumeEngine.resolveSaveDirectory(
      profile,
      'C:/Games/MyGame/game.exe',
      fs,
      { saveFolderOverride: 'C:/CustomSaves/MyGame' }
    );

    assert.ok(result);
    assert.equal(result.path, 'C:/CustomSaves/MyGame');
    assert.equal(result.confidence, 'high');
    assert.equal(result.source, 'override');
    assert.deepEqual(result.files?.sort(), ['slot1.sav', 'slot2.sav']);
  });

  it('resolves RPG Maker MV/MZ www/save with .rpgsave files', async () => {
    const fs = new MockFileSystemProvider();
    fs.writeFile('C:/Games/RPGGame/www/js/main.js', '// main js');
    fs.writeFile('C:/Games/RPGGame/www/save/file1.rpgsave', 'rpg maker save');
    fs.writeFile('C:/Games/RPGGame/www/save/global.rpgsave', 'global config');

    const profile: GameEngineProfile = {
      tag: 'RPGM',
      family: 'rpg-maker',
      variant: 'mv',
      arch: 'x64',
      runtime: 'nwjs',
      saveStrategy: 'rpg-maker-mv-mz',
      detectedBy: 'rpg-maker-rule',
    };

    const result = await YumeEngine.resolveSaveDirectory(profile, 'C:/Games/RPGGame/Game.exe', fs);
    assert.ok(result);
    assert.equal(result.path, 'C:/Games/RPGGame/www/save');
    assert.equal(result.confidence, 'high');
    assert.equal(result.source, 'deterministic');
    assert.deepEqual(result.files?.sort(), ['file1.rpgsave', 'global.rpgsave']);
  });

  it('predicts RPG Maker MV unlaunched default path when save folder is not created yet', async () => {
    const fs = new MockFileSystemProvider();
    fs.mkdir('C:/Games/RPGGame/www');
    fs.writeFile('C:/Games/RPGGame/www/index.html', '<html></html>');

    const profile: GameEngineProfile = {
      tag: 'RPGM',
      family: 'rpg-maker',
      variant: 'mv',
      arch: 'x64',
      runtime: 'nwjs',
      saveStrategy: 'rpg-maker-mv-mz',
      detectedBy: 'rpg-maker-rule',
    };

    const result = await YumeEngine.resolveSaveDirectory(profile, 'C:/Games/RPGGame/Game.exe', fs);
    assert.ok(result);
    assert.equal(result.path, 'C:/Games/RPGGame/www/save');
    assert.equal(result.confidence, 'high');
    assert.equal(result.source, 'deterministic');
    assert.deepEqual(result.files, []);
  });

  it('resolves RPG Maker VX Ace Save directory with .rvdata2 files', async () => {
    const fs = new MockFileSystemProvider();
    fs.writeFile('C:/Games/VXAceGame/Save/Save01.rvdata2', 'binary save');
    fs.writeFile('C:/Games/VXAceGame/Save/Save02.rvdata2', 'binary save');

    const profile: GameEngineProfile = {
      tag: 'RPGM',
      family: 'rpg-maker',
      variant: 'vx-ace',
      arch: 'x86',
      runtime: 'native',
      saveStrategy: 'rpg-maker-rgss',
      detectedBy: 'rpg-maker-rgss-rule',
    };

    const result = await YumeEngine.resolveSaveDirectory(profile, 'C:/Games/VXAceGame/Game.exe', fs);
    assert.ok(result);
    assert.equal(result.path, 'C:/Games/VXAceGame/Save');
    assert.equal(result.confidence, 'high');
    assert.equal(result.source, 'deterministic');
    assert.deepEqual(result.files?.sort(), ['Save01.rvdata2', 'Save02.rvdata2']);
  });

  it('resolves RPG Maker XP with Save*.rxdata in root directory', async () => {
    const fs = new MockFileSystemProvider();
    fs.writeFile('C:/Games/XPGame/Save1.rxdata', 'xp save');
    fs.writeFile('C:/Games/XPGame/Game.rxproj', 'xp proj');

    const profile: GameEngineProfile = {
      tag: 'RPGM',
      family: 'rpg-maker',
      variant: 'xp',
      arch: 'x86',
      runtime: 'native',
      saveStrategy: 'rpg-maker-rgss',
      detectedBy: 'rpg-maker-rgss-rule',
    };

    const result = await YumeEngine.resolveSaveDirectory(profile, 'C:/Games/XPGame/Game.exe', fs);
    assert.ok(result);
    assert.equal(result.path, 'C:/Games/XPGame');
    assert.equal(result.confidence, 'high');
    assert.equal(result.source, 'deterministic');
    assert.deepEqual(result.files, ['Save1.rxdata']);
  });

  it('resolves RenPy save folder from Windows APPDATA', async () => {
    const fs = new MockFileSystemProvider({
      appDataPath: 'C:/Users/Sayu/AppData/Roaming',
    });
    fs.writeFile('C:/Games/VisualNovel/game/script.rpy', 'label start:');
    fs.writeFile('C:/Users/Sayu/AppData/Roaming/RenPy/VisualNovel-16890001/1-LT1.save', 'pickle save');
    fs.writeFile('C:/Users/Sayu/AppData/Roaming/RenPy/VisualNovel-16890001/persistent', 'persistent');

    const profile: GameEngineProfile = {
      tag: "Ren'Py",
      family: 'renpy',
      arch: 'x64',
      runtime: 'python',
      saveStrategy: 'renpy-pickle',
      detectedBy: 'renpy-rule',
    };

    const result = await YumeEngine.resolveSaveDirectory(profile, 'C:/Games/VisualNovel/VisualNovel.exe', fs);
    assert.ok(result);
    assert.equal(result.path, 'C:/Users/Sayu/AppData/Roaming/RenPy/VisualNovel-16890001');
    assert.equal(result.confidence, 'high');
    assert.equal(result.source, 'appdata');
    assert.deepEqual(result.files?.sort(), ['1-LT1.save', 'persistent']);
  });

  it('resolves RenPy save folder from Linux XDG / home directory', async () => {
    const fs = new MockFileSystemProvider({
      userProfilePath: '/home/gamer',
      xdgDataHome: '/home/gamer/.local/share',
      xdgConfigHome: '/home/gamer/.config',
    });
    fs.writeFile('/home/gamer/.local/share/renpy/Tsukihime-100200/auto-1.save', 'save');

    const profile: GameEngineProfile = {
      tag: "Ren'Py",
      family: 'renpy',
      arch: 'x64',
      runtime: 'python',
      saveStrategy: 'renpy-pickle',
      detectedBy: 'renpy-rule',
    };

    const result = await YumeEngine.resolveSaveDirectory(profile, '/home/gamer/Games/Tsukihime/Tsukihime.sh', fs);
    assert.ok(result);
    assert.equal(result.path, '/home/gamer/.local/share/renpy/Tsukihime-100200');
    assert.equal(result.confidence, 'high');
    assert.deepEqual(result.files, ['auto-1.save']);
  });

  it('resolves RenPy save folder inside Wine prefix', async () => {
    const fs = new MockFileSystemProvider({
      winePrefixRoots: ['/home/gamer/.wine/drive_c'],
      wineAppDataPaths: ['/home/gamer/.wine/drive_c/users/gamer/AppData/Roaming'],
    });
    fs.writeFile('/home/gamer/.wine/drive_c/users/gamer/AppData/Roaming/RenPy/FateStayNight-55555/quick-1.save', 'wine save');

    const profile: GameEngineProfile = {
      tag: "Ren'Py",
      family: 'renpy',
      arch: 'x86',
      runtime: 'python',
      saveStrategy: 'renpy-pickle',
      detectedBy: 'renpy-rule',
    };

    const result = await YumeEngine.resolveSaveDirectory(profile, 'C:/Games/FateStayNight/FateStayNight.exe', fs);
    assert.ok(result);
    assert.equal(result.path, '/home/gamer/.wine/drive_c/users/gamer/AppData/Roaming/RenPy/FateStayNight-55555');
    assert.equal(result.confidence, 'high');
    assert.equal(result.source, 'wine');
    assert.deepEqual(result.files, ['quick-1.save']);
  });

  it('resolves Unity save folder via app.info in Windows LocalLow', async () => {
    const fs = new MockFileSystemProvider({
      userProfilePath: 'C:/Users/Sayu',
    });
    fs.writeFile('C:/Games/UnityGame/UnityGame_Data/app.info', 'KogadoStudio\nSymphonicRain\n');
    fs.writeFile('C:/Users/Sayu/AppData/LocalLow/KogadoStudio/SymphonicRain/save.dat', 'unity binary');

    const profile: GameEngineProfile = {
      tag: 'Unity',
      family: 'unity',
      variant: 'mono',
      arch: 'x64',
      runtime: 'mono',
      saveStrategy: 'custom',
      detectedBy: 'unity-mono-rule',
    };

    const result = await YumeEngine.resolveSaveDirectory(profile, 'C:/Games/UnityGame/UnityGame.exe', fs);
    assert.ok(result);
    assert.equal(result.path, 'C:/Users/Sayu/AppData/LocalLow/KogadoStudio/SymphonicRain');
    assert.equal(result.confidence, 'high');
    assert.equal(result.source, 'appdata');
    assert.deepEqual(result.files, ['save.dat']);
  });

  it('resolves Unity save folder via Linux XDG ~/.config/unity3d', async () => {
    const fs = new MockFileSystemProvider({
      userProfilePath: '/home/sayu',
      xdgConfigHome: '/home/sayu/.config',
    });
    fs.writeFile('/home/sayu/Games/UnityGame/UnityGame_Data/app.info', 'IndieDev\nSpaceGame\n');
    fs.writeFile('/home/sayu/.config/unity3d/IndieDev/SpaceGame/save.json', '{"gold": 100}');

    const profile: GameEngineProfile = {
      tag: 'Unity',
      family: 'unity',
      variant: 'il2cpp',
      arch: 'x64',
      runtime: 'native',
      saveStrategy: 'custom',
      detectedBy: 'unity-il2cpp-rule',
    };

    const result = await YumeEngine.resolveSaveDirectory(profile, '/home/sayu/Games/UnityGame/SpaceGame.x86_64', fs);
    assert.ok(result);
    assert.equal(result.path, '/home/sayu/.config/unity3d/IndieDev/SpaceGame');
    assert.equal(result.confidence, 'high');
    assert.deepEqual(result.files, ['save.json']);
  });

  it('deepens Unity Naninovel save folder path to NaninovelData/NaniSaves', async () => {
    const fs = new MockFileSystemProvider();
    fs.mkdir('C:/Games/NaniGame/NaniGame_Data/StreamingAssets/NaninovelData/NaniSaves');
    fs.writeFile('C:/Games/NaniGame/NaniGame_Data/StreamingAssets/NaninovelData/NaniSaves/GameState.dat', 'naninovel save');

    const profile: GameEngineProfile = {
      tag: 'Unity',
      family: 'unity',
      variant: 'mono',
      arch: 'x64',
      runtime: 'mono',
      saveStrategy: 'custom',
      detectedBy: 'unity-mono-rule',
    };

    const result = await YumeEngine.resolveSaveDirectory(profile, 'C:/Games/NaniGame/NaniGame.exe', fs);
    assert.ok(result);
    assert.equal(result.path, 'C:/Games/NaniGame/NaniGame_Data/StreamingAssets/NaninovelData/NaniSaves');
    assert.equal(result.confidence, 'high');
    assert.deepEqual(result.files, ['GameState.dat']);
  });

  it('resolves Unreal Engine save folder from %LOCALAPPDATA%/<Project>/Saved/SaveGames', async () => {
    const fs = new MockFileSystemProvider({
      localAppDataPath: 'C:/Users/Sayu/AppData/Local',
    });
    fs.writeFile('C:/Users/Sayu/AppData/Local/CyberCity/Saved/SaveGames/Slot01.sav', 'ue4 save');

    const profile: GameEngineProfile = {
      tag: 'Unreal Engine',
      family: 'unreal',
      variant: 'ue4-ue5',
      arch: 'x64',
      runtime: 'native',
      saveStrategy: 'unreal-sav',
      detectedBy: 'unreal-rule',
    };

    const result = await YumeEngine.resolveSaveDirectory(profile, 'C:/Games/CyberCity/Binaries/Win64/CyberCity-Win64-Shipping.exe', fs);
    assert.ok(result);
    assert.equal(result.path, 'C:/Users/Sayu/AppData/Local/CyberCity/Saved/SaveGames');
    assert.equal(result.confidence, 'high');
    assert.equal(result.source, 'appdata');
    assert.deepEqual(result.files, ['Slot01.sav']);
  });

  it('resolves Godot Engine save folder from %APPDATA%/Godot/app_userdata/<Stem>', async () => {
    const fs = new MockFileSystemProvider({
      appDataPath: 'C:/Users/Sayu/AppData/Roaming',
    });
    fs.writeFile('C:/Users/Sayu/AppData/Roaming/Godot/app_userdata/GodotVenture/save.dat', 'godot data');

    const profile: GameEngineProfile = {
      tag: 'Godot',
      family: 'godot',
      arch: 'x64',
      runtime: 'native',
      saveStrategy: 'godot',
      detectedBy: 'godot-rule',
    };

    const result = await YumeEngine.resolveSaveDirectory(profile, 'C:/Games/GodotVenture/GodotVenture.exe', fs);
    assert.ok(result);
    assert.equal(result.path, 'C:/Users/Sayu/AppData/Roaming/Godot/app_userdata/GodotVenture');
    assert.equal(result.confidence, 'high');
    assert.equal(result.source, 'appdata');
    assert.deepEqual(result.files, ['save.dat']);
  });

  it('resolves Wolf RPG save folder in Save/ directory with .sav files', async () => {
    const fs = new MockFileSystemProvider();
    fs.writeFile('C:/Games/WolfGame/Save/Save01.sav', 'wolf save 1');
    fs.writeFile('C:/Games/WolfGame/Save/Save02.sav', 'wolf save 2');

    const profile: GameEngineProfile = {
      tag: 'Wolf RPG',
      family: 'wolf-rpg',
      arch: 'x86',
      runtime: 'native',
      saveStrategy: 'wolf-sav',
      detectedBy: 'wolf-rpg-rule',
    };

    const result = await YumeEngine.resolveSaveDirectory(profile, 'C:/Games/WolfGame/Game.exe', fs);
    assert.ok(result);
    assert.equal(result.path, 'C:/Games/WolfGame/Save');
    assert.equal(result.confidence, 'high');
    assert.equal(result.source, 'deterministic');
    assert.deepEqual(result.files?.sort(), ['Save01.sav', 'Save02.sav']);
  });

  it('resolves Flash save directory from Macromedia SharedObjects .sol files', async () => {
    const fs = new MockFileSystemProvider({
      appDataPath: 'C:/Users/Sayu/AppData/Roaming',
    });
    fs.writeFile('C:/Games/FlashGame/FlashGame.swf', 'swf content');
    fs.writeFile('C:/Users/Sayu/AppData/Roaming/Macromedia/Flash Player/#SharedObjects/ABC123/localhost/FlashGame/save.sol', 'sol binary');

    const profile: GameEngineProfile = {
      tag: 'Flash',
      family: 'flash',
      arch: 'x86',
      runtime: 'flash',
      saveStrategy: 'custom',
      detectedBy: 'flash-rule',
    };

    const result = await YumeEngine.resolveSaveDirectory(profile, 'C:/Games/FlashGame/FlashPlayer.exe', fs);
    assert.ok(result);
    assert.equal(result.path, 'C:/Users/Sayu/AppData/Roaming/Macromedia/Flash Player/#SharedObjects/ABC123/localhost/FlashGame');
    assert.equal(result.confidence, 'high');
    assert.deepEqual(result.files, ['save.sol']);
  });

  it('resolves TyranoBuilder save directory tyrano/savedata', async () => {
    const fs = new MockFileSystemProvider();
    fs.writeFile('C:/Games/TyranoVN/tyrano/savedata/data.sav', 'tyrano save data');

    const profile: GameEngineProfile = {
      tag: 'Others',
      family: 'tyranobuilder',
      arch: 'x86',
      runtime: 'nwjs',
      saveStrategy: 'custom',
      detectedBy: 'tyranobuilder-rule',
    };

    const result = await YumeEngine.resolveSaveDirectory(profile, 'C:/Games/TyranoVN/Game.exe', fs);
    assert.ok(result);
    assert.equal(result.path, 'C:/Games/TyranoVN/tyrano/savedata');
    assert.equal(result.confidence, 'high');
    assert.deepEqual(result.files, ['data.sav']);
  });

  it('resolves GameMaker save directory in LocalAppData', async () => {
    const fs = new MockFileSystemProvider({
      localAppDataPath: 'C:/Users/Sayu/AppData/Local',
    });
    fs.writeFile('C:/Users/Sayu/AppData/Local/Undertale_Game/save0', 'gm save');

    const profile: GameEngineProfile = {
      tag: 'Others',
      family: 'gamemaker',
      variant: 'studio',
      arch: 'x64',
      runtime: 'native',
      saveStrategy: 'gamemaker-appdata',
      detectedBy: 'gamemaker-rule',
    };

    const result = await YumeEngine.resolveSaveDirectory(profile, 'C:/Games/Undertale/Undertale_Game.exe', fs);
    assert.ok(result);
    assert.equal(result.path, 'C:/Users/Sayu/AppData/Local/Undertale_Game');
    assert.equal(result.confidence, 'high');
    assert.equal(result.source, 'deterministic');
  });

  it('ranks save candidates with active slot files over empty directories', async () => {
    const fs = new MockFileSystemProvider();
    // Portable save directory is empty
    fs.mkdir('C:/Games/RPGGame/save');
    // www/save has 3 actual save files
    fs.writeFile('C:/Games/RPGGame/www/save/file1.rpgsave', 'save 1');
    fs.writeFile('C:/Games/RPGGame/www/save/file2.rpgsave', 'save 2');
    fs.writeFile('C:/Games/RPGGame/www/save/file3.rpgsave', 'save 3');

    const profile: GameEngineProfile = {
      tag: 'RPGM',
      family: 'rpg-maker',
      variant: 'mz',
      arch: 'x64',
      runtime: 'nwjs',
      saveStrategy: 'rpg-maker-mv-mz',
      detectedBy: 'rpg-maker-rule',
    };

    const result = await YumeEngine.resolveSaveDirectory(profile, 'C:/Games/RPGGame/Game.exe', fs);
    assert.ok(result);
    assert.equal(result.path, 'C:/Games/RPGGame/www/save');
    assert.equal(result.files?.length, 3);
  });

  it('falls back to heuristic scan when engine deterministic path is not found', async () => {
    const fs = new MockFileSystemProvider();
    fs.writeFile('C:/Games/IndieCustom/savedata/slot1.sav', 'save data');

    const profile: GameEngineProfile = {
      tag: 'Others',
      family: 'unknown',
      arch: 'x64',
      runtime: 'native',
      saveStrategy: 'unknown',
      detectedBy: 'fallback',
    };

    const result = await YumeEngine.resolveSaveDirectory(profile, 'C:/Games/IndieCustom/Main.exe', fs);
    assert.ok(result);
    assert.equal(result.path, 'C:/Games/IndieCustom/savedata');
    assert.equal(result.source, 'heuristic');
    assert.equal(result.confidence, 'high');
    assert.deepEqual(result.files, ['slot1.sav']);
  });

  it('falls back to AppData fuzzy matching when heuristic scan finds nothing', async () => {
    const fs = new MockFileSystemProvider({
      userProfilePath: 'C:/Users/Sayu',
    });
    fs.writeFile('C:/Users/Sayu/AppData/LocalLow/CoolStudio/EpicAdventure/saved_game.dat', 'binary data');

    const profile: GameEngineProfile = {
      tag: 'Others',
      family: 'unknown',
      arch: 'x64',
      runtime: 'native',
      saveStrategy: 'unknown',
      detectedBy: 'fallback',
    };

    const result = await YumeEngine.resolveSaveDirectory(profile, 'C:/Games/EpicAdventure/EpicAdventure.exe', fs);
    assert.ok(result);
    assert.equal(result.path, 'C:/Users/Sayu/AppData/LocalLow/CoolStudio/EpicAdventure');
    assert.equal(result.source, 'appdata');
  });

  it('returns confidence none when no save directory or heuristic match exists', async () => {
    const fs = new MockFileSystemProvider();
    fs.writeFile('C:/Games/EmptyGame/Game.exe', 'mz binary');

    const profile: GameEngineProfile = {
      tag: 'Others',
      family: 'unknown',
      arch: 'x64',
      runtime: 'native',
      saveStrategy: 'unknown',
      detectedBy: 'fallback',
    };

    const result = await YumeEngine.resolveSaveDirectory(profile, 'C:/Games/EmptyGame/Game.exe', fs);
    assert.ok(result);
    assert.equal(result.path, null);
    assert.equal(result.confidence, 'none');
    assert.equal(result.source, 'none');
  });

  describe('getExeStem path utilities & bundle root integration', () => {
    it('derives stem from bundleRoot when provided, ignoring inner binary name', () => {
      assert.equal(
        getExeStem('/Applications/SuperGame.app/Contents/MacOS/SuperGame', '/Applications/SuperGame.app'),
        'SuperGame'
      );
      assert.equal(
        getExeStem('/Applications/SuperGame.app/Contents/MacOS/launcher', '/Applications/SuperGame.app'),
        'SuperGame'
      );
      assert.equal(
        getExeStem('C:/Games/VisualNovel.app/Contents/MacOS/main-shipping', 'C:/Games/VisualNovel.app'),
        'VisualNovel'
      );
    });

    it('normalizes trailing slashes on bundleRoot and exePath', () => {
      assert.equal(
        getExeStem('/Applications/SuperGame.app/Contents/MacOS/SuperGame', '/Applications/SuperGame.app/'),
        'SuperGame'
      );
      assert.equal(
        getExeStem('/Applications/SuperGame.app/Contents/MacOS/SuperGame', '/Applications/SuperGame.app///'),
        'SuperGame'
      );
      assert.equal(
        getExeStem('C:\\Games\\SuperGame.app\\\\', 'C:\\Games\\SuperGame.app\\\\'),
        'SuperGame'
      );
      assert.equal(
        getExeStem('/Applications/OuterGame.app/'),
        'OuterGame'
      );
      assert.equal(
        getExeStem('/Applications/OuterGame.app///'),
        'OuterGame'
      );
      assert.equal(
        getExeStem('/Games/MyGame/MyGame.exe/'),
        'MyGame'
      );
      assert.equal(
        getExeStem('C:\\Games\\MyGame\\MyGame.exe\\\\'),
        'MyGame'
      );
    });

    it('sanitizes null bytes and URL-encoded null bytes from stem', () => {
      assert.equal(
        getExeStem('/Applications/CleanGame\0.app', '/Applications/CleanGame\0.app'),
        'CleanGame'
      );
      assert.equal(
        getExeStem('/Applications/CleanGame%00.app', '/Applications/CleanGame%00.app'),
        'CleanGame'
      );
      assert.equal(
        getExeStem('/Games/My\0Game/game\0.exe'),
        'game'
      );
      assert.equal(
        getExeStem('/Games/Game%00.exe'),
        'Game'
      );
      assert.equal(
        getExeStem('Super%00Game\0 pc.exe'),
        'SuperGame'
      );
    });

    it('sanitizes path separators and traversal tokens (..) from stem', () => {
      assert.equal(
        getExeStem('/Applications/Super..Game.app', '/Applications/Super..Game.app'),
        'SuperGame'
      );
      assert.equal(
        getExeStem('../..\\..\\Evil..App.app'),
        'EvilApp'
      );
      assert.equal(
        getExeStem('..\\..\\SafeGame%00.exe'),
        'SafeGame'
      );
      assert.equal(
        getExeStem('/Applications/Nested....App.app', '/Applications/Nested....App.app'),
        'NestedApp'
      );
    });

    it('handles empty, whitespace, and null inputs gracefully', () => {
      assert.equal(getExeStem('', null), '');
      assert.equal(getExeStem('   ', undefined), '');
      assert.equal(getExeStem('', ''), '');
    });
  });

  describe('effectiveDir scoping for macOS .app bundles (resolveSaveDirectory)', () => {
    it('scopes effectiveDir to outer .app root for nested Contents/MacOS binary in deterministic resolution', async () => {
      const fs = new MockFileSystemProvider();
      fs.writeFile('/Applications/RPGMZGame.app/save/file1.rpgsave', 'save 1');
      fs.writeFile('/Applications/RPGMZGame.app/Contents/MacOS/Game', 'mach-o binary');

      const profile: GameEngineProfile = {
        tag: 'RPGM',
        family: 'rpg-maker',
        variant: 'mz',
        arch: 'arm64',
        runtime: 'nwjs',
        saveStrategy: 'rpg-maker-mv-mz',
        detectedBy: 'rpg-maker-rule',
      };

      // Pass inner executable path
      const result = await YumeEngine.resolveSaveDirectory(
        profile,
        '/Applications/RPGMZGame.app/Contents/MacOS/Game',
        fs
      );
      assert.ok(result);
      assert.equal(result.path, '/Applications/RPGMZGame.app/save');
      assert.equal(result.confidence, 'high');
      assert.equal(result.source, 'deterministic');
      assert.deepEqual(result.files, ['file1.rpgsave']);
    });

    it('scopes effectiveDir to outer .app root when passed outer .app bundle path', async () => {
      const fs = new MockFileSystemProvider();
      fs.writeFile('/Applications/RPGMVGame.app/www/save/file1.rpgsave', 'save 1');

      const profile: GameEngineProfile = {
        tag: 'RPGM',
        family: 'rpg-maker',
        variant: 'mv',
        arch: 'x64',
        runtime: 'nwjs',
        saveStrategy: 'rpg-maker-mv-mz',
        detectedBy: 'rpg-maker-rule',
      };

      const result = await YumeEngine.resolveSaveDirectory(
        profile,
        '/Applications/RPGMVGame.app',
        fs
      );
      assert.ok(result);
      assert.equal(result.path, '/Applications/RPGMVGame.app/www/save');
      assert.equal(result.confidence, 'high');
      assert.equal(result.source, 'deterministic');
    });

    it('scopes effectiveDir to outer .app root for heuristic scan with inner binary path', async () => {
      const fs = new MockFileSystemProvider();
      fs.writeFile('/Applications/IndieGame.app/savedata/slot1.sav', 'heuristic save');
      fs.writeFile('/Applications/IndieGame.app/Contents/MacOS/launcher', 'binary');

      const profile: GameEngineProfile = {
        tag: 'Others',
        family: 'unknown',
        arch: 'arm64',
        runtime: 'native',
        saveStrategy: 'unknown',
        detectedBy: 'fallback',
      };

      const result = await YumeEngine.resolveSaveDirectory(
        profile,
        '/Applications/IndieGame.app/Contents/MacOS/launcher',
        fs
      );
      assert.ok(result);
      assert.equal(result.path, '/Applications/IndieGame.app/savedata');
      assert.equal(result.source, 'heuristic');
      assert.equal(result.confidence, 'high');
      assert.deepEqual(result.files, ['slot1.sav']);
    });

    it('derives bundle stem for AppData / XDG RenPy resolution from nested executable with generic binary name', async () => {
      const fs = new MockFileSystemProvider({
        userProfilePath: '/home/gamer',
        xdgDataHome: '/home/gamer/.local/share',
      });
      // The save folder uses the .app bundle stem ("Tsukihime"), not the inner binary name ("runner")
      fs.writeFile('/home/gamer/.local/share/renpy/Tsukihime-100200/auto-1.save', 'save');
      fs.writeFile('/Applications/Tsukihime.app/Contents/MacOS/runner', 'binary');

      const profile: GameEngineProfile = {
        tag: "Ren'Py",
        family: 'renpy',
        arch: 'arm64',
        runtime: 'python',
        saveStrategy: 'renpy-pickle',
        detectedBy: 'renpy-rule',
      };

      const result = await YumeEngine.resolveSaveDirectory(
        profile,
        '/Applications/Tsukihime.app/Contents/MacOS/runner',
        fs
      );
      assert.ok(result);
      assert.equal(result.path, '/home/gamer/.local/share/renpy/Tsukihime-100200');
      assert.equal(result.confidence, 'high');
      assert.deepEqual(result.files, ['auto-1.save']);
    });
  });

describe('macOS Application Support save resolvers (Ticket 02.2.1.2.1)', () => {
  it('resolves RenPy save folder from ~/Library/Application Support/RenPy/<stem> on macOS', async () => {
    const fs = new MockFileSystemProvider({
      macApplicationSupportHome: '/Users/MacUser/Library/Application Support',
      macPreferencesHome: '/Users/MacUser/Library/Preferences',
    });
    fs.writeFile(
      '/Users/MacUser/Library/Application Support/RenPy/Clannad-123456/1-LT1.save',
      'renpy save data'
    );

    const profile: GameEngineProfile = {
      tag: "Ren'Py",
      family: 'renpy',
      arch: 'arm64',
      runtime: 'python',
      saveStrategy: 'renpy-appsupport-saves',
      detectedBy: 'renpy-rule',
    };

    const result = await YumeEngine.resolveSaveDirectory(
      profile,
      '/Applications/Clannad.app/Contents/MacOS/Clannad',
      fs
    );
    assert.ok(result);
    assert.equal(result.path, '/Users/MacUser/Library/Application Support/RenPy/Clannad-123456');
    assert.equal(result.confidence, 'high');
    assert.deepEqual(result.files, ['1-LT1.save']);
  });

  it('resolves RenPy save folder from ~/Library/RenPy/<stem> on macOS', async () => {
    const fs = new MockFileSystemProvider({
      macApplicationSupportHome: '/Users/MacUser/Library/Application Support',
      macPreferencesHome: '/Users/MacUser/Library/Preferences',
    });
    fs.writeFile(
      '/Users/MacUser/Library/RenPy/Kanon-654321/1-LT1.save',
      'renpy save data'
    );

    const profile: GameEngineProfile = {
      tag: "Ren'Py",
      family: 'renpy',
      arch: 'arm64',
      runtime: 'python',
      saveStrategy: 'renpy-pickle',
      detectedBy: 'renpy-rule',
    };

    const result = await YumeEngine.resolveSaveDirectory(
      profile,
      '/Applications/Kanon.app/Contents/MacOS/Kanon',
      fs
    );
    assert.ok(result);
    assert.equal(result.path, '/Users/MacUser/Library/RenPy/Kanon-654321');
    assert.equal(result.confidence, 'high');
    assert.deepEqual(result.files, ['1-LT1.save']);
  });

  it('resolves Godot Engine save folder from ~/Library/Application Support/Godot/app_userdata/<stem> on macOS', async () => {
    const fs = new MockFileSystemProvider({
      macApplicationSupportHome: '/Users/MacUser/Library/Application Support',
      macPreferencesHome: '/Users/MacUser/Library/Preferences',
    });
    fs.writeFile(
      '/Users/MacUser/Library/Application Support/Godot/app_userdata/Brotato/save.dat',
      'godot data'
    );

    const profile: GameEngineProfile = {
      tag: 'Godot',
      family: 'godot',
      arch: 'arm64',
      runtime: 'native',
      saveStrategy: 'godot-appsupport-user',
      detectedBy: 'godot-rule',
    };

    const result = await YumeEngine.resolveSaveDirectory(
      profile,
      '/Applications/Brotato.app/Contents/MacOS/Brotato',
      fs
    );
    assert.ok(result);
    assert.equal(result.path, '/Users/MacUser/Library/Application Support/Godot/app_userdata/Brotato');
    assert.equal(result.confidence, 'high');
    assert.deepEqual(result.files, ['save.dat']);
  });

  it('resolves Unreal Engine save folder from ~/Library/Application Support/Epic/<stem>/Saved/SaveGames on macOS', async () => {
    const fs = new MockFileSystemProvider({
      macApplicationSupportHome: '/Users/MacUser/Library/Application Support',
      macPreferencesHome: '/Users/MacUser/Library/Preferences',
    });
    fs.writeFile(
      '/Users/MacUser/Library/Application Support/Epic/Solaris/Saved/SaveGames/Slot01.sav',
      'unreal save'
    );

    const profile: GameEngineProfile = {
      tag: 'Unreal Engine',
      family: 'unreal',
      variant: 'ue4-ue5',
      arch: 'arm64',
      runtime: 'native',
      saveStrategy: 'unreal-sav',
      detectedBy: 'unreal-rule',
    };

    const result = await YumeEngine.resolveSaveDirectory(
      profile,
      '/Applications/Solaris.app/Contents/MacOS/Solaris',
      fs
    );
    assert.ok(result);
    assert.equal(
      result.path,
      '/Users/MacUser/Library/Application Support/Epic/Solaris/Saved/SaveGames'
    );
    assert.equal(result.confidence, 'high');
    assert.deepEqual(result.files, ['Slot01.sav']);
  });

  it('resolves Unity save folder from ~/Library/Application Support/<company>/<product> on macOS', async () => {
    const fs = new MockFileSystemProvider({
      macApplicationSupportHome: '/Users/MacUser/Library/Application Support',
      macPreferencesHome: '/Users/MacUser/Library/Preferences',
    });
    fs.writeFile(
      '/Games/UnityGame/UnityGame_Data/app.info',
      'MyStudio\r\nCoolGame\r\n'
    );
    fs.writeFile(
      '/Users/MacUser/Library/Application Support/MyStudio/CoolGame/save.dat',
      'unity save'
    );

    const profile: GameEngineProfile = {
      tag: 'Unity',
      family: 'unity',
      arch: 'arm64',
      runtime: 'native',
      saveStrategy: 'unity-appsupport-playerprefs',
      detectedBy: 'unity-rule',
    };

    const result = await YumeEngine.resolveSaveDirectory(
      profile,
      '/Games/UnityGame/UnityGame.exe',
      fs
    );
    assert.ok(result);
    assert.equal(
      result.path,
      '/Users/MacUser/Library/Application Support/MyStudio/CoolGame'
    );
    assert.equal(result.confidence, 'high');
  });

  it('resolves Unity save folder from ~/Library/Application Support/unity.<company>.<product> on macOS', async () => {
    const fs = new MockFileSystemProvider({
      macApplicationSupportHome: '/Users/MacUser/Library/Application Support',
      macPreferencesHome: '/Users/MacUser/Library/Preferences',
    });
    fs.writeFile(
      '/Games/UnityGame2/UnityGame2_Data/app.info',
      'IndieDev\nSpaceGame\n'
    );
    fs.writeFile(
      '/Users/MacUser/Library/Application Support/unity.IndieDev.SpaceGame/player.dat',
      'unity save'
    );

    const profile: GameEngineProfile = {
      tag: 'Unity',
      family: 'unity',
      arch: 'arm64',
      runtime: 'native',
      saveStrategy: 'unity-appsupport-playerprefs',
      detectedBy: 'unity-rule',
    };

    const result = await YumeEngine.resolveSaveDirectory(
      profile,
      '/Games/UnityGame2/UnityGame2.exe',
      fs
    );
    assert.ok(result);
    assert.equal(
      result.path,
      '/Users/MacUser/Library/Application Support/unity.IndieDev.SpaceGame'
    );
    assert.equal(result.confidence, 'high');
  });

  it('rejects empty or sanitized zero-length company and product names in app.info', async () => {
    const fs = new MockFileSystemProvider({
      macApplicationSupportHome: '/Users/MacUser/Library/Application Support',
    });
    fs.writeFile(
      '/Games/CorruptGame/CorruptGame_Data/app.info',
      '..\r\n   %00..  \r\n'
    );

    const profile: GameEngineProfile = {
      tag: 'Unity',
      family: 'unity',
      arch: 'arm64',
      runtime: 'native',
      saveStrategy: 'custom',
      detectedBy: 'unity-rule',
    };

    const result = await YumeEngine.resolveSaveDirectory(
      profile,
      '/Games/CorruptGame/CorruptGame.exe',
      fs
    );
    // Must not resolve to root Application Support or invalid path
    assert.notEqual(result?.path, '/Users/MacUser/Library/Application Support');
    assert.equal(result?.confidence, 'none');
  });

  it('guards against root collapse: resolved paths cannot equal appSupportHome or preferencesHome directly', async () => {
    const fs = new MockFileSystemProvider({
      macApplicationSupportHome: '/Users/MacUser/Library/Application Support',
      macPreferencesHome: '/Users/MacUser/Library/Preferences',
    });

    const profile: GameEngineProfile = {
      tag: 'Godot',
      family: 'godot',
      arch: 'arm64',
      runtime: 'native',
      saveStrategy: 'godot-appsupport-user',
      detectedBy: 'godot-rule',
    };

    // Traversal stem attempting to reach appSupportHome or preferencesHome
    const result = await YumeEngine.resolveSaveDirectory(
      profile,
      '/Applications/../../Library/Application Support.app',
      fs
    );
    assert.notEqual(result?.path, '/Users/MacUser/Library/Application Support');
    assert.notEqual(result?.path, '/Users/MacUser/Library/Preferences');
  });
});

describe('macOS In-Bundle & WebStorage save resolvers (Ticket 02.2.1.2.2)', () => {
  it('resolves Unity save folder from Contents/Resources/Data/app.info inside macOS .app bundle', async () => {
    const fs = new MockFileSystemProvider({
      macApplicationSupportHome: '/Users/MacUser/Library/Application Support',
      macPreferencesHome: '/Users/MacUser/Library/Preferences',
    });
    fs.writeFile(
      '/Applications/UnityMacGame.app/Contents/Resources/Data/app.info',
      'AwesomeCorp\r\nSuperGame\r\n'
    );
    fs.writeFile(
      '/Users/MacUser/Library/Application Support/AwesomeCorp/SuperGame/playerprefs.dat',
      'save data'
    );

    const profile: GameEngineProfile = {
      tag: 'Unity',
      family: 'unity',
      arch: 'arm64',
      runtime: 'native',
      saveStrategy: 'unity-appsupport-playerprefs',
      detectedBy: 'macOS App Bundle (Unity)',
    };

    const result = await YumeEngine.resolveSaveDirectory(
      profile,
      '/Applications/UnityMacGame.app/Contents/MacOS/UnityMacGame',
      fs
    );
    assert.ok(result);
    assert.equal(
      result.path,
      '/Users/MacUser/Library/Application Support/AwesomeCorp/SuperGame'
    );
    assert.equal(result.confidence, 'high');
    assert.equal(result.source, 'appdata');
  });

  it('resolves RPG Maker MV/MZ in-bundle Contents/Resources/app.nw/save/ directory', async () => {
    const fs = new MockFileSystemProvider();
    fs.writeFile(
      '/Applications/RPGMZGame.app/Contents/Resources/app.nw/save/file1.rmmzsave',
      'rmmz save'
    );
    fs.writeFile(
      '/Applications/RPGMZGame.app/Contents/Resources/app.nw/save/global.rmmzsave',
      'rmmz global'
    );

    const profile: GameEngineProfile = {
      tag: 'RPGM',
      family: 'rpg-maker',
      variant: 'mz',
      arch: 'arm64',
      runtime: 'nwjs',
      saveStrategy: 'rpgmaker-bundle-data',
      detectedBy: 'macOS App Bundle (RPG Maker)',
    };

    const result = await YumeEngine.resolveSaveDirectory(
      profile,
      '/Applications/RPGMZGame.app/Contents/MacOS/Game',
      fs
    );
    assert.ok(result);
    assert.equal(
      result.path,
      '/Applications/RPGMZGame.app/Contents/Resources/app.nw/save'
    );
    assert.equal(result.confidence, 'high');
    assert.equal(result.source, 'deterministic');
    assert.deepEqual(result.files?.sort(), ['file1.rmmzsave', 'global.rmmzsave']);
  });

  it('resolves RPG Maker MV/MZ in-bundle Contents/Resources/app.nw/www/save/ and Contents/Resources/save/', async () => {
    const fs = new MockFileSystemProvider();
    fs.writeFile(
      '/Applications/RPGMVGame.app/Contents/Resources/app.nw/www/save/file1.rpgsave',
      'rpgsave file'
    );

    const profile: GameEngineProfile = {
      tag: 'RPGM',
      family: 'rpg-maker',
      variant: 'mv',
      arch: 'x64',
      runtime: 'nwjs',
      saveStrategy: 'rpgmaker-bundle-data',
      detectedBy: 'macOS App Bundle (RPG Maker)',
    };

    const result = await YumeEngine.resolveSaveDirectory(
      profile,
      '/Applications/RPGMVGame.app/Contents/MacOS/Game',
      fs
    );
    assert.ok(result);
    assert.equal(
      result.path,
      '/Applications/RPGMVGame.app/Contents/Resources/app.nw/www/save'
    );
    assert.equal(result.confidence, 'high');
  });

  it('resolves RPG Maker MV/MZ WebStorage LocalStorage save directory in ~/Library/Application Support/<name>/Default/Local Storage/leveldb', async () => {
    const fs = new MockFileSystemProvider({
      macApplicationSupportHome: '/Users/MacUser/Library/Application Support',
      macPreferencesHome: '/Users/MacUser/Library/Preferences',
    });
    fs.writeFile(
      '/Applications/WebRPG.app/Contents/Resources/app.nw/package.json',
      JSON.stringify({ name: 'WebRPGGame', main: 'index.html' })
    );
    fs.writeFile(
      '/Users/MacUser/Library/Application Support/WebRPGGame/Default/Local Storage/leveldb/000003.log',
      'leveldb log data'
    );
    fs.writeFile(
      '/Users/MacUser/Library/Application Support/WebRPGGame/Default/Local Storage/leveldb/CURRENT',
      'CURRENT'
    );

    const profile: GameEngineProfile = {
      tag: 'RPGM',
      family: 'rpg-maker',
      variant: 'mz',
      arch: 'arm64',
      runtime: 'nwjs',
      saveStrategy: 'rpgmaker-bundle-data',
      detectedBy: 'macOS App Bundle (RPG Maker)',
    };

    const result = await YumeEngine.resolveSaveDirectory(
      profile,
      '/Applications/WebRPG.app/Contents/MacOS/Game',
      fs
    );
    assert.ok(result);
    assert.equal(
      result.path,
      '/Users/MacUser/Library/Application Support/WebRPGGame/Default/Local Storage/leveldb'
    );
    assert.equal(result.confidence, 'high');
    assert.equal(result.source, 'appdata');
  });

  it('sanitizes malicious traversal names in package.json and enforces containment within Application Support', async () => {
    const fs = new MockFileSystemProvider({
      macApplicationSupportHome: '/Users/MacUser/Library/Application Support',
      macPreferencesHome: '/Users/MacUser/Library/Preferences',
    });
    fs.writeFile(
      '/Applications/EvilGame.app/Contents/Resources/app.nw/package.json',
      JSON.stringify({ name: '../../../../../../System/Library' })
    );

    const profile: GameEngineProfile = {
      tag: 'RPGM',
      family: 'rpg-maker',
      variant: 'mv',
      arch: 'arm64',
      runtime: 'nwjs',
      saveStrategy: 'rpgmaker-bundle-data',
      detectedBy: 'macOS App Bundle (RPG Maker)',
    };

    const result = await YumeEngine.resolveSaveDirectory(
      profile,
      '/Applications/EvilGame.app/Contents/MacOS/Game',
      fs
    );
    // Must not escape Application Support
    if (result?.path) {
      assert.ok(
        result.path.startsWith('/Applications/EvilGame.app') ||
        result.path.startsWith('/Users/MacUser/Library/Application Support/SystemLibrary')
      );
      assert.notEqual(result.path, '/System/Library');
      assert.notEqual(result.path, '/Users/MacUser/Library/Application Support');
    }
  });

  it('rejects empty or sanitized zero-length package.json name tokens', async () => {
    const fs = new MockFileSystemProvider({
      macApplicationSupportHome: '/Users/MacUser/Library/Application Support',
      macPreferencesHome: '/Users/MacUser/Library/Preferences',
    });
    fs.writeFile(
      '/Applications/EmptyNameGame.app/Contents/Resources/app.nw/package.json',
      JSON.stringify({ name: '..%00/\\..' })
    );

    const profile: GameEngineProfile = {
      tag: 'RPGM',
      family: 'rpg-maker',
      variant: 'mv',
      arch: 'arm64',
      runtime: 'nwjs',
      saveStrategy: 'rpgmaker-bundle-data',
      detectedBy: 'macOS App Bundle (RPG Maker)',
    };

    const result = await YumeEngine.resolveSaveDirectory(
      profile,
      '/Applications/EmptyNameGame.app/Contents/MacOS/Game',
      fs
    );
    // Must fall back to in-bundle path and not resolve to root Application Support
    assert.notEqual(result?.path, '/Users/MacUser/Library/Application Support');
    if (result?.path) {
      assert.ok(result.path.startsWith('/Applications/EmptyNameGame.app'));
    }
  });

  it('resolves TyranoBuilder in-bundle and WebStorage saves on macOS', async () => {
    const fs = new MockFileSystemProvider({
      macApplicationSupportHome: '/Users/MacUser/Library/Application Support',
    });
    fs.writeFile(
      '/Applications/TyranoMac.app/Contents/Resources/app.nw/tyrano/savedata/data.sav',
      'tyrano save'
    );

    const profile: GameEngineProfile = {
      tag: 'Others',
      family: 'tyranobuilder',
      arch: 'arm64',
      runtime: 'nwjs',
      saveStrategy: 'custom',
      detectedBy: 'tyranobuilder-rule',
    };

    const result = await YumeEngine.resolveSaveDirectory(
      profile,
      '/Applications/TyranoMac.app/Contents/MacOS/Game',
      fs
    );
    assert.ok(result);
    assert.equal(
      result.path,
      '/Applications/TyranoMac.app/Contents/Resources/app.nw/tyrano/savedata'
    );
    assert.equal(result.confidence, 'high');
  });
});
});
