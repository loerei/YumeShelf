// @ts-nocheck
export function createStartupController({
    applyUIStrings,
    bootController,
    electronAPI,
    getCurrentSort,
    refs,
    setCategoryTree,
    setAllGames,
    sortGames
}) {
    let refreshInFlight = false;
    const REFRESH_MIN_SPINNER_MS = 300;

    function setRefreshUiState(isRefreshing) {
        refs.refreshLibraryBtn?.classList.toggle('is-refreshing', isRefreshing);
        refs.refreshLibraryBtn?.toggleAttribute('disabled', isRefreshing);
        refs.refreshLibraryBtn?.setAttribute('aria-busy', isRefreshing ? 'true' : 'false');
        refs.gameGridWrapper?.classList.toggle('is-refreshing', isRefreshing);
    }

    async function initApp(bootstrapData = null, options = {}) {
        const loadingMode = options.loadingMode || 'boot';
        const config = bootstrapData ? bootstrapData.config : await electronAPI.checkConfig();
        if (!config || !config.libraryPath) {
            bootController.hide();
            refs.welcome.style.display = 'flex';
            applyUIStrings();
            return;
        }

        refs.welcome.style.display = 'none';
        if (!bootstrapData && loadingMode === 'boot') {
            bootController.show({
                key: 'boot_loading_library',
                fallbackText: 'Loading library'
            });
        }

        const nextGames = bootstrapData ? (bootstrapData.games || []) : await electronAPI.getGames();
        const nextCategoryTree = bootstrapData ? (bootstrapData.categoryTree || []) : await electronAPI.getCategoryTree();
        if (typeof setCategoryTree === 'function') {
            setCategoryTree(nextCategoryTree);
        }
        setAllGames(nextGames, config);
        sortGames(getCurrentSort());
        bootController.hide();
    }

    async function handleRefreshLibrary() {
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

    async function handleLibraryConfigChange(updates) {
        await electronAPI.updateLibraryConfig(updates);
        await initApp();
    }

    async function handleSetupDefault() {
        if (await electronAPI.setupLibrary('default')) {
            await initApp();
        }
    }

    async function handleSetupCustom() {
        if (await electronAPI.setupLibrary('custom')) {
            await initApp();
        }
    }

    async function handleChangePath() {
        if (await electronAPI.setupLibrary('custom')) {
            location.reload();
        }
    }

    function handleQuickFolderOpen() {
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
