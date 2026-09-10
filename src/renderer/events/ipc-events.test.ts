// @ts-nocheck
import { describe, it, expect, vi } from 'vitest';
import { bindIpcEvents } from './ipc-events';

describe('bindIpcEvents - Playtime & Game Lifecycle Handling', () => {
    function createMockElement(className = '', dataset = {}) {
        const children = [];
        const element = {
            className,
            dataset: { ...dataset },
            textContent: '',
            children,
            querySelector: (selector) => {
                if (selector === '.game-playtime') return children.find(c => c.className === 'game-playtime') || null;
                if (selector === '.game-status') return children.find(c => c.className === 'game-status') || null;
                return null;
            },
            querySelectorAll: (selector) => []
        };
        return element;
    }

    function createMockCard(gameKey, isStackOverlay = false) {
        const card = createMockElement(`game-card ${isStackOverlay ? 'stack-overlay-card' : ''}`, { gameKey });
        const playtimeEl = createMockElement('game-playtime');
        playtimeEl.textContent = '0m';
        const statusEl = createMockElement('game-status');
        statusEl.textContent = 'Never played';
        card.children.push(playtimeEl, statusEl);
        return card;
    }

    it('handles onGamePlaytimeUpdated in-memory with finite accruedMs and session baseline calibration', async () => {
        let playtimeUpdatedHandler;
        const mockElectronAPI = {
            onBootStatus: vi.fn(),
            onGameStopped: vi.fn(),
            onGamePlaytimeUpdated: (cb) => { playtimeUpdatedHandler = cb; },
            onTranslationStatus: vi.fn(),
            getGames: vi.fn()
        };

        const games = [
            {
                gameId: 'game-1',
                gameKey: 'game-1',
                playtime: 60000,
                basePlaytime: 60000,
                isRunning: false
            }
        ];

        bindIpcEvents({
            electronAPI: mockElectronAPI,
            bootController: { show: vi.fn(), hide: vi.fn() },
            updateNotificationFeature: {},
            getAllGames: () => games,
            getCurrentSort: () => 'name',
            setAllGames: vi.fn(),
            setRunningFlag: (key, isRunning) => { games[0].isRunning = isRunning; },
            sortGames: vi.fn(),
            documentRef: null,
            getStrings: () => ({})
        });

        // First update: 5 seconds accrued
        await playtimeUpdatedHandler({ gameKey: 'game-1', accruedMs: 5000 });
        expect(games[0].playtime).toBe(65000);
        expect(games[0].isRunning).toBe(true);

        // Subsequent update: 10 seconds accrued
        await playtimeUpdatedHandler({ gameKey: 'game-1', accruedMs: 10000 });
        expect(games[0].playtime).toBe(70000);

        // Guard against NaN or malformed accruedMs
        await playtimeUpdatedHandler({ gameKey: 'game-1', accruedMs: NaN });
        expect(games[0].playtime).toBe(60000); // 60000 + 0

        // getGames() must NEVER have been called during playtime updates
        expect(mockElectronAPI.getGames).not.toHaveBeenCalled();
    });

    it('synchronizes child instances and differentiates DOM cards between library grid and stack overlay modal', async () => {
        let playtimeUpdatedHandler;
        const mockElectronAPI = {
            onBootStatus: vi.fn(),
            onGameStopped: vi.fn(),
            onGamePlaytimeUpdated: (cb) => { playtimeUpdatedHandler = cb; },
            onTranslationStatus: vi.fn(),
            getGames: vi.fn()
        };

        const stackGame = {
            gameId: 'stack-root',
            gameKey: 'stack-root',
            playtime: 120000,
            basePlaytime: 120000,
            isRunning: false,
            instances: [
                {
                    gameId: 'inst-1',
                    gameKey: 'inst-1',
                    playtime: 80000,
                    basePlaytime: 80000,
                    isRunning: false
                },
                {
                    gameId: 'inst-2',
                    gameKey: 'inst-2',
                    playtime: 40000,
                    basePlaytime: 40000,
                    isRunning: false
                }
            ]
        };

        const repGridCard = createMockCard('stack-root', false);
        const inst1Card = createMockCard('inst-1', true);
        const inst2Card = createMockCard('inst-2', true);

        const mockDocument = {
            querySelectorAll: (selector) => {
                if (selector.includes('stack-root') && selector.includes(':not(.stack-overlay-card)')) {
                    return [repGridCard];
                }
                if (selector.includes('.stack-overlay-card') && selector.includes('inst-1')) {
                    return [inst1Card];
                }
                if (selector.includes('.stack-overlay-card') && selector.includes('inst-2')) {
                    return [inst2Card];
                }
                return [];
            }
        };

        bindIpcEvents({
            electronAPI: mockElectronAPI,
            bootController: { show: vi.fn(), hide: vi.fn() },
            updateNotificationFeature: {},
            getAllGames: () => [stackGame],
            getCurrentSort: () => 'name',
            setAllGames: vi.fn(),
            setRunningFlag: vi.fn(),
            sortGames: vi.fn(),
            documentRef: mockDocument,
            getStrings: () => ({ status_playing: 'Playing Now' })
        });

        // inst-1 is playing, 15s accrued
        await playtimeUpdatedHandler({ gameKey: 'inst-1', accruedMs: 15000 });

        // Check in-memory state
        expect(stackGame.instances[0].isRunning).toBe(true);
        expect(stackGame.instances[0].playtime).toBe(95000);
        expect(stackGame.instances[1].isRunning).toBe(false);
        expect(stackGame.instances[1].playtime).toBe(40000);

        // Check DOM state
        // 1. Representative grid card receives Playing Now and aggregate playtime
        expect(repGridCard.querySelector('.game-status').textContent).toBe('Playing Now');
        expect(repGridCard.querySelector('.game-playtime').textContent).toBe('2m'); // 135000ms = 2m

        // 2. Active child instance overlay card receives Playing Now and individual playtime
        expect(inst1Card.querySelector('.game-status').textContent).toBe('Playing Now');
        expect(inst1Card.querySelector('.game-playtime').textContent).toBe('1m'); // 95000ms = 1m

        // 3. Inactive sibling instance card MUST NOT be modified
        expect(inst2Card.querySelector('.game-status').textContent).toBe('Never played');
        expect(inst2Card.querySelector('.game-playtime').textContent).toBe('0m');
    });

    it('onGameStopped fast-updates status in DOM synchronously before async getGames reload', async () => {
        let gameStoppedHandler;
        const mockElectronAPI = {
            onBootStatus: vi.fn(),
            onGameStopped: (cb) => { gameStoppedHandler = cb; },
            onGamePlaytimeUpdated: vi.fn(),
            onTranslationStatus: vi.fn(),
            getGames: vi.fn().mockResolvedValue([
                { gameId: 'game-1', gameKey: 'game-1', playtime: 90000, lastPlayed: Date.now(), isRunning: false }
            ])
        };

        const targetGame = {
            gameId: 'game-1',
            gameKey: 'game-1',
            playtime: 90000,
            lastPlayed: 0,
            isRunning: true,
            _sessionBasePlaytime: 60000
        };

        const gridCard = createMockCard('game-1', false);
        gridCard.querySelector('.game-status').textContent = 'Playing';

        const mockDocument = {
            querySelectorAll: (selector) => {
                if (selector.includes('game-1')) return [gridCard];
                return [];
            }
        };

        const setAllGames = vi.fn();
        const sortGames = vi.fn();

        bindIpcEvents({
            electronAPI: mockElectronAPI,
            bootController: { show: vi.fn(), hide: vi.fn() },
            updateNotificationFeature: {},
            getAllGames: () => [targetGame],
            getCurrentSort: () => 'name',
            setAllGames,
            setRunningFlag: (key, isRunning) => { targetGame.isRunning = isRunning; },
            sortGames,
            documentRef: mockDocument,
            getStrings: () => ({ status_recent: 'Just now' })
        });

        await gameStoppedHandler({ gameKey: 'game-1' });

        // In-memory target state reset
        expect(targetGame.isRunning).toBe(false);
        expect(targetGame._sessionBasePlaytime).toBeUndefined();
        expect(targetGame.lastPlayed).toBeGreaterThan(0);

        // DOM updated immediately to localized recent status
        expect(gridCard.querySelector('.game-status').textContent).toBe('Just now');

        // Backend reloaded and sorted
        expect(mockElectronAPI.getGames).toHaveBeenCalledTimes(1);
        expect(setAllGames).toHaveBeenCalledTimes(1);
        expect(sortGames).toHaveBeenCalledTimes(1);
    });

    it('updates card to Playing and increments playtime when gameId differs from gameKey (continuity ID)', async () => {
        let playtimeUpdatedHandler;
        let gameStoppedHandler;
        const mockElectronAPI = {
            onBootStatus: vi.fn(),
            onGameStopped: (cb) => { gameStoppedHandler = cb; },
            onGamePlaytimeUpdated: (cb) => { playtimeUpdatedHandler = cb; },
            onTranslationStatus: vi.fn(),
            getGames: vi.fn().mockResolvedValue([])
        };

        const targetGame = {
            gameId: 'game:folder:living with a little fox girl|exe:game',
            gameKey: 'living with a little fox girl',
            playtime: 0,
            basePlaytime: 0,
            isRunning: false
        };

        const gridCard = createMockCard('game:folder:living with a little fox girl|exe:game', false);

        const mockDocument = {
            querySelectorAll: (selector) => {
                const unescaped = selector.replace(/\\/g, '');
                if (unescaped.includes(':not(.stack-overlay-card)') && (
                    unescaped.includes('living with a little fox girl') || unescaped.includes('exe:game')
                )) {
                    return [gridCard];
                }
                return [];
            }
        };

        bindIpcEvents({
            electronAPI: mockElectronAPI,
            bootController: { show: vi.fn(), hide: vi.fn() },
            updateNotificationFeature: {},
            getAllGames: () => [targetGame],
            getCurrentSort: () => 'name',
            setAllGames: vi.fn(),
            setRunningFlag: (key, isRunning) => { targetGame.isRunning = isRunning; },
            sortGames: vi.fn(),
            documentRef: mockDocument,
            getStrings: () => ({ status_playing: 'Playing', status_recent: 'Just now' })
        });

        await playtimeUpdatedHandler({
            gameKey: 'game:folder:living with a little fox girl|exe:game',
            accruedMs: 65000
        });

        expect(targetGame.isRunning).toBe(true);
        expect(targetGame.playtime).toBe(65000);
        expect(gridCard.querySelector('.game-status').textContent).toBe('Playing');
        expect(gridCard.querySelector('.game-playtime').textContent).toBe('1m');

        // Now stop the game and verify fast transition to 'Just now'
        await gameStoppedHandler({
            gameKey: 'game:folder:living with a little fox girl|exe:game'
        });
        expect(targetGame.isRunning).toBe(false);
        expect(gridCard.querySelector('.game-status').textContent).toBe('Just now');
    });
});
