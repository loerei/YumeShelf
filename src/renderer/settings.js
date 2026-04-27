export function createSettingsController({
    refs
}) {
    let currentTheme = localStorage.getItem('yumeshelf_theme') || 'system';
    let currentAppUpdates = localStorage.getItem('yumeshelf_app_updates_pref') || 'notify';
    let currentLanguagePackUpdates = localStorage.getItem('yumeshelf_language_pack_updates_pref') || 'automatic';

    function openSettings() {
        refs.settingsOverlay.style.display = 'flex';
    }

    function closeSettings() {
        refs.settingsOverlay.style.display = 'none';
    }

    function isSettingsOpen() {
        return refs.settingsOverlay.style.display === 'flex';
    }

    function initializeSettingsUI() {
        document.body.className = `${currentTheme}-theme`;
        refs.themeSelect.value = currentTheme;
        refs.appUpdatesSelect.value = currentAppUpdates;
        refs.languagePackUpdatesSelect.value = currentLanguagePackUpdates;
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

    function getBootstrapPreferences() {
        return {
            appUpdatesMode: currentAppUpdates,
            languagePackUpdatesMode: currentLanguagePackUpdates
        };
    }

    return {
        closeSettings,
        getBootstrapPreferences,
        handleAppUpdatesChange,
        handleLanguagePackUpdatesChange,
        handleThemeChange,
        initializeSettingsUI,
        isSettingsOpen,
        openSettings
    };
}
