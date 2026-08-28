/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EngineRuleRegistry,
  PEInspector,
  GameMakerStudioRule,
  KiriKiriRule,
  CatSystemRule,
  BGIEthornellRule,
  SiglusRealLiveRule,
  NitroplusRule,
  MajiroRule,
  NScripterRule,
  ArtemisRule,
  LilimRule,
  LiveMakerRule,
  AdvPlayerRule,
  SilkyRule,
  SystemNNNRule,
  CircusRule,
  EmoteRule,
  TyranoBuilderRule,
} from '../dist/index.js';
import { SyntheticPEBuilder } from './fixtures/synthetic-pe-builder.ts';
import { MockFileSystemProvider } from './fixtures/mock-fs-provider.ts';

test('GameMaker Studio: data.win, audiogroup1.dat + options.ini, and version info', async () => {
  const registry = new EngineRuleRegistry();
  const pe = new SyntheticPEBuilder({ arch: 'x64' }).build();
  const insp = PEInspector.fromBuffer(pe);

  // 1. data.win marker
  const profileDataWin = await registry.resolve(
    insp,
    'C:/Games/GMGame/Game.exe',
    ['Game.exe', 'data.win']
  );
  assert.strictEqual(profileDataWin.tag, 'Others');
  assert.strictEqual(profileDataWin.family, 'gamemaker');
  assert.strictEqual(profileDataWin.variant, 'studio');
  assert.strictEqual(profileDataWin.saveStrategy, 'gamemaker-appdata');

  // 2. audiogroup1.dat + options.ini
  const profileAudioOpt = await registry.resolve(
    insp,
    'C:/Games/GMGame2/Runner.exe',
    ['Runner.exe', 'audiogroup1.dat', 'options.ini']
  );
  assert.strictEqual(profileAudioOpt.tag, 'Others');
  assert.strictEqual(profileAudioOpt.family, 'gamemaker');

  // 3. assets/data.win in subfolder via MockFs
  const mockFs = new MockFileSystemProvider();
  mockFs.writeFile('C:/Games/GMSub/assets/data.win', Buffer.from('FORM'));
  const profileSub = await registry.resolve(
    insp,
    'C:/Games/GMSub/Game.exe',
    ['Game.exe', 'assets'],
    mockFs
  );
  assert.strictEqual(profileSub.tag, 'Others');
  assert.strictEqual(profileSub.family, 'gamemaker');

  // 4. VersionInfo GameMaker Studio
  const peVinfo = new SyntheticPEBuilder({ arch: 'x86' })
    .setVersionInfo({ FileDescription: 'GameMaker Studio 2 Player', CompanyName: 'YoYo Games Ltd.' })
    .build();
  const inspVinfo = PEInspector.fromBuffer(peVinfo);
  const profileVinfo = await registry.resolve(inspVinfo, 'C:/Games/GMVinfo/Game.exe');
  assert.strictEqual(profileVinfo.family, 'gamemaker');
});

test('KiriKiri 2 / KiriKiri Z: tvpwin32.exe, data.xp3, XP3 magic header, tvpsnd.dll', async () => {
  const registry = new EngineRuleRegistry();

  // 1. tvpwin32.exe name and x86
  const pe32 = new SyntheticPEBuilder({ arch: 'x86' }).build();
  const insp32 = PEInspector.fromBuffer(pe32);
  const profileTvp = await registry.resolve(
    insp32,
    'C:/Games/FateStayNight/tvpwin32.exe',
    ['tvpwin32.exe', 'data.xp3']
  );
  assert.strictEqual(profileTvp.tag, 'Others');
  assert.strictEqual(profileTvp.family, 'kirikiri');
  assert.strictEqual(profileTvp.variant, 'xp3');
  assert.strictEqual(profileTvp.arch, 'x86');

  // 2. XP3 binary magic header 'XP3\r\n\x1a\n\0'
  const mockFs = new MockFileSystemProvider();
  const xp3MagicBuf = Buffer.from([0x58, 0x50, 0x33, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00]);
  mockFs.writeFile('C:/Games/FateSN/patch.xp3', xp3MagicBuf);

  const profileMagic = await registry.resolve(
    insp32,
    'C:/Games/FateSN/Fate.exe',
    ['Fate.exe', 'patch.xp3'],
    mockFs
  );
  assert.strictEqual(profileMagic.tag, 'Others');
  assert.strictEqual(profileMagic.family, 'kirikiri');
  assert.strictEqual(profileMagic.variant, 'xp3');

  // 3. KiriKiri Z 64-bit via krkrz.exe
  const pe64 = new SyntheticPEBuilder({ arch: 'x64' })
    .setVersionInfo({ FileDescription: 'KiriKiri Z Core Engine' })
    .build();
  const insp64 = PEInspector.fromBuffer(pe64);
  const profileZ = await registry.resolve(insp64, 'C:/Games/KrkrZGame/krkrz.exe');
  assert.strictEqual(profileZ.tag, 'Others');
  assert.strictEqual(profileZ.family, 'kirikiri');
  assert.strictEqual(profileZ.variant, 'kirikiri-z');
  assert.strictEqual(profileZ.arch, 'x64');

  // 4. tvpsnd.dll import
  const peImport = new SyntheticPEBuilder({ arch: 'x86' })
    .addImport('tvpsnd.dll', ['TVPPluginGlobalRefCount'])
    .build();
  const inspImport = PEInspector.fromBuffer(peImport);
  const profileImport = await registry.resolve(inspImport, 'C:/Games/KrkrImport/Game.exe');
  assert.strictEqual(profileImport.family, 'kirikiri');
});

test('CatSystem 2: cs2.exe, scene.dat, scene.int, fes.int, KIF\\0 magic header', async () => {
  const registry = new EngineRuleRegistry();

  // 1. cs2.exe and scene.dat
  const pe = new SyntheticPEBuilder({ arch: 'x86' }).build();
  const insp = PEInspector.fromBuffer(pe);
  const profileCs2 = await registry.resolve(
    insp,
    'C:/Games/Grisaia/cs2.exe',
    ['cs2.exe', 'scene.dat', 'cstitle.ini']
  );
  assert.strictEqual(profileCs2.tag, 'Others');
  assert.strictEqual(profileCs2.family, 'catsystem');
  assert.strictEqual(profileCs2.variant, 'catsystem-2');

  // 2. scene.int / fes.int
  const profileInt = await registry.resolve(
    insp,
    'C:/Games/CS2Game/Game.exe',
    ['Game.exe', 'scene.int', 'fes.int']
  );
  assert.strictEqual(profileInt.tag, 'Others');
  assert.strictEqual(profileInt.family, 'catsystem');

  // 3. KIF\0 magic header in *.int
  const mockFs = new MockFileSystemProvider();
  const kifBuf = Buffer.from([0x4B, 0x49, 0x46, 0x00, 0x01, 0x00, 0x00, 0x00]); // 'KIF\0'
  mockFs.writeFile('C:/Games/CS2Magic/data.int', kifBuf);

  const profileKif = await registry.resolve(
    insp,
    'C:/Games/CS2Magic/Game.exe',
    ['Game.exe', 'data.int'],
    mockFs
  );
  assert.strictEqual(profileKif.tag, 'Others');
  assert.strictEqual(profileKif.family, 'catsystem');
});

test('BGI / Ethornell: BGI.exe, SysGrp.arc, SysPrg.arc, BURIKO ARC magic', async () => {
  const registry = new EngineRuleRegistry();

  // 1. BGI.exe
  const pe = new SyntheticPEBuilder({ arch: 'x86' }).build();
  const insp = PEInspector.fromBuffer(pe);
  const profileBgi = await registry.resolve(
    insp,
    'C:/Games/Daitoshokan/BGI.exe',
    ['BGI.exe', 'sysgrp.arc', 'sysprg.arc']
  );
  assert.strictEqual(profileBgi.tag, 'Others');
  assert.strictEqual(profileBgi.family, 'bgi-ethornell');
  assert.strictEqual(profileBgi.variant, 'ethornell');

  // 2. SysGrp.arc / SysPrg.arc without BGI.exe name
  const profileSysGrp = await registry.resolve(
    insp,
    'C:/Games/AugustGame/Game.exe',
    ['Game.exe', 'SysGrp.arc', 'SysPrg.arc']
  );
  assert.strictEqual(profileSysGrp.tag, 'Others');
  assert.strictEqual(profileSysGrp.family, 'bgi-ethornell');

  // 3. BURIKO ARC magic in *.arc
  const mockFs = new MockFileSystemProvider();
  const burikoBuf = Buffer.from('BURIKO ARC\x00\x00\x00\x00');
  mockFs.writeFile('C:/Games/BurikoGame/data.arc', burikoBuf);

  const profileBuriko = await registry.resolve(
    insp,
    'C:/Games/BurikoGame/Launcher.exe',
    ['Launcher.exe', 'data.arc'],
    mockFs
  );
  assert.strictEqual(profileBuriko.tag, 'Others');
  assert.strictEqual(profileBuriko.family, 'bgi-ethornell');

  // 4. VersionInfo Ethornell / Buriko
  const peVinfo = new SyntheticPEBuilder({ arch: 'x86' })
    .setVersionInfo({ FileDescription: 'Ethornell Buriko General Interpreter' })
    .build();
  const inspVinfo = PEInspector.fromBuffer(peVinfo);
  const profileVinfo = await registry.resolve(inspVinfo, 'C:/Games/Ethornell/Game.exe');
  assert.strictEqual(profileVinfo.family, 'bgi-ethornell');
});

test('SiglusEngine & RealLive: SiglusEngine.exe, scene.pck, g00/, RealLive.exe, Seen.txt, Gameexe.dat', async () => {
  const registry = new EngineRuleRegistry();
  const pe = new SyntheticPEBuilder({ arch: 'x86' }).build();
  const insp = PEInspector.fromBuffer(pe);

  // 1. SiglusEngine: SiglusEngine.exe & scene.pck
  const profileSiglus = await registry.resolve(
    insp,
    'C:/Games/SummerPockets/SiglusEngine.exe',
    ['SiglusEngine.exe', 'scene.pck', 'Gameexe.dat']
  );
  assert.strictEqual(profileSiglus.tag, 'Others');
  assert.strictEqual(profileSiglus.family, 'siglus-reallive');
  assert.strictEqual(profileSiglus.variant, 'siglus');

  // 2. SiglusEngine: g00/ directory via MockFs
  const mockFs = new MockFileSystemProvider();
  mockFs.writeFile('C:/Games/SiglusG00/g00/sys001.g00', Buffer.alloc(16));
  const profileG00 = await registry.resolve(
    insp,
    'C:/Games/SiglusG00/Siglus.exe',
    ['Siglus.exe', 'g00'],
    mockFs
  );
  assert.strictEqual(profileG00.family, 'siglus-reallive');
  assert.strictEqual(profileG00.variant, 'siglus');

  // 3. RealLive: RealLive.exe, Seen.txt, Gameexe.dat
  const profileRealLive = await registry.resolve(
    insp,
    'C:/Games/Clannad/RealLive.exe',
    ['RealLive.exe', 'Seen.txt', 'Gameexe.dat']
  );
  assert.strictEqual(profileRealLive.tag, 'Others');
  assert.strictEqual(profileRealLive.family, 'siglus-reallive');
  assert.strictEqual(profileRealLive.variant, 'reallive');

  // 4. RealLive: *.g00 / *.nwa files + Gameexe.dat
  const profileG00Nwa = await registry.resolve(
    insp,
    'C:/Games/Kanon/Game.exe',
    ['Game.exe', 'Gameexe.dat', 'bg01.g00', 'bgm01.nwa']
  );
  assert.strictEqual(profileG00Nwa.family, 'siglus-reallive');
  assert.strictEqual(profileG00Nwa.variant, 'reallive');
});

test('Nitroplus: Nitroplus.exe, nlsdata.bin, *.npk with NPK magic', async () => {
  const registry = new EngineRuleRegistry();

  // 1. Nitroplus.exe & nlsdata.bin
  const pe = new SyntheticPEBuilder({ arch: 'x86' }).build();
  const insp = PEInspector.fromBuffer(pe);
  const profileNitro = await registry.resolve(
    insp,
    'C:/Games/SteinsGate/Nitroplus.exe',
    ['Nitroplus.exe', 'nlsdata.bin', 'data.npk']
  );
  assert.strictEqual(profileNitro.tag, 'Others');
  assert.strictEqual(profileNitro.family, 'nitroplus');
  assert.strictEqual(profileNitro.variant, 'standard');

  // 2. *.npk magic header 'NPK\0'
  const mockFs = new MockFileSystemProvider();
  const npkBuf = Buffer.from([0x4E, 0x50, 0x4B, 0x00, 0x01, 0x00, 0x00, 0x00]); // 'NPK\0'
  mockFs.writeFile('C:/Games/NitroMagic/cg.npk', npkBuf);

  const profileMagic = await registry.resolve(
    insp,
    'C:/Games/NitroMagic/Game.exe',
    ['Game.exe', 'cg.npk'],
    mockFs
  );
  assert.strictEqual(profileMagic.tag, 'Others');
  assert.strictEqual(profileMagic.family, 'nitroplus');

  // 3. VersionInfo Nitroplus
  const peVinfo = new SyntheticPEBuilder({ arch: 'x86' })
    .setVersionInfo({ CompanyName: 'Nitroplus Co., Ltd.', ProductName: 'Nitro+ Adventure Engine' })
    .build();
  const inspVinfo = PEInspector.fromBuffer(peVinfo);
  const profileVinfo = await registry.resolve(inspVinfo, 'C:/Games/NitroVinfo/Game.exe');
  assert.strictEqual(profileVinfo.family, 'nitroplus');
});

test('Majiro: MajiroObjX.dll import & file marker, scenario.arc, data.arc', async () => {
  const registry = new EngineRuleRegistry();

  // 1. MajiroObjX.dll import
  const peImport = new SyntheticPEBuilder({ arch: 'x86' })
    .addImport('MajiroObjX.dll', ['MajiroInit'])
    .build();
  const inspImport = PEInspector.fromBuffer(peImport);
  const profileImport = await registry.resolve(inspImport, 'C:/Games/MajiroGame/Game.exe');
  assert.strictEqual(profileImport.tag, 'Others');
  assert.strictEqual(profileImport.family, 'majiro');

  // 2. scenario.arc and data.arc file markers
  const pe = new SyntheticPEBuilder({ arch: 'x86' }).build();
  const insp = PEInspector.fromBuffer(pe);
  const profileFiles = await registry.resolve(
    insp,
    'C:/Games/MajiroGame2/Game.exe',
    ['Game.exe', 'scenario.arc', 'data.arc']
  );
  assert.strictEqual(profileFiles.tag, 'Others');
  assert.strictEqual(profileFiles.family, 'majiro');
});

test('NScripter / ONScripter: nscript.dat, 0.txt, default.ttf, onscripter.exe', async () => {
  const registry = new EngineRuleRegistry();
  const pe = new SyntheticPEBuilder({ arch: 'x86' }).build();
  const insp = PEInspector.fromBuffer(pe);

  // 1. nscript.dat marker
  const profileNscript = await registry.resolve(
    insp,
    'C:/Games/Tsukihime/nscript.exe',
    ['nscript.exe', 'nscript.dat', 'arc.nsa']
  );
  assert.strictEqual(profileNscript.tag, 'Others');
  assert.strictEqual(profileNscript.family, 'nscripter');
  assert.strictEqual(profileNscript.variant, 'nscripter');

  // 2. 0.txt + default.ttf (ONScripter)
  const profileOnscript = await registry.resolve(
    insp,
    'C:/Games/Higurashi/onscripter.exe',
    ['onscripter.exe', '0.txt', 'default.ttf', 'arc.nsa']
  );
  assert.strictEqual(profileOnscript.tag, 'Others');
  assert.strictEqual(profileOnscript.family, 'nscripter');
  assert.strictEqual(profileOnscript.variant, 'onscripter');
});

test('Artemis Engine: artemis.exe, root.pfs, and pf8 magic', async () => {
  const registry = new EngineRuleRegistry();

  // 1. artemis.exe and root.pfs
  const pe = new SyntheticPEBuilder({ arch: 'x86' }).build();
  const insp = PEInspector.fromBuffer(pe);
  const profileArtemis = await registry.resolve(
    insp,
    'C:/Games/ArtemisGame/artemis.exe',
    ['artemis.exe', 'root.pfs']
  );
  assert.strictEqual(profileArtemis.tag, 'Others');
  assert.strictEqual(profileArtemis.family, 'artemis');

  // 2. *.pfs with pf8 magic header
  const mockFs = new MockFileSystemProvider();
  const pfsBuf = Buffer.from('pf8\x00\x00\x00\x00\x00');
  mockFs.writeFile('C:/Games/ArtemisMagic/system.pfs', pfsBuf);

  const profileMagic = await registry.resolve(
    insp,
    'C:/Games/ArtemisMagic/Game.exe',
    ['Game.exe', 'system.pfs'],
    mockFs
  );
  assert.strictEqual(profileMagic.tag, 'Others');
  assert.strictEqual(profileMagic.family, 'artemis');
});

test('Lilim: lilim.exe, *.aoi archives', async () => {
  const registry = new EngineRuleRegistry();
  const pe = new SyntheticPEBuilder({ arch: 'x86' }).build();
  const insp = PEInspector.fromBuffer(pe);

  const profileLilim = await registry.resolve(
    insp,
    'C:/Games/LilimGame/lilim.exe',
    ['lilim.exe', 'sys.aoi', 'data.aoi']
  );
  assert.strictEqual(profileLilim.tag, 'Others');
  assert.strictEqual(profileLilim.family, 'lilim');
});

test('LiveMaker: Live.exe, *.pyl, live.dll', async () => {
  const registry = new EngineRuleRegistry();
  const pe = new SyntheticPEBuilder({ arch: 'x86' }).build();
  const insp = PEInspector.fromBuffer(pe);

  const profileLive = await registry.resolve(
    insp,
    'C:/Games/LiveMakerGame/Live.exe',
    ['Live.exe', 'game.pyl', 'live.dll']
  );
  assert.strictEqual(profileLive.tag, 'Others');
  assert.strictEqual(profileLive.family, 'livemaker');
});

test('AdvPlayer, Silky, SystemNNN, Circus / ESCRUDE, M2 / E-mote', async () => {
  const registry = new EngineRuleRegistry();

  // 1. AdvPlayer
  const peAdv = new SyntheticPEBuilder({ arch: 'x86' })
    .addImport('AdvPlayer.dll', ['AdvInit'])
    .build();
  const inspAdv = PEInspector.fromBuffer(peAdv);
  const profileAdv = await registry.resolve(
    inspAdv,
    'C:/Games/AdvGame/AdvPlayer.exe',
    ['AdvPlayer.exe', 'data.mpk']
  );
  assert.strictEqual(profileAdv.tag, 'Others');
  assert.strictEqual(profileAdv.family, 'advplayer');

  // 2. Silky / AI6WIN
  const peSilky = new SyntheticPEBuilder({ arch: 'x86' })
    .setVersionInfo({ FileDescription: 'AI6WIN Engine for Silky\'s' })
    .build();
  const inspSilky = PEInspector.fromBuffer(peSilky);
  const profileSilky = await registry.resolve(inspSilky, 'C:/Games/SilkyGame/ai6win.exe', ['ai6win.exe', 'silky.ini']);
  assert.strictEqual(profileSilky.tag, 'Others');
  assert.strictEqual(profileSilky.family, 'silky');

  // 3. SystemNNN / System39
  const peS39 = new SyntheticPEBuilder({ arch: 'x86' }).build();
  const inspS39 = PEInspector.fromBuffer(peS39);
  const mockFs = new MockFileSystemProvider();
  mockFs.writeFile('C:/Games/NNNGame/n3n/system.n3n', Buffer.alloc(16));

  const profileNNN = await registry.resolve(
    inspS39,
    'C:/Games/NNNGame/system39.exe',
    ['system39.exe', 'n3n'],
    mockFs
  );
  assert.strictEqual(profileNNN.tag, 'Others');
  assert.strictEqual(profileNNN.family, 'system-nnn');
  assert.strictEqual(profileNNN.variant, 'system39');

  // 4. Circus / ESCRUDE
  const peCircus = new SyntheticPEBuilder({ arch: 'x86' }).build();
  const inspCircus = PEInspector.fromBuffer(peCircus);
  const profileCircus = await registry.resolve(
    inspCircus,
    'C:/Games/CircusGame/escrude.exe',
    ['escrude.exe', 'data.crx', 'escrude.dll']
  );
  assert.strictEqual(profileCircus.tag, 'Others');
  assert.strictEqual(profileCircus.family, 'circus');

  // 5. M2 / E-mote
  const peEmote = new SyntheticPEBuilder({ arch: 'x86' })
    .addImport('emotedriver.dll', ['EmoteInit'])
    .build();
  const inspEmote = PEInspector.fromBuffer(peEmote);
  const profileEmote = await registry.resolve(
    inspEmote,
    'C:/Games/EmoteGame/Game.exe',
    ['Game.exe', 'char.psb']
  );
  assert.strictEqual(profileEmote.tag, 'Others');
  assert.strictEqual(profileEmote.family, 'emote');
});

test('Native Win32 C++ Fallback: Clean PE executable without engine markers', async () => {
  const registry = new EngineRuleRegistry();
  const pe = new SyntheticPEBuilder({ arch: 'x64' }).build();
  const insp = PEInspector.fromBuffer(pe);

  const profileFallback = await registry.resolve(
    insp,
    'C:/Games/CustomApp/CustomApp.exe',
    ['CustomApp.exe', 'readme.txt', 'config.ini']
  );

  assert.strictEqual(profileFallback.tag, 'Others');
  assert.strictEqual(profileFallback.family, 'native');
  assert.strictEqual(profileFallback.variant, 'custom');
  assert.strictEqual(profileFallback.arch, 'x64');
  assert.strictEqual(profileFallback.runtime, 'native');
  assert.strictEqual(profileFallback.saveStrategy, 'unknown');
  assert.strictEqual(profileFallback.detectedBy, 'Native PE Executable (Unclassified)');
});
