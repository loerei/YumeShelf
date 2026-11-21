import { beforeEach, describe, expect, it } from 'vitest';
import type { UiStorageAdapter } from '../state/ui-runtime-state';
import { KNOWN_THEMES, applyTheme } from './theme';

function createMockStorage(initial: Record<string, string> = {}): UiStorageAdapter & { store: Map<string, string> } {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    store,
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
}

describe('theme utility', () => {
  beforeEach(() => {
    document.body.className = '';
  });

  it('exports KNOWN_THEMES with system, light, and dark', () => {
    expect(KNOWN_THEMES).toEqual(['system', 'light', 'dark']);
  });

  it('defaults to system-theme when no theme or storage value is provided', () => {
    const resolved = applyTheme();
    expect(resolved).toBe('system');
    expect(document.body.classList.contains('system-theme')).toBe(true);
  });

  it('reads stored theme when nextTheme is omitted and does not overwrite storage', () => {
    const storage = createMockStorage({ yumeshelf_theme: 'light' });
    const resolved = applyTheme(undefined, storage);
    expect(resolved).toBe('light');
    expect(document.body.classList.contains('light-theme')).toBe(true);
    expect(storage.getItem('yumeshelf_theme')).toBe('light');
  });

  it('persists valid nextTheme into storage and swaps theme classes while preserving non-theme classes', () => {
    document.body.classList.add('custom-shell', 'dark-theme', 'another-class');
    const storage = createMockStorage({ yumeshelf_theme: 'dark' });

    const resolved = applyTheme('light', storage);
    expect(resolved).toBe('light');
    expect(document.body.classList.contains('light-theme')).toBe(true);
    expect(document.body.classList.contains('dark-theme')).toBe(false);
    expect(document.body.classList.contains('custom-shell')).toBe(true);
    expect(document.body.classList.contains('another-class')).toBe(true);
    expect(storage.getItem('yumeshelf_theme')).toBe('light');
  });

  it('falls back to system when given an unknown theme value', () => {
    const storage = createMockStorage();
    const resolved = applyTheme('neon-pink', storage);
    expect(resolved).toBe('system');
    expect(document.body.classList.contains('system-theme')).toBe(true);
    expect(storage.getItem('yumeshelf_theme')).toBe('system');
  });
});
