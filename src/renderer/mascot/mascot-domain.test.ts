import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  MASCOT_STORAGE_KEYS,
  MASCOT_CARD_KEY,
  DEFAULT_BONK_QUOTES,
  DEFAULT_IDLE_QUOTES,
  DEFAULT_TITLES,
  DEFAULT_MASCOT_TIMING_CONFIG,
  parseMascotPreferences,
  parseMascotPosition,
  parseBonkCount,
  getNextShuffledIndex,
  applyBonkTransition,
  applyStage1Complete,
  applyReturnFromHideAndSeek,
  recoverToSmug,
  createMascotAudioPlayer,
  type MascotRecoveryState,
} from './mascot-domain';
import type { UiStorageAdapter } from '../state/ui-runtime-state';

function createMemoryStorage(initial: Record<string, string> = {}): UiStorageAdapter {
  const data = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (key: string) => (data.has(key) ? data.get(key)! : null),
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
}

describe('mascot-domain', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constants', () => {
    it('exports canonical storage keys and default pools', () => {
      expect(MASCOT_STORAGE_KEYS.show).toBe('yumeshelf_mascot_show');
      expect(MASCOT_STORAGE_KEYS.scale).toBe('yumeshelf_mascot_scale');
      expect(MASCOT_STORAGE_KEYS.sound).toBe('yumeshelf_mascot_sound');
      expect(MASCOT_STORAGE_KEYS.volume).toBe('yumeshelf_mascot_volume');
      expect(MASCOT_STORAGE_KEYS.posX).toBe('yumeshelf_mascot_x');
      expect(MASCOT_STORAGE_KEYS.posY).toBe('yumeshelf_mascot_y');
      expect(MASCOT_STORAGE_KEYS.bonkCount).toBe('yumeshelf_mascot_bonk_count');
      expect(MASCOT_STORAGE_KEYS.hideAndSeek).toBe('yumeshelf_hide_and_seek');
      expect(MASCOT_STORAGE_KEYS.deckBonkedQuotes).toBe('yumeshelf_deck_bonked_quotes');
      expect(MASCOT_STORAGE_KEYS.deckCardTitles).toBe('yumeshelf_deck_card_titles');
      expect(MASCOT_STORAGE_KEYS.deckCardIdleQuotes).toBe('yumeshelf_deck_card_idle_quotes');
      expect(MASCOT_CARD_KEY).toBe('yumeshelf_mascot_card');
      expect(DEFAULT_BONK_QUOTES.length).toBeGreaterThan(0);
      expect(DEFAULT_IDLE_QUOTES.length).toBeGreaterThan(0);
      expect(DEFAULT_TITLES.length).toBeGreaterThan(0);
    });
  });

  describe('parseMascotPreferences', () => {
    it('returns default preferences when storage is empty', () => {
      const storage = createMemoryStorage();
      expect(parseMascotPreferences(storage)).toEqual({
        show: true,
        scale: 30,
        sound: 'squeaker',
        volume: 20,
        hideAndSeek: 'out',
      });
    });

    it('handles show boundary values', () => {
      expect(parseMascotPreferences(createMemoryStorage({ [MASCOT_STORAGE_KEYS.show]: 'on' })).show).toBe(true);
      expect(parseMascotPreferences(createMemoryStorage({ [MASCOT_STORAGE_KEYS.show]: 'off' })).show).toBe(false);
      expect(parseMascotPreferences(createMemoryStorage({ [MASCOT_STORAGE_KEYS.show]: '   ' })).show).toBe(true);
      expect(parseMascotPreferences(createMemoryStorage({ [MASCOT_STORAGE_KEYS.show]: 'invalid' })).show).toBe(true);
    });

    it('handles sound boundary values', () => {
      expect(parseMascotPreferences(createMemoryStorage({ [MASCOT_STORAGE_KEYS.sound]: 'squeaker' })).sound).toBe('squeaker');
      expect(parseMascotPreferences(createMemoryStorage({ [MASCOT_STORAGE_KEYS.sound]: 'metal-pipe' })).sound).toBe('metal-pipe');
      expect(parseMascotPreferences(createMemoryStorage({ [MASCOT_STORAGE_KEYS.sound]: 'none' })).sound).toBe('none');
      expect(parseMascotPreferences(createMemoryStorage({ [MASCOT_STORAGE_KEYS.sound]: 'invalid' })).sound).toBe('squeaker');
      expect(parseMascotPreferences(createMemoryStorage({ [MASCOT_STORAGE_KEYS.sound]: '   ' })).sound).toBe('squeaker');
    });

    it('handles hideAndSeek boundary values', () => {
      expect(parseMascotPreferences(createMemoryStorage({ [MASCOT_STORAGE_KEYS.hideAndSeek]: 'yeaaa' })).hideAndSeek).toBe('yeaaa');
      expect(parseMascotPreferences(createMemoryStorage({ [MASCOT_STORAGE_KEYS.hideAndSeek]: 'out' })).hideAndSeek).toBe('out');
      expect(parseMascotPreferences(createMemoryStorage({ [MASCOT_STORAGE_KEYS.hideAndSeek]: 'invalid' })).hideAndSeek).toBe('out');
      expect(parseMascotPreferences(createMemoryStorage({ [MASCOT_STORAGE_KEYS.hideAndSeek]: '   ' })).hideAndSeek).toBe('out');
    });

    it('preserves explicit 0 volume and clamps out-of-range or whitespace values', () => {
      expect(parseMascotPreferences(createMemoryStorage({ [MASCOT_STORAGE_KEYS.volume]: '0' })).volume).toBe(0);
      expect(parseMascotPreferences(createMemoryStorage({ [MASCOT_STORAGE_KEYS.volume]: '-5' })).volume).toBe(0);
      expect(parseMascotPreferences(createMemoryStorage({ [MASCOT_STORAGE_KEYS.volume]: '150' })).volume).toBe(100);
      expect(parseMascotPreferences(createMemoryStorage({ [MASCOT_STORAGE_KEYS.volume]: '   ' })).volume).toBe(20);
      expect(parseMascotPreferences(createMemoryStorage({ [MASCOT_STORAGE_KEYS.volume]: 'NaN' })).volume).toBe(20);
    });

    it('clamps scale to [25, 100] and treats <= 0 or whitespace as default 30', () => {
      expect(parseMascotPreferences(createMemoryStorage({ [MASCOT_STORAGE_KEYS.scale]: '10' })).scale).toBe(25);
      expect(parseMascotPreferences(createMemoryStorage({ [MASCOT_STORAGE_KEYS.scale]: '200' })).scale).toBe(100);
      expect(parseMascotPreferences(createMemoryStorage({ [MASCOT_STORAGE_KEYS.scale]: '0' })).scale).toBe(30);
      expect(parseMascotPreferences(createMemoryStorage({ [MASCOT_STORAGE_KEYS.scale]: '-10' })).scale).toBe(30);
      expect(parseMascotPreferences(createMemoryStorage({ [MASCOT_STORAGE_KEYS.scale]: '   ' })).scale).toBe(30);
      expect(parseMascotPreferences(createMemoryStorage({ [MASCOT_STORAGE_KEYS.scale]: '65' })).scale).toBe(65);
    });
  });

  describe('parseMascotPosition', () => {
    it('parses finite x and y coordinates and rejects partial, whitespace, or non-finite values', () => {
      expect(parseMascotPosition(createMemoryStorage())).toBeNull();
      expect(parseMascotPosition(createMemoryStorage({ [MASCOT_STORAGE_KEYS.posX]: '100' }))).toBeNull();
      expect(parseMascotPosition(createMemoryStorage({ [MASCOT_STORAGE_KEYS.posX]: '   ', [MASCOT_STORAGE_KEYS.posY]: '50' }))).toBeNull();
      expect(parseMascotPosition(createMemoryStorage({ [MASCOT_STORAGE_KEYS.posX]: 'Infinity', [MASCOT_STORAGE_KEYS.posY]: '50' }))).toBeNull();
      expect(parseMascotPosition(createMemoryStorage({ [MASCOT_STORAGE_KEYS.posX]: '120', [MASCOT_STORAGE_KEYS.posY]: '240' }))).toEqual({
        x: 120,
        y: 240,
      });
    });
  });

  describe('parseBonkCount', () => {
    it('accepts non-negative integers and falls back to 0 on invalid inputs', () => {
      expect(parseBonkCount(createMemoryStorage())).toBe(0);
      expect(parseBonkCount(createMemoryStorage({ [MASCOT_STORAGE_KEYS.bonkCount]: '0' }))).toBe(0);
      expect(parseBonkCount(createMemoryStorage({ [MASCOT_STORAGE_KEYS.bonkCount]: '42' }))).toBe(42);
      expect(parseBonkCount(createMemoryStorage({ [MASCOT_STORAGE_KEYS.bonkCount]: '1.5' }))).toBe(0);
      expect(parseBonkCount(createMemoryStorage({ [MASCOT_STORAGE_KEYS.bonkCount]: '-1' }))).toBe(0);
      expect(parseBonkCount(createMemoryStorage({ [MASCOT_STORAGE_KEYS.bonkCount]: 'abc' }))).toBe(0);
      expect(parseBonkCount(createMemoryStorage({ [MASCOT_STORAGE_KEYS.bonkCount]: '   ' }))).toBe(0);
    });
  });

  describe('getNextShuffledIndex', () => {
    it('returns 0 immediately when totalCount <= 1 or non-integer', () => {
      const storage = createMemoryStorage();
      const setSpy = vi.spyOn(storage, 'setItem');
      expect(getNextShuffledIndex('deck', 0, storage)).toBe(0);
      expect(getNextShuffledIndex('deck', 1, storage)).toBe(0);
      expect(getNextShuffledIndex('deck', 1.5, storage)).toBe(0);
      expect(setSpy).not.toHaveBeenCalled();
    });

    it('rejects non-integer or out-of-bounds deck entries and reshuffles cleanly', () => {
      const storage = createMemoryStorage({
        deck: JSON.stringify([0, 1.5, 99, -1]),
      });
      const idx = getNextShuffledIndex('deck', 3, storage, () => 0.5);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(3);
      const remaining = JSON.parse(storage.getItem('deck')!);
      expect(Array.isArray(remaining)).toBe(true);
      expect(remaining).toHaveLength(2);
    });

    it('logs [MascotDomain] sanitized warning on corrupt JSON and recovers', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const storage = createMemoryStorage({
        [MASCOT_STORAGE_KEYS.deckBonkedQuotes]: '{not-valid-json',
      });
      const idx = getNextShuffledIndex(MASCOT_STORAGE_KEYS.deckBonkedQuotes, 4, storage, () => 0.25);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(4);
      expect(warnSpy).toHaveBeenCalledWith(
        '[MascotDomain] Storage operation failed:',
        expect.objectContaining({
          operation: 'parse_deck',
          key: MASCOT_STORAGE_KEYS.deckBonkedQuotes,
          error: expect.any(String),
        })
      );
    });

    it('guards non-finite NaN and out-of-range rng() results', () => {
      const storage = createMemoryStorage();
      const idxNan = getNextShuffledIndex('deck_nan', 4, storage, () => Number.NaN);
      expect(Number.isInteger(idxNan)).toBe(true);
      expect(idxNan).toBeGreaterThanOrEqual(0);
      expect(idxNan).toBeLessThan(4);

      const storageHigh = createMemoryStorage();
      const idxHigh = getNextShuffledIndex('deck_high', 4, storageHigh, () => 5);
      expect(Number.isInteger(idxHigh)).toBe(true);
      expect(idxHigh).toBeGreaterThanOrEqual(0);
      expect(idxHigh).toBeLessThan(4);
    });

    it('handles storage read/write exceptions with sanitized [MascotDomain] warnings and zero ambient localStorage calls', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const localGetSpy = vi.spyOn(window.localStorage, 'getItem');
      const localSetSpy = vi.spyOn(window.localStorage, 'setItem');

      const failingStorage: UiStorageAdapter = {
        getItem: () => {
          throw new Error('Read failed at C:\\Users\\alice\\AppData\\Local\\test');
        },
        setItem: () => {
          throw new Error('Write failed at C:\\Users\\alice\\AppData\\Local\\test');
        },
        removeItem: () => {},
      };

      const idx = getNextShuffledIndex('deck_err', 3, failingStorage, () => 0.1);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(3);
      expect(localGetSpy).not.toHaveBeenCalled();
      expect(localSetSpy).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        '[MascotDomain] Storage operation failed:',
        expect.objectContaining({
          operation: 'read',
          key: 'deck_err',
          error: 'Read failed at <USER_DIR>\\AppData\\Local\\test',
        })
      );
      expect(warnSpy).toHaveBeenCalledWith(
        '[MascotDomain] Storage operation failed:',
        expect.objectContaining({
          operation: 'write',
          key: 'deck_err',
          error: 'Write failed at <USER_DIR>\\AppData\\Local\\test',
        })
      );
    });
  });

  describe('MascotRecoveryState FSM', () => {
    const config = DEFAULT_MASCOT_TIMING_CONFIG;

    it('transitions smug -> bonked -> bonkedTooMuch -> bonked -> smug', () => {
      const s0: MascotRecoveryState = { phase: 'smug' };
      const s1 = applyBonkTransition(s0, 1000, config);
      expect(s1).toEqual({
        phase: 'bonked',
        streak: 1,
        accumulatedCooldownMs: 3000,
        stage2EndTimeMs: 4000,
        rapidClickTimestamps: [1000],
      });

      const s2 = applyBonkTransition(s1, 1200, config);
      expect(s2).toEqual({
        phase: 'bonked',
        streak: 2,
        accumulatedCooldownMs: 3800,
        stage2EndTimeMs: 5000,
        rapidClickTimestamps: [1000, 1200],
      });

      // 3rd click within 1200ms rapidWindowMs -> bonkedTooMuch
      const s3 = applyBonkTransition(s2, 1400, config);
      expect(s3).toEqual({
        phase: 'bonkedTooMuch',
        streak: 3,
        accumulatedCooldownMs: 4600,
      });

      // Stage 1 complete -> bonked
      const s4 = applyStage1Complete(s3, 4400);
      expect(s4).toEqual({
        phase: 'bonked',
        streak: 3,
        accumulatedCooldownMs: 4600,
        stage2EndTimeMs: 9000,
        rapidClickTimestamps: [],
      });

      expect(recoverToSmug()).toEqual({ phase: 'smug' });
    });

    it('treats expired bonked state (stage2EndTimeMs <= nowMs) identically to smug by default', () => {
      const expiredBonked: MascotRecoveryState = {
        phase: 'bonked',
        streak: 4,
        accumulatedCooldownMs: 5000,
        stage2EndTimeMs: 2000,
        rapidClickTimestamps: [1000],
      };

      const next = applyBonkTransition(expiredBonked, 2000, config);
      expect(next).toEqual({
        phase: 'bonked',
        streak: 1,
        accumulatedCooldownMs: 3000,
        stage2EndTimeMs: 5000,
        rapidClickTimestamps: [2000],
      });
    });

    it('preserves Stage 2 streak and accumulatedCooldownMs past stage2EndTimeMs when ignoreStage2Expiry is true', () => {
      const deferredBonked: MascotRecoveryState = {
        phase: 'bonked',
        streak: 2,
        accumulatedCooldownMs: 3000,
        stage2EndTimeMs: 4000,
        rapidClickTimestamps: [1000],
      };

      const next = applyBonkTransition(deferredBonked, 10000, config, {
        ignoreStage2Expiry: true,
      });
      expect(next).toEqual({
        phase: 'bonked',
        streak: 3,
        accumulatedCooldownMs: 4000,
        stage2EndTimeMs: 14000,
        rapidClickTimestamps: [10000],
      });

      const cappedBonked: MascotRecoveryState = {
        phase: 'bonked',
        streak: 9,
        accumulatedCooldownMs: 10000,
        stage2EndTimeMs: 12000,
        rapidClickTimestamps: [2000],
      };

      const nextCapped = applyBonkTransition(cappedBonked, 20000, config, {
        ignoreStage2Expiry: true,
      });
      expect(nextCapped).toEqual({
        phase: 'bonked',
        streak: 10,
        accumulatedCooldownMs: 10000,
        stage2EndTimeMs: 30000,
        rapidClickTimestamps: [20000],
      });
    });

    it('prunes rapid clicks outside rapidWindowMs', () => {
      const s1 = applyBonkTransition({ phase: 'smug' }, 1000, config);
      const s2 = applyBonkTransition(s1, 2500, config);
      expect(s2.phase).toBe('bonked');
      if (s2.phase === 'bonked') {
        expect(s2.rapidClickTimestamps).toEqual([2500]);
      }
    });

    it('sanitizes streak and accumulatedMs in applyReturnFromHideAndSeek', () => {
      expect(applyReturnFromHideAndSeek(-3, Number.NaN, 5000, config)).toEqual({
        phase: 'bonked',
        streak: 1,
        accumulatedCooldownMs: 3000,
        stage2EndTimeMs: 8000,
        rapidClickTimestamps: [],
      });

      expect(applyReturnFromHideAndSeek(7, 25000, 5000, config)).toEqual({
        phase: 'bonked',
        streak: 7,
        accumulatedCooldownMs: 10000,
        stage2EndTimeMs: 15000,
        rapidClickTimestamps: [],
      });
    });
  });

  describe('createMascotAudioPlayer', () => {
    let originalAudio: typeof globalThis.Audio;
    let constructedInstances: Array<{
      src: string;
      preload: string;
      volume: number;
      currentTime: number;
      load: ReturnType<typeof vi.fn>;
      play: ReturnType<typeof vi.fn>;
      pause: ReturnType<typeof vi.fn>;
    }>;

    beforeEach(() => {
      originalAudio = globalThis.Audio;
      constructedInstances = [];
    });

    afterEach(() => {
      globalThis.Audio = originalAudio;
    });

    function installMockAudio(
      playImpl: () => Promise<void> = () => Promise.resolve(),
      pauseImpl: () => void = () => {}
    ) {
      const AudioMock = vi.fn().mockImplementation(function (src: string) {
        const instance = {
          src,
          preload: '',
          volume: 1,
          currentTime: 5,
          load: vi.fn(),
          play: vi.fn(playImpl),
          pause: vi.fn(pauseImpl),
        };
        constructedInstances.push(instance);
        return instance;
      });
      globalThis.Audio = AudioMock as unknown as typeof globalThis.Audio;
      return AudioMock;
    }

    it('plays squeaker and metal-pipe with normalized volume', () => {
      const AudioMock = installMockAudio();
      const player = createMascotAudioPlayer();

      player.play('squeaker', 40);
      expect(AudioMock).toHaveBeenCalledTimes(1);
      expect(constructedInstances[0].src).toContain('squeaker');
      expect(constructedInstances[0].volume).toBe(0.4);
      expect(constructedInstances[0].play).toHaveBeenCalledTimes(1);

      player.play('metal-pipe', 100);
      expect(AudioMock).toHaveBeenCalledTimes(2);
      expect(constructedInstances[0].pause).toHaveBeenCalledTimes(1);
      expect(constructedInstances[0].currentTime).toBe(0);
      expect(constructedInstances[1].src).toContain('metal-pipe');
      expect(constructedInstances[1].volume).toBe(1);
      expect(constructedInstances[1].play).toHaveBeenCalledTimes(1);
    });

    it('treats none and volume <= 0 as no-ops', () => {
      const AudioMock = installMockAudio();
      const player = createMascotAudioPlayer();

      player.play('none', 50);
      player.play('squeaker', 0);
      player.play('squeaker', -10);
      expect(AudioMock).not.toHaveBeenCalled();
    });

    it('stop() pauses and resets currentTime = 0 on active audio', () => {
      installMockAudio();
      const player = createMascotAudioPlayer();

      player.play('squeaker', 50);
      player.stop();
      expect(constructedInstances[0].pause).toHaveBeenCalledTimes(1);
      expect(constructedInstances[0].currentTime).toBe(0);
    });

    it('catches rejected play() promises and throwing Audio constructors/pause calls with sanitized warnings', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      installMockAudio(
        () => Promise.reject(new Error('Autoplay blocked at /Users/bob/app')),
        () => {
          throw new Error('Pause failed');
        }
      );

      const player = createMascotAudioPlayer();
      player.play('squeaker', 50);
      await Promise.resolve();
      await Promise.resolve();

      expect(warnSpy).toHaveBeenCalledWith(
        '[MascotAudioPlayer] Audio playback failed:',
        expect.objectContaining({
          soundKey: 'squeaker',
          volumePercent: 50,
          error: 'Autoplay blocked at <USER_DIR>/app',
        })
      );

      // stop() throwing pause should not throw
      expect(() => player.stop()).not.toThrow();

      // Throwing constructor
      globalThis.Audio = vi.fn().mockImplementation(function () {
        throw new Error('Audio ctor failed at /home/charlie/yume');
      }) as unknown as typeof globalThis.Audio;

      const throwingPlayer = createMascotAudioPlayer();
      expect(() => throwingPlayer.play('squeaker', 50)).not.toThrow();
      expect(warnSpy).toHaveBeenCalledWith(
        '[MascotAudioPlayer] Failed to initialize audio element:',
        expect.objectContaining({
          soundKey: 'squeaker',
          volumePercent: 50,
          error: 'Audio ctor failed at <USER_DIR>/yume',
        })
      );
    });

    it('warmup() preloads audio elements and play() reuses cached instances without reconstructing', () => {
      const AudioMock = installMockAudio();
      const player = createMascotAudioPlayer();

      player.warmup?.();
      expect(AudioMock).toHaveBeenCalledTimes(2);
      expect(constructedInstances[0].preload).toBe('auto');
      expect(constructedInstances[0].load).toHaveBeenCalledTimes(1);
      expect(constructedInstances[1].preload).toBe('auto');
      expect(constructedInstances[1].load).toHaveBeenCalledTimes(1);

      player.play('squeaker', 30);
      player.play('squeaker', 60);
      expect(AudioMock).toHaveBeenCalledTimes(2);
      expect(constructedInstances[0].play).toHaveBeenCalledTimes(2);
      expect(constructedInstances[0].volume).toBe(0.6);
    });

    it('uses Web Audio API decoded AudioBuffer cache when AudioContext is available and stops active source cleanly', async () => {
      const origAudioContext = globalThis.AudioContext;
      const origFetch = globalThis.fetch;

      const createdSources: Array<{
        buffer: unknown;
        connect: ReturnType<typeof vi.fn>;
        start: ReturnType<typeof vi.fn>;
        stop: ReturnType<typeof vi.fn>;
        disconnect: ReturnType<typeof vi.fn>;
        onended: (() => void) | null;
      }> = [];
      const createdGains: Array<{
        gain: { value: number };
        connect: ReturnType<typeof vi.fn>;
      }> = [];
      const resumeMock = vi.fn().mockResolvedValue(undefined);
      const decodeMock = vi.fn().mockImplementation(async () => ({ duration: 0.2 }));

      globalThis.AudioContext = vi.fn().mockImplementation(function () {
        return {
          state: 'suspended',
          destination: { kind: 'dest' },
          resume: resumeMock,
          decodeAudioData: decodeMock,
          createBufferSource: vi.fn(() => {
            const src = {
              buffer: null,
              connect: vi.fn(),
              start: vi.fn(),
              stop: vi.fn(),
              disconnect: vi.fn(),
              onended: null,
            };
            createdSources.push(src);
            return src;
          }),
          createGain: vi.fn(() => {
            const gainNode = {
              gain: { value: 1 },
              connect: vi.fn(),
            };
            createdGains.push(gainNode);
            return gainNode;
          }),
        };
      }) as unknown as typeof globalThis.AudioContext;

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
      }) as unknown as typeof globalThis.fetch;

      try {
        const AudioMock = installMockAudio();
        const player = createMascotAudioPlayer();

        player.warmup?.();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(globalThis.fetch).toHaveBeenCalledTimes(2);
        expect(decodeMock).toHaveBeenCalledTimes(2);

        player.play('squeaker', 40);
        expect(AudioMock).not.toHaveBeenCalled();
        expect(resumeMock).toHaveBeenCalledTimes(1);
        expect(createdGains[0].gain.value).toBe(0.4);
        expect(createdSources[0].start).toHaveBeenCalledWith(0);

        player.stop();
        expect(createdSources[0].stop).toHaveBeenCalledTimes(1);
      } finally {
        globalThis.AudioContext = origAudioContext;
        globalThis.fetch = origFetch;
      }
    });
  });
});
