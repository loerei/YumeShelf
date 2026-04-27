import { createBootController } from './renderer/boot.js';
import { createAppUpdateController } from './renderer/app-updates.js';
import { createDragDropGridController } from './renderer/drag-drop-grid.js';
import { createGameCardFactory } from './renderer/game-cards.js';
import { createLocaleController } from './renderer/i18n.js';
import { createLanguagePackController } from './renderer/language-packs.js';
import { createLibraryGridController } from './renderer/library-grid.js';
import { createSearchController } from './renderer/search.js';
import { createSettingsController } from './renderer/settings.js';
import { createStartupController } from './renderer/startup.js';
import { createUpdateNotificationFeature } from './renderer/update-notification-feature.js';
import { createUITextController } from './renderer/ui-text.js';

document.addEventListener('DOMContentLoaded', async () => {
    const favGrid = document.getElementById('fav-grid');
    const unfavGrid = document.getElementById('unfav-grid');
    const separator = document.getElementById('favorites-separator');
    const emptyContainer = document.getElementById('empty-state-container');
    const loading = document.getElementById('loading');
    const bootTitle = document.getElementById('boot-title');
    const bootStatus = document.getElementById('boot-status');
    const welcome = document.getElementById('welcome-screen');
    const quickFolder = document.getElementById('quick-folder-btn');
    const settingsOverlay = document.getElementById('settings-overlay');
    const langSelect = document.getElementById('lang-select');
    const themeSelect = document.getElementById('theme-select');
    const appUpdatesSelect = document.getElementById('app-updates-select');
    const languagePackUpdatesSelect = document.getElementById('language-pack-updates-select');
    const searchInput = document.getElementById('search-input');
    const searchDropdown = document.getElementById('search-dropdown');
    const searchPlaceholder = document.getElementById('search-placeholder');
    const moreLanguagesBtn = document.getElementById('more-languages-btn');
    const languagePackOverlay = document.getElementById('language-pack-overlay');
    const appUpdateReviewSection = document.getElementById('app-update-review-section');
    const appUpdateReviewEyebrow = document.getElementById('app-update-review-eyebrow');
    const appUpdateReviewTitle = document.getElementById('app-update-review-title');
    const appUpdateReviewStatus = document.getElementById('app-update-review-status');
    const appUpdateReviewMeta = document.getElementById('app-update-review-meta');
    const appUpdateReviewNotes = document.getElementById('app-update-review-notes');
    const appUpdateReviewActionBtn = document.getElementById('app-update-review-action-btn');
    const languagePackSearch = document.getElementById('language-pack-search');
    const languagePackBanner = document.getElementById('language-pack-banner');
    const languagePackToolbar = document.getElementById('language-pack-toolbar');
    const languagePackSectionTitle = document.getElementById('language-pack-section-title');
    const languagePackTitle = document.getElementById('ui-language-pack-title');
    const languagePackSource = document.getElementById('language-pack-source');
    const languagePackResults = document.getElementById('language-pack-results');
    const languagePackEmpty = document.getElementById('language-pack-empty');
    const languagePackEmptyTitle = document.getElementById('language-pack-empty-title');
    const languagePackEmptyDesc = document.getElementById('language-pack-empty-desc');
    const languagePackRepoLink = document.getElementById('language-pack-repo-link');
    const languagePackHint = document.getElementById('language-pack-hint');
    const languagePackListBtn = document.getElementById('language-pack-list-btn');
    const languagePackRefreshBtn = document.getElementById('language-pack-refresh-btn');

    const BUILTIN_LANGUAGE_ORDER = ['en', 'ja', 'zh'];
    const DRAG_ROW_TOLERANCE = 15;
    const DRAG_POINTER_SLOP = 18;

    let allGames = [];
    let draggedGameFolder = null;
    let dragTargetInfo = null;
    let currentSort = localStorage.getItem('yumeshelf_sort_pref') || 'date';
    if (currentSort === 'rj') currentSort = 'date';
    const bootController = createBootController({
        loading,
        bootTitle,
        bootStatus,
        getStrings: () => getStrings(),
        getEnglishStrings: () => getEnglishStrings()
    });
    const localeController = createLocaleController({
        applyUIStrings: () => applyUIStrings(),
        bootController,
        builtInLanguageOrder: BUILTIN_LANGUAGE_ORDER,
        electronAPI: window.electronAPI,
        getAllGames: () => allGames,
        initialLanguage: localStorage.getItem('yumeshelf_lang') || 'en',
        langSelect,
        sortGames: () => sortGames(currentSort)
    });
    const searchController = createSearchController({
        advancePlaceholderIndex: () => localeController.advancePlaceholderIndex(),
        electronAPI: window.electronAPI,
        getAllGames: () => allGames,
        getDraggedGameFolder: () => draggedGameFolder,
        getPlaceholderIndex: () => localeController.getPlaceholderIndex(),
        getPlaceholders: () => localeController.getPlaceholders(),
        getStrings: () => getStrings(),
        refs: {
            searchDropdown,
            searchInput,
            searchPlaceholder
        },
        setDraggedGameFolder: (value) => {
            draggedGameFolder = value;
        }
    });
    const settingsController = createSettingsController({
        refs: {
            appUpdatesSelect,
            languagePackUpdatesSelect,
            settingsOverlay,
            themeSelect
        }
    });
    let languagePackController = null;
    let updateNotificationFeature = null;
    const appUpdateController = createAppUpdateController({
        electronAPI: window.electronAPI,
        getText,
        openUpdatesReviewModal: async () => {
            await languagePackController.openUpdatesReviewModal();
        },
        updateNotificationFeature: {
            present: (...args) => updateNotificationFeature.present(...args)
        }
    });
    languagePackController = createLanguagePackController({
        electronAPI: window.electronAPI,
        getAppUpdateState: () => appUpdateController.getCurrentUpdateState(),
        localeController,
        onPackInstalled: () => {
            updateNotificationFeature.clear();
        },
        performAppUpdateAction: () => appUpdateController.performReviewUpdate(),
        refs: {
            appUpdateReviewActionBtn,
            appUpdateReviewEyebrow,
            appUpdateReviewMeta,
            appUpdateReviewNotes,
            appUpdateReviewSection,
            appUpdateReviewStatus,
            appUpdateReviewTitle,
            appUpdateProgressContainer: document.getElementById('app-update-progress-container'),
            appUpdateProgressPercent: document.getElementById('app-update-progress-percent'),
            appUpdateProgressSpeed: document.getElementById('app-update-progress-speed'),
            appUpdateProgressFill: document.getElementById('app-update-progress-fill'),
            languagePackBanner,
            languagePackEmpty,
            languagePackEmptyDesc,
            languagePackEmptyTitle,
            languagePackHint,
            languagePackListBtn,
            languagePackOverlay,
            languagePackRefreshBtn,
            languagePackRepoLink,
            languagePackResults,
            languagePackSearch,
            languagePackSectionTitle,
            languagePackSource,
            languagePackTitle,
            languagePackToolbar
        },
        subscribeAppUpdateState: (listener) => appUpdateController.subscribe(listener)
    });
    updateNotificationFeature = createUpdateNotificationFeature({
        getText,
        openUpdatesReviewModal: async () => {
            await languagePackController.openUpdatesReviewModal();
        }
    });
    const sortMenu = document.getElementById('sort-menu');
    const dragDropGridController = createDragDropGridController({
        dragPointerSlop: DRAG_POINTER_SLOP,
        dragRowTolerance: DRAG_ROW_TOLERANCE,
        electronAPI: window.electronAPI,
        getAllGames: () => allGames,
        getCurrentSort: () => currentSort,
        getDraggedGameFolder: () => draggedGameFolder,
        getDragTargetInfo: () => dragTargetInfo,
        refs: {
            favGrid,
            separator,
            unfavGrid
        },
        setCurrentSort: (value) => {
            currentSort = value;
        },
        setDraggedGameFolder: (value) => {
            draggedGameFolder = value;
        },
        setDragTargetInfo: (value) => {
            dragTargetInfo = value;
        },
        sortGames: (type) => sortGames(type)
    });
    const gameCardFactory = createGameCardFactory({
        electronAPI: window.electronAPI,
        getStrings: () => getStrings(),
        onCardDeleted: (folderName) => {
            allGames = allGames.filter(g => g.folderName !== folderName);
        },
        onDragStart: (folderName) => {
            dragDropGridController.startDrag(folderName);
        },
        onDragStateReset: () => {
            dragDropGridController.resetDragState();
        },
        onRefreshRequested: () => sortGames(currentSort)
    });
    const libraryGridController = createLibraryGridController({
        createCard: (game) => createCard(game),
        getAllGames: () => allGames,
        getStrings: () => getStrings(),
        onAfterRender: () => applyUIStrings(),
        onEmptyAction: () => startupController.handleQuickFolderOpen(),
        refs: {
            emptyContainer,
            favGrid,
            quickFolder,
            separator,
            unfavGrid
        },
        setCurrentSort: (value) => {
            currentSort = value;
        }
    });
    const startupController = createStartupController({
        applyUIStrings: () => applyUIStrings(),
        bootController,
        electronAPI: window.electronAPI,
        getCurrentSort: () => currentSort,
        refs: {
            welcome
        },
        setAllGames: (games) => {
            allGames = games;
        },
        sortGames: (type) => sortGames(type)
    });
    const uiTextController = createUITextController({
        bootController,
        electronAPI: window.electronAPI,
        getCurrentSort: () => currentSort,
        getEnglishStrings: () => getEnglishStrings(),
        getLocaleState: () => localeController.getLocaleState(),
        getPlaceholderIndex: () => localeController.getPlaceholderIndex(),
        getPlaceholders: () => localeController.getPlaceholders(),
        getStrings: () => getStrings(),
        refs: {
            btnChangePath: document.getElementById('btn-change-path'),
            moreLanguagesBtn,
            searchInput,
            searchPlaceholder,
            sortMenu,
            uiAppUpdatesLabel: document.getElementById('ui-app-updates-label'),
            uiAppVersion: document.getElementById('ui-app-version'),
            uiFooterDesc: document.getElementById('ui-footer-desc'),
            uiLangLabel: document.getElementById('ui-lang-label'),
            uiLanguagePackTitle: document.getElementById('ui-language-pack-title'),
            uiLanguagePackUpdatesLabel: document.getElementById('ui-language-pack-updates-label'),
            uiOptChoose: document.getElementById('ui-opt-choose'),
            uiOptChooseDesc: document.getElementById('ui-opt-choose-desc'),
            uiOptLazy: document.getElementById('ui-opt-lazy'),
            uiOptLazyDesc: document.getElementById('ui-opt-lazy-desc'),
            uiPackUpdateAutomatic: document.getElementById('ui-pack-update-automatic'),
            uiPackUpdateNotify: document.getElementById('ui-pack-update-notify'),
            uiPackUpdateOff: document.getElementById('ui-pack-update-off'),
            uiPathLabel: document.getElementById('ui-path-label'),
            uiSettingsTitle: document.getElementById('ui-settings-title'),
            uiSortAz: document.getElementById('ui-sort-az'),
            uiSortCustom: document.getElementById('ui-sort-custom'),
            uiSortDate: document.getElementById('ui-sort-date'),
            uiSortPlayed: document.getElementById('ui-sort-played'),
            uiThemeDark: document.getElementById('ui-theme-dark'),
            uiThemeLabel: document.getElementById('ui-theme-label'),
            uiThemeLight: document.getElementById('ui-theme-light'),
            uiThemeSystem: document.getElementById('ui-theme-system'),
            uiTitle: document.getElementById('ui-title'),
            uiUpdateAutomatic: document.getElementById('ui-update-automatic'),
            uiUpdateNotify: document.getElementById('ui-update-notify'),
            uiUpdateOff: document.getElementById('ui-update-off'),
            uiWelcomeDesc: document.getElementById('ui-welcome-desc'),
            uiWelcomeTitle: document.getElementById('ui-welcome-title')
        },
        renderLanguagePackResults: () => renderLanguagePackResults(),
        updateSearch: (query) => updateSearch(query)
    });
    dragDropGridController.attachZoneHandlers();

    function getEnglishStrings() {
        return localeController.getEnglishStrings();
    }

    function getLocaleStrings(code = localeController.getCurrentLang()) {
        return localeController.getLocaleStrings(code);
    }

    function getStrings() {
        return localeController.getStrings();
    }

    function getText(key, fallback = '') {
        return getStrings()[key] || getEnglishStrings()[key] || fallback;
    }

    function getAvailableLanguages() {
        return localeController.getAvailableLanguages();
    }

    function isLanguageAvailable(code) {
        return localeController.isLanguageAvailable(code);
    }

    function getLanguageMeta(code) {
        return localeController.getLanguageMeta(code);
    }

    function formatLanguageLabel(meta) {
        return localeController.formatLanguageLabel(meta);
    }

    async function loadLanguageState(nextState = null) {
        await localeController.loadLanguageState(nextState);
    }

    function refreshLanguageDropdown() {
        localeController.refreshLanguageDropdown();
    }

    function setCurrentLanguage(nextCode, options = {}) {
        localeController.setCurrentLanguage(nextCode, options);
    }

    async function fetchLanguagePackManifest() {
        await languagePackController.fetchLanguagePackManifest();
    }

    async function openLanguagePackModal(options = {}) {
        await languagePackController.openLanguagePackModal(options);
    }

    function closeLanguagePackModal() {
        languagePackController.closeLanguagePackModal();
    }

    function renderLanguagePackResults() {
        languagePackController.renderLanguagePackResults();
    }

    function updateSearch(query) {
        searchController.updateSearch(query);
    }

    function rotatePlaceholder() {
        searchController.rotatePlaceholder();
    }

    async function applyUIStrings() {
        await uiTextController.applyUIStrings();
    }

    function createCard(game) {
        return gameCardFactory.createCard(game);
    }

    function sortGames(type) {
        libraryGridController.renderLibraryGrid(type);
    }

    async function initApp(bootstrapData = null) {
        await startupController.initApp(bootstrapData);
    }

    document.getElementById('btn-setup-default').onclick = async () => { await startupController.handleSetupDefault(); };
    document.getElementById('btn-choose-custom').onclick = async () => { await startupController.handleSetupCustom(); };
    document.getElementById('btn-change-path').onclick = async () => { await startupController.handleChangePath(); };
    document.getElementById('settings-open-btn').onclick = () => { settingsController.openSettings(); };
    document.getElementById('settings-close-btn').onclick = () => { settingsController.closeSettings(); };
    document.getElementById('language-pack-close-btn').onclick = closeLanguagePackModal;
    quickFolder.onclick = () => startupController.handleQuickFolderOpen();
    moreLanguagesBtn.onclick = openLanguagePackModal;
    languagePackListBtn.onclick = () => languagePackController.handleListClick();
    languagePackRefreshBtn.onclick = async () => languagePackController.handleRefreshClick();
    languagePackSearch.oninput = () => languagePackController.handleSearchInput();

    const sortBtn = document.getElementById('sort-btn');
    sortBtn.onclick = (event) => { event.stopPropagation(); sortMenu.classList.toggle('show'); };
    document.querySelectorAll('.sort-item').forEach((item) => {
        item.onclick = (event) => {
            event.stopPropagation();
            sortGames(item.dataset.sort);
            sortMenu.classList.remove('show');
        };
    });

    themeSelect.onchange = (event) => {
        settingsController.handleThemeChange(event.target.value);
    };
    appUpdatesSelect.onchange = (event) => {
        settingsController.handleAppUpdatesChange(event.target.value);
    };
    languagePackUpdatesSelect.onchange = (event) => {
        settingsController.handleLanguagePackUpdatesChange(event.target.value);
    };
    langSelect.onchange = (event) => {
        setCurrentLanguage(event.target.value);
    };
    searchInput.oninput = (event) => updateSearch(event.target.value);
    searchInput.onfocus = (event) => updateSearch(event.target.value);

    window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            if (languagePackOverlay.style.display === 'flex') closeLanguagePackModal();
            else settingsController.closeSettings();
        }
    });

    document.addEventListener('click', (event) => {
        if (!searchInput.contains(event.target) && !searchDropdown.contains(event.target)) {
            searchDropdown.classList.remove('show');
        }
        if (!event.target.closest('.dropdown-menu') && !event.target.closest('.menu-btn')) {
            document.querySelectorAll('.dropdown-menu').forEach(menu => menu.classList.remove('show'));
        }
        if (!event.target.closest('.sort-container')) {
            document.querySelectorAll('.sort-menu').forEach(menu => menu.classList.remove('show'));
        }
    });

    settingsController.initializeSettingsUI();

    window.electronAPI.onBootStatus((payload) => {
        bootController.show(payload);
    });

    bootController.show({
        key: 'boot_initializing',
        fallbackText: 'Preparing startup pipeline'
    });

    let bootstrapData = null;
    try {
        bootstrapData = await window.electronAPI.bootstrapApp({
            ...settingsController.getBootstrapPreferences()
        });
    } catch (error) {
        console.error('[BOOT] bootstrap-app failed, falling back to legacy startup flow', error);
        bootController.show({
            fallbackText: 'Startup bootstrap failed, continuing with local fallback'
        });
    }

    await loadLanguageState(bootstrapData ? bootstrapData.languageState : null);
    searchPlaceholder.innerText = localeController.getPlaceholders()[localeController.getPlaceholderIndex()];
    setCurrentLanguage(localeController.getCurrentLang(), { persist: false });
    setInterval(rotatePlaceholder, 60000);
    await initApp(bootstrapData);
    appUpdateController.initialize(bootstrapData);
    updateNotificationFeature.presentBootNotifications(bootstrapData);
});
