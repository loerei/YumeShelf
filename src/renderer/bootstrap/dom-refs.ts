export interface RendererRefs {
    // === Shared / Cross-controller refs ===
    favGrid: HTMLElement | null;
    unfavGrid: HTMLElement | null;
    separator: HTMLElement | null;
    gameGridWrapper: HTMLElement | null;
    langSelect: HTMLSelectElement | null;
    sortMenu: HTMLElement | null;
    sortBtn: HTMLElement | null;
    mascotWidget: HTMLElement | null;
    mascotImg: HTMLImageElement | null;

    // === Boot refs ===
    loading: HTMLElement | null;
    bootProgress: HTMLElement | null;
    bootProgressBar: HTMLElement | null;
    bootTitle: HTMLElement | null;
    bootStatus: HTMLElement | null;
    welcome: HTMLElement | null;
    quickFolder: HTMLElement | null;
    emptyContainer: HTMLElement | null;
    refreshLibraryBtn: HTMLElement | null;
    telemetryModal: HTMLElement | null;

    // === Container refs ===
    containers: {
        settings: HTMLElement | null;
        categoryFilter: HTMLElement | null;
        languagePack: HTMLElement | null;
        duplicateStack: HTMLElement | null;
        search: HTMLElement | null;
    };

    // === Event binding refs ===
    searchInput: HTMLInputElement | null;
    searchDropdown: HTMLElement | null;
    searchPlaceholder: HTMLElement | null;
    languagePackOverlay: HTMLElement | null;
    languagePackListBtn: HTMLElement | null;
    languagePackRefreshBtn: HTMLElement | null;
    languagePackSearch: HTMLInputElement | null;
    themeSelect: HTMLSelectElement | null;
    appUpdatesSelect: HTMLSelectElement | null;
    languagePackUpdatesSelect: HTMLSelectElement | null;
    locationDisplaySelect: HTMLSelectElement | null;
    titleDisplaySelect: HTMLSelectElement | null;
    displayCodesSelect: HTMLSelectElement | null;
    maxDepthInput: HTMLInputElement | null;
    maxDepthIncreaseBtn: HTMLElement | null;
    maxDepthDecreaseBtn: HTMLElement | null;
    autoLaunchSelect: HTMLSelectElement | null;
    minimizeToTraySelect: HTMLSelectElement | null;
    telemetrySelect: HTMLSelectElement | null;
    exposeBetaSelect: HTMLSelectElement | null;
    mascotShowSelect: HTMLSelectElement | null;
    mascotScaleSlider: HTMLInputElement | null;
    mascotScaleValue: HTMLElement | null;
    mascotSoundSelect: HTMLSelectElement | null;
    mascotVolumeSlider: HTMLInputElement | null;
    mascotVolumeValue: HTMLElement | null;
    mascotContextMenu: HTMLElement | null;
    mascotMenuResetBtn: HTMLElement | null;
    mascotMenuSoundSelect: HTMLSelectElement | null;
    mascotMenuScaleSlider: HTMLInputElement | null;
    mascotMenuScaleValue: HTMLElement | null;
    mascotMenuVolumeSlider: HTMLInputElement | null;
    mascotMenuVolumeValue: HTMLElement | null;
    buttons: {
        setupDefault: HTMLElement | null;
        chooseCustom: HTMLElement | null;
        settingsOpen: HTMLElement | null;
        settingsClose: HTMLElement | null;
        languagePackClose: HTMLElement | null;
        telemetryOptIn: HTMLElement | null;
        telemetryOptOut: HTMLElement | null;
    };
    moreLanguagesBtn: HTMLElement | null;
    sortActiveLabel: HTMLElement | null;
    uiTextRefs: {
        moreLanguagesBtn: HTMLElement | null;
        searchInput: HTMLInputElement | null;
        searchPlaceholder: HTMLElement | null;
        sortMenu: HTMLElement | null;
        sortActiveLabel: HTMLElement | null;
        uiExposeBetaLabel: HTMLElement | null;
        uiExposeBetaOff: HTMLElement | null;
        uiExposeBetaOn: HTMLElement | null;
        uiAppUpdatesLabel: HTMLElement | null;
        uiAppVersion: HTMLElement | null;
        uiFooterDesc: HTMLElement | null;
        uiLangLabel: HTMLElement | null;
        uiLanguagePackTitle: HTMLElement | null;
        uiLanguagePackUpdatesLabel: HTMLElement | null;
        uiAutoLaunchLabel: HTMLElement | null;
        uiAutoLaunchOff: HTMLElement | null;
        uiAutoLaunchOn: HTMLElement | null;
        uiAutoLaunchMinimized: HTMLElement | null;
        uiMinimizeToTrayLabel: HTMLElement | null;
        uiMinimizeToTrayOff: HTMLElement | null;
        uiMinimizeToTrayOn: HTMLElement | null;
        uiLocationDisplayFull: HTMLElement | null;
        uiLocationDisplayLabel: HTMLElement | null;
        uiLocationDisplayParent: HTMLElement | null;
        uiMaxDepthLabel: HTMLElement | null;
        uiOptChoose: HTMLElement | null;
        uiOptChooseDesc: HTMLElement | null;
        uiOptLazy: HTMLElement | null;
        uiOptLazyDesc: HTMLElement | null;
        uiPackUpdateAutomatic: HTMLElement | null;
        uiPackUpdateNotify: HTMLElement | null;
        uiPackUpdateOff: HTMLElement | null;
        uiPathLabel: HTMLElement | null;
        uiSettingsTitle: HTMLElement | null;
        uiSortAz: HTMLElement | null;
        uiSortCustom: HTMLElement | null;
        uiSortDate: HTMLElement | null;
        uiSortPlayed: HTMLElement | null;
        uiThemeDark: HTMLElement | null;
        uiThemeLabel: HTMLElement | null;
        uiThemeLight: HTMLElement | null;
        uiThemeSystem: HTMLElement | null;
        uiUpdateAutomatic: HTMLElement | null;
        uiUpdateNotify: HTMLElement | null;
        uiUpdateOff: HTMLElement | null;
        uiTitle: HTMLElement | null;
        uiWelcomeDesc: HTMLElement | null;
        uiWelcomeTitle: HTMLElement | null;
        uiTelemetryLabel: HTMLElement | null;
        uiTelemetryOff: HTMLElement | null;
        uiTelemetryOn: HTMLElement | null;
        uiTelemetryModalTitle: HTMLElement | null;
        uiTelemetryModalDesc: HTMLElement | null;
        btnTelemetryOptIn: HTMLElement | null;
        btnTelemetryOptOut: HTMLElement | null;
    };
}

export function buildRendererRefs(documentRef = document): RendererRefs {
    // === Container refs (passed to Controllers as root elements) ===
    // Each Controller queries its own child elements within its container.
    const settingsContainer = documentRef.getElementById('settings-overlay');
    const languagePackContainer = documentRef.getElementById('language-pack-overlay');
    const searchContainer = documentRef.querySelector<HTMLElement>('.search-container');
    const telemetryModal = documentRef.getElementById('telemetry-modal');

    return {
        // === Shared / Cross-controller refs ===
        favGrid: documentRef.getElementById('fav-grid'),
        unfavGrid: documentRef.getElementById('unfav-grid'),
        separator: documentRef.getElementById('favorites-separator'),
        gameGridWrapper: documentRef.getElementById('game-grid-wrapper'),
        langSelect: documentRef.getElementById('lang-select') as HTMLSelectElement,
        sortMenu: documentRef.getElementById('sort-menu'),
        sortBtn: documentRef.getElementById('sort-btn'),
        mascotWidget: documentRef.getElementById('yume-mascot-widget'),
        mascotImg: documentRef.getElementById('yume-mascot-img') as HTMLImageElement | null,

        // === Boot refs ===
        loading: documentRef.getElementById('loading'),
        bootProgress: documentRef.getElementById('boot-progress'),
        bootProgressBar: documentRef.getElementById('boot-progress-bar'),
        bootTitle: documentRef.getElementById('boot-title'),
        bootStatus: documentRef.getElementById('boot-status'),
        welcome: documentRef.getElementById('welcome-screen'),
        quickFolder: documentRef.getElementById('quick-folder-btn'),
        emptyContainer: documentRef.getElementById('empty-state-container'),
        refreshLibraryBtn: documentRef.getElementById('refresh-library-btn'),
        telemetryModal,
        sortActiveLabel: documentRef.getElementById('sort-active-label'),

        // === Container refs ===
        containers: {
            settings: settingsContainer,
            categoryFilter: documentRef.getElementById('category-filter-container'),
            languagePack: languagePackContainer,
            duplicateStack: documentRef.getElementById('duplicate-stack-overlay'),
            search: searchContainer
        },

        // === Event binding refs ===
        searchInput:    searchContainer ? searchContainer.querySelector('#search-input') as HTMLInputElement : null,
        searchDropdown: searchContainer ? searchContainer.querySelector('#search-dropdown') : null,
        searchPlaceholder: searchContainer ? searchContainer.querySelector('#search-placeholder') : null,

        // Language pack overlay (from #language-pack-overlay)
        languagePackOverlay:     languagePackContainer,
        languagePackListBtn:     languagePackContainer ? languagePackContainer.querySelector('#language-pack-list-btn') : null,
        languagePackRefreshBtn:  languagePackContainer ? languagePackContainer.querySelector('#language-pack-refresh-btn') : null,
        languagePackSearch:      languagePackContainer ? languagePackContainer.querySelector('#language-pack-search') as HTMLInputElement : null,

        // Settings (from #settings-overlay)
        themeSelect:             settingsContainer ? settingsContainer.querySelector('#theme-select') as HTMLSelectElement : null,
        appUpdatesSelect:        settingsContainer ? settingsContainer.querySelector('#app-updates-select') as HTMLSelectElement : null,
        languagePackUpdatesSelect: settingsContainer ? settingsContainer.querySelector('#language-pack-updates-select') as HTMLSelectElement : null,
        locationDisplaySelect:   settingsContainer ? settingsContainer.querySelector('#location-display-select') as HTMLSelectElement : null,
        titleDisplaySelect:      settingsContainer ? settingsContainer.querySelector('#title-display-select') as HTMLSelectElement : null,
        displayCodesSelect:      settingsContainer ? settingsContainer.querySelector('#display-codes-select') as HTMLSelectElement : null,
        maxDepthInput:           settingsContainer ? settingsContainer.querySelector('#max-depth-input') as HTMLInputElement : null,
        maxDepthIncreaseBtn:     settingsContainer ? settingsContainer.querySelector('#max-depth-increase-btn') : null,
        maxDepthDecreaseBtn:     settingsContainer ? settingsContainer.querySelector('#max-depth-decrease-btn') : null,
        autoLaunchSelect:        settingsContainer ? settingsContainer.querySelector('#auto-launch-select') as HTMLSelectElement : null,
        minimizeToTraySelect:    settingsContainer ? settingsContainer.querySelector('#minimize-to-tray-select') as HTMLSelectElement : null,
        telemetrySelect:         settingsContainer ? settingsContainer.querySelector('#telemetry-select') as HTMLSelectElement : null,
        exposeBetaSelect:        settingsContainer ? settingsContainer.querySelector('#expose-beta-select') as HTMLSelectElement : null,
        mascotShowSelect:        settingsContainer ? settingsContainer.querySelector('#mascot-show-select') as HTMLSelectElement : null,
        mascotScaleSlider:       settingsContainer ? settingsContainer.querySelector('#mascot-scale-slider') as HTMLInputElement : null,
        mascotScaleValue:        settingsContainer ? settingsContainer.querySelector('#mascot-scale-value') : null,
        mascotSoundSelect:       settingsContainer ? settingsContainer.querySelector('#mascot-sound-select') as HTMLSelectElement : null,
        mascotVolumeSlider:      settingsContainer ? settingsContainer.querySelector('#mascot-volume-slider') as HTMLInputElement : null,
        mascotVolumeValue:       settingsContainer ? settingsContainer.querySelector('#mascot-volume-value') : null,
        mascotContextMenu:       documentRef.getElementById('mascot-context-menu'),
        mascotMenuResetBtn:      documentRef.getElementById('mascot-menu-reset-btn'),
        mascotMenuSoundSelect:   documentRef.getElementById('mascot-menu-sound-select') as HTMLSelectElement | null,
        mascotMenuScaleSlider:   documentRef.getElementById('mascot-menu-scale-slider') as HTMLInputElement | null,
        mascotMenuScaleValue:    documentRef.getElementById('mascot-menu-scale-value'),
        mascotMenuVolumeSlider:  documentRef.getElementById('mascot-menu-volume-slider') as HTMLInputElement | null,
        mascotMenuVolumeValue:   documentRef.getElementById('mascot-menu-volume-value'),

        // === Button refs ===
        buttons: {
            setupDefault:    documentRef.getElementById('btn-setup-default'),
            chooseCustom:    documentRef.getElementById('btn-choose-custom') || documentRef.getElementById('btn-setup-custom'),
            settingsOpen:    documentRef.getElementById('settings-open-btn') || documentRef.getElementById('settings-btn'),
            settingsClose:   settingsContainer ? settingsContainer.querySelector('#settings-close-btn') : null,
            languagePackClose: languagePackContainer ? languagePackContainer.querySelector('#language-pack-close-btn') : null,
            telemetryOptIn:  telemetryModal ? telemetryModal.querySelector('#telemetry-opt-in-btn') : null,
            telemetryOptOut: telemetryModal ? telemetryModal.querySelector('#telemetry-opt-out-btn') : null
        },

        moreLanguagesBtn: languagePackContainer ? languagePackContainer.querySelector('#more-languages-btn') : null,

        // === Static i18n text node refs ===
        uiTextRefs: {
            moreLanguagesBtn: languagePackContainer ? languagePackContainer.querySelector('#more-languages-btn') : null,
            searchInput: searchContainer ? searchContainer.querySelector('#search-input') as HTMLInputElement : null,
            searchPlaceholder: searchContainer ? searchContainer.querySelector('#search-placeholder') : null,
            sortMenu: documentRef.getElementById('sort-menu'),
            sortActiveLabel: documentRef.getElementById('sort-active-label'),
            uiExposeBetaLabel: settingsContainer ? settingsContainer.querySelector('#ui-expose-beta-label') : null,
            uiExposeBetaOff: settingsContainer ? settingsContainer.querySelector('#ui-expose-beta-off') : null,
            uiExposeBetaOn: settingsContainer ? settingsContainer.querySelector('#ui-expose-beta-on') : null,
            uiAppUpdatesLabel: settingsContainer ? settingsContainer.querySelector('#ui-app-updates-label') : null,
            uiAppVersion: settingsContainer ? settingsContainer.querySelector('#ui-app-version') : null,
            uiFooterDesc: settingsContainer ? settingsContainer.querySelector('#ui-footer-desc') : null,
            uiLangLabel: settingsContainer ? settingsContainer.querySelector('#ui-lang-label') : null,
            uiLanguagePackTitle: languagePackContainer ? languagePackContainer.querySelector('#ui-language-pack-title') : null,
            uiLanguagePackUpdatesLabel: settingsContainer ? settingsContainer.querySelector('#ui-language-pack-updates-label') : null,
            uiAutoLaunchLabel: settingsContainer ? settingsContainer.querySelector('#ui-auto-launch-label') : null,
            uiAutoLaunchOff: settingsContainer ? settingsContainer.querySelector('#ui-auto-launch-off') : null,
            uiAutoLaunchOn: settingsContainer ? settingsContainer.querySelector('#ui-auto-launch-on') : null,
            uiAutoLaunchMinimized: settingsContainer ? settingsContainer.querySelector('#ui-auto-launch-minimized') : null,
            uiMinimizeToTrayLabel: settingsContainer ? settingsContainer.querySelector('#ui-minimize-to-tray-label') : null,
            uiMinimizeToTrayOff: settingsContainer ? settingsContainer.querySelector('#ui-minimize-to-tray-off') : null,
            uiMinimizeToTrayOn: settingsContainer ? settingsContainer.querySelector('#ui-minimize-to-tray-on') : null,
            uiLocationDisplayFull: settingsContainer ? settingsContainer.querySelector('#ui-location-display-full') : null,
            uiLocationDisplayLabel: settingsContainer ? settingsContainer.querySelector('#ui-location-display-label') : null,
            uiLocationDisplayParent: settingsContainer ? settingsContainer.querySelector('#ui-location-display-parent') : null,
            uiMaxDepthLabel: settingsContainer ? settingsContainer.querySelector('#ui-max-depth-label') : null,
            uiOptChoose: documentRef.getElementById('ui-opt-choose'),
            uiOptChooseDesc: documentRef.getElementById('ui-opt-choose-desc'),
            uiOptLazy: documentRef.getElementById('ui-opt-lazy'),
            uiOptLazyDesc: documentRef.getElementById('ui-opt-lazy-desc'),
            uiPackUpdateAutomatic: settingsContainer ? settingsContainer.querySelector('#ui-pack-update-automatic') : null,
            uiPackUpdateNotify: settingsContainer ? settingsContainer.querySelector('#ui-pack-update-notify') : null,
            uiPackUpdateOff: settingsContainer ? settingsContainer.querySelector('#ui-pack-update-off') : null,
            uiPathLabel: settingsContainer ? settingsContainer.querySelector('#ui-path-label') : null,
            uiSettingsTitle: settingsContainer ? settingsContainer.querySelector('#ui-settings-title') : null,
            uiSortAz: documentRef.getElementById('ui-sort-az'),
            uiSortCustom: documentRef.getElementById('ui-sort-custom'),
            uiSortDate: documentRef.getElementById('ui-sort-date'),
            uiSortPlayed: documentRef.getElementById('ui-sort-played'),
            uiThemeDark: settingsContainer ? settingsContainer.querySelector('#ui-theme-dark') : null,
            uiThemeLabel: settingsContainer ? settingsContainer.querySelector('#ui-theme-label') : null,
            uiThemeLight: settingsContainer ? settingsContainer.querySelector('#ui-theme-light') : null,
            uiThemeSystem: settingsContainer ? settingsContainer.querySelector('#ui-theme-system') : null,
            uiUpdateAutomatic: settingsContainer ? settingsContainer.querySelector('#ui-update-automatic') : null,
            uiUpdateNotify: settingsContainer ? settingsContainer.querySelector('#ui-update-notify') : null,
            uiUpdateOff: settingsContainer ? settingsContainer.querySelector('#ui-update-off') : null,
            uiTitle: documentRef.getElementById('ui-title'),
            uiWelcomeDesc: documentRef.getElementById('ui-welcome-desc'),
            uiWelcomeTitle: documentRef.getElementById('ui-welcome-title'),
            uiTelemetryLabel: settingsContainer ? settingsContainer.querySelector('#ui-telemetry-label') : null,
            uiTelemetryOff: settingsContainer ? settingsContainer.querySelector('#ui-telemetry-off') : null,
            uiTelemetryOn: settingsContainer ? settingsContainer.querySelector('#ui-telemetry-on') : null,
            uiTelemetryModalTitle: telemetryModal ? telemetryModal.querySelector('#ui-telemetry-modal-title') : null,
            uiTelemetryModalDesc: telemetryModal ? telemetryModal.querySelector('#ui-telemetry-modal-desc') : null,
            btnTelemetryOptIn: telemetryModal ? telemetryModal.querySelector('#btn-telemetry-opt-in') : null,
            btnTelemetryOptOut: telemetryModal ? telemetryModal.querySelector('#btn-telemetry-opt-out') : null
        }
    };
}
