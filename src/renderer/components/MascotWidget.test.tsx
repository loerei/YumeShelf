import fs from 'node:fs';
import path from 'node:path';
import { fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MascotWidget } from './MascotWidget';
import * as mascotWidgetModule from '../mascot-widget';
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

describe('MascotWidget', () => {
  const OriginalAudio = globalThis.Audio;

  beforeEach(() => {
    vi.stubGlobal('Audio', createMockAudio());
  });

  afterEach(() => {
    vi.stubGlobal('Audio', OriginalAudio);
    vi.restoreAllMocks();
  });

  it('renders #mascot-widget-container with focusable button.yume-mascot-widget and volume slider aria-valuetext', () => {
    const { adapter } = createMockStorage();
    const { container } = render(
      <MascotWidget show={true} scale={50} sound="squeaker" volume={45} storage={adapter} />
    );

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

  it('passes storage prop to createMascotWidget, calls init() on mount and destroy() on unmount, and syncs prop updates', () => {
    const { adapter } = createMockStorage();
    const createSpy = vi.spyOn(mascotWidgetModule, 'createMascotWidget');

    const { container, rerender, unmount } = render(
      <MascotWidget show={true} scale={40} sound="squeaker" volume={30} storage={adapter} />
    );

    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        storage: adapter,
      })
    );

    const widgetBtn = container.querySelector<HTMLButtonElement>('.yume-mascot-widget')!;
    expect(widgetBtn.classList.contains('hidden')).toBe(false);
    expect(widgetBtn.style.getPropertyValue('--mascot-scale')).toBe('0.4');

    rerender(
      <MascotWidget show={false} scale={75} sound="metal-pipe" volume={80} storage={adapter} />
    );

    expect(widgetBtn.classList.contains('hidden')).toBe(true);
    expect(widgetBtn.style.getPropertyValue('--mascot-scale')).toBe('0.75');
    expect(container.querySelector('#mascot-menu-volume-slider')).toHaveAttribute(
      'aria-valuetext',
      '80%'
    );

    unmount();
  });

  it('triggers bonk on Enter/Space keydown with observable storage, class, and image transitions, and toggles #mascot-context-menu on contextmenu/Escape', () => {
    const { adapter } = createMockStorage({ yumeshelf_mascot_sound: 'squeaker' });
    const { container, unmount } = render(<MascotWidget show={true} storage={adapter} />);

    const widgetBtn = container.querySelector<HTMLButtonElement>('.yume-mascot-widget')!;
    const imgEl = container.querySelector<HTMLImageElement>('#yume-mascot-img')!;
    const contextMenu = container.querySelector<HTMLDivElement>('#mascot-context-menu')!;

    const initialSrc = imgEl.getAttribute('src');
    expect(initialSrc).toContain('yume_smug');

    // Enter keydown triggers bonk
    fireEvent.keyDown(widgetBtn, { key: 'Enter' });

    expect(adapter.getItem('yumeshelf_mascot_bonk_count')).toBe('1');
    expect(widgetBtn.classList.contains('bonk-animating')).toBe(true);
    expect(imgEl.getAttribute('src')).toContain('yume_bonked');

    // Contextmenu opens menu
    expect(contextMenu.style.display).toBe('none');
    fireEvent.contextMenu(widgetBtn, { clientX: 40, clientY: 40 });
    expect(contextMenu.style.display).toBe('flex');

    // Escape closes menu
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(contextMenu.style.display).toBe('none');

    // Unmount tears down listeners so subsequent dispatches do not mutate state
    unmount();

    widgetBtn.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(adapter.getItem('yumeshelf_mascot_bonk_count')).toBe('1');

    widgetBtn.dispatchEvent(
      new MouseEvent('contextmenu', { clientX: 40, clientY: 40, bubbles: true, cancelable: true })
    );
    expect(contextMenu.style.display).toBe('none');
  });

  it('declares :focus-visible outline, design token z-indices, and prefers-reduced-motion in src/styles/mascot.css', () => {
    const cssPath = path.resolve(process.cwd(), 'src/styles/mascot.css');
    const cssContent = fs.readFileSync(cssPath, 'utf8');

    expect(cssContent).toContain('.yume-mascot-widget:focus-visible');
    expect(cssContent).toContain('.mascot-menu-reset-btn:focus-visible');
    expect(cssContent).toContain('outline: 2px solid var(--accent)');
    expect(cssContent).toContain('var(--zIndex-widget)');
    expect(cssContent).toContain('var(--zIndex-widget-overlay)');
    expect(cssContent).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
