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
                async read(offset, length) {
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

