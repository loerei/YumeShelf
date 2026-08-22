const DEFAULT_MAX_DEPTH = 5;
const MIN_MAX_DEPTH = 0;
const MAX_MAX_DEPTH = 12;
const DEFAULT_LOCATION_DISPLAY_MODE = 'parent';
const DEFAULT_TITLE_DISPLAY_MODE = 'metadata';

function clampMaxDepth(value: number | string | null | undefined): number {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(parsed)) return DEFAULT_MAX_DEPTH;
    return Math.min(MAX_MAX_DEPTH, Math.max(MIN_MAX_DEPTH, parsed));
}

export interface SettingsControllerOptions {
    onOpen?: () => void;
    container: HTMLElement;
    mascotWidget?: any;
    hideAndSeekController?: any;
    getAllGames?: () => any[];
    getStrings?: () => any;
}

export interface SettingsController {
    applyLibraryConfig: (libraryConfig?: any) => void;
    closeSettings: () => void;
    getBootstrapPreferences: () => { appUpdatesMode: string; languagePackUpdatesMode: string };
    getLocationDisplayMode: () => string;
    getTitleDisplayMode: () => string;
    getDisplayProductCodes: () => boolean;
    handleAppUpdatesChange: (nextMode: string) => void;
    handleLanguagePackUpdatesChange: (nextMode: string) => void;
    handleLocationDisplayModeChange: (nextMode: string) => string;
    handleTitleDisplayModeChange: (nextMode: string) => Promise<string>;
    handleDisplayProductCodesChange: (nextValue: string) => Promise<boolean>;
    handleMaxDepthChange: (nextValue: number | string) => number;
    handleMaxDepthStep: (delta: number) => number;
    handleThemeChange: (nextTheme: string) => void;
    handleAutoLaunchChange: (nextValue: string) => Promise<string>;
    handleMinimizeToTrayChange: (nextValue: string) => Promise<boolean>;
    handleExposeBetaChange: (nextValue: string) => Promise<boolean>;
    handleMascotShowChange: (nextValue: string) => void;
    handleHideAndSeekChange: (nextValue: string) => void;
    handleMascotScaleChange: (nextValue: string) => void;
    handleMascotSoundChange: (nextValue: string) => void;
    handleMascotVolumeChange: (nextValue: number | string) => void;
    initializeSettingsUI: (initialLibraryConfig?: any) => void;
    isSettingsOpen: () => boolean;
    openSettings: () => Promise<void>;
}

export function createSettingsController({
    onOpen,
    container,
    mascotWidget,
    hideAndSeekController,
    getAllGames,
    getStrings
}: SettingsControllerOptions): SettingsController {
    // Controller owns its DOM scope – querySelector within container only.
    const settingsOverlay       = container;
    const themeSelect           = container.querySelector('#theme-select') as HTMLSelectElement | null;
    const appUpdatesSelect      = container.querySelector('#app-updates-select') as HTMLSelectElement | null;
    const languagePackUpdatesSelect = container.querySelector('#language-pack-updates-select') as HTMLSelectElement | null;
    const locationDisplaySelect = container.querySelector('#location-display-select') as HTMLSelectElement | null;
    const titleDisplaySelect    = container.querySelector('#title-display-select') as HTMLSelectElement | null;
    const displayCodesSelect    = container.querySelector('#display-codes-select') as HTMLSelectElement | null;
    const maxDepthInput         = container.querySelector('#max-depth-input') as HTMLInputElement | null;
    const autoLaunchSelect      = container.querySelector('#auto-launch-select') as HTMLSelectElement | null;
    const minimizeToTraySelect  = container.querySelector('#minimize-to-tray-select') as HTMLSelectElement | null;
    const telemetrySelect       = container.querySelector('#telemetry-select') as HTMLSelectElement | null;
    const exposeBetaSelect      = container.querySelector('#expose-beta-select') as HTMLSelectElement | null;
    const mascotShowSelect      = container.querySelector('#mascot-show-select') as HTMLSelectElement | null;
    const hideAndSeekSelect     = container.querySelector('#hide-and-seek-select') as HTMLSelectElement | null;
    const mascotScaleSlider     = container.querySelector('#mascot-scale-slider') as HTMLInputElement | null;
    const mascotScaleValue      = container.querySelector('#mascot-scale-value') as HTMLElement | null;
    const mascotSoundSelect     = container.querySelector('#mascot-sound-select') as HTMLSelectElement | null;
    const mascotVolumeSlider    = container.querySelector('#mascot-volume-slider') as HTMLInputElement | null;
    const mascotVolumeValue     = container.querySelector('#mascot-volume-value') as HTMLElement | null;
    const libraryPathsContainer  = container.querySelector('#library-paths-container') as HTMLElement | null;
    const btnAddLibraryPath      = container.querySelector('#btn-add-library-path') as HTMLButtonElement | null;

    let currentTheme = localStorage.getItem('yumeshelf_theme') || 'system';
    let currentAppUpdates = localStorage.getItem('yumeshelf_app_updates_pref') || 'notify';
    let currentLanguagePackUpdates = localStorage.getItem('yumeshelf_language_pack_updates_pref') || 'automatic';
    let currentLocationDisplayMode = localStorage.getItem('yumeshelf_location_display_mode') || DEFAULT_LOCATION_DISPLAY_MODE;
    let currentTitleDisplayMode = localStorage.getItem('yumeshelf_title_display_mode') || DEFAULT_TITLE_DISPLAY_MODE;
    let currentDisplayProductCodes = localStorage.getItem('yumeshelf_display_product_codes') === 'true';
    let currentHideAndSeek = localStorage.getItem('yumeshelf_hide_and_seek') || 'out';
    let currentMaxDepth = DEFAULT_MAX_DEPTH;
    let currentAutoLaunch = 'off';
    let currentMinimizeToTray = false;
    let currentTelemetry = 'off';
    let currentExposeBeta = false;
    let currentMascotShow = localStorage.getItem('yumeshelf_mascot_show') || 'on';
    let currentMascotScale = localStorage.getItem('yumeshelf_mascot_scale') || '100';
    let currentMascotSound = localStorage.getItem('yumeshelf_mascot_sound') || 'squeaker';
    let currentMascotVolume = localStorage.getItem('yumeshelf_mascot_volume') || '20';

    async function openSettings(): Promise<void> {
        if (typeof onOpen === 'function') {
            onOpen();
        }
        try {
            const freshConfig = await (window as any).electronAPI.checkConfig();
            const actualAutoLaunch = await (window as any).electronAPI.getAutoLaunch();
            if (freshConfig) {
                applyLibraryConfig({
                    ...freshConfig,
                    autoLaunch: actualAutoLaunch
                });
            } else {
                applyLibraryConfig({
                    maxDepth: currentMaxDepth,
                    autoLaunch: actualAutoLaunch,
                    minimizeToTray: currentMinimizeToTray,
                    titleDisplayMode: currentTitleDisplayMode,
                    displayProductCodes: currentDisplayProductCodes
                });
            }
        } catch (error) {
            console.error('[SETTINGS] Failed to sync config on open:', error);
        }

        const games = typeof getAllGames === 'function' ? getAllGames() : [];
        if (hideAndSeekSelect) {
            if (!games || games.length === 0) {
                hideAndSeekSelect.disabled = true;
                hideAndSeekSelect.style.opacity = '0.5';
                hideAndSeekSelect.style.cursor = 'not-allowed';
            } else {
                hideAndSeekSelect.disabled = false;
                hideAndSeekSelect.style.opacity = '1';
                hideAndSeekSelect.style.cursor = 'pointer';
            }
        }

        settingsOverlay.style.display = 'flex';
    }

    function closeSettings(): void {
        settingsOverlay.style.display = 'none';
    }

    function isSettingsOpen(): boolean {
        return settingsOverlay.style.display === 'flex';
    }

    function initializeSettingsUI(initialLibraryConfig: any = null): void {
        applyLibraryConfig(initialLibraryConfig);
        document.body.className = `${currentTheme}-theme`;
        if (themeSelect) themeSelect.value = currentTheme;
        if (appUpdatesSelect) appUpdatesSelect.value = currentAppUpdates;
        if (languagePackUpdatesSelect) languagePackUpdatesSelect.value = currentLanguagePackUpdates;
        if (locationDisplaySelect) locationDisplaySelect.value = currentLocationDisplayMode;
        if (titleDisplaySelect) titleDisplaySelect.value = currentTitleDisplayMode;
        if (displayCodesSelect) displayCodesSelect.value = currentDisplayProductCodes ? 'on' : 'off';
        if (autoLaunchSelect) autoLaunchSelect.value = currentAutoLaunch;
        if (minimizeToTraySelect) minimizeToTraySelect.value = currentMinimizeToTray ? 'on' : 'off';
        if (telemetrySelect) telemetrySelect.value = currentTelemetry;
        if (exposeBetaSelect) exposeBetaSelect.value = currentExposeBeta ? 'on' : 'off';
        if (mascotShowSelect) mascotShowSelect.value = currentMascotShow;
        if (hideAndSeekSelect) hideAndSeekSelect.value = currentHideAndSeek;
        if (mascotScaleSlider) mascotScaleSlider.value = String(currentMascotScale);
        if (mascotScaleValue) mascotScaleValue.textContent = `${currentMascotScale}%`;
        if (mascotSoundSelect) mascotSoundSelect.value = currentMascotSound;
        if (mascotVolumeSlider) mascotVolumeSlider.value = String(currentMascotVolume);
        if (mascotVolumeValue) mascotVolumeValue.textContent = `${currentMascotVolume}%`;
    }

    function handleMascotShowChange(nextValue: string): void {
        currentMascotShow = nextValue;
        localStorage.setItem('yumeshelf_mascot_show', nextValue);
        if (mascotWidget?.setVisible) {
            mascotWidget.setVisible(nextValue === 'on');
        }
    }

    function handleHideAndSeekChange(nextValue: string): void {
        currentHideAndSeek = nextValue;
        if (hideAndSeekController?.setSetting) {
            hideAndSeekController.setSetting(nextValue === 'yeaaa');
        } else {
            localStorage.setItem('yumeshelf_hide_and_seek', nextValue);
        }
    }

    function handleMascotScaleChange(nextValue: string | number): void {
        currentMascotScale = String(nextValue);
        localStorage.setItem('yumeshelf_mascot_scale', String(nextValue));
        if (mascotScaleValue) {
            mascotScaleValue.textContent = `${nextValue}%`;
        }
        if (mascotWidget?.setScale) {
            mascotWidget.setScale(nextValue);
        }
    }

    function handleMascotSoundChange(nextValue: string): void {
        currentMascotSound = nextValue;
        localStorage.setItem('yumeshelf_mascot_sound', nextValue);
        if (mascotWidget?.setSound) {
            mascotWidget.setSound(nextValue);
        }
    }

    function handleMascotVolumeChange(nextValue: number | string): void {
        currentMascotVolume = String(nextValue);
        localStorage.setItem('yumeshelf_mascot_volume', String(nextValue));
        if (mascotVolumeValue) {
            mascotVolumeValue.textContent = `${nextValue}%`;
        }
        if (mascotWidget?.setVolume) {
            mascotWidget.setVolume(nextValue);
        }
    }

    function handleThemeChange(nextTheme: string): void {
        currentTheme = nextTheme;
        document.body.className = `${nextTheme}-theme`;
        localStorage.setItem('yumeshelf_theme', nextTheme);
    }

    function handleAppUpdatesChange(nextMode: string): void {
        currentAppUpdates = nextMode;
        localStorage.setItem('yumeshelf_app_updates_pref', currentAppUpdates);
    }

    function handleLanguagePackUpdatesChange(nextMode: string): void {
        currentLanguagePackUpdates = nextMode;
        localStorage.setItem('yumeshelf_language_pack_updates_pref', currentLanguagePackUpdates);
    }

    function handleLocationDisplayModeChange(nextMode: string): string {
        currentLocationDisplayMode = nextMode === 'full' ? 'full' : DEFAULT_LOCATION_DISPLAY_MODE;
        localStorage.setItem('yumeshelf_location_display_mode', currentLocationDisplayMode);
        if (locationDisplaySelect) locationDisplaySelect.value = currentLocationDisplayMode;
        return currentLocationDisplayMode;
    }

    async function handleTitleDisplayModeChange(nextMode: string): Promise<string> {
        currentTitleDisplayMode = nextMode === 'legacy_folder' ? 'legacy_folder' : 'metadata';
        localStorage.setItem('yumeshelf_title_display_mode', currentTitleDisplayMode);
        if (titleDisplaySelect) titleDisplaySelect.value = currentTitleDisplayMode;
        await (window as any).electronAPI.updateLibraryConfig({ titleDisplayMode: currentTitleDisplayMode });
        return currentTitleDisplayMode;
    }

    async function handleDisplayProductCodesChange(nextValue: string): Promise<boolean> {
        const enabled = nextValue === 'on';
        currentDisplayProductCodes = enabled;
        localStorage.setItem('yumeshelf_display_product_codes', String(enabled));
        if (displayCodesSelect) displayCodesSelect.value = enabled ? 'on' : 'off';
        await (window as any).electronAPI.updateLibraryConfig({ displayProductCodes: enabled });
        return enabled;
    }

    function renderLibraryPaths(libraryPaths: string[]): void {
        if (!libraryPathsContainer) return;
        libraryPathsContainer.innerHTML = '';
        const paths = Array.isArray(libraryPaths) && libraryPaths.length > 0 ? libraryPaths : [];
        const canRemove = paths.length > 1;
        const d = typeof getStrings === 'function' ? getStrings() : {};
        const changeText = d.change || 'Change';
        const removeText = d.btn_remove || 'Remove';

        for (const p of paths) {
            const entry = document.createElement('div');
            entry.className = 'library-path-entry';

            // Folder icon
            entry.innerHTML = `
                <span class="library-path-icon">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                    </svg>
                </span>
                <span class="library-path-link" title="${p}">${p}</span>
                <div class="library-path-actions">
                    <button class="library-path-action-btn change-btn" type="button">${changeText}</button>
                    <button class="library-path-action-btn remove-btn" type="button" ${canRemove ? '' : 'disabled'}>${removeText}</button>
                </div>
            `;

            const pathLink = entry.querySelector('.library-path-link') as HTMLElement;
            pathLink.onclick = () => (window as any).electronAPI.openPath(p);

            const changeBtn = entry.querySelector('.change-btn') as HTMLButtonElement;
            changeBtn.onclick = async () => {
                const result = await (window as any).electronAPI.changeLibraryPath(p);
                if (result) location.reload();
            };

            const removeBtn = entry.querySelector('.remove-btn') as HTMLButtonElement;
            removeBtn.onclick = async () => {
                if (!canRemove) return;
                const result = await (window as any).electronAPI.removeLibraryPath(p);
                if (result) location.reload();
            };

            libraryPathsContainer.appendChild(entry);
        }
    }

    function applyLibraryConfig(libraryConfig: any = null): void {
        const config = libraryConfig || {};
        currentMaxDepth = clampMaxDepth(config.maxDepth);
        currentAutoLaunch = config.autoLaunch || 'off';
        currentMinimizeToTray = !!config.minimizeToTray;
        currentTelemetry = config.telemetry || 'off';
        currentExposeBeta = !!config.exposeBetaOptions;

        if (maxDepthInput) maxDepthInput.value = String(currentMaxDepth);
        if (autoLaunchSelect) autoLaunchSelect.value = currentAutoLaunch;
        if (minimizeToTraySelect) minimizeToTraySelect.value = currentMinimizeToTray ? 'on' : 'off';
        if (telemetrySelect) telemetrySelect.value = currentTelemetry;
        if (exposeBetaSelect) exposeBetaSelect.value = currentExposeBeta ? 'on' : 'off';

        if (config.libraryPaths) {
            renderLibraryPaths(config.libraryPaths);
        }
    }

    function handleMaxDepthChange(nextValue: number | string): number {
        const clamped = clampMaxDepth(nextValue);
        currentMaxDepth = clamped;
        if (maxDepthInput) maxDepthInput.value = String(clamped);
        return clamped;
    }

    function handleMaxDepthStep(delta: number): number {
        const next = currentMaxDepth + delta;
        return handleMaxDepthChange(next);
    }

    async function handleAutoLaunchChange(nextValue: string): Promise<string> {
        currentAutoLaunch = nextValue;
        const actualState = await (window as any).electronAPI.setAutoLaunch(nextValue);
        currentAutoLaunch = actualState;
        if (autoLaunchSelect) autoLaunchSelect.value = actualState;
        return actualState;
    }

    async function handleMinimizeToTrayChange(nextValue: string): Promise<boolean> {
        const enabled = nextValue === 'on';
        currentMinimizeToTray = enabled;
        (window as any).electronAPI.setMinimizeToTray(enabled);
        await (window as any).electronAPI.updateLibraryConfig({ minimizeToTray: enabled });
        return enabled;
    }

    async function handleExposeBetaChange(nextValue: string): Promise<boolean> {
        const enabled = nextValue === 'on';
        currentExposeBeta = enabled;
        await (window as any).electronAPI.updateLibraryConfig({ exposeBetaOptions: enabled });
        return enabled;
    }

    function getBootstrapPreferences(): { appUpdatesMode: string; languagePackUpdatesMode: string } {
        return {
            appUpdatesMode: currentAppUpdates,
            languagePackUpdatesMode: currentLanguagePackUpdates
        };
    }

    if (btnAddLibraryPath) {
        btnAddLibraryPath.onclick = async () => {
            const result = await (window as any).electronAPI.addLibraryPath();
            if (result) location.reload();
        };
    }

    return {
        applyLibraryConfig,
        closeSettings,
        getBootstrapPreferences,
        getLocationDisplayMode: () => currentLocationDisplayMode,
        getTitleDisplayMode: () => currentTitleDisplayMode,
        getDisplayProductCodes: () => currentDisplayProductCodes,
        handleAppUpdatesChange,
        handleLanguagePackUpdatesChange,
        handleLocationDisplayModeChange,
        handleTitleDisplayModeChange,
        handleDisplayProductCodesChange,
        handleMaxDepthChange,
        handleMaxDepthStep,
        handleThemeChange,
        handleAutoLaunchChange,
        handleMinimizeToTrayChange,
        handleExposeBetaChange,
        handleMascotShowChange,
        handleHideAndSeekChange,
        handleMascotScaleChange,
        handleMascotSoundChange,
        handleMascotVolumeChange,
        initializeSettingsUI,
        isSettingsOpen,
        openSettings
    };
}
