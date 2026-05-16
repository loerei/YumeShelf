export function createUiRuntimeState() {
    let allGames = [];
    let categoryTree = [];
    let activeCategoryId = localStorage.getItem('yumeshelf_active_category_id') || null;
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
        getCategoryTree: () => categoryTree,
        setCategoryTree: (tree) => {
            categoryTree = Array.isArray(tree) ? tree : [];
        },
        getActiveCategoryId: () => activeCategoryId,
        setActiveCategoryId: (value) => {
            activeCategoryId = value || null;
            if (activeCategoryId) {
                localStorage.setItem('yumeshelf_active_category_id', activeCategoryId);
            } else {
                localStorage.removeItem('yumeshelf_active_category_id');
            }
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
