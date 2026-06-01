export interface RendererRefs {
    favGrid: HTMLElement | null;
    unfavGrid: HTMLElement | null;
    separator: HTMLElement | null;
    gameGridWrapper: HTMLElement | null;
    langSelect: HTMLSelectElement | null;
    sortMenu: HTMLElement | null;
    sortBtn: HTMLElement | null;
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
    containers: {
        settings: HTMLElement | null;
        categoryFilter: HTMLElement | null;
        languagePack: HTMLElement | null;
        duplicateStack: HTMLElement | null;
        search: Element | null;
    };
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
    maxDepthInput: HTMLInputElement | null;
    maxDepthIncreaseBtn: HTMLElement | null;
    maxDepthDecreaseBtn: HTMLElement | null;
    autoLaunchSelect: HTMLSelectElement | null;
    minimizeToTraySelect: HTMLSelectElement | null;
    telemetrySelect: HTMLSelectElement | null;
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
    uiTextRefs: {
        moreLanguagesBtn: HTMLElement | null;
        searchInput: HTMLInputElement | null;
        searchPlaceholder: HTMLElement | null;
        sortMenu: HTMLElement | null;
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
    const searchContainer = documentRef.querySelector('.search-container');
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
        maxDepthInput:           settingsContainer ? settingsContainer.querySelector('#max-depth-input') as HTMLInputElement : null,
        maxDepthIncreaseBtn:     settingsContainer ? settingsContainer.querySelector('#max-depth-increase-btn') : null,
        maxDepthDecreaseBtn:     settingsContainer ? settingsContainer.querySelector('#max-depth-decrease-btn') : null,
        autoLaunchSelect:        settingsContainer ? settingsContainer.querySelector('#auto-launch-select') as HTMLSelectElement : null,
        minimizeToTraySelect:    settingsContainer ? settingsContainer.querySelector('#minimize-to-tray-select') as HTMLSelectElement : null,
        telemetrySelect:         settingsContainer ? settingsContainer.querySelector('#telemetry-select') as HTMLSelectElement : null,

        // === Button refs ===
        buttons: {
            setupDefault:    documentRef.getElementById('btn-setup-default'),
            chooseCustom:    documentRef.getElementById('btn-choose-custom'),
            settingsOpen:    documentRef.getElementById('settings-open-btn'),
            settingsClose:   documentRef.getElementById('settings-close-btn'),
            languagePackClose: documentRef.getElementById('language-pack-close-btn'),
            telemetryOptIn:  documentRef.getElementById('btn-telemetry-opt-in'),
            telemetryOptOut: documentRef.getElementById('btn-telemetry-opt-out')
        },

        // === UI Text refs ===
        moreLanguagesBtn: documentRef.getElementById('more-languages-btn'),
        uiTextRefs: {
            moreLanguagesBtn:          documentRef.getElementById('more-languages-btn'),
            searchInput:               searchContainer ? searchContainer.querySelector('#search-input') as HTMLInputElement : null,
            searchPlaceholder:         searchContainer ? searchContainer.querySelector('#search-placeholder') : null,
            sortMenu:                  documentRef.getElementById('sort-menu'),
            uiAppUpdatesLabel:         documentRef.getElementById('ui-app-updates-label'),
            uiAppVersion:              documentRef.getElementById('ui-app-version'),
            uiFooterDesc:              documentRef.getElementById('ui-footer-desc'),
            uiLangLabel:               documentRef.getElementById('ui-lang-label'),
            uiLanguagePackTitle:       documentRef.getElementById('ui-language-pack-title'),
            uiLanguagePackUpdatesLabel: documentRef.getElementById('ui-language-pack-updates-label'),
            uiAutoLaunchLabel:         documentRef.getElementById('ui-auto-launch-label'),
            uiAutoLaunchOff:           documentRef.getElementById('ui-auto-launch-off'),
            uiAutoLaunchOn:            documentRef.getElementById('ui-auto-launch-on'),
            uiAutoLaunchMinimized:     documentRef.getElementById('ui-auto-launch-minimized'),
            uiMinimizeToTrayLabel:     documentRef.getElementById('ui-minimize-to-tray-label'),
            uiMinimizeToTrayOff:       documentRef.getElementById('ui-minimize-to-tray-off'),
            uiMinimizeToTrayOn:        documentRef.getElementById('ui-minimize-to-tray-on'),
            uiLocationDisplayFull:     documentRef.getElementById('ui-location-display-full'),
            uiLocationDisplayLabel:    documentRef.getElementById('ui-location-display-label'),
            uiLocationDisplayParent:   documentRef.getElementById('ui-location-display-parent'),
            uiMaxDepthLabel:           documentRef.getElementById('ui-max-depth-label'),
            uiOptChoose:               documentRef.getElementById('ui-opt-choose'),
            uiOptChooseDesc:           documentRef.getElementById('ui-opt-choose-desc'),
            uiOptLazy:                 documentRef.getElementById('ui-opt-lazy'),
            uiOptLazyDesc:             documentRef.getElementById('ui-opt-lazy-desc'),
            uiPackUpdateAutomatic:     documentRef.getElementById('ui-pack-update-automatic'),
            uiPackUpdateNotify:        documentRef.getElementById('ui-pack-update-notify'),
            uiPackUpdateOff:           documentRef.getElementById('ui-pack-update-off'),
            uiPathLabel:               documentRef.getElementById('ui-path-label'),
            uiSettingsTitle:           documentRef.getElementById('ui-settings-title'),
            uiSortAz:                  documentRef.getElementById('ui-sort-az'),
            uiSortCustom:              documentRef.getElementById('ui-sort-custom'),
            uiSortDate:                documentRef.getElementById('ui-sort-date'),
            uiSortPlayed:              documentRef.getElementById('ui-sort-played'),
            uiThemeDark:               documentRef.getElementById('ui-theme-dark'),
            uiThemeLabel:              documentRef.getElementById('ui-theme-label'),
            uiThemeLight:              documentRef.getElementById('ui-theme-light'),
            uiThemeSystem:             documentRef.getElementById('ui-theme-system'),
            uiUpdateAutomatic:         documentRef.getElementById('ui-update-automatic'),
            uiUpdateNotify:            documentRef.getElementById('ui-update-notify'),
            uiUpdateOff:               documentRef.getElementById('ui-update-off'),
            uiTitle:                   documentRef.getElementById('ui-title'),
            uiWelcomeDesc:             documentRef.getElementById('ui-welcome-desc'),
            uiWelcomeTitle:            documentRef.getElementById('ui-welcome-title'),
            uiTelemetryLabel:          documentRef.getElementById('ui-telemetry-label'),
            uiTelemetryOff:            documentRef.getElementById('ui-telemetry-off'),
            uiTelemetryOn:             documentRef.getElementById('ui-telemetry-on'),
            uiTelemetryModalTitle:     documentRef.getElementById('ui-telemetry-modal-title'),
            uiTelemetryModalDesc:      documentRef.getElementById('ui-telemetry-modal-desc'),
            btnTelemetryOptIn:         documentRef.getElementById('btn-telemetry-opt-in'),
            btnTelemetryOptOut:        documentRef.getElementById('btn-telemetry-opt-out')
        }
    };
}
