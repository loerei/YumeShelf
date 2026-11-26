import React, { useRef } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useCardLayoutFlip } from './useCardLayoutFlip';
import { LibraryGrid } from '../components/LibraryGrid';
import { LibraryStateProvider } from '../context/LibraryStateContext';
import { createUiRuntimeState, type UiStorageAdapter } from '../state/ui-runtime-state';
import type { GameEntry } from '../types/game';
import type { ElectronAPI } from '../../shared/types/ipc';

function createMemoryStorage(initial: Record<string, string> = {}): UiStorageAdapter {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
  };
}

function makeGame(overrides: Partial<GameEntry> = {}): GameEntry {
  const gameKey = overrides.gameKey ?? overrides.gameId ?? 'game-1';
  return {
    gameId: overrides.gameId ?? gameKey,
    gameKey,
    name: overrides.name ?? `Game ${gameKey}`,
    title: overrides.title ?? overrides.name ?? `Game ${gameKey}`,
    folderName: overrides.folderName ?? gameKey,
    relativePath: overrides.relativePath ?? gameKey,
    favorite: overrides.favorite ?? false,
    dateAdded: overrides.dateAdded ?? 1000,
    lastPlayed: overrides.lastPlayed ?? 0,
    playtime: overrides.playtime ?? 0,
    isRunning: overrides.isRunning ?? false,
    ...overrides,
  };
}

function makeRect(left: number, top: number, width = 200, height = 260): DOMRect {
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    x: left,
    y: top,
    toJSON: () => ({}),
  };
}

interface MockAnimation {
  cancel: ReturnType<typeof vi.fn>;
  onfinish: ((this: Animation, ev: AnimationPlaybackEvent) => unknown) | null;
  oncancel: ((this: Animation, ev: AnimationPlaybackEvent) => unknown) | null;
}

describe('useCardLayoutFlip', () => {
  const originalAnimate = Element.prototype.animate;
  const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
  const originalMatchMedia = window.matchMedia;
  const originalResizeObserver = globalThis.ResizeObserver;
  const originalInnerHeight = window.innerHeight;

  let reducedMotion = false;
  let mockAnimations: MockAnimation[] = [];

  beforeEach(() => {
    reducedMotion = false;
    mockAnimations = [];

    globalThis.ResizeObserver = class MockResizeObserver {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    } as unknown as typeof ResizeObserver;

    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      writable: true,
      value: 800,
    });

    window.matchMedia = vi.fn((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)' ? reducedMotion : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;

    Element.prototype.animate = vi.fn(() => {
      const anim: MockAnimation = {
        cancel: vi.fn(),
        onfinish: null,
        oncancel: null,
      };
      mockAnimations.push(anim);
      return anim as unknown as Animation;
    }) as unknown as typeof Element.prototype.animate;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Element.prototype.animate = originalAnimate;
    Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    window.matchMedia = originalMatchMedia;
    globalThis.ResizeObserver = originalResizeObserver;
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      writable: true,
      value: originalInnerHeight,
    });
  });

  it('enforces strict two-phase read-before-write batching: all getBoundingClientRect calls complete before the first animate call', () => {
    const events: string[] = [];
    const rectMap = new Map<string, DOMRect>([
      ['a', makeRect(0, 0)],
      ['b', makeRect(220, 0)],
    ]);

    Element.prototype.getBoundingClientRect = vi.fn(function (this: HTMLElement) {
      const id = this.dataset.cardId ?? 'unknown';
      events.push(`read:${id}`);
      return rectMap.get(id) ?? makeRect(0, 0);
    });

    Element.prototype.animate = vi.fn(function (this: HTMLElement) {
      const id = this.dataset.cardId ?? 'unknown';
      events.push(`animate:${id}`);
      return {
        cancel: vi.fn(),
        onfinish: null,
        oncancel: null,
      } as unknown as Animation;
    }) as unknown as typeof Element.prototype.animate;

    function Harness({ rev, sort }: { rev: number; sort: string }) {
      const cardRefs = useRef(new Map<string, HTMLElement>());
      useCardLayoutFlip({
        cardRefs,
        structuralLayoutRevision: rev,
        isDragging: false,
        currentSort: sort,
      });
      return (
        <div>
          <div
            data-card-id="a"
            ref={(el) => {
              if (el) cardRefs.current.set('unfav::a', el);
              else cardRefs.current.delete('unfav::a');
            }}
          />
          <div
            data-card-id="b"
            ref={(el) => {
              if (el) cardRefs.current.set('unfav::b', el);
              else cardRefs.current.delete('unfav::b');
            }}
          />
        </div>
      );
    }

    const { rerender } = render(<Harness rev={0} sort="alpha" />);
    events.length = 0;

    // Move both cards on sort change
    rectMap.set('a', makeRect(220, 0));
    rectMap.set('b', makeRect(0, 0));
    rerender(<Harness rev={1} sort="recent" />);

    expect(events).toEqual(['read:a', 'read:b', 'animate:a', 'animate:b']);
  });

  it('animates flat-mode #fav-grid <-> #unfav-grid transitions on favorite toggle (including keys with ::) and sort switches', async () => {
    const store = createUiRuntimeState(createMemoryStorage());
    const gameA = makeGame({ gameKey: 'game::alpha', name: 'Alpha', favorite: false, dateAdded: 100 });
    const gameB = makeGame({ gameKey: 'game-beta', name: 'Beta', favorite: false, dateAdded: 200 });
    store.setAllGames([gameA, gameB]);

    let isFavTogglePhase = false;
    Element.prototype.getBoundingClientRect = vi.fn(function (this: HTMLElement) {
      if (this.classList.contains('game-card') || this.querySelector('.game-card')) {
        const text = this.textContent ?? '';
        if (text.includes('Alpha')) {
          return isFavTogglePhase ? makeRect(0, 0) : makeRect(0, 300);
        }
        if (text.includes('Beta')) {
          return isFavTogglePhase ? makeRect(0, 300) : makeRect(220, 300);
        }
      }
      return makeRect(0, 0, 1200, 800);
    });

    const api = {
      toggleFavorite: vi.fn(async (_k: string, next: boolean) => next),
    } as unknown as ElectronAPI;

    const { container } = render(
      <LibraryStateProvider store={store}>
        <LibraryGrid electronAPI={api} storage={createMemoryStorage()} />
      </LibraryStateProvider>
    );

    const animateSpy = Element.prototype.animate as unknown as ReturnType<typeof vi.fn>;
    expect(animateSpy).not.toHaveBeenCalled();

    // Favorite Alpha via .fav-btn so it moves from #unfav-grid to #fav-grid
    isFavTogglePhase = true;
    const alphaCard = Array.from(container.querySelectorAll('#unfav-grid .game-card')).find((el) =>
      el.textContent?.includes('Alpha')
    );
    const favBtn = alphaCard?.querySelector('.fav-btn') as HTMLButtonElement | null;
    expect(favBtn).toBeTruthy();

    await act(async () => {
      fireEvent.click(favBtn!);
    });

    expect(container.querySelector('#fav-grid')?.textContent).toContain('Alpha');
    expect(animateSpy).toHaveBeenCalled();
    const [keyframes, timing] = animateSpy.mock.calls[0] as [Keyframe[], KeyframeAnimationOptions];
    expect(keyframes).toEqual([
      { transform: 'translate(0px, 300px)' },
      { transform: 'translate(0px, 0px)' },
    ]);
    expect(timing).toEqual({
      duration: 260,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    });

    // Switch sort mode -> triggers another FLIP pass
    animateSpy.mockClear();
    isFavTogglePhase = false;
    act(() => {
      store.setCurrentSort('recent');
    });
    expect(animateSpy).toHaveBeenCalled();
  });

  it('triggers 0 getBoundingClientRect() calls when store.updateGame fires a 1-second playtime tick', () => {
    const store = createUiRuntimeState(createMemoryStorage());
    const runningGame = makeGame({
      gameKey: 'running-1',
      name: 'Running Game',
      isRunning: true,
      playtime: 60,
    });
    store.setAllGames([runningGame]);

    const rectSpy = vi.fn(() => makeRect(10, 20));
    Element.prototype.getBoundingClientRect = rectSpy;

    render(
      <LibraryStateProvider store={store}>
        <LibraryGrid storage={createMemoryStorage()} />
      </LibraryStateProvider>
    );

    rectSpy.mockClear();
    const animateSpy = Element.prototype.animate as unknown as ReturnType<typeof vi.fn>;
    animateSpy.mockClear();

    // Simulate 1-second playtime tick
    act(() => {
      store.updateGame('running-1', { playtime: 61 });
    });

    expect(rectSpy).not.toHaveBeenCalled();
    expect(animateSpy).not.toHaveBeenCalled();
  });

  it('cancels active WAAPI Animation instances before getBoundingClientRect, when isDragging becomes true, and on unmount', () => {
    let rectY = 0;
    const callOrder: string[] = [];

    Element.prototype.getBoundingClientRect = vi.fn(() => {
      callOrder.push('rect');
      return makeRect(0, rectY);
    });

    Element.prototype.animate = vi.fn(() => {
      callOrder.push('animate');
      const anim: MockAnimation = {
        cancel: vi.fn(() => {
          callOrder.push('cancel');
        }),
        onfinish: null,
        oncancel: null,
      };
      mockAnimations.push(anim);
      return anim as unknown as Animation;
    }) as unknown as typeof Element.prototype.animate;

    function Harness({ rev, isDragging }: { rev: number; isDragging: boolean }) {
      const cardRefs = useRef(new Map<string, HTMLElement>());
      useCardLayoutFlip({
        cardRefs,
        structuralLayoutRevision: rev,
        isDragging,
        currentSort: 'alpha',
      });
      return (
        <div
          ref={(el) => {
            if (el) cardRefs.current.set('unfav::g1', el);
            else cardRefs.current.delete('unfav::g1');
          }}
        />
      );
    }

    const { rerender, unmount } = render(<Harness rev={0} isDragging={false} />);

    // First layout shift creates active animation #0
    rectY = 100;
    rerender(<Harness rev={1} isDragging={false} />);
    expect(mockAnimations).toHaveLength(1);

    // Second layout shift must cancel animation #0 BEFORE calling getBoundingClientRect
    callOrder.length = 0;
    rectY = 200;
    rerender(<Harness rev={2} isDragging={false} />);
    expect(mockAnimations[0].cancel).toHaveBeenCalledTimes(1);
    expect(callOrder.indexOf('cancel')).toBeLessThan(callOrder.indexOf('rect'));
    expect(mockAnimations).toHaveLength(2);

    // Drag start must cancel animation #1 and skip getBoundingClientRect
    callOrder.length = 0;
    rerender(<Harness rev={2} isDragging={true} />);
    expect(mockAnimations[1].cancel).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual(['cancel']);

    // Unmount cleanup cancels any active animation
    rerender(<Harness rev={3} isDragging={false} />);
    rectY = 300;
    rerender(<Harness rev={4} isDragging={false} />);
    const latestAnim = mockAnimations[mockAnimations.length - 1];
    unmount();
    expect(latestAnim.cancel).toHaveBeenCalledTimes(1);
  });

  it('suppresses animation on isDragging, post-drop wasDraggingRef recovery, < 1px deltas, off-screen cards, and prefers-reduced-motion: reduce', () => {
    const rects = new Map<string, DOMRect>([
      ['onscreen', makeRect(0, 100)],
      ['subpixel', makeRect(0, 200)],
      ['offscreen', makeRect(0, 1200)],
    ]);

    const rectSpy = vi.fn(function (this: HTMLElement) {
      return rects.get(this.dataset.cardId ?? '') ?? makeRect(0, 0);
    });
    Element.prototype.getBoundingClientRect = rectSpy;

    function Harness({
      rev,
      isDragging,
      sort = 'alpha',
    }: {
      rev: number;
      isDragging: boolean;
      sort?: string;
    }) {
      const cardRefs = useRef(new Map<string, HTMLElement>());
      useCardLayoutFlip({
        cardRefs,
        structuralLayoutRevision: rev,
        isDragging,
        currentSort: sort,
      });
      return (
        <div>
          <div
            data-card-id="onscreen"
            ref={(el) => {
              if (el) cardRefs.current.set('unfav::onscreen', el);
              else cardRefs.current.delete('unfav::onscreen');
            }}
          />
          <div
            data-card-id="subpixel"
            ref={(el) => {
              if (el) cardRefs.current.set('unfav::subpixel', el);
              else cardRefs.current.delete('unfav::subpixel');
            }}
          />
          <div
            data-card-id="offscreen"
            ref={(el) => {
              if (el) cardRefs.current.set('unfav::offscreen', el);
              else cardRefs.current.delete('unfav::offscreen');
            }}
          />
        </div>
      );
    }

    const animateSpy = Element.prototype.animate as unknown as ReturnType<typeof vi.fn>;
    const { rerender } = render(<Harness rev={0} isDragging={false} />);

    // 1. Subpixel (< 1px) and offscreen cards are skipped; only onscreen animates
    rects.set('onscreen', makeRect(0, 150));
    rects.set('subpixel', makeRect(0.4, 200.5));
    rects.set('offscreen', makeRect(0, 1500));
    rerender(<Harness rev={1} isDragging={false} />);
    expect(animateSpy).toHaveBeenCalledTimes(1);

    // 2. Active drag suppresses reads and animations; post-drop transition re-snapshots without animating
    animateSpy.mockClear();
    rectSpy.mockClear();
    rerender(<Harness rev={1} isDragging={true} />);
    expect(rectSpy).not.toHaveBeenCalled();
    expect(animateSpy).not.toHaveBeenCalled();

    // Simulate conditional mid-drag unmount resetting isDragging to false with shifted coordinates
    rects.set('onscreen', makeRect(0, 300));
    rerender(<Harness rev={2} isDragging={false} />);
    expect(rectSpy).toHaveBeenCalled();
    expect(animateSpy).not.toHaveBeenCalled();

    // Subsequent non-drag layout change animates from the post-drop snapshot (300 -> 350, dy = -50)
    rects.set('onscreen', makeRect(0, 350));
    rerender(<Harness rev={3} isDragging={false} />);
    expect(animateSpy).toHaveBeenCalledTimes(1);
    expect(animateSpy.mock.calls[0][0]).toEqual([
      { transform: 'translate(0px, -50px)' },
      { transform: 'translate(0px, 0px)' },
    ]);

    // 3. prefers-reduced-motion: reduce suppresses animate AND updates prevRectsRef
    animateSpy.mockClear();
    reducedMotion = true;
    rects.set('onscreen', makeRect(0, 500));
    rerender(<Harness rev={4} isDragging={false} />);
    expect(animateSpy).not.toHaveBeenCalled();

    // Toggling reduced motion off mid-session must NOT animate from stale 350px coordinate
    reducedMotion = false;
    rects.set('onscreen', makeRect(0, 500));
    rerender(<Harness rev={5} isDragging={false} />);
    expect(animateSpy).not.toHaveBeenCalled();
  });

  it('uses container-scoped keys in folder sort and resets snapshot cleanly when switching between folder and flat sort', () => {
    const rects = new Map<string, DOMRect>([
      ['fav::g1', makeRect(0, 0)],
      ['D:/Games::g1', makeRect(0, 400)],
    ]);

    Element.prototype.getBoundingClientRect = vi.fn(function (this: HTMLElement) {
      return rects.get(this.dataset.scopedId ?? '') ?? makeRect(0, 0);
    });

    function Harness({ rev, sort }: { rev: number; sort: string }) {
      const cardRefs = useRef(new Map<string, HTMLElement>());
      useCardLayoutFlip({
        cardRefs,
        structuralLayoutRevision: rev,
        isDragging: false,
        currentSort: sort,
      });
      return (
        <div>
          <div
            data-scoped-id="fav::g1"
            ref={(el) => {
              if (el) cardRefs.current.set('fav::g1', el);
              else cardRefs.current.delete('fav::g1');
            }}
          />
          <div
            data-scoped-id="D:/Games::g1"
            ref={(el) => {
              if (el) cardRefs.current.set('D:/Games::g1', el);
              else cardRefs.current.delete('D:/Games::g1');
            }}
          />
        </div>
      );
    }

    const animateSpy = Element.prototype.animate as unknown as ReturnType<typeof vi.fn>;
    const { rerender } = render(<Harness rev={0} sort="folder" />);

    // Dual placement in folder sort: both fav::g1 and D:/Games::g1 animate independently
    rects.set('fav::g1', makeRect(100, 0));
    rects.set('D:/Games::g1', makeRect(200, 400));
    rerender(<Harness rev={1} sort="folder" />);
    expect(animateSpy).toHaveBeenCalledTimes(2);

    // Switching from folder sort to flat sort resets snapshot cleanly (0 animations)
    animateSpy.mockClear();
    rects.set('fav::g1', makeRect(300, 100));
    rerender(<Harness rev={2} sort="alpha" />);
    expect(animateSpy).not.toHaveBeenCalled();
  });
});
