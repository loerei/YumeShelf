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
    refs
}) {
    let currentTheme = localStorage.getItem('yumeshelf_theme') || 'system';
    let currentAppUpdates = localStorage.getItem('yumeshelf_app_updates_pref') || 'notify';
    let currentLanguagePackUpdates = localStorage.getItem('yumeshelf_language_pack_updates_pref') || 'automatic';
    let currentLocationDisplayMode = localStorage.getItem('yumeshelf_location_display_mode') || DEFAULT_LOCATION_DISPLAY_MODE;
    let currentMaxDepth = DEFAULT_MAX_DEPTH;

    function openSettings() {
        refs.settingsOverlay.style.display = 'flex';
    }

    function closeSettings() {
        refs.settingsOverlay.style.display = 'none';
    }

    function isSettingsOpen() {
        return refs.settingsOverlay.style.display === 'flex';
    }

    function initializeSettingsUI(initialLibraryConfig = null) {
        applyLibraryConfig(initialLibraryConfig);
        document.body.className = `${currentTheme}-theme`;
        refs.themeSelect.value = currentTheme;
        refs.appUpdatesSelect.value = currentAppUpdates;
        refs.languagePackUpdatesSelect.value = currentLanguagePackUpdates;
        refs.locationDisplaySelect.value = currentLocationDisplayMode;
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
        refs.locationDisplaySelect.value = currentLocationDisplayMode;
        return currentLocationDisplayMode;
    }

    function applyLibraryConfig(libraryConfig = null) {
        currentMaxDepth = clampMaxDepth(libraryConfig?.maxDepth);
        refs.maxDepthInput.value = String(currentMaxDepth);
        refs.maxDepthDecreaseBtn.disabled = currentMaxDepth <= MIN_MAX_DEPTH;
        refs.maxDepthIncreaseBtn.disabled = currentMaxDepth >= MAX_MAX_DEPTH;
    }

    function handleMaxDepthChange(nextValue) {
        currentMaxDepth = clampMaxDepth(nextValue);
        applyLibraryConfig({ maxDepth: currentMaxDepth });
        return currentMaxDepth;
    }

    function handleMaxDepthStep(delta) {
        return handleMaxDepthChange(currentMaxDepth + delta);
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
        initializeSettingsUI,
        isSettingsOpen,
        openSettings
    };
}
