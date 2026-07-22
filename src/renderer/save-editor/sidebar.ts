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

    /**
     * @param {string | null} [selectFile]
     */
    async function reloadFileList(selectFile = state.currentFileName) {
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
                    item.textContent = file;
                    item.title = file;
                    item.onclick = async () => {
                        if (state.hasUnsavedChanges?.()) {
                            if (!confirm(d.save_editor_unsaved_confirm || 'You have unsaved changes. Are you sure you want to load another file and discard changes?')) {
                                return;
                            }
                        }
                        await loadSave(file, item);
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
        } catch (err) {
            sidebar.innerHTML = `<div class="error">Failed to list saves</div>`;
        }
    }

    /**
     * @param {string} fileName
     * @param {HTMLElement} element
     */
    async function loadSave(fileName, element) {
        const d = state.d || {};
        content.innerHTML = `<div class="loading" data-i18n="save_editor_loading">${d.save_editor_loading || 'Loading save data...'}</div>`;
        overlay.querySelectorAll('.save-file-item').forEach(el => el.classList.remove('active'));
        element.classList.add('active');
        tabsWrapper.style.display = 'none';
        searchInput.value = '';
        engine.setSearchOptions({ query: '' });
        
        try {
            const { data, metadata } = await window.electronAPI.loadSaveData({ gameKey, fileName });
            state.currentSaveData = data;
            state.originalSnapshot = JSON.parse(JSON.stringify(data));
            state.currentMetadata = metadata;
            state.currentFileName = fileName;
            
            if (typeof onSaveLoaded === 'function') {
                onSaveLoaded();
            }
            
            tabsWrapper.style.display = 'flex';
            saveBtn.style.display = 'block';
        } catch (err) {
            // @ts-ignore
            content.innerHTML = `<div class="error">Failed to load save: ${escapeHtml(err.message)}</div>`;
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

