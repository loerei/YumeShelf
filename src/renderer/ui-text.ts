import { RendererRefs } from './bootstrap/dom-refs';

export interface UITextControllerOptions {
    bootController: any;
    electronAPI: any;
    getCurrentSort: () => string;
    getEnglishStrings: () => any;
    getLocaleState: () => any;
    getPlaceholderIndex: () => number;
    getPlaceholders: () => string[];
    getStrings: () => any;
    refs: RendererRefs;
    renderLanguagePackResults: () => void;
    updateSearch: (query: string) => void;
}

export interface UITextController {
    applyUIStrings: () => Promise<void>;
    refreshAppVersionLink: () => void;
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

        if (navigator.onLine && releaseUrl && refs.uiTextRefs.uiAppVersion) {
            refs.uiTextRefs.uiAppVersion.innerHTML = `<a class="settings-version-link" href="${releaseUrl}">${label}</a>`;
            const versionLink = refs.uiTextRefs.uiAppVersion.querySelector('a');
            if (versionLink) {
                versionLink.onclick = async (event) => {
                    event.preventDefault();
                    await electronAPI.openExternalUrl(releaseUrl);
                };
            }
            return;
        }

        if (refs.uiTextRefs.uiAppVersion) {
            refs.uiTextRefs.uiAppVersion.innerText = label;
        }
    }

    async function applyUIStrings(): Promise<void> {
        const d = getStrings();
        (window as any).currentUIStrings = d;
        const defPath = await electronAPI.getDefaultPath();
        const isDev = await electronAPI.isDev();
        
        if (refs.uiTextRefs.uiTitle) refs.uiTextRefs.uiTitle.innerText = isDev ? 'YumeShelf (Develop)' : d.title;
        if (refs.uiTextRefs.uiWelcomeTitle) refs.uiTextRefs.uiWelcomeTitle.innerText = d.welcome;
        if (refs.uiTextRefs.uiWelcomeDesc) refs.uiTextRefs.uiWelcomeDesc.innerText = d.welcome_desc;
        if (refs.uiTextRefs.uiOptChoose) refs.uiTextRefs.uiOptChoose.innerText = d.opt_choose;
        if (refs.uiTextRefs.uiOptChooseDesc) refs.uiTextRefs.uiOptChooseDesc.innerText = d.opt_choose_desc;
        if (refs.uiTextRefs.uiOptLazy) refs.uiTextRefs.uiOptLazy.innerText = d.opt_lazy;
        if (refs.uiTextRefs.uiOptLazyDesc) refs.uiTextRefs.uiOptLazyDesc.innerText = `${d.opt_lazy_desc_prefix} ${defPath}/!`;
        if (refs.uiTextRefs.uiSettingsTitle) refs.uiTextRefs.uiSettingsTitle.innerText = d.settings;
        if (refs.uiTextRefs.uiLangLabel) refs.uiTextRefs.uiLangLabel.innerText = d.lang;
        if (refs.uiTextRefs.uiThemeLabel) refs.uiTextRefs.uiThemeLabel.innerText = d.theme;
        if (refs.uiTextRefs.uiPathLabel) refs.uiTextRefs.uiPathLabel.innerText = d.path;
        if (refs.uiTextRefs.uiLocationDisplayLabel) refs.uiTextRefs.uiLocationDisplayLabel.innerText = d.location_display_label || getEnglishStrings().location_display_label;
        if (refs.uiTextRefs.uiMaxDepthLabel) refs.uiTextRefs.uiMaxDepthLabel.innerText = d.max_depth_label || getEnglishStrings().max_depth_label;
        if (refs.uiTextRefs.uiAppUpdatesLabel) refs.uiTextRefs.uiAppUpdatesLabel.innerText = d.app_updates_label || getEnglishStrings().app_updates_label;
        if (refs.uiTextRefs.uiLanguagePackUpdatesLabel) refs.uiTextRefs.uiLanguagePackUpdatesLabel.innerText = d.language_pack_updates_label || getEnglishStrings().language_pack_updates_label;
        if (refs.uiTextRefs.uiAutoLaunchLabel) refs.uiTextRefs.uiAutoLaunchLabel.innerText = d.auto_launch_label || getEnglishStrings().auto_launch_label;
        if (refs.uiTextRefs.uiAutoLaunchOff) refs.uiTextRefs.uiAutoLaunchOff.innerText = d.option_off || getEnglishStrings().option_off;
        if (refs.uiTextRefs.uiAutoLaunchOn) refs.uiTextRefs.uiAutoLaunchOn.innerText = d.option_on || getEnglishStrings().option_on;
        if (refs.uiTextRefs.uiAutoLaunchMinimized) {
            refs.uiTextRefs.uiAutoLaunchMinimized.innerText = d.option_minimized || getEnglishStrings().option_minimized;
        }
        if (refs.uiTextRefs.uiMinimizeToTrayLabel) refs.uiTextRefs.uiMinimizeToTrayLabel.innerText = d.minimize_to_tray_label || getEnglishStrings().minimize_to_tray_label;
        if (refs.uiTextRefs.uiMinimizeToTrayOff) refs.uiTextRefs.uiMinimizeToTrayOff.innerText = d.option_off || getEnglishStrings().option_off;
        if (refs.uiTextRefs.uiMinimizeToTrayOn) refs.uiTextRefs.uiMinimizeToTrayOn.innerText = d.option_on || getEnglishStrings().option_on;
        if (refs.uiTextRefs.btnChangePath) refs.uiTextRefs.btnChangePath.innerText = d.change;
        if (refs.uiTextRefs.uiFooterDesc) refs.uiTextRefs.uiFooterDesc.innerText = d.footer_desc || getEnglishStrings().footer_desc;
        renderAppVersionLink();
        if (refs.uiTextRefs.uiThemeSystem) refs.uiTextRefs.uiThemeSystem.innerText = d.theme_system || getEnglishStrings().theme_system;
        if (refs.uiTextRefs.uiThemeDark) refs.uiTextRefs.uiThemeDark.innerText = d.theme_dark || getEnglishStrings().theme_dark;
        if (refs.uiTextRefs.uiThemeLight) refs.uiTextRefs.uiThemeLight.innerText = d.theme_light || getEnglishStrings().theme_light;
        if (refs.uiTextRefs.uiLocationDisplayParent) refs.uiTextRefs.uiLocationDisplayParent.innerText = d.location_display_parent || getEnglishStrings().location_display_parent;
        if (refs.uiTextRefs.uiLocationDisplayFull) refs.uiTextRefs.uiLocationDisplayFull.innerText = d.location_display_full || getEnglishStrings().location_display_full;
        if (refs.uiTextRefs.uiUpdateAutomatic) refs.uiTextRefs.uiUpdateAutomatic.innerText = d.update_mode_automatic || getEnglishStrings().update_mode_automatic;
        if (refs.uiTextRefs.uiUpdateNotify) refs.uiTextRefs.uiUpdateNotify.innerText = d.update_mode_notify || getEnglishStrings().update_mode_notify;
        if (refs.uiTextRefs.uiUpdateOff) refs.uiTextRefs.uiUpdateOff.innerText = d.update_mode_off || getEnglishStrings().update_mode_off;
        if (refs.uiTextRefs.uiPackUpdateAutomatic) refs.uiTextRefs.uiPackUpdateAutomatic.innerText = d.update_mode_automatic || getEnglishStrings().update_mode_automatic;
        if (refs.uiTextRefs.uiPackUpdateNotify) refs.uiTextRefs.uiPackUpdateNotify.innerText = d.update_mode_notify || getEnglishStrings().update_mode_notify;
        if (refs.uiTextRefs.uiPackUpdateOff) refs.uiTextRefs.uiPackUpdateOff.innerText = d.update_mode_off || getEnglishStrings().update_mode_off;
        if (refs.uiTextRefs.moreLanguagesBtn) refs.uiTextRefs.moreLanguagesBtn.innerText = d.settings_more_languages || getEnglishStrings().settings_more_languages;
        if (refs.uiTextRefs.uiLanguagePackTitle) refs.uiTextRefs.uiLanguagePackTitle.innerText = d.lang_modal_title || getEnglishStrings().lang_modal_title;

        // Telemetry
        if (refs.uiTextRefs.uiTelemetryLabel) refs.uiTextRefs.uiTelemetryLabel.innerText = d.telemetry_label || getEnglishStrings().telemetry_label;
        if (refs.uiTextRefs.uiTelemetryOff) refs.uiTextRefs.uiTelemetryOff.innerText = d.telemetry_opt_out || getEnglishStrings().telemetry_opt_out;
        if (refs.uiTextRefs.uiTelemetryOn) refs.uiTextRefs.uiTelemetryOn.innerText = d.telemetry_opt_in || getEnglishStrings().telemetry_opt_in;
        if (refs.uiTextRefs.uiTelemetryModalTitle) refs.uiTextRefs.uiTelemetryModalTitle.innerText = d.telemetry_modal_title || getEnglishStrings().telemetry_modal_title;
        if (refs.uiTextRefs.uiTelemetryModalDesc) refs.uiTextRefs.uiTelemetryModalDesc.innerText = d.telemetry_modal_desc || getEnglishStrings().telemetry_modal_desc;
        if (refs.uiTextRefs.btnTelemetryOptIn) refs.uiTextRefs.btnTelemetryOptIn.innerText = d.telemetry_modal_btn_opt_in || getEnglishStrings().telemetry_modal_btn_opt_in;
        if (refs.uiTextRefs.btnTelemetryOptOut) refs.uiTextRefs.btnTelemetryOptOut.innerText = d.telemetry_modal_btn_opt_out || getEnglishStrings().telemetry_modal_btn_opt_out;

        if (refs.uiTextRefs.sortMenu) {
            const uiSortDate = refs.uiTextRefs.sortMenu.querySelector('#ui-sort-date') as HTMLElement;
            const uiSortPlayed = refs.uiTextRefs.sortMenu.querySelector('#ui-sort-played') as HTMLElement;
            const uiSortAz = refs.uiTextRefs.sortMenu.querySelector('#ui-sort-az') as HTMLElement;
            const uiSortCustom = refs.uiTextRefs.sortMenu.querySelector('#ui-sort-custom') as HTMLElement;

            if (uiSortDate) uiSortDate.innerText = d.sort_date;
            if (uiSortPlayed) uiSortPlayed.innerText = d.sort_played;
            if (uiSortAz) uiSortAz.innerText = d.sort_az;
            if (uiSortCustom) uiSortCustom.innerText = d.sort_custom;

            refs.uiTextRefs.sortMenu.querySelectorAll('.sort-item').forEach((el) => el.classList.remove('active'));
            const activeSort = refs.uiTextRefs.sortMenu.querySelector(`[data-sort="${getCurrentSort()}"]`);
            if (activeSort) activeSort.classList.add('active');
        }

        if (refs.uiTextRefs.searchInput && refs.uiTextRefs.searchPlaceholder) {
            if (!refs.uiTextRefs.searchInput.value.trim()) {
                const placeholders = getPlaceholders();
                refs.uiTextRefs.searchPlaceholder.innerText = placeholders[getPlaceholderIndex() % placeholders.length];
            } else {
                updateSearch(refs.uiTextRefs.searchInput.value);
            }
        }

        renderLanguagePackResults();
        bootController.render(bootController.getLatestPayload());
    }

    return {
        applyUIStrings,
        refreshAppVersionLink: renderAppVersionLink
    };
}
