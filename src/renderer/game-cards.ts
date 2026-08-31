// @ts-nocheck
import { getGameKey } from './library-order';
import { applyIconPayload, cacheIconPayload, logIconRender, readCachedIconPayload, renderIconMarkup } from './icon-payload';
import { formatBytes, formatPlaytime, timeSince } from './utils/formatting';
import { getDropdownActionIcon } from './ui-components/dropdown-icons';
import { bindDropdownToggle, bindRenameAction } from './ui-components/card-dropdown';

export function createGameCardFactory({
    attachTooltip,
    electronAPI,
    getStrings,
    onCardDeleted,
    onDragStateReset,
    onDragStart,
    onGameLaunched,
    onFavoriteToggled,
    onRefreshRequested,
    isBetaExposed
}) {

    function createCard(game, options = {}) {
        console.log('[DIAG][createCard] gameKey:', getGameKey(game), 'name:', game?.name);
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
                <div class="dropdown-item action-save-folder">${getDropdownActionIcon('save-folder')}<span>${d.action_save_folder || 'Open Save Folder'}</span></div>
                <div class="dropdown-item action-save-editor">${getDropdownActionIcon('save-editor')}<span>${d.action_save_editor}</span></div>
                <div class="dropdown-item action-live-translate">${getDropdownActionIcon(game.autoTranslate ? 'checkbox-on' : 'checkbox-off')}<span>${d.action_live_translate || 'Live Translation'}</span></div>
                <div class="dropdown-item action-pre-translate">${getDropdownActionIcon('save-editor')}<span>${d.action_pre_translate || 'Pre-Translate Game'}</span></div>
                <div class="dropdown-item action-background-run">${getDropdownActionIcon(game.runInBackground ? 'checkbox-on' : 'checkbox-off')}<span>${d.action_background_run || 'Run in Background'}</span></div>
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
            electronAPI.getIcon(game.exePath).then((iconPayload) => {
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

        electronAPI.checkTranslationSupport(gameKey).then((result) => {
            const liveItem = card.querySelector('.action-live-translate');
            const preItem = card.querySelector('.action-pre-translate');
            if (!result.supported) {
                if (liveItem) {
                    liveItem.className = 'dropdown-item action-live-translate disabled';
                    liveItem.style.opacity = '0.4';
                    liveItem.style.cursor = 'not-allowed';
                    liveItem.querySelector('span').textContent = d.not_supported || 'Not yet supported';
                    liveItem.onclick = (e) => e.stopPropagation();
                }
                if (preItem) {
                    preItem.className = 'dropdown-item action-pre-translate disabled';
                    preItem.style.opacity = '0.4';
                    preItem.style.cursor = 'not-allowed';
                    preItem.querySelector('span').textContent = d.not_supported || 'Not yet supported';
                    preItem.onclick = (e) => e.stopPropagation();
                }
            }
            if (preItem && typeof isBetaExposed === 'function' && !isBetaExposed()) {
                preItem.style.display = 'none';
            }
        });

        attachTooltip(card, () => ({
            title: game.name,
            engine: game.engine || undefined,
            size: formatBytes(game.sizeBytes),
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
        bindDropdownToggle(card);
        bindRenameAction({
            card,
            currentName: () => game.name,
            electronAPI,
            gameKey,
            onSaveData: (nextName) => { game.name = nextName; }
        });
        card.querySelector('.action-reveal').onclick = (event) => {
            event.stopPropagation();
            electronAPI.revealGame(game.exePath);
        };
        card.querySelector('.action-save-folder').onclick = async (event) => {
            event.stopPropagation();
            console.log(`[FRONTEND][ACTION] Open Save Folder clicked for ${gameKey}`);
            card.querySelector('.dropdown-menu').classList.remove('show');
            const result = await electronAPI.getSaveFolder(gameKey);
            if (result?.path) {
                electronAPI.openPath(result.path);
            } else {
                const item = card.querySelector('.action-save-folder');
                const originalText = item.querySelector('span').textContent;
                item.querySelector('span').textContent = d.no_save_folder_found || 'No save folder found';
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
            
            // We'll call a global editor UI handler that we'll define later
            if (window.showSaveEditor) {
                window.showSaveEditor(gameKey);
            }
        };
        card.querySelector('.action-background-run').onclick = async (event) => {
            event.stopPropagation();
            const nextRunInBackground = await electronAPI.toggleRunInBackground(gameKey);
            game.runInBackground = nextRunInBackground;
            const item = card.querySelector('.action-background-run');
            item.innerHTML = `${getDropdownActionIcon(nextRunInBackground ? 'checkbox-on' : 'checkbox-off')}<span>${d.action_background_run || 'Run in Background'}</span>`;
        };
        card.querySelector('.action-live-translate').onclick = async (event) => {
            event.stopPropagation();
            const nextAutoTranslate = await electronAPI.toggleAutoTranslate(gameKey);
            game.autoTranslate = nextAutoTranslate;
            const item = card.querySelector('.action-live-translate');
            if (item) {
                item.innerHTML = `${getDropdownActionIcon(nextAutoTranslate ? 'checkbox-on' : 'checkbox-off')}<span>${d.action_live_translate || 'Live Translation'}</span>`;
            }
        };
        card.querySelector('.action-pre-translate').onclick = async (event) => {
            event.stopPropagation();
            card.querySelector('.dropdown-menu').classList.remove('show');
            let targetLang = 'en';
            try {
                const langState = await electronAPI.getLanguageState();
                targetLang = langState?.current ?? 'en';
            } catch {
                // fall back to 'en'
            }
            await electronAPI.startTranslationSync({ gameKey, targetLang });
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
            card.style.opacity = '0.5';
            electronAPI.launchYume({ gameKey, exePath: game.exePath, runInBackground: game.runInBackground });
            if (typeof onGameLaunched === 'function') {
                onGameLaunched(gameKey, game.name);
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
