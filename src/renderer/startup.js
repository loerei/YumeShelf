export function createStartupController({
    applyUIStrings,
    bootController,
    electronAPI,
    getCurrentSort,
    refs,
    setAllGames,
    sortGames
}) {
    async function initApp(bootstrapData = null) {
        const config = bootstrapData ? bootstrapData.config : await electronAPI.checkConfig();
        if (!config) {
            bootController.hide();
            refs.welcome.style.display = 'flex';
            applyUIStrings();
            return;
        }

        refs.welcome.style.display = 'none';
        if (!bootstrapData) {
            bootController.show({
                key: 'boot_loading_library',
                fallbackText: 'Loading library'
            });
        }

        const nextGames = bootstrapData ? (bootstrapData.games || []) : await electronAPI.getGames();
        setAllGames(nextGames);
        sortGames(getCurrentSort());
        bootController.hide();
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
        handleQuickFolderOpen,
        handleSetupCustom,
        handleSetupDefault,
        initApp
    };
}
