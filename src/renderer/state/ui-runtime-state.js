export function createUiRuntimeState() {
    let allGames = [];
    let currentLibraryConfig = null;
    let draggedGameFolder = null;
    let dragTargetInfo = null;
    let currentSort = localStorage.getItem('yumeshelf_sort_pref') || 'date';
    if (currentSort === 'rj') currentSort = 'date';

    return {
        getAllGames: () => allGames,
        setAllGames: (games) => {
            allGames = games;
        },
        getCurrentLibraryConfig: () => currentLibraryConfig,
        setCurrentLibraryConfig: (config) => {
            currentLibraryConfig = config;
        },
        getDraggedGameFolder: () => draggedGameFolder,
        setDraggedGameFolder: (value) => {
            draggedGameFolder = value;
        },
        getDragTargetInfo: () => dragTargetInfo,
        setDragTargetInfo: (value) => {
            dragTargetInfo = value;
        },
        getCurrentSort: () => currentSort,
        setCurrentSort: (value) => {
            currentSort = value;
        }
    };
}
