/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EngineRuleRegistry,
  PEInspector,
  QSPRule,
  RAGSRule,
  ADRIFTRule,
  TadsRule,
  HTMLWebGLRule,
} from '../dist/index.js';
import { SyntheticPEBuilder } from './fixtures/synthetic-pe-builder.ts';
import { MockFileSystemProvider } from './fixtures/mock-fs-provider.ts';

test('QSP Rules: *.qsp game file, qspgui.exe, QSP magic header, and Quest *.aslx', async () => {
  const registry = new EngineRuleRegistry();

  // 1. QSP via *.qsp file marker
  const peClean = new SyntheticPEBuilder({ arch: 'x86' }).build();
  const inspClean = PEInspector.fromBuffer(peClean);

  const profileQsp = await registry.resolve(
    inspClean,
    'C:/Games/QspGame/game.exe',
    ['game.exe', 'story.qsp']
  );
  assert.strictEqual(profileQsp.tag, 'QSP');
  assert.strictEqual(profileQsp.family, 'qsp');
  assert.strictEqual(profileQsp.variant, 'standard');
  assert.strictEqual(profileQsp.runtime, 'qsp-runtime');
  assert.strictEqual(profileQsp.saveStrategy, 'qsp-savedgame');

  // 2. QSP via qspgui.exe executable name
  const profileQspExe = await registry.resolve(
    inspClean,
    'C:/Games/QspPlayer/qspgui.exe',
    ['qspgui.exe']
  );
  assert.strictEqual(profileQspExe.tag, 'QSP');
  assert.strictEqual(profileQspExe.family, 'qsp');

  // 3. QSP via magic header (QSP) in file
  const mockFs = new MockFileSystemProvider();
  const qspHeader = Buffer.from('QSP\x00\x01\x00\x00\x00');
  mockFs.writeFile('C:/Games/QspMagic/game.qsp', qspHeader);

  const profileQspMagic = await registry.resolve(
    inspClean,
    'C:/Games/QspMagic/game.exe',
    ['game.exe', 'game.qsp'],
    mockFs
  );
  assert.strictEqual(profileQspMagic.tag, 'QSP');
  assert.strictEqual(profileQspMagic.variant, 'standard');
  assert.strictEqual(profileQspMagic.detectedBy.includes('QSP magic header'), true);

  // 4. Quest via *.aslx file and <asl magic XML header
  const mockFsQuest = new MockFileSystemProvider();
  mockFsQuest.writeFile(
    'C:/Games/QuestGame/game.aslx',
    '<asl version="580">\n<game name="Test Quest Game">\n</game>\n</asl>'
  );

  const profileQuest = await registry.resolve(
    inspClean,
    'C:/Games/QuestGame/Quest.exe',
    ['Quest.exe', 'game.aslx'],
    mockFsQuest
  );
  assert.strictEqual(profileQuest.tag, 'QSP');
  assert.strictEqual(profileQuest.family, 'qsp');
  assert.strictEqual(profileQuest.variant, 'quest');
  assert.strictEqual(profileQuest.runtime, 'qsp-runtime');
  assert.strictEqual(profileQuest.saveStrategy, 'qsp-savedgame');
  assert.strictEqual(profileQuest.detectedBy.includes('<asl magic'), true);
});

test('RAGS Rules: *.rag encrypted game, RAGS magic header, RagsPlayer.exe, and *.sdf', async () => {
  const registry = new EngineRuleRegistry();

  // 1. RAGS via RagsPlayer.exe executable
  const peRags = new SyntheticPEBuilder({ arch: 'x86' })
    .setVersionInfo({ OriginalFilename: 'RagsPlayer.exe', ProductName: 'RAGS Suite Player' })
    .build();
  const inspRags = PEInspector.fromBuffer(peRags);

  const profileRagsExe = await registry.resolve(
    inspRags,
    'C:/Games/RagsGame/RagsPlayer.exe',
    ['RagsPlayer.exe', 'game.sdf']
  );
  assert.strictEqual(profileRagsExe.tag, 'RAGS');
  assert.strictEqual(profileRagsExe.family, 'rags');
  assert.strictEqual(profileRagsExe.variant, 'standard');
  assert.strictEqual(profileRagsExe.runtime, 'dotnet-rags');
  assert.strictEqual(profileRagsExe.saveStrategy, 'rags-save');

  // 2. RAGS via *.rag extension and RAGS magic header
  const mockFs = new MockFileSystemProvider();
  const ragsMagic = Buffer.from('RAGS\x01\x00\x00\x00');
  mockFs.writeFile('C:/Games/RagsEncrypted/game.rag', ragsMagic);

  const peClean = new SyntheticPEBuilder({ arch: 'x86' }).build();
  const inspClean = PEInspector.fromBuffer(peClean);

  const profileRagsMagic = await registry.resolve(
    inspClean,
    'C:/Games/RagsEncrypted/runner.exe',
    ['runner.exe', 'game.rag'],
    mockFs
  );
  assert.strictEqual(profileRagsMagic.tag, 'RAGS');
  assert.strictEqual(profileRagsMagic.family, 'rags');
  assert.strictEqual(profileRagsMagic.detectedBy.includes('RAGS magic'), true);

  // 3. RAGS setup executable
  const profileSetup = await registry.resolve(
    inspClean,
    'C:/Games/RagsSetup/rags_setup.exe',
    ['rags_setup.exe']
  );
  assert.strictEqual(profileSetup.tag, 'RAGS');
  assert.strictEqual(profileSetup.family, 'rags');
});

test('ADRIFT Rules: *.taf game archive, adrift runner, and Blorb container', async () => {
  const registry = new EngineRuleRegistry();
  const peClean = new SyntheticPEBuilder({ arch: 'x86' }).build();
  const inspClean = PEInspector.fromBuffer(peClean);

  // 1. ADRIFT via *.taf file marker
  const profileTaf = await registry.resolve(
    inspClean,
    'C:/Games/AdriftGame/scrun.exe',
    ['scrun.exe', 'adventure.taf']
  );
  assert.strictEqual(profileTaf.tag, 'ADRIFT');
  assert.strictEqual(profileTaf.family, 'adrift');
  assert.strictEqual(profileTaf.variant, 'standard');
  assert.strictEqual(profileTaf.runtime, 'adrift-runner');
  assert.strictEqual(profileTaf.saveStrategy, 'adrift-save');

  // 2. ADRIFT via Blorb file container (*.blorb) and FORM/IFRS magic
  const mockFs = new MockFileSystemProvider();
  const blorbHeader = Buffer.concat([
    Buffer.from('FORM'),
    Buffer.from([0x00, 0x00, 0x10, 0x00]), // chunk size
    Buffer.from('IFRS'),
  ]);
  mockFs.writeFile('C:/Games/BlorbGame/story.blorb', blorbHeader);

  const profileBlorb = await registry.resolve(
    inspClean,
    'C:/Games/BlorbGame/runner.exe',
    ['runner.exe', 'story.blorb'],
    mockFs
  );
  assert.strictEqual(profileBlorb.tag, 'ADRIFT');
  assert.strictEqual(profileBlorb.family, 'adrift');
  assert.strictEqual(profileBlorb.variant, 'blorb');
  assert.strictEqual(profileBlorb.detectedBy.includes('FORM/IFRS'), true);
});

test('TADS Rules: *.t3 compiled image (T3-image magic) and *.gam (TADS2 bin)', async () => {
  const registry = new EngineRuleRegistry();
  const peClean = new SyntheticPEBuilder({ arch: 'x86' }).build();
  const inspClean = PEInspector.fromBuffer(peClean);

  // 1. TADS 3 via *.t3 file and T3-image magic header
  const mockFsT3 = new MockFileSystemProvider();
  const t3Magic = Buffer.from('T3-image\x0D\x0A\x1A\x01\x00');
  mockFsT3.writeFile('C:/Games/Tads3Game/game.t3', t3Magic);

  const profileT3 = await registry.resolve(
    inspClean,
    'C:/Games/Tads3Game/t3run.exe',
    ['t3run.exe', 'game.t3'],
    mockFsT3
  );
  assert.strictEqual(profileT3.tag, 'Tads');
  assert.strictEqual(profileT3.family, 'tads');
  assert.strictEqual(profileT3.variant, 'tads-3');
  assert.strictEqual(profileT3.runtime, 'tads-vm');
  assert.strictEqual(profileT3.saveStrategy, 'tads-save');
  assert.strictEqual(profileT3.detectedBy.includes('T3-image magic'), true);

  // 2. TADS 2 via *.gam file and TADS2 bin magic header
  const mockFsGam = new MockFileSystemProvider();
  const gamMagic = Buffer.from('TADS2 bin\x0A\x0D\x1A');
  mockFsGam.writeFile('C:/Games/Tads2Game/game.gam', gamMagic);

  const profileGam = await registry.resolve(
    inspClean,
    'C:/Games/Tads2Game/htmltads.exe',
    ['htmltads.exe', 'game.gam'],
    mockFsGam
  );
  assert.strictEqual(profileGam.tag, 'Tads');
  assert.strictEqual(profileGam.family, 'tads');
  assert.strictEqual(profileGam.variant, 'tads-2');
  assert.strictEqual(profileGam.runtime, 'tads-vm');
  assert.strictEqual(profileGam.saveStrategy, 'tads-save');
  assert.strictEqual(profileGam.detectedBy.includes('TADS2 bin'), true);
});

test('HTML / WebGL Container Rules: Construct 2/3, Electron, Generic NW.js, Tauri, Neutralino, and Canvas', async () => {
  const registry = new EngineRuleRegistry();

  // 1. Construct 3 via c3runtime.js
  const peClean = new SyntheticPEBuilder({ arch: 'x64' }).build();
  const inspClean = PEInspector.fromBuffer(peClean);

  const profileC3 = await registry.resolve(
    inspClean,
    'C:/Games/Construct3Game/Game.exe',
    ['Game.exe', 'c3runtime.js', 'index.html', 'data.json']
  );
  assert.strictEqual(profileC3.tag, 'HTML');
  assert.strictEqual(profileC3.family, 'html-webgl');
  assert.strictEqual(profileC3.variant, 'construct-3');
  assert.strictEqual(profileC3.runtime, 'webgl-browser');
  assert.strictEqual(profileC3.saveStrategy, 'custom');

  // 2. Construct 2 via c2runtime.js
  const profileC2 = await registry.resolve(
    inspClean,
    'C:/Games/Construct2Game/Game.exe',
    ['Game.exe', 'c2runtime.js', 'index.html']
  );
  assert.strictEqual(profileC2.tag, 'HTML');
  assert.strictEqual(profileC2.family, 'html-webgl');
  assert.strictEqual(profileC2.variant, 'construct-2');

  // 3. Electron container via resources/app.asar
  const mockFsElectron = new MockFileSystemProvider();
  mockFsElectron.writeFile('C:/Games/ElectronApp/resources/app.asar', 'fake asar header');

  const peElectron = new SyntheticPEBuilder({ arch: 'x64' })
    .setVersionInfo({ OriginalFilename: 'electron.exe', ProductName: 'Electron Desktop App' })
    .build();
  const inspElectron = PEInspector.fromBuffer(peElectron);

  const profileElectron = await registry.resolve(
    inspElectron,
    'C:/Games/ElectronApp/MyElectronGame.exe',
    ['MyElectronGame.exe', 'resources', 'v8_context_snapshot.bin'],
    mockFsElectron
  );
  assert.strictEqual(profileElectron.tag, 'HTML');
  assert.strictEqual(profileElectron.family, 'html-webgl');
  assert.strictEqual(profileElectron.variant, 'electron');
  assert.strictEqual(profileElectron.runtime, 'electron');

  // 4. Generic NW.js container (without RPG Maker or TyranoBuilder markers)
  const peNw = new SyntheticPEBuilder({ arch: 'x64' })
    .setVersionInfo({ OriginalFilename: 'nw.exe', ProductName: 'Generic NW.js App' })
    .build();
  const inspNw = PEInspector.fromBuffer(peNw);

  const profileNw = await registry.resolve(
    inspNw,
    'C:/Games/GenericNwGame/Game.exe',
    ['Game.exe', 'nw.dll', 'package.nw']
  );
  assert.strictEqual(profileNw.tag, 'HTML');
  assert.strictEqual(profileNw.family, 'html-webgl');
  assert.strictEqual(profileNw.variant, 'nwjs');
  assert.strictEqual(profileNw.runtime, 'nwjs');

  // 5. Tauri container via tauri.conf.json
  const profileTauri = await registry.resolve(
    inspClean,
    'C:/Games/TauriApp/app.exe',
    ['app.exe', 'tauri.conf.json', 'index.html']
  );
  assert.strictEqual(profileTauri.tag, 'HTML');
  assert.strictEqual(profileTauri.family, 'html-webgl');
  assert.strictEqual(profileTauri.variant, 'tauri');

  // 6. Neutralino container via neutralino.js & neutralino.config.json
  const profileNeutralino = await registry.resolve(
    inspClean,
    'C:/Games/NeuApp/app.exe',
    ['app.exe', 'neutralino.js', 'neutralino.config.json']
  );
  assert.strictEqual(profileNeutralino.tag, 'HTML');
  assert.strictEqual(profileNeutralino.family, 'html-webgl');
  assert.strictEqual(profileNeutralino.variant, 'neutralino');

  // 7. Pure HTML5 / WebGL Canvas entry (index.html)
  const profileCanvas = await registry.resolve(
    inspClean,
    'C:/Games/Html5Game/launcher.exe',
    ['launcher.exe', 'index.html']
  );
  assert.strictEqual(profileCanvas.tag, 'HTML');
  assert.strictEqual(profileCanvas.family, 'html-webgl');
  assert.strictEqual(profileCanvas.variant, 'web-canvas');
});

test('Twine Story Formats Detection: SugarCube, Harlowe, Chapbook, Snowman in HTML / containers', async () => {
  const registry = new EngineRuleRegistry();
  const peClean = new SyntheticPEBuilder({ arch: 'x64' }).build();
  const inspClean = PEInspector.fromBuffer(peClean);

  // 1. Twine SugarCube format in index.html
  const mockFsSugarCube = new MockFileSystemProvider();
  mockFsSugarCube.writeFile(
    'C:/Games/TwineSugarCube/index.html',
    '<!DOCTYPE html><html><head><title>Story</title></head><body>' +
      '<tw-storydata name="My SugarCube Story" format="SugarCube" format-version="2.36.1" options="">' +
      '</tw-storydata></body></html>'
  );

  const profileSugarCube = await registry.resolve(
    inspClean,
    'C:/Games/TwineSugarCube/launch.exe',
    ['launch.exe', 'index.html'],
    mockFsSugarCube
  );
  assert.strictEqual(profileSugarCube.tag, 'HTML');
  assert.strictEqual(profileSugarCube.family, 'html-webgl');
  assert.strictEqual(profileSugarCube.variant, 'twine-sugarcube');
  assert.strictEqual(profileSugarCube.runtime, 'webgl-browser');
  assert.strictEqual(profileSugarCube.detectedBy.includes('SugarCube'), true);

  // 2. Twine Harlowe format in NW.js container
  const mockFsHarlowe = new MockFileSystemProvider();
  mockFsHarlowe.writeFile(
    'C:/Games/TwineHarlowe/index.html',
    '<html><body><tw-storydata name="Harlowe Story" data-format="Harlowe" format-version="3.3.5"></tw-storydata></body></html>'
  );

  const peNw = new SyntheticPEBuilder({ arch: 'x64' })
    .setVersionInfo({ OriginalFilename: 'nw.exe' })
    .build();
  const inspNw = PEInspector.fromBuffer(peNw);

  const profileHarlowe = await registry.resolve(
    inspNw,
    'C:/Games/TwineHarlowe/Game.exe',
    ['Game.exe', 'nw.dll', 'package.json', 'index.html'],
    mockFsHarlowe
  );
  assert.strictEqual(profileHarlowe.tag, 'HTML');
  assert.strictEqual(profileHarlowe.family, 'html-webgl');
  assert.strictEqual(profileHarlowe.variant, 'twine-harlowe');
  assert.strictEqual(profileHarlowe.runtime, 'nwjs');
  assert.strictEqual(profileHarlowe.detectedBy.includes('Harlowe'), true);

  // 3. Twine Chapbook format in Electron container
  const mockFsChapbook = new MockFileSystemProvider();
  mockFsChapbook.writeFile(
    'C:/Games/TwineChapbook/story.html',
    '<html><tw-storydata name="Chapbook VN" format="Chapbook" format-version="1.2.3"></tw-storydata></html>'
  );
  mockFsChapbook.writeFile('C:/Games/TwineChapbook/resources/app.asar', 'asar');

  const peElectron = new SyntheticPEBuilder({ arch: 'x64' })
    .setVersionInfo({ OriginalFilename: 'electron.exe' })
    .build();
  const inspElectron = PEInspector.fromBuffer(peElectron);

  const profileChapbook = await registry.resolve(
    inspElectron,
    'C:/Games/TwineChapbook/App.exe',
    ['App.exe', 'resources', 'story.html'],
    mockFsChapbook
  );
  assert.strictEqual(profileChapbook.tag, 'HTML');
  assert.strictEqual(profileChapbook.family, 'html-webgl');
  assert.strictEqual(profileChapbook.variant, 'twine-chapbook');
  assert.strictEqual(profileChapbook.runtime, 'electron');
  assert.strictEqual(profileChapbook.detectedBy.includes('Chapbook'), true);

  // 4. Twine Snowman format
  const mockFsSnowman = new MockFileSystemProvider();
  mockFsSnowman.writeFile(
    'C:/Games/TwineSnowman/game.html',
    '<html><tw-storydata name="Snowman Story" format="Snowman" format-version="2.0.0"></tw-storydata></html>'
  );

  const profileSnowman = await registry.resolve(
    inspClean,
    'C:/Games/TwineSnowman/run.exe',
    ['run.exe', 'game.html'],
    mockFsSnowman
  );
  assert.strictEqual(profileSnowman.tag, 'HTML');
  assert.strictEqual(profileSnowman.family, 'html-webgl');
  assert.strictEqual(profileSnowman.variant, 'twine-snowman');
  assert.strictEqual(profileSnowman.detectedBy.includes('Snowman'), true);
});
