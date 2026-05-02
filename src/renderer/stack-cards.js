import { applyIconPayload, cacheIconPayload, logIconRender, readCachedIconPayload, renderIconMarkup } from './icon-payload.js';

export function createStackCardFactory({
    attachTooltip,
    getStrings,
    onOpenStack,
    onDragStart,
    onDragStateReset
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

    function createStackCard(stack) {
        const { primaryGame, representativeKey, stackSize } = stack;
        const uniqueLocations = [...new Set(stack.games.map((game) => game.locationLabel).filter(Boolean))];
        const locationSummary = uniqueLocations.length > 1
            ? `${uniqueLocations[0]} +${uniqueLocations.length - 1}`
            : (uniqueLocations[0] || primaryGame.locationLabel || '');
        const cachedIcon = !primaryGame.iconData ? readCachedIconPayload(primaryGame.exePath) : null;
        if (cachedIcon) {
            applyIconPayload(primaryGame, cachedIcon);
        }
        console.log(
            `[FRONTEND][STACK-CARD] create key=${representativeKey} hasIcon=${primaryGame.iconData ? 'true' : 'false'} source=${primaryGame.iconSource || 'none'} fit=${primaryGame.iconFit || 'none'}`
        );
        const card = document.createElement('div');
        card.className = `game-card stack-card ${stack.favorite ? 'favorited' : ''}`;
        card.dataset.gameKey = representativeKey;
        card.dataset.duplicateSignature = primaryGame.duplicateSignature || '';
        card.draggable = true;
        const d = getStrings();
        const isStackRunning = stack.games.some(g => g.isRunning);
        card.innerHTML = `
            <div class="fav-btn stack-fav-indicator ${stack.favorite ? 'active' : ''}">★</div>
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
                console.log(
                    `[FRONTEND][STACK-CARD] async-icon key=${representativeKey} source=${normalizedIcon.source} fit=${normalizedIcon.fit}`
                );
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

        let suppressNextClick = false;
        card.onclick = () => {
            if (suppressNextClick) {
                suppressNextClick = false;
                return;
            }
            onOpenStack(stack);
        };
        card.ondblclick = (event) => {
            event.preventDefault();
            event.stopPropagation();
            onOpenStack(stack);
        };
        card.ondragstart = (event) => {
            suppressNextClick = true;
            event.dataTransfer.setData('gameKey', representativeKey);
            event.dataTransfer.effectAllowed = 'move';
            requestAnimationFrame(() => {
                card.style.opacity = '0.01';
            });
            onDragStart(representativeKey);
        };
        card.ondragend = () => {
            card.style.opacity = '1';
            onDragStateReset();
        };
        card.ondragenter = (event) => { event.preventDefault(); };
        card.ondragleave = (event) => { event.preventDefault(); };
        card.ondragover = (event) => { event.preventDefault(); };
        card.ondrop = (event) => { event.preventDefault(); };

        return card;
    }

    return {
        createStackCard
    };
}
