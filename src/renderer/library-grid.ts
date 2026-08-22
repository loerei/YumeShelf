// @ts-nocheck
import { buildLibraryViewItems } from './library-stacks';

export function createLibraryGridController({
    createLibraryItem,
    getActiveCategoryId,
    getAllGames,
    getFilteredEmptyState,
    getStrings,
    hideAndSeekController,
    onAfterRender,
    onClearFilter,
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

    function renderLibraryEmptyState(d) {
        refs.emptyContainer.innerHTML = `<div class="empty-zaako"><p>${d.zaako}</p><button class="zaako-btn" id="zaako-open-btn">${d.open_btn}</button></div>`;
        document.getElementById('zaako-open-btn').onclick = () => onEmptyAction();
        refs.quickFolder.style.display = 'none';
        refs.separator.style.display = 'none';
    }

    function renderFilteredEmptyState() {
        const filteredState = typeof getFilteredEmptyState === 'function'
            ? getFilteredEmptyState()
            : {
                title: 'No games in this category',
                description: 'No games match this category yet.',
                actionLabel: 'Clear filter'
            };
        refs.emptyContainer.innerHTML = `
            <div class="empty-zaako filtered-empty-state">
                <h3>${filteredState.title}</h3>
                <p>${filteredState.description}</p>
                <button class="zaako-btn" id="zaako-clear-filter-btn">${filteredState.actionLabel}</button>
            </div>
        `;
        document.getElementById('zaako-clear-filter-btn').onclick = () => onClearFilter();
        refs.quickFolder.style.display = 'flex';
        refs.separator.style.display = 'none';
    }

    function renderLibraryGrid(type) {
        console.log('[DIAG][renderLibraryGrid] type:', type);
        setCurrentSort(type);
        localStorage.setItem('yumeshelf_sort_pref', type);
        const previousRects = captureCardRects();

        refs.favGrid.innerHTML = '';
        refs.unfavGrid.innerHTML = '';
        refs.emptyContainer.innerHTML = '';

        const d = getStrings();
        const allGames = getAllGames();
        console.log('[DIAG][renderLibraryGrid] allGames count:', allGames?.length);
        const activeCategoryId = typeof getActiveCategoryId === 'function' ? getActiveCategoryId() : null;
        const visibleGames = activeCategoryId
            ? allGames.filter((game) => Array.isArray(game.categoryIds) && game.categoryIds.includes(activeCategoryId))
            : allGames;
        if (visibleGames.length === 0) {
            if (allGames.length > 0 && activeCategoryId) {
                renderFilteredEmptyState();
            } else {
                renderLibraryEmptyState(d);
            }
            onAfterRender();
            return;
        }

        refs.quickFolder.style.display = 'flex';
        let { items } = buildLibraryViewItems(visibleGames, type);
        if (hideAndSeekController?.isCardActive()) {
            items = hideAndSeekController.injectCardIntoItems(items);
        }
        const favorites = items.filter((item) => item.favorite);
        const nonFavorites = items.filter((item) => !item.favorite);

        const itemOptions = { draggable: !activeCategoryId };
        const renderItem = (item) => {
            if (item.isMascotCard && hideAndSeekController?.createMascotCardElement) {
                return hideAndSeekController.createMascotCardElement(item);
            }
            return createLibraryItem(item, itemOptions);
        };

        favorites.forEach((item) => refs.favGrid.appendChild(renderItem(item)));
        nonFavorites.forEach((item) => refs.unfavGrid.appendChild(renderItem(item)));
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
