export function bindGlobalUiEvents({
    categoryFilterController,
    refs,
    settingsController,
    duplicateStackOverlayController,
    closeLanguagePackModal
}) {
    window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            const saveEditorOverlay = document.querySelector('.save-editor-overlay');
            if (saveEditorOverlay) {
                const closeBtn = saveEditorOverlay.querySelector('.save-editor-close');
                if (closeBtn) closeBtn.click();
            } else if (refs.languagePackOverlay.style.display === 'flex') {
                closeLanguagePackModal();
            } else if (duplicateStackOverlayController.isOpen()) {
                duplicateStackOverlayController.close();
            } else if (settingsController.isSettingsOpen()) {
                settingsController.closeSettings();
            }
        }
    });

    document.addEventListener('click', (event) => {
        if (!refs.searchInput.contains(event.target) && !refs.searchDropdown.contains(event.target)) {
            refs.searchDropdown.classList.remove('show');
        }
        if (!event.target.closest('.dropdown-menu') && !event.target.closest('.menu-btn')) {
            document.querySelectorAll('.dropdown-menu').forEach(menu => menu.classList.remove('show'));
        }
        if (!event.target.closest('.sort-container')) {
            document.querySelectorAll('.sort-menu').forEach(menu => menu.classList.remove('show'));
        }
        if (!event.target.closest('.category-filter-container')) {
            categoryFilterController.hideMenu();
        }
    });
}

export function bindWindowStatusEvents(uiTextController) {
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
}) {
    refs.buttons.setupDefault.onclick = async () => { await startupController.handleSetupDefault(); };
    refs.buttons.chooseCustom.onclick = async () => { await startupController.handleSetupCustom(); };
    refs.buttons.changePath.onclick = async () => { await startupController.handleChangePath(); };
    refs.buttons.settingsOpen.onclick = () => { settingsController.openSettings(); };
    refs.buttons.settingsClose.onclick = () => { settingsController.closeSettings(); };
    refs.buttons.languagePackClose.onclick = () => languagePackController.closeLanguagePackModal();
    refs.quickFolder.onclick = () => startupController.handleQuickFolderOpen();
    refs.refreshLibraryBtn.onclick = async () => { await startupController.handleRefreshLibrary(); };
    refs.moreLanguagesBtn.onclick = () => languagePackController.openLanguagePackModal();
    refs.languagePackListBtn.onclick = () => languagePackController.handleListClick();
    refs.languagePackRefreshBtn.onclick = async () => languagePackController.handleRefreshClick();
    refs.languagePackSearch.oninput = () => languagePackController.handleSearchInput();

    refs.sortBtn.onclick = (event) => {
        event.stopPropagation();
        refs.sortMenu.classList.toggle('show');
    };
    document.querySelectorAll('.sort-item').forEach((item) => {
        item.onclick = (event) => {
            event.stopPropagation();
            sortGames(item.dataset.sort);
            refs.sortMenu.classList.remove('show');
        };
    });

    refs.themeSelect.onchange = (event) => {
        settingsController.handleThemeChange(event.target.value);
    };
    refs.appUpdatesSelect.onchange = (event) => {
        settingsController.handleAppUpdatesChange(event.target.value);
    };
    refs.languagePackUpdatesSelect.onchange = (event) => {
        settingsController.handleLanguagePackUpdatesChange(event.target.value);
    };
    refs.locationDisplaySelect.onchange = (event) => {
        settingsController.handleLocationDisplayModeChange(event.target.value);
        reannotateGames();
        sortGames(currentSort());
    };
    refs.maxDepthInput.onchange = async (event) => {
        const maxDepth = settingsController.handleMaxDepthChange(event.target.value);
        await startupController.handleLibraryConfigChange({ maxDepth });
    };
    refs.maxDepthInput.oninput = (event) => {
        event.target.value = event.target.value.replace(/[^\d]/g, '').slice(0, 2);
    };
    refs.maxDepthIncreaseBtn.onclick = async () => {
        const maxDepth = settingsController.handleMaxDepthStep(1);
        await startupController.handleLibraryConfigChange({ maxDepth });
    };
    refs.maxDepthDecreaseBtn.onclick = async () => {
        const maxDepth = settingsController.handleMaxDepthStep(-1);
        await startupController.handleLibraryConfigChange({ maxDepth });
    };
    refs.maxDepthInput.onkeydown = async (event) => {
        if (!['ArrowUp', 'ArrowDown', 'Enter'].includes(event.key)) return;
        event.preventDefault();
        const maxDepth = event.key === 'ArrowUp'
            ? settingsController.handleMaxDepthStep(1)
            : event.key === 'ArrowDown'
                ? settingsController.handleMaxDepthStep(-1)
                : settingsController.handleMaxDepthChange(event.target.value);
        await startupController.handleLibraryConfigChange({ maxDepth });
    };
    refs.langSelect.onchange = (event) => {
        setCurrentLanguage(event.target.value);
    };
    refs.searchInput.oninput = (event) => searchController.updateSearch(event.target.value);
    refs.searchInput.onfocus = (event) => searchController.updateSearch(event.target.value);
}
