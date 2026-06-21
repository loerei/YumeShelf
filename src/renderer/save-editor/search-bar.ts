// @ts-nocheck

/**
 * @typedef {Object} SearchBarRefs
 * @property {HTMLElement} overlay
 * @property {HTMLInputElement} searchInput
 */

/**
 * @typedef {Object} SearchBarState
 * @property {boolean} showEmpty
 * @property {boolean} showImportant
 */

/**
 * Set up search bar event handlers and link them to the UI state.
 * @param {SearchBarRefs} refs
 * @param {SearchBarState} state
 * @param {import('./data-engine').DataEngine} engine
 * @param {() => void} renderTabContent
 */
export function setupSearchBar(refs, state, engine, renderTabContent) {
    const { overlay, searchInput } = refs;

    // Initialize engine options from UI defaults
    engine.setSearchOptions({
        query: '',
        exact: false,
        searchName: true,
        searchValue: true,
        searchIndex: false
    });

    // Search Input with Debounce
    /** @type {any} */
    let searchDebounce = null;
    searchInput.oninput = (e) => {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => {
            // @ts-ignore - target can be cast to HTMLInputElement
            engine.setSearchOptions({ query: e.target.value });
            renderTabContent();
        }, 150);
    };

    // Filter Toggles
    const showEmptyCheck = /** @type {HTMLInputElement | null} */(overlay.querySelector('.show-empty-check'));
    if (showEmptyCheck) {
        showEmptyCheck.onchange = (e) => {
            // @ts-ignore
            state.showEmpty = e.target.checked;
            renderTabContent();
        };
    }

    const showImportantCheck = /** @type {HTMLInputElement | null} */(overlay.querySelector('.show-important-check'));
    if (showImportantCheck) {
        showImportantCheck.onchange = (e) => {
            // @ts-ignore
            state.showImportant = e.target.checked;
            renderTabContent();
        };
    }

    const exactMatchCheck = /** @type {HTMLInputElement | null} */(overlay.querySelector('.exact-match-check'));
    if (exactMatchCheck) {
        exactMatchCheck.onchange = (e) => {
            // @ts-ignore
            engine.setSearchOptions({ exact: e.target.checked });
            renderTabContent();
        };
    }

    const searchNameCheck = /** @type {HTMLInputElement | null} */(overlay.querySelector('.search-name-check'));
    if (searchNameCheck) {
        searchNameCheck.onchange = (e) => {
            // @ts-ignore
            engine.setSearchOptions({ searchName: e.target.checked });
            renderTabContent();
        };
    }

    const searchValueCheck = /** @type {HTMLInputElement | null} */(overlay.querySelector('.search-value-check'));
    if (searchValueCheck) {
        searchValueCheck.onchange = (e) => {
            // @ts-ignore
            engine.setSearchOptions({ searchValue: e.target.checked });
            renderTabContent();
        };
    }

    const searchIndexCheck = /** @type {HTMLInputElement | null} */(overlay.querySelector('.search-index-check'));
    if (searchIndexCheck) {
        searchIndexCheck.onchange = (e) => {
            // @ts-ignore
            engine.setSearchOptions({ searchIndex: e.target.checked });
            renderTabContent();
        };
    }

    const switchTrueCheck = /** @type {HTMLInputElement | null} */(overlay.querySelector('.switch-true-check'));
    if (switchTrueCheck) {
        switchTrueCheck.onchange = (e) => {
            // @ts-ignore
            engine.setSearchOptions({ switchOnlyTrue: e.target.checked });
            // @ts-ignore
            if (e.target.checked) {
                const other = /** @type {HTMLInputElement | null} */(overlay.querySelector('.switch-false-check'));
                if (other?.checked) {
                    other.checked = false;
                    engine.setSearchOptions({ switchOnlyFalse: false });
                }
            }
            renderTabContent();
        };
    }

    const switchFalseCheck = /** @type {HTMLInputElement | null} */(overlay.querySelector('.switch-false-check'));
    if (switchFalseCheck) {
        switchFalseCheck.onchange = (e) => {
            // @ts-ignore
            engine.setSearchOptions({ switchOnlyFalse: e.target.checked });
            // @ts-ignore
            if (e.target.checked) {
                const other = /** @type {HTMLInputElement | null} */(overlay.querySelector('.switch-true-check'));
                if (other?.checked) {
                    other.checked = false;
                    engine.setSearchOptions({ switchOnlyTrue: false });
                }
            }
            renderTabContent();
        };
    }
}

