import { createBootController } from '../boot.js';
import { createCategoryFilterController } from '../category-filter.js';
import { createAppUpdateController } from '../app-updates.js';
import { createDragDropGridController } from '../drag-drop-grid.js';
import { createDuplicateStackOverlayController } from '../duplicate-stack-overlay.js';
import { createGameCardFactory } from '../game-cards.js';
import { createLocaleController } from '../i18n.js';
import { createLanguagePackController } from '../language-packs.js';
import { createLibraryGridController } from '../library-grid.js';
import { getGameKey } from '../library-order.js';
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
    function withLogicalGameMutation(gameKey, mutator) {
        state.setAllGames(
            state.getAllGames().map((entry) => {
                if (getGameKey(entry) !== gameKey) {
                    return entry;
                }
                const nextEntry = {
                    ...entry,
                    instances: Array.isArray(entry.instances) ? entry.instances.map((instance) => ({ ...instance })) : entry.instances,
                    primaryInstance: entry.primaryInstance ? { ...entry.primaryInstance } : entry.primaryInstance
                };
                mutator(nextEntry);
                return nextEntry;
            })
        );
    }
    function getVisibleGames() {
        const activeCategoryId = state.getActiveCategoryId();
        const allGames = state.getAllGames();
        if (!activeCategoryId) {
            return allGames;
        }
        return allGames.filter((game) => Array.isArray(game.categoryIds) && game.categoryIds.includes(activeCategoryId));
    }
    const searchController = createSearchController({
        attachTooltip: (element, getContent) => {
            tooltipController.attachTooltip(element, getContent);
        },
        advancePlaceholderIndex: () => localeController.advancePlaceholderIndex(),
        electronAPI,
        getVisibleGames,
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
    const categoryFilterController = createCategoryFilterController({
        getActiveCategoryId: () => state.getActiveCategoryId(),
        getCategoryTree: () => state.getCategoryTree(),
        getVisibleGames,
        refs: {
            categoryFilterBtn: refs.categoryFilterBtn,
            categoryFilterContainer: refs.categoryFilterContainer,
            categoryFilterLabel: refs.categoryFilterLabel,
            categoryFilterMenu: refs.categoryFilterMenu
        },
        setActiveCategoryId: (value) => {
            state.setActiveCategoryId(value);
        },
        sortGames: () => libraryRuntime.sortGames(state.getCurrentSort())
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
        getActiveCategoryId: () => state.getActiveCategoryId(),
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
            state.setAllGames(state.getAllGames().filter(g => getGameKey(g) !== gameKey));
            libraryRuntime.reannotateGames();
        },
        onDragStart: (gameKey) => {
            dragDropGridController.startDrag(gameKey);
        },
        onDragStateReset: () => {
            dragDropGridController.resetDragState();
        },
        onFavoriteToggled: (gameKey, favorite) => {
            withLogicalGameMutation(gameKey, (entry) => {
                entry.favorite = favorite;
                if (Array.isArray(entry.instances)) {
                    entry.instances.forEach((instance) => {
                        instance.favorite = favorite;
                    });
                }
                if (entry.primaryInstance) {
                    entry.primaryInstance.favorite = favorite;
                }
            });
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
        electronAPI,
        getStrings: () => getStrings(),
        onDragStart: (gameKey) => {
            dragDropGridController.startDrag(gameKey);
        },
        onDragStateReset: () => {
            dragDropGridController.resetDragState();
        },
        onFavoriteToggled: (gameKey, favorite) => {
            withLogicalGameMutation(gameKey, (entry) => {
                entry.favorite = favorite;
                if (Array.isArray(entry.instances)) {
                    entry.instances.forEach((instance) => {
                        instance.favorite = favorite;
                    });
                }
                if (entry.primaryInstance) {
                    entry.primaryInstance.favorite = favorite;
                }
            });
        },
        onOpenStack: (stack) => {
            duplicateStackOverlayController.open(stack);
        },
        onRenamed: (gameKey, newName) => {
            withLogicalGameMutation(gameKey, (entry) => {
                entry.name = newName;
                if (Array.isArray(entry.instances)) {
                    entry.instances.forEach((instance) => {
                        instance.name = newName;
                    });
                }
                if (entry.primaryInstance) {
                    entry.primaryInstance.name = newName;
                }
            });
        },
        onRefreshRequested: () => {
            libraryRuntime.sortGames(state.getCurrentSort());
        }
    });
    const libraryGridController = createLibraryGridController({
        createLibraryItem: (item, options) => libraryRuntime.createLibraryItem(item, options),
        getAllGames: () => state.getAllGames(),
        getActiveCategoryId: () => state.getActiveCategoryId(),
        getFilteredEmptyState: () => categoryFilterController.getFilteredEmptyState(),
        getStrings: () => getStrings(),
        onAfterRender: () => applyUIStrings(),
        onClearFilter: () => categoryFilterController.clearFilter(),
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
        createStackCard: (stack, options) => stackCardFactory.createStackCard(stack, options),
        getVisibleGames
    });
    const startupController = createStartupController({
        applyUIStrings: () => applyUIStrings(),
        bootController,
        electronAPI,
        getCurrentSort: () => state.getCurrentSort(),
        refs: {
            gameGridWrapper: refs.gameGridWrapper,
            refreshLibraryBtn: refs.refreshLibraryBtn,
            welcome: refs.welcome
        },
        setCategoryTree: (tree) => {
            state.setCategoryTree(tree);
            categoryFilterController.renderMenu();
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
    categoryFilterController.initialize();
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
        categoryFilterController.renderMenu();
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
        categoryFilterController,
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
