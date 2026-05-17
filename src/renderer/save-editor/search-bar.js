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
    let searchDebounce = null;
    searchInput.oninput = (e) => {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => {
            engine.setSearchOptions({ query: e.target.value });
            renderTabContent();
        }, 150);
    };

    // Filter Toggles
    overlay.querySelector('.show-empty-check').onchange = (e) => {
        state.showEmpty = e.target.checked;
        renderTabContent();
    };

    overlay.querySelector('.show-important-check').onchange = (e) => {
        state.showImportant = e.target.checked;
        renderTabContent();
    };

    overlay.querySelector('.exact-match-check').onchange = (e) => {
        engine.setSearchOptions({ exact: e.target.checked });
        renderTabContent();
    };

    overlay.querySelector('.search-name-check').onchange = (e) => {
        engine.setSearchOptions({ searchName: e.target.checked });
        renderTabContent();
    };

    overlay.querySelector('.search-value-check').onchange = (e) => {
        engine.setSearchOptions({ searchValue: e.target.checked });
        renderTabContent();
    };

    overlay.querySelector('.search-index-check').onchange = (e) => {
        engine.setSearchOptions({ searchIndex: e.target.checked });
        renderTabContent();
    };

    overlay.querySelector('.switch-true-check').onchange = (e) => {
        engine.setSearchOptions({ switchOnlyTrue: e.target.checked });
        if (e.target.checked) {
            const other = overlay.querySelector('.switch-false-check');
            if (other.checked) {
                other.checked = false;
                engine.setSearchOptions({ switchOnlyFalse: false });
            }
        }
        renderTabContent();
    };

    overlay.querySelector('.switch-false-check').onchange = (e) => {
        engine.setSearchOptions({ switchOnlyFalse: e.target.checked });
        if (e.target.checked) {
            const other = overlay.querySelector('.switch-true-check');
            if (other.checked) {
                other.checked = false;
                engine.setSearchOptions({ switchOnlyTrue: false });
            }
        }
        renderTabContent();
    };
}
