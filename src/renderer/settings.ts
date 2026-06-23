const DEFAULT_MAX_DEPTH = 5;
const MIN_MAX_DEPTH = 0;
const MAX_MAX_DEPTH = 12;
const DEFAULT_LOCATION_DISPLAY_MODE = 'parent';

function clampMaxDepth(value: number | string | null | undefined): number {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(parsed)) return DEFAULT_MAX_DEPTH;
    return Math.min(MAX_MAX_DEPTH, Math.max(MIN_MAX_DEPTH, parsed));
}

export interface SettingsControllerOptions {
    onOpen?: () => void;
    container: HTMLElement;
}

export interface SettingsController {
    applyLibraryConfig: (libraryConfig?: any) => void;
    closeSettings: () => void;
    getBootstrapPreferences: () => { appUpdatesMode: string; languagePackUpdatesMode: string };
    getLocationDisplayMode: () => string;
    handleAppUpdatesChange: (nextMode: string) => void;
    handleLanguagePackUpdatesChange: (nextMode: string) => void;
    handleLocationDisplayModeChange: (nextMode: string) => string;
    handleMaxDepthChange: (nextValue: number | string) => number;
    handleMaxDepthStep: (delta: number) => number;
    handleThemeChange: (nextTheme: string) => void;
    handleAutoLaunchChange: (nextValue: string) => Promise<string>;
    handleMinimizeToTrayChange: (nextValue: string) => Promise<boolean>;
    initializeSettingsUI: (initialLibraryConfig?: any) => void;
    isSettingsOpen: () => boolean;
    openSettings: () => Promise<void>;
}

export function createSettingsController({
    onOpen,
    container
}: SettingsControllerOptions): SettingsController {
    // Controller owns its DOM scope – querySelector within container only.
    const settingsOverlay       = container;
    const themeSelect           = container.querySelector('#theme-select') as HTMLSelectElement | null;
    const appUpdatesSelect      = container.querySelector('#app-updates-select') as HTMLSelectElement | null;
    const languagePackUpdatesSelect = container.querySelector('#language-pack-updates-select') as HTMLSelectElement | null;
    const locationDisplaySelect = container.querySelector('#location-display-select') as HTMLSelectElement | null;
    const maxDepthInput         = container.querySelector('#max-depth-input') as HTMLInputElement | null;
    const maxDepthDecreaseBtn   = container.querySelector('#max-depth-decrease-btn') as HTMLButtonElement | null;
    const maxDepthIncreaseBtn   = container.querySelector('#max-depth-increase-btn') as HTMLButtonElement | null;
    const autoLaunchSelect      = container.querySelector('#auto-launch-select') as HTMLSelectElement | null;
    const minimizeToTraySelect  = container.querySelector('#minimize-to-tray-select') as HTMLSelectElement | null;
    const telemetrySelect       = container.querySelector('#telemetry-select') as HTMLSelectElement | null;
    const libraryPathsContainer  = container.querySelector('#library-paths-container') as HTMLElement | null;
    const btnAddLibraryPath      = container.querySelector('#btn-add-library-path') as HTMLButtonElement | null;

    let currentTheme = localStorage.getItem('yumeshelf_theme') || 'system';
    let currentAppUpdates = localStorage.getItem('yumeshelf_app_updates_pref') || 'notify';
    let currentLanguagePackUpdates = localStorage.getItem('yumeshelf_language_pack_updates_pref') || 'automatic';
    let currentLocationDisplayMode = localStorage.getItem('yumeshelf_location_display_mode') || DEFAULT_LOCATION_DISPLAY_MODE;
    let currentMaxDepth = DEFAULT_MAX_DEPTH;
    let currentAutoLaunch = 'off';
    let currentMinimizeToTray = false;
    let currentTelemetry = 'off';

    async function openSettings(): Promise<void> {
        if (typeof onOpen === 'function') {
            onOpen();
        }
        try {
            const freshConfig = await (globalThis as any).electronAPI.invoke('check-config');
            const actualAutoLaunch = await (globalThis as any).electronAPI.invoke('get-auto-launch');
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
        if (autoLaunchSelect) autoLaunchSelect.value = currentAutoLaunch;
        if (minimizeToTraySelect) minimizeToTraySelect.value = currentMinimizeToTray ? 'on' : 'off';
        if (telemetrySelect) telemetrySelect.value = currentTelemetry;
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

    function renderLibraryPaths(libraryPaths: string[]): void {
        if (!libraryPathsContainer) return;
        libraryPathsContainer.innerHTML = '';
        const paths = Array.isArray(libraryPaths) && libraryPaths.length > 0 ? libraryPaths : [];
        const canRemove = paths.length > 1;

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
                    <button class="library-path-action-btn change-btn" type="button">Change</button>
                    <button class="library-path-action-btn remove-btn" type="button" ${canRemove ? '' : 'disabled'}>Remove</button>
                </div>
            `;

            const pathLink = entry.querySelector('.library-path-link') as HTMLElement;
            pathLink.onclick = () => (globalThis as any).electronAPI.send('open-path', p);

            const changeBtn = entry.querySelector('.change-btn') as HTMLButtonElement;
            changeBtn.onclick = async () => {
                const result = await (globalThis as any).electronAPI.invoke('library:change-path', p);
                if (result) location.reload();
            };

            const removeBtn = entry.querySelector('.remove-btn') as HTMLButtonElement;
            removeBtn.onclick = async () => {
                if (!canRemove) return;
                const result = await (globalThis as any).electronAPI.invoke('library:remove-path', p);
                if (result) location.reload();
            };

            libraryPathsContainer.appendChild(entry);
        }
    }

    function applyLibraryConfig(libraryConfig: any = null): void {
        currentMaxDepth = clampMaxDepth(libraryConfig?.maxDepth);
        if (maxDepthInput) maxDepthInput.value = String(currentMaxDepth);
        if (maxDepthDecreaseBtn) maxDepthDecreaseBtn.disabled = currentMaxDepth <= MIN_MAX_DEPTH;
        if (maxDepthIncreaseBtn) maxDepthIncreaseBtn.disabled = currentMaxDepth >= MAX_MAX_DEPTH;

        let paths: string[] = [];
        if (Array.isArray(libraryConfig?.libraryPaths)) {
            paths = libraryConfig.libraryPaths;
        } else if (libraryConfig?.libraryPath) {
            paths = [libraryConfig.libraryPath];
        }
        renderLibraryPaths(paths);

        if (libraryConfig) {
            if (libraryConfig.autoLaunch === 'minimized') {
                currentAutoLaunch = 'minimized';
            } else if (libraryConfig.autoLaunch === true || libraryConfig.autoLaunch === 'on') {
                currentAutoLaunch = 'on';
            } else {
                currentAutoLaunch = 'off';
            }
            currentMinimizeToTray = !!libraryConfig.minimizeToTray;
            if (autoLaunchSelect) autoLaunchSelect.value = currentAutoLaunch;
            if (minimizeToTraySelect) minimizeToTraySelect.value = currentMinimizeToTray ? 'on' : 'off';
            
            currentTelemetry = libraryConfig.telemetryEnabled ? 'on' : 'off';
            if (telemetrySelect) telemetrySelect.value = currentTelemetry;
        }
    }

    function handleMaxDepthChange(nextValue: number | string): number {
        currentMaxDepth = clampMaxDepth(nextValue);
        applyLibraryConfig({
            maxDepth: currentMaxDepth,
            autoLaunch: currentAutoLaunch,
            minimizeToTray: currentMinimizeToTray,
            telemetryEnabled: currentTelemetry === 'on'
        });
        return currentMaxDepth;
    }

    function handleMaxDepthStep(delta: number): number {
        return handleMaxDepthChange(currentMaxDepth + delta);
    }

    async function handleAutoLaunchChange(nextValue: string): Promise<string> {
        currentAutoLaunch = nextValue;
        await (globalThis as any).electronAPI.invoke('set-auto-launch', nextValue);
        await (globalThis as any).electronAPI.invoke('update-library-config', { autoLaunch: nextValue });
        return nextValue;
    }

    async function handleMinimizeToTrayChange(nextValue: string): Promise<boolean> {
        const enabled = nextValue === 'on';
        currentMinimizeToTray = enabled;
        (globalThis as any).electronAPI.send('set-minimize-to-tray', enabled);
        await (globalThis as any).electronAPI.invoke('update-library-config', { minimizeToTray: enabled });
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
            const result = await (globalThis as any).electronAPI.invoke('library:add-path');
            if (result) location.reload();
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
