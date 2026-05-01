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
    function queryRenderedCards() {
        return [
            ...refs.favGrid.querySelectorAll('.game-card[data-game-key]'),
            ...refs.unfavGrid.querySelectorAll('.game-card[data-game-key]')
        ];
    }

    function captureCardRects() {
        return new Map(
            queryRenderedCards().map((card) => [
                card.dataset.gameKey,
                card.getBoundingClientRect()
            ])
        );
    }

    function animateReorderedCards(previousRects) {
        if (!previousRects || previousRects.size === 0) {
            return;
        }
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
            return;
        }

        queryRenderedCards().forEach((card) => {
            const previousRect = previousRects.get(card.dataset.gameKey);
            if (!previousRect) {
                return;
            }

            const nextRect = card.getBoundingClientRect();
            const deltaX = previousRect.left - nextRect.left;
            const deltaY = previousRect.top - nextRect.top;
            if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) {
                return;
            }

            card.animate(
                [
                    {
                        transform: `translate(${deltaX}px, ${deltaY}px)`
                    },
                    {
                        transform: 'translate(0, 0)'
                    }
                ],
                {
                    duration: 260,
                    easing: 'cubic-bezier(0.22, 1, 0.36, 1)'
                }
            );
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
        const previousRects = captureCardRects();

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
        requestAnimationFrame(() => {
            animateReorderedCards(previousRects);
        });
    }

    return {
        renderLibraryGrid
    };
}
