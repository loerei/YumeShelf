/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  YumeEngine,
  AppBundleInspector,
  resolveBundleRoot,
  classifyAppBundle,
  MACHO_MAGIC_64_BE,
  MACHO_MAGIC_64_LE,
  MACHO_MAGIC_32_BE,
  FAT_MAGIC_64_BE,
  CPU_TYPE_X86,
  CPU_TYPE_X86_64,
  CPU_TYPE_ARM64,
} from '../dist/index.js';
// @ts-ignore
import { MockFileSystemProvider } from './fixtures/mock-fs-provider.ts';

function buildMachO64(options: { cputype?: number; isLittleEndian?: boolean }): Buffer {
  const isLE = options.isLittleEndian ?? false;
  const magic = isLE ? MACHO_MAGIC_64_LE : MACHO_MAGIC_64_BE;
  const cputype = options.cputype ?? CPU_TYPE_X86_64;
  const buf = Buffer.alloc(32);
  buf.writeUInt32BE(magic, 0);
  if (isLE) {
    buf.writeInt32LE(cputype, 4);
  } else {
    buf.writeInt32BE(cputype, 4);
  }
  return buf;
}

function buildMachO32(options: { cputype?: number }): Buffer {
  const buf = Buffer.alloc(28);
  buf.writeUInt32BE(MACHO_MAGIC_32_BE, 0);
  buf.writeInt32BE(options.cputype ?? CPU_TYPE_X86, 4);
  return buf;
}

function buildFat64(): Buffer {
  const buf = Buffer.alloc(1024);
  buf.writeUInt32BE(FAT_MAGIC_64_BE, 0);
  buf.writeUInt32BE(2, 4); // 2 architectures
  // Entry 1: x64
  buf.writeInt32BE(CPU_TYPE_X86_64, 8);
  buf.writeBigUInt64BE(128n, 16);
  buf.writeBigUInt64BE(256n, 24);
  // Entry 2: arm64
  buf.writeInt32BE(CPU_TYPE_ARM64, 40);
  buf.writeBigUInt64BE(512n, 48);
  buf.writeBigUInt64BE(256n, 56);
  return buf;
}

test('macOS Bundle Layout Engine Classification in YumeEngine', async (t) => {
  await t.test('Unity bundle layout classification', async (st) => {
    await st.test('classifies Unity bundle with Contents/Resources/Data/ and arm64 binary', async () => {
      const fs = new MockFileSystemProvider();
      const arm64Bin = buildMachO64({ cputype: CPU_TYPE_ARM64 });
      fs.writeFile('/Applications/UnityGame.app/Contents/MacOS/UnityGame', arm64Bin);
      fs.mkdir('/Applications/UnityGame.app/Contents/Resources/Data');

      const profile = await YumeEngine.inspectExecutable('/Applications/UnityGame.app', fs);
      assert.strictEqual(profile.family, 'unity');
      assert.strictEqual(profile.tag, 'Unity');
      assert.strictEqual(profile.variant, 'standard');
      assert.strictEqual(profile.arch, 'arm64');
      assert.strictEqual(profile.runtime, 'native');
      assert.strictEqual(profile.saveStrategy, 'unity-appsupport-playerprefs');
      assert.strictEqual(profile.detectedBy, 'macOS App Bundle (Unity)');
    });

    await st.test('classifies Unity bundle with Contents/Frameworks/UnityPlayer.dylib and x64 binary', async () => {
      const fs = new MockFileSystemProvider();
      const x64Bin = buildMachO64({ cputype: CPU_TYPE_X86_64 });
      fs.writeFile('/Applications/UnityFrameworkGame.app/Contents/MacOS/Game', x64Bin);
      fs.writeFile('/Applications/UnityFrameworkGame.app/Contents/Frameworks/UnityPlayer.dylib', 'dylib');

      const profile = await YumeEngine.inspectGame('/Applications/UnityFrameworkGame.app/Contents/MacOS/Game', fs);
      assert.strictEqual(profile.family, 'unity');
      assert.strictEqual(profile.tag, 'Unity');
      assert.strictEqual(profile.arch, 'x64');
      assert.strictEqual(profile.saveStrategy, 'unity-appsupport-playerprefs');
      assert.strictEqual(profile.detectedBy, 'macOS App Bundle (Unity)');
    });
  });

  await t.test('RPG Maker MV / MZ bundle layout classification', async (st) => {
    await st.test('classifies RPG Maker MV bundle with Contents/Resources/app.nw and www/ directory', async () => {
      const fs = new MockFileSystemProvider();
      const x64Bin = buildMachO64({ cputype: CPU_TYPE_X86_64 });
      fs.writeFile('/Games/RPGMV.app/Contents/MacOS/RPGMV', x64Bin);
      fs.mkdir('/Games/RPGMV.app/Contents/Resources/app.nw/www');
      fs.writeFile('/Games/RPGMV.app/Contents/Resources/app.nw/package.json', '{"name":"rpg-game"}');

      const profile = await YumeEngine.inspectExecutable('/Games/RPGMV.app', fs);
      assert.strictEqual(profile.family, 'rpg-maker');
      assert.strictEqual(profile.tag, 'RPGM');
      assert.strictEqual(profile.variant, 'mv');
      assert.strictEqual(profile.arch, 'x64');
      assert.strictEqual(profile.runtime, 'nwjs');
      assert.strictEqual(profile.saveStrategy, 'rpgmaker-bundle-data');
      assert.strictEqual(profile.detectedBy, 'macOS App Bundle (RPG Maker)');
    });

    await st.test('classifies RPG Maker MZ bundle with Contents/Resources/app.nw and rmmz_core.js', async () => {
      const fs = new MockFileSystemProvider();
      const arm64Bin = buildMachO64({ cputype: CPU_TYPE_ARM64 });
      fs.writeFile('/Games/RPGMZ.app/Contents/MacOS/RPGMZ', arm64Bin);
      fs.mkdir('/Games/RPGMZ.app/Contents/Resources/app.nw');
      fs.writeFile('/Games/RPGMZ.app/Contents/Resources/app.nw/js/rmmz_core.js', '// MZ core');

      const profile = await YumeEngine.inspectExecutable('/Games/RPGMZ.app', fs);
      assert.strictEqual(profile.family, 'rpg-maker');
      assert.strictEqual(profile.tag, 'RPGM');
      assert.strictEqual(profile.variant, 'mz');
      assert.strictEqual(profile.arch, 'arm64');
      assert.strictEqual(profile.runtime, 'nwjs');
      assert.strictEqual(profile.saveStrategy, 'rpgmaker-bundle-data');
      assert.strictEqual(profile.detectedBy, 'macOS App Bundle (RPG Maker)');
    });
  });

  await t.test("Ren'Py bundle layout classification", async (st) => {
    await st.test('classifies RenPy bundle with Contents/Resources/autorun and x86 binary', async () => {
      const fs = new MockFileSystemProvider();
      const x86Bin = buildMachO32({ cputype: CPU_TYPE_X86 });
      fs.writeFile('/Games/RenPyGame.app/Contents/MacOS/RenPyGame', x86Bin);
      fs.mkdir('/Games/RenPyGame.app/Contents/Resources/autorun');

      const profile = await YumeEngine.inspectExecutable('/Games/RenPyGame.app', fs);
      assert.strictEqual(profile.family, 'renpy');
      assert.strictEqual(profile.tag, "Ren'Py");
      assert.strictEqual(profile.variant, 'standard');
      assert.strictEqual(profile.arch, 'x86');
      assert.strictEqual(profile.runtime, 'python');
      assert.strictEqual(profile.saveStrategy, 'renpy-appsupport-saves');
      assert.strictEqual(profile.detectedBy, "macOS App Bundle (Ren'Py)");
    });

    await st.test('classifies RenPy bundle with .py/.pyo files in Contents/MacOS/', async () => {
      const fs = new MockFileSystemProvider();
      const fatBin = buildFat64();
      fs.writeFile('/Games/RenPyPy.app/Contents/MacOS/game_runner', fatBin);
      fs.writeFile('/Games/RenPyPy.app/Contents/MacOS/game.py', 'import renpy');

      const profile = await YumeEngine.inspectExecutable('/Games/RenPyPy.app', fs);
      assert.strictEqual(profile.family, 'renpy');
      assert.strictEqual(profile.tag, "Ren'Py");
      assert.strictEqual(profile.arch, 'fat');
      assert.strictEqual(profile.runtime, 'python');
      assert.strictEqual(profile.saveStrategy, 'renpy-appsupport-saves');
      assert.strictEqual(profile.detectedBy, "macOS App Bundle (Ren'Py)");
    });
  });

  await t.test('Godot bundle layout classification', async (st) => {
    await st.test('classifies Godot bundle with Contents/Resources/*.pck', async () => {
      const fs = new MockFileSystemProvider();
      const arm64Bin = buildMachO64({ cputype: CPU_TYPE_ARM64 });
      fs.writeFile('/Games/GodotGame.app/Contents/MacOS/GodotGame', arm64Bin);
      fs.writeFile('/Games/GodotGame.app/Contents/Resources/GodotGame.pck', 'pckdata');

      const profile = await YumeEngine.inspectExecutable('/Games/GodotGame.app', fs);
      assert.strictEqual(profile.family, 'godot');
      assert.strictEqual(profile.tag, 'Godot');
      assert.strictEqual(profile.variant, 'standard');
      assert.strictEqual(profile.arch, 'arm64');
      assert.strictEqual(profile.runtime, 'native');
      assert.strictEqual(profile.saveStrategy, 'godot-appsupport-user');
      assert.strictEqual(profile.detectedBy, 'macOS App Bundle (Godot)');
    });
  });

  await t.test('Unreal Engine bundle layout classification', async (st) => {
    await st.test('classifies Unreal bundle with Contents/UE4 and x64 binary', async () => {
      const fs = new MockFileSystemProvider();
      const x64Bin = buildMachO64({ cputype: CPU_TYPE_X86_64 });
      fs.writeFile('/Games/UEGame.app/Contents/MacOS/UEGame', x64Bin);
      fs.mkdir('/Games/UEGame.app/Contents/UE4');

      const profile = await YumeEngine.inspectExecutable('/Games/UEGame.app', fs);
      assert.strictEqual(profile.family, 'unreal');
      assert.strictEqual(profile.tag, 'Unreal Engine');
      assert.strictEqual(profile.variant, 'standard');
      assert.strictEqual(profile.arch, 'x64');
      assert.strictEqual(profile.runtime, 'native');
      assert.strictEqual(profile.saveStrategy, 'unreal-sav');
      assert.strictEqual(profile.detectedBy, 'macOS App Bundle (Unreal Engine)');
    });

    await st.test('classifies Unreal bundle with Shipping executable name and .pak file', async () => {
      const fs = new MockFileSystemProvider();
      const arm64Bin = buildMachO64({ cputype: CPU_TYPE_ARM64 });
      fs.writeFile('/Games/MyProject.app/Contents/MacOS/MyProject-Mac-Shipping', arm64Bin);
      fs.writeFile('/Games/MyProject.app/Contents/Resources/game.pak', 'pakdata');

      const profile = await YumeEngine.inspectExecutable('/Games/MyProject.app', fs);
      assert.strictEqual(profile.family, 'unreal');
      assert.strictEqual(profile.tag, 'Unreal Engine');
      assert.strictEqual(profile.arch, 'arm64');
      assert.strictEqual(profile.saveStrategy, 'unreal-sav');
      assert.strictEqual(profile.detectedBy, 'macOS App Bundle (Unreal Engine)');
    });
  });

  await t.test('Electron and NW.js bundle layout classification', async (st) => {
    await st.test('classifies Electron bundle with Electron Framework.framework and app.asar', async () => {
      const fs = new MockFileSystemProvider();
      const arm64Bin = buildMachO64({ cputype: CPU_TYPE_ARM64 });
      fs.writeFile('/Applications/ElectronApp.app/Contents/MacOS/ElectronApp', arm64Bin);
      fs.mkdir('/Applications/ElectronApp.app/Contents/Frameworks/Electron Framework.framework');
      fs.writeFile('/Applications/ElectronApp.app/Contents/Resources/app.asar', 'asar');

      const profile = await YumeEngine.inspectExecutable('/Applications/ElectronApp.app', fs);
      assert.strictEqual(profile.family, 'html-webgl');
      assert.strictEqual(profile.tag, 'HTML');
      assert.strictEqual(profile.variant, 'electron');
      assert.strictEqual(profile.arch, 'arm64');
      assert.strictEqual(profile.runtime, 'electron');
      assert.strictEqual(profile.saveStrategy, 'custom');
      assert.strictEqual(profile.detectedBy, 'macOS App Bundle (Electron)');
    });

    await st.test('classifies standalone NW.js bundle with package.nw', async () => {
      const fs = new MockFileSystemProvider();
      const x64Bin = buildMachO64({ cputype: CPU_TYPE_X86_64 });
      fs.writeFile('/Applications/NwApp.app/Contents/MacOS/NwApp', x64Bin);
      fs.mkdir('/Applications/NwApp.app/Contents/Resources/package.nw');

      const profile = await YumeEngine.inspectExecutable('/Applications/NwApp.app', fs);
      assert.strictEqual(profile.family, 'html-webgl');
      assert.strictEqual(profile.tag, 'HTML');
      assert.strictEqual(profile.variant, 'nwjs');
      assert.strictEqual(profile.arch, 'x64');
      assert.strictEqual(profile.runtime, 'nwjs');
      assert.strictEqual(profile.saveStrategy, 'custom');
      assert.strictEqual(profile.detectedBy, 'macOS App Bundle (NW.js)');
    });
  });

  await t.test('Unclassified bundle fallback', async (st) => {
    await st.test('returns unclassified profile with arch for bundle without known engine markers', async () => {
      const fs = new MockFileSystemProvider();
      const arm64Bin = buildMachO64({ cputype: CPU_TYPE_ARM64 });
      fs.writeFile('/Applications/CustomApp.app/Contents/MacOS/CustomApp', arm64Bin);

      const profile = await YumeEngine.inspectExecutable('/Applications/CustomApp.app', fs);
      assert.strictEqual(profile.family, 'unknown');
      assert.strictEqual(profile.tag, 'Others');
      assert.strictEqual(profile.variant, 'standard');
      assert.strictEqual(profile.arch, 'arm64');
      assert.strictEqual(profile.runtime, 'native');
      assert.strictEqual(profile.saveStrategy, 'unknown');
      assert.strictEqual(profile.detectedBy, 'macOS App Bundle (Unclassified)');
    });

    await st.test('returns unknown arch when binary is missing or non-Mach-O', async () => {
      const fs = new MockFileSystemProvider();
      fs.mkdir('/Applications/NoBin.app/Contents/MacOS');

      const profile = await YumeEngine.inspectExecutable('/Applications/NoBin.app', fs);
      assert.strictEqual(profile.family, 'unknown');
      assert.strictEqual(profile.tag, 'Others');
      assert.strictEqual(profile.arch, 'unknown');
      assert.strictEqual(profile.detectedBy, 'macOS App Bundle (Unclassified)');
    });
  });

  await t.test('YumeEngine.inspectAppBundle populates profile', async (st) => {
    await st.test('inspectAppBundle includes classified profile on result', async () => {
      const fs = new MockFileSystemProvider();
      const arm64Bin = buildMachO64({ cputype: CPU_TYPE_ARM64 });
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>GameExec</string>
  <key>CFBundleIdentifier</key>
  <string>com.yumeshelf.unitygame</string>
</dict>
</plist>`;
      fs.writeFile('/Applications/UnityWithPlist.app/Contents/Info.plist', xml);
      fs.writeFile('/Applications/UnityWithPlist.app/Contents/MacOS/GameExec', arm64Bin);
      fs.mkdir('/Applications/UnityWithPlist.app/Contents/Resources/Data');

      const result = await YumeEngine.inspectAppBundle('/Applications/UnityWithPlist.app', fs);
      assert.ok(result);
      assert.strictEqual(result.executableName, 'GameExec');
      assert.strictEqual(result.bundleIdentifier, 'com.yumeshelf.unitygame');
      assert.ok(result.profile);
      assert.strictEqual(result.profile.family, 'unity');
      assert.strictEqual(result.profile.arch, 'arm64');
      assert.strictEqual(result.profile.detectedBy, 'macOS App Bundle (Unity)');
    });
  });

  await t.test('Direct classifyAppBundle function', async (st) => {
    await st.test('classifies bundle directly from path without pre-computed inspection', async () => {
      const fs = new MockFileSystemProvider();
      const arm64Bin = buildMachO64({ cputype: CPU_TYPE_ARM64 });
      fs.writeFile('/Applications/DirectGodot.app/Contents/MacOS/DirectGodot', arm64Bin);
      fs.writeFile('/Applications/DirectGodot.app/Contents/Resources/game.pck', 'pck');

      const profile = await classifyAppBundle('/Applications/DirectGodot.app', fs);
      assert.strictEqual(profile.family, 'godot');
      assert.strictEqual(profile.tag, 'Godot');
      assert.strictEqual(profile.arch, 'arm64');
      assert.strictEqual(profile.saveStrategy, 'godot-appsupport-user');
    });
  });
});
