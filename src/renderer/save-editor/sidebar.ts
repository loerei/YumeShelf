// @ts-nocheck
import { escapeHtml } from '../markdown-lite';
import { showToastPill } from '../ui/toast-pill';

/**
 * @typedef {Object} SidebarRefs
 * @property {HTMLElement} sidebar
 * @property {HTMLElement} content
 * @property {HTMLElement} tabsWrapper
 * @property {HTMLElement} saveBtn
 * @property {HTMLInputElement} searchInput
 * @property {HTMLElement} overlay
 */

/**
 * @typedef {Object} SidebarState
 * @property {string} gameKey
 * @property {string | null} [currentFileName]
 * @property {any} [d]
 * @property {any} [currentSaveData]
 * @property {any} [originalSnapshot]
 * @property {any} [currentMetadata]
 * @property {() => boolean} [hasUnsavedChanges]
 */

/**
 * @typedef {Object} SidebarCallbacks
 * @property {() => void} onSaveLoaded
 */

function createSVG(pathD, width = 13, height = 13, viewBox = '0 0 24 24', strokeWidth = 2) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', viewBox);
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', String(strokeWidth));
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathD);
    svg.appendChild(path);
    return svg;
}

function createTrashSVG(width = 13, height = 13) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));

    const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    polyline.setAttribute('points', '3 6 5 6 21 6');
    svg.appendChild(polyline);

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2');
    svg.appendChild(path);

    const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line1.setAttribute('x1', '10');
    line1.setAttribute('y1', '11');
    line1.setAttribute('x2', '10');
    line1.setAttribute('y2', '17');
    svg.appendChild(line1);

    const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line2.setAttribute('x1', '14');
    line2.setAttribute('y1', '11');
    line2.setAttribute('x2', '14');
    line2.setAttribute('y2', '17');
    svg.appendChild(line2);

    return svg;
}

/**
 * Setup sidebar with save file items and loading/saving strategies.
 * @param {SidebarRefs} refs
 * @param {SidebarState} state
 * @param {import('./data-engine').DataEngine} engine
 * @param {any} translator
 * @param {SidebarCallbacks} callbacks
 */
export function setupSidebar(refs, state, engine, translator, callbacks) {
    const { sidebar, content, tabsWrapper, saveBtn, searchInput, overlay } = refs;
    const { gameKey } = state;
    const { onSaveLoaded } = callbacks;

    let activePopover = null;
    let activeTooltip = null;

    let currentReloadId = 0;
    let currentLoadId = 0;
    let lastResolvedPath = null;

    if (sidebar) {
        sidebar.innerHTML = '';
    }

    const toolbar = document.createElement('div');
    toolbar.className = 'save-editor-sidebar-toolbar';
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', 'Save folder actions');
    toolbar.style.display = 'flex';

    const listContainer = document.createElement('div');
    listContainer.className = 'save-editor-file-list';

    if (sidebar) {
        sidebar.appendChild(toolbar);
        sidebar.appendChild(listContainer);
    }

    const formatFolderError = (error, defaultMsg = 'Failed to set save folder') => {
        if (error === 'invalid-payload') return state.d?.invalid_folder_path || 'Invalid folder path (network paths not supported)';
        if (error === 'game-not-found') return state.d?.game_not_found || 'Game not found in library';
        return `${defaultMsg}${error ? `: ${error}` : ''}`;
    };

    function dismissPopovers() {
        if (activePopover) {
            activePopover.remove();
            activePopover = null;
        }
        if (activeTooltip) {
            activeTooltip.remove();
            activeTooltip = null;
        }
        overlay?.querySelectorAll('.has-open-popover').forEach(el => el.classList.remove('has-open-popover'));
    }

    function showTooltip(message, targetEl) {
        dismissPopovers();
        const tooltip = document.createElement('div');
        tooltip.className = 'save-editor-rename-tooltip';
        tooltip.setAttribute('role', 'alert');
        tooltip.setAttribute('aria-live', 'polite');
        tooltip.textContent = message;
        document.body.appendChild(tooltip);

        const rect = targetEl.getBoundingClientRect();
        const tooltipWidth = 260;
        let left = rect.left;
        if (left + tooltipWidth > window.innerWidth - 10) {
            left = window.innerWidth - tooltipWidth - 10;
        }
        if (left < 10) left = 10;

        let top = rect.bottom + 4;
        if (top + 60 > window.innerHeight) {
            top = Math.max(10, rect.top - 50);
        }

        tooltip.style.top = `${top}px`;
        tooltip.style.left = `${left}px`;

        activeTooltip = tooltip;
        setTimeout(() => {
            if (activeTooltip === tooltip) {
                tooltip.remove();
                activeTooltip = null;
            }
        }, 3500);
    }

    function showPopover({ targetEl, title, desc, cancelText, confirmText, confirmClass = 'danger-btn', onConfirm, onCancel }) {
        dismissPopovers();
        const popover = document.createElement('div');
        popover.className = 'save-editor-popover';

        const titleEl = document.createElement('div');
        titleEl.className = 'save-editor-popover-title';
        titleEl.textContent = title;
        popover.appendChild(titleEl);

        if (desc) {
            const descEl = document.createElement('div');
            descEl.className = 'save-editor-popover-desc';
            descEl.textContent = desc;
            popover.appendChild(descEl);
        }

        const actionsEl = document.createElement('div');
        actionsEl.className = 'save-editor-popover-actions';

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'save-editor-popover-btn cancel-btn';
        cancelBtn.textContent = cancelText;
        cancelBtn.onclick = (e) => {
            e.stopPropagation();
            dismissPopovers();
            if (onCancel) onCancel();
        };

        const confirmBtn = document.createElement('button');
        confirmBtn.className = `save-editor-popover-btn ${confirmClass}`;
        confirmBtn.textContent = confirmText;
        confirmBtn.onclick = async (e) => {
            e.stopPropagation();
            dismissPopovers();
            if (onConfirm) await onConfirm();
        };

        actionsEl.appendChild(cancelBtn);
        actionsEl.appendChild(confirmBtn);
        popover.appendChild(actionsEl);

        document.body.appendChild(popover);

        const rect = targetEl.getBoundingClientRect();
        const popoverWidth = 260;
        let left = rect.left;
        if (left + popoverWidth > window.innerWidth - 10) {
            left = window.innerWidth - popoverWidth - 10;
        }
        let top = rect.bottom + 6;
        if (top + 120 > window.innerHeight) {
            top = Math.max(10, rect.top - 110);
        }

        popover.style.top = `${top}px`;
        popover.style.left = `${left}px`;

        activePopover = popover;

        const handleOutsideClick = (e) => {
            if (!popover.contains(e.target) && !targetEl.contains(e.target)) {
                dismissPopovers();
                document.removeEventListener('mousedown', handleOutsideClick);
                if (onCancel) onCancel();
            }
        };
        setTimeout(() => {
            document.addEventListener('mousedown', handleOutsideClick);
        }, 10);
    }

    function renderEmptyState(container, d) {
        container.innerHTML = `<div class="save-editor-empty" data-i18n="save_editor_no_saves">${d.save_editor_no_saves || 'No saves found'}</div>`;
        state.currentSaveData = null;
        state.originalSnapshot = null;
        state.currentFileName = null;
        ++currentLoadId;
        tabsWrapper.style.display = 'none';
        saveBtn.style.display = 'none';
        const mapBtn = overlay?.querySelector('.map-variable-btn');
        if (mapBtn) mapBtn.style.display = 'none';
        content.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                    <polyline points="17 21 17 13 7 13 7 21"/>
                    <polyline points="7 3 7 8 15 8"/>
                </svg>
                <p data-i18n="save_editor_select_title">${d.save_editor_select_title || 'Select a save file to start editing'}</p>
            </div>
        `;
    }

    function updateToolbar(saveInfo) {
        if (saveInfo?.overrideMissing === true) {
            toolbar.classList.add('collapsed');
            toolbar.removeAttribute('role');
            toolbar.innerHTML = '';
            return;
        }

        toolbar.classList.remove('collapsed');
        toolbar.setAttribute('role', 'toolbar');
        toolbar.innerHTML = '';

        const d = state.d || {};
        let resetBtn = null;

        const setFolderBtn = document.createElement('button');
        setFolderBtn.className = 'save-editor-toolbar-btn';
        setFolderBtn.textContent = d.save_editor_set_save_folder || 'Set Save Folder Path';
        toolbar.appendChild(setFolderBtn);

        let isSelecting = false;
        setFolderBtn.onclick = async () => {
            if (isSelecting) return;
            const doSelectFolder = async () => {
                if (isSelecting) return;
                isSelecting = true;
                setFolderBtn.setAttribute('aria-disabled', 'true');
                if (resetBtn) resetBtn.setAttribute('aria-disabled', 'true');
                try {
                    const result = await window.electronAPI.selectSaveFolder();
                    if (!result?.canceled && result?.folderPath) {
                        const res = await window.electronAPI.setSaveFolderOverride({ gameKey, folderPath: result.folderPath });
                        if (res?.ok) {
                            state.currentSaveData = null;
                            state.originalSnapshot = null;
                            state.currentFileName = null;
                            ++currentLoadId;
                            await reloadFileList(null);
                            showToastPill(state.d?.save_folder_set_success || 'Save folder path updated');
                        } else {
                            showTooltip(formatFolderError(res?.error, state.d?.save_folder_set_failed || 'Failed to set save folder'), setFolderBtn);
                        }
                    }
                } catch (err) {
                    showTooltip(`${state.d?.save_folder_set_failed || 'Failed to set save folder'}${err?.message ? `: ${err.message}` : ''}`, setFolderBtn);
                } finally {
                    isSelecting = false;
                    if (setFolderBtn.isConnected) setFolderBtn.removeAttribute('aria-disabled');
                    if (resetBtn?.isConnected) resetBtn.removeAttribute('aria-disabled');
                }
            };

            if (state.hasUnsavedChanges?.()) {
                showPopover({
                    targetEl: setFolderBtn,
                    title: state.d?.save_editor_unsaved_confirm || 'Discard unsaved changes?',
                    desc: state.d?.save_editor_unsaved_desc || 'You have unsaved changes in the current save file.',
                    cancelText: state.d?.cancel || 'Cancel',
                    confirmText: state.d?.discard || 'Discard',
                    confirmClass: 'danger-btn',
                    onConfirm: doSelectFolder
                });
                return;
            }
            await doSelectFolder();
        };

        if (saveInfo?.source === 'override' || saveInfo?.engine === 'user-override') {
            resetBtn = document.createElement('button');
            resetBtn.className = 'save-editor-toolbar-btn reset-btn';
            resetBtn.textContent = d.save_editor_reset_save_folder || 'Reset to Auto-detect';
            toolbar.appendChild(resetBtn);

            let isResetting = false;
            resetBtn.onclick = async () => {
                if (isResetting) return;
                const doResetFolder = async () => {
                    if (isResetting) return;
                    isResetting = true;
                    resetBtn.setAttribute('aria-disabled', 'true');
                    setFolderBtn.setAttribute('aria-disabled', 'true');
                    try {
                        const res = await window.electronAPI.setSaveFolderOverride({ gameKey, folderPath: '' });
                        if (res?.ok) {
                            state.currentSaveData = null;
                            state.originalSnapshot = null;
                            state.currentFileName = null;
                            ++currentLoadId;
                            await reloadFileList(null);
                            showToastPill(state.d?.save_folder_reset_success || 'Save folder reset to auto-detect');
                        } else {
                            showTooltip(`${state.d?.save_folder_reset_failed || 'Failed to reset save folder'}${res?.error ? `: ${res.error}` : ''}`, resetBtn);
                        }
                    } catch (err) {
                        showTooltip(`${state.d?.save_folder_reset_failed || 'Failed to reset save folder'}${err?.message ? `: ${err.message}` : ''}`, resetBtn);
                    } finally {
                        isResetting = false;
                        if (resetBtn.isConnected) resetBtn.removeAttribute('aria-disabled');
                        if (setFolderBtn?.isConnected) setFolderBtn.removeAttribute('aria-disabled');
                    }
                };

                if (state.hasUnsavedChanges?.()) {
                    showPopover({
                        targetEl: resetBtn,
                        title: state.d?.save_editor_unsaved_confirm || 'Discard unsaved changes?',
                        desc: state.d?.save_editor_unsaved_desc || 'You have unsaved changes in the current save file.',
                        cancelText: state.d?.cancel || 'Cancel',
                        confirmText: state.d?.discard || 'Discard',
                        confirmClass: 'danger-btn',
                        onConfirm: doResetFolder
                    });
                    return;
                }
                await doResetFolder();
            };
        }
    }

    const renderMissingOverrideAlert = (container, saveInfo, d) => {
        const errorBox = document.createElement('div');
        errorBox.className = 'save-editor-error-box';
        errorBox.setAttribute('role', 'alert');
        errorBox.setAttribute('aria-live', 'assertive');

        const errorTitle = document.createElement('div');
        errorTitle.className = 'save-editor-error-title';
        errorTitle.textContent = d.save_editor_override_missing || 'Configured save folder not found';
        errorBox.appendChild(errorTitle);

        if (saveInfo?.path) {
            const pathCode = document.createElement('code');
            pathCode.textContent = saveInfo.path;
            errorBox.appendChild(pathCode);
        }

        const chooseBtn = document.createElement('button');
        chooseBtn.className = 'primary-btn';
        chooseBtn.textContent = d.save_editor_choose_new_path || 'Choose New Path';
        errorBox.appendChild(chooseBtn);

        const retryBtn = document.createElement('button');
        retryBtn.className = 'retry-btn';
        retryBtn.textContent = d.save_editor_retry || 'Retry';
        errorBox.appendChild(retryBtn);

        const resetBtn = document.createElement('button');
        resetBtn.textContent = d.save_editor_reset_save_folder || 'Reset to Auto-detect';
        errorBox.appendChild(resetBtn);

        container.appendChild(errorBox);

        let isChoosing = false;
        chooseBtn.onclick = async () => {
            if (isChoosing) return;
            isChoosing = true;
            chooseBtn.setAttribute('aria-disabled', 'true');
            retryBtn.setAttribute('aria-disabled', 'true');
            resetBtn.setAttribute('aria-disabled', 'true');
            try {
                const result = await window.electronAPI.selectSaveFolder();
                if (!result?.canceled && result?.folderPath) {
                    const res = await window.electronAPI.setSaveFolderOverride({ gameKey: state.gameKey, folderPath: result.folderPath });
                    if (res?.ok) {
                        state.currentSaveData = null;
                        state.originalSnapshot = null;
                        state.currentFileName = null;
                        ++currentLoadId;
                        await reloadFileList(null);
                        showToastPill(d.save_folder_set_success || 'Save folder path updated');
                    } else {
                        showTooltip(formatFolderError(res?.error, d.save_folder_set_failed || 'Failed to set save folder'), chooseBtn);
                    }
                }
            } catch (err) {
                showTooltip(`${d.save_folder_set_failed || 'Failed to set save folder'}${err?.message ? `: ${err.message}` : ''}`, chooseBtn);
            } finally {
                isChoosing = false;
                if (chooseBtn.isConnected) chooseBtn.removeAttribute('aria-disabled');
                if (retryBtn?.isConnected) retryBtn.removeAttribute('aria-disabled');
                if (resetBtn?.isConnected) resetBtn.removeAttribute('aria-disabled');
            }
        };

        let isRetrying = false;
        retryBtn.onclick = async () => {
            if (isRetrying) return;
            isRetrying = true;
            retryBtn.setAttribute('aria-disabled', 'true');
            chooseBtn.setAttribute('aria-disabled', 'true');
            resetBtn.setAttribute('aria-disabled', 'true');
            try {
                await reloadFileList(null);
                const activeAlert = refs.sidebar?.querySelector('.save-editor-error-box');
                if (activeAlert) {
                    const newRetry = activeAlert.querySelector('.retry-btn');
                    showTooltip(d.save_editor_still_missing || 'Configured save folder not found', newRetry || activeAlert);
                } else {
                    showToastPill(d.save_folder_set_success || 'Save folder path updated');
                }
            } finally {
                isRetrying = false;
                if (retryBtn.isConnected) retryBtn.removeAttribute('aria-disabled');
                if (chooseBtn?.isConnected) chooseBtn.removeAttribute('aria-disabled');
                if (resetBtn?.isConnected) resetBtn.removeAttribute('aria-disabled');
            }
        };

        let isResetting = false;
        resetBtn.onclick = async () => {
            if (isResetting) return;
            isResetting = true;
            resetBtn.setAttribute('aria-disabled', 'true');
            chooseBtn.setAttribute('aria-disabled', 'true');
            retryBtn.setAttribute('aria-disabled', 'true');
            try {
                const res = await window.electronAPI.setSaveFolderOverride({ gameKey: state.gameKey, folderPath: '' });
                if (res?.ok) {
                    state.currentSaveData = null;
                    state.originalSnapshot = null;
                    state.currentFileName = null;
                    ++currentLoadId;
                    await reloadFileList(null);
                    showToastPill(d.save_folder_reset_success || 'Save folder reset to auto-detect');
                } else {
                    showTooltip(`${d.save_folder_reset_failed || 'Failed to reset save folder'}${res?.error ? `: ${res.error}` : ''}`, resetBtn);
                }
            } catch (err) {
                showTooltip(`${d.save_folder_reset_failed || 'Failed to reset save folder'}${err?.message ? `: ${err.message}` : ''}`, resetBtn);
            } finally {
                isResetting = false;
                if (resetBtn.isConnected) resetBtn.removeAttribute('aria-disabled');
                if (chooseBtn?.isConnected) chooseBtn.removeAttribute('aria-disabled');
                if (retryBtn?.isConnected) retryBtn.removeAttribute('aria-disabled');
            }
        };
    };

    /**
     * @param {string | null} [selectFile]
     */
    async function reloadFileList(selectFile = state.currentFileName) {
        dismissPopovers();
        const d = state.d || {};
        const requestId = ++currentReloadId;
        const hadFocus = sidebar ? sidebar.contains(document.activeElement) : false;

        const restoreFocusIfHad = () => {
            if (!hadFocus || !sidebar) return;
            const target = sidebar.querySelector('button:not([disabled]):not([aria-disabled="true"]), .save-file-item');
            if (target && typeof target.focus === 'function') {
                target.focus();
            }
        };

        try {
            listContainer.innerHTML = `<div class="save-editor-loading-sidebar" data-i18n="save_editor_loading">${d.save_editor_loading || 'Loading...'}</div>`;

            const saveInfo = await window.electronAPI.getSaveFolder(gameKey);
            if (requestId !== currentReloadId) return;

            const directoryChanged = lastResolvedPath !== null && lastResolvedPath !== saveInfo?.path;
            lastResolvedPath = saveInfo?.path ?? null;
            if (directoryChanged) {
                selectFile = null;
            }

            updateToolbar(saveInfo);

            if (saveInfo?.overrideMissing === true) {
                state.currentSaveData = null;
                state.originalSnapshot = null;
                state.currentFileName = null;
                ++currentLoadId;

                content.innerHTML = `
                    <div class="empty-state warning-state">
                        <svg class="empty-state-warning-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48" aria-hidden="true">
                            <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                        </svg>
                        <p class="empty-state-warning-title">${d.save_editor_override_missing || 'Configured save folder not found'}</p>
                        <p class="empty-state-warning-desc">${d.save_editor_choose_new_path_desc || 'Choose a new path or reset to auto-detect in the sidebar to resume editing.'}</p>
                    </div>
                `;

                tabsWrapper.style.display = 'none';
                saveBtn.style.display = 'none';
                const mapBtn = overlay?.querySelector('.map-variable-btn');
                if (mapBtn) mapBtn.style.display = 'none';

                listContainer.innerHTML = '';
                renderMissingOverrideAlert(listContainer, saveInfo, d);
                restoreFocusIfHad();
                return;
            }

            const files = await window.electronAPI.listSaveFiles(gameKey);
            if (requestId !== currentReloadId) return;

            listContainer.innerHTML = '';
            const mapBtn = overlay?.querySelector('.map-variable-btn');

            if (files.length === 0) {
                if (mapBtn) mapBtn.style.display = 'none';
                renderEmptyState(listContainer, d);
                restoreFocusIfHad();
            } else {
                /** @type {HTMLElement | null} */
                let activeItem = null;
                files.forEach(file => {
                    const item = document.createElement('div');
                    item.className = 'save-file-item';
                    item.dataset.file = file;

                    const nameSpan = document.createElement('span');
                    nameSpan.className = 'save-file-name';
                    nameSpan.textContent = file;
                    nameSpan.setAttribute('data-tooltip', file);

                    const actionsDiv = document.createElement('div');
                    actionsDiv.className = 'save-file-actions';

                    const renameBtn = document.createElement('button');
                    renameBtn.className = 'save-file-action-btn rename-btn';
                    renameBtn.setAttribute('data-tooltip', d.save_editor_rename || 'Rename');
                    renameBtn.appendChild(createSVG('M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z', 12, 12));

                    const deleteBtn = document.createElement('button');
                    deleteBtn.className = 'save-file-action-btn delete-btn';
                    deleteBtn.setAttribute('data-tooltip', d.save_editor_delete || 'Delete');
                    deleteBtn.appendChild(createTrashSVG(12, 12));

                    actionsDiv.appendChild(renameBtn);
                    actionsDiv.appendChild(deleteBtn);

                    item.appendChild(nameSpan);
                    item.appendChild(actionsDiv);

                    // Item click (select/load save)
                    item.onclick = async (e) => {
                        if (e.target.closest('.save-file-actions') || item.querySelector('.save-file-rename-input')) {
                            return;
                        }
                        if (state.hasUnsavedChanges?.()) {
                            if (!confirm(d.save_editor_unsaved_confirm || 'You have unsaved changes. Are you sure you want to load another file and discard changes?')) {
                                return;
                            }
                        }
                        await loadSave(file, item);
                    };

                    // Rename action
                    renameBtn.onclick = (e) => {
                        e.stopPropagation();
                        dismissPopovers();

                        if (state.hasUnsavedChanges?.() && state.currentFileName === file) {
                            alert(d.save_editor_unsaved_rename_confirm || 'You have unsaved changes. Please save or discard changes before renaming.');
                            return;
                        }

                        nameSpan.style.display = 'none';
                        actionsDiv.style.display = 'none';

                        const renameInput = document.createElement('input');
                        renameInput.type = 'text';
                        renameInput.className = 'save-file-rename-input';
                        renameInput.value = file;
                        renameInput.spellcheck = false;

                        item.appendChild(renameInput);
                        renameInput.focus();

                        const lastDotIndex = file.lastIndexOf('.');
                        if (lastDotIndex > 0) {
                            renameInput.setSelectionRange(0, lastDotIndex);
                        } else {
                            renameInput.select();
                        }

                        let isSubmitting = false;

                        const restoreItem = () => {
                            dismissPopovers();
                            renameInput.remove();
                            nameSpan.style.display = '';
                            actionsDiv.style.display = '';
                        };

                        const triggerShake = (msg) => {
                            renameInput.classList.add('input-error');
                            setTimeout(() => renameInput.classList.remove('input-error'), 400);
                            showTooltip(msg, renameInput);
                            renameInput.focus();
                        };

                        const submitRename = async (overwrite = false) => {
                            if (isSubmitting) return;
                            const newName = renameInput.value.trim();

                            if (newName === file) {
                                restoreItem();
                                return;
                            }

                            if (!newName || /[\\/:*?"<>|]/.test(newName)) {
                                triggerShake(d.save_editor_invalid_filename || 'Invalid filename (cannot contain \\ / : * ? " < > | or be empty)');
                                return;
                            }

                            isSubmitting = true;
                            try {
                                const res = await window.electronAPI.renameSaveFile({
                                    gameKey,
                                    oldFileName: file,
                                    newFileName: newName,
                                    overwrite
                                });

                                if (!res.ok) {
                                    if (res.error === 'FILE_EXISTS') {
                                        isSubmitting = false;
                                        showPopover({
                                            targetEl: item,
                                            title: d.save_editor_file_exists_title || 'File already exists',
                                            desc: (d.save_editor_file_exists_desc || 'A save file named "{name}" already exists. Overwrite?').replace('{name}', newName),
                                            cancelText: d.save_editor_cancel || 'Cancel',
                                            confirmText: d.save_editor_overwrite || 'Overwrite',
                                            confirmClass: 'primary-btn',
                                            onConfirm: async () => {
                                                await submitRename(true);
                                            },
                                            onCancel: () => {
                                                renameInput.focus();
                                            }
                                        });
                                        return;
                                    }

                                    triggerShake(res.message || d.save_editor_unsupported_format || 'Unsupported save format');
                                    isSubmitting = false;
                                    return;
                                }

                                if (state.currentFileName === file) {
                                    state.currentFileName = newName;
                                }
                                await reloadFileList(state.currentFileName);
                            } catch (err) {
                                triggerShake(err.message || 'Failed to rename save');
                                isSubmitting = false;
                            }
                        };

                        renameInput.onkeydown = async (ev) => {
                            if (ev.key === 'Enter') {
                                ev.preventDefault();
                                ev.stopPropagation();
                                await submitRename(false);
                            } else if (ev.key === 'Escape') {
                                ev.preventDefault();
                                ev.stopPropagation();
                                restoreItem();
                            }
                        };

                        renameInput.onblur = () => {
                            setTimeout(() => {
                                if (activePopover) return;
                                if (renameInput.value.trim() === file) {
                                    restoreItem();
                                }
                            }, 150);
                        };
                    };

                    // Delete action
                    deleteBtn.onclick = (e) => {
                        e.stopPropagation();
                        item.classList.add('has-open-popover');
                        showPopover({
                            targetEl: deleteBtn,
                            title: d.save_editor_delete_title || 'Delete save file?',
                            desc: (d.save_editor_delete_desc || 'Permanently delete "{name}"? This cannot be undone.').replace('{name}', file),
                            cancelText: d.save_editor_cancel || 'Cancel',
                            confirmText: d.save_editor_delete || 'Delete',
                            confirmClass: 'danger-btn',
                            onConfirm: async () => {
                                try {
                                    await window.electronAPI.deleteSaveFile({ gameKey, fileName: file });
                                    if (file === state.currentFileName) {
                                        state.currentSaveData = null;
                                        state.originalSnapshot = null;
                                        state.currentFileName = null;
                                        ++currentLoadId;
                                        tabsWrapper.style.display = 'none';
                                        saveBtn.style.display = 'none';
                                        const mapBtn = overlay?.querySelector('.map-variable-btn');
                                        if (mapBtn) mapBtn.style.display = 'none';
                                        content.innerHTML = `
                                            <div class="empty-state">
                                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48">
                                                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                                                    <polyline points="17 21 17 13 7 13 7 21"/>
                                                    <polyline points="7 3 7 8 15 8"/>
                                                </svg>
                                                <p data-i18n="save_editor_select_title">${d.save_editor_select_title || 'Select a save file to start editing'}</p>
                                            </div>
                                        `;
                                    }
                                    await reloadFileList(state.currentFileName);
                                } catch (err) {
                                    alert((d.save_editor_delete_failed || 'Failed to delete save: ') + err.message);
                                }
                            },
                            onCancel: () => {
                                item.classList.remove('has-open-popover');
                            }
                        });
                    };

                    listContainer.appendChild(item);
                    if (file === selectFile) {
                        activeItem = item;
                    }
                });

                if (activeItem && selectFile) {
                    await loadSave(selectFile, activeItem);
                } else {
                    state.currentSaveData = null;
                    state.originalSnapshot = null;
                    state.currentFileName = null;
                    ++currentLoadId;
                    tabsWrapper.style.display = 'none';
                    saveBtn.style.display = 'none';
                    if (mapBtn) mapBtn.style.display = 'none';
                    content.innerHTML = `
                        <div class="empty-state">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48">
                                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                                <polyline points="17 21 17 13 7 13 7 21"/>
                                <polyline points="7 3 7 8 15 8"/>
                            </svg>
                            <p data-i18n="save_editor_select_title">${d.save_editor_select_title || 'Select a save file to start editing'}</p>
                        </div>
                    `;
                }
                restoreFocusIfHad();
            }
        } catch (err) {
            if (requestId !== currentReloadId) return;
            state.currentSaveData = null;
            state.originalSnapshot = null;
            state.currentFileName = null;
            ++currentLoadId;
            tabsWrapper.style.display = 'none';
            saveBtn.style.display = 'none';
            const mapBtn = overlay?.querySelector('.map-variable-btn');
            if (mapBtn) mapBtn.style.display = 'none';

            listContainer.innerHTML = '';
            const errorBox = document.createElement('div');
            errorBox.className = 'save-editor-error-box';
            errorBox.setAttribute('role', 'alert');
            errorBox.setAttribute('aria-live', 'assertive');

            const errorTitle = document.createElement('div');
            errorTitle.className = 'save-editor-error-title';
            errorTitle.textContent = d.save_editor_failed_load_files || 'Failed to load save directory';
            errorBox.appendChild(errorTitle);

            const errorMsg = document.createElement('code');
            errorMsg.textContent = err?.message || String(err);
            errorBox.appendChild(errorMsg);

            const chooseBtn = document.createElement('button');
            chooseBtn.className = 'primary-btn';
            chooseBtn.textContent = d.save_editor_choose_new_path || 'Choose New Path';
            let isChoosing = false;
            chooseBtn.onclick = async () => {
                if (isChoosing) return;
                isChoosing = true;
                chooseBtn.setAttribute('aria-disabled', 'true');
                resetBtn.setAttribute('aria-disabled', 'true');
                try {
                    const result = await window.electronAPI.selectSaveFolder();
                    if (!result?.canceled && result?.folderPath) {
                        const res = await window.electronAPI.setSaveFolderOverride({ gameKey, folderPath: result.folderPath });
                        if (res?.ok) {
                            state.currentSaveData = null;
                            state.originalSnapshot = null;
                            state.currentFileName = null;
                            ++currentLoadId;
                            await reloadFileList(null);
                            showToastPill(d.save_folder_set_success || 'Save folder path updated');
                        } else {
                            showTooltip(formatFolderError(res?.error, d.save_folder_set_failed || 'Failed to set save folder'), chooseBtn);
                        }
                    }
                } catch (selectErr) {
                    showTooltip(`${d.save_folder_set_failed || 'Failed to set save folder'}${selectErr?.message ? `: ${selectErr.message}` : ''}`, chooseBtn);
                } finally {
                    isChoosing = false;
                    if (chooseBtn.isConnected) chooseBtn.removeAttribute('aria-disabled');
                    if (resetBtn?.isConnected) resetBtn.removeAttribute('aria-disabled');
                }
            };
            errorBox.appendChild(chooseBtn);

            let isResetting = false;
            const resetBtn = document.createElement('button');
            resetBtn.textContent = d.save_editor_reset_save_folder || 'Reset to Auto-detect';
            resetBtn.onclick = async () => {
                if (isResetting) return;
                isResetting = true;
                resetBtn.setAttribute('aria-disabled', 'true');
                chooseBtn.setAttribute('aria-disabled', 'true');
                try {
                    const res = await window.electronAPI.setSaveFolderOverride({ gameKey, folderPath: '' });
                    if (res?.ok) {
                        state.currentSaveData = null;
                        state.originalSnapshot = null;
                        state.currentFileName = null;
                        ++currentLoadId;
                        await reloadFileList(null);
                        showToastPill(d.save_folder_reset_success || 'Save folder reset to auto-detect');
                    } else {
                        showTooltip(`${d.save_folder_reset_failed || 'Failed to reset save folder'}${res?.error ? `: ${res.error}` : ''}`, resetBtn);
                    }
                } catch (resetErr) {
                    showTooltip(`${d.save_folder_reset_failed || 'Failed to reset save folder'}${resetErr?.message ? `: ${resetErr.message}` : ''}`, resetBtn);
                } finally {
                    isResetting = false;
                    if (resetBtn.isConnected) resetBtn.removeAttribute('aria-disabled');
                    if (chooseBtn?.isConnected) chooseBtn.removeAttribute('aria-disabled');
                }
            };
            errorBox.appendChild(resetBtn);

            listContainer.appendChild(errorBox);
            restoreFocusIfHad();
        }
    }

    /**
     * @param {string} fileName
     * @param {HTMLElement} element
     */
    async function loadSave(fileName, element) {
        dismissPopovers();
        const loadId = ++currentLoadId;
        const d = state.d || {};
        content.innerHTML = `
            <div class="loading save-load-progress-container">
                <span class="save-load-status-text" data-i18n="save_editor_loading"></span>
                <button class="save-editor-popover-btn cancel-btn save-load-cancel-btn" style="display: none; margin-top: 12px; margin-inline: auto;">Cancel</button>
            </div>
        `;
        const initialStatusText = content.querySelector('.save-load-status-text');
        if (initialStatusText) {
            initialStatusText.textContent = d.save_editor_loading || 'Loading save data...';
        }
        overlay?.querySelectorAll('.save-file-item').forEach(el => el.classList.remove('active'));
        element.classList.add('active');
        tabsWrapper.style.display = 'none';
        searchInput.value = '';
        engine.setSearchOptions({ query: '' });

        let unsubscribeProgress = null;
        if (typeof window.electronAPI?.onSaveLoadProgress === 'function') {
            unsubscribeProgress = window.electronAPI.onSaveLoadProgress((prog) => {
                if (prog?.gameKey === gameKey && prog?.fileName === fileName) {
                    const statusText = content.querySelector('.save-load-status-text');
                    const cancelBtn = content.querySelector('.save-load-cancel-btn');
                    if (statusText) {
                        if (prog.unit === 'bytes' && prog.total > 0) {
                            const currentMb = (prog.current / (1024 * 1024)).toFixed(1);
                            const totalMb = (prog.total / (1024 * 1024)).toFixed(1);
                            statusText.textContent = `${d.save_editor_loading || 'Loading save data...'} ${prog.percent}% (${currentMb}MB / ${totalMb}MB)`;
                        } else {
                            statusText.textContent = `${d.save_editor_loading || 'Loading save data...'} ${prog.percent}%`;
                        }
                    }
                    if (cancelBtn && cancelBtn instanceof HTMLElement) {
                        cancelBtn.style.display = 'inline-block';
                        cancelBtn.onclick = () => {
                            // @ts-ignore
                            cancelBtn.disabled = true;
                            cancelBtn.textContent = 'Cancelling...';
                            window.electronAPI.cancelLoadSaveData?.({ gameKey, fileName });
                        };
                    }
                }
            });
        }

        try {
            const { data, metadata } = await window.electronAPI.loadSaveData({ gameKey, fileName });
            if (loadId !== currentLoadId) return;
            state.currentSaveData = data;
            state.originalSnapshot = structuredClone(data);
            state.currentMetadata = metadata;
            state.currentFileName = fileName;

            if (typeof onSaveLoaded === 'function') {
                onSaveLoaded();
            }

            tabsWrapper.style.display = 'flex';
            saveBtn.style.display = 'block';
        } catch (err) {
            if (loadId !== currentLoadId) return;
            state.currentSaveData = null;
            state.originalSnapshot = null;
            state.currentFileName = null;
            tabsWrapper.style.display = 'none';
            saveBtn.style.display = 'none';
            const mapBtn = overlay?.querySelector('.map-variable-btn');
            if (mapBtn) mapBtn.style.display = 'none';
            content.innerHTML = `<div class="error">${d.save_editor_failed_load_save || 'Failed to load save: '}${escapeHtml(err.message)}</div>`;
        } finally {
            if (typeof unsubscribeProgress === 'function') {
                unsubscribeProgress();
            }
        }
    }

    const refreshBtn = overlay?.querySelector('.refresh-save-btn');
    if (refreshBtn) {
        // @ts-ignore
        refreshBtn.onclick = () => {
            if (state.hasUnsavedChanges?.()) {
                const d = state.d || {};
                if (!confirm(d.save_editor_unsaved_confirm || 'You have unsaved changes. Are you sure you want to refresh and discard changes?')) {
                    return;
                }
            }
            reloadFileList(state.currentFileName);
        };
    }

    return {
        reloadFileList
    };
}

