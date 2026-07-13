// @ts-nocheck
import { getGameKey } from './library-order';
import { applyIconPayload, cacheIconPayload, logIconRender, readCachedIconPayload, renderIconMarkup } from './icon-payload';
import { formatPlaytime, timeSince } from './utils/formatting';
import { getDropdownActionIcon } from './ui-components/dropdown-icons';
import { bindDropdownToggle, bindRenameAction } from './ui-components/card-dropdown';

function bindCardActions(card, game, context) {
    const {
        electronAPI,
        gameKey,
        d,
        attachTooltip,
        onFavoriteToggled,
        onRefreshRequested,
        onRenamed,
        onGameLaunched,
        onCardDeleted,
        onDragStart,
        onDragStateReset,
        interactiveSelector,
        launchMode,
        draggable
    } = context;

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
        const nextFavorite = await electronAPI.invoke('toggle-favorite', gameKey);
        game.favorite = nextFavorite;
        if (typeof onFavoriteToggled === 'function') {
            onFavoriteToggled(gameKey, nextFavorite);
        }
        onRefreshRequested();
    };

    bindDropdownToggle(card);

        bindRenameAction({
            card,
            currentName: () => game.name,
            electronAPI,
            gameKey,
            onRefreshRequested,
            onRenamed,
            onSaveData: (nextName) => { game.name = nextName; }
        });

    card.querySelector('.action-reveal').onclick = (event) => {
        event.stopPropagation();
        electronAPI.send('reveal-game', game.exePath);
    };

    card.querySelector('.action-save-folder').onclick = async (event) => {
        event.stopPropagation();
        console.log(`[FRONTEND][ACTION] Open Save Folder clicked for ${gameKey}`);
        card.querySelector('.dropdown-menu').classList.remove('show');
        const result = await electronAPI.invoke('get-save-folder', gameKey);
        if (result?.path) {
            electronAPI.send('open-path', result.path);
        } else {
            const item = card.querySelector('.action-save-folder');
            const originalText = item.querySelector('span').textContent;
            item.querySelector('span').textContent = 'No save folder found';
            item.style.opacity = '0.5';
            setTimeout(() => {
                item.querySelector('span').textContent = originalText;
                item.style.opacity = '';
            }, 2000);
        }
    };

    card.querySelector('.action-save-editor').onclick = async (event) => {
        event.stopPropagation();
        console.log(`[FRONTEND][ACTION] Open Save Editor clicked for ${gameKey}`);
        card.querySelector('.dropdown-menu').classList.remove('show');
        
        if (globalThis.showSaveEditor) {
            globalThis.showSaveEditor(gameKey);
        }
    };

    card.querySelector('.action-background-run').onclick = async (event) => {
        event.stopPropagation();
        const nextRunInBackground = await electronAPI.invoke('toggle-run-in-background', gameKey);
        game.runInBackground = nextRunInBackground;
        const item = card.querySelector('.action-background-run');
        item.innerHTML = `${getDropdownActionIcon(nextRunInBackground ? 'checkbox-on' : 'checkbox-off')}<span>Run in Background</span>`;
    };

    card.querySelector('.action-live-translate').onclick = async (event) => {
        event.stopPropagation();
        const nextAutoTranslate = await electronAPI.invoke('toggle-auto-translate', gameKey);
        game.autoTranslate = nextAutoTranslate;
        const item = card.querySelector('.action-live-translate');
        if (item) {
            item.innerHTML = `${getDropdownActionIcon(nextAutoTranslate ? 'checkbox-on' : 'checkbox-off')}<span>Live Translation</span>`;
        }
    };

    card.querySelector('.action-pre-translate').onclick = async (event) => {
        event.stopPropagation();
        card.querySelector('.dropdown-menu').classList.remove('show');
        let targetLang = 'en';
        try {
            const langState = await electronAPI.invoke('get-language-state');
            targetLang = (langState?.current) ? langState.current : 'en';
        } catch {
            // fall back to 'en'
        }
        await electronAPI.invoke('translation:start-sync', { gameKey, targetLang });
    };

    card.querySelector('.action-delete').onclick = async (event) => {
        event.stopPropagation();
        if (confirm(d.confirm)) {
            await electronAPI.invoke('delete-game', game.folderPath);
            onCardDeleted(gameKey);
            onRefreshRequested();
        }
    };

    const launchGame = () => {
        card.style.opacity = '0.5';
        electronAPI.send('launch-yume', { gameKey, exePath: game.exePath, runInBackground: game.runInBackground });
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
        card.ondblclick = (event) => {
            if (event.target.closest(interactiveSelector)) return;
            launchGame();
        };
    }

    if (draggable) {
        card.ondragstart = (event) => {
            if (event.target.closest(interactiveSelector)) {
                event.preventDefault();
                return false;
            }
            const rect = card.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            if (event.dataTransfer) {
                event.dataTransfer.setDragImage(card, x, y);
                event.dataTransfer.setData('gameKey', gameKey);
                event.dataTransfer.effectAllowed = 'move';
            }
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
}

export function createGameCardFactory({
    attachTooltip,
    electronAPI,
    getStrings,
    onCardDeleted,
    onDragStateReset,
    onDragStart,
    onGameLaunched,
    onFavoriteToggled,
    onRenamed,
    onRefreshRequested
}) {

    function createCard(game, options = {}) {
        const d = getStrings();
        const gameKey = getGameKey(game);
        const draggable = options.draggable !== false;
        const launchMode = options.launchMode || 'double';
        const interactiveSelector = '.fav-btn, .menu-btn, .dropdown-menu, .rename-input';
        const showDuplicateChip = options.showDuplicateChip !== false;
        const showPath = options.showPath !== false;
        const contextLabel = options.contextLabel || '';
        const cachedIcon = game.iconData ? null : readCachedIconPayload(game.exePath);
        if (cachedIcon) {
            applyIconPayload(game, cachedIcon);
        }
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
                <div class="dropdown-item action-save-folder">${getDropdownActionIcon('save-folder')}<span>Open Save Folder</span></div>
                <div class="dropdown-item action-save-editor">${getDropdownActionIcon('save-editor')}<span>${d.action_save_editor}</span></div>
                <div class="dropdown-item action-live-translate">${getDropdownActionIcon(game.autoTranslate ? 'checkbox-on' : 'checkbox-off')}<span>Live Translation</span></div>
                <div class="dropdown-item action-pre-translate">${getDropdownActionIcon('translate')}<span>Pre-Translate Game</span></div>
                <div class="dropdown-item action-background-run">${getDropdownActionIcon(game.runInBackground ? 'checkbox-on' : 'checkbox-off')}<span>Run in Background</span></div>
                <div class="dropdown-item danger action-delete">${getDropdownActionIcon('delete')}<span>${d.delete}</span></div>
                </div>
            <div class="game-icon">${game.iconData ? renderIconMarkup(game.iconData, game.iconFit, game.iconSource) : '🎮'}</div>
            ${showDuplicateChip && game.duplicateCount > 1 ? `<div class="game-duplicate-chip">${game.duplicateCount}x</div>` : ''}
            <div class="game-title">${game.name}</div>
            <div class="game-status">${game.isRunning ? (d.status_playing || 'Playing') : timeSince(game.lastPlayed, getStrings)}</div>
            <div class="game-playtime">${formatPlaytime(game.playtime)}</div>
            ${showPath ? `<div class="game-path">${game.relativePathDisplay || ''}</div>` : ''}
            ${contextLabel ? `<div class="game-context-label">${contextLabel}</div>` : ''}
        `;
        if (game.iconData) {
            logIconRender('card-initial', gameKey, {
                dataUrl: game.iconData,
                fit: game.iconFit,
                source: game.iconSource,
                debug: game.iconDebug
            }, card.querySelector('.game-icon img'));
        }

        if (!game.iconData) {
            electronAPI.invoke('get-icon', game.exePath).then((iconPayload) => {
                const normalizedIcon = applyIconPayload(game, iconPayload);
                if (!normalizedIcon) return;
                cacheIconPayload(game.exePath, normalizedIcon);
                const iconDiv = card.querySelector('.game-icon');
                if (iconDiv) {
                    iconDiv.innerHTML = '';
                    const img = document.createElement('img');
                    img.src = normalizedIcon.dataUrl;
                    img.alt = 'icon';
                    img.draggable = false;
                    img.dataset.iconFit = normalizedIcon.fit === 'cover' ? 'cover' : 'contain';
                    img.dataset.iconSource = normalizedIcon.source;
                    img.style.width = '100%';
                    img.style.height = '100%';
                    img.style.objectFit = normalizedIcon.fit === 'cover' ? 'cover' : 'contain';
                    img.style.pointerEvents = 'none';
                    iconDiv.appendChild(img);
                    logIconRender('card-async', gameKey, normalizedIcon, img);
                }
            });
        }

        electronAPI.invoke('translation:check-support', gameKey).then((result) => {
            const liveItem = card.querySelector('.action-live-translate') as HTMLElement | null;
            const preItem = card.querySelector('.action-pre-translate') as HTMLElement | null;
            
            const isLiveSupported = result.supported && result.engine === 'unity';
            const isPreSupported = result.supported && ['unity', 'rpg-maker'].includes(result.engine);

            if (!isLiveSupported && liveItem) {
                liveItem.style.display = 'none';
            }

            if (!isPreSupported && preItem) {
                preItem.style.display = 'none';
            }
        });

        const context = {
            electronAPI,
            gameKey,
            d,
            attachTooltip,
            onFavoriteToggled,
            onRefreshRequested,
            onRenamed,
            onGameLaunched,
            onCardDeleted,
            onDragStart,
            onDragStateReset,
            interactiveSelector,
            launchMode,
            draggable
        };
        bindCardActions(card, game, context);

        return card;
    }

    return {
        createCard
    };
}
