import { getGameKey } from './library-order.js';

export function createSearchController({
    advancePlaceholderIndex,
    electronAPI,
    getAllGames,
    getDraggedGameFolder,
    getPlaceholderIndex,
    getPlaceholders,
    getStrings,
    refs,
    setDraggedGameFolder
}) {
    const tooltip = document.createElement('div');
    tooltip.className = 'search-tooltip';
    document.body.appendChild(tooltip);

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
        const filtered = getAllGames().filter(game =>
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
            const item = document.createElement('div');
            item.className = 'search-item';
            item.draggable = true;
            item.innerHTML = `
                <div class="search-item-info">
                    <div class="search-item-icon">${game.iconData ? `<img src="${game.iconData}" alt="icon" draggable="false" style="width:100%; height:100%; object-fit:contain; pointer-events:none;">` : '🎮'}</div>
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

            if (!game.iconData) {
                electronAPI.getIcon(game.exePath).then((iconData) => {
                    if (iconData) {
                        game.iconData = iconData;
                        const iconSpan = item.querySelector('.search-item-icon');
                        iconSpan.innerHTML = `<img src="${iconData}" alt="icon" draggable="false" style="width:100%; height:100%; object-fit:contain; pointer-events:none;">`;
                    }
                });
            }

            item.ondragstart = (event) => {
                const gameKey = getGameKey(game);
                setDraggedGameFolder(gameKey);
                event.dataTransfer.setData('gameKey', gameKey);
            };
            item.ondragend = () => {
                if (getDraggedGameFolder() === getGameKey(game)) {
                    setDraggedGameFolder(null);
                }
            };

            const launchIconWrapper = item.querySelector('.search-launch-icon-wrapper');
            launchIconWrapper.onclick = (event) => {
                event.stopPropagation();
                const card = document.querySelector(`.game-card[data-game-key="${getGameKey(game)}"]`);
                if (card) {
                    hideSearchDropdown();
                    refs.searchInput.value = '';
                    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    card.classList.add('glow');
                    setTimeout(() => card.classList.remove('glow'), 2000);
                }
            };

            item.onmouseenter = () => {
                tooltip.innerText = game.name;
                tooltip.style.display = 'block';
                const rect = item.getBoundingClientRect();
                tooltip.style.left = `${rect.left}px`;
                tooltip.style.top = `${rect.bottom + 5}px`;
            };
            item.onmouseleave = () => {
                tooltip.style.display = 'none';
            };
            item.ondblclick = (event) => {
                event.stopPropagation();
                electronAPI.launchYume({ gameKey: getGameKey(game), exePath: game.exePath });
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
