import type { CentralStore, StoreState, StoreListener } from './types.ts';

export function createUiRuntimeState(): CentralStore {
    const state: StoreState = {
        allGames: [],
        categoryTree: [],
        activeCategoryId: localStorage.getItem('yumeshelf_active_category_id') || null,
        currentLibraryConfig: null,
        draggedGameFolder: null,
        dragTargetInfo: null,
        currentSort: localStorage.getItem('yumeshelf_sort_pref') || 'date'
    };

    if (state.currentSort === 'rj') {
        state.currentSort = 'date';
    }

    type ListenersMap = {
        [K in keyof StoreState]?: Set<StoreListener<K>>;
    };

    const listeners: ListenersMap = {};

    function trigger<K extends keyof StoreState>(key: K, value: StoreState[K]) {
        const set = listeners[key];
        if (set) {
            set.forEach((listener) => {
                try {
                    listener(value);
                } catch (err) {
                    console.error(`Error in store listener for key "${key}":`, err);
                }
            });
        }
    }

    function setProperty<K extends keyof StoreState>(key: K, value: StoreState[K]) {
        if (state[key] !== value) {
            state[key] = value;
            trigger(key, value);
        }
    }

    return {
        getAllGames: () => state.allGames,
        setAllGames: (games) => {
            setProperty('allGames', Array.isArray(games) ? games : []);
        },
        getCategoryTree: () => state.categoryTree,
        setCategoryTree: (tree) => {
            setProperty('categoryTree', Array.isArray(tree) ? tree : []);
        },
        getActiveCategoryId: () => state.activeCategoryId,
        setActiveCategoryId: (value) => {
            const nextValue = value || null;
            if (nextValue) {
                localStorage.setItem('yumeshelf_active_category_id', nextValue);
            } else {
                localStorage.removeItem('yumeshelf_active_category_id');
            }
            setProperty('activeCategoryId', nextValue);
        },
        getCurrentLibraryConfig: () => state.currentLibraryConfig,
        setCurrentLibraryConfig: (config) => {
            setProperty('currentLibraryConfig', config);
        },
        getDraggedGameFolder: () => state.draggedGameFolder,
        setDraggedGameFolder: (value) => {
            setProperty('draggedGameFolder', value);
        },
        getDragTargetInfo: () => state.dragTargetInfo,
        setDragTargetInfo: (value) => {
            setProperty('dragTargetInfo', value);
        },
        getCurrentSort: () => state.currentSort,
        setCurrentSort: (value) => {
            setProperty('currentSort', value);
        },

        subscribe<K extends keyof StoreState>(key: K, listener: StoreListener<K>): () => void {
            if (!listeners[key]) {
                listeners[key] = new Set() as any;
            }
            const set = listeners[key] as Set<StoreListener<K>>;
            set.add(listener);

            return () => {
                set.delete(listener);
                if (set.size === 0) {
                    delete listeners[key];
                }
            };
        }
    };
}
