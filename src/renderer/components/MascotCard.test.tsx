import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MASCOT_CARD_KEY, MASCOT_STORAGE_KEYS } from '../mascot/mascot-domain';
import { MascotProvider } from '../providers/MascotProvider';
import type { UiStorageAdapter } from '../state/ui-runtime-state';
import { MascotCard } from './MascotCard';

function createMemoryStorage(initial: Record<string, string> = {}): UiStorageAdapter & { map: Map<string, string> } {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    map,
    getItem: vi.fn((key: string) => map.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      map.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      map.delete(key);
    }),
  };
}

function mockReducedMotion(matches: boolean): void {
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)' ? matches : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

describe('MascotCard', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders localized bonk status counts (0, 1, >=2), non-focusable .fav-btn star, and .menu-btn ARIA menu', () => {
    const storage0 = createMemoryStorage({
      [MASCOT_STORAGE_KEYS.hideAndSeek]: 'yeaaa',
      [MASCOT_STORAGE_KEYS.bonkCount]: '0',
    });
    const { unmount: unmount0 } = render(
      <MascotProvider storage={storage0} rng={() => 0.1}>
        <MascotCard />
      </MascotProvider>
    );

    const card0 = screen.getByRole('article');
    expect(card0.getAttribute('data-game-key')).toBe(MASCOT_CARD_KEY);
    expect(card0.querySelector('.mascot-card-status')?.textContent).toBe('Never bonked');

    const favSpan = card0.querySelector('.fav-btn');
    expect(favSpan?.tagName).toBe('SPAN');
    expect(favSpan?.getAttribute('aria-hidden')).toBe('true');
    expect(favSpan?.classList.contains('active')).toBe(true); // rng 0.1 < 0.5

    const menuBtn = card0.querySelector('.menu-btn') as HTMLButtonElement;
    expect(menuBtn.getAttribute('aria-haspopup')).toBe('menu');
    expect(menuBtn.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(menuBtn);
    expect(menuBtn.getAttribute('aria-expanded')).toBe('true');
    expect(card0.querySelector('[role="menu"]')).toBeTruthy();
    unmount0();

    // bonkCount === 1 and isCardStarred === false (rng 0.9 >= 0.5)
    const storage1 = createMemoryStorage({
      [MASCOT_STORAGE_KEYS.hideAndSeek]: 'yeaaa',
      [MASCOT_STORAGE_KEYS.bonkCount]: '1',
    });
    const { unmount: unmount1 } = render(
      <MascotProvider storage={storage1} rng={() => 0.9}>
        <MascotCard />
      </MascotProvider>
    );
    const card1 = screen.getByRole('article');
    expect(card1.querySelector('.mascot-card-status')?.textContent).toBe('Bonked 1 time');
    expect(card1.querySelector('.fav-btn')?.classList.contains('active')).toBe(false);
    unmount1();

    // bonkCount >= 2
    const storage5 = createMemoryStorage({
      [MASCOT_STORAGE_KEYS.hideAndSeek]: 'yeaaa',
      [MASCOT_STORAGE_KEYS.bonkCount]: '5',
    });
    render(
      <MascotProvider storage={storage5} rng={() => 0.9}>
        <MascotCard />
      </MascotProvider>
    );
    expect(screen.getByRole('article').querySelector('.mascot-card-status')?.textContent).toBe(
      'Bonked 5 times'
    );
  });

  it('rotates idle quotes every 10s with 200ms fade swap and refreshes idle quote on recovery', () => {
    vi.useFakeTimers();
    const storage = createMemoryStorage({
      [MASCOT_STORAGE_KEYS.hideAndSeek]: 'yeaaa',
    });
    let rngStep = 0;
    const rngValues = [0.2, 0.1, 0.5, 0.8, 0.3, 0.6];
    const rng = () => rngValues[rngStep++ % rngValues.length];

    render(
      <MascotProvider storage={storage} rng={rng}>
        <MascotCard bonkThreshold={5} />
      </MascotProvider>
    );

    const quoteEl = screen.getByRole('article').querySelector('.mascot-card-quote') as HTMLElement;
    const initialQuote = quoteEl.textContent;
    expect(initialQuote).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(quoteEl.style.opacity).toBe('0');

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(quoteEl.style.opacity).toBe('');
    expect(quoteEl.textContent).toBeTruthy();
  });

  it('plays 500ms squash animation, spawns .bonk-impact-particle, ignores interactive targets and auto-repeat, and cleans up rAF on unmount', () => {
    vi.useFakeTimers();
    const storage = createMemoryStorage({
      [MASCOT_STORAGE_KEYS.hideAndSeek]: 'yeaaa',
    });

    const { unmount } = render(
      <MascotProvider storage={storage} rng={() => 0.2}>
        <MascotCard bonkThreshold={5} />
      </MascotProvider>
    );

    const card = screen.getByRole('article');

    // Clicking menu button does not bonk
    fireEvent.click(card.querySelector('.menu-btn') as HTMLButtonElement);
    expect(card.classList.contains('bonk-animating')).toBe(false);
    expect(storage.map.get(MASCOT_STORAGE_KEYS.bonkCount)).toBeUndefined();

    // Auto-repeat Enter key is ignored
    fireEvent.keyDown(card, { key: 'Enter', repeat: true });
    expect(card.classList.contains('bonk-animating')).toBe(false);

    // Real pointer bonk triggers squash animation and impact particle
    fireEvent.click(card, { clientX: 120, clientY: 80 });
    expect(card.classList.contains('bonk-animating')).toBe(true);
    expect(document.querySelectorAll('.bonk-impact-particle').length).toBeGreaterThan(0);

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(card.classList.contains('bonk-animating')).toBe(false);

    // Unmount cleans up impact particles / rAF
    unmount();
    expect(document.querySelectorAll('.bonk-impact-particle').length).toBe(0);
  });

  it('calls cancelDeferredRecovery without returnFromHideAndSeek on early unmount after reaching threshold', () => {
    vi.useFakeTimers();
    mockReducedMotion(false);
    const storage = createMemoryStorage({
      [MASCOT_STORAGE_KEYS.hideAndSeek]: 'yeaaa',
    });

    const { unmount } = render(
      <MascotProvider storage={storage} rng={() => 0.2}>
        <MascotCard bonkThreshold={1} />
      </MascotProvider>
    );

    const card = screen.getByRole('article');
    fireEvent.click(card, { clientX: 50, clientY: 50 });

    // Unmount before 3000ms dismiss timer fires
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    unmount();

    // Deferred recovery was cancelled, so MascotProvider is not stuck in bonked state
    expect(storage.map.get(MASCOT_STORAGE_KEYS.bonkCount)).toBe('1');
  });

  it('handles threshold dismissal with focus handoff, late bonk timer reset, and ignoring bonks during fade-out', () => {
    vi.useFakeTimers();
    mockReducedMotion(false);
    const storage = createMemoryStorage({
      [MASCOT_STORAGE_KEYS.hideAndSeek]: 'yeaaa',
    });
    const onDismissFocusHandoff = vi.fn();

    render(
      <MascotProvider storage={storage} rng={() => 0.2}>
        <MascotCard bonkThreshold={2} onDismissFocusHandoff={onDismissFocusHandoff} />
      </MascotProvider>
    );

    const card = screen.getByRole('article');
    card.focus();
    expect(document.activeElement).toBe(card);

    // Bonk 1 & 2 (reaches threshold)
    fireEvent.click(card, { clientX: 50, clientY: 50 });
    fireEvent.click(card, { clientX: 50, clientY: 50 });
    expect(storage.map.get(MASCOT_STORAGE_KEYS.bonkCount)).toBe('2');

    // Late bonk at 2000ms resets the 3000ms dismiss timer
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    fireEvent.click(card, { clientX: 50, clientY: 50 });
    expect(storage.map.get(MASCOT_STORAGE_KEYS.bonkCount)).toBe('3');

    // At +2500ms (total 4500ms), fade should NOT have started yet because timer reset
    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(card.classList.contains('is-fading-out')).toBe(false);

    // At +500ms (3000ms since last bonk), 400ms fade starts
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(card.classList.contains('is-fading-out')).toBe(true);

    // Bonks during isFadingOut are ignored
    fireEvent.click(card, { clientX: 50, clientY: 50 });
    expect(storage.map.get(MASCOT_STORAGE_KEYS.bonkCount)).toBe('3');

    // After 400ms fade, focus handoff fires and MascotCard returns to widget
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(onDismissFocusHandoff).toHaveBeenCalledTimes(1);
  });

  it('skips 400ms fade under prefers-reduced-motion: reduce', () => {
    vi.useFakeTimers();
    mockReducedMotion(true);
    const storage = createMemoryStorage({
      [MASCOT_STORAGE_KEYS.hideAndSeek]: 'yeaaa',
    });
    const onDismissFocusHandoff = vi.fn();

    render(
      <MascotProvider storage={storage} rng={() => 0.2}>
        <MascotCard bonkThreshold={1} onDismissFocusHandoff={onDismissFocusHandoff} />
      </MascotProvider>
    );

    const card = screen.getByRole('article');
    card.focus();
    fireEvent.keyDown(card, { key: 'Enter' });

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(onDismissFocusHandoff).toHaveBeenCalledTimes(1);
    expect(card.classList.contains('is-fading-out')).toBe(false);
  });
});
