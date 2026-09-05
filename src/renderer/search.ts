// @ts-nocheck
import { getGameKey } from './library-order';
import { applyIconPayload, getGameIconUrl, logIconRender, readCachedIconPayload, renderIconMarkup } from './icon-payload';
import { formatBytes } from './utils/formatting';

export function createSearchController({
    attachTooltip,
    advancePlaceholderIndex,
    electronAPI,
    getActiveCategoryId,
    getAllGames,
    getDraggedGameFolder,
    getPlaceholderIndex,
    getPlaceholders,
    getStrings,
    hideAndSeekController,
    container,
    setDraggedGameFolder
}) {
    // Controller owns its DOM scope (.search-container).
    const searchInput       = container.querySelector('#search-input');
    const searchDropdown    = container.querySelector('#search-dropdown');
    const searchPlaceholder = container.querySelector('#search-placeholder');

    function highlightMatch(text, query) {
        if (!query) return text;
        const parts = text.split(new RegExp(`(${query})`, 'gi'));
        return parts.map(part => part.toLowerCase() === query.toLowerCase() ? `<span class="search-match">${part}</span>` : part).join('');
    }

    function hideSearchDropdown() {
        searchDropdown.classList.remove('show');
    }

    function updateSearch(query) {
        if (!query.trim()) {
            hideSearchDropdown();
            searchPlaceholder.style.display = 'block';
            return;
        }

        searchPlaceholder.style.display = 'none';
        const filtered = getAllGames().filter(game => {
            const name = (game.name || '').toLowerCase();
            const folderName = (game.folderName || '').toLowerCase();
            const relativePath = String(game.relativePath || '').toLowerCase();
            const q = query.toLowerCase();
            return name.includes(q) || folderName.includes(q) || relativePath.includes(q);
        });

        searchDropdown.innerHTML = '';

        // Inject Mascot card in search if active and matches query
        if (hideAndSeekController?.isCardActive()) {
            const mascotTitle = hideAndSeekController.getCardTitle();
            if (mascotTitle.toLowerCase().includes(query.toLowerCase())) {
                const mascotSearchItem = document.createElement('div');
                mascotSearchItem.className = 'search-item mascot-search-item';
                mascotSearchItem.innerHTML = `
                    <div class="search-item-info">
                        <div class="search-item-icon">✨</div>
                        <div class="search-item-title-container">
                            <div class="search-item-title">${highlightMatch(mascotTitle, query)}</div>
                        </div>
                    </div>
                `;
                mascotSearchItem.onclick = () => {
                    const card = document.querySelector('.mascot-game-card');
                    if (card) {
                        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        card.classList.add('bonk-animating');
                        setTimeout(() => card.classList.remove('bonk-animating'), 500);
                    }
                    hideSearchDropdown();
                };
                searchDropdown.appendChild(mascotSearchItem);
            }
        }

        if (filtered.length === 0 && searchDropdown.children.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'search-item empty-search';
            empty.innerText = getStrings().no_results;
            searchDropdown.appendChild(empty);
            searchDropdown.classList.add('show');
            return;
        }

        filtered.forEach((game) => {
            const cachedIcon = !game.iconData ? readCachedIconPayload(game.exePath) : null;
            if (cachedIcon) {
                applyIconPayload(game, cachedIcon);
            }
            const iconSrc = game.iconData || (game.exePath ? getGameIconUrl(game.exePath) : null);
            const gameKey = getGameKey(game);
            const item = document.createElement('div');
            item.className = 'search-item';
            item.draggable = !getActiveCategoryId();
            // nosemgrep: javascript.browser.security.insecure-innerhtml, javascript.browser.security.insecure-document-method
            // sourcery skip: insecure-innerhtml, insecure-document-method
            item.innerHTML = `
                <div class="search-item-info">
                    <div class="search-item-icon">${iconSrc ? renderIconMarkup(iconSrc, game.iconFit, game.iconSource || 'game-icon') : '🎮'}</div>
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
            if (iconSrc) {
                logIconRender('search-item-initial', gameKey, {
                    dataUrl: iconSrc,
                    fit: game.iconFit,
                    source: game.iconSource || 'game-icon',
                    debug: game.iconDebug
                }, item.querySelector('.search-item-icon img'));
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
                    searchInput.value = '';
                    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    card.classList.add('glow');
                    setTimeout(() => card.classList.remove('glow'), 2000);
                }
            };

            attachTooltip(item, () => ({
                title: game.name,
                engine: game.engine || undefined,
                size: formatBytes(game.sizeBytes),
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
                searchInput.value = '';
            };

            searchDropdown.appendChild(item);
        });

        searchDropdown.classList.add('show');
    }

    let overridePlaceholder: string | null = null;

    function setTemporaryPlaceholder(text: string) {
        overridePlaceholder = text;
        if (!searchInput.value.trim() && searchPlaceholder) {
            searchPlaceholder.innerText = text;
            searchPlaceholder.style.opacity = '0.75';
            searchPlaceholder.style.display = 'block';
        }
    }

    function clearTemporaryPlaceholder() {
        overridePlaceholder = null;
        if (!searchInput.value.trim() && searchPlaceholder) {
            const placeholders = getPlaceholders();
            searchPlaceholder.innerText = placeholders[getPlaceholderIndex()];
            searchPlaceholder.style.opacity = '0.5';
            searchPlaceholder.style.display = 'block';
        }
    }

    function rotatePlaceholder() {
        if (searchInput.value.trim() || overridePlaceholder) return;
        searchPlaceholder.style.opacity = '0';
        setTimeout(() => {
            if (overridePlaceholder) return;
            advancePlaceholderIndex();
            const placeholders = getPlaceholders();
            searchPlaceholder.innerText = placeholders[getPlaceholderIndex()];
            searchPlaceholder.style.opacity = '0.5';
        }, 2000);
    }

    return {
        hideSearchDropdown,
        rotatePlaceholder,
        updateSearch,
        setTemporaryPlaceholder,
        clearTemporaryPlaceholder
    };
}
