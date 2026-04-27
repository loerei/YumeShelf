export function createLibraryGridController({
    createCard,
    getAllGames,
    getStrings,
    onAfterRender,
    onEmptyAction,
    refs,
    setCurrentSort
}) {
    function sortCollection(games, type) {
        if (type === 'custom') {
            const order = JSON.parse(localStorage.getItem('yumeshelf_custom_order') || '[]');
            return [...games].sort((a, b) => {
                const indexA = order.indexOf(a.folderName);
                const indexB = order.indexOf(b.folderName);
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

        sortCollection(favorites, type).forEach(game => refs.favGrid.appendChild(createCard(game)));
        sortCollection(nonFavorites, type).forEach(game => refs.unfavGrid.appendChild(createCard(game)));
        refs.separator.style.display = (favorites.length > 0 && nonFavorites.length > 0) ? 'flex' : 'none';

        onAfterRender();
    }

    return {
        renderLibraryGrid
    };
}
