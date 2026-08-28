/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EngineRuleRegistry,
  PEInspector,
  RPGMakerRule,
  RenpyRule,
  WolfRPGRule,
  TyranoBuilderRule,
} from '../dist/index.js';
import { SyntheticPEBuilder } from './fixtures/synthetic-pe-builder.ts';
import { MockFileSystemProvider } from './fixtures/mock-fs-provider.ts';

test('RPG Maker MV / MZ Rules: NW.js container and JavaScript / JSON markers', async () => {
  const registry = new EngineRuleRegistry();

  // 1. RPG Maker MZ via rmmz_core.js marker
  const peMz = new SyntheticPEBuilder({ arch: 'x64' })
    .setVersionInfo({ OriginalFilename: 'nw.exe', ProductName: 'RPG Maker MZ Game' })
    .build();
  const inspMz = PEInspector.fromBuffer(peMz);
  const profileMz = await registry.resolve(
    inspMz,
    'C:/Games/MZGame/Game.exe',
    ['Game.exe', 'nw.dll', 'package.json', 'rmmz_core.js', 'main.js']
  );

  assert.strictEqual(profileMz.tag, 'RPGM');
  assert.strictEqual(profileMz.family, 'rpg-maker');
  assert.strictEqual(profileMz.variant, 'mz');
  assert.strictEqual(profileMz.arch, 'x64');
  assert.strictEqual(profileMz.runtime, 'nwjs');
  assert.strictEqual(profileMz.saveStrategy, 'rpg-maker-mv-mz');

  // 2. RPG Maker MV via rpg_core.js marker
  const peMv = new SyntheticPEBuilder({ arch: 'x86' })
    .setVersionInfo({ OriginalFilename: 'nw.exe', ProductName: 'RPG Maker MV Game' })
    .build();
  const inspMv = PEInspector.fromBuffer(peMv);
  const profileMv = await registry.resolve(
    inspMv,
    'C:/Games/MVGame/Game.exe',
    ['Game.exe', 'nw.dll', 'package.json', 'rpg_core.js', 'www']
  );

  assert.strictEqual(profileMv.tag, 'RPGM');
  assert.strictEqual(profileMv.family, 'rpg-maker');
  assert.strictEqual(profileMv.variant, 'mv');
  assert.strictEqual(profileMv.arch, 'x86');
  assert.strictEqual(profileMv.runtime, 'nwjs');
  assert.strictEqual(profileMv.saveStrategy, 'rpg-maker-mv-mz');

  // 3. Subdirectory markers via MockFileSystemProvider (data/System.json and www/data/System.json)
  const mockFs = new MockFileSystemProvider();
  mockFs.writeFile('C:/Games/NestedMZ/data/System.json', '{"gameTitle":"Nested MZ"}');
  mockFs.writeFile('C:/Games/NestedMZ/main.js', '// mz main');

  const peClean = new SyntheticPEBuilder({ arch: 'x64' })
    .setVersionInfo({ OriginalFilename: 'nw.exe' })
    .build();
  const inspClean = PEInspector.fromBuffer(peClean);

  const profileNestedMz = await registry.resolve(
    inspClean,
    'C:/Games/NestedMZ/Game.exe',
    ['Game.exe', 'nw.dll', 'package.json', 'data', 'main.js'],
    mockFs
  );
  assert.strictEqual(profileNestedMz.tag, 'RPGM');
  assert.strictEqual(profileNestedMz.variant, 'mz');

  // 4. MV with www/data/System.json
  const mockFsMv = new MockFileSystemProvider();
  mockFsMv.writeFile('C:/Games/NestedMV/www/data/System.json', '{"gameTitle":"Nested MV"}');
  mockFsMv.writeFile('C:/Games/NestedMV/www/js/rpg_core.js', '// mv core');

  const profileNestedMv = await registry.resolve(
    inspClean,
    'C:/Games/NestedMV/Game.exe',
    ['Game.exe', 'nw.dll', 'package.json', 'www'],
    mockFsMv
  );
  assert.strictEqual(profileNestedMv.tag, 'RPGM');
  assert.strictEqual(profileNestedMv.variant, 'mv');

  // 5. NW.js container WITHOUT RPG Maker markers should NOT classify as RPG Maker
  const profileGenericNw = await registry.resolve(
    inspClean,
    'C:/Games/GenericApp/App.exe',
    ['App.exe', 'nw.dll', 'package.json', 'index.html']
  );
  assert.notStrictEqual(profileGenericNw.tag, 'RPGM');
  assert.notStrictEqual(profileGenericNw.family, 'rpg-maker');
});

test('RPG Maker RGSS Rules: VX Ace, VX, XP and RGSS Archive Magic', async () => {
  const registry = new EngineRuleRegistry();

  // 1. RPG Maker VX Ace via RGSS301.dll import
  const peVxAce = new SyntheticPEBuilder({ arch: 'x86' })
    .addImport('RGSS301.dll', ['RGSSSetConsoleTitle'])
    .build();
  const inspVxAce = PEInspector.fromBuffer(peVxAce);
  const profileVxAce = await registry.resolve(
    inspVxAce,
    'C:/Games/VXAceGame/Game.exe',
    ['Game.exe', 'RGSS301.dll', 'Game.ini']
  );

  assert.strictEqual(profileVxAce.tag, 'RPGM');
  assert.strictEqual(profileVxAce.family, 'rpg-maker');
  assert.strictEqual(profileVxAce.variant, 'vx-ace');
  assert.strictEqual(profileVxAce.runtime, 'native');
  assert.strictEqual(profileVxAce.saveStrategy, 'rpg-maker-rgss');

  // 2. RPG Maker VX Ace via RGSS3 archive magic (RGSSAD\0\x03)
  const mockFsAce = new MockFileSystemProvider();
  const rgss3Magic = Buffer.from([0x52, 0x47, 0x53, 0x53, 0x41, 0x44, 0x00, 0x03]); // "RGSSAD\0\x03"
  mockFsAce.writeFile('C:/Games/VXAceArchive/Game.rgss3a', rgss3Magic);

  const peGeneric = new SyntheticPEBuilder({ arch: 'x86' }).build();
  const inspGeneric = PEInspector.fromBuffer(peGeneric);

  const profileArchiveAce = await registry.resolve(
    inspGeneric,
    'C:/Games/VXAceArchive/Game.exe',
    ['Game.exe', 'Game.rgss3a'],
    mockFsAce
  );
  assert.strictEqual(profileArchiveAce.tag, 'RPGM');
  assert.strictEqual(profileArchiveAce.variant, 'vx-ace');

  // 3. RPG Maker VX via RGSS202E.dll import & .rvdata
  const peVx = new SyntheticPEBuilder({ arch: 'x86' })
    .addImport('RGSS202E.dll', ['RGSSSetConsoleTitle'])
    .build();
  const inspVx = PEInspector.fromBuffer(peVx);
  const profileVx = await registry.resolve(
    inspVx,
    'C:/Games/VXGame/Game.exe',
    ['Game.exe', 'RGSS202E.dll', 'Game.rvdata']
  );

  assert.strictEqual(profileVx.tag, 'RPGM');
  assert.strictEqual(profileVx.family, 'rpg-maker');
  assert.strictEqual(profileVx.variant, 'vx');
  assert.strictEqual(profileVx.saveStrategy, 'rpg-maker-rgss');

  // 4. RPG Maker VX via RGSS2 archive magic (RGSSAD\0\x02)
  const mockFsVx = new MockFileSystemProvider();
  const rgss2Magic = Buffer.from([0x52, 0x47, 0x53, 0x53, 0x41, 0x44, 0x00, 0x02]);
  mockFsVx.writeFile('C:/Games/VXArchive/Game.rgss2a', rgss2Magic);

  const profileArchiveVx = await registry.resolve(
    inspGeneric,
    'C:/Games/VXArchive/Game.exe',
    ['Game.exe', 'Game.rgss2a'],
    mockFsVx
  );
  assert.strictEqual(profileArchiveVx.tag, 'RPGM');
  assert.strictEqual(profileArchiveVx.variant, 'vx');

  // 5. RPG Maker XP via RGSS104E.dll import & .rxdata
  const peXp = new SyntheticPEBuilder({ arch: 'x86' })
    .addImport('RGSS104E.dll', ['RGSSSetConsoleTitle'])
    .build();
  const inspXp = PEInspector.fromBuffer(peXp);
  const profileXp = await registry.resolve(
    inspXp,
    'C:/Games/XPGame/Game.exe',
    ['Game.exe', 'RGSS104E.dll', 'Game.rxdata']
  );

  assert.strictEqual(profileXp.tag, 'RPGM');
  assert.strictEqual(profileXp.family, 'rpg-maker');
  assert.strictEqual(profileXp.variant, 'xp');
  assert.strictEqual(profileXp.saveStrategy, 'rpg-maker-rgss');

  // 6. RPG Maker XP via RGSS1 archive magic (RGSSAD\0\x01)
  const mockFsXp = new MockFileSystemProvider();
  const rgss1Magic = Buffer.from([0x52, 0x47, 0x53, 0x53, 0x41, 0x44, 0x00, 0x01]);
  mockFsXp.writeFile('C:/Games/XPArchive/Game.rgssad', rgss1Magic);

  const profileArchiveXp = await registry.resolve(
    inspGeneric,
    'C:/Games/XPArchive/Game.exe',
    ['Game.exe', 'Game.rgssad'],
    mockFsXp
  );
  assert.strictEqual(profileArchiveXp.tag, 'RPGM');
  assert.strictEqual(profileArchiveXp.variant, 'xp');

  // 7. Subdirectory data/ check (e.g. data/Game.rvdata2)
  const mockFsSub = new MockFileSystemProvider();
  mockFsSub.writeFile('C:/Games/SubGame/data/System.rvdata2', 'data');

  const profileSub = await registry.resolve(
    inspGeneric,
    'C:/Games/SubGame/Game.exe',
    ['Game.exe', 'data'],
    mockFsSub
  );
  assert.strictEqual(profileSub.tag, 'RPGM');
  assert.strictEqual(profileSub.variant, 'vx-ace');
});

test('RPG Maker 2000/2003 Rules: RPG_RT executable and version info', async () => {
  const registry = new EngineRuleRegistry();

  // 1. RPG_RT VersionInfo
  const peRpgRt = new SyntheticPEBuilder({ arch: 'x86' })
    .setVersionInfo({ InternalName: 'RPG_RT', FileDescription: 'RPG2000 Runtime' })
    .build();
  const inspRpgRt = PEInspector.fromBuffer(peRpgRt);
  const profileRpgRt = await registry.resolve(
    inspRpgRt,
    'C:/Games/2000Game/RPG_RT.exe',
    ['RPG_RT.exe', 'RPG_RT.ldb', 'RPG_RT.ini']
  );

  assert.strictEqual(profileRpgRt.tag, 'RPGM');
  assert.strictEqual(profileRpgRt.family, 'rpg-maker');
  assert.strictEqual(profileRpgRt.variant, '2000-2003');
  assert.strictEqual(profileRpgRt.runtime, 'native');
  assert.strictEqual(profileRpgRt.saveStrategy, 'rpg-maker-rgss');

  // 2. RPG_RT files without VersionInfo
  const peClean = new SyntheticPEBuilder({ arch: 'x86' }).build();
  const inspClean = PEInspector.fromBuffer(peClean);
  const profileFiles = await registry.resolve(
    inspClean,
    'C:/Games/2003Game/Game.exe',
    ['Game.exe', 'RPG_RT.ldb', 'RPG_RT.ini', 'harmony.dll']
  );

  assert.strictEqual(profileFiles.tag, 'RPGM');
  assert.strictEqual(profileFiles.variant, '2000-2003');
});

test('RPG Bakin & SMILE GAME BUILDER Rules: bakinengine.dll, data.rbpack, and data.sbpack', async () => {
  const registry = new EngineRuleRegistry();

  // 1. RPG Bakin via bakinengine.dll import and data.rbpack
  const peBakin = new SyntheticPEBuilder({ arch: 'x64' })
    .addImport('bakinengine.dll', ['InitBakin'])
    .build();
  const inspBakin = PEInspector.fromBuffer(peBakin);
  const profileBakin = await registry.resolve(
    inspBakin,
    'C:/Games/BakinGame/Game.exe',
    ['Game.exe', 'bakinengine.dll', 'data.rbpack']
  );

  assert.strictEqual(profileBakin.tag, 'RPGM');
  assert.strictEqual(profileBakin.family, 'rpg-maker');
  assert.strictEqual(profileBakin.variant, 'bakin');
  assert.strictEqual(profileBakin.arch, 'x64');
  assert.strictEqual(profileBakin.runtime, 'native');

  // 2. SMILE GAME BUILDER via data.sbpack & Game.rpo
  const peSmile = new SyntheticPEBuilder({ arch: 'x86' }).build();
  const inspSmile = PEInspector.fromBuffer(peSmile);
  const profileSmile = await registry.resolve(
    inspSmile,
    'C:/Games/SmileGame/Game.exe',
    ['Game.exe', 'data.sbpack', 'Game.rpo']
  );

  assert.strictEqual(profileSmile.tag, 'RPGM');
  assert.strictEqual(profileSmile.variant, 'bakin');
});

test('Ren\'Py Rules: Python DLL with renpy/ directory or .rpa / options.rpyc markers', async () => {
  const registry = new EngineRuleRegistry();

  // 1. Ren'Py with python39.dll and renpy/ directory
  const peRenpy = new SyntheticPEBuilder({ arch: 'x64' })
    .addImport('python39.dll', ['Py_Initialize'])
    .build();
  const inspRenpy = PEInspector.fromBuffer(peRenpy);
  const profileRenpy = await registry.resolve(
    inspRenpy,
    'C:/Games/RenpyGame/Game.exe',
    ['Game.exe', 'python39.dll', 'renpy', 'game', 'options.rpyc']
  );

  assert.strictEqual(profileRenpy.tag, "Ren'Py");
  assert.strictEqual(profileRenpy.family, 'renpy');
  assert.strictEqual(profileRenpy.variant, 'standard');
  assert.strictEqual(profileRenpy.arch, 'x64');
  assert.strictEqual(profileRenpy.runtime, 'python');
  assert.strictEqual(profileRenpy.saveStrategy, 'renpy-pickle');

  // 2. Ren'Py with game/*.rpa in subdirectory
  const mockFs = new MockFileSystemProvider();
  mockFs.writeFile('C:/Games/RenpyRpa/game/archive.rpa', 'RPA-3.0');

  const peGeneric = new SyntheticPEBuilder({ arch: 'x64' })
    .addImport('python27.dll', ['Py_Initialize'])
    .build();
  const inspGeneric = PEInspector.fromBuffer(peGeneric);

  const profileRpa = await registry.resolve(
    inspGeneric,
    'C:/Games/RenpyRpa/Game.exe',
    ['Game.exe', 'python27.dll', 'game'],
    mockFs
  );

  assert.strictEqual(profileRpa.tag, "Ren'Py");
  assert.strictEqual(profileRpa.family, 'renpy');

  // 3. Generic Python executable WITHOUT Ren'Py markers must NOT classify as Ren'Py
  const profilePythonGeneric = await registry.resolve(
    inspGeneric,
    'C:/Games/GenericPython/app.exe',
    ['app.exe', 'python27.dll', 'main.py']
  );

  assert.strictEqual(profilePythonGeneric.tag, 'Others');
  assert.strictEqual(profilePythonGeneric.family, 'native');
});

test('Wolf RPG Editor Rules: wmovie.dll import, Game.dat, BasicData.wolf, and data.wolf', async () => {
  const registry = new EngineRuleRegistry();

  // 1. Wolf RPG via wmovie.dll PE import
  const peWolf = new SyntheticPEBuilder({ arch: 'x86' })
    .addImport('wmovie.dll', ['PlayMovie'])
    .build();
  const inspWolf = PEInspector.fromBuffer(peWolf);
  const profileWolf = await registry.resolve(
    inspWolf,
    'C:/Games/WolfGame/Game.exe',
    ['Game.exe', 'wmovie.dll', 'Game.dat', 'BasicData.wolf']
  );

  assert.strictEqual(profileWolf.tag, 'Wolf RPG');
  assert.strictEqual(profileWolf.family, 'wolf-rpg');
  assert.strictEqual(profileWolf.variant, 'standard');
  assert.strictEqual(profileWolf.arch, 'x86');
  assert.strictEqual(profileWolf.runtime, 'native');
  assert.strictEqual(profileWolf.saveStrategy, 'wolf-sav');

  // 2. Wolf RPG via VersionInfo
  const peWolfVinfo = new SyntheticPEBuilder({ arch: 'x86' })
    .setVersionInfo({ InternalName: 'WOLF_RPG_EDITOR', ProductName: 'WOLF_RPG_EDITOR' })
    .build();
  const inspWolfVinfo = PEInspector.fromBuffer(peWolfVinfo);
  const profileWolfVinfo = await registry.resolve(
    inspWolfVinfo,
    'C:/Games/WolfGame/Game.exe',
    ['Game.exe']
  );

  assert.strictEqual(profileWolfVinfo.tag, 'Wolf RPG');
  assert.strictEqual(profileWolfVinfo.family, 'wolf-rpg');

  // 3. Wolf RPG via filesystem markers (GuruguruSMF4.dll, data.wolf, Game.wolf)
  const peClean = new SyntheticPEBuilder({ arch: 'x86' }).build();
  const inspClean = PEInspector.fromBuffer(peClean);

  const profileWolfFiles = await registry.resolve(
    inspClean,
    'C:/Games/WolfGame2/Game.exe',
    ['Game.exe', 'GuruguruSMF4.dll', 'data.wolf', 'Game.wolf']
  );

  assert.strictEqual(profileWolfFiles.tag, 'Wolf RPG');
  assert.strictEqual(profileWolfFiles.family, 'wolf-rpg');

  // 4. Subdirectory data/BasicData.wolf
  const mockFs = new MockFileSystemProvider();
  mockFs.writeFile('C:/Games/WolfSub/data/BasicData.wolf', 'wolfdata');

  const profileWolfSub = await registry.resolve(
    inspClean,
    'C:/Games/WolfSub/Game.exe',
    ['Game.exe', 'data'],
    mockFs
  );

  assert.strictEqual(profileWolfSub.tag, 'Wolf RPG');
  assert.strictEqual(profileWolfSub.family, 'wolf-rpg');
});

test('TyranoBuilder Rules: tyrano directory, tyrano.js, and VersionInfo', async () => {
  const registry = new EngineRuleRegistry();

  // 1. TyranoBuilder via tyrano/ folder & tyrano.js
  const peTyrano = new SyntheticPEBuilder({ arch: 'x64' })
    .setVersionInfo({ OriginalFilename: 'nw.exe', ProductName: 'TyranoBuilder VN' })
    .build();
  const inspTyrano = PEInspector.fromBuffer(peTyrano);
  const profileTyrano = await registry.resolve(
    inspTyrano,
    'C:/Games/TyranoGame/Game.exe',
    ['Game.exe', 'nw.dll', 'package.json', 'tyrano', 'tyrano.js']
  );

  assert.strictEqual(profileTyrano.tag, 'Others');
  assert.strictEqual(profileTyrano.family, 'tyranobuilder');
  assert.strictEqual(profileTyrano.variant, 'standard');
  assert.strictEqual(profileTyrano.arch, 'x64');
  assert.strictEqual(profileTyrano.runtime, 'nwjs');

  // 2. TyranoBuilder via data/scenario subdirectory
  const mockFs = new MockFileSystemProvider();
  mockFs.writeFile('C:/Games/TyranoSub/data/scenario/scene1.ks', 'ks');

  const peClean = new SyntheticPEBuilder({ arch: 'x64' }).build();
  const inspClean = PEInspector.fromBuffer(peClean);

  const profileTyranoSub = await registry.resolve(
    inspClean,
    'C:/Games/TyranoSub/Game.exe',
    ['Game.exe', 'nw.dll', 'package.json', 'data'],
    mockFs
  );

  assert.strictEqual(profileTyranoSub.tag, 'Others');
  assert.strictEqual(profileTyranoSub.family, 'tyranobuilder');
});
