import type { UiStorageAdapter } from '../state/ui-runtime-state';

export const KNOWN_THEMES = ['system', 'light', 'dark'] as const;
export type UiTheme = (typeof KNOWN_THEMES)[number];

export function applyTheme(nextTheme?: string, storage?: UiStorageAdapter): string {
  const raw = nextTheme || storage?.getItem('yumeshelf_theme') || 'system';
  const resolvedTheme = KNOWN_THEMES.includes(raw as UiTheme) ? raw : 'system';
  if (typeof document !== 'undefined' && document.body) {
    KNOWN_THEMES.forEach((t) => document.body.classList.remove(`${t}-theme`));
    document.body.classList.add(`${resolvedTheme}-theme`);
  }
  if (nextTheme && storage) {
    storage.setItem('yumeshelf_theme', resolvedTheme);
  }
  return resolvedTheme;
}
