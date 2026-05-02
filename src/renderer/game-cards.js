import { getGameKey } from './library-order.js';
import { applyIconPayload, cacheIconPayload, logIconRender, readCachedIconPayload, renderIconMarkup } from './icon-payload.js';

export function createGameCardFactory({
    attachTooltip,
    electronAPI,
    getStrings,
    onCardDeleted,
    onDragStateReset,
    onDragStart,
    onGameLaunched,
    onFavoriteToggled,
    onRefreshRequested
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

    function getDropdownActionIcon(action) {
        if (action === 'rename') {
            return `
                <svg class="dropdown-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M12 20h9"/>
                    <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
                </svg>
            `;
        }
        if (action === 'reveal') {
            return `
                <svg class="dropdown-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M3 7h5l2 2h11v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                    <path d="M3 7V5a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2"/>
                </svg>
            `;
        }
        if (action === 'delete') {
            return `
                <svg class="dropdown-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M3 6h18"/>
                    <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/>
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                    <path d="M10 11v6"/>
                    <path d="M14 11v6"/>
                </svg>
            `;
        }
        return '';
    }

    function createCard(game, options = {}) {
        const d = getStrings();
        const gameKey = getGameKey(game);
        const draggable = options.draggable !== false;
        const launchMode = options.launchMode || 'double';
        const interactiveSelector = '.fav-btn, .menu-btn, .dropdown-menu, .rename-input';
        const showDuplicateChip = options.showDuplicateChip !== false;
        const showPath = options.showPath !== false;
        const contextLabel = options.contextLabel || '';
        const cachedIcon = !game.iconData ? readCachedIconPayload(game.exePath) : null;
        if (cachedIcon) {
            applyIconPayload(game, cachedIcon);
        }
        console.log(
            `[FRONTEND][CARD] create key=${gameKey} hasIcon=${game.iconData ? 'true' : 'false'} source=${game.iconSource || 'none'} fit=${game.iconFit || 'none'}`
        );
        const card = document.createElement('div');
        card.className = `game-card ${game.favorite ? 'favorited' : ''}`;
        card.dataset.gameKey = gameKey;
        if (game.duplicateSignature) {
            card.dataset.duplicateSignature = game.duplicateSignature;
        }
        card.draggable = draggable;
        card.innerHTML = `
            <div class="fav-btn ${game.favorite ? 'active' : ''}">★</div>
            <div class="menu-btn"><svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2.5" fill="none"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg></div>
            <div class="dropdown-menu">
                <div class="dropdown-item action-rename">${getDropdownActionIcon('rename')}<span>${d.rename}</span></div>
                <div class="dropdown-item action-reveal">${getDropdownActionIcon('reveal')}<span>${d.reveal}</span></div>
                <div class="dropdown-item danger action-delete">${getDropdownActionIcon('delete')}<span>${d.delete}</span></div>
            </div>
            <div class="game-icon">${game.iconData ? renderIconMarkup(game.iconData, game.iconFit, game.iconSource) : '🎮'}</div>
            ${showDuplicateChip && game.duplicateCount > 1 ? `<div class="game-duplicate-chip">${game.duplicateCount}x</div>` : ''}
            <div class="game-title">${game.name}</div>
            <div class="game-status">${game.isRunning ? (d.status_playing || 'Playing') : timeSince(game.lastPlayed)}</div>
            <div class="game-playtime">${formatPlaytime(game.playtime)}</div>
            ${showPath ? `<div class="game-path">${game.relativePathDisplay || ''}</div>` : ''}
            ${contextLabel ? `<div class="game-context-label">${contextLabel}</div>` : ''}
        `;
        console.log(`[FRONTEND] Game card is updated for ${gameKey}, isRunning: ${game.isRunning}, status: ${game.isRunning ? 'Playing' : timeSince(game.lastPlayed)}`);
        if (game.iconData) {
            logIconRender('card-initial', gameKey, {
                dataUrl: game.iconData,
                fit: game.iconFit,
                source: game.iconSource,
                debug: game.iconDebug
            }, card.querySelector('.game-icon img'));
        }

        if (!game.iconData) {
            electronAPI.getIcon(game.exePath).then((iconPayload) => {
                const normalizedIcon = applyIconPayload(game, iconPayload);
                if (!normalizedIcon) return;
                console.log(
                    `[FRONTEND][CARD] async-icon key=${gameKey} source=${normalizedIcon.source} fit=${normalizedIcon.fit}`
                );
                cacheIconPayload(game.exePath, normalizedIcon);
                const iconDiv = card.querySelector('.game-icon');
                if (iconDiv) {
                    iconDiv.innerHTML = renderIconMarkup(normalizedIcon.dataUrl, normalizedIcon.fit, normalizedIcon.source);
                    logIconRender('card-async', gameKey, normalizedIcon, iconDiv.querySelector('img'));
                }
            });
        }

        attachTooltip(card, () => ({
            title: game.name,
            subtitle: game.relativePathFullDisplay || game.relativePathDisplay || game.relativePath || game.folderPath || ''
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
            const nextFavorite = await electronAPI.toggleFavorite(gameKey);
            game.favorite = nextFavorite;
            if (typeof onFavoriteToggled === 'function') {
                onFavoriteToggled(gameKey, nextFavorite);
            }
            onRefreshRequested();
        };
        card.querySelector('.menu-btn').onclick = (event) => {
            event.stopPropagation();
            document.querySelectorAll('.dropdown-menu').forEach(menu => menu !== card.querySelector('.dropdown-menu') && menu.classList.remove('show'));
            card.querySelector('.dropdown-menu').classList.toggle('show');
        };
        card.querySelector('.action-rename').onclick = (event) => {
            event.stopPropagation();
            card.querySelector('.dropdown-menu').classList.remove('show');
            const titleDiv = card.querySelector('.game-title');
            const input = document.createElement('input');
            input.type = 'text';
            input.value = game.name;
            input.className = 'rename-input';
            titleDiv.replaceWith(input);
            input.focus();
            input.select();

            const save = async () => {
                if (input.value.trim() && input.value.trim() !== game.name) {
                    game.name = input.value.trim();
                    await electronAPI.renameGame({ gameKey, newName: game.name });
                }
                if (input.parentNode) input.replaceWith(titleDiv);
                titleDiv.innerText = game.name;
            };

            input.onkeydown = (ev) => {
                if (ev.key === 'Enter') save();
                if (ev.key === 'Escape') input.replaceWith(titleDiv);
            };
            input.onblur = save;
        };
        card.querySelector('.action-reveal').onclick = (event) => {
            event.stopPropagation();
            electronAPI.revealGame(game.exePath);
        };
        card.querySelector('.action-delete').onclick = async (event) => {
            event.stopPropagation();
            if (confirm(d.confirm)) {
                await electronAPI.deleteGame(game.folderPath);
                onCardDeleted(gameKey);
                onRefreshRequested();
            }
        };
        const launchGame = () => {
            console.log(`[FRONTEND] launchGame triggered for ${gameKey}, path: ${game.exePath}`);
            card.style.opacity = '0.5';
            electronAPI.launchYume({ gameKey, exePath: game.exePath });
            if (typeof onGameLaunched === 'function') {
                onGameLaunched(gameKey);
            } else {
                onRefreshRequested();
            }
        };
        if (launchMode === 'single') {
            card.onclick = (event) => {
                if (event.target.closest(interactiveSelector)) return;
                launchGame();
            };
        } else {
            card.ondblclick = launchGame;
        }

        if (draggable) {
            card.ondragstart = (event) => {
                if (event.target.closest(interactiveSelector)) {
                    event.preventDefault();
                    return false;
                }
                event.dataTransfer.setData('gameKey', gameKey);
                event.dataTransfer.effectAllowed = 'move';
                requestAnimationFrame(() => {
                    card.style.opacity = '0.01';
                });
                onDragStart(gameKey);
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
        createCard
    };
}
