// @ts-nocheck
import { escapeHtml } from '../markdown-lite';

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

    function dismissPopovers() {
        if (activePopover) {
            activePopover.remove();
            activePopover = null;
        }
        if (activeTooltip) {
            activeTooltip.remove();
            activeTooltip = null;
        }
        overlay.querySelectorAll('.has-open-popover').forEach(el => el.classList.remove('has-open-popover'));
    }

    function showTooltip(message, targetEl) {
        dismissPopovers();
        const tooltip = document.createElement('div');
        tooltip.className = 'save-editor-rename-tooltip';
        tooltip.textContent = message;
        document.body.appendChild(tooltip);

        const rect = targetEl.getBoundingClientRect();
        tooltip.style.top = `${rect.bottom + 4}px`;
        tooltip.style.left = `${rect.left}px`;

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

    /**
     * @param {string | null} [selectFile]
     */
    async function reloadFileList(selectFile = state.currentFileName) {
        dismissPopovers();
        const d = state.d || {};
        try {
            const files = await window.electronAPI.listSaveFiles(gameKey);
            sidebar.innerHTML = '';
            if (files.length === 0) {
                sidebar.innerHTML = `<div class="save-editor-empty" data-i18n="save_editor_no_saves">${d.save_editor_no_saves || 'No saves found'}</div>`;
                state.currentSaveData = null;
                state.originalSnapshot = null;
                state.currentFileName = null;
                tabsWrapper.style.display = 'none';
                saveBtn.style.display = 'none';
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
                                        tabsWrapper.style.display = 'none';
                                        saveBtn.style.display = 'none';
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

                    sidebar.appendChild(item);
                    if (file === selectFile) {
                        activeItem = item;
                    }
                });

                if (activeItem && selectFile) {
                    await loadSave(selectFile, activeItem);
                } else if (selectFile) {
                    state.currentSaveData = null;
                    state.originalSnapshot = null;
                    state.currentFileName = null;
                    tabsWrapper.style.display = 'none';
                    saveBtn.style.display = 'none';
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
            }
        } catch {
            const d = state.d || {};
            sidebar.innerHTML = `<div class="error" data-i18n="save_editor_failed_list_saves">${d.save_editor_failed_list_saves || 'Failed to list saves'}</div>`;
        }
    }

    /**
     * @param {string} fileName
     * @param {HTMLElement} element
     */
    async function loadSave(fileName, element) {
        dismissPopovers();
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
        overlay.querySelectorAll('.save-file-item').forEach(el => el.classList.remove('active'));
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
            // @ts-ignore
            content.innerHTML = `<div class="error">${d.save_editor_failed_load_save || 'Failed to load save: '}${escapeHtml(err.message)}</div>`;
        } finally {
            if (typeof unsubscribeProgress === 'function') {
                unsubscribeProgress();
            }
        }
    }

    const refreshBtn = overlay.querySelector('.refresh-save-btn');
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

