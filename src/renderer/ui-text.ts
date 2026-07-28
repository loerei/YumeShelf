import { RendererRefs } from './bootstrap/dom-refs';
import { bindI18nStrings } from './i18n-binder';

export interface UITextControllerOptions {
    bootController: any;
    electronAPI: any;
    getCurrentSort: () => string;
    getEnglishStrings: () => any;
    getLocaleState: () => any;
    getPlaceholderIndex: () => number;
    getPlaceholders: () => string[];
    getStrings: () => any;
    refs: RendererRefs['uiTextRefs'];
    renderLanguagePackResults: () => void;
    updateSearch: (query: string) => void;
}

export interface UITextController {
    applyUIStrings: () => Promise<void>;
    refreshAppVersionLink: () => void;
}

export interface UITextContext {
    bootController: any;
    electronAPI: any;
    getCurrentSort: () => string;
    getEnglishStrings: () => any;
    getLocaleState: () => any;
    getPlaceholderIndex: () => number;
    getPlaceholders: () => string[];
    getStrings: () => any;
    refs: RendererRefs['uiTextRefs'];
    renderLanguagePackResults: () => void;
    updateSearch: (query: string) => void;
    isDev?: boolean;
}

export function applyWelcomeAndSettingsStrings(context: UITextContext, d: any, defPath: string): void {
    const { refs, getEnglishStrings, isDev } = context;
    bindI18nStrings(document, { dictionary: d, fallbackDictionary: getEnglishStrings() });

    if (refs.uiTitle) {
        refs.uiTitle.innerText = isDev ? 'YumeShelf (Develop)' : (d.title ?? 'YumeShelf');
    }
    if (refs.uiOptLazyDesc) {
        const prefix = d.opt_lazy_desc_prefix ?? 'Create';
        refs.uiOptLazyDesc.innerText = `${prefix} ${defPath}/!`;
    }
}

export function applyThemeAndUpdateStrings(context: UITextContext, d: any): void {
    const { getEnglishStrings } = context;
    bindI18nStrings(document, { dictionary: d, fallbackDictionary: getEnglishStrings() });
}

export function applySortAndSearchStrings(context: UITextContext, d: any): void {
    const { refs, getCurrentSort, getPlaceholders, getPlaceholderIndex, updateSearch } = context;
    if (refs.sortMenu) {
        refs.sortMenu.querySelectorAll('.sort-item').forEach((el) => el.classList.remove('active'));
        const activeSort = refs.sortMenu.querySelector(`[data-sort="${getCurrentSort()}"]`);
        if (activeSort) activeSort.classList.add('active');
    }

    if (refs.sortActiveLabel) {
        const currentSortVal = getCurrentSort();
        let labelText = d.sort_date;
        if (currentSortVal === 'played') labelText = d.sort_played;
        else if (currentSortVal === 'az') labelText = d.sort_az;
        else if (currentSortVal === 'custom') labelText = d.sort_custom;

        refs.sortActiveLabel.innerText = labelText ?? d.sort_date;
    }

    if (refs.searchInput && refs.searchPlaceholder) {
        if (!refs.searchInput.value.trim()) {
            const placeholders = getPlaceholders();
            refs.searchPlaceholder.innerText = placeholders[getPlaceholderIndex() % placeholders.length];
        } else {
            updateSearch(refs.searchInput.value);
        }
    }
}

export function createUITextController({
    bootController,
    electronAPI,
    getCurrentSort,
    getEnglishStrings,
    getLocaleState,
    getPlaceholderIndex,
    getPlaceholders,
    getStrings,
    refs,
    renderLanguagePackResults,
    updateSearch
}: UITextControllerOptions): UITextController {
    function renderAppVersionLink(): void {
        const appVersion = getLocaleState().appVersion || '';
        const label = `YumeShelf v${appVersion}`.trim();
        const releaseUrl = appVersion
            ? `https://github.com/loerei/YumeShelf/releases/tag/v${appVersion}`
            : '';

        if (navigator.onLine && releaseUrl && refs.uiAppVersion) {
            refs.uiAppVersion.innerHTML = `<a class="settings-version-link" href="${releaseUrl}">${label}</a>`;
            const versionLink = refs.uiAppVersion.querySelector('a');
            if (versionLink) {
                versionLink.onclick = async (event) => {
                    event.preventDefault();
                    await electronAPI.openExternalUrl(releaseUrl);
                };
            }
            return;
        }

        if (refs.uiAppVersion) {
            refs.uiAppVersion.innerText = label;
        }
    }

    async function applyUIStrings(): Promise<void> {
        const d = getStrings();
        (window as any).currentUIStrings = d;
        const defPath = await electronAPI.getDefaultPath();
        const isDev = await electronAPI.isDev();

        const context: UITextContext = {
            bootController,
            electronAPI,
            getCurrentSort,
            getEnglishStrings,
            getLocaleState,
            getPlaceholderIndex,
            getPlaceholders,
            getStrings,
            refs,
            renderLanguagePackResults,
            updateSearch,
            isDev
        };

        applyWelcomeAndSettingsStrings(context, d, defPath);
        renderAppVersionLink();
        applyThemeAndUpdateStrings(context, d);
        applySortAndSearchStrings(context, d);

        renderLanguagePackResults();
        bootController.render(bootController.getLatestPayload());
    }

    return {
        applyUIStrings,
        refreshAppVersionLink: renderAppVersionLink
    };
}
