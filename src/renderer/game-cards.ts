// @ts-nocheck
import { getGameKey } from './library-order';
import { applyIconPayload, getGameIconUrl, logIconRender, readCachedIconPayload, renderIconMarkup } from './icon-payload';
import { formatBytes, formatPlaytime, timeSince } from './utils/formatting';
import { getDropdownActionIcon } from './ui-components/dropdown-icons';
import { bindDropdownToggle, bindRenameAction } from './ui-components/card-dropdown';
import { showToastPill } from './ui/toast-pill';

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
        const iconSrc = game.iconData || (game.exePath ? getGameIconUrl(game.exePath) : null);
        const card = document.createElement('div');
        card.className = `game-card ${game.favorite ? 'favorited' : ''}`;
        card.dataset.gameKey = gameKey;
        if (game.duplicateSignature) {
            card.dataset.duplicateSignature = game.duplicateSignature;
        }
        card.draggable = draggable;
        // nosemgrep: javascript.browser.security.insecure-innerhtml, javascript.browser.security.insecure-document-method
        // sourcery skip: insecure-innerhtml, insecure-document-method
        card.innerHTML = `
            <div class="fav-btn ${game.favorite ? 'active' : ''}">★</div>
            <div class="menu-btn"><svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2.5" fill="none"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg></div>
            <div class="dropdown-menu">
                <div class="dropdown-item action-rename">${getDropdownActionIcon('rename')}<span>${d.rename}</span></div>
                <div class="dropdown-item action-reveal">${getDropdownActionIcon('reveal')}<span>${d.reveal}</span></div>
                <div class="dropdown-item has-submenu action-saves-group">
                    ${getDropdownActionIcon('saves-group')}
                    <span>${d.action_saves_group || 'Saves'}</span>
                    <div class="dropdown-submenu">
                        <div class="dropdown-item action-save-editor">${getDropdownActionIcon('save-editor')}<span>${d.action_save_editor || 'Open Save Editor'}</span></div>
                        <div class="dropdown-item action-save-folder">${getDropdownActionIcon('save-folder')}<span>${d.action_save_folder || 'Open Save Folder'}</span></div>
                        <div class="dropdown-item action-set-save-folder">${getDropdownActionIcon('save-folder')}<span>${d.action_set_save_folder || 'Set Save Folder Path'}</span></div>
                        ${game.saveFolderOverride ? `<div class="dropdown-item action-reset-save-folder">${getDropdownActionIcon('save-folder')}<span>${d.action_reset_save_folder || 'Reset to Auto-detect'}</span></div>` : ''}
                    </div>
                </div>
                <div class="dropdown-item has-submenu action-addons-group">
                    ${getDropdownActionIcon('addons-group')}
                    <span>${d.action_addons_group || 'Add-ons'}</span>
                    <div class="dropdown-submenu">
                        <div class="dropdown-item action-live-translate">${getDropdownActionIcon(game.autoTranslate ? 'checkbox-on' : 'checkbox-off')}<span>${d.action_live_translate || 'Live Translation'}</span></div>
                        <div class="dropdown-item action-pre-translate">${getDropdownActionIcon('save-editor')}<span>${d.action_pre_translate || 'Pre-Translate Game'}</span></div>
                        <div class="dropdown-item action-background-run">${getDropdownActionIcon(game.runInBackground ? 'checkbox-on' : 'checkbox-off')}<span>${d.action_background_run || 'Run in Background'}</span></div>
                    </div>
                </div>
                <div class="dropdown-item danger action-delete">${getDropdownActionIcon('delete')}<span>${d.delete}</span></div>
            </div>
            <div class="game-icon">${iconSrc ? renderIconMarkup(iconSrc, game.iconFit, game.iconSource || 'game-icon') : '🎮'}</div>
            ${showDuplicateChip && game.duplicateCount > 1 ? `<div class="game-duplicate-chip">${game.duplicateCount}x</div>` : ''}
            <div class="game-title">${game.name}</div>
            <div class="game-status">${game.isRunning ? (d.status_playing || 'Playing') : timeSince(game.lastPlayed, getStrings)}</div>
            <div class="game-playtime">${formatPlaytime(game.playtime)}</div>
            ${showPath ? `<div class="game-path">${game.relativePathDisplay || ''}</div>` : ''}
            ${contextLabel ? `<div class="game-context-label">${contextLabel}</div>` : ''}
        `;
        if (iconSrc) {
            logIconRender('card-initial', gameKey, {
                dataUrl: iconSrc,
                fit: game.iconFit,
                source: game.iconSource || 'game-icon',
                debug: game.iconDebug
            }, card.querySelector('.game-icon img'));
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
        let isOpening = false;
        const saveItem = card.querySelector('.action-save-folder') as HTMLElement | null;
        if (saveItem) {
            saveItem.onclick = async (event) => {
                event.stopPropagation();
                if (isOpening) return;
                isOpening = true;
                card.querySelector('.dropdown-menu')?.classList.remove('show');
                try {
                    const res = await electronAPI.openSaveFolder(gameKey);
                    if (!res?.ok) {
                        if (res?.error === 'override-missing') {
                            showToastPill(d.save_editor_override_missing || 'Configured save folder not found');
                        } else if (res?.error === 'not-found' || res?.error === 'no-record') {
                            showToastPill(d.no_save_folder_found || 'No save folder found');
                        } else {
                            showToastPill(`${d.save_folder_open_failed || 'Failed to open save folder'}${res?.error ? `: ${res.error}` : ''}`);
                        }
                    }
                } catch {
                    showToastPill(d.no_save_folder_found || 'No save folder found');
                } finally {
                    isOpening = false;
                }
            };
        }

        let isSelecting = false;
        const setItem = card.querySelector('.action-set-save-folder') as HTMLElement | null;
        if (setItem) {
            setItem.onclick = async (event) => {
                event.stopPropagation();
                if (isSelecting) return;
                isSelecting = true;
                card.querySelector('.dropdown-menu')?.classList.remove('show');
                try {
                    const result = await electronAPI.selectSaveFolder();
                    if (!result?.canceled && result?.folderPath) {
                        const res = await electronAPI.setSaveFolderOverride({ gameKey, folderPath: result.folderPath });
                        if (res?.ok) {
                            game.saveFolderOverride = result.folderPath;
                            onRefreshRequested();
                            showToastPill(d.save_folder_set_success || 'Save folder path updated');
                        } else {
                            if (res?.error === 'invalid-payload') {
                                showToastPill(d.invalid_folder_path || 'Invalid folder path (network paths not supported)');
                            } else if (res?.error === 'game-not-found') {
                                showToastPill(d.game_not_found || 'Game not found in library');
                            } else {
                                showToastPill(`${d.save_folder_set_failed || 'Failed to set save folder'}${res?.error ? `: ${res.error}` : ''}`);
                            }
                        }
                    }
                } catch (err) {
                    console.error('[CARD][set-save-folder] Error:', err);
                    showToastPill(d.save_folder_set_failed || 'Failed to set save folder');
                } finally {
                    isSelecting = false;
                }
            };
        }

        let isResetting = false;
        const resetItem = card.querySelector('.action-reset-save-folder') as HTMLElement | null;
        if (resetItem) {
            resetItem.onclick = async (event) => {
                event.stopPropagation();
                if (isResetting) return;
                isResetting = true;
                card.querySelector('.dropdown-menu')?.classList.remove('show');
                try {
                    const res = await electronAPI.setSaveFolderOverride({ gameKey, folderPath: '' });
                    if (res?.ok) {
                        game.saveFolderOverride = undefined;
                        onRefreshRequested();
                        showToastPill(d.save_folder_reset_success || 'Save folder reset to auto-detect');
                    } else {
                        showToastPill(d.save_folder_reset_failed || 'Failed to reset save folder');
                    }
                } catch (err) {
                    console.error('[CARD][reset-save-folder] Error:', err);
                    showToastPill(d.save_folder_reset_failed || 'Failed to reset save folder');
                } finally {
                    isResetting = false;
                }
            };
        }
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
