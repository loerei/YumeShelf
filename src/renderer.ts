// @ts-nocheck
import { createRendererComposition } from './renderer/bootstrap/app-composition.js';
import { buildRendererRefs } from './renderer/bootstrap/dom-refs.js';
import { bindControlEvents, bindGlobalUiEvents, bindWindowStatusEvents } from './renderer/events/global-events.js';
import { bindIpcEvents } from './renderer/events/ipc-events.js';
import { runRendererBootstrap } from './renderer/lifecycle/bootstrap.js';
import { createUiRuntimeState } from './renderer/state/ui-runtime-state.js';
import { initSaveEditorUI } from './renderer/save-editor-ui.js';

document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const isStandaloneSaveEditor = urlParams.get('mode') === 'save-editor';
    if (isStandaloneSaveEditor) {
        document.body.classList.add('standalone-save-editor');
        const gameKey = urlParams.get('gameKey');
        const loadingEl = document.getElementById('loading');
        if (loadingEl) {
            loadingEl.style.display = 'none';
        }
        initSaveEditorUI();
        window.showSaveEditor(gameKey, { isStandaloneWindow: true });
        return;
    }

    const refs = buildRendererRefs(document);
    const state = createUiRuntimeState();
    const composition = createRendererComposition({
        refs,
        state,
        electronAPI: window.electronAPI,
        builtInLanguageOrder: ['en', 'ja', 'zh'],
        dragRowTolerance: 15,
        dragPointerSlop: 18
    });

    bindIpcEvents({
        electronAPI: window.electronAPI,
        bootController: composition.bootController,
        updateNotificationFeature: composition.updateNotificationFeature,
        getAllGames: () => state.getAllGames(),
        getCurrentSort: () => state.getCurrentSort(),
        setAllGames: composition.libraryRuntime.setAllGames,
        setRunningFlag: (gameKey, isRunning) => {
            const target = state.getAllGames().find((game) => (
                game.gameId === gameKey
                || game.gameKey === gameKey
                || (Array.isArray(game.instances) && game.instances.some((instance) => (
                    instance.gameId === gameKey
                    || instance.gameKey === gameKey
                )))
            ));
            if (target) {
                target.isRunning = isRunning;
            }
        },
        sortGames: (type) => composition.libraryRuntime.sortGames(type)
    });

    bindControlEvents({
        refs,
        settingsController: composition.settingsController,
        localeController: composition.localeController,
        languagePackController: composition.languagePackController,
        startupController: composition.startupController,
        searchController: composition.searchController,
        sortGames: (type) => composition.libraryRuntime.sortGames(type),
        reannotateGames: () => composition.libraryRuntime.reannotateGames(),
        currentSort: () => state.getCurrentSort(),
        setCurrentLanguage: (code) => composition.localeController.setCurrentLanguage(code)
    });
    bindGlobalUiEvents({
        categoryFilterController: composition.categoryFilterController,
        refs,
        settingsController: composition.settingsController,
        duplicateStackOverlayController: composition.duplicateStackOverlayController,
        closeLanguagePackModal: () => composition.languagePackController.closeLanguagePackModal()
    });
    bindWindowStatusEvents(composition.uiTextController);
    initSaveEditorUI();

    await runRendererBootstrap({
        refs,
        bootController: composition.bootController,
        settingsController: composition.settingsController,
        localeController: composition.localeController,
        searchController: composition.searchController,
        startupController: composition.startupController,
        appUpdateController: composition.appUpdateController,
        updateNotificationFeature: composition.updateNotificationFeature,
        uiTextController: composition.uiTextController,
        initApp: composition.initApp
    });
});
