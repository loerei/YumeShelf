// @ts-nocheck
import { createBootController } from '../boot';
import { createCategoryFilterController } from '../category-filter';
import { createAppUpdateController } from '../app-updates';
import { createDragDropGridController } from '../drag-drop-grid';
import { createDuplicateStackOverlayController } from '../duplicate-stack-overlay';
import { createGameCardFactory } from '../game-cards';
import { createLocaleController } from '../i18n';
import { createLanguagePackController } from '../language-packs';
import { createLibraryGridController } from '../library-grid';
import { getGameKey } from '../library-order';
import { createLibraryRuntime } from '../library/runtime';
import { createSearchController } from '../search';
import { createSettingsController } from '../settings';
import { createStackCardFactory } from '../stack-cards';
import { createStartupController } from '../startup';
import { createTooltipController } from '../tooltips';
import { createUpdateNotificationFeature } from '../update-notification-feature';
import { createUITextController } from '../ui-text';

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

    // --- Container-based Controllers ---
    // Each controller receives its root container element and queries its own internal DOM.

    const searchController = createSearchController({
        attachTooltip: (element, getContent) => {
            tooltipController.attachTooltip(element, getContent);
        },
        advancePlaceholderIndex: () => localeController.advancePlaceholderIndex(),
        electronAPI,
        getActiveCategoryId: () => state.getActiveCategoryId(),
        getAllGames: () => state.getAllGames(),
        getDraggedGameFolder: () => state.getDraggedGameFolder(),
        getPlaceholderIndex: () => localeController.getPlaceholderIndex(),
        getPlaceholders: () => localeController.getPlaceholders(),
        getStrings: () => getStrings(),
        container: refs.containers.search,
        setDraggedGameFolder: (value) => {
            state.setDraggedGameFolder(value);
        }
    });

    const categoryFilterController = createCategoryFilterController({
        getActiveCategoryId: () => state.getActiveCategoryId(),
        getCategoryTree: () => state.getCategoryTree(),
        getVisibleGames,
        container: refs.containers.categoryFilter,
        setActiveCategoryId: (value) => {
            state.setActiveCategoryId(value);
        },
        sortGames: () => libraryRuntime.sortGames(state.getCurrentSort())
    });

    const settingsController = createSettingsController({
        onOpen: () => {
            tooltipController.hide();
        },
        container: refs.containers.settings
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
        container: refs.containers.languagePack,
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

    // --- Shared-ref Controllers (Nhom C - unchanged pattern) ---

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
        onRefreshRequested: () => libraryRuntime.sortGames(state.getCurrentSort()),
        isBetaExposed: () => !!state.getCurrentLibraryConfig()?.exposeBetaOptions
    });

    const duplicateStackOverlayController = createDuplicateStackOverlayController({
        createCard: (game, options) => createCard(game, options),
        onOpen: () => {
            tooltipController.hide();
        },
        container: refs.containers.duplicateStack
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
            welcome: refs.welcome,
            telemetryModal: refs.telemetryModal
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
