import { useEffect, useState } from 'react';
import enLocale from '../../locales/builtins/en.json';
import type { UiStorageAdapter } from '../state/ui-runtime-state';

export const LANGUAGE_CHANGED_EVENT = 'yumeshelf:language-changed';
const BUILTIN_LANGUAGE_ORDER = ['en', 'ja', 'zh'];

export type DefaultLocaleStrings = typeof enLocale.strings;

export type LocaleStrings = {
  readonly [K in keyof DefaultLocaleStrings]: DefaultLocaleStrings[K];
} & {
  readonly [key: string]: string | readonly string[] | undefined;
};

export interface LanguagePackMeta {
  readonly code: string;
  readonly nativeName?: string;
  readonly englishName?: string;
  readonly source?: 'built-in' | 'installed' | string;
  readonly strings?: Record<string, unknown>;
}

export interface LanguageStatePayload {
  readonly builtIn?: readonly LanguagePackMeta[];
  readonly installed?: readonly LanguagePackMeta[];
  readonly locales?: Readonly<Record<string, unknown>>;
  readonly repoUrl?: string;
  readonly manifestUrl?: string;
  readonly appVersion?: string;
}

const DEFAULT_EN_STRINGS: LocaleStrings = enLocale.strings as LocaleStrings;

let cachedLanguageState: LanguageStatePayload | null = null;
let inflightFetch: Promise<LanguageStatePayload | null> | null = null;
let lastKnownLang: string | null = null;
let globalListenersAttached = false;
const stateSubscribers = new Set<() => void>();

function notifySubscribers(): void {
  for (const listener of stateSubscribers) {
    listener();
  }
}

function ensureGlobalListenersAttached(): void {
  if (globalListenersAttached || typeof window === 'undefined') return;
  globalListenersAttached = true;

  window.addEventListener('storage', (e: StorageEvent) => {
    if (!e.key || e.key === 'yumeshelf_lang') {
      lastKnownLang = getStoredLanguage();
      notifySubscribers();
      void fetchLanguageState(undefined, false);
    }
  });

  window.addEventListener(LANGUAGE_CHANGED_EVENT, (e: Event) => {
    const detailCode = (e as CustomEvent<{ code?: string }>).detail?.code;
    if (typeof detailCode === 'string' && detailCode.trim()) {
      lastKnownLang = detailCode.trim().toLowerCase();
    } else {
      lastKnownLang = getStoredLanguage();
    }
    notifySubscribers();
    void fetchLanguageState(undefined, true);
  });
}

export function resetLocaleCacheForTests(): void {
  cachedLanguageState = null;
  inflightFetch = null;
  lastKnownLang = null;
}

export function formatLanguageLabel(meta?: LanguagePackMeta | null): string {
  if (!meta) return '';
  const nativeName = meta.nativeName?.trim() || '';
  const englishName = meta.englishName?.trim() || '';
  if (!englishName || englishName === nativeName) {
    return nativeName || meta.code;
  }
  if (!nativeName) return englishName || meta.code;
  return `${nativeName} (${englishName})`;
}

export function sortLanguageOptions(
  builtIn: readonly LanguagePackMeta[] = [],
  installed: readonly LanguagePackMeta[] = []
): Array<{ code: string; label: string; nativeName: string; englishName: string }> {
  const seen = new Set<string>();
  const sortedBuiltIn = [...builtIn].sort((a, b) => {
    const idxA = BUILTIN_LANGUAGE_ORDER.indexOf(String(a.code || '').toLowerCase());
    const idxB = BUILTIN_LANGUAGE_ORDER.indexOf(String(b.code || '').toLowerCase());
    const rankA = idxA === -1 ? 999 : idxA;
    const rankB = idxB === -1 ? 999 : idxB;
    return rankA - rankB;
  });
  const sortedInstalled = [...installed].sort((a, b) =>
    formatLanguageLabel(a).localeCompare(formatLanguageLabel(b))
  );

  const result: Array<{ code: string; label: string; nativeName: string; englishName: string }> = [];
  for (const entry of [...sortedBuiltIn, ...sortedInstalled]) {
    const code = String(entry?.code || '').trim().toLowerCase();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    result.push({
      code,
      label: formatLanguageLabel(entry),
      nativeName: entry.nativeName || entry.englishName || code,
      englishName: entry.englishName || entry.nativeName || code,
    });
  }
  if (result.length === 0) {
    result.push({ code: 'en', label: 'English', nativeName: 'English', englishName: 'English' });
  }
  return result;
}

export function getStoredLanguage(storage?: Pick<UiStorageAdapter, 'getItem'> | null): string {
  try {
    const targetStorage =
      storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    const raw = targetStorage?.getItem?.('yumeshelf_lang');
    if (typeof raw === 'string' && raw.trim()) {
      return raw.trim().toLowerCase();
    }
  } catch {
    // Ignore storage errors in restricted contexts
  }
  return 'en';
}

export function resolveStringsFromState(
  lang: string,
  state: LanguageStatePayload | null
): LocaleStrings {
  const normalized = (lang || 'en').trim().toLowerCase();
  const enFromState = state?.locales?.en as Partial<LocaleStrings> | undefined;
  const base: LocaleStrings = enFromState
    ? ({ ...DEFAULT_EN_STRINGS, ...enFromState } as LocaleStrings)
    : DEFAULT_EN_STRINGS;

  if (!state || normalized === 'en') {
    return base;
  }

  let packStrings = state.locales?.[normalized] as Partial<LocaleStrings> | undefined;
  if (!packStrings && state.locales) {
    const matchedKey = Object.keys(state.locales).find(
      (k) => k.trim().toLowerCase() === normalized
    );
    if (matchedKey) {
      packStrings = state.locales[matchedKey] as Partial<LocaleStrings>;
    }
  }
  if (!packStrings) {
    const allPacks = [...(state.installed ?? []), ...(state.builtIn ?? [])];
    const matchedPack = allPacks.find(
      (p) => typeof p.code === 'string' && p.code.trim().toLowerCase() === normalized
    );
    if (matchedPack?.strings) {
      packStrings = matchedPack.strings as Partial<LocaleStrings>;
    }
  }

  if (!packStrings) {
    return base;
  }

  return {
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
  };
}

export function fetchLanguageState(
  explicitApi?: { getLanguageState?: () => Promise<LanguageStatePayload> } | null,
  forceRefresh = false
): Promise<LanguageStatePayload | null> {
  let api = explicitApi;
  if (api === undefined && typeof window !== 'undefined') {
    try {
      api = (
        window as unknown as {
          electronAPI?: { getLanguageState?: () => Promise<LanguageStatePayload> };
        }
      ).electronAPI;
    } catch {
      api = null;
    }
  }

  if (!api?.getLanguageState) {
    return Promise.resolve(cachedLanguageState);
  }

  if (cachedLanguageState && !forceRefresh) {
    return Promise.resolve(cachedLanguageState);
  }

  if (inflightFetch && !forceRefresh) {
    return inflightFetch;
  }

  const request = Promise.resolve(api.getLanguageState())
    .then((state) => {
      if (state && typeof state === 'object') {
        cachedLanguageState = state;
        notifySubscribers();
      }
      return cachedLanguageState;
    })
    .catch(() => cachedLanguageState)
    .finally(() => {
      if (inflightFetch === request) {
        inflightFetch = null;
      }
    });

  inflightFetch = request;
  return request;
}

export function bindI18nAttributes(
  root: ParentNode | null | undefined,
  strings: LocaleStrings
): void {
  if (!root) return;
  const textEls = root.querySelectorAll<HTMLElement>('[data-i18n]');
  textEls.forEach((el) => {
    const key = el.dataset.i18n;
    if (!key) return;
    const val = strings[key];
    if (typeof val === 'string') {
      el.textContent = val;
    }
  });

  const placeholderEls = root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
    '[data-i18n-placeholder]'
  );
  placeholderEls.forEach((el) => {
    const key = el.dataset.i18nPlaceholder;
    if (!key) return;
    const val = strings[key];
    if (typeof val === 'string') {
      el.placeholder = val;
    }
  });

  const titleEls = root.querySelectorAll<HTMLElement>('[data-i18n-title]');
  titleEls.forEach((el) => {
    const key = el.dataset.i18nTitle;
    if (!key) return;
    const val = strings[key];
    if (typeof val === 'string') {
      el.setAttribute('data-tooltip', val);
      el.removeAttribute('title');
    }
  });
}

export function dispatchLanguageChanged(code: string): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(LANGUAGE_CHANGED_EVENT, { detail: { code } }));
  }
}

export function resolveLocalizedErrorCode(
  strings: LocaleStrings,
  errorCode: string | undefined,
  fallback: string
): string {
  const normalizedCode = typeof errorCode === 'string' ? errorCode.trim().replace(/-/g, '_') : '';
  const localeKey = normalizedCode ? `error_${normalizedCode}` : '';
  return localeKey && Object.hasOwn(strings, localeKey) && typeof strings[localeKey] === 'string'
    ? strings[localeKey]
    : fallback;
}

export function useLocaleStrings(
  storage?: Pick<UiStorageAdapter, 'getItem'> | null,
  explicitApi?: { getLanguageState?: () => Promise<LanguageStatePayload> } | null
): LocaleStrings {
  const [, setTick] = useState(0);

  useEffect(() => {
    ensureGlobalListenersAttached();
    const handleUpdate = () => setTick((t) => t + 1);
    stateSubscribers.add(handleUpdate);
    void fetchLanguageState(explicitApi, false);

    return () => {
      stateSubscribers.delete(handleUpdate);
    };
  }, [storage, explicitApi]);

  const lang = storage ? getStoredLanguage(storage) : lastKnownLang || getStoredLanguage();
  return resolveStringsFromState(lang, cachedLanguageState);
}
