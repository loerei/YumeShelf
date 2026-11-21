import { useEffect, useState } from 'react';
import enLocale from '../../locales/builtins/en.json';
import jaLocale from '../../locales/builtins/ja.json';
import zhLocale from '../../locales/builtins/zh.json';

export const LANGUAGE_CHANGED_EVENT = 'yumeshelf:language-changed';

export interface LocaleStrings {
  readonly placeholders: readonly string[];
  readonly no_results: string;
  readonly [key: string]: unknown;
}

const BUILTIN_LOCALES: Record<string, Partial<LocaleStrings>> = {
  en: enLocale.strings,
  ja: jaLocale.strings,
  zh: zhLocale.strings,
};

export function getStoredLanguage(): string {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem('yumeshelf_lang');
      if (typeof raw === 'string' && raw.trim()) {
        return raw.trim().toLowerCase();
      }
    }
  } catch {
    // Ignore storage errors in sandboxed/restricted contexts
  }
  return 'en';
}

export function getBuiltinLocaleStrings(lang?: string): LocaleStrings {
  const normalized = (lang || 'en').trim().toLowerCase();
  const base = enLocale.strings as LocaleStrings;
  const override = BUILTIN_LOCALES[normalized];
  if (!override || normalized === 'en') {
    return base;
  }
  return {
    ...base,
    ...override,
    placeholders:
      Array.isArray(override.placeholders) && override.placeholders.length > 0
        ? override.placeholders
        : base.placeholders,
    no_results:
      typeof override.no_results === 'string' && override.no_results
        ? override.no_results
        : base.no_results,
  };
}

export function dispatchLanguageChanged(code: string): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(LANGUAGE_CHANGED_EVENT, { detail: { code } }));
  }
}

export function useLocaleStrings(): LocaleStrings {
  const [lang, setLang] = useState<string>(() => getStoredLanguage());
  const [strings, setStrings] = useState<LocaleStrings>(() => getBuiltinLocaleStrings(lang));

  useEffect(() => {
    const syncLang = () => {
      const next = getStoredLanguage();
      setLang(next);
      setStrings(getBuiltinLocaleStrings(next));
    };

    const handleStorage = (e: StorageEvent) => {
      if (!e.key || e.key === 'yumeshelf_lang') {
        syncLang();
      }
    };

    const handleLanguageChanged = (e: Event) => {
      const detailCode = (e as CustomEvent<{ code?: string }>).detail?.code;
      const next =
        typeof detailCode === 'string' && detailCode.trim()
          ? detailCode.trim().toLowerCase()
          : getStoredLanguage();
      setLang(next);
      setStrings(getBuiltinLocaleStrings(next));
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener(LANGUAGE_CHANGED_EVENT, handleLanguageChanged);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(LANGUAGE_CHANGED_EVENT, handleLanguageChanged);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const api =
      typeof window !== 'undefined'
        ? (window as unknown as {
            electronAPI?: {
              getLanguageState?: () => Promise<{
                builtIn?: Array<{ code?: string; strings?: Record<string, unknown> }>;
                installed?: Array<{ code?: string; strings?: Record<string, unknown> }>;
              }>;
            };
          }).electronAPI
        : undefined;

    if (!api?.getLanguageState) return;

    api
      .getLanguageState()
      .then((state) => {
        if (cancelled || !state) return;
        const packs = [...(state.installed ?? []), ...(state.builtIn ?? [])];
        const match = packs.find(
          (p) => typeof p.code === 'string' && p.code.trim().toLowerCase() === lang
        );
        if (!match?.strings) return;
        const base = enLocale.strings as LocaleStrings;
        const packStrings = match.strings as Partial<LocaleStrings>;
        setStrings({
          ...base,
          ...packStrings,
          placeholders:
            Array.isArray(packStrings.placeholders) && packStrings.placeholders.length > 0
              ? packStrings.placeholders
              : base.placeholders,
          no_results:
            typeof packStrings.no_results === 'string' && packStrings.no_results
              ? packStrings.no_results
              : base.no_results,
        });
      })
      .catch(() => {
        // Built-in fallback is already active
      });

    return () => {
      cancelled = true;
    };
  }, [lang]);

  return strings;
}
