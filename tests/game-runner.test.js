const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const {
    detectInstalledRunners,
    resolveGameLaunch,
    determineRunnerMode,
    GameRunnerService,
    ensureLinuxExecutablePermissions
} = require('../dist/main/game-runner');

const {
    normalizeSessionJournal
} = require('../dist/main/playtime-session-manager/journal');

test('Game Runner Detection: Discovers system runners and compatibility tools', async (t) => {
    await t.test('detects native execution on Windows and Linux', async () => {
        const mockWinEnv = {
            platform: 'win32',
            env: {},
            existsSync: () => false,
            readdirSync: () => []
        };
        const winRunners = await detectInstalledRunners(mockWinEnv);
        assert.equal(winRunners.length, 1);
        assert.equal(winRunners[0].mode, 'native');
        assert.equal(winRunners[0].id, 'native-windows');

        const mockLinuxEnv = {
            platform: 'linux',
            env: { HOME: '/home/gamer', PATH: '/usr/bin' },
            existsSync: () => false,
            readdirSync: () => []
        };
        const linuxRunners = await detectInstalledRunners(mockLinuxEnv);
        assert.ok(linuxRunners.some((r) => r.mode === 'native' && r.id === 'native-linux'));
    });

    await t.test('detects System Wine, Steam Proton, and UMU Launcher on Linux', async () => {
        const mockFs = new Set([
            '/usr/bin/wine',
            '/home/gamer/.local/bin/umu-run',
            '/home/gamer/.steam/root/compatibilitytools.d/GE-Proton8-25/proton',
            '/home/gamer/.local/share/Steam/steamapps/common/Proton 8.0/proton',
            '/home/gamer/.local/share/bottles/runners/soda-7.0-9/bin/wine'
        ]);

        const mockLinuxEnv = {
            platform: 'linux',
            env: {
                HOME: '/home/gamer',
                PATH: '/usr/bin:/home/gamer/.local/bin'
            },
            existsSync: (p) => mockFs.has(p) || p === '/home/gamer/.steam/root/compatibilitytools.d' || p === '/home/gamer/.local/share/Steam/steamapps/common' || p === '/home/gamer/.local/share/bottles/runners',
            readdirSync: (p) => {
                if (p === '/home/gamer/.steam/root/compatibilitytools.d') return ['GE-Proton8-25'];
                if (p === '/home/gamer/.local/share/Steam/steamapps/common') return ['Proton 8.0'];
                if (p === '/home/gamer/.local/share/bottles/runners') return ['soda-7.0-9'];
                return [];
            }
        };

        const runners = await detectInstalledRunners(mockLinuxEnv);
        assert.ok(runners.some((r) => r.mode === 'wine' && r.path === '/usr/bin/wine'));
        assert.ok(runners.some((r) => r.mode === 'umu' && r.path === '/home/gamer/.local/bin/umu-run'));
        assert.ok(runners.some((r) => r.mode === 'proton' && r.path === '/home/gamer/.steam/root/compatibilitytools.d/GE-Proton8-25/proton'));
        assert.ok(runners.some((r) => r.mode === 'proton' && r.path === '/home/gamer/.local/share/Steam/steamapps/common/Proton 8.0/proton'));
        assert.ok(runners.some((r) => r.mode === 'wine' && r.path === '/home/gamer/.local/share/bottles/runners/soda-7.0-9/bin/wine'));
    });
});

test('Game Runner Launch Resolver: Resolves parameter matrix across platforms and modes', async (t) => {
    const chmodCalls = [];
    const accessCalls = [];

    const mockResolverEnv = {
        platform: 'linux',
        env: { HOME: '/home/gamer' },
        chmodSync: (p, mode) => {
            chmodCalls.push({ path: p, mode });
        },
        accessSync: (p, mode) => {
            accessCalls.push({ path: p, mode });
            if (p.includes('unexecutable')) {
                throw new Error('Permission denied');
            }
        },
        existsSync: () => true
    };

    await t.test('resolves Native Linux launch and applies chmod +x if missing', async () => {
        const game = {
            platform: 'linux',
            exePath: '/games/SuperGame/unexecutable_game.x86_64',
            gameKey: 'super-game'
        };

        const launch = await resolveGameLaunch(game, {}, {}, [], mockResolverEnv);
        assert.equal(launch.runnerMode, 'native');
        assert.equal(launch.targetPlatform, 'linux');
        assert.equal(launch.command, '/games/SuperGame/unexecutable_game.x86_64');
        assert.deepEqual(launch.args, []);

        // Verify chmod 0o755 was triggered
        assert.ok(chmodCalls.some((c) => c.path === '/games/SuperGame/unexecutable_game.x86_64' && c.mode === 0o755));
    });

    await t.test('resolves Windows .exe launch on Linux with Wine and custom WINEPREFIX', async () => {
        const game = {
            platform: 'windows',
            exePath: '/games/VisualNovel/game.exe',
            gameKey: 'vn-game'
        };

        const runnerConfig = {
            mode: 'wine',
            winePrefixPath: '/home/gamer/.custom-wine-prefix',
            customArgs: ['--debug'],
            customEnv: { DXVK_HUD: '1' }
        };

        const launch = await resolveGameLaunch(
            game,
            runnerConfig,
            {},
            [{ id: 'wine-usr', name: 'Wine', mode: 'wine', path: '/usr/bin/wine' }],
            mockResolverEnv
        );

        assert.equal(launch.runnerMode, 'wine');
        assert.equal(launch.targetPlatform, 'windows');
        assert.equal(launch.command, '/usr/bin/wine');
        assert.deepEqual(launch.args, ['/games/VisualNovel/game.exe', '--debug']);
        assert.equal(launch.env.WINEPREFIX, '/home/gamer/.custom-wine-prefix');
        assert.equal(launch.env.DXVK_HUD, '1');
    });

    await t.test('resolves Windows .exe launch on Linux with Steam Proton', async () => {
        const game = {
            platform: 'windows',
            exePath: '/games/RPG/rpg.exe',
            gameKey: 'rpg-game'
        };

        const runnerConfig = {
            mode: 'proton',
            protonPath: '/home/gamer/.steam/root/compatibilitytools.d/GE-Proton/proton'
        };

        const launch = await resolveGameLaunch(game, runnerConfig, {}, [], mockResolverEnv);
        assert.equal(launch.runnerMode, 'proton');
        assert.equal(launch.targetPlatform, 'windows');
        assert.equal(launch.command, '/home/gamer/.steam/root/compatibilitytools.d/GE-Proton/proton');
        assert.deepEqual(launch.args, ['run', '/games/RPG/rpg.exe']);
        assert.equal(launch.env.STEAM_COMPAT_DATA_PATH, '/home/gamer/.local/share/YumeShelf/proton-prefix');
        assert.equal(launch.env.STEAM_COMPAT_CLIENT_INSTALL_PATH, '/home/gamer/.steam/root');
    });

    await t.test('resolves UMU Launcher mode', async () => {
        const game = {
            platform: 'windows',
            exePath: '/games/Indie/indie.exe',
            gameKey: 'indie-game'
        };

        const runnerConfig = {
            mode: 'umu',
            customArgs: ['-w']
        };

        const launch = await resolveGameLaunch(
            game,
            runnerConfig,
            {},
            [{ id: 'umu', name: 'UMU', mode: 'umu', path: '/usr/bin/umu-run' }],
            mockResolverEnv
        );

        assert.equal(launch.runnerMode, 'umu');
        assert.equal(launch.command, '/usr/bin/umu-run');
        assert.deepEqual(launch.args, ['/games/Indie/indie.exe', '-w']);
    });

    await t.test('resolves Custom Runner mode with argument positioning', async () => {
        const game = {
            platform: 'windows',
            exePath: '/games/Custom/game.exe',
            gameKey: 'custom-game'
        };

        const runnerConfig = {
            mode: 'custom',
            customRunnerPath: '/opt/special-launcher/run',
            customArgs: ['--profile', 'fast']
        };

        const launch = await resolveGameLaunch(game, runnerConfig, {}, [], mockResolverEnv);
        assert.equal(launch.runnerMode, 'custom');
        assert.equal(launch.command, '/opt/special-launcher/run');
        assert.deepEqual(launch.args, ['--profile', 'fast', '/games/Custom/game.exe']);
    });

    await t.test('throws descriptive errors on missing configurations', async () => {
        const game = {
            platform: 'windows',
            exePath: '/games/RPG/rpg.exe',
            gameKey: 'rpg-game'
        };

        // Missing proton binary
        await assert.rejects(
            async () => resolveGameLaunch(game, { mode: 'proton' }, {}, [], mockResolverEnv),
            /Steam Proton was not found/
        );

        // Missing custom runner path
        await assert.rejects(
            async () => resolveGameLaunch(game, { mode: 'custom' }, {}, [], mockResolverEnv),
            /Custom runner path is required/
        );
    });

    await t.test('native Windows environment defaults to direct execution', async () => {
        const winEnv = {
            platform: 'win32',
            env: {},
            chmodSync: () => {},
            accessSync: () => {},
            existsSync: () => true
        };

        const game = {
            platform: 'windows',
            exePath: 'C:\\Games\\Action\\game.exe',
            gameKey: 'action-game'
        };

        const launch = await resolveGameLaunch(game, {}, {}, [], winEnv);
        assert.equal(launch.runnerMode, 'native');
        assert.equal(launch.targetPlatform, 'windows');
        assert.equal(launch.command, path.resolve('C:\\Games\\Action\\game.exe'));
    });
});

test('GameRunnerService & SessionJournal Integration', async (t) => {
    await t.test('GameRunnerService stores and updates global runner settings', async () => {
        const service = new GameRunnerService({
            initialSettings: { defaultWindowsExeMode: 'wine', defaultWinePrefix: '/wine/pfx' }
        });

        assert.equal(service.getSettings().defaultWindowsExeMode, 'wine');
        assert.equal(service.getSettings().defaultWinePrefix, '/wine/pfx');

        service.updateSettings({ defaultWindowsExeMode: 'proton' });
        assert.equal(service.getSettings().defaultWindowsExeMode, 'proton');
    });

    await t.test('normalizeSessionJournal preserves runner metadata and backward compatibility', () => {
        const legacyRaw = {
            sessionId: 'sess-123',
            gameKey: 'game-1',
            exePath: '/games/game.exe'
        };
        const legacyJournal = normalizeSessionJournal(legacyRaw, '/path/to/sess-123.json');
        assert.equal(legacyJournal.runner, undefined);
        assert.equal(legacyJournal.runnerArgs, undefined);
        assert.equal(legacyJournal.env, undefined);

        const runnerRaw = {
            sessionId: 'sess-456',
            gameKey: 'game-2',
            exePath: '/games/game.exe',
            runner: '/usr/bin/wine',
            runnerArgs: ['/games/game.exe', '--opt'],
            env: { WINEPREFIX: '/home/gamer/.wine' },
            targetPlatform: 'windows'
        };
        const runnerJournal = normalizeSessionJournal(runnerRaw, '/path/to/sess-456.json');
        assert.equal(runnerJournal.runner, '/usr/bin/wine');
        assert.deepEqual(runnerJournal.runnerArgs, ['/games/game.exe', '--opt']);
        assert.equal(runnerJournal.env.WINEPREFIX, '/home/gamer/.wine');
        assert.equal(runnerJournal.targetPlatform, 'windows');
    });
});
