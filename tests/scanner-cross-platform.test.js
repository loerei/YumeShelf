const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
    collectGameCandidates,
    pickPreferredExecutable,
    isRecognizedExecutable,
    createLibraryState
} = require('../dist/main/library-state');

const {
    getExecutableStem,
    buildContinuitySignature
} = require('../dist/main/library-state/continuity');

async function makeTempDir() {
    return fs.mkdtemp(path.join(os.tmpdir(), 'yumeshelf-scanner-test-'));
}

async function writeStubFile(filePath, mode) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, 'stub binary');
    if (mode !== undefined && process.platform !== 'win32') {
        await fs.chmod(filePath, mode);
    }
}

function createMockFs(fileTree) {
    // fileTree: map of normalized relative or absolute paths -> { isFile?: boolean, isDirectory?: boolean, mode?: number, content?: string | Buffer, size?: number }
    function findMeta(targetPath) {
        const resolved = path.resolve(targetPath);
        const rel = path.relative(process.cwd(), resolved);
        const posix = targetPath.replace(/\\/g, '/');
        const resolvedPosix = resolved.replace(/\\/g, '/');
        const relPosix = rel.replace(/\\/g, '/');

        return fileTree[resolved]
            || fileTree[rel]
            || fileTree[targetPath]
            || fileTree[posix]
            || fileTree[resolvedPosix]
            || fileTree[relPosix]
            || null;
    }

    return {
        async readdir(dirPath, options) {
            const normalizedDir = path.resolve(dirPath);
            const directChildren = new Map();

            for (const key of Object.keys(fileTree)) {
                const fullPath = path.resolve(key);
                const parent = path.dirname(fullPath);
                if (parent === normalizedDir) {
                    const name = path.basename(fullPath);
                    const meta = findMeta(key);
                    directChildren.set(name, {
                        name,
                        isFile: () => !!meta?.isFile,
                        isDirectory: () => !!meta?.isDirectory
                    });
                }
            }

            return [...directChildren.values()];
        },
        async stat(filePath) {
            const meta = findMeta(filePath);
            if (!meta) throw new Error(`ENOENT: ${filePath}`);
            const raw = meta.content !== undefined ? meta.content : Buffer.alloc(0);
            const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
            return {
                size: meta.size !== undefined ? meta.size : buf.length,
                mode: meta.mode !== undefined ? meta.mode : (meta.isDirectory ? 0o040755 : 0o100644),
                isFile: () => !!meta.isFile,
                isDirectory: () => !!meta.isDirectory,
                birthtimeMs: Date.now()
            };
        },
        async readFile(filePath, encoding) {
            const meta = findMeta(filePath);
            if (!meta || meta.isDirectory) {
                throw new Error(`ENOENT: no such file or directory, open '${filePath}'`);
            }
            const raw = meta.content !== undefined ? meta.content : Buffer.alloc(0);
            const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
            if (encoding) {
                return buf.toString(encoding);
            }
            return buf;
        },
        async exists(filePath) {
            const meta = findMeta(filePath);
            return !!meta;
        },
        async open(filePath) {
            const meta = findMeta(filePath);
            if (!meta || meta.isDirectory) {
                throw new Error(`ENOENT: no such file or directory, open '${filePath}'`);
            }
            const raw = meta.content !== undefined ? meta.content : Buffer.alloc(0);
            const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
            return {
                async read(arg1, arg2, arg3, arg4) {
                    if (Buffer.isBuffer(arg1)) {
                        const buffer = arg1;
                        const offset = arg2 || 0;
                        const length = arg3 !== undefined ? arg3 : buffer.length;
                        const position = arg4 !== undefined ? arg4 : 0;
                        const slice = buf.subarray(position, Math.min(position + length, buf.length));
                        slice.copy(buffer, offset);
                        return { bytesRead: slice.length, buffer };
                    }
                    const offset = arg1;
                    const length = arg2;
                    return buf.subarray(offset, Math.min(offset + length, buf.length));
                },
                async close() {}
            };
        }
    };
}

test('isRecognizedExecutable correctly identifies Linux and Windows executables', async () => {
    const mockFs = {
        async stat(p) {
            if (p.endsWith('posix_game')) return { mode: 0o100755, isFile: () => true };
            return { mode: 0o100644, isFile: () => true };
        }
    };

    const exeEntry = { name: 'Game.exe', isFile: () => true };
    const x86_64Entry = { name: 'Game.x86_64', isFile: () => true };
    const appImageEntry = { name: 'Game.AppImage', isFile: () => true };
    const shEntry = { name: 'start.sh', isFile: () => true };
    const posixEntry = { name: 'posix_game', isFile: () => true };
    const textEntry = { name: 'readme.txt', isFile: () => true };
    const configShEntry = { name: 'config.sh', isFile: () => true };
    const patchworkEntry = { name: 'Patchwork.exe', isFile: () => true };
    const redistributionEntry = { name: 'Redistribution.exe', isFile: () => true };
    const patchToolEntry = { name: 'patch.exe', isFile: () => true };
    const patchVersionEntry = { name: 'patch_v1.0.exe', isFile: () => true };
    const redistToolEntry = { name: 'redist.exe', isFile: () => true };
    const vcredistEntry = { name: 'vcredist_x64.exe', isFile: () => true };

    // On Linux target
    assert.deepEqual(await isRecognizedExecutable(exeEntry, '/game', mockFs, 'linux'), { isExecutable: true, platform: 'windows' });
    assert.deepEqual(await isRecognizedExecutable(x86_64Entry, '/game', mockFs, 'linux'), { isExecutable: true, platform: 'linux' });
    assert.deepEqual(await isRecognizedExecutable(appImageEntry, '/game', mockFs, 'linux'), { isExecutable: true, platform: 'linux' });
    assert.deepEqual(await isRecognizedExecutable(shEntry, '/game', mockFs, 'linux'), { isExecutable: true, platform: 'linux' });
    assert.deepEqual(await isRecognizedExecutable(posixEntry, '/game', mockFs, 'linux'), { isExecutable: true, platform: 'linux' });
    assert.deepEqual(await isRecognizedExecutable(textEntry, '/game', mockFs, 'linux'), { isExecutable: false, platform: 'windows' });
    assert.deepEqual(await isRecognizedExecutable(configShEntry, '/game', mockFs, 'linux'), { isExecutable: false, platform: 'windows' });
    assert.deepEqual(await isRecognizedExecutable(patchworkEntry, '/game', mockFs, 'linux'), { isExecutable: true, platform: 'windows' });
    assert.deepEqual(await isRecognizedExecutable(redistributionEntry, '/game', mockFs, 'linux'), { isExecutable: true, platform: 'windows' });
    assert.deepEqual(await isRecognizedExecutable(patchToolEntry, '/game', mockFs, 'linux'), { isExecutable: false, platform: 'windows' });
    assert.deepEqual(await isRecognizedExecutable(patchVersionEntry, '/game', mockFs, 'linux'), { isExecutable: false, platform: 'windows' });
    assert.deepEqual(await isRecognizedExecutable(redistToolEntry, '/game', mockFs, 'linux'), { isExecutable: false, platform: 'windows' });
    assert.deepEqual(await isRecognizedExecutable(vcredistEntry, '/game', mockFs, 'linux'), { isExecutable: false, platform: 'windows' });

    // On Windows target
    assert.deepEqual(await isRecognizedExecutable(exeEntry, 'C:\\game', mockFs, 'win32'), { isExecutable: true, platform: 'windows' });
    assert.deepEqual(await isRecognizedExecutable(x86_64Entry, 'C:\\game', mockFs, 'win32'), { isExecutable: true, platform: 'linux' });
});

test('pickPreferredExecutable applies tiered composite priority based on targetPlatform', () => {
    const candidates = [
        { name: 'MyGame.exe', platform: 'windows' },
        { name: 'MyGame.x86_64', platform: 'linux' }
    ];

    // On Linux: prefers native MyGame.x86_64 over MyGame.exe
    const linuxChoice = pickPreferredExecutable('/library/MyGame', candidates, 'linux');
    assert.equal(path.basename(linuxChoice.exePath), 'MyGame.x86_64');
    assert.equal(linuxChoice.platform, 'linux');

    // On Windows: prefers native MyGame.exe over MyGame.x86_64
    const winChoice = pickPreferredExecutable('C:\\library\\MyGame', candidates, 'win32');
    assert.equal(path.basename(winChoice.exePath), 'MyGame.exe');
    assert.equal(winChoice.platform, 'windows');
});

test('pickPreferredExecutable falls back to standard script names on Linux', () => {
    const candidates = [
        { name: 'start.sh', platform: 'linux' },
        { name: 'unrelated.exe', platform: 'windows' }
    ];

    const choice = pickPreferredExecutable('/library/CoolGame', candidates, 'linux');
    assert.equal(path.basename(choice.exePath), 'start.sh');
    assert.equal(choice.platform, 'linux');
});

test('collectGameCandidates promotes Linux wrapper directories (linux, linux64, x86_64)', async () => {
    const tempDir = await makeTempDir();
    const gameDir = path.join(tempDir, 'IndieGame');
    const wrapperDir = path.join(gameDir, 'linux64');
    const binaryPath = path.join(wrapperDir, 'IndieGame.x86_64');

    await writeStubFile(binaryPath);

    const candidates = await collectGameCandidates(fs, tempDir, tempDir, 0, 5, 'linux');

    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].folderPath, gameDir, 'Wrapper folder linux64 should be promoted to IndieGame');
    assert.equal(candidates[0].exePath, binaryPath);
    assert.equal(candidates[0].platform, 'linux');
});

test('getExecutableStem strips Linux and Windows extensions for stable continuity signatures', () => {
    assert.equal(getExecutableStem('/games/RPG/Game.exe'), 'Game');
    assert.equal(getExecutableStem('/games/RPG/Game.x86_64'), 'Game');
    assert.equal(getExecutableStem('/games/RPG/Game.AppImage'), 'Game');
    assert.equal(getExecutableStem('/games/RPG/Game.sh'), 'Game');

    const winSig = buildContinuitySignature({ folderName: 'Stella Fantasy', exePath: '/games/Stella/Stella.exe' });
    const linuxSig = buildContinuitySignature({ folderName: 'Stella Fantasy', exePath: '/games/Stella/Stella.x86_64' });

    assert.equal(winSig, linuxSig, 'Continuity signatures for Windows and Linux versions of the same game must match');
});

test('collectGameCandidates discovers both Linux and Windows games in a mixed library', async () => {
    const tempDir = await makeTempDir();
    
    // Game 1: Native Linux AppImage
    const game1Dir = path.join(tempDir, 'Game One');
    await writeStubFile(path.join(game1Dir, 'Game One.AppImage'));

    // Game 2: Windows .exe game
    const game2Dir = path.join(tempDir, 'Game Two');
    await writeStubFile(path.join(game2Dir, 'Game Two.exe'));

    // Game 3: Shell script game
    const game3Dir = path.join(tempDir, 'Game Three');
    await writeStubFile(path.join(game3Dir, 'start.sh'));

    const candidates = await collectGameCandidates(fs, tempDir, tempDir, 0, 5, 'linux');

    assert.equal(candidates.length, 3);
    const platformsByKey = Object.fromEntries(candidates.map(c => [path.basename(c.folderPath), c.platform]));

    assert.equal(platformsByKey['Game One'], 'linux');
    assert.equal(platformsByKey['Game Two'], 'windows');
    assert.equal(platformsByKey['Game Three'], 'linux');
});

test('collectGameCandidates deeply discovers all nested games inside category folders with loose executables', async () => {
    const tempDir = await makeTempDir();

    // Loose file in root
    await writeStubFile(path.join(tempDir, 'installer.exe'));

    // Category Folder (e.g. "RPG Collection") with loose helper tool
    const categoryDir = path.join(tempDir, 'RPG Collection');
    await writeStubFile(path.join(categoryDir, 'patcher.exe'));

    // Nested Game 1
    const game1Dir = path.join(categoryDir, 'Epic Quest 1');
    await writeStubFile(path.join(game1Dir, 'Game.exe'));

    // Nested Game 2 (with internal Data folder that must not be treated as a game)
    const game2Dir = path.join(categoryDir, 'Epic Quest 2');
    await writeStubFile(path.join(game2Dir, 'EpicQuest2.exe'));
    await writeStubFile(path.join(game2Dir, 'Data', 'System.json'));

    // Nested Game 3
    const game3Dir = path.join(categoryDir, 'Epic Quest 3');
    await writeStubFile(path.join(game3Dir, 'Launch.x86_64'));

    const candidates = await collectGameCandidates(fs, tempDir, tempDir, 0, 5, 'linux');

    assert.equal(candidates.length, 3, 'Must find all 3 nested games without being swallowed by category folder patcher.exe');
    const folderNames = candidates.map(c => path.basename(c.folderPath)).sort();
    assert.deepEqual(folderNames, ['Epic Quest 1', 'Epic Quest 2', 'Epic Quest 3']);
});

test('isRecognizedExecutable correctly identifies macOS .app bundles on Darwin target', async () => {
    const mockFs = createMockFs({
        '/games/VisualNovel.app': { isDirectory: true },
        '/games/VisualNovel.app/Contents': { isDirectory: true },
        '/games/VisualNovel.app/Contents/Info.plist': {
            isFile: true,
            content: `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>VisualNovel</string>
</dict>
</plist>`
        },
        '/games/VisualNovel.app/Contents/MacOS': { isDirectory: true },
        '/games/VisualNovel.app/Contents/MacOS/VisualNovel': { isFile: true, content: 'mach-o-bin' }
    });

    const bundleEntry = { name: 'VisualNovel.app', isFile: () => false, isDirectory: () => true };
    const res = await isRecognizedExecutable(bundleEntry, '/games', mockFs, 'darwin');
    assert.equal(res.isExecutable, true);
    assert.equal(res.platform, 'macos');
    assert.equal(res.resolvedExePath.replace(/\\/g, '/'), '/games/VisualNovel.app/Contents/MacOS/VisualNovel');
});

test('pickPreferredExecutable passes through resolvedExePath and platform for macOS bundles', () => {
    const candidates = [
        {
            name: 'Game.app',
            platform: 'macos',
            resolvedExePath: '/library/Game.app/Contents/MacOS/Game'
        },
        {
            name: 'Game.exe',
            platform: 'windows'
        }
    ];

    const darwinChoice = pickPreferredExecutable('/library', candidates, 'darwin');
    assert.equal(darwinChoice.platform, 'macos');
    assert.equal(darwinChoice.exePath, '/library/Game.app/Contents/MacOS/Game');
});

test('collectGameCandidates intercepts .app bundles as atomic leaves and prunes recursive descent into Contents', async () => {
    const mockFs = createMockFs({
        '/library/Adventure.app': { isDirectory: true },
        '/library/Adventure.app/Contents': { isDirectory: true },
        '/library/Adventure.app/Contents/Info.plist': {
            isFile: true,
            content: `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>AdventureBinary</string>
</dict>
</plist>`
        },
        '/library/Adventure.app/Contents/MacOS': { isDirectory: true },
        '/library/Adventure.app/Contents/MacOS/AdventureBinary': { isFile: true, content: 'bin' },
        '/library/Adventure.app/Contents/Resources': { isDirectory: true },
        '/library/Adventure.app/Contents/Resources/Data': { isDirectory: true },
        '/library/Adventure.app/Contents/Resources/Data/subgame.exe': { isFile: true, content: 'exe' }
    });

    const candidates = await collectGameCandidates(mockFs, '/library', '/library', 0, 5, 'darwin');
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].platform, 'macos');
    assert.equal(path.basename(candidates[0].folderPath), 'Adventure.app');
    assert.equal(candidates[0].exePath.replace(/\\/g, '/'), '/library/Adventure.app/Contents/MacOS/AdventureBinary');
});

test('collectGameCandidates preserves sibling .app bundles under Resolution Matrix Case A', async () => {
    const mockFs = createMockFs({
        '/library/RPGCollection': { isDirectory: true },
        '/library/RPGCollection/GameOne.app': { isDirectory: true },
        '/library/RPGCollection/GameOne.app/Contents': { isDirectory: true },
        '/library/RPGCollection/GameOne.app/Contents/Info.plist': {
            isFile: true,
            content: `<plist><dict><key>CFBundleExecutable</key><string>GameOne</string></dict></plist>`
        },
        '/library/RPGCollection/GameOne.app/Contents/MacOS': { isDirectory: true },
        '/library/RPGCollection/GameOne.app/Contents/MacOS/GameOne': { isFile: true, content: 'bin' },
        '/library/RPGCollection/GameTwo.app': { isDirectory: true },
        '/library/RPGCollection/GameTwo.app/Contents': { isDirectory: true },
        '/library/RPGCollection/GameTwo.app/Contents/Info.plist': {
            isFile: true,
            content: `<plist><dict><key>CFBundleExecutable</key><string>GameTwo</string></dict></plist>`
        },
        '/library/RPGCollection/GameTwo.app/Contents/MacOS': { isDirectory: true },
        '/library/RPGCollection/GameTwo.app/Contents/MacOS/GameTwo': { isFile: true, content: 'bin' }
    });

    const candidates = await collectGameCandidates(mockFs, '/library', '/library', 0, 5, 'darwin');
    assert.equal(candidates.length, 2);
    const names = candidates.map(c => path.basename(c.folderPath)).sort();
    assert.deepEqual(names, ['GameOne.app', 'GameTwo.app']);
    assert.equal(candidates[0].platform, 'macos');
    assert.equal(candidates[1].platform, 'macos');
});

test('collectGameCandidates preserves native .app bundle over loose .exe under Case B on Darwin', async () => {
    const mockFs = createMockFs({
        '/library/MixedGame': { isDirectory: true },
        '/library/MixedGame/Setup.exe': { isFile: true, content: 'loose installer' },
        '/library/MixedGame/CoolGame.app': { isDirectory: true },
        '/library/MixedGame/CoolGame.app/Contents': { isDirectory: true },
        '/library/MixedGame/CoolGame.app/Contents/Info.plist': {
            isFile: true,
            content: `<plist><dict><key>CFBundleExecutable</key><string>CoolGame</string></dict></plist>`
        },
        '/library/MixedGame/CoolGame.app/Contents/MacOS': { isDirectory: true },
        '/library/MixedGame/CoolGame.app/Contents/MacOS/CoolGame': { isFile: true, content: 'bin' }
    });

    const candidates = await collectGameCandidates(mockFs, '/library', '/library', 0, 5, 'darwin');
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].platform, 'macos');
    assert.equal(path.basename(candidates[0].folderPath), 'CoolGame.app');
});

test('collectGameCandidates falls back to canonical binary path when Info.plist lacks executablePath', async () => {
    const mockFs = createMockFs({
        '/library/FallbackGame.app': { isDirectory: true },
        '/library/FallbackGame.app/Contents': { isDirectory: true },
        '/library/FallbackGame.app/Contents/MacOS': { isDirectory: true },
        '/library/FallbackGame.app/Contents/MacOS/FallbackGame': { isFile: true, content: 'bin' }
    });

    const candidates = await collectGameCandidates(mockFs, '/library', '/library', 0, 5, 'darwin');
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].platform, 'macos');
    assert.equal(candidates[0].exePath.replace(/\\/g, '/'), '/library/FallbackGame.app/Contents/MacOS/FallbackGame');
});

test('collectGameCandidates logs standardized diagnostic warning and skips unresolvable .app bundle', async () => {
    const mockFs = createMockFs({
        '/library/Broken.app': { isDirectory: true },
        '/library/Broken.app/Contents': { isDirectory: true }
    });

    const warnings = [];
    const origWarn = console.warn;
    console.warn = (...args) => {
        warnings.push(args.join(' '));
    };

    try {
        const candidates = await collectGameCandidates(mockFs, '/library', '/library', 0, 5, 'darwin');
        assert.equal(candidates.length, 0);
        assert.equal(warnings.length, 1);
        assert.match(warnings[0], /\[SCANNER\]\[WARN\] Unresolvable \.app bundle at ".*Broken\.app": executable missing or unreadable/);
    } finally {
        console.warn = origWarn;
    }
});

function makeMachOBinary(arch = 'x64') {
    const buf = Buffer.alloc(64);
    buf.writeUInt32BE(0xfeedfacf, 0); // 64-bit Mach-O BE magic
    if (arch === 'arm64') {
        buf.writeInt32BE(0x0100000c, 4); // CPU_TYPE_ARM64
    } else {
        buf.writeInt32BE(0x01000007, 4); // CPU_TYPE_X86_64
    }
    return buf;
}

test('pickPreferredExecutable implements 6-tier Darwin candidate ranking', () => {
    // Tier 1: Host-native .app bundle matching folder base name vs Tier 2: other .app bundle
    const tier1VsTier2 = [
        { name: 'Other.app', platform: 'macos', resolvedExePath: '/library/MyGame/Other.app/Contents/MacOS/Other' },
        { name: 'MyGame.app', platform: 'macos', resolvedExePath: '/library/MyGame/MyGame.app/Contents/MacOS/MyGame' }
    ];
    const pick1 = pickPreferredExecutable('/library/MyGame', tier1VsTier2, 'darwin');
    assert.equal(pick1.platform, 'macos');
    assert.equal(pick1.exePath, '/library/MyGame/MyGame.app/Contents/MacOS/MyGame');

    // Tier 2: Any host-native .app bundle vs Tier 3: Standalone Mach-O matching folder base name
    const tier2VsTier3 = [
        { name: 'MyGame', platform: 'macos' },
        { name: 'Unrelated.app', platform: 'macos', resolvedExePath: '/library/MyGame/Unrelated.app/Contents/MacOS/Unrelated' }
    ];
    const pick2 = pickPreferredExecutable('/library/MyGame', tier2VsTier3, 'darwin');
    assert.equal(pick2.platform, 'macos');
    assert.equal(pick2.exePath, '/library/MyGame/Unrelated.app/Contents/MacOS/Unrelated');

    // Tier 3: Standalone Mach-O matching folder base name vs Tier 4: Any standalone Mach-O binary
    const tier3VsTier4 = [
        { name: 'engine_bin', platform: 'macos' },
        { name: 'MyGame', platform: 'macos' }
    ];
    const pick3 = pickPreferredExecutable('/library/MyGame', tier3VsTier4, 'darwin');
    assert.equal(pick3.platform, 'macos');
    assert.equal(path.basename(pick3.exePath), 'MyGame');

    // Tier 4: Any standalone Mach-O binary vs Tier 5: Host-native launcher scripts
    const tier4VsTier5 = [
        { name: 'start.sh', platform: 'linux' },
        { name: 'launch.sh', platform: 'linux' },
        { name: 'standalone_bin', platform: 'macos' }
    ];
    const pick4 = pickPreferredExecutable('/library/CoolGame', tier4VsTier5, 'darwin');
    assert.equal(pick4.platform, 'macos');
    assert.equal(path.basename(pick4.exePath), 'standalone_bin');

    // Tier 5: Host-native launcher scripts (start.sh, launch.sh) vs Tier 6: Cross-platform fallback (.exe, Linux binaries)
    const tier5VsTier6 = [
        { name: 'CoolGame.exe', platform: 'windows' },
        { name: 'CoolGame.x86_64', platform: 'linux' },
        { name: 'start.sh', platform: 'linux' }
    ];
    const pick5 = pickPreferredExecutable('/library/CoolGame', tier5VsTier6, 'darwin');
    assert.equal(path.basename(pick5.exePath), 'start.sh');

    // Tier 5 with launch.sh
    const tier5Launch = [
        { name: 'CoolGame.exe', platform: 'windows' },
        { name: 'launch.sh', platform: 'linux' }
    ];
    const pick5Launch = pickPreferredExecutable('/library/CoolGame', tier5Launch, 'darwin');
    assert.equal(path.basename(pick5Launch.exePath), 'launch.sh');

    // Tier 6: Cross-platform fallback matching folder base name
    const tier6Match = [
        { name: 'unrelated.x86_64', platform: 'linux' },
        { name: 'CoolGame.exe', platform: 'windows' }
    ];
    const pick6Match = pickPreferredExecutable('/library/CoolGame', tier6Match, 'darwin');
    assert.equal(path.basename(pick6Match.exePath), 'CoolGame.exe');
    assert.equal(pick6Match.platform, 'windows');

    // Tier 6: Cross-platform fallback standard game.exe
    const tier6Standard = [
        { name: 'unrelated.x86_64', platform: 'linux' },
        { name: 'game.exe', platform: 'windows' }
    ];
    const pick6Standard = pickPreferredExecutable('/library/RandomFolder', tier6Standard, 'darwin');
    assert.equal(path.basename(pick6Standard.exePath), 'game.exe');
    assert.equal(pick6Standard.platform, 'windows');
});

test('pickPreferredExecutable handles composite ranking across multi-platform libraries with both .exe and .app', () => {
    const candidates = [
        { name: 'FantasyGame.exe', platform: 'windows' },
        { name: 'FantasyGame.app', platform: 'macos', resolvedExePath: '/games/Fantasy/FantasyGame.app/Contents/MacOS/FantasyGame' }
    ];

    // On Darwin: prefers native macOS .app bundle
    const macChoice = pickPreferredExecutable('/games/Fantasy', candidates, 'darwin');
    assert.equal(macChoice.platform, 'macos');
    assert.equal(macChoice.exePath, '/games/Fantasy/FantasyGame.app/Contents/MacOS/FantasyGame');

    // On Windows: prefers Windows .exe
    const winChoice = pickPreferredExecutable('C:\\games\\Fantasy', candidates, 'win32');
    assert.equal(winChoice.platform, 'windows');
    assert.equal(path.basename(winChoice.exePath), 'FantasyGame.exe');
});

test('isRecognizedExecutable validates Darwin POSIX mode checks and extensionless Mach-O detection', async () => {
    const machOBuf = makeMachOBinary('x64');
    const mockFs = createMockFs({
        '/games/MachOGame': { isDirectory: true },
        '/games/MachOGame/MachOBinary': {
            isFile: true,
            mode: 0o100755,
            content: machOBuf
        },
        '/games/MachOGame/NonExecutableMachO': {
            isFile: true,
            mode: 0o100644,
            content: machOBuf
        },
        '/games/MachOGame/ScriptWithExecMode': {
            isFile: true,
            mode: 0o100755,
            content: '#!/bin/sh\necho "not a macho"'
        }
    });

    const execEntry = { name: 'MachOBinary', isFile: () => true };
    const nonExecEntry = { name: 'NonExecutableMachO', isFile: () => true };
    const scriptEntry = { name: 'ScriptWithExecMode', isFile: () => true };

    // Valid Mach-O with 0o111 execute bit -> recognized as macos
    const res1 = await isRecognizedExecutable(execEntry, '/games/MachOGame', mockFs, 'darwin');
    assert.deepEqual(res1, { isExecutable: true, platform: 'macos' });

    // Valid Mach-O content but lacking 0o111 execute mode bit -> rejected
    const res2 = await isRecognizedExecutable(nonExecEntry, '/games/MachOGame', mockFs, 'darwin');
    assert.deepEqual(res2, { isExecutable: false, platform: 'windows' });

    // Has 0o111 execute mode bit but header is NOT Mach-O -> rejected
    const res3 = await isRecognizedExecutable(scriptEntry, '/games/MachOGame', mockFs, 'darwin');
    assert.deepEqual(res3, { isExecutable: false, platform: 'windows' });
});

test('isRecognizedExecutable safely handles deficient fs lacking open and readFile without host I/O leakage on Darwin', async () => {
    const statOnlyFs = {
        async stat(p) {
            return {
                mode: 0o100755,
                isFile: () => true
            };
        }
    };

    const entry = { name: 'SomeBinary', isFile: () => true };

    // When fs lacks both open and readFile, returns { isExecutable: false, platform: 'windows' }
    const res = await isRecognizedExecutable(entry, '/games/Test', statOnlyFs, 'darwin');
    assert.deepEqual(res, { isExecutable: false, platform: 'windows' });

    // When fs is null / empty
    const resEmpty = await isRecognizedExecutable(entry, '/games/Test', {}, 'darwin');
    assert.deepEqual(resEmpty, { isExecutable: false, platform: 'windows' });
});

test('collectGameCandidates excludes .app bundle directories from Step 2 direct candidate ranking', async () => {
    const mockFs = createMockFs({
        '/library/GameFolder': { isDirectory: true },
        '/library/GameFolder/Game.app': { isDirectory: true },
        '/library/GameFolder/Game.app/Contents': { isDirectory: true },
        '/library/GameFolder/Game.app/Contents/Info.plist': {
            isFile: true,
            content: `<plist><dict><key>CFBundleExecutable</key><string>Game</string></dict></plist>`
        },
        '/library/GameFolder/Game.app/Contents/MacOS': { isDirectory: true },
        '/library/GameFolder/Game.app/Contents/MacOS/Game': { isFile: true, content: 'bin' }
    });

    const candidates = await collectGameCandidates(mockFs, '/library', '/library', 0, 5, 'darwin');
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].folderPath.replace(/\\/g, '/'), '/library/GameFolder/Game.app');
    assert.equal(candidates[0].exePath.replace(/\\/g, '/'), '/library/GameFolder/Game.app/Contents/MacOS/Game');
    assert.equal(candidates[0].platform, 'macos');
});

