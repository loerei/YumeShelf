export interface StartupControllerOptions {
    applyUIStrings: () => void | Promise<void>;
    bootController: any;
    electronAPI: any;
    getCurrentSort: () => string;
    refs: {
        gameGridWrapper: HTMLElement | null;
        refreshLibraryBtn: HTMLElement | null;
        welcome: HTMLElement | null;
        telemetryModal?: HTMLElement | null;
    };
    setCategoryTree: (tree: any) => void;
    setAllGames: (games: any[], config: any) => void;
    sortGames: (sort: string) => void;
}

export interface StartupController {
    handleChangePath: () => Promise<void>;
    handleLibraryConfigChange: (updates: any) => Promise<void>;
    handleQuickFolderOpen: () => void;
    handleRefreshLibrary: () => Promise<void>;
    handleSetupCustom: () => Promise<void>;
    handleSetupDefault: () => Promise<void>;
    initApp: (bootstrapData?: any, options?: any) => Promise<void>;
}

export function createStartupController({
    applyUIStrings,
    bootController,
    electronAPI,
    getCurrentSort,
    refs,
    setCategoryTree,
    setAllGames,
    sortGames
}: StartupControllerOptions): StartupController {
    let refreshInFlight = false;
    const REFRESH_MIN_SPINNER_MS = 300;

    function setRefreshUiState(isRefreshing: boolean): void {
        refs.refreshLibraryBtn?.classList.toggle('is-refreshing', isRefreshing);
        refs.refreshLibraryBtn?.toggleAttribute('disabled', isRefreshing);
        refs.refreshLibraryBtn?.setAttribute('aria-busy', isRefreshing ? 'true' : 'false');
        refs.gameGridWrapper?.classList.toggle('is-refreshing', isRefreshing);
    }

    async function initApp(bootstrapData: any = null, options: any = {}): Promise<void> {
        const loadingMode = options.loadingMode || 'boot';
        const config = bootstrapData ? bootstrapData.config : await electronAPI.checkConfig();
        if (!config || !config.libraryPath) {
            bootController.hide();
            if (refs.welcome) refs.welcome.style.display = 'flex';
            applyUIStrings();
            return;
        }

        if (refs.welcome) refs.welcome.style.display = 'none';
        if (!bootstrapData && loadingMode === 'boot') {
            bootController.show({
                key: 'boot_loading_library',
                fallbackText: 'Loading library'
            });
        }

        // Onboarding consent check
        if (config && config.telemetryEnabled === undefined) {
            if (refs.telemetryModal) {
                refs.telemetryModal.style.display = 'flex';
            }
        }

        const nextGames = bootstrapData ? (bootstrapData.games || []) : await electronAPI.invoke('get-games');
        const nextCategoryTree = bootstrapData ? (bootstrapData.categoryTree || []) : await electronAPI.invoke('get-category-tree');
        if (typeof setCategoryTree === 'function') {
            setCategoryTree(nextCategoryTree);
        }
        setAllGames(nextGames, config);
        sortGames(getCurrentSort());
        bootController.hide();
    }

    async function handleRefreshLibrary(): Promise<void> {
        if (refreshInFlight) return;
        refreshInFlight = true;
        const startedAt = Date.now();
        setRefreshUiState(true);
        try {
            await initApp(null, { loadingMode: 'refresh' });
        } finally {
            const remainingMs = REFRESH_MIN_SPINNER_MS - (Date.now() - startedAt);
            if (remainingMs > 0) {
                await new Promise((resolve) => setTimeout(resolve, remainingMs));
            }
            refreshInFlight = false;
            setRefreshUiState(false);
        }
    }

    async function handleLibraryConfigChange(updates: any): Promise<void> {
        await electronAPI.updateLibraryConfig(updates);
        await initApp();
    }

    async function handleSetupDefault(): Promise<void> {
        if (await electronAPI.setupLibrary('default')) {
            await initApp();
        }
    }

    async function handleSetupCustom(): Promise<void> {
        if (await electronAPI.setupLibrary('custom')) {
            await initApp();
        }
    }

    async function handleChangePath(): Promise<void> {
        if (await electronAPI.setupLibrary('custom')) {
            location.reload();
        }
    }

    function handleQuickFolderOpen(): void {
        electronAPI.openFolder();
    }

    return {
        handleChangePath,
        handleLibraryConfigChange,
        handleQuickFolderOpen,
        handleRefreshLibrary,
        handleSetupCustom,
        handleSetupDefault,
        initApp
    };
}
