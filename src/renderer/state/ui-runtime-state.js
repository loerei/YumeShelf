// @ts-check

/**
 * @typedef {Object} DragTargetInfo
 * @property {string} [id]
 * @property {string} [type]
 */

/**
 * @typedef {Object} UiRuntimeState
 * @property {() => any[]} getAllGames
 * @property {(games: any[]) => void} setAllGames
 * @property {() => any[]} getCategoryTree
 * @property {(tree: any[]) => void} setCategoryTree
 * @property {() => string | null} getActiveCategoryId
 * @property {(value: string | null) => void} setActiveCategoryId
 * @property {() => any} getCurrentLibraryConfig
 * @property {(config: any) => void} setCurrentLibraryConfig
 * @property {() => string | null} getDraggedGameFolder
 * @property {(value: string | null) => void} setDraggedGameFolder
 * @property {() => DragTargetInfo | null} getDragTargetInfo
 * @property {(value: DragTargetInfo | null) => void} setDragTargetInfo
 * @property {() => string} getCurrentSort
 * @property {(value: string) => void} setCurrentSort
 */

/**
 * Creates the singleton UI state store.
 * @returns {UiRuntimeState}
 */
export function createUiRuntimeState() {
    /** @type {any[]} */
    let allGames = [];
    /** @type {any[]} */
    let categoryTree = [];
    /** @type {string | null} */
    let activeCategoryId = localStorage.getItem('yumeshelf_active_category_id') || null;
    /** @type {any} */
    let currentLibraryConfig = null;
    /** @type {string | null} */
    let draggedGameFolder = null;
    /** @type {DragTargetInfo | null} */
    let dragTargetInfo = null;
    /** @type {string} */
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
