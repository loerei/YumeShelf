/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AppBundleInspector,
  resolveBundleRoot,
  YumeEngine,
} from '../dist/index.js';
import type { AppBundleInspectionResult } from '../dist/types.d.ts';
import { MockFileSystemProvider } from './fixtures/mock-fs-provider.ts';

function encodeBPlistString(str: string): Buffer {
  const strBuf = Buffer.from(str, 'utf8');
  const len = strBuf.length;
  if (len < 15) {
    return Buffer.concat([Buffer.from([0x50 | len]), strBuf]);
  }
  let intLenMarker: Buffer;
  if (len < 256) {
    intLenMarker = Buffer.from([0x10, len]);
  } else {
    const b = Buffer.alloc(3);
    b[0] = 0x11;
    b.writeUInt16BE(len, 1);
    intLenMarker = b;
  }
  return Buffer.concat([Buffer.from([0x5f]), intLenMarker, strBuf]);
}

function createSyntheticBPlistDict(dict: Record<string, string>): Buffer {
  const header = Buffer.from('bplist00');
  const entries = Object.entries(dict);
  const count = entries.length;

  const dictMarker = Buffer.from([
    0xd0 | count,
    ...entries.map((_, i) => i + 1),
    ...entries.map((_, i) => count + i + 1),
  ]);

  const keyBuffers = entries.map(([k]) => encodeBPlistString(k));
  const valBuffers = entries.map(([, v]) => encodeBPlistString(v));
  const objects = [dictMarker, ...keyBuffers, ...valBuffers];

  const offsets: number[] = [];
  let currentOffset = header.length;
  for (const obj of objects) {
    offsets.push(currentOffset);
    currentOffset += obj.length;
  }

  const offsetTableOffset = currentOffset;
  const numObjects = objects.length;
  const offsetTable = Buffer.alloc(numObjects);
  for (let i = 0; i < numObjects; i++) {
    offsetTable.writeUInt8(offsets[i], i);
  }

  const trailer = Buffer.alloc(32);
  trailer.writeUInt8(1, 6);
  trailer.writeUInt8(1, 7);
  trailer.writeBigUInt64BE(BigInt(numObjects), 8);
  trailer.writeBigUInt64BE(0n, 16);
  trailer.writeBigUInt64BE(BigInt(offsetTableOffset), 24);

  return Buffer.concat([header, ...objects, offsetTable, trailer]);
}

test('macOS .app Bundle Metadata Inspector & resolveBundleRoot (@yumeshelf/engine)', async (t) => {
  await t.test('resolveBundleRoot path boundary detection and normalization', async (st) => {
    await st.test('resolves root for outer .app path without trailing slash', () => {
      assert.equal(resolveBundleRoot('/Applications/Game.app'), '/Applications/Game.app');
    });

    await st.test('resolves root for outer .app path with single or multiple trailing slashes', () => {
      assert.equal(resolveBundleRoot('/Applications/Game.app/'), '/Applications/Game.app');
      assert.equal(resolveBundleRoot('/Applications/Game.app///'), '/Applications/Game.app');
    });

    await st.test('resolves root for nested executable inside Contents/MacOS/', () => {
      assert.equal(
        resolveBundleRoot('/Applications/Game.app/Contents/MacOS/Game'),
        '/Applications/Game.app'
      );
    });

    await st.test('resolves root for nested Contents/Info.plist', () => {
      assert.equal(
        resolveBundleRoot('/Applications/Game.app/Contents/Info.plist'),
        '/Applications/Game.app'
      );
    });

    await st.test('resolves root for nested resources', () => {
      assert.equal(
        resolveBundleRoot('/Applications/Game.app/Contents/Resources/app.nw/index.html'),
        '/Applications/Game.app'
      );
    });

    await st.test('normalizes Windows backslashes and drive letters', () => {
      assert.equal(
        resolveBundleRoot('C:\\Games\\MyGame.app\\Contents\\MacOS\\MyGame.exe'),
        'C:/Games/MyGame.app'
      );
      assert.equal(
        resolveBundleRoot('D:\\Games\\VisualNovel.app\\'),
        'D:/Games/VisualNovel.app'
      );
    });

    await st.test('resolves relative bundle paths', () => {
      assert.equal(resolveBundleRoot('Game.app'), 'Game.app');
      assert.equal(resolveBundleRoot('Game.app/'), 'Game.app');
      assert.equal(resolveBundleRoot('./Game.app/Contents/MacOS/Game'), './Game.app');
      assert.equal(resolveBundleRoot('../Games/Game.app/Contents/MacOS/Game'), '../Games/Game.app');
    });

    await st.test('resolves innermost bundle root for nested helper bundles', () => {
      assert.equal(
        resolveBundleRoot(
          '/Applications/Parent.app/Contents/Frameworks/Helper.app/Contents/MacOS/Helper'
        ),
        '/Applications/Parent.app/Contents/Frameworks/Helper.app'
      );
    });

    await st.test('returns null for non-bundle paths', () => {
      assert.equal(resolveBundleRoot('/Applications/NotAnApp/Contents/MacOS/Game'), null);
      assert.equal(resolveBundleRoot('C:/Games/StandaloneGame.exe'), null);
      assert.equal(resolveBundleRoot('/Applications/Game.application'), null);
      assert.equal(resolveBundleRoot('/Applications/Game.apple'), null);
      assert.equal(resolveBundleRoot('/Applications/apple/foo'), null);
    });

    await st.test('returns null for hidden dotfile named .app without name stem', () => {
      assert.equal(resolveBundleRoot('/Applications/.app/Contents/MacOS/Game'), null);
      assert.equal(resolveBundleRoot('.app'), null);
      assert.equal(resolveBundleRoot('.app/'), null);
    });

    await st.test('returns null for empty, null, or undefined input', () => {
      assert.equal(resolveBundleRoot(''), null);
      assert.equal(resolveBundleRoot(null as any), null);
      assert.equal(resolveBundleRoot(undefined as any), null);
    });

    await st.test('handles case-insensitive .app extension', () => {
      assert.equal(
        resolveBundleRoot('/Games/VisualNovel.APP/Contents/MacOS/VN'),
        '/Games/VisualNovel.APP'
      );
      assert.equal(resolveBundleRoot('/Games/VisualNovel.App/'), '/Games/VisualNovel.App');
    });
  });

  await t.test('AppBundleInspector.fromPath with synthetic XML Info.plist', async (st) => {
    await st.test('parses XML Info.plist and populates all inspection fields', async () => {
      const fs = new MockFileSystemProvider();
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>SuperGame</string>
  <key>CFBundleIdentifier</key>
  <string>com.yumeshelf.supergame</string>
  <key>CFBundleName</key>
  <string>Super Game</string>
  <key>CFBundleDisplayName</key>
  <string>Super Game HD</string>
</dict>
</plist>`;

      fs.writeFile('/Applications/SuperGame.app/Contents/Info.plist', xml);
      fs.writeFile('/Applications/SuperGame.app/Contents/MacOS/SuperGame', Buffer.from([0xca, 0xfe, 0xba, 0xbe]));

      const result = await AppBundleInspector.fromPath('/Applications/SuperGame.app', fs);
      assert.ok(result);
      assert.equal(result.bundlePath, '/Applications/SuperGame.app');
      assert.equal(result.executablePath, '/Applications/SuperGame.app/Contents/MacOS/SuperGame');
      assert.equal(result.executableName, 'SuperGame');
      assert.equal(result.bundleIdentifier, 'com.yumeshelf.supergame');
      assert.equal(result.bundleName, 'Super Game');
      assert.equal(result.displayName, 'Super Game HD');
    });

    await st.test('strips leading path separators from CFBundleExecutable', async () => {
      const fs = new MockFileSystemProvider();
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>/GameBinary</string>
</dict>
</plist>`;

      fs.writeFile('/Applications/Test.app/Contents/Info.plist', xml);
      fs.writeFile('/Applications/Test.app/Contents/MacOS/GameBinary', 'dummy binary');

      const result = await AppBundleInspector.fromPath('/Applications/Test.app', fs);
      assert.ok(result);
      assert.equal(result.executableName, 'GameBinary');
      assert.equal(result.executablePath, '/Applications/Test.app/Contents/MacOS/GameBinary');
      assert.equal(result.bundleIdentifier, null);
      assert.equal(result.bundleName, null);
      assert.equal(result.displayName, null);
    });

    await st.test('resolves when invoked with nested executable path', async () => {
      const fs = new MockFileSystemProvider();
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>InnerGame</string>
  <key>CFBundleIdentifier</key>
  <string>com.yumeshelf.inner</string>
</dict>
</plist>`;

      fs.writeFile('/Games/Inner.app/Contents/Info.plist', xml);
      fs.writeFile('/Games/Inner.app/Contents/MacOS/InnerGame', 'dummy');

      const result = await AppBundleInspector.fromPath('/Games/Inner.app/Contents/MacOS/InnerGame', fs);
      assert.ok(result);
      assert.equal(result.bundlePath, '/Games/Inner.app');
      assert.equal(result.executablePath, '/Games/Inner.app/Contents/MacOS/InnerGame');
      assert.equal(result.executableName, 'InnerGame');
      assert.equal(result.bundleIdentifier, 'com.yumeshelf.inner');
    });
  });

  await t.test('AppBundleInspector.fromPath with synthetic binary bplist00 Info.plist', async (st) => {
    await st.test('parses binary bplist00 and extracts metadata and executable', async () => {
      const fs = new MockFileSystemProvider();
      const bplistBuf = createSyntheticBPlistDict({
        CFBundleExecutable: 'BinaryApp',
        CFBundleIdentifier: 'org.yumeshelf.binaryapp',
        CFBundleName: 'BinaryApp',
        CFBundleDisplayName: 'Binary App Visual Novel',
      });

      fs.writeFile('/Games/BinaryApp.app/Contents/Info.plist', bplistBuf);
      fs.writeFile('/Games/BinaryApp.app/Contents/MacOS/BinaryApp', 'binary data');

      const result = await AppBundleInspector.fromPath('/Games/BinaryApp.app', fs);
      assert.ok(result);
      assert.equal(result.bundlePath, '/Games/BinaryApp.app');
      assert.equal(result.executablePath, '/Games/BinaryApp.app/Contents/MacOS/BinaryApp');
      assert.equal(result.executableName, 'BinaryApp');
      assert.equal(result.bundleIdentifier, 'org.yumeshelf.binaryapp');
      assert.equal(result.bundleName, 'BinaryApp');
      assert.equal(result.displayName, 'Binary App Visual Novel');
    });
  });

  await t.test('Path traversal sanitization and security defenses', async (st) => {
    await st.test('rejects relative traversal and falls back to Contents/MacOS/<bundle-name> when present', async () => {
      const fs = new MockFileSystemProvider();
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>../../../../etc/passwd</string>
  <key>CFBundleIdentifier</key>
  <string>com.attack.traversal</string>
</dict>
</plist>`;

      fs.writeFile('/Applications/Victim.app/Contents/Info.plist', xml);
      fs.writeFile('/Applications/Victim.app/Contents/MacOS/Victim', 'safe binary');

      const result = await AppBundleInspector.fromPath('/Applications/Victim.app', fs);
      assert.ok(result);
      assert.equal(result.executableName, 'Victim');
      assert.equal(result.executablePath, '/Applications/Victim.app/Contents/MacOS/Victim');
      assert.equal(result.bundleIdentifier, 'com.attack.traversal');
    });

    await st.test('rejects relative traversal and returns null when fallback does not exist', async () => {
      const fs = new MockFileSystemProvider();
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>../../../../bin/sh</string>
</dict>
</plist>`;

      fs.writeFile('/Applications/Evil.app/Contents/Info.plist', xml);
      const result = await AppBundleInspector.fromPath('/Applications/Evil.app', fs);
      assert.equal(result, null);
    });

    await st.test('rejects absolute paths and returns null when fallback does not exist', async () => {
      const fs = new MockFileSystemProvider();
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>/bin/bash</string>
</dict>
</plist>`;

      fs.writeFile('/Applications/Absolute.app/Contents/Info.plist', xml);
      const result = await AppBundleInspector.fromPath('/Applications/Absolute.app', fs);
      assert.equal(result, null);
    });

    await st.test('rejects subdirectories escaping direct Contents/MacOS/ containment', async () => {
      const fs = new MockFileSystemProvider();
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>sub/evil</string>
</dict>
</plist>`;

      fs.writeFile('/Applications/SubDir.app/Contents/Info.plist', xml);
      const result = await AppBundleInspector.fromPath('/Applications/SubDir.app', fs);
      assert.equal(result, null);
    });

    await st.test('rejects dot and dot-dot executables', async () => {
      const fs = new MockFileSystemProvider();
      const xmlDot = `<plist version="1.0"><dict><key>CFBundleExecutable</key><string>.</string></dict></plist>`;
      fs.writeFile('/Applications/Dot.app/Contents/Info.plist', xmlDot);
      assert.equal(await AppBundleInspector.fromPath('/Applications/Dot.app', fs), null);

      const xmlDotDot = `<plist version="1.0"><dict><key>CFBundleExecutable</key><string>..</string></dict></plist>`;
      fs.writeFile('/Applications/DotDot.app/Contents/Info.plist', xmlDotDot);
      assert.equal(await AppBundleInspector.fromPath('/Applications/DotDot.app', fs), null);
    });

    await st.test('rejects null byte injections', async () => {
      const fs = new MockFileSystemProvider();
      const xml = `<plist version="1.0"><dict><key>CFBundleExecutable</key><string>Game\0Inject</string></dict></plist>`;
      fs.writeFile('/Applications/NullByte.app/Contents/Info.plist', xml);
      assert.equal(await AppBundleInspector.fromPath('/Applications/NullByte.app', fs), null);
    });
  });

  await t.test('Missing or malformed Info.plist fallback to Contents/MacOS/', async (st) => {
    await st.test('falls back to scanning Contents/MacOS/ when Info.plist is absent', async () => {
      const fs = new MockFileSystemProvider();
      fs.writeFile('/Games/NoPlist.app/Contents/MacOS/FallbackRunner', 'runner binary');

      const result = await AppBundleInspector.fromPath('/Games/NoPlist.app', fs);
      assert.ok(result);
      assert.equal(result.bundlePath, '/Games/NoPlist.app');
      assert.equal(result.executablePath, '/Games/NoPlist.app/Contents/MacOS/FallbackRunner');
      assert.equal(result.executableName, 'FallbackRunner');
      assert.equal(result.bundleIdentifier, null);
      assert.equal(result.bundleName, null);
      assert.equal(result.displayName, null);
    });

    await st.test('ignores hidden files such as .DS_Store when scanning Contents/MacOS/', async () => {
      const fs = new MockFileSystemProvider();
      fs.writeFile('/Games/HiddenStore.app/Contents/MacOS/.DS_Store', 'junk');
      fs.writeFile('/Games/HiddenStore.app/Contents/MacOS/ActualGame', 'game code');

      const result = await AppBundleInspector.fromPath('/Games/HiddenStore.app', fs);
      assert.ok(result);
      assert.equal(result.executableName, 'ActualGame');
      assert.equal(result.executablePath, '/Games/HiddenStore.app/Contents/MacOS/ActualGame');
    });

    await st.test('returns null when Info.plist is absent and Contents/MacOS/ is empty', async () => {
      const fs = new MockFileSystemProvider();
      fs.mkdir('/Games/EmptyBundle.app/Contents/MacOS');

      const result = await AppBundleInspector.fromPath('/Games/EmptyBundle.app', fs);
      assert.equal(result, null);
    });

    await st.test('falls back to scanning Contents/MacOS/ when Info.plist is malformed', async () => {
      const fs = new MockFileSystemProvider();
      fs.writeFile('/Games/Malformed.app/Contents/Info.plist', 'NOT VALID XML OR PLIST DATA');
      fs.writeFile('/Games/Malformed.app/Contents/MacOS/RecoveredBin', 'recovered');

      const result = await AppBundleInspector.fromPath('/Games/Malformed.app', fs);
      assert.ok(result);
      assert.equal(result.executableName, 'RecoveredBin');
      assert.equal(result.executablePath, '/Games/Malformed.app/Contents/MacOS/RecoveredBin');
      assert.equal(result.bundleIdentifier, null);
    });

    await st.test('returns null when Info.plist is malformed and Contents/MacOS/ is empty', async () => {
      const fs = new MockFileSystemProvider();
      fs.writeFile('/Games/MalformedEmpty.app/Contents/Info.plist', '<<<invalid>>>');

      const result = await AppBundleInspector.fromPath('/Games/MalformedEmpty.app', fs);
      assert.equal(result, null);
    });
  });

  await t.test('YumeEngine.inspectAppBundle facade method', async (st) => {
    await st.test('calls AppBundleInspector.fromPath and returns result', async () => {
      const fs = new MockFileSystemProvider();
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>FacadeApp</string>
  <key>CFBundleIdentifier</key>
  <string>com.yumeshelf.facade</string>
</dict>
</plist>`;

      fs.writeFile('/Applications/Facade.app/Contents/Info.plist', xml);
      fs.writeFile('/Applications/Facade.app/Contents/MacOS/FacadeApp', 'bin');

      const result = await YumeEngine.inspectAppBundle('/Applications/Facade.app', fs);
      assert.ok(result);
      assert.equal(result.executableName, 'FacadeApp');
      assert.equal(result.bundleIdentifier, 'com.yumeshelf.facade');
    });
  });
});
