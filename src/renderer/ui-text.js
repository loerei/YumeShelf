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
}) {
    function renderAppVersionLink() {
        const appVersion = getLocaleState().appVersion || '';
        const label = `YumeShelf v${appVersion}`.trim();
        const releaseUrl = appVersion
            ? `https://github.com/loerei/YumeShelf/releases/tag/v${appVersion}`
            : '';

        if (navigator.onLine && releaseUrl) {
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

        refs.uiAppVersion.innerText = label;
    }

    async function applyUIStrings() {
        const d = getStrings();
        window.currentUIStrings = d;
        const defPath = await electronAPI.getDefaultPath();
        refs.uiTitle.innerText = d.title;
        refs.uiWelcomeTitle.innerText = d.welcome;
        refs.uiWelcomeDesc.innerText = d.welcome_desc;
        refs.uiOptChoose.innerText = d.opt_choose;
        refs.uiOptChooseDesc.innerText = d.opt_choose_desc;
        refs.uiOptLazy.innerText = d.opt_lazy;
        refs.uiOptLazyDesc.innerText = `${d.opt_lazy_desc_prefix} ${defPath}/!`;
        refs.uiSettingsTitle.innerText = d.settings;
        refs.uiLangLabel.innerText = d.lang;
        refs.uiThemeLabel.innerText = d.theme;
        refs.uiPathLabel.innerText = d.path;
        refs.uiLocationDisplayLabel.innerText = d.location_display_label || getEnglishStrings().location_display_label;
        refs.uiMaxDepthLabel.innerText = d.max_depth_label || getEnglishStrings().max_depth_label;
        refs.uiAppUpdatesLabel.innerText = d.app_updates_label || getEnglishStrings().app_updates_label;
        refs.uiLanguagePackUpdatesLabel.innerText = d.language_pack_updates_label || getEnglishStrings().language_pack_updates_label;
        refs.uiAutoLaunchLabel.innerText = d.auto_launch_label || getEnglishStrings().auto_launch_label;
        refs.uiAutoLaunchOff.innerText = d.option_off || getEnglishStrings().option_off;
        refs.uiAutoLaunchOn.innerText = d.option_on || getEnglishStrings().option_on;
        refs.uiMinimizeToTrayLabel.innerText = d.minimize_to_tray_label || getEnglishStrings().minimize_to_tray_label;
        refs.uiMinimizeToTrayOff.innerText = d.option_off || getEnglishStrings().option_off;
        refs.uiMinimizeToTrayOn.innerText = d.option_on || getEnglishStrings().option_on;
        refs.btnChangePath.innerText = d.change;
        refs.uiFooterDesc.innerText = d.footer_desc || getEnglishStrings().footer_desc;
        renderAppVersionLink();
        refs.uiThemeSystem.innerText = d.theme_system || getEnglishStrings().theme_system;
        refs.uiThemeDark.innerText = d.theme_dark || getEnglishStrings().theme_dark;
        refs.uiThemeLight.innerText = d.theme_light || getEnglishStrings().theme_light;
        refs.uiLocationDisplayParent.innerText = d.location_display_parent || getEnglishStrings().location_display_parent;
        refs.uiLocationDisplayFull.innerText = d.location_display_full || getEnglishStrings().location_display_full;
        refs.uiUpdateAutomatic.innerText = d.update_mode_automatic || getEnglishStrings().update_mode_automatic;
        refs.uiUpdateNotify.innerText = d.update_mode_notify || getEnglishStrings().update_mode_notify;
        refs.uiUpdateOff.innerText = d.update_mode_off || getEnglishStrings().update_mode_off;
        refs.uiPackUpdateAutomatic.innerText = d.update_mode_automatic || getEnglishStrings().update_mode_automatic;
        refs.uiPackUpdateNotify.innerText = d.update_mode_notify || getEnglishStrings().update_mode_notify;
        refs.uiPackUpdateOff.innerText = d.update_mode_off || getEnglishStrings().update_mode_off;
        refs.moreLanguagesBtn.innerText = d.settings_more_languages || getEnglishStrings().settings_more_languages;
        refs.uiLanguagePackTitle.innerText = d.lang_modal_title || getEnglishStrings().lang_modal_title;

        if (refs.sortMenu) {
            refs.uiSortDate.innerText = d.sort_date;
            refs.uiSortPlayed.innerText = d.sort_played;
            refs.uiSortAz.innerText = d.sort_az;
            refs.uiSortCustom.innerText = d.sort_custom;
            refs.sortMenu.querySelectorAll('.sort-item').forEach((el) => el.classList.remove('active'));
            const activeSort = refs.sortMenu.querySelector(`[data-sort="${getCurrentSort()}"]`);
            if (activeSort) activeSort.classList.add('active');
        }

        if (!refs.searchInput.value.trim()) {
            const placeholders = getPlaceholders();
            refs.searchPlaceholder.innerText = placeholders[getPlaceholderIndex() % placeholders.length];
        } else {
            updateSearch(refs.searchInput.value);
        }

        renderLanguagePackResults();
        bootController.render(bootController.getLatestPayload());
    }

    return {
        applyUIStrings,
        refreshAppVersionLink: renderAppVersionLink
    };
}
