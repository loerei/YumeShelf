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
    refs: RendererRefs['uiTextRefs'];
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
        
        if (refs.uiTitle) refs.uiTitle.innerText = isDev ? 'YumeShelf (Develop)' : d.title;
        if (refs.uiWelcomeTitle) refs.uiWelcomeTitle.innerText = d.welcome;
        if (refs.uiWelcomeDesc) refs.uiWelcomeDesc.innerText = d.welcome_desc;
        if (refs.uiOptChoose) refs.uiOptChoose.innerText = d.opt_choose;
        if (refs.uiOptChooseDesc) refs.uiOptChooseDesc.innerText = d.opt_choose_desc;
        if (refs.uiOptLazy) refs.uiOptLazy.innerText = d.opt_lazy;
        if (refs.uiOptLazyDesc) refs.uiOptLazyDesc.innerText = `${d.opt_lazy_desc_prefix} ${defPath}/!`;
        if (refs.uiSettingsTitle) refs.uiSettingsTitle.innerText = d.settings;
        if (refs.uiLangLabel) refs.uiLangLabel.innerText = d.lang;
        if (refs.uiThemeLabel) refs.uiThemeLabel.innerText = d.theme;
        if (refs.uiPathLabel) refs.uiPathLabel.innerText = d.path;
        if (refs.uiLocationDisplayLabel) refs.uiLocationDisplayLabel.innerText = d.location_display_label || getEnglishStrings().location_display_label;
        if (refs.uiMaxDepthLabel) refs.uiMaxDepthLabel.innerText = d.max_depth_label || getEnglishStrings().max_depth_label;
        if (refs.uiAppUpdatesLabel) refs.uiAppUpdatesLabel.innerText = d.app_updates_label || getEnglishStrings().app_updates_label;
        if (refs.uiLanguagePackUpdatesLabel) refs.uiLanguagePackUpdatesLabel.innerText = d.language_pack_updates_label || getEnglishStrings().language_pack_updates_label;
        if (refs.uiAutoLaunchLabel) refs.uiAutoLaunchLabel.innerText = d.auto_launch_label || getEnglishStrings().auto_launch_label;
        if (refs.uiAutoLaunchOff) refs.uiAutoLaunchOff.innerText = d.option_off || getEnglishStrings().option_off;
        if (refs.uiAutoLaunchOn) refs.uiAutoLaunchOn.innerText = d.option_on || getEnglishStrings().option_on;
        if (refs.uiAutoLaunchMinimized) {
            refs.uiAutoLaunchMinimized.innerText = d.option_minimized || getEnglishStrings().option_minimized;
        }
        if (refs.uiMinimizeToTrayLabel) refs.uiMinimizeToTrayLabel.innerText = d.minimize_to_tray_label || getEnglishStrings().minimize_to_tray_label;
        if (refs.uiMinimizeToTrayOff) refs.uiMinimizeToTrayOff.innerText = d.option_off || getEnglishStrings().option_off;
        if (refs.uiMinimizeToTrayOn) refs.uiMinimizeToTrayOn.innerText = d.option_on || getEnglishStrings().option_on;
        if (refs.btnChangePath) refs.btnChangePath.innerText = d.change;
        if (refs.uiFooterDesc) refs.uiFooterDesc.innerText = d.footer_desc || getEnglishStrings().footer_desc;
        renderAppVersionLink();
        if (refs.uiThemeSystem) refs.uiThemeSystem.innerText = d.theme_system || getEnglishStrings().theme_system;
        if (refs.uiThemeDark) refs.uiThemeDark.innerText = d.theme_dark || getEnglishStrings().theme_dark;
        if (refs.uiThemeLight) refs.uiThemeLight.innerText = d.theme_light || getEnglishStrings().theme_light;
        if (refs.uiLocationDisplayParent) refs.uiLocationDisplayParent.innerText = d.location_display_parent || getEnglishStrings().location_display_parent;
        if (refs.uiLocationDisplayFull) refs.uiLocationDisplayFull.innerText = d.location_display_full || getEnglishStrings().location_display_full;
        if (refs.uiUpdateAutomatic) refs.uiUpdateAutomatic.innerText = d.update_mode_automatic || getEnglishStrings().update_mode_automatic;
        if (refs.uiUpdateNotify) refs.uiUpdateNotify.innerText = d.update_mode_notify || getEnglishStrings().update_mode_notify;
        if (refs.uiUpdateOff) refs.uiUpdateOff.innerText = d.update_mode_off || getEnglishStrings().update_mode_off;
        if (refs.uiPackUpdateAutomatic) refs.uiPackUpdateAutomatic.innerText = d.update_mode_automatic || getEnglishStrings().update_mode_automatic;
        if (refs.uiPackUpdateNotify) refs.uiPackUpdateNotify.innerText = d.update_mode_notify || getEnglishStrings().update_mode_notify;
        if (refs.uiPackUpdateOff) refs.uiPackUpdateOff.innerText = d.update_mode_off || getEnglishStrings().update_mode_off;
        if (refs.moreLanguagesBtn) refs.moreLanguagesBtn.innerText = d.settings_more_languages || getEnglishStrings().settings_more_languages;
        if (refs.uiLanguagePackTitle) refs.uiLanguagePackTitle.innerText = d.lang_modal_title || getEnglishStrings().lang_modal_title;

        // Telemetry
        if (refs.uiTelemetryLabel) refs.uiTelemetryLabel.innerText = d.telemetry_label || getEnglishStrings().telemetry_label;
        if (refs.uiTelemetryOff) refs.uiTelemetryOff.innerText = d.telemetry_opt_out || getEnglishStrings().telemetry_opt_out;
        if (refs.uiTelemetryOn) refs.uiTelemetryOn.innerText = d.telemetry_opt_in || getEnglishStrings().telemetry_opt_in;
        if (refs.uiTelemetryModalTitle) refs.uiTelemetryModalTitle.innerText = d.telemetry_modal_title || getEnglishStrings().telemetry_modal_title;
        if (refs.uiTelemetryModalDesc) refs.uiTelemetryModalDesc.innerText = d.telemetry_modal_desc || getEnglishStrings().telemetry_modal_desc;
        if (refs.btnTelemetryOptIn) refs.btnTelemetryOptIn.innerText = d.telemetry_modal_btn_opt_in || getEnglishStrings().telemetry_modal_btn_opt_in;
        if (refs.btnTelemetryOptOut) refs.btnTelemetryOptOut.innerText = d.telemetry_modal_btn_opt_out || getEnglishStrings().telemetry_modal_btn_opt_out;

        if (refs.sortMenu) {
            const uiSortDate = refs.sortMenu.querySelector('#ui-sort-date') as HTMLElement;
            const uiSortPlayed = refs.sortMenu.querySelector('#ui-sort-played') as HTMLElement;
            const uiSortAz = refs.sortMenu.querySelector('#ui-sort-az') as HTMLElement;
            const uiSortCustom = refs.sortMenu.querySelector('#ui-sort-custom') as HTMLElement;

            if (uiSortDate) uiSortDate.innerText = d.sort_date;
            if (uiSortPlayed) uiSortPlayed.innerText = d.sort_played;
            if (uiSortAz) uiSortAz.innerText = d.sort_az;
            if (uiSortCustom) uiSortCustom.innerText = d.sort_custom;

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

        renderLanguagePackResults();
        bootController.render(bootController.getLatestPayload());
    }

    return {
        applyUIStrings,
        refreshAppVersionLink: renderAppVersionLink
    };
}
