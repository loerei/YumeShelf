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
import { CentralStore, GameEntry } from '../state/types';
import { ElectronAPI } from '../../shared/types/ipc';

export interface RendererCompositionOptions {
    refs: any;
    state: CentralStore;
    electronAPI: ElectronAPI;
    builtInLanguageOrder: string[];
    dragRowTolerance: number;
    dragPointerSlop: number;
}

export function createRendererComposition({
    refs,
    state,
    electronAPI,
    builtInLanguageOrder,
    dragRowTolerance,
    dragPointerSlop
}: RendererCompositionOptions) {
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

    function withLogicalGameMutation(gameKey: string, mutator: (entry: GameEntry) => void) {
        state.setAllGames(
            state.getAllGames().map((entry) => {
                const isMatch = entry.gameId === gameKey
                    || entry.gameKey === gameKey
                    || (Array.isArray(entry.instances) && entry.instances.some((instance) => (
                        instance.gameKey === gameKey || instance.instanceId === gameKey
                    )));
                if (!isMatch) {
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

    const handleFavoriteToggled = (gameKey: string, favorite: boolean) => {
        withLogicalGameMutation(gameKey, (entry) => {
            if (entry.gameId === gameKey || entry.gameKey === gameKey) {
                entry.favorite = favorite;
                if (Array.isArray(entry.instances)) {
                    entry.instances.forEach((instance) => {
                        instance.favorite = favorite;
                    });
                }
                if (entry.primaryInstance) {
                    entry.primaryInstance.favorite = favorite;
                }
            } else {
                if (Array.isArray(entry.instances)) {
                    entry.instances.forEach((instance) => {
                        if (instance.gameKey === gameKey || instance.instanceId === gameKey) {
                            instance.favorite = favorite;
                        }
                    });
                    entry.favorite = entry.instances.some((instance) => !!instance.favorite);
                }
                if (entry.primaryInstance && (entry.primaryInstance.gameKey === gameKey || entry.primaryInstance.instanceId === gameKey)) {
                    entry.primaryInstance.favorite = favorite;
                }
            }
        });
    };

    const handleRenamed = (gameKey: string, newName: string) => {
        withLogicalGameMutation(gameKey, (entry) => {
            if (entry.gameId === gameKey || entry.gameKey === gameKey) {
                entry.name = newName;
                if (Array.isArray(entry.instances)) {
                    entry.instances.forEach((instance) => {
                        instance.name = newName;
                    });
                }
                if (entry.primaryInstance) {
                    entry.primaryInstance.name = newName;
                }
            } else {
                if (Array.isArray(entry.instances)) {
                    entry.instances.forEach((instance) => {
                        if (instance.gameKey === gameKey || instance.instanceId === gameKey) {
                            instance.name = newName;
                        }
                    });
                }
                if (entry.primaryInstance && (entry.primaryInstance.gameKey === gameKey || entry.primaryInstance.instanceId === gameKey)) {
                    entry.primaryInstance.name = newName;
                    entry.name = newName;
                }
            }
        });
    };

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
        attachTooltip: (element: HTMLElement, getContent: () => string) => {
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
        setDraggedGameFolder: (value: string | null) => {
            state.setDraggedGameFolder(value);
        }
    });

    const categoryFilterController = createCategoryFilterController({
        getActiveCategoryId: () => state.getActiveCategoryId(),
        getCategoryTree: () => state.getCategoryTree(),
        getVisibleGames,
        container: refs.containers.categoryFilter,
        setActiveCategoryId: (value: string | null) => {
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

    let languagePackController: any = null;
    let updateNotificationFeature: any = null;

    const appUpdateController = createAppUpdateController({
        bootController,
        electronAPI,
        getText,
        openUpdatesReviewModal: async (options = {}) => {
            await languagePackController.openUpdatesReviewModal(options);
        },
        reloadWindow: () => globalThis.location.reload(),
        updateNotificationFeature: {
            present: (...args: any[]) => updateNotificationFeature.present(...args)
        }
    });

    languagePackController = createLanguagePackController({
        electronAPI,
        getAppUpdateState: (mode: string) => appUpdateController.getAppUpdateState(mode),
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
        subscribeAppUpdateState: (listener: any) => appUpdateController.subscribe(listener)
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
        setCurrentSort: (value: string) => {
            state.setCurrentSort(value);
        },
        setDraggedGameFolder: (value: string | null) => {
            state.setDraggedGameFolder(value);
        },
        setDragTargetInfo: (value: any) => {
            state.setDragTargetInfo(value);
        },
        sortGames: (type: string) => libraryRuntime.sortGames(type)
    });

    const gameCardFactory = createGameCardFactory({
        attachTooltip: (element: HTMLElement, getContent: () => string) => {
            tooltipController.attachTooltip(element, getContent);
        },
        electronAPI,
        getStrings: () => getStrings(),
        onCardDeleted: async (gameKey: string) => {
            try {
                console.log('[FRONTEND] Game deleted. Reloading games list from backend.');
                const nextGames = await electronAPI.invoke('get-games');
                const config = await electronAPI.invoke('check-config');
                libraryRuntime.setAllGames(nextGames, config);
                libraryRuntime.sortGames(state.getCurrentSort());
            } catch (err) {
                console.error('[FRONTEND] Failed to reload games from backend after deletion:', err);
                state.setAllGames(state.getAllGames().filter(g => getGameKey(g) !== gameKey));
                libraryRuntime.sortGames(state.getCurrentSort());
            }
        },
        onDragStart: (gameKey: string) => {
            dragDropGridController.startDrag(gameKey);
        },
        onDragStateReset: () => {
            dragDropGridController.resetDragState();
        },
        onFavoriteToggled: handleFavoriteToggled,
        onRenamed: handleRenamed,
        onGameLaunched: () => {
            libraryRuntime.sortGames(state.getCurrentSort());
        },
        onRefreshRequested: () => libraryRuntime.sortGames(state.getCurrentSort())
    });

    const duplicateStackOverlayController = createDuplicateStackOverlayController({
        createCard: (game: any, options: any) => createCard(game, options),
        onOpen: () => {
            tooltipController.hide();
        },
        container: refs.containers.duplicateStack
    });

    const stackCardFactory = createStackCardFactory({
        attachTooltip: (element: HTMLElement, getContent: () => string) => {
            tooltipController.attachTooltip(element, getContent);
        },
        electronAPI,
        getStrings: () => getStrings(),
        onDragStart: (gameKey: string) => {
            dragDropGridController.startDrag(gameKey);
        },
        onDragStateReset: () => {
            dragDropGridController.resetDragState();
        },
        onFavoriteToggled: handleFavoriteToggled,
        onOpenStack: (stack: any) => {
            duplicateStackOverlayController.open(stack);
        },
        onRenamed: handleRenamed,
        onRefreshRequested: () => {
            libraryRuntime.sortGames(state.getCurrentSort());
        }
    });

    const libraryGridController = createLibraryGridController({
        createLibraryItem: (item: any, options: any) => libraryRuntime.createLibraryItem(item, options),
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
        setCurrentSort: (value: string) => {
            state.setCurrentSort(value);
        }
    });

    const libraryRuntime = createLibraryRuntime({
        state,
        settingsController,
        duplicateStackOverlayController,
        libraryGridController,
        createCard: (game: any, options: any) => gameCardFactory.createCard(game, options),
        createStackCard: (stack: any, options: any) => stackCardFactory.createStackCard(stack, options),
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
        setCategoryTree: (tree: any) => {
            state.setCategoryTree(tree);
        },
        setAllGames: libraryRuntime.setAllGames,
        sortGames: (type: string) => libraryRuntime.sortGames(type)
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
        updateSearch: (query: string) => searchController.updateSearch(query)
    });

    // --- Wire Up Central Store Subscriptions (Decoupling logic) ---
    state.subscribe('categoryTree', () => {
        categoryFilterController.renderMenu();
    });

    state.subscribe('activeCategoryId', () => {
        categoryFilterController.renderMenu();
        libraryRuntime.sortGames(state.getCurrentSort());
    });

    state.subscribe('currentSort', (sortType) => {
        libraryRuntime.sortGames(sortType);
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

    function getText(key: string, fallback = '') {
        return getStrings()[key] || getEnglishStrings()[key] || fallback;
    }

    async function applyUIStrings() {
        await uiTextController.applyUIStrings();
        categoryFilterController.renderMenu();
    }

    function createCard(game: any, options: any) {
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
