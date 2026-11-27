import squeakerSound from '../../../assets/squeaker.mp3';
import metalPipeSound from '../../../assets/metal-pipe.mp3';
import { sanitizeUserPaths } from '../../shared/path-sanitizer';
import type { UiStorageAdapter } from '../state/ui-runtime-state';

export const MASCOT_STORAGE_KEYS = {
  show: 'yumeshelf_mascot_show',
  scale: 'yumeshelf_mascot_scale',
  sound: 'yumeshelf_mascot_sound',
  volume: 'yumeshelf_mascot_volume',
  posX: 'yumeshelf_mascot_x',
  posY: 'yumeshelf_mascot_y',
  bonkCount: 'yumeshelf_mascot_bonk_count',
  hideAndSeek: 'yumeshelf_hide_and_seek',
  deckBonkedQuotes: 'yumeshelf_deck_bonked_quotes',
  deckCardTitles: 'yumeshelf_deck_card_titles',
  deckCardIdleQuotes: 'yumeshelf_deck_card_idle_quotes',
} as const;

export const MASCOT_CARD_KEY = 'yumeshelf_mascot_card';

export const DEFAULT_BONK_QUOTES: readonly string[] = [
  'OIIIIIIII!!!',
  'Ugh!',
  'Poor me :(',
  'Gah-',
  'My braincells!',
  'You can do better than cyberbullying me :(',
  'Bold of you!',
  '@@',
  '???',
];

export const DEFAULT_IDLE_QUOTES: readonly string[] = [
  'Zaako~',
  'Zaako!',
  'Oiiiiiiii',
  'Want some snacks?',
  'You know how a lot of laughing turns into grass?',
  'Stay Young Beautiful And Unique',
  'Why am I talking to a fish?',
  'Teto is 31yo',
  'CUWAYO!',
  'Cuwayo~ cuwayo~',
  'Sakanaaaaa~',
];

export const DEFAULT_TITLES: readonly string[] = [
  'Yume-chan',
  'Prestigious Yume-chan',
  'Admired Yume-chan',
  'Yume-sama',
  'Your Highness',
  'Yume-chama',
  '?????',
  'Maou-chama',
  'Hahahahahha',
];

export type MascotExpression = 'smug' | 'bonked' | 'bonkedTooMuch';
export type MascotSoundKey = 'squeaker' | 'metal-pipe' | 'none';
export type HideAndSeekMode = 'yeaaa' | 'out';

export interface MascotTimingConfig {
  readonly stage1DurationMs: number;   // default 3000
  readonly minCooldownMs: number;      // default 3000
  readonly maxCooldownMs: number;      // default 10000
  readonly cooldownStepMs: number;     // default 1000
  readonly rapidWindowMs: number;      // default 1200
  readonly rapidBurstCount: number;    // default 3
}

export const DEFAULT_MASCOT_TIMING_CONFIG: MascotTimingConfig = {
  stage1DurationMs: 3000,
  minCooldownMs: 3000,
  maxCooldownMs: 10000,
  cooldownStepMs: 1000,
  rapidWindowMs: 1200,
  rapidBurstCount: 3,
};

export function resolveMascotTimingConfig(
  overrides?: Partial<MascotTimingConfig>
): MascotTimingConfig {
  if (!overrides) return DEFAULT_MASCOT_TIMING_CONFIG;
  return {
    stage1DurationMs:
      typeof overrides.stage1DurationMs === 'number' && Number.isFinite(overrides.stage1DurationMs) && overrides.stage1DurationMs >= 0
        ? overrides.stage1DurationMs
        : DEFAULT_MASCOT_TIMING_CONFIG.stage1DurationMs,
    minCooldownMs:
      typeof overrides.minCooldownMs === 'number' && Number.isFinite(overrides.minCooldownMs) && overrides.minCooldownMs >= 0
        ? overrides.minCooldownMs
        : DEFAULT_MASCOT_TIMING_CONFIG.minCooldownMs,
    maxCooldownMs:
      typeof overrides.maxCooldownMs === 'number' && Number.isFinite(overrides.maxCooldownMs) && overrides.maxCooldownMs >= 0
        ? overrides.maxCooldownMs
        : DEFAULT_MASCOT_TIMING_CONFIG.maxCooldownMs,
    cooldownStepMs:
      typeof overrides.cooldownStepMs === 'number' && Number.isFinite(overrides.cooldownStepMs) && overrides.cooldownStepMs >= 0
        ? overrides.cooldownStepMs
        : DEFAULT_MASCOT_TIMING_CONFIG.cooldownStepMs,
    rapidWindowMs:
      typeof overrides.rapidWindowMs === 'number' && Number.isFinite(overrides.rapidWindowMs) && overrides.rapidWindowMs >= 0
        ? overrides.rapidWindowMs
        : DEFAULT_MASCOT_TIMING_CONFIG.rapidWindowMs,
    rapidBurstCount:
      typeof overrides.rapidBurstCount === 'number' && Number.isInteger(overrides.rapidBurstCount) && overrides.rapidBurstCount >= 1
        ? overrides.rapidBurstCount
        : DEFAULT_MASCOT_TIMING_CONFIG.rapidBurstCount,
  };
}

export type MascotRecoveryState =
  | { readonly phase: 'smug' }
  | {
      readonly phase: 'bonkedTooMuch';
      readonly streak: number;
      readonly accumulatedCooldownMs: number;
    }
  | {
      readonly phase: 'bonked';
      readonly streak: number;
      readonly accumulatedCooldownMs: number;
      readonly stage2EndTimeMs: number;
      readonly rapidClickTimestamps: readonly number[];
    };

export interface MascotPosition {
  readonly x: number;
  readonly y: number;
}

export interface MascotPreferencesState {
  readonly show: boolean;
  readonly scale: number; // clamped [25, 100], default 30
  readonly sound: MascotSoundKey; // default 'squeaker'
  readonly volume: number; // clamped [0, 100], default 20 (preserves '0')
  readonly hideAndSeek: HideAndSeekMode; // default 'out'
}

export interface MascotAudioPlayer {
  play(soundKey: MascotSoundKey | string, volumePercent: number): void;
  stop(): void;
  warmup?(): void;
}

const SOUND_SOURCES: Record<Exclude<MascotSoundKey, 'none'>, string> = {
  squeaker: squeakerSound,
  'metal-pipe': metalPipeSound,
};

function warnDomainStorageFailure(
  operation: 'read' | 'write' | 'parse_deck',
  storageKey: string,
  err: unknown
): void {
  console.warn('[MascotDomain] Storage operation failed:', {
    operation,
    key: storageKey,
    error: sanitizeUserPaths(err instanceof Error ? err.message : String(err)),
    stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
  });
}

function resolveStorage(
  storage?: Pick<UiStorageAdapter, 'getItem'>
): Pick<UiStorageAdapter, 'getItem'> | undefined {
  if (storage !== undefined) return storage;
  return typeof localStorage !== 'undefined' ? localStorage : undefined;
}

function safeGetItem(
  storage: Pick<UiStorageAdapter, 'getItem'> | undefined,
  key: string
): string | null {
  const store = resolveStorage(storage);
  if (!store) return null;
  try {
    return store.getItem(key);
  } catch (err) {
    warnDomainStorageFailure('read', key, err);
    return null;
  }
}

function safeSetItem(
  storage: UiStorageAdapter | undefined,
  key: string,
  value: string
): void {
  const store =
    storage !== undefined
      ? storage
      : typeof localStorage !== 'undefined'
        ? localStorage
        : undefined;
  if (!store) return;
  try {
    store.setItem(key, value);
  } catch (err) {
    warnDomainStorageFailure('write', key, err);
  }
}

export function normalizeMascotScale(raw: number | string | null | undefined, fallback = 30): number {
  if (raw === null || raw === undefined) return fallback;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.length === 0) return fallback;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) && parsed > 0 ? Math.min(100, Math.max(25, parsed)) : fallback;
  }
  return Number.isFinite(raw) && raw > 0 ? Math.min(100, Math.max(25, raw)) : fallback;
}

export function normalizeMascotSound(raw: string | null | undefined): MascotSoundKey {
  if (raw === 'squeaker' || raw === 'metal-pipe' || raw === 'none') {
    return raw;
  }
  return 'squeaker';
}

export function normalizeMascotVolume(raw: number | string | null | undefined, fallback = 20): number {
  if (raw === null || raw === undefined) return fallback;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.length === 0) return fallback;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : fallback;
  }
  return Number.isFinite(raw) ? Math.min(100, Math.max(0, raw)) : fallback;
}

export function normalizeHideAndSeekMode(raw: string | null | undefined): HideAndSeekMode {
  return raw === 'yeaaa' ? 'yeaaa' : 'out';
}

export function parseMascotPreferences(
  storage?: Pick<UiStorageAdapter, 'getItem'>
): MascotPreferencesState {
  const rawShow = safeGetItem(storage, MASCOT_STORAGE_KEYS.show);
  const rawScale = safeGetItem(storage, MASCOT_STORAGE_KEYS.scale);
  const rawSound = safeGetItem(storage, MASCOT_STORAGE_KEYS.sound);
  const rawVolume = safeGetItem(storage, MASCOT_STORAGE_KEYS.volume);
  const rawHideAndSeek = safeGetItem(storage, MASCOT_STORAGE_KEYS.hideAndSeek);

  return {
    show: rawShow !== 'off',
    scale: normalizeMascotScale(rawScale, 30),
    sound: normalizeMascotSound(rawSound),
    volume: normalizeMascotVolume(rawVolume, 20),
    hideAndSeek: normalizeHideAndSeekMode(rawHideAndSeek),
  };
}

export function parseMascotPosition(
  storage?: Pick<UiStorageAdapter, 'getItem'>
): MascotPosition | null {
  const rawX = safeGetItem(storage, MASCOT_STORAGE_KEYS.posX);
  const rawY = safeGetItem(storage, MASCOT_STORAGE_KEYS.posY);

  if (rawX === null || rawY === null) return null;
  const trimmedX = rawX.trim();
  const trimmedY = rawY.trim();
  if (trimmedX.length === 0 || trimmedY.length === 0) return null;

  const parsedX = Number(trimmedX);
  const parsedY = Number(trimmedY);
  if (!Number.isFinite(parsedX) || !Number.isFinite(parsedY)) return null;

  return { x: parsedX, y: parsedY };
}

export function parseBonkCount(
  storage?: Pick<UiStorageAdapter, 'getItem'>
): number {
  const raw = safeGetItem(storage, MASCOT_STORAGE_KEYS.bonkCount);
  if (raw === null) return 0;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return 0;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

export function getNextShuffledIndex(
  storageKey: string,
  totalCount: number,
  storage?: UiStorageAdapter,
  rng: () => number = Math.random
): number {
  if (!(Number.isInteger(totalCount) && totalCount > 1)) {
    return 0;
  }

  let deck: number[] = [];
  const raw = safeGetItem(storage, storageKey);
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (
        Array.isArray(parsed) &&
        parsed.every((n): n is number => Number.isInteger(n) && n >= 0 && n < totalCount)
      ) {
        deck = [...parsed];
      }
    } catch (err) {
      warnDomainStorageFailure('parse_deck', storageKey, err);
      deck = [];
    }
  }

  if (deck.length === 0) {
    deck = Array.from({ length: totalCount }, (_, i) => i);
    for (let i = deck.length - 1; i > 0; i--) {
      const rawRng = rng();
      const safeRng = Number.isFinite(rawRng)
        ? Math.min(1 - Number.EPSILON, Math.max(0, rawRng))
        : 0;
      const j = Math.floor(safeRng * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
  }

  const nextIndex = deck.pop() ?? 0;
  safeSetItem(storage, storageKey, JSON.stringify(deck));
  return nextIndex;
}

export function applyBonkTransition(
  prev: MascotRecoveryState,
  nowMs: number,
  config: MascotTimingConfig = DEFAULT_MASCOT_TIMING_CONFIG,
  options?: { readonly ignoreStage2Expiry?: boolean }
): MascotRecoveryState {
  if (
    prev.phase === 'bonked' &&
    (options?.ignoreStage2Expiry || prev.stage2EndTimeMs > nowMs)
  ) {
    const nextStreak = prev.streak + 1;
    const nextAccumulatedCooldownMs = options?.ignoreStage2Expiry
      ? Math.min(
          config.maxCooldownMs,
          Math.max(config.minCooldownMs, prev.accumulatedCooldownMs + config.cooldownStepMs)
        )
      : Math.min(
          config.maxCooldownMs,
          Math.max(
            config.minCooldownMs,
            Math.max(0, prev.stage2EndTimeMs - nowMs) + config.cooldownStepMs
          )
        );

    const nextRapidClickTimestamps = [
      ...prev.rapidClickTimestamps.filter((t) => nowMs - t < config.rapidWindowMs),
      nowMs,
    ];

    if (nextRapidClickTimestamps.length >= config.rapidBurstCount) {
      return {
        phase: 'bonkedTooMuch',
        streak: nextStreak,
        accumulatedCooldownMs: nextAccumulatedCooldownMs,
      };
    }

    return {
      phase: 'bonked',
      streak: nextStreak,
      accumulatedCooldownMs: nextAccumulatedCooldownMs,
      stage2EndTimeMs: nowMs + nextAccumulatedCooldownMs,
      rapidClickTimestamps: nextRapidClickTimestamps,
    };
  }

  if (prev.phase === 'bonkedTooMuch') {
    const nextStreak = prev.streak + 1;
    const nextAccumulatedCooldownMs = Math.min(
      config.maxCooldownMs,
      Math.max(config.minCooldownMs, prev.accumulatedCooldownMs + config.cooldownStepMs)
    );
    return {
      phase: 'bonkedTooMuch',
      streak: nextStreak,
      accumulatedCooldownMs: nextAccumulatedCooldownMs,
    };
  }

  // Starting fresh from 'smug' or expired 'bonked'
  if (config.rapidBurstCount <= 1) {
    return {
      phase: 'bonkedTooMuch',
      streak: 1,
      accumulatedCooldownMs: config.minCooldownMs,
    };
  }

  return {
    phase: 'bonked',
    streak: 1,
    accumulatedCooldownMs: config.minCooldownMs,
    stage2EndTimeMs: nowMs + config.minCooldownMs,
    rapidClickTimestamps: [nowMs],
  };
}

export function applyStage1Complete(
  prev: MascotRecoveryState,
  nowMs: number
): MascotRecoveryState {
  switch (prev.phase) {
    case 'bonkedTooMuch':
      return {
        phase: 'bonked',
        streak: prev.streak,
        accumulatedCooldownMs: prev.accumulatedCooldownMs,
        stage2EndTimeMs: nowMs + prev.accumulatedCooldownMs,
        rapidClickTimestamps: [],
      };
    case 'smug':
    case 'bonked':
      return prev;
  }
}

export function applyReturnFromHideAndSeek(
  streak: number,
  accumulatedMs: number,
  nowMs: number,
  config: MascotTimingConfig = DEFAULT_MASCOT_TIMING_CONFIG
): MascotRecoveryState {
  const safeStreak = Number.isInteger(streak) && streak > 0 ? streak : 1;
  const safeAccumulated = Number.isFinite(accumulatedMs)
    ? Math.min(config.maxCooldownMs, Math.max(config.minCooldownMs, accumulatedMs))
    : config.minCooldownMs;

  return {
    phase: 'bonked',
    streak: safeStreak,
    accumulatedCooldownMs: safeAccumulated,
    stage2EndTimeMs: nowMs + safeAccumulated,
    rapidClickTimestamps: [],
  };
}

export function recoverToSmug(): MascotRecoveryState {
  return { phase: 'smug' };
}

export function createMascotAudioPlayer(): MascotAudioPlayer {
  const audioCache = new Map<Exclude<MascotSoundKey, 'none'>, HTMLAudioElement>();
  const bufferCache = new Map<Exclude<MascotSoundKey, 'none'>, AudioBuffer>();
  const pendingDecodes = new Map<
    Exclude<MascotSoundKey, 'none'>,
    Promise<AudioBuffer | null>
  >();
  let activeAudio: HTMLAudioElement | null = null;
  let audioCtx: AudioContext | null = null;
  let activeSource: AudioBufferSourceNode | null = null;

  function getAudioContextCtor(): (new (options?: AudioContextOptions) => AudioContext) | null {
    if (typeof globalThis === 'undefined') return null;
    const ctor =
      globalThis.AudioContext ??
      (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    return typeof ctor === 'function' ? ctor : null;
  }

  function ensureAudioContext(): AudioContext | null {
    if (audioCtx) return audioCtx;
    const AudioCtx = getAudioContextCtor();
    if (!AudioCtx) return null;
    try {
      audioCtx = new AudioCtx({ latencyHint: 'interactive' });
      return audioCtx;
    } catch {
      try {
        audioCtx = new AudioCtx();
        return audioCtx;
      } catch {
        return null;
      }
    }
  }

  function loadAudioBuffer(
    soundKey: Exclude<MascotSoundKey, 'none'>
  ): Promise<AudioBuffer | null> {
    const cached = bufferCache.get(soundKey);
    if (cached) return Promise.resolve(cached);

    const inflight = pendingDecodes.get(soundKey);
    if (inflight) return inflight;

    const ctx = ensureAudioContext();
    if (!ctx || typeof fetch !== 'function') return Promise.resolve(null);

    const task = fetch(SOUND_SOURCES[soundKey])
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status} loading mascot sound`);
        }
        return res.arrayBuffer();
      })
      .then((arrayBuf) => ctx.decodeAudioData(arrayBuf))
      .then((decoded) => {
        bufferCache.set(soundKey, decoded);
        return decoded;
      })
      .catch((err: unknown) => {
        console.warn('[MascotAudioPlayer] Failed to decode Web Audio buffer:', {
          soundKey,
          error: sanitizeUserPaths(err instanceof Error ? err.message : String(err)),
          stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
        });
        return null;
      })
      .finally(() => {
        pendingDecodes.delete(soundKey);
      });

    pendingDecodes.set(soundKey, task);
    return task;
  }

  function stop(): void {
    if (activeSource) {
      const sourceToStop = activeSource;
      activeSource = null;
      try {
        sourceToStop.stop();
        sourceToStop.disconnect();
      } catch {
        // Best-effort cleanup
      }
    }
    if (!activeAudio) return;
    const audioToStop = activeAudio;
    activeAudio = null;
    try {
      audioToStop.pause();
      audioToStop.currentTime = 0;
    } catch {
      // Best-effort cleanup
    }
  }

  function getOrCreateAudio(
    soundKey: Exclude<MascotSoundKey, 'none'>,
    volumePercent: number
  ): HTMLAudioElement | null {
    const cached = audioCache.get(soundKey);
    if (cached) return cached;
    if (typeof Audio === 'undefined') return null;

    const soundSrc = SOUND_SOURCES[soundKey];
    try {
      const audio = new Audio(soundSrc);
      audio.preload = 'auto';
      audioCache.set(soundKey, audio);
      return audio;
    } catch (err) {
      console.warn('[MascotAudioPlayer] Failed to initialize audio element:', {
        soundKey,
        volumePercent,
        error: sanitizeUserPaths(err instanceof Error ? err.message : String(err)),
        stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
      });
      return null;
    }
  }

  function warmup(): void {
    if (getAudioContextCtor() && typeof fetch === 'function') {
      ensureAudioContext();
      void loadAudioBuffer('squeaker');
      void loadAudioBuffer('metal-pipe');
      return;
    }

    for (const key of ['squeaker', 'metal-pipe'] as const) {
      const audio = getOrCreateAudio(key, 0);
      if (!audio) continue;
      try {
        if (typeof audio.load === 'function') {
          audio.load();
        }
      } catch {
        // Best-effort preload in non-media runtimes
      }
    }
  }

  function playWithWebAudio(
    soundKey: Exclude<MascotSoundKey, 'none'>,
    vol: number
  ): boolean {
    const ctx = ensureAudioContext();
    if (!ctx) return false;

    const buffer = bufferCache.get(soundKey);
    if (!buffer) {
      void loadAudioBuffer(soundKey);
      return false;
    }

    try {
      if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
        void ctx.resume().catch(() => {});
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.value = vol;
      source.connect(gain);
      gain.connect(ctx.destination);
      activeSource = source;
      source.onended = () => {
        if (activeSource === source) {
          activeSource = null;
        }
      };
      source.start(0);
      return true;
    } catch {
      activeSource = null;
      return false;
    }
  }

  function play(soundKey: MascotSoundKey | string, volumePercent: number): void {
    stop();

    if (soundKey === 'none') return;
    if (!Number.isFinite(volumePercent) || volumePercent <= 0) return;
    if (soundKey !== 'squeaker' && soundKey !== 'metal-pipe') return;

    const vol = Math.min(1, Math.max(0, volumePercent / 100));
    if (vol <= 0) return;

    if (playWithWebAudio(soundKey, vol)) {
      return;
    }

    const audio = getOrCreateAudio(soundKey, volumePercent);
    if (!audio) return;

    try {
      audio.currentTime = 0;
    } catch {
      // Best-effort rewind before replay
    }

    try {
      activeAudio = audio;
      activeAudio.volume = vol;
    } catch (err) {
      activeAudio = null;
      console.warn('[MascotAudioPlayer] Failed to initialize audio element:', {
        soundKey,
        volumePercent,
        error: sanitizeUserPaths(err instanceof Error ? err.message : String(err)),
        stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
      });
      return;
    }

    const startPlayback = async (): Promise<void> => {
      try {
        await audio.play();
      } catch (err) {
        console.warn('[MascotAudioPlayer] Audio playback failed:', {
          soundKey,
          volumePercent,
          error: sanitizeUserPaths(err instanceof Error ? err.message : String(err)),
          stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
        });
      }
    };
    void startPlayback();
  }

  return { play, stop, warmup };
}
