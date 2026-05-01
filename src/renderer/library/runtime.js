import { annotateGamesForDisplay } from '../game-annotations.js';
import { buildLibraryViewItems } from '../library-stacks.js';

export function createLibraryRuntime({
    state,
    settingsController,
    duplicateStackOverlayController,
    libraryGridController,
    createCard,
    createStackCard
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

    function createLibraryItem(item) {
        if (item.isStack) {
            return createStackCard(item);
        }
        return createCard(item.primaryGame || item);
    }

    function refreshOpenDuplicateStack() {
        if (!duplicateStackOverlayController.isOpen()) return;
        const activeStackKey = duplicateStackOverlayController.getActiveStackKey();
        const nextStack = buildLibraryViewItems(state.getAllGames(), state.getCurrentSort()).items
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
