import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MascotWidget } from './MascotWidget';
import {
  MascotProvider,
  useMascot,
  type MascotContextValue,
} from '../providers/MascotProvider';
import type { UiStorageAdapter } from '../state/ui-runtime-state';

function createMockStorage(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  const adapter: UiStorageAdapter = {
    getItem: vi.fn((key: string) => (store.has(key) ? store.get(key)! : null)),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
  };
  return { adapter, store };
}

function createMockAudio() {
  return class MockAudio {
    src: string;
    volume = 1;
    currentTime = 0;
    constructor(src = '') {
      this.src = src;
    }
    play = vi.fn().mockResolvedValue(undefined);
    pause = vi.fn();
  };
}

function MascotHarness({
  storage,
  onContext,
}: {
  storage: UiStorageAdapter;
  onContext?: (ctx: MascotContextValue) => void;
}) {
  const Probe = () => {
    const ctx = useMascot();
    onContext?.(ctx);
    return null;
  };
  return (
    <MascotProvider storage={storage}>
      <Probe />
      <MascotWidget />
    </MascotProvider>
  );
}

describe('MascotWidget', () => {
  const OriginalAudio = globalThis.Audio;

  beforeEach(() => {
    vi.stubGlobal('Audio', createMockAudio());
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.stubGlobal('Audio', OriginalAudio);
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('renders #mascot-widget-container with focusable button.yume-mascot-widget and volume slider aria-valuetext', () => {
    const { adapter } = createMockStorage({
      yumeshelf_mascot_show: 'on',
      yumeshelf_mascot_scale: '50',
      yumeshelf_mascot_sound: 'squeaker',
      yumeshelf_mascot_volume: '45',
    });
    const { container } = render(<MascotHarness storage={adapter} />);

    const wrapper = container.querySelector('#mascot-widget-container');
    expect(wrapper).not.toBeNull();

    const widgetBtn = container.querySelector<HTMLButtonElement>('button.yume-mascot-widget');
    expect(widgetBtn).not.toBeNull();
    expect(widgetBtn?.type).toBe('button');
    expect(widgetBtn?.tabIndex).not.toBe(-1);

    const volumeSlider = container.querySelector<HTMLInputElement>('#mascot-menu-volume-slider');
    expect(volumeSlider).not.toBeNull();
    expect(volumeSlider).toHaveAttribute('aria-valuetext', '45%');
  });

  it('supports standalone rendering without MascotProvider and handles bonks safely', () => {
    const { adapter, store } = createMockStorage({
      yumeshelf_mascot_sound: 'none',
    });
    const { container } = render(<MascotWidget storage={adapter} />);
    const widgetBtn = container.querySelector<HTMLButtonElement>('.yume-mascot-widget')!;
    const imgEl = container.querySelector<HTMLImageElement>('#yume-mascot-img')!;

    expect(widgetBtn.classList.contains('hidden')).toBe(false);
    expect(imgEl.getAttribute('src')).toContain('yume_smug');

    fireEvent.keyDown(widgetBtn, { key: 'Enter' });
    expect(store.get('yumeshelf_mascot_bonk_count')).toBe('1');
    expect(imgEl.getAttribute('src')).toContain('yume_bonked');
  });

  it('syncs MascotProvider preference updates (.hidden, --mascot-scale, sound, volume) and preloads 4 images on mount', () => {
    const { adapter } = createMockStorage({
      yumeshelf_mascot_show: 'on',
      yumeshelf_mascot_scale: '40',
      yumeshelf_mascot_sound: 'squeaker',
      yumeshelf_mascot_volume: '30',
    });

    const imageInstances: unknown[] = [];
    const OriginalImage = globalThis.Image;
    class SpyImage {
      src = '';
      constructor() {
        imageInstances.push(this);
      }
    }
    vi.stubGlobal('Image', SpyImage);

    try {
      expect(imageInstances.length).toBe(0);
      let ctx!: MascotContextValue;
      const { container, unmount } = render(
        <MascotHarness
          storage={adapter}
          onContext={(c) => {
            ctx = c;
          }}
        />
      );
      expect(imageInstances.length).toBe(4);

      const widgetBtn = container.querySelector<HTMLButtonElement>('.yume-mascot-widget')!;
      expect(widgetBtn.classList.contains('hidden')).toBe(false);
      expect(widgetBtn.style.getPropertyValue('--mascot-scale')).toBe('0.4');

      act(() => {
        ctx.setShow(false);
        ctx.setScale(75);
        ctx.setSound('metal-pipe');
        ctx.setVolume(80);
      });

      expect(widgetBtn.classList.contains('hidden')).toBe(true);
      expect(widgetBtn.style.getPropertyValue('--mascot-scale')).toBe('0.75');
      expect(container.querySelector('#mascot-menu-volume-slider')).toHaveAttribute(
        'aria-valuetext',
        '80%'
      );
      expect(container.querySelector<HTMLSelectElement>('#mascot-menu-sound-select')?.value).toBe(
        'metal-pipe'
      );

      unmount();
    } finally {
      vi.stubGlobal('Image', OriginalImage);
    }
  });

  it('triggers bonk on Enter/Space (with e.repeat guard), recovers to smug, and cleans up listeners on unmount', () => {
    vi.useFakeTimers();
    const { adapter, store } = createMockStorage({
      yumeshelf_mascot_sound: 'none',
      yumeshelf_mascot_x: '100',
      yumeshelf_mascot_y: '100',
    });

    const getSpy = vi.spyOn(Storage.prototype, 'getItem');
    const setSpy = vi.spyOn(Storage.prototype, 'setItem');
    const removeSpy = vi.spyOn(Storage.prototype, 'removeItem');

    const { container, unmount } = render(<MascotHarness storage={adapter} />);

    const widgetBtn = container.querySelector<HTMLButtonElement>('.yume-mascot-widget')!;
    const imgEl = container.querySelector<HTMLImageElement>('#yume-mascot-img')!;
    const contextMenu = container.querySelector<HTMLDivElement>('#mascot-context-menu')!;
    const resetBtn = container.querySelector<HTMLButtonElement>('#mascot-menu-reset-btn')!;

    expect(imgEl.getAttribute('src')).toContain('yume_smug');

    // Enter keydown triggers bonk
    fireEvent.keyDown(widgetBtn, { key: 'Enter' });
    expect(store.get('yumeshelf_mascot_bonk_count')).toBe('1');
    expect(widgetBtn.classList.contains('bonk-animating')).toBe(true);
    expect(imgEl.getAttribute('src')).toContain('yume_bonked');

    // Space keydown with repeat=true is ignored
    fireEvent.keyDown(widgetBtn, { key: ' ', repeat: true });
    expect(store.get('yumeshelf_mascot_bonk_count')).toBe('1');

    // Space keydown with repeat=false triggers bonk
    fireEvent.keyDown(widgetBtn, { key: ' ', repeat: false });
    expect(store.get('yumeshelf_mascot_bonk_count')).toBe('2');

    // Advance timers -> bonk recovery restores smug
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(imgEl.getAttribute('src')).toContain('yume_smug');

    // Contextmenu opens menu, Escape closes it
    expect(contextMenu.style.display).toBe('none');
    fireEvent.contextMenu(widgetBtn, { clientX: 40, clientY: 40 });
    expect(contextMenu.style.display).toBe('flex');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(contextMenu.style.display).toBe('none');

    // Zero ambient localStorage calls
    expect(getSpy).not.toHaveBeenCalled();
    expect(setSpy).not.toHaveBeenCalled();
    expect(removeSpy).not.toHaveBeenCalled();

    // Unmount tears down listeners and post-unmount resetBtn click is a no-op
    unmount();

    widgetBtn.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(store.get('yumeshelf_mascot_bonk_count')).toBe('2');

    widgetBtn.dispatchEvent(
      new MouseEvent('contextmenu', { clientX: 40, clientY: 40, bubbles: true, cancelable: true })
    );
    expect(contextMenu.style.display).toBe('none');

    store.set('yumeshelf_mascot_x', '250');
    resetBtn.click();
    expect(store.get('yumeshelf_mascot_x')).toBe('250');
  });

  it('clamps drag with cached pointerdown rect, persists only on pointerup, handles pointercancel, and resets position', () => {
    const { adapter, store } = createMockStorage({
      yumeshelf_mascot_sound: 'none',
    });

    const { container } = render(<MascotHarness storage={adapter} />);
    const widgetBtn = container.querySelector<HTMLButtonElement>('.yume-mascot-widget')!;
    const imgEl = container.querySelector<HTMLImageElement>('#yume-mascot-img')!;
    const resetBtn = container.querySelector<HTMLButtonElement>('#mascot-menu-reset-btn')!;

    vi.spyOn(widgetBtn, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 100,
      width: 150,
      height: 150,
      right: 250,
      bottom: 250,
      x: 100,
      y: 100,
      toJSON: () => {},
    });

    const setItemSpy = vi.mocked(adapter.setItem);
    setItemSpy.mockClear();

    fireEvent.pointerDown(widgetBtn, { button: 0, clientX: 120, clientY: 120, pointerId: 1 });
    fireEvent.pointerMove(widgetBtn, { clientX: 140, clientY: 150 });

    expect(widgetBtn.classList.contains('is-dragging')).toBe(true);
    expect(imgEl.getAttribute('src')).toContain('yume_bonked');
    expect(widgetBtn.style.left).toBe('120px');
    expect(widgetBtn.style.top).toBe('130px');
    expect(setItemSpy).not.toHaveBeenCalledWith('yumeshelf_mascot_x', expect.any(String));
    expect(setItemSpy).not.toHaveBeenCalledWith('yumeshelf_mascot_y', expect.any(String));

    fireEvent.pointerUp(widgetBtn, { clientX: 140, clientY: 150, pointerId: 1 });
    expect(widgetBtn.classList.contains('is-dragging')).toBe(false);
    expect(imgEl.getAttribute('src')).toContain('yume_smug');
    expect(store.get('yumeshelf_mascot_x')).toBe('120');
    expect(store.get('yumeshelf_mascot_y')).toBe('130');

    // pointerCancel restores smug without incrementing bonk_count
    fireEvent.pointerDown(widgetBtn, { button: 0, clientX: 120, clientY: 120, pointerId: 2 });
    fireEvent.pointerMove(widgetBtn, { clientX: 145, clientY: 160 });
    expect(imgEl.getAttribute('src')).toContain('yume_bonked');
    fireEvent.pointerCancel(widgetBtn, { pointerId: 2 });
    expect(imgEl.getAttribute('src')).toContain('yume_smug');
    expect(store.has('yumeshelf_mascot_bonk_count')).toBe(false);

    // Reset Position clears x and y
    fireEvent.contextMenu(widgetBtn, { clientX: 50, clientY: 50 });
    fireEvent.click(resetBtn);
    expect(store.has('yumeshelf_mascot_x')).toBe(false);
    expect(store.has('yumeshelf_mascot_y')).toBe(false);
  });

  it('clamps context menu with 250x180 fallback in happy-dom and restores focus on Escape/Reset only when visible', () => {
    const { adapter } = createMockStorage();
    let ctx!: MascotContextValue;
    const { container } = render(
      <MascotHarness
        storage={adapter}
        onContext={(c) => {
          ctx = c;
        }}
      />
    );

    const widgetBtn = container.querySelector<HTMLButtonElement>('.yume-mascot-widget')!;
    const contextMenu = container.querySelector<HTMLDivElement>('#mascot-context-menu')!;
    const resetBtn = container.querySelector<HTMLButtonElement>('#mascot-menu-reset-btn')!;

    // Bottom-right corner click with 0x0 getBoundingClientRect -> uses 250x180 fallback
    fireEvent.contextMenu(widgetBtn, {
      clientX: window.innerWidth - 5,
      clientY: window.innerHeight - 5,
    });
    expect(contextMenu.style.display).toBe('flex');
    expect(contextMenu.style.left).toBe(`${Math.max(10, window.innerWidth - 5 - 250)}px`);
    expect(contextMenu.style.top).toBe(`${Math.max(10, window.innerHeight - 5 - 180)}px`);

    // Escape while focus is inside menu returns focus to widgetBtn when visible
    resetBtn.focus();
    expect(document.activeElement).toBe(resetBtn);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.activeElement).toBe(widgetBtn);

    // Clicking Reset while focus is inside menu returns focus to widgetBtn when visible
    fireEvent.contextMenu(widgetBtn, { clientX: 40, clientY: 40 });
    resetBtn.focus();
    fireEvent.click(resetBtn);
    expect(document.activeElement).toBe(widgetBtn);

    // When hidden, closing does not steal focus
    const externalInput = document.createElement('input');
    document.body.appendChild(externalInput);
    act(() => {
      ctx.setShow(false);
    });
    externalInput.focus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.activeElement).toBe(externalInput);
  });

  it('re-clamps saved position on window resize and #mascot-menu-scale-slider change', () => {
    const { adapter, store } = createMockStorage({
      yumeshelf_mascot_x: String(window.innerWidth - 50),
      yumeshelf_mascot_y: String(window.innerHeight - 50),
    });

    const { container } = render(<MascotHarness storage={adapter} />);
    const widgetBtn = container.querySelector<HTMLButtonElement>('.yume-mascot-widget')!;
    const scaleSlider = container.querySelector<HTMLInputElement>('#mascot-menu-scale-slider')!;
    const scaleValue = container.querySelector<HTMLElement>('#mascot-menu-scale-value')!;

    expect(scaleSlider.value).toBe('30');
    expect(scaleValue.textContent).toBe('30%');

    vi.spyOn(widgetBtn, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 200,
      height: 200,
      right: 200,
      bottom: 200,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    fireEvent.change(scaleSlider, { target: { value: '65' } });
    expect(scaleSlider.value).toBe('65');
    expect(scaleValue.textContent).toBe('65%');
    expect(Number(store.get('yumeshelf_mascot_x'))).toBeLessThanOrEqual(window.innerWidth - 200);

    fireEvent(window, new Event('resize'));
    expect(Number(store.get('yumeshelf_mascot_y'))).toBeLessThanOrEqual(window.innerHeight - 200);
  });

  it('emits sanitized [MascotWidget] console.warn on setPointerCapture and position storage errors without crashing', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { adapter } = createMockStorage();
    vi.mocked(adapter.setItem).mockImplementation((key) => {
      if (key === 'yumeshelf_mascot_x' || key === 'yumeshelf_mascot_y') {
        throw new Error('QuotaExceededError at C:\\Users\\alice\\AppData\\yume');
      }
    });

    const { container } = render(<MascotHarness storage={adapter} />);
    const widgetBtn = container.querySelector<HTMLButtonElement>('.yume-mascot-widget')!;

    widgetBtn.setPointerCapture = vi.fn(() => {
      throw new Error('Capture failed at /Users/bob/app');
    });

    expect(() => {
      fireEvent.pointerDown(widgetBtn, { button: 0, clientX: 100, clientY: 100, pointerId: 1 });
      fireEvent.pointerMove(widgetBtn, { clientX: 130, clientY: 130 });
      fireEvent.pointerUp(widgetBtn, { clientX: 130, clientY: 130, pointerId: 1 });
    }).not.toThrow();

    expect(warnSpy).toHaveBeenCalledWith(
      '[MascotWidget] Failed to capture pointer:',
      expect.objectContaining({
        error: 'Capture failed at <USER_DIR>/app',
      })
    );
    expect(warnSpy).toHaveBeenCalledWith(
      '[MascotWidget] Failed to persist mascot position:',
      expect.objectContaining({
        key: 'yumeshelf_mascot_x',
        error: 'QuotaExceededError at <USER_DIR>\\AppData\\yume',
      })
    );
  });

  it('declares :focus-visible outline, restored z-indices, and prefers-reduced-motion in src/styles/mascot.css', () => {
    const cssPath = path.resolve(process.cwd(), 'src/styles/mascot.css');
    const cssContent = fs.readFileSync(cssPath, 'utf8');

    expect(cssContent).toContain('.yume-mascot-widget:focus-visible');
    expect(cssContent).toContain('.mascot-menu-reset-btn:focus-visible');
    expect(cssContent).toContain('outline: 2px solid var(--accent)');
    expect(cssContent).toContain('z-index: 1650;');
    expect(cssContent).toContain('z-index: 1655;');
    expect(cssContent).toContain('z-index: 2100;');
    expect(cssContent).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
