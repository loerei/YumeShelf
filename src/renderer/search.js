import { getGameKey } from './library-order.js';
import { applyIconPayload, cacheIconPayload, logIconRender, readCachedIconPayload, renderIconMarkup } from './icon-payload.js';

export function createSearchController({
    attachTooltip,
    advancePlaceholderIndex,
    electronAPI,
    getActiveCategoryId,
    getVisibleGames,
    getDraggedGameFolder,
    getPlaceholderIndex,
    getPlaceholders,
    getStrings,
    refs,
    setDraggedGameFolder
}) {
    function highlightMatch(text, query) {
        if (!query) return text;
        const parts = text.split(new RegExp(`(${query})`, 'gi'));
        return parts.map(part => part.toLowerCase() === query.toLowerCase() ? `<span class="search-match">${part}</span>` : part).join('');
    }

    function hideSearchDropdown() {
        refs.searchDropdown.classList.remove('show');
    }

    function updateSearch(query) {
        if (!query.trim()) {
            hideSearchDropdown();
            refs.searchPlaceholder.style.display = 'block';
            return;
        }

        refs.searchPlaceholder.style.display = 'none';
        const filtered = getVisibleGames().filter(game =>
            game.name.toLowerCase().includes(query.toLowerCase()) ||
            game.folderName.toLowerCase().includes(query.toLowerCase()) ||
            String(game.relativePath || '').toLowerCase().includes(query.toLowerCase())
        );

        refs.searchDropdown.innerHTML = '';
        if (filtered.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'search-item empty-search';
            empty.innerText = getStrings().no_results;
            refs.searchDropdown.appendChild(empty);
            refs.searchDropdown.classList.add('show');
            return;
        }

        filtered.forEach((game) => {
            const cachedIcon = !game.iconData ? readCachedIconPayload(game.exePath) : null;
            if (cachedIcon) {
                applyIconPayload(game, cachedIcon);
            }
            const gameKey = getGameKey(game);
            const item = document.createElement('div');
            item.className = 'search-item';
            item.draggable = !getActiveCategoryId();
            item.innerHTML = `
                <div class="search-item-info">
                    <div class="search-item-icon">${game.iconData ? renderIconMarkup(game.iconData, game.iconFit, game.iconSource) : '🎮'}</div>
                    <div class="search-item-title-container">
                        <div class="search-item-title">${highlightMatch(game.name, query)}</div>
                    </div>
                </div>
                <div class="search-launch-icon-wrapper">
                    <svg class="search-launch-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M15 10l5 5-5 5"></path>
                        <path d="M4 4v7a4 4 0 0 0 4 4h12"></path>
                    </svg>
                </div>
            `;
            if (game.iconData) {
                logIconRender('search-item-initial', gameKey, {
                    dataUrl: game.iconData,
                    fit: game.iconFit,
                    source: game.iconSource,
                    debug: game.iconDebug
                }, item.querySelector('.search-item-icon img'));
            }

            if (!game.iconData) {
                electronAPI.getIcon(game.exePath).then((iconPayload) => {
                    const normalizedIcon = applyIconPayload(game, iconPayload);
                    if (!normalizedIcon) return;
                    cacheIconPayload(game.exePath, normalizedIcon);
                    const iconSpan = item.querySelector('.search-item-icon');
                    if (iconSpan) {
                        iconSpan.innerHTML = renderIconMarkup(normalizedIcon.dataUrl, normalizedIcon.fit, normalizedIcon.source);
                        logIconRender('search-item-async', gameKey, normalizedIcon, iconSpan.querySelector('img'));
                    }
                });
            }

            if (item.draggable) {
                item.ondragstart = (event) => {
                    setDraggedGameFolder(gameKey);
                    event.dataTransfer.setData('gameKey', gameKey);
                };
                item.ondragend = () => {
                    if (getDraggedGameFolder() === getGameKey(game)) {
                        setDraggedGameFolder(null);
                    }
                };
            }

            const launchIconWrapper = item.querySelector('.search-launch-icon-wrapper');
            launchIconWrapper.onclick = (event) => {
                event.stopPropagation();
                const exactCard = document.querySelector(`.game-card[data-game-key="${getGameKey(game)}"]`);
                const card = exactCard;
                if (card) {
                    hideSearchDropdown();
                    refs.searchInput.value = '';
                    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    card.classList.add('glow');
                    setTimeout(() => card.classList.remove('glow'), 2000);
                }
            };

            attachTooltip(item, () => ({
                title: game.name,
                subtitle: game.relativePathFullDisplay || game.relativePathDisplay || game.relativePath || ''
            }));
            item.ondblclick = (event) => {
                if (event.target.closest('.search-launch-icon-wrapper')) return;
                event.stopPropagation();
                electronAPI.launchYume({
                    gameKey: game.primaryInstance?.gameKey || game.gameKey || getGameKey(game),
                    exePath: game.primaryInstance?.exePath || game.exePath
                });
                hideSearchDropdown();
                refs.searchInput.value = '';
            };

            refs.searchDropdown.appendChild(item);
        });

        refs.searchDropdown.classList.add('show');
    }

    function rotatePlaceholder() {
        if (refs.searchInput.value.trim()) return;
        refs.searchPlaceholder.style.opacity = '0';
        setTimeout(() => {
            advancePlaceholderIndex();
            const placeholders = getPlaceholders();
            refs.searchPlaceholder.innerText = placeholders[getPlaceholderIndex()];
            refs.searchPlaceholder.style.opacity = '0.5';
        }, 2000);
    }

    return {
        hideSearchDropdown,
        rotatePlaceholder,
        updateSearch
    };
}
