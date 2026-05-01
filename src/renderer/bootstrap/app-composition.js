import { createBootController } from '../boot.js';
import { createAppUpdateController } from '../app-updates.js';
import { createDragDropGridController } from '../drag-drop-grid.js';
import { createDuplicateStackOverlayController } from '../duplicate-stack-overlay.js';
import { createGameCardFactory } from '../game-cards.js';
import { createLocaleController } from '../i18n.js';
import { createLanguagePackController } from '../language-packs.js';
import { createLibraryGridController } from '../library-grid.js';
import { createLibraryRuntime } from '../library/runtime.js';
import { createSearchController } from '../search.js';
import { createSettingsController } from '../settings.js';
import { createStackCardFactory } from '../stack-cards.js';
import { createStartupController } from '../startup.js';
import { createTooltipController } from '../tooltips.js';
import { createUpdateNotificationFeature } from '../update-notification-feature.js';
import { createUITextController } from '../ui-text.js';

export function createRendererComposition({
    refs,
    state,
    electronAPI,
    builtInLanguageOrder,
    dragRowTolerance,
    dragPointerSlop
}) {
    const bootController = createBootController({
        loading: refs.loading,
        bootProgress: refs.bootProgress,
        bootProgressBar: refs.bootProgressBar,
        bootTitle: refs.bootTitle,
        bootStatus: refs.bootStatus,
        getStrings: () => getStrings(),
        getEnglishStrings: () => getEnglishStrings()
    });

    const localeController = createLocaleController({
        applyUIStrings: () => applyUIStrings(),
        bootController,
        builtInLanguageOrder,
        electronAPI,
        getAllGames: () => state.getAllGames(),
        initialLanguage: localStorage.getItem('yumeshelf_lang') || 'en',
        langSelect: refs.langSelect,
        sortGames: () => libraryRuntime.sortGames(state.getCurrentSort())
    });
    const tooltipController = createTooltipController();
    const searchController = createSearchController({
        attachTooltip: (element, getContent) => {
            tooltipController.attachTooltip(element, getContent);
        },
        advancePlaceholderIndex: () => localeController.advancePlaceholderIndex(),
        electronAPI,
        getAllGames: () => state.getAllGames(),
        getDraggedGameFolder: () => state.getDraggedGameFolder(),
        getPlaceholderIndex: () => localeController.getPlaceholderIndex(),
        getPlaceholders: () => localeController.getPlaceholders(),
        getStrings: () => getStrings(),
        refs: {
            searchDropdown: refs.searchDropdown,
            searchInput: refs.searchInput,
            searchPlaceholder: refs.searchPlaceholder
        },
        setDraggedGameFolder: (value) => {
            state.setDraggedGameFolder(value);
        }
    });
    const settingsController = createSettingsController({
        onOpen: () => {
            tooltipController.hide();
        },
        refs: {
            appUpdatesSelect: refs.appUpdatesSelect,
            languagePackUpdatesSelect: refs.languagePackUpdatesSelect,
            locationDisplaySelect: refs.locationDisplaySelect,
            maxDepthDecreaseBtn: refs.maxDepthDecreaseBtn,
            maxDepthIncreaseBtn: refs.maxDepthIncreaseBtn,
            maxDepthInput: refs.maxDepthInput,
            settingsOverlay: refs.settingsOverlay,
            themeSelect: refs.themeSelect
        }
    });
    let languagePackController = null;
    let updateNotificationFeature = null;
    const appUpdateController = createAppUpdateController({
        bootController,
        electronAPI,
        getText,
        openUpdatesReviewModal: async (options = {}) => {
            await languagePackController.openUpdatesReviewModal(options);
        },
        reloadWindow: () => window.location.reload(),
        updateNotificationFeature: {
            present: (...args) => updateNotificationFeature.present(...args)
        }
    });
    languagePackController = createLanguagePackController({
        electronAPI,
        getAppUpdateState: (mode) => appUpdateController.getAppUpdateState(mode),
        localeController,
        onOverlayOpen: () => {
            tooltipController.hide();
        },
        onPackInstalled: () => {
            updateNotificationFeature.clear();
        },
        performAppUpdateAction: () => appUpdateController.performReviewUpdate(),
        suppressPostUpdateReview: () => appUpdateController.suppressPostUpdateNotice(),
        refs: {
            appUpdateReviewActionBtn: refs.appUpdateReviewActionBtn,
            appUpdateReviewEyebrow: refs.appUpdateReviewEyebrow,
            appUpdateReviewMeta: refs.appUpdateReviewMeta,
            appUpdateReviewNotes: refs.appUpdateReviewNotes,
            appUpdateReviewOptOutBtn: refs.appUpdateReviewOptOutBtn,
            appUpdateReviewSection: refs.appUpdateReviewSection,
            appUpdateReviewStatus: refs.appUpdateReviewStatus,
            appUpdateReviewTitle: refs.appUpdateReviewTitle,
            appUpdateProgressContainer: refs.appUpdateProgressContainer,
            appUpdateProgressPercent: refs.appUpdateProgressPercent,
            appUpdateProgressSpeed: refs.appUpdateProgressSpeed,
            appUpdateProgressFill: refs.appUpdateProgressFill,
            languagePackBanner: refs.languagePackBanner,
            languagePackEmpty: refs.languagePackEmpty,
            languagePackEmptyDesc: refs.languagePackEmptyDesc,
            languagePackEmptyTitle: refs.languagePackEmptyTitle,
            languagePackHint: refs.languagePackHint,
            languagePackListBtn: refs.languagePackListBtn,
            languagePackOverlay: refs.languagePackOverlay,
            languagePackRefreshBtn: refs.languagePackRefreshBtn,
            languagePackRepoLink: refs.languagePackRepoLink,
            languagePackResults: refs.languagePackResults,
            languagePackSearch: refs.languagePackSearch,
            languagePackSectionTitle: refs.languagePackSectionTitle,
            languagePackSource: refs.languagePackSource,
            languagePackTitle: refs.languagePackTitle,
            languagePackToolbar: refs.languagePackToolbar
        },
        subscribeAppUpdateState: (listener) => appUpdateController.subscribe(listener)
    });
    updateNotificationFeature = createUpdateNotificationFeature({
        getText,
        openUpdatesReviewModal: async (options = {}) => {
            await languagePackController.openUpdatesReviewModal(options);
        },
        restartAndInstallAppUpdate: () => appUpdateController.performReviewUpdate(),
        scheduleAppUpdateNextLaunch: () => appUpdateController.scheduleInstallOnNextLaunch()
    });

    const dragDropGridController = createDragDropGridController({
        dragPointerSlop,
        dragRowTolerance,
        electronAPI,
        getAllGames: () => state.getAllGames(),
        getCurrentSort: () => state.getCurrentSort(),
        getDraggedGameFolder: () => state.getDraggedGameFolder(),
        getDragTargetInfo: () => state.getDragTargetInfo(),
        refs: {
            favGrid: refs.favGrid,
            separator: refs.separator,
            unfavGrid: refs.unfavGrid
        },
        setCurrentSort: (value) => {
            state.setCurrentSort(value);
        },
        setDraggedGameFolder: (value) => {
            state.setDraggedGameFolder(value);
        },
        setDragTargetInfo: (value) => {
            state.setDragTargetInfo(value);
        },
        sortGames: (type) => libraryRuntime.sortGames(type)
    });

    const gameCardFactory = createGameCardFactory({
        attachTooltip: (element, getContent) => {
            tooltipController.attachTooltip(element, getContent);
        },
        electronAPI,
        getStrings: () => getStrings(),
        onCardDeleted: (gameKey) => {
            state.setAllGames(state.getAllGames().filter(g => (g.gameKey || g.exePath) !== gameKey));
            libraryRuntime.reannotateGames();
        },
        onDragStart: (gameKey) => {
            dragDropGridController.startDrag(gameKey);
        },
        onDragStateReset: () => {
            dragDropGridController.resetDragState();
        },
        onFavoriteToggled: (gameKey, favorite) => {
            state.setAllGames(
                state.getAllGames().map((entry) => (
                    (entry.gameKey || entry.exePath) === gameKey
                        ? { ...entry, favorite }
                        : entry
                ))
            );
        },
        onGameLaunched: () => {
            libraryRuntime.sortGames(state.getCurrentSort());
        },
        onRefreshRequested: () => libraryRuntime.sortGames(state.getCurrentSort())
    });
    const duplicateStackOverlayController = createDuplicateStackOverlayController({
        createCard: (game, options) => createCard(game, options),
        onOpen: () => {
            tooltipController.hide();
        },
        refs: {
            grid: refs.duplicateStackGrid,
            overlay: refs.duplicateStackOverlay
        }
    });
    const stackCardFactory = createStackCardFactory({
        attachTooltip: (element, getContent) => {
            tooltipController.attachTooltip(element, getContent);
        },
        getStrings: () => getStrings(),
        onDragStart: (gameKey) => {
            dragDropGridController.startDrag(gameKey);
        },
        onDragStateReset: () => {
            dragDropGridController.resetDragState();
        },
        onOpenStack: (stack) => {
            duplicateStackOverlayController.open(stack);
        }
    });
    const libraryGridController = createLibraryGridController({
        createLibraryItem: (item) => libraryRuntime.createLibraryItem(item),
        getAllGames: () => state.getAllGames(),
        getStrings: () => getStrings(),
        onAfterRender: () => applyUIStrings(),
        onEmptyAction: () => startupController.handleQuickFolderOpen(),
        refs: {
            emptyContainer: refs.emptyContainer,
            favGrid: refs.favGrid,
            quickFolder: refs.quickFolder,
            separator: refs.separator,
            unfavGrid: refs.unfavGrid
        },
        setCurrentSort: (value) => {
            state.setCurrentSort(value);
        }
    });
    const libraryRuntime = createLibraryRuntime({
        state,
        settingsController,
        duplicateStackOverlayController,
        libraryGridController,
        createCard: (game, options) => gameCardFactory.createCard(game, options),
        createStackCard: (stack) => stackCardFactory.createStackCard(stack)
    });
    const startupController = createStartupController({
        applyUIStrings: () => applyUIStrings(),
        bootController,
        electronAPI,
        getCurrentSort: () => state.getCurrentSort(),
        refs: {
            welcome: refs.welcome
        },
        setAllGames: libraryRuntime.setAllGames,
        sortGames: (type) => libraryRuntime.sortGames(type)
    });
    const uiTextController = createUITextController({
        bootController,
        electronAPI,
        getCurrentSort: () => state.getCurrentSort(),
        getEnglishStrings: () => getEnglishStrings(),
        getLocaleState: () => localeController.getLocaleState(),
        getPlaceholderIndex: () => localeController.getPlaceholderIndex(),
        getPlaceholders: () => localeController.getPlaceholders(),
        getStrings: () => getStrings(),
        refs: refs.uiTextRefs,
        renderLanguagePackResults: () => languagePackController.renderLanguagePackResults(),
        updateSearch: (query) => searchController.updateSearch(query)
    });

    dragDropGridController.attachZoneHandlers();
    settingsController.initializeSettingsUI();

    function getEnglishStrings() {
        return localeController.getEnglishStrings();
    }

    function getStrings() {
        return localeController.getStrings();
    }

    function getText(key, fallback = '') {
        return getStrings()[key] || getEnglishStrings()[key] || fallback;
    }

    async function applyUIStrings() {
        await uiTextController.applyUIStrings();
    }

    function createCard(game, options) {
        return gameCardFactory.createCard(game, options);
    }

    async function initApp(bootstrapData = null) {
        await startupController.initApp(bootstrapData);
    }

    return {
        appUpdateController,
        bootController,
        dragDropGridController,
        duplicateStackOverlayController,
        getEnglishStrings,
        getStrings,
        getText,
        initApp,
        languagePackController,
        libraryRuntime,
        localeController,
        searchController,
        settingsController,
        startupController,
        uiTextController,
        updateNotificationFeature
    };
}
