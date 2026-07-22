import { RendererRefs } from '../bootstrap/dom-refs';

export interface BindGlobalUiEventsOptions {
    categoryFilterController: any;
    refs: RendererRefs;
    settingsController: any;
    duplicateStackOverlayController: any;
    closeLanguagePackModal: () => void;
}

export interface BindWindowStatusEventsController {
    refreshAppVersionLink: () => void;
}

export interface BindControlEventsOptions {
    refs: RendererRefs;
    settingsController: any;
    localeController: any;
    languagePackController: any;
    startupController: any;
    searchController: any;
    sortGames: (sort: string) => void;
    reannotateGames: () => void;
    currentSort: () => string;
    setCurrentLanguage: (lang: string) => void;
}

export function bindGlobalUiEvents({
    categoryFilterController,
    refs,
    settingsController,
    duplicateStackOverlayController,
    closeLanguagePackModal
}: BindGlobalUiEventsOptions): void {
    window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            const saveEditorOverlay = document.querySelector('.save-editor-overlay');
            if (saveEditorOverlay) {
                const closeBtn = saveEditorOverlay.querySelector('.save-editor-close') as HTMLElement | null;
                if (closeBtn) closeBtn.click();
            } else if (refs.languagePackOverlay?.style.display === 'flex') {
                closeLanguagePackModal();
            } else if (duplicateStackOverlayController.isOpen()) {
                duplicateStackOverlayController.close();
            } else if (settingsController.isSettingsOpen()) {
                settingsController.closeSettings();
            }
        }
    });

    document.addEventListener('click', (event) => {
        const target = event.target as HTMLElement;
        if (refs.searchInput && refs.searchDropdown && !refs.searchInput.contains(target) && !refs.searchDropdown.contains(target)) {
            refs.searchDropdown.classList.remove('show');
        }
        if (target && !target.closest('.dropdown-menu') && !target.closest('.menu-btn')) {
            document.querySelectorAll('.dropdown-menu').forEach(menu => menu.classList.remove('show'));
        }
        if (target && !target.closest('.sort-container')) {
            document.querySelectorAll('.sort-menu').forEach(menu => menu.classList.remove('show'));
        }
        if (target && !target.closest('.category-filter-container')) {
            categoryFilterController.hideMenu();
        }
    });
}

export function bindWindowStatusEvents(uiTextController: BindWindowStatusEventsController): void {
    window.addEventListener('online', () => {
        uiTextController.refreshAppVersionLink();
    });
    window.addEventListener('offline', () => {
        uiTextController.refreshAppVersionLink();
    });
}

export function bindControlEvents({
    refs,
    settingsController,
    localeController,
    languagePackController,
    startupController,
    searchController,
    sortGames,
    reannotateGames,
    currentSort,
    setCurrentLanguage
}: BindControlEventsOptions): void {
    if (refs.buttons.setupDefault) {
        refs.buttons.setupDefault.onclick = async () => { await startupController.handleSetupDefault(); };
    }
    if (refs.buttons.chooseCustom) {
        refs.buttons.chooseCustom.onclick = async () => { await startupController.handleSetupCustom(); };
    }
    if (refs.buttons.settingsOpen) {
        refs.buttons.settingsOpen.onclick = () => { settingsController.openSettings(); };
    }
    if (refs.buttons.settingsClose) {
        refs.buttons.settingsClose.onclick = () => { settingsController.closeSettings(); };
    }
    if (refs.buttons.languagePackClose) {
        refs.buttons.languagePackClose.onclick = () => languagePackController.closeLanguagePackModal();
    }
    if (refs.quickFolder) {
        refs.quickFolder.onclick = () => startupController.handleQuickFolderOpen();
    }
    if (refs.refreshLibraryBtn) {
        refs.refreshLibraryBtn.onclick = async () => { await startupController.handleRefreshLibrary(); };
    }
    if (refs.moreLanguagesBtn) {
        refs.moreLanguagesBtn.onclick = () => languagePackController.openLanguagePackModal();
    }
    if (refs.languagePackListBtn) {
        refs.languagePackListBtn.onclick = () => languagePackController.handleListClick();
    }
    if (refs.languagePackRefreshBtn) {
        refs.languagePackRefreshBtn.onclick = async () => languagePackController.handleRefreshClick();
    }
    if (refs.languagePackSearch) {
        refs.languagePackSearch.oninput = () => languagePackController.handleSearchInput();
    }

    if (refs.sortBtn && refs.sortMenu) {
        const sortContainer = refs.sortBtn.closest('.sort-container') as HTMLElement | null;
        if (sortContainer) {
            sortContainer.onmouseenter = () => {
                refs.sortMenu!.classList.add('show');
            };
            sortContainer.onmouseleave = () => {
                refs.sortMenu!.classList.remove('show');
            };
        }
        refs.sortBtn.onclick = (event) => {
            event.stopPropagation();
            refs.sortMenu!.classList.toggle('show');
        };
    }
    document.querySelectorAll('.sort-item').forEach((item) => {
        const htmlItem = item as HTMLElement;
        htmlItem.onclick = (event) => {
            event.stopPropagation();
            if (htmlItem.dataset.sort) {
                sortGames(htmlItem.dataset.sort);
            }
            if (refs.sortMenu) {
                refs.sortMenu.classList.remove('show');
            }
        };
    });

    if (refs.themeSelect) {
        refs.themeSelect.onchange = (event) => {
            settingsController.handleThemeChange((event.target as HTMLSelectElement).value);
        };
    }
    if (refs.appUpdatesSelect) {
        refs.appUpdatesSelect.onchange = (event) => {
            settingsController.handleAppUpdatesChange((event.target as HTMLSelectElement).value);
        };
    }
    if (refs.languagePackUpdatesSelect) {
        refs.languagePackUpdatesSelect.onchange = (event) => {
            settingsController.handleLanguagePackUpdatesChange((event.target as HTMLSelectElement).value);
        };
    }
    if (refs.autoLaunchSelect) {
        refs.autoLaunchSelect.onchange = async (event) => {
            const autoLaunch = await settingsController.handleAutoLaunchChange((event.target as HTMLSelectElement).value);
            await startupController.handleLibraryConfigChange({ autoLaunch });
        };
    }
    if (refs.minimizeToTraySelect) {
        refs.minimizeToTraySelect.onchange = async (event) => {
            const minimizeToTray = await settingsController.handleMinimizeToTrayChange((event.target as HTMLSelectElement).value);
            await startupController.handleLibraryConfigChange({ minimizeToTray });
        };
    }
    if (refs.exposeBetaSelect) {
        refs.exposeBetaSelect.onchange = async (event) => {
            const exposeBetaOptions = await settingsController.handleExposeBetaChange((event.target as HTMLSelectElement).value);
            await startupController.handleLibraryConfigChange({ exposeBetaOptions });
            reannotateGames();
            sortGames(currentSort());
        };
    }
    if (refs.locationDisplaySelect) {
        refs.locationDisplaySelect.onchange = (event) => {
            settingsController.handleLocationDisplayModeChange((event.target as HTMLSelectElement).value);
            reannotateGames();
            sortGames(currentSort());
        };
    }
    if (refs.maxDepthInput) {
        refs.maxDepthInput.onchange = async (event) => {
            const maxDepth = settingsController.handleMaxDepthChange((event.target as HTMLInputElement).value);
            await startupController.handleLibraryConfigChange({ maxDepth });
        };
        refs.maxDepthInput.oninput = (event) => {
            const inputEl = event.target as HTMLInputElement;
            inputEl.value = inputEl.value.replace(/[^\d]/g, '').slice(0, 2);
        };
    }
    if (refs.maxDepthIncreaseBtn) {
        refs.maxDepthIncreaseBtn.onclick = async () => {
            const maxDepth = settingsController.handleMaxDepthStep(1);
            await startupController.handleLibraryConfigChange({ maxDepth });
        };
    }
    if (refs.maxDepthDecreaseBtn) {
        refs.maxDepthDecreaseBtn.onclick = async () => {
            const maxDepth = settingsController.handleMaxDepthStep(-1);
            await startupController.handleLibraryConfigChange({ maxDepth });
        };
    }
    if (refs.maxDepthInput) {
        refs.maxDepthInput.onkeydown = async (event) => {
            if (!['ArrowUp', 'ArrowDown', 'Enter'].includes(event.key)) return;
            event.preventDefault();
            const inputEl = event.target as HTMLInputElement;
            let maxDepth: number;
            if (event.key === 'ArrowUp') {
                maxDepth = settingsController.handleMaxDepthStep(1);
            } else if (event.key === 'ArrowDown') {
                maxDepth = settingsController.handleMaxDepthStep(-1);
            } else {
                maxDepth = settingsController.handleMaxDepthChange(inputEl.value);
            }
            await startupController.handleLibraryConfigChange({ maxDepth });
        };
    }
    if (refs.langSelect) {
        refs.langSelect.onchange = (event) => {
            setCurrentLanguage((event.target as HTMLSelectElement).value);
        };
    }
    if (refs.searchInput) {
        refs.searchInput.oninput = (event) => searchController.updateSearch((event.target as HTMLInputElement).value);
        refs.searchInput.onfocus = (event) => searchController.updateSearch((event.target as HTMLInputElement).value);
    }

    // Telemetry Events binding
    if (refs.telemetrySelect) {
        refs.telemetrySelect.onchange = async (event) => {
            const selectEl = event.target as HTMLSelectElement;
            const enabled = selectEl.value === 'on';
            await (window as any).electronAPI.updateLibraryConfig({ telemetryEnabled: enabled });
        };
    }

    if (refs.buttons.telemetryOptIn) {
        refs.buttons.telemetryOptIn.onclick = async () => {
            await (window as any).electronAPI.updateLibraryConfig({ telemetryEnabled: true });
            if (refs.telemetryModal) {
                refs.telemetryModal.style.display = 'none';
            }
            if (refs.telemetrySelect) {
                refs.telemetrySelect.value = 'on';
            }
        };
    }

    if (refs.buttons.telemetryOptOut) {
        refs.buttons.telemetryOptOut.onclick = async () => {
            await (window as any).electronAPI.updateLibraryConfig({ telemetryEnabled: false });
            if (refs.telemetryModal) {
                refs.telemetryModal.style.display = 'none';
            }
            if (refs.telemetrySelect) {
                refs.telemetrySelect.value = 'off';
            }
        };
    }
}
