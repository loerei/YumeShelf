const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// We will test at the public seam: resolveGameTitle
const { resolveGameTitle } = require('../dist/main/library-state/title-resolver');

// In-memory mock filesystem factory for testing without touching OS disk
function createMockFs(fileMap) {
    const normalize = (p) => path.resolve(p).replace(/[\\/]+/g, '/').toLowerCase();
    const normalizedMap = new Map();
    for (const [k, v] of Object.entries(fileMap)) {
        normalizedMap.set(normalize(k), typeof v === 'string' ? v : JSON.stringify(v));
    }

    return {
        readdir: async (dirPath) => {
            const normDir = normalize(dirPath);
            const children = new Set();
            for (const k of normalizedMap.keys()) {
                if (k.startsWith(`${normDir}/`)) {
                    const relative = k.slice(normDir.length + 1);
                    const topSegment = relative.split('/')[0];
                    children.add(topSegment);
                }
            }
            return Array.from(children);
        },
        readFile: async (filePath) => {
            const key = normalize(filePath);
            if (normalizedMap.has(key)) {
                return normalizedMap.get(key);
            }
            const err = new Error(`ENOENT: no such file or directory, open '${filePath}'`);
            err.code = 'ENOENT';
            throw err;
        },
        existsSync: (filePath) => normalizedMap.has(normalize(filePath))
    };
}

test('TDD Slice 1: RPG Maker MZ data/System.json overrides package.json window.title (default: no product codes)', async () => {
    const folderPath = 'D:/Games/H Games/[Ryuugames] RY-RJ01415588_V1.0.11_EN/RJ01415588 v1.0.11 EN/[ガオン堂] Ikinokore! Mujintou Survival Seikatsu♡ [v1.0.11]';
    const exePath = `${folderPath}/Game.exe`;

    const mockFs = createMockFs({
        [`${folderPath}/package.json`]: {
            name: 'rmmz-game',
            window: { title: '生き残れ！無人島サバイバル性活♡' }
        },
        [`${folderPath}/data/System.json`]: {
            gameTitle: 'Survive! Deserted Island Survival Life♡'
        }
    });

    const title = await resolveGameTitle({
        folderPath,
        exePath,
        fs: mockFs
    });

    assert.equal(title, 'Survive! Deserted Island Survival Life♡');
});

test('TDD Slice 2: Multi-Language Cascade matches preferredLocale -> EN -> default', async (t) => {
    const folderPath = 'D:/Games/H Games/MultiLangGame';
    const exePath = `${folderPath}/Game.exe`;

    const mockFs = createMockFs({
        [`${folderPath}/data/VN/System.json`]: { gameTitle: 'Sống Sót! Cuộc Sống Sinh Tồn Hoang Đảo' },
        [`${folderPath}/data/EN/System.json`]: { gameTitle: 'Survive! Deserted Island Survival Life' },
        [`${folderPath}/data/System.json`]: { gameTitle: '生き残れ！無人島サバイバル性活' }
    });

    await t.test('Matches Vietnamese when preferredLocale is vi', async () => {
        const title = await resolveGameTitle({
            folderPath,
            exePath,
            preferredLocale: 'vi',
            fs: mockFs
        });
        assert.equal(title, 'Sống Sót! Cuộc Sống Sinh Tồn Hoang Đảo');
    });

    await t.test('Falls back to English when preferredLocale (ko) has no translation folder', async () => {
        const title = await resolveGameTitle({
            folderPath,
            exePath,
            preferredLocale: 'ko',
            fs: mockFs
        });
        assert.equal(title, 'Survive! Deserted Island Survival Life');
    });
});

test('TDD Slice 3: Generic Engine Name Rejection falls back to cleaned folder name', async () => {
    const folderPath = 'D:/Games/H Games/[Ryuugames] RY-RJ01578063_V26.03.27/Game';
    const exePath = `${folderPath}/Game.exe`;

    const mockFs = createMockFs({
        [`${folderPath}/data/System.json`]: { gameTitle: 'Game' },
        [`${folderPath}/package.json`]: { name: 'rmmz-game', window: { title: 'nwjs' } }
    });

    const title = await resolveGameTitle({
        folderPath,
        exePath,
        fs: mockFs
    });

    assert.equal(title, '[RJ01578063]');
});

test('TDD Slice 4: titleDisplayMode legacy_folder forces folder name cleaning without product code by default', async () => {
    const folderPath = 'D:/Games/H Games/[Ryuugames] RY-RJ01415588_V1.0.11_EN/RJ01415588 v1.0.11 EN/[ガオン堂] Ikinokore! Mujintou Survival Seikatsu♡ [v1.0.11]';
    const exePath = `${folderPath}/Game.exe`;

    const mockFs = createMockFs({
        [`${folderPath}/data/System.json`]: { gameTitle: 'Survive! Deserted Island Survival Life♡' }
    });

    const title = await resolveGameTitle({
        folderPath,
        exePath,
        titleDisplayMode: 'legacy_folder',
        fs: mockFs
    });

    // In legacy mode with displayProductCodes: false, it cleans the folder path without prefix
    assert.equal(title, 'Ikinokore! Mujintou Survival Seikatsu♡');
});

test('TDD Slice 5: Performance Benchmark resolves 100 mock games in < 50ms', async () => {
    const mockFiles = {};
    for (let i = 0; i < 100; i++) {
        const folder = `D:/Games/Batch/Game_${i}`;
        mockFiles[`${folder}/data/System.json`] = { gameTitle: `Game Title ${i}` };
    }
    const mockFs = createMockFs(mockFiles);

    const start = performance.now();
    const tasks = [];
    for (let i = 0; i < 100; i++) {
        const folder = `D:/Games/Batch/Game_${i}`;
        tasks.push(resolveGameTitle({
            folderPath: folder,
            exePath: `${folder}/Game.exe`,
            fs: mockFs
        }));
    }
    const titles = await Promise.all(tasks);
    const elapsed = performance.now() - start;

    assert.equal(titles.length, 100);
    assert.equal(titles[0], 'Game Title 0');
    assert.equal(titles[99], 'Game Title 99');
    assert.ok(elapsed < 50, `Expected 100 games to resolve in < 50ms, took ${elapsed.toFixed(2)}ms`);
});

test('TDD Slice 6: Unity app.info resolves product name over wrapper folder', async () => {
    const folderPath = 'D:/Games/H Games/[Ryuugames] RY-RJ01632235_V26.07.07/Build';
    const exePath = `${folderPath}/Clicker.exe`;

    const mockFs = createMockFs({
        [`${folderPath}/Clicker_Data/app.info`]: 'Serinette\nClicker\n'
    });

    const title = await resolveGameTitle({
        folderPath,
        exePath,
        fs: mockFs
    });

    assert.equal(title, 'Clicker');
});

test('TDD Slice 7: Meaningful Executable Stem resolves when folder name is empty or wrapper', async () => {
    const folderPath = 'D:/Games/H Games/[Kimochi] RJ01248879';
    const exePath = `${folderPath}/Doujin Fever!! Train Assault!.exe`;

    const mockFs = createMockFs({});

    const title = await resolveGameTitle({
        folderPath,
        exePath,
        fs: mockFs
    });

    assert.equal(title, 'Doujin Fever!! Train Assault!');
});

test('TDD Slice 8: displayProductCodes true prefixes product codes to title', async () => {
    const folderPath = 'D:/Games/H Games/[Ryuugames] RY-RJ01632235_V26.07.07/Build';
    const exePath = `${folderPath}/Clicker.exe`;

    const mockFs = createMockFs({
        [`${folderPath}/Clicker_Data/app.info`]: 'Serinette\nClicker\n'
    });

    const titleWithCode = await resolveGameTitle({
        folderPath,
        exePath,
        displayProductCodes: true,
        fs: mockFs
    });

    assert.equal(titleWithCode, '[RJ01632235] Clicker');
});

test('TDD Slice 9: Dynamic candidate tree explorer finds RPG Maker metadata in arbitrary subfolder', async () => {
    const folderPath = 'D:/Games/H Games/[Ryuugames] RY-RJ01578063_V26.03.27';
    const exePath = `${folderPath}/Game/Game.exe`;

    const mockFs = createMockFs({
        [`${folderPath}/Game/data/System.json`]: {
            gameTitle: 'The Closeted, Gloomy JK Starts to Take Lewd Selfies.'
        }
    });

    const title = await resolveGameTitle({
        folderPath,
        exePath,
        fs: mockFs
    });

    assert.equal(title, 'The Closeted, Gloomy JK Starts to Take Lewd Selfies.');
});
