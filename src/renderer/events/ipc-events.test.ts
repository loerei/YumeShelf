import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createUiRuntimeState } from '../state/ui-runtime-state';
import type { GameEntry, LibraryConfig } from '../types/game';
import type { ElectronAPI } from '../../shared/types/ipc';
import { bindIpcEvents } from './ipc-events';

function makeGame(overrides: Partial<GameEntry> & { gameKey: string }): GameEntry {
  return {
    name: overrides.name ?? overrides.gameKey,
    ...overrides,
  };
}

function createMockElectronAPI() {
  let bootHandler: ((payload: unknown) => void) | undefined;
  let stoppedHandler: ((payload: unknown) => Promise<void> | void) | undefined;
  let playtimeHandler: ((payload: unknown) => void) | undefined;
  let translationHandler: ((payload: unknown) => void) | undefined;

  const unsubBoot = vi.fn();
  const unsubStopped = vi.fn();
  const unsubPlaytime = vi.fn();
  const unsubTranslation = vi.fn();

  const api = {
    onBootStatus: vi.fn((cb: (payload: unknown) => void) => {
      bootHandler = cb;
      return unsubBoot;
    }),
    onGameStopped: vi.fn((cb: (payload: unknown) => Promise<void> | void) => {
      stoppedHandler = cb;
      return unsubStopped;
    }),
    onGamePlaytimeUpdated: vi.fn((cb: (payload: unknown) => void) => {
      playtimeHandler = cb;
      return unsubPlaytime;
    }),
    onTranslationStatus: vi.fn((cb: (payload: unknown) => void) => {
      translationHandler = cb;
      return unsubTranslation;
    }),
    getGames: vi.fn<() => Promise<GameEntry[]>>().mockResolvedValue([]),
  } as unknown as ElectronAPI;

  return {
    api,
    unsubs: { unsubBoot, unsubStopped, unsubPlaytime, unsubTranslation },
    emitBoot: (payload: unknown) => bootHandler?.(payload),
    emitStopped: (payload: unknown) => stoppedHandler?.(payload),
    emitPlaytime: (payload: unknown) => playtimeHandler?.(payload),
    emitTranslation: (payload: unknown) => translationHandler?.(payload),
  };
}

describe('bindIpcEvents', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('onGamePlaytimeUpdated updates store playtime and synchronizes running flag even when initially non-running', () => {
    const store = createUiRuntimeState();
    const child1 = makeGame({
      gameKey: 'inst-1',
      instanceId: 'inst-1',
      playtime: 80000,
      basePlaytime: 80000,
      isRunning: false,
    });
    const parent = makeGame({
      gameKey: 'stack-root',
      playtime: 80000,
      basePlaytime: 80000,
      isRunning: false,
      instances: [child1],
    });
    const single = makeGame({
      gameKey: 'game-1',
      playtime: 60000,
      basePlaytime: 60000,
      isRunning: false,
    });
    store.setAllGames([single, parent]);

    const { api, emitPlaytime } = createMockElectronAPI();
    const setRunningFlag = vi.fn();

    const dispose = bindIpcEvents(store, { setRunningFlag }, api);

    // Single non-running game transitions to running
    emitPlaytime({ gameKey: 'game-1', accruedMs: 5000 });
    expect(store.getSnapshot().allGames[0].playtime).toBe(65000);
    expect(store.getSnapshot().allGames[0].isRunning).toBe(true);
    expect(setRunningFlag).toHaveBeenCalledWith('game-1', true);

    // Child instance transitions to running
    emitPlaytime({ gameKey: 'inst-1', accruedMs: 15000 });
    expect(store.getSnapshot().allGames[1].instances?.[0].isRunning).toBe(true);
    expect(store.getSnapshot().allGames[1].instances?.[0].playtime).toBe(95000);
    expect(setRunningFlag).toHaveBeenCalledWith('inst-1', true);

    // Malformed NaN / negative accruedMs clamped to 0
    emitPlaytime({ gameKey: 'game-1', accruedMs: Number.NaN });
    expect(store.getSnapshot().allGames[0].playtime).toBe(60000);

    expect(api.getGames).not.toHaveBeenCalled();
    dispose();
  });

  it('onGameStopped executes two-phase running clear and authoritative annotated reconciliation', async () => {
    const store = createUiRuntimeState();
    const config: LibraryConfig = {
      libraryPaths: ['C:\\Games'],
      libraryPath: 'C:\\Games',
      maxDepth: 2,
      autoLaunch: false,
      minimizeToTray: false,
    };
    store.setCurrentLibraryConfig(config);
    store.setLocationDisplayMode('full');
    store.setAllGames([
      makeGame({
        gameKey: 'game-1',
        folderPath: 'C:\\Games\\Sub\\GameOne',
        isRunning: true,
        playtime: 60000,
      }),
    ]);

    let resolveGames!: (games: GameEntry[]) => void;
    const { api, emitStopped } = createMockElectronAPI();
    vi.mocked(api.getGames).mockImplementation(
      () =>
        new Promise<GameEntry[]>((resolve) => {
          resolveGames = resolve;
        })
    );

    const setRunningFlag = vi.fn();
    const setAllGames = vi.fn();
    const sortGames = vi.fn();

    const dispose = bindIpcEvents(store, { setRunningFlag, setAllGames, sortGames }, api);

    const stopPromise = emitStopped({ gameKey: 'game-1' });

    // Phase 1: synchronous clear before getGames resolves
    expect(store.getSnapshot().allGames[0].isRunning).toBe(false);
    expect(setRunningFlag).toHaveBeenCalledWith('game-1', false);

    // Phase 2: resolve backend games with path annotations
    resolveGames([
      makeGame({
        gameKey: 'game-1',
        folderPath: 'C:\\Games\\Sub\\GameOne',
        isRunning: false,
        playtime: 90000,
        lastPlayed: 1700000000000,
      }),
    ]);
    await stopPromise;

    const reconciled = store.getSnapshot().allGames[0];
    expect(reconciled.playtime).toBe(90000);
    expect(reconciled.relativePathFullDisplay).toBe('/Games/game-1');
    expect(reconciled.fullLocationLabel).toBe('Games/game-1');
    expect(setAllGames).toHaveBeenCalledWith(store.getSnapshot().allGames);
    expect(sortGames).toHaveBeenCalledTimes(1);

    dispose();
  });

  it('onGameStopped discards stale reconciliation responses via latestReconciliationSeq', async () => {
    const store = createUiRuntimeState();
    store.setAllGames([makeGame({ gameKey: 'game-1', isRunning: true, playtime: 10 })]);

    const resolvers: Array<(games: GameEntry[]) => void> = [];
    const { api, emitStopped } = createMockElectronAPI();
    vi.mocked(api.getGames).mockImplementation(
      () =>
        new Promise<GameEntry[]>((resolve) => {
          resolvers.push(resolve);
        })
    );

    const dispose = bindIpcEvents(store, {}, api);

    const firstStop = emitStopped({ gameKey: 'game-1' });
    const secondStop = emitStopped({ gameKey: 'game-1' });

    // Resolve newer request first, then older stale request
    resolvers[1]([makeGame({ gameKey: 'game-1', playtime: 200, isRunning: false })]);
    await secondStop;
    expect(store.getSnapshot().allGames[0].playtime).toBe(200);

    resolvers[0]([makeGame({ gameKey: 'game-1', playtime: 50, isRunning: false })]);
    await firstStop;
    expect(store.getSnapshot().allGames[0].playtime).toBe(200);

    dispose();
  });

  it('onGameStopped logs sanitized error context when getGames rejects', async () => {
    const store = createUiRuntimeState();
    const { api, emitStopped } = createMockElectronAPI();
    vi.mocked(api.getGames).mockRejectedValue(
      new Error('Failed reading C:\\Users\\John Doe\\AppData\\Local\\games.json')
    );

    const dispose = bindIpcEvents(store, {}, api);

    await emitStopped({ gameKey: '/Users/alice/Games/Demo' });

    expect(console.error).toHaveBeenCalledWith(
      '[IpcEvents] Failed to reconcile games on stop:',
      expect.objectContaining({
        gameKey: '<USER_DIR>/Games/Demo',
        error: expect.stringContaining('<USER_DIR>'),
      })
    );
    const logged = vi.mocked(console.error).mock.calls[0][1] as { gameKey: string; error: string; stack?: string };
    expect(logged.gameKey).not.toContain('alice');
    expect(logged.error).not.toContain('John Doe');

    dispose();
  });

  it('onTranslationStatus maps blocking statuses, clamps progress, and manages delayed hideTimeout', () => {
    vi.useFakeTimers();
    const store = createUiRuntimeState();
    const { api, emitTranslation, emitBoot } = createMockElectronAPI();
    const bootController = { show: vi.fn(), hide: vi.fn() };

    const dispose = bindIpcEvents(store, { bootController }, api);

    emitBoot({ key: 'boot_init' });
    expect(bootController.show).toHaveBeenCalledWith({ key: 'boot_init' });

    emitTranslation({ status: 'downloading', progress: 1.5 });
    expect(bootController.show).toHaveBeenLastCalledWith({
      key: null,
      fallbackText: 'Downloading Translator (100%)...',
      showProgress: true,
      progress: 1,
      mode: 'startup',
    });

    emitTranslation({ status: 'preparing', progress: -0.5 });
    expect(bootController.show).toHaveBeenLastCalledWith({
      key: null,
      fallbackText: 'Preparing Auto-Translator...',
      showProgress: true,
      progress: 0,
      mode: 'startup',
    });

    // Terminal status schedules hide after 800ms
    emitTranslation({ status: 'ready' });
    expect(bootController.hide).not.toHaveBeenCalled();

    // Interleaved blocking status cancels pending hideTimeout
    vi.advanceTimersByTime(400);
    emitTranslation({ status: 'extracting-binaries', progress: 0.25 });
    vi.advanceTimersByTime(800);
    expect(bootController.hide).not.toHaveBeenCalled();

    // Terminal status completes after 800ms when uninterrupted
    emitTranslation({ status: 'error' });
    vi.advanceTimersByTime(800);
    expect(bootController.hide).toHaveBeenCalledTimes(1);

    // dispose() cancels active hideTimeout
    emitTranslation({ status: 'ready' });
    dispose();
    vi.advanceTimersByTime(1000);
    expect(bootController.hide).toHaveBeenCalledTimes(1);
  });

  it('dispose invokes all unsubscribe handles and sanitizes unsubscribe errors', () => {
    const store = createUiRuntimeState();
    const { api, unsubs } = createMockElectronAPI();

    unsubs.unsubStopped.mockImplementation(() => {
      throw new Error('Unsubscribe failed for C:\\Users\\John Doe\\ipc');
    });

    const dispose = bindIpcEvents(store, {}, api);
    dispose();

    expect(unsubs.unsubBoot).toHaveBeenCalledTimes(1);
    expect(unsubs.unsubTranslation).toHaveBeenCalledTimes(1);
    expect(unsubs.unsubPlaytime).toHaveBeenCalledTimes(1);
    expect(unsubs.unsubStopped).toHaveBeenCalledTimes(1);

    expect(console.warn).toHaveBeenCalledWith(
      '[IpcDispatcher] Unsubscribe failed during teardown:',
      expect.objectContaining({
        error: expect.stringContaining('<USER_DIR>'),
      })
    );
    const logged = vi.mocked(console.warn).mock.calls[0][1] as { error: string };
    expect(logged.error).not.toContain('John Doe');
  });
});
