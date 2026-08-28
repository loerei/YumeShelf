import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { YumeEngine, type GameEngineProfile } from '../dist/index.js';
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
});
