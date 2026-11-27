import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';
import {
  MascotProvider,
  MAX_BONK_PARTICLES,
  useMascot,
  useOptionalMascot,
  useOptionalMascotHideAndSeek,
  useOptionalMascotSearch,
  type MascotContextValue,
} from './MascotProvider';
import { MASCOT_STORAGE_KEYS, type MascotAudioPlayer } from '../mascot/mascot-domain';
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

describe('MascotProvider', () => {
  let nowMs: number;
  let nowProvider: () => number;
  let audioPlayer: MascotAudioPlayer;

  beforeEach(() => {
    vi.useFakeTimers();
    nowMs = 1000;
    nowProvider = () => nowMs;
    audioPlayer = {
      play: vi.fn(),
      stop: vi.fn(),
    };
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  function advanceBoth(ms: number): void {
    nowMs += ms;
    vi.advanceTimersByTime(ms);
  }

  it('throws in useMascot outside provider and returns null in optional hooks', () => {
    const OptionalConsumer = () => {
      const m = useOptionalMascot();
      const h = useOptionalMascotHideAndSeek();
      const s = useOptionalMascotSearch();
      return (
        <div data-testid="out">
          {String(m)}|{String(h)}|{String(s)}
        </div>
      );
    };

    const { getByTestId } = render(<OptionalConsumer />);
    expect(getByTestId('out').textContent).toBe('null|null|null');

    const StrictConsumer = () => {
      useMascot();
      return null;
    };
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<StrictConsumer />)).toThrow(
      'useMascot must be used within a MascotProvider'
    );
    errorSpy.mockRestore();
  });

  it('preserves volume: 0 from storage and tracks isWidgetVisible vs isHideAndSeekCardActive', () => {
    const storage = createMemoryStorage({
      [MASCOT_STORAGE_KEYS.volume]: '0',
      [MASCOT_STORAGE_KEYS.show]: 'on',
      [MASCOT_STORAGE_KEYS.hideAndSeek]: 'out',
    });

    let latest!: MascotContextValue;
    const Consumer = () => {
      latest = useMascot();
      return null;
    };

    render(
      <MascotProvider storage={storage} audioPlayer={audioPlayer} nowProvider={nowProvider}>
        <Consumer />
      </MascotProvider>
    );

    expect(latest.volume).toBe(0);
    expect(latest.isWidgetVisible).toBe(true);
    expect(latest.isHideAndSeekCardActive).toBe(false);

    act(() => {
      latest.setHideAndSeek('yeaaa');
    });
    expect(latest.isWidgetVisible).toBe(false);
    expect(latest.isHideAndSeekCardActive).toBe(true);

    act(() => {
      latest.setShow(false);
    });
    expect(latest.isWidgetVisible).toBe(false);
    expect(latest.isHideAndSeekCardActive).toBe(false);
  });

  it('resets isDismissed, session identity, and active recovery timers on setHideAndSeek("yeaaa")', () => {
    const storage = createMemoryStorage({
      [MASCOT_STORAGE_KEYS.hideAndSeek]: 'yeaaa',
    });
    let rngValue = 0.1;
    const rng = () => rngValue;

    let latest!: MascotContextValue;
    const Consumer = () => {
      latest = useMascot();
      return null;
    };

    render(
      <MascotProvider
        storage={storage}
        audioPlayer={audioPlayer}
        nowProvider={nowProvider}
        rng={rng}
      >
        <Consumer />
      </MascotProvider>
    );

    const initialThreshold = latest.hideAndSeekThreshold;
    const initialStarred = latest.isCardStarred;

    act(() => {
      latest.returnFromHideAndSeek(5, 4000);
    });
    expect(latest.isDismissed).toBe(true);
    expect(latest.expression).toBe('bonked');

    act(() => {
      rngValue = 0.9;
      latest.setHideAndSeek('yeaaa');
    });
    expect(latest.isDismissed).toBe(false);
    expect(latest.expression).toBe('smug');
    expect(latest.activeBonkQuote).toBeNull();
    expect(latest.isCardStarred).not.toBe(initialStarred);
    expect(latest.hideAndSeekThreshold).not.toBe(initialThreshold);
  });

  it('delegates reset transitions in updatePreferences only on actual show === false or hideAndSeek changes', () => {
    const storage = createMemoryStorage({
      [MASCOT_STORAGE_KEYS.show]: 'on',
      [MASCOT_STORAGE_KEYS.hideAndSeek]: 'yeaaa',
    });

    let rngCall = 0;
    const rng = () => {
      rngCall += 1;
      return (rngCall * 0.17) % 1;
    };

    let latest!: MascotContextValue;
    const Consumer = () => {
      latest = useMascot();
      return null;
    };

    render(
      <MascotProvider
        storage={storage}
        audioPlayer={audioPlayer}
        nowProvider={nowProvider}
        rng={rng}
      >
        <Consumer />
      </MascotProvider>
    );

    act(() => {
      latest.returnFromHideAndSeek(4, 3000);
    });
    const prevSlot = latest.sessionSlotFraction;

    // Redundant hideAndSeek: 'yeaaa' must NOT reset isDismissed or session identity
    act(() => {
      latest.updatePreferences({ hideAndSeek: 'yeaaa', scale: 55 });
    });
    expect(latest.scale).toBe(55);
    expect(latest.isDismissed).toBe(true);
    expect(latest.sessionSlotFraction).toBe(prevSlot);

    // Actual hideAndSeek change -> resets recovery state
    act(() => {
      latest.updatePreferences({ hideAndSeek: 'out' });
    });
    expect(latest.hideAndSeek).toBe('out');
    expect(latest.expression).toBe('smug');

    // Bonk then set show: false via updatePreferences -> resets recovery state
    act(() => {
      latest.bonk();
    });
    expect(latest.expression).toBe('bonked');
    act(() => {
      latest.updatePreferences({ show: false });
    });
    expect(latest.show).toBe(false);
    expect(latest.expression).toBe('smug');
    expect(latest.activeBonkQuote).toBeNull();
  });

  it('getNextIdleQuote inherits injected rng', () => {
    const storage = createMemoryStorage();
    const rng = vi.fn(() => 0.75);

    let latest!: MascotContextValue;
    const Consumer = () => {
      latest = useMascot();
      return null;
    };

    render(
      <MascotProvider
        storage={storage}
        audioPlayer={audioPlayer}
        nowProvider={nowProvider}
        rng={rng}
      >
        <Consumer />
      </MascotProvider>
    );

    const callsBefore = rng.mock.calls.length;
    const quote = latest.getNextIdleQuote({ mascot_card_idle_quotes: ['A', 'B', 'C'] });
    expect(['A', 'B', 'C']).toContain(quote);
    expect(rng.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it('supports deferRecoveryThreshold across expired stage2EndTimeMs and cancelDeferredRecovery', () => {
    const storage = createMemoryStorage();
    let latest!: MascotContextValue;
    const Consumer = () => {
      latest = useMascot();
      return null;
    };

    render(
      <MascotProvider storage={storage} audioPlayer={audioPlayer} nowProvider={nowProvider}>
        <Consumer />
      </MascotProvider>
    );

    const threshold = 2;

    // First bonk at t=1000
    act(() => {
      const s1 = latest.bonk({ deferRecoveryThreshold: threshold });
      expect(s1.phase).toBe('bonked');
      expect(s1.phase === 'bonked' && s1.streak).toBe(1);
    });

    // Advance past rapidWindowMs (1200ms) so second bonk stays in 'bonked' and hits threshold = 2
    act(() => {
      advanceBoth(1500);
      const s2 = latest.bonk({ deferRecoveryThreshold: threshold });
      expect(s2.phase).toBe('bonked');
      if (s2.phase === 'bonked') {
        expect(s2.streak).toBe(2);
        expect(s2.accumulatedCooldownMs).toBe(3000);
        expect(s2.stage2EndTimeMs).toBe(5500);
      }
    });

    // Advance both nowProvider and timers past stage2EndTimeMs + maxCooldownMs (10000ms)
    act(() => {
      advanceBoth(12000);
    });
    expect(latest.expression).toBe('bonked');

    // Late bonk while deferredRecoveryPending is true: preserves streak = threshold + 1 and accumulatedCooldownMs = 4000
    act(() => {
      const s3 = latest.bonk({ deferRecoveryThreshold: threshold });
      expect(s3.phase).toBe('bonked');
      if (s3.phase === 'bonked') {
        expect(s3.streak).toBe(3);
        expect(s3.accumulatedCooldownMs).toBe(4000);
      }
    });

    // Still does not auto-recover even after maxCooldownMs elapses
    act(() => {
      advanceBoth(11000);
    });
    expect(latest.expression).toBe('bonked');

    // cancelDeferredRecovery transitions expression back to 'smug' and clears activeBonkQuote
    act(() => {
      latest.cancelDeferredRecovery();
    });
    expect(latest.expression).toBe('smug');
    expect(latest.activeBonkQuote).toBeNull();
  });

  it('handles isDragging expression transitions, audioPlayer.play/stop, and returnFromHideAndSeek continuity', () => {
    const storage = createMemoryStorage({
      [MASCOT_STORAGE_KEYS.sound]: 'metal-pipe',
      [MASCOT_STORAGE_KEYS.volume]: '0',
    });

    let latest!: MascotContextValue;
    const Consumer = () => {
      latest = useMascot();
      return null;
    };

    const { unmount } = render(
      <MascotProvider storage={storage} audioPlayer={audioPlayer} nowProvider={nowProvider}>
        <Consumer />
      </MascotProvider>
    );

    act(() => {
      latest.bonk();
    });
    expect(audioPlayer.play).toHaveBeenCalledWith('metal-pipe', 0);

    act(() => {
      latest.interruptRecoveryForDrag();
    });
    expect(latest.isDragging).toBe(true);
    expect(latest.expression).toBe('bonked');
    expect(latest.activeBonkQuote).toBeNull();

    act(() => {
      latest.finishDrag();
    });
    expect(latest.isDragging).toBe(false);
    expect(latest.expression).toBe('smug');

    // returnFromHideAndSeek leaves expression === 'bonked' before auto-recovering to 'smug'
    act(() => {
      latest.returnFromHideAndSeek(6, 4000);
    });
    expect(latest.isDismissed).toBe(true);
    expect(latest.expression).toBe('bonked');

    act(() => {
      advanceBoth(4000);
    });
    expect(latest.expression).toBe('smug');
    expect(latest.activeBonkQuote).toBeNull();

    unmount();
    expect(audioPlayer.stop).toHaveBeenCalledTimes(1);
  });

  it('isolates useOptionalMascotHideAndSeek and useOptionalMascotSearch from unrelated updates', () => {
    const storage = createMemoryStorage();
    let latest!: MascotContextValue;
    let hideAndSeekRenders = 0;
    let searchRenders = 0;

    const FullConsumer = () => {
      latest = useMascot();
      return null;
    };
    const HideAndSeekConsumer = () => {
      hideAndSeekRenders += 1;
      useOptionalMascotHideAndSeek();
      return null;
    };
    const SearchConsumer = () => {
      searchRenders += 1;
      useOptionalMascotSearch();
      return null;
    };

    render(
      <MascotProvider storage={storage} audioPlayer={audioPlayer} nowProvider={nowProvider}>
        <FullConsumer />
        <HideAndSeekConsumer />
        <SearchConsumer />
      </MascotProvider>
    );

    expect(hideAndSeekRenders).toBe(1);
    expect(searchRenders).toBe(1);

    // setScale, setVolume, setSound -> 0 re-renders on both HideAndSeek and Search
    act(() => {
      latest.setScale(80);
      latest.setVolume(50);
      latest.setSound('metal-pipe');
    });
    expect(hideAndSeekRenders).toBe(1);
    expect(searchRenders).toBe(1);

    // bonk() -> 0 re-renders on HideAndSeek
    act(() => {
      latest.bonk();
    });
    expect(hideAndSeekRenders).toBe(1);
    expect(searchRenders).toBe(2);

    // Stage 1 -> Stage 2 recovery transition or bonkCount change without altering quote/expression/visibility:
    // Force bonkedTooMuch, then Stage 1 -> bonked (changes expression) vs setScale (does not)
    act(() => {
      latest.setScale(45);
    });
    expect(searchRenders).toBe(2);
  });

  it('emits sanitized [MascotProvider] console.warn on storage read/write failures', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const failingStorage: UiStorageAdapter = {
      getItem: (key) => {
        if (key === MASCOT_STORAGE_KEYS.bonkCount) {
          throw new Error('Read err at C:\\Users\\alice\\AppData\\yume');
        }
        return null;
      },
      setItem: () => {
        throw new Error('Write err at /home/alice/.config/yume');
      },
      removeItem: () => {},
    };

    let latest!: MascotContextValue;
    const Consumer = () => {
      latest = useMascot();
      return null;
    };

    render(
      <MascotProvider storage={failingStorage} audioPlayer={audioPlayer} nowProvider={nowProvider}>
        <Consumer />
      </MascotProvider>
    );

    expect(warnSpy).toHaveBeenCalledWith(
      '[MascotDomain] Storage operation failed:',
      expect.objectContaining({
        operation: 'read',
        key: MASCOT_STORAGE_KEYS.bonkCount,
        error: 'Read err at <USER_DIR>\\AppData\\yume',
      })
    );

    act(() => {
      latest.setScale(70);
    });

    expect(warnSpy).toHaveBeenCalledWith(
      '[MascotProvider] Storage operation failed:',
      expect.objectContaining({
        operation: 'write',
        key: MASCOT_STORAGE_KEYS.scale,
        error: 'Write err at <USER_DIR>/.config/yume',
      })
    );
  });

  it('spawns BonkImpactLayer particles, enforces MAX_BONK_PARTICLES = 16, respects prefers-reduced-motion, and cleans up rAF on unmount', () => {
    const rafCallbacks = new Map<number, FrameRequestCallback>();
    let nextRafId = 1;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      const id = nextRafId++;
      rafCallbacks.set(id, cb);
      return id;
    });
    const cancelRafSpy = vi
      .spyOn(window, 'cancelAnimationFrame')
      .mockImplementation((id) => {
        rafCallbacks.delete(id);
      });

    const matchMediaMock = vi.fn().mockReturnValue({ matches: false });
    window.matchMedia = matchMediaMock as unknown as typeof window.matchMedia;

    const storage = createMemoryStorage();
    let latest!: MascotContextValue;
    const Consumer = () => {
      latest = useMascot();
      return null;
    };

    const { unmount } = render(
      <MascotProvider storage={storage} audioPlayer={audioPlayer} nowProvider={nowProvider}>
        <Consumer />
      </MascotProvider>
    );

    // Viewport-center fallback when coordinates omitted
    act(() => {
      latest.bonk();
    });
    const particles1 = document.querySelectorAll('.bonk-impact-particle');
    expect(particles1).toHaveLength(1);
    expect((particles1[0] as HTMLElement).style.left).toBe(`${window.innerWidth / 2}px`);
    expect((particles1[0] as HTMLElement).style.top).toBe(`${window.innerHeight / 2}px`);

    // Spawn > 16 particles -> capped at MAX_BONK_PARTICLES = 16
    act(() => {
      for (let i = 0; i < 20; i++) {
        latest.bonk({ clientX: 100 + i, clientY: 200 + i });
      }
    });
    expect(document.querySelectorAll('.bonk-impact-particle')).toHaveLength(MAX_BONK_PARTICLES);

    // Advance virtual clock past 380ms and flush rAF -> particles complete and remove themselves
    act(() => {
      nowMs += 400;
      const pending = Array.from(rafCallbacks.values());
      rafCallbacks.clear();
      pending.forEach((cb) => cb(nowMs));
    });
    expect(document.querySelectorAll('.bonk-impact-particle')).toHaveLength(0);

    // prefers-reduced-motion: reduce suppresses particle spawn
    matchMediaMock.mockReturnValue({ matches: true });
    act(() => {
      latest.bonk({ clientX: 50, clientY: 50 });
    });
    expect(document.querySelectorAll('.bonk-impact-particle')).toHaveLength(0);

    // Spawn one active particle and unmount -> cancelAnimationFrame is called
    matchMediaMock.mockReturnValue({ matches: false });
    act(() => {
      latest.bonk({ clientX: 50, clientY: 50 });
    });
    expect(document.querySelectorAll('.bonk-impact-particle')).toHaveLength(1);
    unmount();
    expect(cancelRafSpy).toHaveBeenCalled();
    expect(document.querySelectorAll('.bonk-impact-particle')).toHaveLength(0);
  });
});
