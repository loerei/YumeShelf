import { applyIconPayload, cacheIconPayload, logIconRender, readCachedIconPayload, renderIconMarkup } from './icon-payload.js';
import { formatPlaytime, timeSince } from './utils/formatting.js';
import { getDropdownActionIcon } from './ui-components/dropdown-icons.js';
import { bindDropdownToggle, bindRenameAction } from './ui-components/card-dropdown.js';

export function createStackCardFactory({
    attachTooltip,
    electronAPI,
    getStrings,
    onOpenStack,
    onDragStart,
    onDragStateReset,
    onFavoriteToggled,
    onRefreshRequested,
    onRenamed
}) {
    function createStackCard(stack, options = {}) {
        const { primaryGame, representativeKey, stackSize } = stack;
        const interactiveSelector = '.fav-btn, .menu-btn, .dropdown-menu, .rename-input';
        const draggable = options.draggable !== false;
        const uniqueLocations = [...new Set(stack.games.map((game) => game.locationLabel).filter(Boolean))];
        const locationSummary = uniqueLocations.length > 1
            ? `${uniqueLocations[0]} +${uniqueLocations.length - 1}`
            : (uniqueLocations[0] || primaryGame.locationLabel || '');
        const cachedIcon = !primaryGame.iconData ? readCachedIconPayload(primaryGame.exePath) : null;
        if (cachedIcon) {
            applyIconPayload(primaryGame, cachedIcon);
        }
        const card = document.createElement('div');
        card.className = `game-card stack-card ${stack.favorite ? 'favorited' : ''}`;
        card.dataset.gameKey = representativeKey;
        card.dataset.duplicateSignature = primaryGame.duplicateSignature || '';
        card.draggable = draggable;
        const d = getStrings();
        const isStackRunning = stack.games.some(g => g.isRunning);
        card.innerHTML = `
            <div class="fav-btn stack-fav-indicator ${stack.favorite ? 'active' : ''}">★</div>
            <div class="menu-btn"><svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2.5" fill="none"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg></div>
            <div class="dropdown-menu">
                <div class="dropdown-item action-rename">${getDropdownActionIcon('rename')}<span>${d.rename}</span></div>
            </div>
            <div class="game-icon">${primaryGame.iconData ? renderIconMarkup(primaryGame.iconData, primaryGame.iconFit, primaryGame.iconSource) : '🎮'}</div>
            <div class="game-duplicate-chip">${stackSize}x</div>
            <div class="game-title">${primaryGame.name}</div>
            <div class="game-status">${isStackRunning ? (d.status_playing || 'Playing') : timeSince(primaryGame.lastPlayed, getStrings)}</div>
            <div class="game-playtime">${formatPlaytime(primaryGame.playtime)}</div>
            <div class="game-path">${locationSummary}</div>
        `;
        if (primaryGame.iconData) {
            logIconRender('stack-card-initial', representativeKey, {
                dataUrl: primaryGame.iconData,
                fit: primaryGame.iconFit,
                source: primaryGame.iconSource,
                debug: primaryGame.iconDebug
            }, card.querySelector('.game-icon img'));
        }

        if (!primaryGame.iconData) {
            window.electronAPI.getIcon(primaryGame.exePath).then((iconPayload) => {
                const normalizedIcon = applyIconPayload(primaryGame, iconPayload);
                if (!normalizedIcon) return;
                cacheIconPayload(primaryGame.exePath, normalizedIcon);
                const iconDiv = card.querySelector('.game-icon');
                if (iconDiv) {
                    iconDiv.innerHTML = renderIconMarkup(normalizedIcon.dataUrl, normalizedIcon.fit, normalizedIcon.source);
                    logIconRender('stack-card-async', representativeKey, normalizedIcon, iconDiv.querySelector('img'));
                }
            });
        }

        attachTooltip(card, () => ({
            title: primaryGame.name,
            subtitle: primaryGame.fullLocationLabel || locationSummary
        }));

        const favoriteButton = card.querySelector('.fav-btn');
        favoriteButton.draggable = false;
        favoriteButton.onmousedown = (event) => {
            event.preventDefault();
        };
        favoriteButton.onclick = async (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (typeof event.stopImmediatePropagation === 'function') {
                event.stopImmediatePropagation();
            }
            const nextFavorite = await electronAPI.toggleFavorite(representativeKey);
            stack.favorite = nextFavorite;
            favoriteButton.classList.toggle('active', nextFavorite);
            card.classList.toggle('favorited', nextFavorite);
            if (typeof onFavoriteToggled === 'function') {
                onFavoriteToggled(representativeKey, nextFavorite);
            }
            if (typeof onRefreshRequested === 'function') {
                onRefreshRequested();
            }
        };

        bindDropdownToggle(card);
        bindRenameAction({
            card,
            currentName: () => primaryGame.name,
            electronAPI,
            gameKey: representativeKey,
            onRefreshRequested,
            onRenamed,
            onSaveData: (nextName) => { primaryGame.name = nextName; }
        });

        let suppressNextClick = false;
        card.onclick = (event) => {
            if (event.target.closest(interactiveSelector)) return;
            if (suppressNextClick) {
                suppressNextClick = false;
                return;
            }
            onOpenStack(stack);
        };
        card.ondblclick = (event) => {
            if (event.target.closest(interactiveSelector)) return;
            event.preventDefault();
            event.stopPropagation();
            onOpenStack(stack);
        };
        if (draggable) {
            card.ondragstart = (event) => {
                if (event.target.closest(interactiveSelector)) {
                    event.preventDefault();
                    return false;
                }
                const didStart = onDragStart(representativeKey);
                if (didStart === false) {
                    event.preventDefault();
                    return false;
                }
                suppressNextClick = true;
                event.dataTransfer.setData('gameKey', representativeKey);
                event.dataTransfer.effectAllowed = 'move';
                requestAnimationFrame(() => {
                    card.style.opacity = '0.01';
                });
            };
            card.ondragend = () => {
                card.style.opacity = '1';
                onDragStateReset();
            };
            card.ondragenter = (event) => { event.preventDefault(); };
            card.ondragleave = (event) => { event.preventDefault(); };
            card.ondragover = (event) => { event.preventDefault(); };
            card.ondrop = (event) => { event.preventDefault(); };
        }

        return card;
    }

    return {
        createStackCard
    };
}
