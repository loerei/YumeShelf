export function buildRendererRefs(documentRef = document) {
    // === Container refs (truyền vào Controller làm root element) ===
    // Mỗi Controller tự querySelector các phần tử con bên trong container của mình.
    const settingsContainer = documentRef.getElementById('settings-overlay');
    const languagePackContainer = documentRef.getElementById('language-pack-overlay');
    const searchContainer = documentRef.querySelector('.search-container');

    return {
        // === Shared / Cross-controller refs (dùng bởi nhiều controller + event binding) ===
        favGrid: documentRef.getElementById('fav-grid'),
        unfavGrid: documentRef.getElementById('unfav-grid'),
        separator: documentRef.getElementById('favorites-separator'),
        gameGridWrapper: documentRef.getElementById('game-grid-wrapper'),
        langSelect: documentRef.getElementById('lang-select'),
        sortMenu: documentRef.getElementById('sort-menu'),
        sortBtn: documentRef.getElementById('sort-btn'),

        // === Boot refs (root DOM, không có container riêng) ===
        loading: documentRef.getElementById('loading'),
        bootProgress: documentRef.getElementById('boot-progress'),
        bootProgressBar: documentRef.getElementById('boot-progress-bar'),
        bootTitle: documentRef.getElementById('boot-title'),
        bootStatus: documentRef.getElementById('boot-status'),
        welcome: documentRef.getElementById('welcome-screen'),
        quickFolder: documentRef.getElementById('quick-folder-btn'),
        emptyContainer: documentRef.getElementById('empty-state-container'),
        refreshLibraryBtn: documentRef.getElementById('refresh-library-btn'),

        // === Container refs ===
        containers: {
            settings: settingsContainer,
            categoryFilter: documentRef.getElementById('category-filter-container'),
            languagePack: languagePackContainer,
            duplicateStack: documentRef.getElementById('duplicate-stack-overlay'),
            search: searchContainer
        },

        // === Event binding refs ===
        // Convenience refs cho global-events.js (event wiring layer).
        // Lấy từ container để tránh lặp getElementById nhưng vẫn expose flat cho bindControlEvents.

        // Search (from .search-container)
        searchInput:    searchContainer ? searchContainer.querySelector('#search-input') : null,
        searchDropdown: searchContainer ? searchContainer.querySelector('#search-dropdown') : null,
        searchPlaceholder: searchContainer ? searchContainer.querySelector('#search-placeholder') : null,

        // Language pack overlay (from #language-pack-overlay)
        languagePackOverlay:     languagePackContainer,
        languagePackListBtn:     languagePackContainer ? languagePackContainer.querySelector('#language-pack-list-btn') : null,
        languagePackRefreshBtn:  languagePackContainer ? languagePackContainer.querySelector('#language-pack-refresh-btn') : null,
        languagePackSearch:      languagePackContainer ? languagePackContainer.querySelector('#language-pack-search') : null,

        // Settings (from #settings-overlay)
        themeSelect:             settingsContainer ? settingsContainer.querySelector('#theme-select') : null,
        appUpdatesSelect:        settingsContainer ? settingsContainer.querySelector('#app-updates-select') : null,
        languagePackUpdatesSelect: settingsContainer ? settingsContainer.querySelector('#language-pack-updates-select') : null,
        locationDisplaySelect:   settingsContainer ? settingsContainer.querySelector('#location-display-select') : null,
        maxDepthInput:           settingsContainer ? settingsContainer.querySelector('#max-depth-input') : null,
        maxDepthIncreaseBtn:     settingsContainer ? settingsContainer.querySelector('#max-depth-increase-btn') : null,
        maxDepthDecreaseBtn:     settingsContainer ? settingsContainer.querySelector('#max-depth-decrease-btn') : null,
        autoLaunchSelect:        settingsContainer ? settingsContainer.querySelector('#auto-launch-select') : null,
        minimizeToTraySelect:    settingsContainer ? settingsContainer.querySelector('#minimize-to-tray-select') : null,

        // === Button refs ===
        buttons: {
            setupDefault:    documentRef.getElementById('btn-setup-default'),
            chooseCustom:    documentRef.getElementById('btn-choose-custom'),
            changePath:      documentRef.getElementById('btn-change-path'),
            settingsOpen:    documentRef.getElementById('settings-open-btn'),
            settingsClose:   documentRef.getElementById('settings-close-btn'),
            languagePackClose: documentRef.getElementById('language-pack-close-btn')
        },

        // === UI Text refs ===
        // Truyền vào uiTextController để cập nhật nội dung văn bản toàn trang.
        moreLanguagesBtn: documentRef.getElementById('more-languages-btn'),
        uiTextRefs: {
            btnChangePath:             documentRef.getElementById('btn-change-path'),
            moreLanguagesBtn:          documentRef.getElementById('more-languages-btn'),
            searchInput:               searchContainer ? searchContainer.querySelector('#search-input') : null,
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
            uiWelcomeTitle:            documentRef.getElementById('ui-welcome-title')
        }
    };
}
