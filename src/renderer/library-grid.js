import { getGameKey, normalizeCustomOrder } from './library-order.js';

export function createLibraryGridController({
    createCard,
    getAllGames,
    getStrings,
    onAfterRender,
    onEmptyAction,
    refs,
    setCurrentSort
}) {
    function sortCollection(games, type, customOrder = null) {
        if (type === 'custom') {
            const order = Array.isArray(customOrder) ? customOrder : normalizeCustomOrder(games);
            return [...games].sort((a, b) => {
                const indexA = order.indexOf(getGameKey(a));
                const indexB = order.indexOf(getGameKey(b));
                return (indexA > -1 ? indexA : 99999) - (indexB > -1 ? indexB : 99999);
            });
        }

        return [...games].sort((a, b) => {
            if (type === 'az') return a.name.localeCompare(b.name);
            if (type === 'date') return (b.dateAdded || 0) - (a.dateAdded || 0);
            if (type === 'played') return (b.lastPlayed || 0) - (a.lastPlayed || 0);
            return 0;
        });
    }

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

        const favorites = allGames.filter(game => game.favorite);
        const nonFavorites = allGames.filter(game => !game.favorite);
        const customOrder = type === 'custom' ? normalizeCustomOrder(allGames) : null;

        sortCollection(favorites, type, customOrder).forEach(game => refs.favGrid.appendChild(createCard(game)));
        sortCollection(nonFavorites, type, customOrder).forEach(game => refs.unfavGrid.appendChild(createCard(game)));
        refs.separator.style.display = (favorites.length > 0 && nonFavorites.length > 0) ? 'flex' : 'none';

        onAfterRender();
    }

    return {
        renderLibraryGrid
    };
}
