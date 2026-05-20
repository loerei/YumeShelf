// @ts-nocheck
import { annotateGamesForDisplay } from '../game-annotations';
import { buildLibraryViewItems } from '../library-stacks';

export function createLibraryRuntime({
    state,
    settingsController,
    duplicateStackOverlayController,
    libraryGridController,
    createCard,
    createStackCard,
    getVisibleGames = () => state.getAllGames()
}) {
    function setAllGames(games, config) {
        state.setCurrentLibraryConfig(config || state.getCurrentLibraryConfig());
        state.setAllGames(annotateGamesForDisplay(
            games,
            state.getCurrentLibraryConfig()?.libraryPath || '',
            settingsController.getLocationDisplayMode()
        ));
    }

    function reannotateGames() {
        state.setAllGames(annotateGamesForDisplay(
            state.getAllGames(),
            state.getCurrentLibraryConfig()?.libraryPath || '',
            settingsController.getLocationDisplayMode()
        ));
    }

    function createLibraryItem(item, options = {}) {
        if (item.isStack) {
            return createStackCard(item, options);
        }
        return createCard(item.primaryGame || item, options);
    }

    function refreshOpenDuplicateStack() {
        if (!duplicateStackOverlayController.isOpen()) return;
        const activeStackKey = duplicateStackOverlayController.getActiveStackKey();
        const nextStack = buildLibraryViewItems(getVisibleGames(), state.getCurrentSort()).items
            .find((item) => item.groupKey === activeStackKey);
        duplicateStackOverlayController.refresh(nextStack || null);
    }

    function sortGames(type) {
        libraryGridController.renderLibraryGrid(type);
        refreshOpenDuplicateStack();
    }

    return {
        createLibraryItem,
        reannotateGames,
        setAllGames,
        sortGames
    };
}
