// @ts-nocheck
const DEFAULT_MAX_DEPTH = 5;
const MIN_MAX_DEPTH = 0;
const MAX_MAX_DEPTH = 12;
const DEFAULT_LOCATION_DISPLAY_MODE = 'parent';

function clampMaxDepth(value) {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(parsed)) return DEFAULT_MAX_DEPTH;
    return Math.min(MAX_MAX_DEPTH, Math.max(MIN_MAX_DEPTH, parsed));
}

export function createSettingsController({
    onOpen,
    container
}) {
    // Controller owns its DOM scope – querySelector within container only.
    const settingsOverlay       = container;
    const themeSelect           = container.querySelector('#theme-select');
    const appUpdatesSelect      = container.querySelector('#app-updates-select');
    const languagePackUpdatesSelect = container.querySelector('#language-pack-updates-select');
    const locationDisplaySelect = container.querySelector('#location-display-select');
    const maxDepthInput         = container.querySelector('#max-depth-input');
    const maxDepthDecreaseBtn   = container.querySelector('#max-depth-decrease-btn');
    const maxDepthIncreaseBtn   = container.querySelector('#max-depth-increase-btn');
    const autoLaunchSelect      = container.querySelector('#auto-launch-select');
    const minimizeToTraySelect  = container.querySelector('#minimize-to-tray-select');

    let currentTheme = localStorage.getItem('yumeshelf_theme') || 'system';
    let currentAppUpdates = localStorage.getItem('yumeshelf_app_updates_pref') || 'notify';
    let currentLanguagePackUpdates = localStorage.getItem('yumeshelf_language_pack_updates_pref') || 'automatic';
    let currentLocationDisplayMode = localStorage.getItem('yumeshelf_location_display_mode') || DEFAULT_LOCATION_DISPLAY_MODE;
    let currentMaxDepth = DEFAULT_MAX_DEPTH;
    let currentAutoLaunch = 'off';
    let currentMinimizeToTray = false;

    async function openSettings() {
        if (typeof onOpen === 'function') {
            onOpen();
        }
        try {
            const freshConfig = await window.electronAPI.checkConfig();
            const actualAutoLaunch = await window.electronAPI.getAutoLaunch();
            if (freshConfig) {
                applyLibraryConfig({
                    ...freshConfig,
                    autoLaunch: actualAutoLaunch
                });
            } else {
                applyLibraryConfig({
                    maxDepth: currentMaxDepth,
                    autoLaunch: actualAutoLaunch,
                    minimizeToTray: currentMinimizeToTray
                });
            }
        } catch (error) {
            console.error('[SETTINGS] Failed to sync config on open:', error);
        }
        settingsOverlay.style.display = 'flex';
    }

    function closeSettings() {
        settingsOverlay.style.display = 'none';
    }

    function isSettingsOpen() {
        return settingsOverlay.style.display === 'flex';
    }

    function initializeSettingsUI(initialLibraryConfig = null) {
        applyLibraryConfig(initialLibraryConfig);
        document.body.className = `${currentTheme}-theme`;
        themeSelect.value = currentTheme;
        appUpdatesSelect.value = currentAppUpdates;
        languagePackUpdatesSelect.value = currentLanguagePackUpdates;
        locationDisplaySelect.value = currentLocationDisplayMode;
        autoLaunchSelect.value = currentAutoLaunch;
        minimizeToTraySelect.value = currentMinimizeToTray ? 'on' : 'off';
    }

    function handleThemeChange(nextTheme) {
        currentTheme = nextTheme;
        document.body.className = `${nextTheme}-theme`;
        localStorage.setItem('yumeshelf_theme', nextTheme);
    }

    function handleAppUpdatesChange(nextMode) {
        currentAppUpdates = nextMode;
        localStorage.setItem('yumeshelf_app_updates_pref', currentAppUpdates);
    }

    function handleLanguagePackUpdatesChange(nextMode) {
        currentLanguagePackUpdates = nextMode;
        localStorage.setItem('yumeshelf_language_pack_updates_pref', currentLanguagePackUpdates);
    }

    function handleLocationDisplayModeChange(nextMode) {
        currentLocationDisplayMode = nextMode === 'full' ? 'full' : DEFAULT_LOCATION_DISPLAY_MODE;
        localStorage.setItem('yumeshelf_location_display_mode', currentLocationDisplayMode);
        locationDisplaySelect.value = currentLocationDisplayMode;
        return currentLocationDisplayMode;
    }

    function applyLibraryConfig(libraryConfig = null) {
        currentMaxDepth = clampMaxDepth(libraryConfig?.maxDepth);
        maxDepthInput.value = String(currentMaxDepth);
        maxDepthDecreaseBtn.disabled = currentMaxDepth <= MIN_MAX_DEPTH;
        maxDepthIncreaseBtn.disabled = currentMaxDepth >= MAX_MAX_DEPTH;
        if (libraryConfig) {
            if (libraryConfig.autoLaunch === 'minimized') {
                currentAutoLaunch = 'minimized';
            } else if (libraryConfig.autoLaunch === true || libraryConfig.autoLaunch === 'on') {
                currentAutoLaunch = 'on';
            } else {
                currentAutoLaunch = 'off';
            }
            currentMinimizeToTray = !!libraryConfig.minimizeToTray;
            autoLaunchSelect.value = currentAutoLaunch;
            minimizeToTraySelect.value = currentMinimizeToTray ? 'on' : 'off';
        }
    }

    function handleMaxDepthChange(nextValue) {
        currentMaxDepth = clampMaxDepth(nextValue);
        applyLibraryConfig({
            maxDepth: currentMaxDepth,
            autoLaunch: currentAutoLaunch,
            minimizeToTray: currentMinimizeToTray
        });
        return currentMaxDepth;
    }

    function handleMaxDepthStep(delta) {
        return handleMaxDepthChange(currentMaxDepth + delta);
    }

    async function handleAutoLaunchChange(nextValue) {
        currentAutoLaunch = nextValue;
        await window.electronAPI.setAutoLaunch(nextValue);
        await window.electronAPI.updateLibraryConfig({ autoLaunch: nextValue });
        return nextValue;
    }

    async function handleMinimizeToTrayChange(nextValue) {
        const enabled = nextValue === 'on';
        currentMinimizeToTray = enabled;
        window.electronAPI.setMinimizeToTray(enabled);
        await window.electronAPI.updateLibraryConfig({ minimizeToTray: enabled });
        return enabled;
    }

    function getBootstrapPreferences() {
        return {
            appUpdatesMode: currentAppUpdates,
            languagePackUpdatesMode: currentLanguagePackUpdates
        };
    }

    return {
        applyLibraryConfig,
        closeSettings,
        getBootstrapPreferences,
        getLocationDisplayMode: () => currentLocationDisplayMode,
        handleAppUpdatesChange,
        handleLanguagePackUpdatesChange,
        handleLocationDisplayModeChange,
        handleMaxDepthChange,
        handleMaxDepthStep,
        handleThemeChange,
        handleAutoLaunchChange,
        handleMinimizeToTrayChange,
        initializeSettingsUI,
        isSettingsOpen,
        openSettings
    };
}
