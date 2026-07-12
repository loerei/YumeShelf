import { RendererRefs } from './bootstrap/dom-refs';
import { ElectronAPI } from '../shared/types/ipc';

export interface UITextControllerOptions {
    bootController: any;
    electronAPI: ElectronAPI;
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
    electronAPI: ElectronAPI;
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

function setText(el: HTMLElement | null | undefined, text: string): void {
    if (el) {
        el.innerText = text;
    }
}

export function applyWelcomeAndSettingsStrings(context: UITextContext, d: any, defPath: string): void {
    const { refs, getEnglishStrings, isDev } = context;
    setText(refs.uiTitle, isDev ? 'YumeShelf (Develop)' : d.title);
    setText(refs.uiWelcomeTitle, d.welcome);
    setText(refs.uiWelcomeDesc, d.welcome_desc);
    setText(refs.uiOptChoose, d.opt_choose);
    setText(refs.uiOptChooseDesc, d.opt_choose_desc);
    setText(refs.uiOptLazy, d.opt_lazy);
    setText(refs.uiOptLazyDesc, `${d.opt_lazy_desc_prefix} ${defPath}/!`);
    setText(refs.uiSettingsTitle, d.settings);
    setText(refs.uiLangLabel, d.lang);
    setText(refs.uiThemeLabel, d.theme);
    setText(refs.uiPathLabel, d.path);
    setText(refs.uiLocationDisplayLabel, d.location_display_label || getEnglishStrings().location_display_label);
    setText(refs.uiMaxDepthLabel, d.max_depth_label || getEnglishStrings().max_depth_label);
    setText(refs.uiAppUpdatesLabel, d.app_updates_label || getEnglishStrings().app_updates_label);
    setText(refs.uiLanguagePackUpdatesLabel, d.language_pack_updates_label || getEnglishStrings().language_pack_updates_label);
    setText(refs.uiAutoLaunchLabel, d.auto_launch_label || getEnglishStrings().auto_launch_label);
    setText(refs.uiAutoLaunchOff, d.option_off || getEnglishStrings().option_off);
    setText(refs.uiAutoLaunchOn, d.option_on || getEnglishStrings().option_on);
    setText(refs.uiAutoLaunchMinimized, d.option_minimized || getEnglishStrings().option_minimized);
    setText(refs.uiMinimizeToTrayLabel, d.minimize_to_tray_label || getEnglishStrings().minimize_to_tray_label);
    setText(refs.uiMinimizeToTrayOff, d.option_off || getEnglishStrings().option_off);
    setText(refs.uiMinimizeToTrayOn, d.option_on || getEnglishStrings().option_on);
    setText(refs.uiFooterDesc, d.footer_desc || getEnglishStrings().footer_desc);
}

export function applyThemeAndUpdateStrings(context: UITextContext, d: any): void {
    const { refs, getEnglishStrings } = context;
    setText(refs.uiThemeSystem, d.theme_system || getEnglishStrings().theme_system);
    setText(refs.uiThemeDark, d.theme_dark || getEnglishStrings().theme_dark);
    setText(refs.uiThemeLight, d.theme_light || getEnglishStrings().theme_light);
    setText(refs.uiLocationDisplayParent, d.location_display_parent || getEnglishStrings().location_display_parent);
    setText(refs.uiLocationDisplayFull, d.location_display_full || getEnglishStrings().location_display_full);
    setText(refs.uiUpdateAutomatic, d.update_mode_automatic || getEnglishStrings().update_mode_automatic);
    setText(refs.uiUpdateNotify, d.update_mode_notify || getEnglishStrings().update_mode_notify);
    setText(refs.uiUpdateOff, d.update_mode_off || getEnglishStrings().update_mode_off);
    setText(refs.uiPackUpdateAutomatic, d.update_mode_automatic || getEnglishStrings().update_mode_automatic);
    setText(refs.uiPackUpdateNotify, d.update_mode_notify || getEnglishStrings().update_mode_notify);
    setText(refs.uiPackUpdateOff, d.update_mode_off || getEnglishStrings().update_mode_off);
    setText(refs.moreLanguagesBtn, d.settings_more_languages || getEnglishStrings().settings_more_languages);
    setText(refs.uiLanguagePackTitle, d.lang_modal_title || getEnglishStrings().lang_modal_title);

    // Telemetry
    setText(refs.uiTelemetryLabel, d.telemetry_label || getEnglishStrings().telemetry_label);
    setText(refs.uiTelemetryOff, d.telemetry_opt_out || getEnglishStrings().telemetry_opt_out);
    setText(refs.uiTelemetryOn, d.telemetry_opt_in || getEnglishStrings().telemetry_opt_in);
    setText(refs.uiTelemetryModalTitle, d.telemetry_modal_title || getEnglishStrings().telemetry_modal_title);
    setText(refs.uiTelemetryModalDesc, d.telemetry_modal_desc || getEnglishStrings().telemetry_modal_desc);
    setText(refs.btnTelemetryOptIn, d.telemetry_modal_btn_opt_in || getEnglishStrings().telemetry_modal_btn_opt_in);
    setText(refs.btnTelemetryOptOut, d.telemetry_modal_btn_opt_out || getEnglishStrings().telemetry_modal_btn_opt_out);
}

export function applySortAndSearchStrings(context: UITextContext, d: any): void {
    const { refs, getCurrentSort, getPlaceholders, getPlaceholderIndex, updateSearch } = context;
    if (refs.sortMenu) {
        const uiSortDate = refs.sortMenu.querySelector('#ui-sort-date') as HTMLElement;
        const uiSortPlayed = refs.sortMenu.querySelector('#ui-sort-played') as HTMLElement;
        const uiSortAz = refs.sortMenu.querySelector('#ui-sort-az') as HTMLElement;
        const uiSortCustom = refs.sortMenu.querySelector('#ui-sort-custom') as HTMLElement;

        setText(uiSortDate, d.sort_date);
        setText(uiSortPlayed, d.sort_played);
        setText(uiSortAz, d.sort_az);
        setText(uiSortCustom, d.sort_custom);

        refs.sortMenu.querySelectorAll('.sort-item').forEach((el) => el.classList.remove('active'));
        const activeSort = refs.sortMenu.querySelector(`[data-sort="${getCurrentSort()}"]`);
        if (activeSort) activeSort.classList.add('active');
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
                    await electronAPI.invoke('open-external-url', releaseUrl);
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
        (globalThis as any).currentUIStrings = d;
        const defPath = await electronAPI.invoke('get-default-path');
        const isDev = await electronAPI.invoke('is-dev');

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
