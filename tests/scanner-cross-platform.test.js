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
    // fileTree: map of normalized relative paths -> { isFile: boolean, isDirectory: boolean, mode?: number }
    return {
        async readdir(dirPath, options) {
            const normalizedDir = path.resolve(dirPath);
            const directChildren = new Map();

            for (const [relPath, meta] of Object.entries(fileTree)) {
                const fullPath = path.resolve(relPath);
                const parent = path.dirname(fullPath);
                if (parent === normalizedDir) {
                    const name = path.basename(fullPath);
                    directChildren.set(name, {
                        name,
                        isFile: () => !!meta.isFile,
                        isDirectory: () => !!meta.isDirectory
                    });
                }
            }

            return [...directChildren.values()];
        },
        async stat(filePath) {
            const normalized = path.resolve(filePath);
            const meta = fileTree[normalized] || fileTree[path.relative(process.cwd(), normalized)];
            if (!meta) throw new Error(`ENOENT: ${filePath}`);
            return {
                mode: meta.mode !== undefined ? meta.mode : (meta.isDirectory ? 0o040755 : 0o100644),
                isFile: () => !!meta.isFile,
                isDirectory: () => !!meta.isDirectory,
                birthtimeMs: Date.now()
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

    // On Linux target
    assert.deepEqual(await isRecognizedExecutable(exeEntry, '/game', mockFs, 'linux'), { isExecutable: true, platform: 'windows' });
    assert.deepEqual(await isRecognizedExecutable(x86_64Entry, '/game', mockFs, 'linux'), { isExecutable: true, platform: 'linux' });
    assert.deepEqual(await isRecognizedExecutable(appImageEntry, '/game', mockFs, 'linux'), { isExecutable: true, platform: 'linux' });
    assert.deepEqual(await isRecognizedExecutable(shEntry, '/game', mockFs, 'linux'), { isExecutable: true, platform: 'linux' });
    assert.deepEqual(await isRecognizedExecutable(posixEntry, '/game', mockFs, 'linux'), { isExecutable: true, platform: 'linux' });
    assert.deepEqual(await isRecognizedExecutable(textEntry, '/game', mockFs, 'linux'), { isExecutable: false, platform: 'windows' });
    assert.deepEqual(await isRecognizedExecutable(configShEntry, '/game', mockFs, 'linux'), { isExecutable: false, platform: 'windows' });

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
