import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMascotWidget } from './mascot-widget';
import type { UiStorageAdapter } from './state/ui-runtime-state';

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

function createMascotDom() {
  const widgetEl = document.createElement('button');
  widgetEl.className = 'yume-mascot-widget';
  const imgEl = document.createElement('img');
  imgEl.className = 'yume-mascot-img';
  widgetEl.appendChild(imgEl);

  const contextMenuEl = document.createElement('div');
  contextMenuEl.className = 'mascot-context-menu';
  contextMenuEl.style.display = 'none';

  const counterEl = document.createElement('span');
  counterEl.id = 'mascot-menu-counter';
  contextMenuEl.appendChild(counterEl);

  const resetBtn = document.createElement('button');
  resetBtn.id = 'mascot-menu-reset-btn';
  contextMenuEl.appendChild(resetBtn);

  document.body.appendChild(widgetEl);
  document.body.appendChild(contextMenuEl);

  return { widgetEl, imgEl, contextMenuEl, resetBtn, counterEl };
}

describe('createMascotWidget', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('returns safe no-op controller when widgetEl or imgEl is null', () => {
    const controller = createMascotWidget({ widgetEl: null, imgEl: null });
    expect(() => {
      controller.init();
      controller.show();
      controller.hide();
      controller.setVisible(true);
      controller.setScale(50);
      controller.setSound('squeaker');
      controller.setVolume(25);
      controller.resetPosition();
      controller.destroy();
    }).not.toThrow();
  });

  it('defers image preloading until init() is called in headless environments', () => {
    const { widgetEl, imgEl, contextMenuEl } = createMascotDom();
    const { adapter } = createMockStorage();

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
      const controller = createMascotWidget({
        widgetEl,
        imgEl,
        contextMenuEl,
        storage: adapter,
      });

      // No Image() constructed during createMascotWidget()
      expect(imageInstances.length).toBe(0);

      controller.init();
      // Images preloaded on init()
      expect(imageInstances.length).toBe(4);

      controller.destroy();
    } finally {
      vi.stubGlobal('Image', OriginalImage);
    }
  });

  it('routes all preference and coordinate reads/writes to injected UiStorageAdapter with zero ambient localStorage calls', () => {
    const { widgetEl, imgEl, contextMenuEl, resetBtn } = createMascotDom();
    const { adapter, store } = createMockStorage({
      yumeshelf_mascot_show: 'on',
      yumeshelf_mascot_scale: '60',
      yumeshelf_mascot_sound: 'none',
      yumeshelf_mascot_volume: '0',
      yumeshelf_mascot_x: '120',
      yumeshelf_mascot_y: '140',
      yumeshelf_mascot_bonk_count: '5',
    });

    const getSpy = vi.spyOn(Storage.prototype, 'getItem');
    const setSpy = vi.spyOn(Storage.prototype, 'setItem');
    const removeSpy = vi.spyOn(Storage.prototype, 'removeItem');

    const onBonk = vi.fn();
    const controller = createMascotWidget({
      widgetEl,
      imgEl,
      contextMenuEl,
      onBonk,
      storage: adapter,
    });

    controller.init();

    // Trigger bonk via Enter key on widgetEl
    const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
    widgetEl.dispatchEvent(enterEvent);

    expect(onBonk).toHaveBeenCalledTimes(1);
    expect(store.get('yumeshelf_mascot_bonk_count')).toBe('6');

    // Open context menu and click reset button
    widgetEl.dispatchEvent(
      new MouseEvent('contextmenu', { clientX: 50, clientY: 50, bubbles: true, cancelable: true })
    );
    expect(contextMenuEl.style.display).toBe('flex');

    resetBtn.click();
    expect(store.has('yumeshelf_mascot_x')).toBe(false);
    expect(store.has('yumeshelf_mascot_y')).toBe(false);
    expect(contextMenuEl.style.display).toBe('none');

    // Zero ambient localStorage calls
    expect(getSpy).not.toHaveBeenCalled();
    expect(setSpy).not.toHaveBeenCalled();
    expect(removeSpy).not.toHaveBeenCalled();

    controller.destroy();
  });

  it('attaches keyboard/contextmenu listeners on init() and cleanly removes all listeners (including #mascot-menu-reset-btn and keydown) in destroy()', () => {
    const { widgetEl, imgEl, contextMenuEl, resetBtn } = createMascotDom();
    const { adapter, store } = createMockStorage({
      yumeshelf_mascot_sound: 'none',
      yumeshelf_mascot_x: '100',
      yumeshelf_mascot_y: '100',
    });

    const onBonk = vi.fn();
    const controller = createMascotWidget({
      widgetEl,
      imgEl,
      contextMenuEl,
      onBonk,
      storage: adapter,
    });

    controller.init();

    // Space key on widgetEl triggers bonk
    widgetEl.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(onBonk).toHaveBeenCalledTimes(1);

    // Contextmenu opens menu, Escape closes it
    widgetEl.dispatchEvent(
      new MouseEvent('contextmenu', { clientX: 20, clientY: 20, bubbles: true, cancelable: true })
    );
    expect(contextMenuEl.style.display).toBe('flex');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(contextMenuEl.style.display).toBe('none');

    // Destroy should remove all listeners
    controller.destroy();

    // Keydown Enter/Space after destroy does not trigger bonk
    widgetEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    widgetEl.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(onBonk).toHaveBeenCalledTimes(1);

    // Contextmenu after destroy does not open menu
    widgetEl.dispatchEvent(
      new MouseEvent('contextmenu', { clientX: 20, clientY: 20, bubbles: true, cancelable: true })
    );
    expect(contextMenuEl.style.display).toBe('none');

    // Clicking resetBtn after destroy does not remove stored position
    store.set('yumeshelf_mascot_x', '250');
    resetBtn.click();
    expect(store.get('yumeshelf_mascot_x')).toBe('250');
  });
});
