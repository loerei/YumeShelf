import { buildLibraryViewItems } from './library-stacks.js';

export function createLibraryGridController({
    createLibraryItem,
    getAllGames,
    getStrings,
    onAfterRender,
    onEmptyAction,
    refs,
    setCurrentSort
}) {
    function renderEmptyState(d) {
        refs.emptyContainer.innerHTML = `<div class="empty-zaako"><p>${d.zaako}</p><button class="zaako-btn" id="zaako-open-btn">${d.open_btn}</button></div>`;
        document.getElementById('zaako-open-btn').onclick = () => onEmptyAction();
        refs.quickFolder.style.display = 'none';
        refs.separator.style.display = 'none';
    }

    function renderLibraryGrid(type) {
        setCurrentSort(type);
        localStorage.setItem('yumeshelf_sort_pref', type);

        refs.favGrid.innerHTML = '';
        refs.unfavGrid.innerHTML = '';
        refs.emptyContainer.innerHTML = '';

        const d = getStrings();
        const allGames = getAllGames();
        if (allGames.length === 0) {
            renderEmptyState(d);
            onAfterRender();
            return;
        }

        refs.quickFolder.style.display = 'flex';

        const { items } = buildLibraryViewItems(allGames, type);
        const favorites = items.filter((item) => item.favorite);
        const nonFavorites = items.filter((item) => !item.favorite);

        favorites.forEach((item) => refs.favGrid.appendChild(createLibraryItem(item)));
        nonFavorites.forEach((item) => refs.unfavGrid.appendChild(createLibraryItem(item)));
        refs.separator.style.display = (favorites.length > 0 && nonFavorites.length > 0) ? 'flex' : 'none';

        onAfterRender();
    }

    return {
        renderLibraryGrid
    };
}
