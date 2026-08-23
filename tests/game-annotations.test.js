const test = require('node:test');
const assert = require('node:assert/strict');

async function getModule() {
    return await import('../src/renderer/game-annotations.ts');
}

test('annotateGamesForDisplay: single library path displays correct parent and full labels', async () => {
    const { annotateGamesForDisplay, LOCATION_DISPLAY_MODES } = await getModule();
    const games = [
        {
            gameKey: 'Action/Game1',
            folderPath: 'D:\\Games\\H Games\\Action\\Game1',
            relativePath: 'Action/Game1',
            name: 'Game 1'
        }
    ];

    const annotatedParent = annotateGamesForDisplay(games, 'D:\\Games\\H Games', LOCATION_DISPLAY_MODES.PARENT);
    assert.equal(annotatedParent[0].relativePathDisplay, '/H Games/Action');
    assert.equal(annotatedParent[0].relativePathFullDisplay, '/H Games/Action/Game1');
    assert.equal(annotatedParent[0].parentLocationLabel, 'H Games/Action');
    assert.equal(annotatedParent[0].fullLocationLabel, 'H Games/Action/Game1');

    const annotatedFull = annotateGamesForDisplay(games, 'D:\\Games\\H Games', LOCATION_DISPLAY_MODES.FULL);
    assert.equal(annotatedFull[0].relativePathDisplay, '/H Games/Action/Game1');
});

test('annotateGamesForDisplay: multi-library paths resolve each game to its own owning library root', async () => {
    const { annotateGamesForDisplay, LOCATION_DISPLAY_MODES } = await getModule();
    const libraryConfig = {
        libraryPaths: ['D:\\Games\\H Games', 'D:\\Games\\Wuthering Waves Game'],
        libraryPath: 'D:\\Games\\H Games'
    };

    const games = [
        {
            gameKey: 'Action/Game1',
            folderPath: 'D:\\Games\\H Games\\Action\\Game1',
            relativePath: 'Action/Game1',
            name: 'Game 1'
        },
        {
            gameKey: 'Wuthering Waves',
            folderPath: 'D:\\Games\\Wuthering Waves Game\\Wuthering Waves',
            relativePath: 'Wuthering Waves',
            name: 'launcher'
        }
    ];

    const annotated = annotateGamesForDisplay(games, libraryConfig, LOCATION_DISPLAY_MODES.PARENT);
    assert.equal(annotated[0].relativePathDisplay, '/H Games/Action');
    assert.equal(annotated[0].relativePathFullDisplay, '/H Games/Action/Game1');

    assert.equal(annotated[1].relativePathDisplay, '/Wuthering Waves Game');
    assert.equal(annotated[1].relativePathFullDisplay, '/Wuthering Waves Game/Wuthering Waves');
});

test('annotateGamesForDisplay: avoids sibling prefix false collision (e.g. /Games/Lib vs /Games/Lib2)', async () => {
    const { annotateGamesForDisplay, LOCATION_DISPLAY_MODES } = await getModule();
    const libraryConfig = {
        libraryPaths: ['D:\\Games\\Lib', 'D:\\Games\\Lib2']
    };

    const games = [
        {
            gameKey: 'GameInLib2',
            folderPath: 'D:\\Games\\Lib2\\GameInLib2',
            relativePath: 'GameInLib2',
            name: 'Lib2 Game'
        }
    ];

    const annotated = annotateGamesForDisplay(games, libraryConfig, LOCATION_DISPLAY_MODES.PARENT);
    assert.equal(annotated[0].relativePathFullDisplay, '/Lib2/GameInLib2');
    assert.equal(annotated[0].relativePathDisplay, '/Lib2');
});

test('annotateGamesForDisplay: nested library paths match most specific child directory first (longest prefix)', async () => {
    const { annotateGamesForDisplay, LOCATION_DISPLAY_MODES } = await getModule();
    const libraryConfig = {
        libraryPaths: ['D:\\Games', 'D:\\Games\\SubFolder\\SpecialLib']
    };

    const games = [
        {
            gameKey: 'SpecialGame',
            folderPath: 'D:\\Games\\SubFolder\\SpecialLib\\MyGame',
            relativePath: 'MyGame',
            name: 'Special Game'
        }
    ];

    const annotated = annotateGamesForDisplay(games, libraryConfig, LOCATION_DISPLAY_MODES.PARENT);
    assert.equal(annotated[0].relativePathFullDisplay, '/SpecialLib/MyGame');
    assert.equal(annotated[0].relativePathDisplay, '/SpecialLib');
});

test('annotateGamesForDisplay: root segment deduplication when game relativePath equals rootName', async () => {
    const { annotateGamesForDisplay, LOCATION_DISPLAY_MODES } = await getModule();
    const libraryConfig = ['D:\\Games\\Wuthering Waves Game'];

    const games = [
        {
            gameKey: 'Wuthering Waves Game',
            folderPath: 'D:\\Games\\Wuthering Waves Game',
            relativePath: 'Wuthering Waves Game',
            name: 'Wuthering Waves'
        }
    ];

    const annotated = annotateGamesForDisplay(games, libraryConfig, LOCATION_DISPLAY_MODES.PARENT);
    assert.equal(annotated[0].relativePathFullDisplay, '/Wuthering Waves Game');
    assert.equal(annotated[0].relativePathDisplay, '/Wuthering Waves Game');
});

test('annotateGamesForDisplay: case-insensitive matching preserves original configured root casing', async () => {
    const { annotateGamesForDisplay, LOCATION_DISPLAY_MODES } = await getModule();
    const libraryConfig = ['D:\\Games\\MyLibrary'];

    const games = [
        {
            gameKey: 'Sub/Game',
            folderPath: 'd:\\games\\mylibrary\\sub\\game',
            relativePath: 'sub/game',
            name: 'Case Test Game'
        }
    ];

    const annotated = annotateGamesForDisplay(games, libraryConfig, LOCATION_DISPLAY_MODES.PARENT);
    assert.equal(annotated[0].relativePathFullDisplay, '/MyLibrary/sub/game');
    assert.equal(annotated[0].relativePathDisplay, '/MyLibrary/sub');
});

test('annotateGamesForDisplay: handles defensive null/array inputs and propagates to instances', async () => {
    const { annotateGamesForDisplay, LOCATION_DISPLAY_MODES } = await getModule();
    assert.deepEqual(annotateGamesForDisplay(null), []);
    assert.deepEqual(annotateGamesForDisplay(undefined), []);

    const games = [
        null,
        {
            gameKey: 'PrimaryGame',
            folderPath: 'D:\\Games\\LibA\\Sub\\GameA',
            relativePath: 'Sub/GameA',
            name: 'Primary Game',
            primaryInstance: {
                folderPath: 'D:\\Games\\LibA\\Sub\\GameA',
                relativePath: 'Sub/GameA'
            },
            instances: [
                {
                    folderPath: 'D:\\Games\\LibB\\Sub\\GameB',
                    relativePath: 'Sub/GameB'
                }
            ]
        }
    ];

    const libraryConfig = ['D:\\Games\\LibA', 'D:\\Games\\LibB'];
    const annotated = annotateGamesForDisplay(games, libraryConfig, LOCATION_DISPLAY_MODES.PARENT);

    assert.equal(annotated[0], null);
    assert.equal(annotated[1].relativePathDisplay, '/LibA/Sub');
    assert.equal(annotated[1].primaryInstance.relativePathDisplay, '/LibA/Sub');
    assert.equal(annotated[1].instances[0].relativePathDisplay, '/LibB/Sub');
});
