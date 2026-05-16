import { applyIconPayload, cacheIconPayload, logIconRender, readCachedIconPayload, renderIconMarkup } from './icon-payload.js';

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
    function timeSince(date) {
        const d = getStrings();
        if (!date || date === 0) return d.status_never;
        const seconds = Math.floor((new Date() - date) / 1000);
        if (seconds < 60) return d.status_recent;
        let interval = seconds / 3600;
        if (interval > 1) return Math.floor(interval) + d.status_hours;
        interval = seconds / 60;
        if (interval > 1) return Math.floor(interval) + d.status_mins;
        return d.status_recent;
    }

    function formatPlaytime(ms) {
        if (!ms || ms < 60000) return '0m';
        const totalMins = Math.floor(ms / 60000);
        const hours = Math.floor(totalMins / 60);
        const mins = totalMins % 60;
        if (hours > 0) {
            return `${hours}h ${mins}m`;
        }
        return `${mins}m`;
    }

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
                <div class="dropdown-item action-rename">
                    <svg class="dropdown-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M12 20h9"/>
                        <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
                    </svg>
                    <span>${d.rename}</span>
                </div>
            </div>
            <div class="game-icon">${primaryGame.iconData ? renderIconMarkup(primaryGame.iconData, primaryGame.iconFit, primaryGame.iconSource) : '🎮'}</div>
            <div class="game-duplicate-chip">${stackSize}x</div>
            <div class="game-title">${primaryGame.name}</div>
            <div class="game-status">${isStackRunning ? (d.status_playing || 'Playing') : timeSince(primaryGame.lastPlayed)}</div>
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

        const menuButton = card.querySelector('.menu-btn');
        const dropdownMenu = card.querySelector('.dropdown-menu');
        menuButton.onclick = (event) => {
            event.stopPropagation();
            document.querySelectorAll('.dropdown-menu').forEach((menu) => {
                if (menu !== dropdownMenu) {
                    menu.classList.remove('show');
                }
            });
            dropdownMenu.classList.toggle('show');
        };
        card.querySelector('.action-rename').onclick = (event) => {
            event.stopPropagation();
            dropdownMenu.classList.remove('show');
            const titleDiv = card.querySelector('.game-title');
            const input = document.createElement('input');
            input.type = 'text';
            input.value = primaryGame.name;
            input.className = 'rename-input';
            titleDiv.replaceWith(input);
            input.focus();
            input.select();

            const save = async () => {
                const nextName = input.value.trim();
                if (nextName && nextName !== primaryGame.name) {
                    primaryGame.name = nextName;
                    await electronAPI.renameGame({ gameKey: representativeKey, newName: nextName });
                    if (typeof onRenamed === 'function') {
                        onRenamed(representativeKey, nextName);
                    }
                }
                if (input.parentNode) input.replaceWith(titleDiv);
                titleDiv.innerText = primaryGame.name;
                if (typeof onRefreshRequested === 'function') {
                    onRefreshRequested();
                }
            };

            input.onkeydown = (ev) => {
                if (ev.key === 'Enter') save();
                if (ev.key === 'Escape') input.replaceWith(titleDiv);
            };
            input.onblur = save;
        };

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
