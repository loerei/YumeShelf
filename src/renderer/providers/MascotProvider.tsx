import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { createPortal } from 'react-dom';
import { useSyncExternalStoreWithSelector } from 'use-sync-external-store/with-selector';
import bonkEffectImg from '../../../assets/BONK.png';
import { sanitizeUserPaths } from '../../shared/path-sanitizer';
import { useLocaleStrings, type LocaleStrings } from '../i18n/locale-strings';
import {
  DEFAULT_BONK_QUOTES,
  DEFAULT_IDLE_QUOTES,
  DEFAULT_TITLES,
  MASCOT_STORAGE_KEYS,
  applyBonkTransition,
  applyReturnFromHideAndSeek,
  applyStage1Complete,
  createMascotAudioPlayer,
  getNextShuffledIndex,
  normalizeHideAndSeekMode,
  normalizeMascotScale,
  normalizeMascotSound,
  normalizeMascotVolume,
  parseBonkCount,
  parseMascotPreferences,
  recoverToSmug,
  resolveMascotTimingConfig,
  type HideAndSeekMode,
  type MascotAudioPlayer,
  type MascotExpression,
  type MascotRecoveryState,
  type MascotSoundKey,
  type MascotTimingConfig,
} from '../mascot/mascot-domain';
import type { UiStorageAdapter } from '../state/ui-runtime-state';

export const MAX_BONK_PARTICLES = 16;

export interface BonkEvent {
  readonly quote: string;
  readonly seq: number;
}

export interface BonkOptions {
  readonly clientX?: number;
  readonly clientY?: number;
  readonly renderedHeight?: number;
  readonly deferRecoveryThreshold?: number;
}

export type MascotPreferencesPatch = Partial<{
  show: boolean;
  scale: number;
  sound: string;
  volume: number;
  hideAndSeek: HideAndSeekMode;
}>;

export interface MascotContextValue {
  readonly storage?: UiStorageAdapter;
  readonly show: boolean;
  readonly scale: number;
  readonly sound: MascotSoundKey;
  readonly volume: number;
  readonly hideAndSeek: HideAndSeekMode;
  readonly isWidgetVisible: boolean;
  readonly isHideAndSeekCardActive: boolean;
  readonly isDismissed: boolean;
  readonly isDragging: boolean;
  readonly recoveryState: MascotRecoveryState;
  readonly expression: MascotExpression;
  readonly activeBonkQuote: string | null;
  readonly lastBonkEvent: BonkEvent | null;
  readonly bonkCount: number;
  readonly cardTitleIndex: number;
  readonly isCardStarred: boolean;
  readonly sessionSlotFraction: number;
  readonly hideAndSeekThreshold: number;
  setShow(show: boolean): void;
  setScale(scale: number | string): void;
  setSound(sound: string): void;
  setVolume(volume: number | string): void;
  setHideAndSeek(mode: HideAndSeekMode): void;
  updatePreferences(patch: MascotPreferencesPatch): void;
  bonk(options?: BonkOptions): MascotRecoveryState;
  cancelDeferredRecovery(): void;
  interruptRecoveryForDrag(): void;
  finishDrag(): void;
  returnFromHideAndSeek(streak: number, accumulatedMs: number): void;
  getMascotCardTitle(strings?: LocaleStrings | Record<string, unknown> | null): string;
  getNextIdleQuote(strings?: LocaleStrings | Record<string, unknown> | null): string;
}

export type MascotHideAndSeekSlice = Pick<
  MascotContextValue,
  | 'isHideAndSeekCardActive'
  | 'isCardStarred'
  | 'cardTitleIndex'
  | 'sessionSlotFraction'
  | 'hideAndSeekThreshold'
  | 'getMascotCardTitle'
  | 'bonk'
  | 'returnFromHideAndSeek'
  | 'cancelDeferredRecovery'
>;

export type MascotSearchSlice = Pick<
  MascotContextValue,
  | 'activeBonkQuote'
  | 'lastBonkEvent'
  | 'isHideAndSeekCardActive'
  | 'isCardStarred'
  | 'cardTitleIndex'
  | 'expression'
  | 'getMascotCardTitle'
>;

interface MascotStore {
  subscribe(listener: () => void): () => void;
  getSnapshot(): MascotContextValue | null;
}

const NOOP_MASCOT_STORE: MascotStore = {
  subscribe: () => () => {},
  getSnapshot: () => null,
};

const MascotStoreContext = createContext<MascotStore | null>(null);

interface InternalMascotState {
  readonly show: boolean;
  readonly scale: number;
  readonly sound: MascotSoundKey;
  readonly volume: number;
  readonly hideAndSeek: HideAndSeekMode;
  readonly isDismissed: boolean;
  readonly isDragging: boolean;
  readonly recoveryState: MascotRecoveryState;
  readonly activeBonkQuote: string | null;
  readonly lastBonkEvent: BonkEvent | null;
  readonly bonkCount: number;
  readonly cardTitleIndex: number;
  readonly isCardStarred: boolean;
  readonly sessionSlotFraction: number;
  readonly hideAndSeekThreshold: number;
}

interface InternalMascotActions {
  setShow(show: boolean): void;
  setScale(scale: number | string): void;
  setSound(sound: string): void;
  setVolume(volume: number | string): void;
  setHideAndSeek(mode: HideAndSeekMode): void;
  updatePreferences(patch: MascotPreferencesPatch): void;
  bonk(options?: BonkOptions): MascotRecoveryState;
  cancelDeferredRecovery(): void;
  interruptRecoveryForDrag(): void;
  finishDrag(): void;
  returnFromHideAndSeek(streak: number, accumulatedMs: number): void;
  getMascotCardTitle(strings?: LocaleStrings | Record<string, unknown> | null): string;
  getNextIdleQuote(strings?: LocaleStrings | Record<string, unknown> | null): string;
}

interface MutableMascotStore extends MascotStore {
  getState(): InternalMascotState;
  setState(updater: (prev: InternalMascotState) => InternalMascotState): void;
  setActions(actions: InternalMascotActions): void;
}

function warnProviderStorageFailure(
  operation: 'read' | 'write',
  storageKey: string,
  err: unknown
): void {
  console.warn('[MascotProvider] Storage operation failed:', {
    operation,
    key: storageKey,
    error: sanitizeUserPaths(err instanceof Error ? err.message : String(err)),
    stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
  });
}

function writeProviderStorage(
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
    warnProviderStorageFailure('write', key, err);
  }
}

function readProviderBonkCount(storage: UiStorageAdapter | undefined): number {
  const store =
    storage !== undefined
      ? storage
      : typeof localStorage !== 'undefined'
        ? localStorage
        : undefined;
  if (!store) return 0;
  try {
    return parseBonkCount(store);
  } catch (err) {
    warnProviderStorageFailure('read', MASCOT_STORAGE_KEYS.bonkCount, err);
    return 0;
  }
}

function clampUnitRng(rng: () => number): number {
  const raw = rng();
  if (!Number.isFinite(raw)) return 0;
  return Math.min(1 - Number.EPSILON, Math.max(0, raw));
}

function createHideAndSeekSessionIdentity(
  storage: UiStorageAdapter | undefined,
  rng: () => number
): {
  cardTitleIndex: number;
  isCardStarred: boolean;
  sessionSlotFraction: number;
  hideAndSeekThreshold: number;
} {
  const cardTitleIndex = getNextShuffledIndex(
    MASCOT_STORAGE_KEYS.deckCardTitles,
    DEFAULT_TITLES.length,
    storage,
    rng
  );
  const isCardStarred = clampUnitRng(rng) < 0.5;
  const sessionSlotFraction = clampUnitRng(rng);
  const hideAndSeekThreshold = Math.floor(clampUnitRng(rng) * 6) + 5;
  return {
    cardTitleIndex,
    isCardStarred,
    sessionSlotFraction,
    hideAndSeekThreshold,
  };
}

function buildSnapshot(
  state: InternalMascotState,
  actions: InternalMascotActions,
  storage?: UiStorageAdapter
): MascotContextValue {
  const isHideAndSeekCardActive =
    state.show && state.hideAndSeek === 'yeaaa' && !state.isDismissed;
  const isWidgetVisible = state.show && !isHideAndSeekCardActive;
  const expression: MascotExpression = state.isDragging
    ? 'bonked'
    : state.recoveryState.phase;

  return {
    storage,
    show: state.show,
    scale: state.scale,
    sound: state.sound,
    volume: state.volume,
    hideAndSeek: state.hideAndSeek,
    isWidgetVisible,
    isHideAndSeekCardActive,
    isDismissed: state.isDismissed,
    isDragging: state.isDragging,
    recoveryState: state.recoveryState,
    expression,
    activeBonkQuote: state.activeBonkQuote,
    lastBonkEvent: state.lastBonkEvent,
    bonkCount: state.bonkCount,
    cardTitleIndex: state.cardTitleIndex,
    isCardStarred: state.isCardStarred,
    sessionSlotFraction: state.sessionSlotFraction,
    hideAndSeekThreshold: state.hideAndSeekThreshold,
    ...actions,
  };
}

function createMutableMascotStore(
  initialState: InternalMascotState,
  initialActions: InternalMascotActions,
  storage?: UiStorageAdapter
): MutableMascotStore {
  let state = initialState;
  let actions = initialActions;
  let snapshot = buildSnapshot(state, actions, storage);
  const listeners = new Set<() => void>();

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    getState: () => state,
    setState: (updater) => {
      const next = updater(state);
      if (Object.is(next, state)) return;
      state = next;
      snapshot = buildSnapshot(state, actions, storage);
      for (const listener of listeners) {
        listener();
      }
    },
    setActions: (nextActions) => {
      actions = nextActions;
      snapshot = buildSnapshot(state, actions, storage);
    },
  };
}

function selectHideAndSeekSlice(
  snapshot: MascotContextValue | null
): MascotHideAndSeekSlice | null {
  if (!snapshot) return null;
  return {
    isHideAndSeekCardActive: snapshot.isHideAndSeekCardActive,
    isCardStarred: snapshot.isCardStarred,
    cardTitleIndex: snapshot.cardTitleIndex,
    sessionSlotFraction: snapshot.sessionSlotFraction,
    hideAndSeekThreshold: snapshot.hideAndSeekThreshold,
    getMascotCardTitle: snapshot.getMascotCardTitle,
    bonk: snapshot.bonk,
    returnFromHideAndSeek: snapshot.returnFromHideAndSeek,
    cancelDeferredRecovery: snapshot.cancelDeferredRecovery,
  };
}

function areHideAndSeekSlicesEqual(
  a: MascotHideAndSeekSlice | null,
  b: MascotHideAndSeekSlice | null
): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b) return false;
  return (
    a.isHideAndSeekCardActive === b.isHideAndSeekCardActive &&
    a.isCardStarred === b.isCardStarred &&
    a.cardTitleIndex === b.cardTitleIndex &&
    a.sessionSlotFraction === b.sessionSlotFraction &&
    a.hideAndSeekThreshold === b.hideAndSeekThreshold &&
    a.getMascotCardTitle === b.getMascotCardTitle &&
    a.bonk === b.bonk &&
    a.returnFromHideAndSeek === b.returnFromHideAndSeek &&
    a.cancelDeferredRecovery === b.cancelDeferredRecovery
  );
}

function selectSearchSlice(
  snapshot: MascotContextValue | null
): MascotSearchSlice | null {
  if (!snapshot) return null;
  return {
    activeBonkQuote: snapshot.activeBonkQuote,
    lastBonkEvent: snapshot.lastBonkEvent,
    isHideAndSeekCardActive: snapshot.isHideAndSeekCardActive,
    isCardStarred: snapshot.isCardStarred,
    cardTitleIndex: snapshot.cardTitleIndex,
    expression: snapshot.expression,
    getMascotCardTitle: snapshot.getMascotCardTitle,
  };
}

function areSearchSlicesEqual(
  a: MascotSearchSlice | null,
  b: MascotSearchSlice | null
): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b) return false;
  return (
    a.activeBonkQuote === b.activeBonkQuote &&
    a.lastBonkEvent === b.lastBonkEvent &&
    a.isHideAndSeekCardActive === b.isHideAndSeekCardActive &&
    a.isCardStarred === b.isCardStarred &&
    a.cardTitleIndex === b.cardTitleIndex &&
    a.expression === b.expression &&
    a.getMascotCardTitle === b.getMascotCardTitle
  );
}

export function useOptionalMascot(): MascotContextValue | null {
  const store = useContext(MascotStoreContext) ?? NOOP_MASCOT_STORE;
  return useSyncExternalStoreWithSelector(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
    (s) => s,
    Object.is
  );
}

export function useMascot(): MascotContextValue {
  const ctx = useOptionalMascot();
  if (!ctx) {
    throw new Error('useMascot must be used within a MascotProvider');
  }
  return ctx;
}

export function useOptionalMascotHideAndSeek(): MascotHideAndSeekSlice | null {
  const store = useContext(MascotStoreContext) ?? NOOP_MASCOT_STORE;
  return useSyncExternalStoreWithSelector(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
    selectHideAndSeekSlice,
    areHideAndSeekSlicesEqual
  );
}

export function useOptionalMascotSearch(): MascotSearchSlice | null {
  const store = useContext(MascotStoreContext) ?? NOOP_MASCOT_STORE;
  return useSyncExternalStoreWithSelector(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
    selectSearchSlice,
    areSearchSlicesEqual
  );
}

interface BonkImpactSpawnOptions {
  readonly clientX?: number;
  readonly clientY?: number;
  readonly renderedHeight?: number;
}

interface BonkImpactLayerProps {
  readonly registerSpawner: (
    spawner: ((options?: BonkImpactSpawnOptions) => void) | null
  ) => void;
  readonly nowProvider: () => number;
  readonly rng: () => number;
}

interface ActiveParticleEntry {
  readonly node: HTMLImageElement;
  rafId: number;
}

export function BonkImpactLayer({
  registerSpawner,
  nowProvider,
  rng,
}: BonkImpactLayerProps): React.ReactPortal | null {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const activeParticlesRef = useRef<ActiveParticleEntry[]>([]);
  const nowProviderRef = useRef(nowProvider);
  const rngRef = useRef(rng);
  nowProviderRef.current = nowProvider;
  rngRef.current = rng;

  useEffect(() => {
    const spawner = (options?: BonkImpactSpawnOptions) => {
      const container = containerRef.current;
      if (!container || typeof document === 'undefined') return;

      if (
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ) {
        return;
      }

      while (activeParticlesRef.current.length >= MAX_BONK_PARTICLES) {
        const oldest = activeParticlesRef.current.shift();
        if (oldest) {
          cancelAnimationFrame(oldest.rafId);
          oldest.node.remove();
        }
      }

      const cx =
        typeof options?.clientX === 'number' && Number.isFinite(options.clientX)
          ? options.clientX
          : typeof window !== 'undefined'
            ? window.innerWidth / 2
            : 0;
      const cy =
        typeof options?.clientY === 'number' && Number.isFinite(options.clientY)
          ? options.clientY
          : typeof window !== 'undefined'
            ? window.innerHeight / 2
            : 0;
      const renderedHeight =
        typeof options?.renderedHeight === 'number' &&
        Number.isFinite(options.renderedHeight) &&
        options.renderedHeight > 0
          ? options.renderedHeight
          : 260;

      const particle = document.createElement('img');
      particle.src = bonkEffectImg;
      particle.alt = 'Bonk Impact';
      particle.className = 'bonk-impact-particle';

      const baseSize = Math.max(65, Math.min(140, renderedHeight * 0.38));
      particle.style.width = `${baseSize}px`;
      particle.style.left = `${cx}px`;
      particle.style.top = `${cy}px`;

      const rotationDeg = clampUnitRng(rngRef.current) * 90 - 45;
      const maxOpacity = 0.75 + clampUnitRng(rngRef.current) * 0.25;

      const tp = 0.12;
      const n = 2.5;
      const duration = 380;
      const startTime = nowProviderRef.current();

      particle.style.opacity = '0';
      particle.style.transform = `translate(-50%, -50%) rotate(${rotationDeg}deg) scale(0.6)`;
      container.appendChild(particle);

      const entry: ActiveParticleEntry = { node: particle, rafId: 0 };
      activeParticlesRef.current.push(entry);

      const animateFrame = () => {
        const elapsed = Math.max(0, nowProviderRef.current() - startTime);
        const t = Math.min(1, elapsed / duration);

        if (t <= 0) {
          particle.style.opacity = '0';
          particle.style.transform = `translate(-50%, -50%) rotate(${rotationDeg}deg) scale(0.6)`;
        } else {
          const curve = Math.pow(t / tp, n) * Math.exp(n * (1.0 - t / tp));
          const currentOpacity = Math.max(0, Math.min(1, curve * maxOpacity));
          const currentScale = 0.7 + 0.35 * Math.min(1.2, curve);

          particle.style.opacity = String(currentOpacity);
          particle.style.transform = `translate(-50%, -50%) rotate(${rotationDeg}deg) scale(${currentScale})`;
        }

        if (t < 1) {
          entry.rafId = requestAnimationFrame(animateFrame);
        } else {
          const idx = activeParticlesRef.current.indexOf(entry);
          if (idx !== -1) {
            activeParticlesRef.current.splice(idx, 1);
          }
          particle.remove();
        }
      };

      entry.rafId = requestAnimationFrame(animateFrame);
    };

    registerSpawner(spawner);
    return () => {
      registerSpawner(null);
      for (const entry of activeParticlesRef.current) {
        cancelAnimationFrame(entry.rafId);
        entry.node.remove();
      }
      activeParticlesRef.current = [];
    };
  }, [registerSpawner]);

  if (typeof document === 'undefined') {
    return null;
  }

  const portalTarget = document.getElementById('portal-root') ?? document.body;
  return createPortal(
    <div ref={containerRef} className="bonk-impact-layer" aria-hidden="true" />,
    portalTarget
  );
}

export interface MascotProviderProps {
  readonly children: React.ReactNode;
  readonly storage?: UiStorageAdapter;
  readonly audioPlayer?: MascotAudioPlayer;
  readonly timingConfig?: Partial<MascotTimingConfig>;
  readonly nowProvider?: () => number;
  readonly rng?: () => number;
}

export function MascotProvider({
  children,
  storage,
  audioPlayer,
  timingConfig,
  nowProvider = () => performance.now(),
  rng = Math.random,
}: MascotProviderProps): React.JSX.Element {
  const strings = useLocaleStrings(storage);
  const stringsRef = useRef<LocaleStrings>(strings);
  stringsRef.current = strings;

  const storageRef = useRef(storage);
  storageRef.current = storage;

  const nowProviderRef = useRef(nowProvider);
  nowProviderRef.current = nowProvider;

  const rngRef = useRef(rng);
  rngRef.current = rng;

  const resolvedTimingConfig = useMemo(
    () => resolveMascotTimingConfig(timingConfig),
    [timingConfig]
  );
  const timingConfigRef = useRef(resolvedTimingConfig);
  timingConfigRef.current = resolvedTimingConfig;

  const resolvedAudioPlayer = useMemo(
    () => audioPlayer ?? createMascotAudioPlayer(),
    [audioPlayer]
  );
  const audioPlayerRef = useRef(resolvedAudioPlayer);
  audioPlayerRef.current = resolvedAudioPlayer;

  const stage1TimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stage2TimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recoveryStateRef = useRef<MascotRecoveryState>({ phase: 'smug' });
  const deferredRecoveryPendingRef = useRef(false);
  const bonkSeqRef = useRef(0);
  const impactSpawnerRef = useRef<((options?: BonkImpactSpawnOptions) => void) | null>(null);

  const registerImpactSpawner = useCallback(
    (spawner: ((options?: BonkImpactSpawnOptions) => void) | null) => {
      impactSpawnerRef.current = spawner;
    },
    []
  );

  const clearRecoveryTimers = useCallback(() => {
    if (stage1TimerRef.current !== null) {
      clearTimeout(stage1TimerRef.current);
      stage1TimerRef.current = null;
    }
    if (stage2TimerRef.current !== null) {
      clearTimeout(stage2TimerRef.current);
      stage2TimerRef.current = null;
    }
  }, []);

  const storeRef = useRef<MutableMascotStore | null>(null);
  if (!storeRef.current) {
    const prefs = parseMascotPreferences(storage);
    const bonkCount = readProviderBonkCount(storage);
    const identity = createHideAndSeekSessionIdentity(storage, rng);

    const initialState: InternalMascotState = {
      show: prefs.show,
      scale: prefs.scale,
      sound: prefs.sound,
      volume: prefs.volume,
      hideAndSeek: prefs.hideAndSeek,
      isDismissed: false,
      isDragging: false,
      recoveryState: { phase: 'smug' },
      activeBonkQuote: null,
      lastBonkEvent: null,
      bonkCount,
      ...identity,
    };

    const noopActions: InternalMascotActions = {
      setShow: () => {},
      setScale: () => {},
      setSound: () => {},
      setVolume: () => {},
      setHideAndSeek: () => {},
      updatePreferences: () => {},
      bonk: () => ({ phase: 'smug' }),
      cancelDeferredRecovery: () => {},
      interruptRecoveryForDrag: () => {},
      finishDrag: () => {},
      returnFromHideAndSeek: () => {},
      getMascotCardTitle: () => 'Yume-chan',
      getNextIdleQuote: () => 'Zaako~',
    };

    storeRef.current = createMutableMascotStore(initialState, noopActions, storage);
  }

  const store = storeRef.current;

  const scheduleStage2Timer = useCallback(
    (cooldownMs: number) => {
      stage2TimerRef.current = setTimeout(() => {
        stage2TimerRef.current = null;
        const smugState = recoverToSmug();
        recoveryStateRef.current = smugState;
        deferredRecoveryPendingRef.current = false;
        store.setState((prev) => ({
          ...prev,
          recoveryState: smugState,
          activeBonkQuote: null,
        }));
      }, cooldownMs);
    },
    [store]
  );

  const scheduleRecoveryTimers = useCallback(
    (stateAfterBonk: MascotRecoveryState) => {
      clearRecoveryTimers();
      if (stateAfterBonk.phase === 'bonkedTooMuch') {
        stage1TimerRef.current = setTimeout(() => {
          stage1TimerRef.current = null;
          const stage2Now = nowProviderRef.current();
          const stage2State = applyStage1Complete(recoveryStateRef.current, stage2Now);
          recoveryStateRef.current = stage2State;
          store.setState((prev) => ({
            ...prev,
            recoveryState: stage2State,
          }));
          if (stage2State.phase === 'bonked') {
            scheduleStage2Timer(stage2State.accumulatedCooldownMs);
          }
        }, timingConfigRef.current.stage1DurationMs);
      } else if (stateAfterBonk.phase === 'bonked') {
        scheduleStage2Timer(stateAfterBonk.accumulatedCooldownMs);
      }
    },
    [clearRecoveryTimers, scheduleStage2Timer, store]
  );

  const setShow = useCallback(
    (nextShow: boolean) => {
      writeProviderStorage(storageRef.current, MASCOT_STORAGE_KEYS.show, nextShow ? 'on' : 'off');
      if (!nextShow) {
        clearRecoveryTimers();
        deferredRecoveryPendingRef.current = false;
        const smugState = recoverToSmug();
        recoveryStateRef.current = smugState;
        store.setState((prev) => ({
          ...prev,
          show: false,
          recoveryState: smugState,
          activeBonkQuote: null,
        }));
      } else {
        store.setState((prev) => ({
          ...prev,
          show: true,
        }));
      }
    },
    [clearRecoveryTimers, store]
  );

  const setScale = useCallback(
    (nextScale: number | string) => {
      const normalized = normalizeMascotScale(nextScale, 30);
      writeProviderStorage(storageRef.current, MASCOT_STORAGE_KEYS.scale, String(normalized));
      store.setState((prev) => ({
        ...prev,
        scale: normalized,
      }));
    },
    [store]
  );

  const setSound = useCallback(
    (nextSound: string) => {
      const normalized = normalizeMascotSound(nextSound);
      writeProviderStorage(storageRef.current, MASCOT_STORAGE_KEYS.sound, normalized);
      store.setState((prev) => ({
        ...prev,
        sound: normalized,
      }));
    },
    [store]
  );

  const setVolume = useCallback(
    (nextVolume: number | string) => {
      const normalized = normalizeMascotVolume(nextVolume, 20);
      writeProviderStorage(storageRef.current, MASCOT_STORAGE_KEYS.volume, String(normalized));
      store.setState((prev) => ({
        ...prev,
        volume: normalized,
      }));
    },
    [store]
  );

  const setHideAndSeek = useCallback(
    (mode: HideAndSeekMode) => {
      const normalized = normalizeHideAndSeekMode(mode);
      writeProviderStorage(storageRef.current, MASCOT_STORAGE_KEYS.hideAndSeek, normalized);
      clearRecoveryTimers();
      deferredRecoveryPendingRef.current = false;
      const smugState = recoverToSmug();
      recoveryStateRef.current = smugState;

      if (normalized === 'yeaaa') {
        const nextIdentity = createHideAndSeekSessionIdentity(storageRef.current, rngRef.current);
        store.setState((prev) => ({
          ...prev,
          hideAndSeek: 'yeaaa',
          isDismissed: false,
          recoveryState: smugState,
          activeBonkQuote: null,
          ...nextIdentity,
        }));
      } else {
        store.setState((prev) => ({
          ...prev,
          hideAndSeek: 'out',
          recoveryState: smugState,
          activeBonkQuote: null,
        }));
      }
    },
    [clearRecoveryTimers, store]
  );

  const updatePreferences = useCallback(
    (patch: MascotPreferencesPatch) => {
      const prev = store.getState();

      if (patch.show !== undefined) {
        if (patch.show === false && prev.show !== false) {
          setShow(false);
        } else if (patch.show !== prev.show) {
          setShow(patch.show);
        }
      }

      if (patch.scale !== undefined) {
        setScale(patch.scale);
      }

      if (patch.sound !== undefined) {
        setSound(patch.sound);
      }

      if (patch.volume !== undefined) {
        setVolume(patch.volume);
      }

      if (patch.hideAndSeek !== undefined) {
        const normalizedMode = normalizeHideAndSeekMode(patch.hideAndSeek);
        if (normalizedMode !== prev.hideAndSeek) {
          setHideAndSeek(normalizedMode);
        }
      }
    },
    [setHideAndSeek, setScale, setShow, setSound, setVolume, store]
  );

  const bonk = useCallback(
    (options?: BonkOptions): MascotRecoveryState => {
      const nowMs = nowProviderRef.current();
      clearRecoveryTimers();

      const nextBonkCount = readProviderBonkCount(storageRef.current) + 1;
      writeProviderStorage(
        storageRef.current,
        MASCOT_STORAGE_KEYS.bonkCount,
        String(nextBonkCount)
      );

      const nextRecovery = applyBonkTransition(
        recoveryStateRef.current,
        nowMs,
        timingConfigRef.current,
        { ignoreStage2Expiry: deferredRecoveryPendingRef.current }
      );
      recoveryStateRef.current = nextRecovery;

      const shouldDeferRecovery =
        typeof options?.deferRecoveryThreshold === 'number' &&
        Number.isFinite(options.deferRecoveryThreshold) &&
        'streak' in nextRecovery &&
        nextRecovery.streak >= options.deferRecoveryThreshold;
      deferredRecoveryPendingRef.current = shouldDeferRecovery;

      const currentState = store.getState();
      audioPlayerRef.current.play(currentState.sound, currentState.volume);

      impactSpawnerRef.current?.({
        clientX: options?.clientX,
        clientY: options?.clientY,
        renderedHeight: options?.renderedHeight,
      });

      const currentStrings = stringsRef.current;
      const quotePool =
        Array.isArray(currentStrings?.mascot_bonk_quotes) &&
        currentStrings.mascot_bonk_quotes.length > 0
          ? currentStrings.mascot_bonk_quotes
          : DEFAULT_BONK_QUOTES;
      const quoteIdx = getNextShuffledIndex(
        MASCOT_STORAGE_KEYS.deckBonkedQuotes,
        quotePool.length,
        storageRef.current,
        rngRef.current
      );
      const quote = quotePool[quoteIdx % quotePool.length] || 'OIIIIIIII!!!';

      bonkSeqRef.current += 1;
      const nextBonkEvent: BonkEvent = { quote, seq: bonkSeqRef.current };

      if (!shouldDeferRecovery) {
        scheduleRecoveryTimers(nextRecovery);
      }

      store.setState((prev) => ({
        ...prev,
        recoveryState: nextRecovery,
        activeBonkQuote: quote,
        lastBonkEvent: nextBonkEvent,
        bonkCount: nextBonkCount,
      }));

      return nextRecovery;
    },
    [clearRecoveryTimers, scheduleRecoveryTimers, store]
  );

  const cancelDeferredRecovery = useCallback(() => {
    if (!deferredRecoveryPendingRef.current) return;
    clearRecoveryTimers();
    deferredRecoveryPendingRef.current = false;
    const smugState = recoverToSmug();
    recoveryStateRef.current = smugState;
    store.setState((prev) => ({
      ...prev,
      recoveryState: smugState,
      activeBonkQuote: null,
    }));
  }, [clearRecoveryTimers, store]);

  const interruptRecoveryForDrag = useCallback(() => {
    clearRecoveryTimers();
    deferredRecoveryPendingRef.current = false;
    const smugState = recoverToSmug();
    recoveryStateRef.current = smugState;
    store.setState((prev) => ({
      ...prev,
      recoveryState: smugState,
      activeBonkQuote: null,
      isDragging: true,
    }));
  }, [clearRecoveryTimers, store]);

  const finishDrag = useCallback(() => {
    store.setState((prev) => ({
      ...prev,
      isDragging: false,
    }));
  }, [store]);

  const returnFromHideAndSeek = useCallback(
    (streak: number, accumulatedMs: number) => {
      clearRecoveryTimers();
      deferredRecoveryPendingRef.current = false;
      const nowMs = nowProviderRef.current();
      const nextRecovery = applyReturnFromHideAndSeek(
        streak,
        accumulatedMs,
        nowMs,
        timingConfigRef.current
      );
      recoveryStateRef.current = nextRecovery;

      store.setState((prev) => ({
        ...prev,
        isDismissed: true,
        recoveryState: nextRecovery,
      }));

      if (nextRecovery.phase === 'bonked') {
        scheduleStage2Timer(nextRecovery.accumulatedCooldownMs);
      }
    },
    [clearRecoveryTimers, scheduleStage2Timer, store]
  );

  const getMascotCardTitle = useCallback(
    (overrideStrings?: LocaleStrings | Record<string, unknown> | null): string => {
      const sourceStrings = overrideStrings ?? stringsRef.current;
      const rawPool = sourceStrings?.mascot_card_titles;
      const pool =
        Array.isArray(rawPool) && rawPool.length > 0
          ? rawPool.filter((item): item is string => typeof item === 'string')
          : DEFAULT_TITLES;
      const effectivePool = pool.length > 0 ? pool : DEFAULT_TITLES;
      const idx = store.getState().cardTitleIndex;
      return effectivePool[idx % effectivePool.length] || 'Yume-chan';
    },
    [store]
  );

  const getNextIdleQuote = useCallback(
    (overrideStrings?: LocaleStrings | Record<string, unknown> | null): string => {
      const sourceStrings = overrideStrings ?? stringsRef.current;
      const rawPool = sourceStrings?.mascot_card_idle_quotes;
      const pool =
        Array.isArray(rawPool) && rawPool.length > 0
          ? rawPool.filter((item): item is string => typeof item === 'string')
          : DEFAULT_IDLE_QUOTES;
      const effectivePool = pool.length > 0 ? pool : DEFAULT_IDLE_QUOTES;
      const idx = getNextShuffledIndex(
        MASCOT_STORAGE_KEYS.deckCardIdleQuotes,
        effectivePool.length,
        storageRef.current,
        rngRef.current
      );
      return effectivePool[idx % effectivePool.length] || 'Zaako~';
    },
    []
  );

  const actions = useMemo<InternalMascotActions>(
    () => ({
      setShow,
      setScale,
      setSound,
      setVolume,
      setHideAndSeek,
      updatePreferences,
      bonk,
      cancelDeferredRecovery,
      interruptRecoveryForDrag,
      finishDrag,
      returnFromHideAndSeek,
      getMascotCardTitle,
      getNextIdleQuote,
    }),
    [
      bonk,
      cancelDeferredRecovery,
      finishDrag,
      getMascotCardTitle,
      getNextIdleQuote,
      interruptRecoveryForDrag,
      returnFromHideAndSeek,
      setHideAndSeek,
      setScale,
      setShow,
      setSound,
      setVolume,
      updatePreferences,
    ]
  );

  store.setActions(actions);

  useEffect(() => {
    resolvedAudioPlayer.warmup?.();
  }, [resolvedAudioPlayer]);

  useEffect(() => {
    return () => {
      clearRecoveryTimers();
      audioPlayerRef.current.stop();
    };
  }, [clearRecoveryTimers]);

  return (
    <MascotStoreContext.Provider value={store}>
      {children}
      <BonkImpactLayer
        registerSpawner={registerImpactSpawner}
        nowProvider={nowProvider}
        rng={rng}
      />
    </MascotStoreContext.Provider>
  );
}
