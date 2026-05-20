"""
Refactor script: dom-refs.js -> Container-level Componentization
Chạy: python scripts/refactor-dom-refs.py
"""

import os

TARGET = os.path.join(os.path.dirname(__file__), '..', 'src', 'renderer', 'bootstrap', 'dom-refs.js')

NEW_CONTENT = r"""export function buildRendererRefs(documentRef = document) {
    return {
        // === Shared / Cross-controller refs (dùng bởi nhiều controller) ===
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

        // === Container refs (truyền vào Controller làm root element) ===
        // Mỗi Controller tự querySelector các phần tử con bên trong container của mình.
        containers: {
            settings: documentRef.getElementById('settings-overlay'),
            categoryFilter: documentRef.getElementById('category-filter-container'),
            languagePack: documentRef.getElementById('language-pack-overlay'),
            duplicateStack: documentRef.getElementById('duplicate-stack-overlay'),
            search: documentRef.querySelector('.search-container'),
        },

        // === UI Text refs (30+ phần tử văn bản rải rác toàn trang) ===
        uiTextRefs: {
            btnChangePath: documentRef.getElementById('btn-change-path'),
            moreLanguagesBtn: documentRef.getElementById('more-languages-btn'),
            searchInput: documentRef.getElementById('search-input'),
            searchPlaceholder: documentRef.getElementById('search-placeholder'),
            sortMenu: documentRef.getElementById('sort-menu'),
            uiAppUpdatesLabel: documentRef.getElementById('ui-app-updates-label'),
            uiAppVersion: documentRef.getElementById('ui-app-version'),
            uiFooterDesc: documentRef.getElementById('ui-footer-desc'),
            uiLangLabel: documentRef.getElementById('ui-lang-label'),
            uiLanguagePackTitle: documentRef.getElementById('ui-language-pack-title'),
            uiLanguagePackUpdatesLabel: documentRef.getElementById('ui-language-pack-updates-label'),
            uiAutoLaunchLabel: documentRef.getElementById('ui-auto-launch-label'),
            uiAutoLaunchOff: documentRef.getElementById('ui-auto-launch-off'),
            uiAutoLaunchOn: documentRef.getElementById('ui-auto-launch-on'),
            uiAutoLaunchMinimized: documentRef.getElementById('ui-auto-launch-minimized'),
            uiMinimizeToTrayLabel: documentRef.getElementById('ui-minimize-to-tray-label'),
            uiMinimizeToTrayOff: documentRef.getElementById('ui-minimize-to-tray-off'),
            uiMinimizeToTrayOn: documentRef.getElementById('ui-minimize-to-tray-on'),
            uiLocationDisplayFull: documentRef.getElementById('ui-location-display-full'),
            uiLocationDisplayLabel: documentRef.getElementById('ui-location-display-label'),
            uiLocationDisplayParent: documentRef.getElementById('ui-location-display-parent'),
            uiMaxDepthLabel: documentRef.getElementById('ui-max-depth-label'),
            uiOptChoose: documentRef.getElementById('ui-opt-choose'),
            uiOptChooseDesc: documentRef.getElementById('ui-opt-choose-desc'),
            uiOptLazy: documentRef.getElementById('ui-opt-lazy'),
            uiOptLazyDesc: documentRef.getElementById('ui-opt-lazy-desc'),
            uiPackUpdateAutomatic: documentRef.getElementById('ui-pack-update-automatic'),
            uiPackUpdateNotify: documentRef.getElementById('ui-pack-update-notify'),
            uiPackUpdateOff: documentRef.getElementById('ui-pack-update-off'),
            uiPathLabel: documentRef.getElementById('ui-path-label'),
            uiSettingsTitle: documentRef.getElementById('ui-settings-title'),
            uiSortAz: documentRef.getElementById('ui-sort-az'),
            uiSortCustom: documentRef.getElementById('ui-sort-custom'),
            uiSortDate: documentRef.getElementById('ui-sort-date'),
            uiSortPlayed: documentRef.getElementById('ui-sort-played'),
            uiThemeDark: documentRef.getElementById('ui-theme-dark'),
            uiThemeLabel: documentRef.getElementById('ui-theme-label'),
            uiThemeLight: documentRef.getElementById('ui-theme-light'),
            uiThemeSystem: documentRef.getElementById('ui-theme-system'),
            uiUpdateAutomatic: documentRef.getElementById('ui-update-automatic'),
            uiUpdateNotify: documentRef.getElementById('ui-update-notify'),
            uiUpdateOff: documentRef.getElementById('ui-update-off'),
            uiTitle: documentRef.getElementById('ui-title'),
            uiWelcomeDesc: documentRef.getElementById('ui-welcome-desc'),
            uiWelcomeTitle: documentRef.getElementById('ui-welcome-title')
        },

        // === Button refs (chia sẻ bởi nhiều controller) ===
        buttons: {
            setupDefault: documentRef.getElementById('btn-setup-default'),
            chooseCustom: documentRef.getElementById('btn-choose-custom'),
            changePath: documentRef.getElementById('btn-change-path'),
            settingsOpen: documentRef.getElementById('settings-open-btn'),
            settingsClose: documentRef.getElementById('settings-close-btn'),
            languagePackClose: documentRef.getElementById('language-pack-close-btn')
        }
    };
}
"""

target_path = os.path.abspath(TARGET)
with open(target_path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(NEW_CONTENT)

print(f"[OK] Rewrote: {target_path}")
print("     dom-refs.js refactored to container-based model.")
