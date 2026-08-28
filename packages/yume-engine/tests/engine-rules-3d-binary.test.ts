/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore
import {
  EngineRuleRegistry,
  PEInspector,
  UnityRule,
  UnrealEngineRule,
  GodotRule,
  FlashRule,
  JavaRule,
} from '../dist/index.js';
// @ts-ignore
import { SyntheticPEBuilder } from './fixtures/synthetic-pe-builder.ts';
// @ts-ignore
import { MockFileSystemProvider } from './fixtures/mock-fs-provider.ts';

test('Unity Engine Rules: IL2CPP vs Mono classification', async () => {
  const registry = new EngineRuleRegistry();

  // 1. Unity IL2CPP 64-bit via GameAssembly.dll import
  const peIl2cpp = new SyntheticPEBuilder({ arch: 'x64' })
    .addImport('GameAssembly.dll', ['il2cpp_init'])
    .build();
  const inspIl2cpp = PEInspector.fromBuffer(peIl2cpp);
  const profileIl2cpp = await registry.resolve(inspIl2cpp, 'C:/Games/UnityGame/Game.exe');

  assert.strictEqual(profileIl2cpp.tag, 'Unity');
  assert.strictEqual(profileIl2cpp.family, 'unity');
  assert.strictEqual(profileIl2cpp.variant, 'il2cpp');
  assert.strictEqual(profileIl2cpp.arch, 'x64');
  assert.strictEqual(profileIl2cpp.runtime, 'native');

  // 2. Unity Mono 32-bit via UnityPlayer.dll import
  const peMono = new SyntheticPEBuilder({ arch: 'x86' })
    .addImport('UnityPlayer.dll', ['UnityMain'])
    .build();
  const inspMono = PEInspector.fromBuffer(peMono);
  const profileMono = await registry.resolve(inspMono, 'C:/Games/UnityMono/Game.exe');

  assert.strictEqual(profileMono.tag, 'Unity');
  assert.strictEqual(profileMono.family, 'unity');
  assert.strictEqual(profileMono.variant, 'mono');
  assert.strictEqual(profileMono.arch, 'x86');
  assert.strictEqual(profileMono.runtime, 'mono');

  // 3. Unity Mono via VersionInfo CompanyName
  const peMonoVinfo = new SyntheticPEBuilder({ arch: 'x64' })
    .setVersionInfo({ CompanyName: 'Unity Technologies', FileDescription: 'Unity Player' })
    .build();
  const inspMonoVinfo = PEInspector.fromBuffer(peMonoVinfo);
  const profileMonoVinfo = await registry.resolve(inspMonoVinfo, 'C:/Games/UnityVinfo/Game.exe');

  assert.strictEqual(profileMonoVinfo.tag, 'Unity');
  assert.strictEqual(profileMonoVinfo.variant, 'mono');

  // 4. Unity IL2CPP via global-metadata.dat magic
  const peClean = new SyntheticPEBuilder({ arch: 'x64' }).build();
  const inspClean = PEInspector.fromBuffer(peClean);

  const mockFs = new MockFileSystemProvider();
  const metaBuf = Buffer.alloc(4);
  metaBuf.writeUInt32LE(0xFAB11BAF, 0);
  mockFs.writeFile('C:/Games/UnityData/Game_Data/Managed/Metadata/global-metadata.dat', metaBuf);

  const profileMeta = await registry.resolve(
    inspClean,
    'C:/Games/UnityData/Game.exe',
    ['Game.exe', 'Game_Data'],
    mockFs
  );

  assert.strictEqual(profileMeta.tag, 'Unity');
  assert.strictEqual(profileMeta.variant, 'il2cpp');
});

test('Unreal Engine Rules: Shipping Exe, Engine/ directory, *.uproject, UE PAK magic', async () => {
  const registry = new EngineRuleRegistry();

  // 1. Shipping executable name
  const pe = new SyntheticPEBuilder({ arch: 'x64' }).build();
  const insp = PEInspector.fromBuffer(pe);
  const profileShipping = await registry.resolve(insp, 'C:/Games/UEGame/Binaries/Win64/MyGame-Win64-Shipping.exe');

  assert.strictEqual(profileShipping.tag, 'Unreal Engine');
  assert.strictEqual(profileShipping.family, 'unreal');
  assert.strictEqual(profileShipping.variant, 'ue4-ue5');
  assert.strictEqual(profileShipping.saveStrategy, 'unreal-sav');

  // 2. Engine directory marker
  const profileEngineDir = await registry.resolve(
    insp,
    'C:/Games/UEGame/Game.exe',
    ['Game.exe', 'Engine', 'MyGame']
  );
  assert.strictEqual(profileEngineDir.tag, 'Unreal Engine');

  // 3. *.uproject marker
  const profileUProj = await registry.resolve(
    insp,
    'C:/Games/UEGame/Game.exe',
    ['Game.exe', 'MyGame.uproject']
  );
  assert.strictEqual(profileUProj.tag, 'Unreal Engine');

  // 4. UE PAK Magic header
  const mockFs = new MockFileSystemProvider();
  const pakBuf = Buffer.alloc(128);
  pakBuf.writeUInt32LE(0x5A6F12E1, 0); // UE PAK Magic
  mockFs.writeFile('C:/Games/UEGame/pakchunk0.pak', pakBuf);

  const profilePak = await registry.resolve(
    insp,
    'C:/Games/UEGame/Game.exe',
    ['Game.exe', 'pakchunk0.pak'],
    mockFs
  );
  assert.strictEqual(profilePak.tag, 'Unreal Engine');
});

test('Godot Engine Rules: VersionInfo, project.godot, .pck extension, GDPC magic', async () => {
  const registry = new EngineRuleRegistry();

  // 1. VersionInfo FileDescription Godot
  const peGodot = new SyntheticPEBuilder({ arch: 'x64' })
    .setVersionInfo({ FileDescription: 'Godot Engine', ProductName: 'Godot Engine' })
    .build();
  const inspGodot = PEInspector.fromBuffer(peGodot);
  const profileGodotVinfo = await registry.resolve(inspGodot, 'C:/Games/GodotGame/Game.exe');

  assert.strictEqual(profileGodotVinfo.tag, 'Godot');
  assert.strictEqual(profileGodotVinfo.family, 'godot');
  assert.strictEqual(profileGodotVinfo.saveStrategy, 'godot');

  // 2. project.godot marker
  const pe = new SyntheticPEBuilder({ arch: 'x64' }).build();
  const insp = PEInspector.fromBuffer(pe);
  const profileProj = await registry.resolve(
    insp,
    'C:/Games/GodotGame/Game.exe',
    ['Game.exe', 'project.godot']
  );
  assert.strictEqual(profileProj.tag, 'Godot');

  // 3. .pck container with GDPC magic (0x43504447)
  const mockFs = new MockFileSystemProvider();
  const pckBuf = Buffer.alloc(64);
  pckBuf.writeUInt32LE(0x43504447, 0); // 'GDPC'
  mockFs.writeFile('C:/Games/GodotGame/Game.pck', pckBuf);

  const profilePck = await registry.resolve(
    insp,
    'C:/Games/GodotGame/Game.exe',
    ['Game.exe', 'Game.pck'],
    mockFs
  );
  assert.strictEqual(profilePck.tag, 'Godot');
});

test('Flash & Adobe AIR Rules: *.swf, Adobe AIR folder, FlashPlayer.exe', async () => {
  const registry = new EngineRuleRegistry();
  const pe = new SyntheticPEBuilder({ arch: 'x86' }).build();
  const insp = PEInspector.fromBuffer(pe);

  // 1. SWF extension
  const profileSwf = await registry.resolve(
    insp,
    'C:/Games/FlashGame/FlashGame.exe',
    ['FlashGame.exe', 'game.swf']
  );
  assert.strictEqual(profileSwf.tag, 'Flash');
  assert.strictEqual(profileSwf.family, 'flash');
  assert.strictEqual(profileSwf.runtime, 'flash');

  // 2. Adobe AIR directory marker
  const profileAir = await registry.resolve(
    insp,
    'C:/Games/AirGame/AirGame.exe',
    ['AirGame.exe', 'Adobe AIR', 'META-INF']
  );
  assert.strictEqual(profileAir.tag, 'Flash');
  assert.strictEqual(profileAir.variant, 'air');

  // 3. FlashPlayer executable name
  const profilePlayer = await registry.resolve(
    insp,
    'C:/Games/FlashGame/FlashPlayer.exe',
    ['FlashPlayer.exe']
  );
  assert.strictEqual(profilePlayer.tag, 'Flash');
});

test('Java Rules: *.jar, javaw.exe, jvm.dll import', async () => {
  const registry = new EngineRuleRegistry();

  // 1. *.jar file marker
  const pe = new SyntheticPEBuilder({ arch: 'x64' }).build();
  const insp = PEInspector.fromBuffer(pe);
  const profileJar = await registry.resolve(
    insp,
    'C:/Games/JavaGame/Game.exe',
    ['Game.exe', 'game.jar']
  );
  assert.strictEqual(profileJar.tag, 'Java');
  assert.strictEqual(profileJar.family, 'java');
  assert.strictEqual(profileJar.runtime, 'jvm');

  // 2. jvm.dll import
  const peJvm = new SyntheticPEBuilder({ arch: 'x64' })
    .addImport('jvm.dll', ['JNI_CreateJavaVM'])
    .build();
  const inspJvm = PEInspector.fromBuffer(peJvm);
  const profileJvm = await registry.resolve(inspJvm, 'C:/Games/JavaGame/Launcher.exe');
  assert.strictEqual(profileJvm.tag, 'Java');

  // 3. javaw.exe name
  const profileJavaw = await registry.resolve(insp, 'C:/Games/Java/bin/javaw.exe', ['javaw.exe']);
  assert.strictEqual(profileJavaw.tag, 'Java');
});

test('EngineRuleRegistry: Dynamic rule registration, custom priority, and clearing', async () => {
  const customRegistry = new EngineRuleRegistry();
  customRegistry.clearRules();
  assert.strictEqual(customRegistry.getRules().length, 0);

  // Register custom high-priority rule
  customRegistry.registerRule({
    name: 'custom-engine',
    priority: 5,
    match(ctx: any) {
      if (ctx.filesLowerSet.has('custom.engine')) {
        return {
          tag: 'Others',
          family: 'unknown',
          arch: ctx.pe.is64Bit ? 'x64' : 'x86',
          runtime: 'native',
          saveStrategy: 'custom',
          detectedBy: 'Custom Engine Rule',
        };
      }
      return null;
    },
  });

  assert.strictEqual(customRegistry.getRules().length, 1);

  const pe = new SyntheticPEBuilder({ arch: 'x64' }).build();
  const insp = PEInspector.fromBuffer(pe);

  const matched = await customRegistry.resolve(
    insp,
    'C:/Games/CustomGame/Game.exe',
    ['Game.exe', 'custom.engine']
  );
  assert.strictEqual(matched.detectedBy, 'Custom Engine Rule');

  const unmatched = await customRegistry.resolve(
    insp,
    'C:/Games/CustomGame/Game.exe',
    ['Game.exe']
  );
  assert.strictEqual(unmatched.tag, 'Others');
  assert.strictEqual(unmatched.detectedBy, 'Native PE Executable (Unclassified)');
});
