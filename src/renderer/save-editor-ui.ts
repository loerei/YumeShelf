// @ts-nocheck
import { DataEngine } from './save-editor/data-engine';
import { Translator } from './save-editor/translator';
import { setupSidebar } from './save-editor/sidebar';
import { setupGridRenderer } from './save-editor/grid-renderer';
import { setupSearchBar } from './save-editor/search-bar';

export function initSaveEditorUI() {
    window.showSaveEditor = async (gameKey, options = {}) => {
        const engine = new DataEngine();
        const translator = new Translator(window.electronAPI);
        await translator.initialize();
        const d = window.currentUIStrings || {};
        const isStandalone = !!options.isStandaloneWindow;
        
        const overlay = document.createElement('div');
        overlay.className = `save-editor-overlay ${isStandalone ? 'standalone' : ''}`;
        
        const popoutBtnHTML = isStandalone ? '' : `
            <button class="save-editor-popout" title="Open in separate window" style="background: none; border: none; color: #9ca3af; font-size: 1.25em; cursor: pointer; padding: 4px; display: flex; align-items: center; justify-content: center; transition: color 0.2s;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="18" height="18">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                    <polyline points="15 3 21 3 21 9"/>
                    <line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
            </button>
        `;

        overlay.innerHTML = `
            <div class="save-editor-panel">
                <div class="save-editor-header">
                    <h2 data-i18n="action_save_editor">${d.action_save_editor || 'Save Editor'}</h2>
                    <div style="display: flex; gap: 8px; align-items: center; margin-left: auto;">
                        ${popoutBtnHTML}
                        <button class="save-editor-close">×</button>
                    </div>
                </div>
                <div class="save-editor-body">
                    <div class="save-editor-sidebar">
                        <div class="save-editor-loading-sidebar" data-i18n="save_editor_loading">${d.save_editor_loading || 'Loading...'}</div>
                    </div>
                    <div class="save-editor-main">
                        <div class="save-editor-tabs-wrapper" style="display: none;">
                            <div class="save-editor-tabs-container">
                                <div class="save-editor-tabs"></div>
                                <div class="tabs-shadow tabs-shadow-left"></div>
                                <div class="tabs-shadow tabs-shadow-right"></div>
                            </div>
                            <div class="save-editor-actions">
                                <div class="save-editor-top-bar">
                                    <div class="save-editor-search-wrapper">
                                        <input type="text" class="save-editor-search" data-i18n-placeholder="save_editor_search_placeholder" placeholder="${d.save_editor_search_placeholder || 'Search...'}">
                                    </div>
                                    <button class="refresh-save-btn" title="Reload from disk">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                                            <path d="M23 4v6h-6M1 20v-6h6"/>
                                            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                                        </svg>
                                    </button>
                                    <button class="translate-btn" title="Translate to app language">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                                            <path d="M5 8l6 6"/>
                                            <path d="M4 14l6-6 2-3"/>
                                            <path d="M2 5h12M7 2h1M22 22l-5-10-5 10M14 18h6"/>
                                        </svg>
                                        <span data-i18n="save_editor_translate">${d.save_editor_translate || 'Translate'}</span>
                                        <div class="translate-progress"></div>
                                    </button>
                                </div>
                                <div class="save-editor-filters">
                                    <label class="save-editor-filter-check" title="Show all variables, including those with zero or no value">
                                        <input type="checkbox" class="show-empty-check">
                                        <span data-i18n="save_editor_show_empty">${d.save_editor_show_empty || 'Show empty'}</span>
                                    </label>
                                    <label class="save-editor-filter-check" title="Always show important variables, even if they have zero or no value">
                                        <input type="checkbox" class="show-important-check" checked>
                                        <span data-i18n="save_editor_show_important">${d.save_editor_show_important || 'Show important'}</span>
                                    </label>
                                    <label class="save-editor-filter-check" title="Only show entries where the value matches your search exactly">
                                        <input type="checkbox" class="exact-match-check">
                                        <span data-i18n="save_editor_exact">${d.save_editor_exact || 'Exact'}</span>
                                    </label>
                                    
                                    <div class="filter-divider"></div>
                                    
                                    <label class="save-editor-filter-check" title="Search in names">
                                        <input type="checkbox" class="search-name-check" checked>
                                        <span data-i18n="save_editor_search_name">${d.save_editor_search_name || 'Name'}</span>
                                    </label>
                                    <label class="save-editor-filter-check" title="Search in values">
                                        <input type="checkbox" class="search-value-check" checked>
                                        <span data-i18n="save_editor_search_value">${d.save_editor_search_value || 'Value'}</span>
                                    </label>
                                    <label class="save-editor-filter-check" title="Search in index (ID)">
                                        <input type="checkbox" class="search-index-check">
                                        <span data-i18n="save_editor_search_index">${d.save_editor_search_index || 'Index'}</span>
                                    </label>

                                    <div class="filter-divider switch-filters-only" style="display: none;"></div>

                                    <label class="save-editor-filter-check switch-filters-only" style="display: none;" title="Only show switches that are ON">
                                        <input type="checkbox" class="switch-true-check">
                                        <span data-i18n="save_editor_true_only">${d.save_editor_true_only || 'True only'}</span>
                                    </label>
                                    <label class="save-editor-filter-check switch-filters-only" style="display: none;" title="Only show switches that are OFF">
                                        <input type="checkbox" class="switch-false-check">
                                        <span data-i18n="save_editor_false_only">${d.save_editor_false_only || 'False only'}</span>
                                    </label>
                                </div>
                            </div>
                        </div>
                        <div class="save-editor-content">
                            <div class="empty-state">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48">
                                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                                    <polyline points="17 21 17 13 7 13 7 21"/>
                                    <polyline points="7 3 7 8 15 8"/>
                                </svg>
                                <p data-i18n="save_editor_select_title">${d.save_editor_select_title || 'Select a save file to start editing'}</p>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="save-editor-footer">
                    <button class="secondary-btn map-variable-btn" style="display: none;" data-i18n="save_editor_map">Map Variable</button>
                    <button class="secondary-btn cancel-btn" data-i18n="save_editor_cancel">${d.save_editor_cancel || 'Cancel'}</button>
                    <button class="primary-btn save-btn" style="display: none;" data-i18n="save_editor_save">${d.save_editor_save || 'Save Changes'}</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        
        const handleGlobalKeydown = (e) => {
            const activeElement = document.activeElement;
            const isTyping = activeElement && (
                (activeElement.tagName === 'INPUT' && ['text', 'search', 'number', 'password', 'email', 'tel', 'url'].includes(activeElement.type)) ||
                activeElement.tagName === 'TEXTAREA' ||
                activeElement.isContentEditable
            );
            if (isTyping) return;

            const key = e.key.toLowerCase();
            
            // Shift + Enter: save changes
            if (e.shiftKey && e.key === 'Enter') {
                e.preventDefault();
                const saveBtn = overlay.querySelector('.save-btn');
                if (saveBtn && saveBtn.style.display !== 'none' && !saveBtn.disabled) {
                    saveBtn.click();
                }
                return;
            }

            if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;

            if (key === 'e') {
                e.preventDefault();
                const chk = overlay.querySelector('.show-empty-check');
                if (chk) {
                    chk.checked = !chk.checked;
                    state.showEmpty = chk.checked;
                    renderTabContent();
                }
            } else if (key === 'i') {
                e.preventDefault();
                const chk = overlay.querySelector('.show-important-check');
                if (chk) {
                    chk.checked = !chk.checked;
                    state.showImportant = chk.checked;
                    renderTabContent();
                }
            } else if (key === 'x') {
                e.preventDefault();
                const chk = overlay.querySelector('.exact-match-check');
                if (chk) {
                    chk.checked = !chk.checked;
                    engine.setSearchOptions({ exact: chk.checked });
                    renderTabContent();
                }
            }
        };

        document.addEventListener('keydown', handleGlobalKeydown);

        const close = (force = false) => {
            if (!force && state.hasUnsavedChanges && state.hasUnsavedChanges()) {
                if (!confirm(d.save_editor_unsaved_confirm || 'You have unsaved changes. Are you sure you want to close and discard changes?')) {
                    return;
                }
            }
            document.removeEventListener('keydown', handleGlobalKeydown);
            if (isStandalone) {
                window.close();
            } else {
                document.body.removeChild(overlay);
            }
        };
        overlay.querySelector('.save-editor-close').onclick = () => close(false);
        overlay.querySelector('.cancel-btn').onclick = () => close(false);

        if (!isStandalone) {
            const popoutBtn = overlay.querySelector('.save-editor-popout');
            if (popoutBtn) {
                popoutBtn.onclick = () => {
                    if (state.hasUnsavedChanges && state.hasUnsavedChanges()) {
                        if (!confirm(d.save_editor_unsaved_confirm || 'You have unsaved changes. Are you sure you want to open in a separate window and discard them?')) {
                            return;
                        }
                    }
                    const stateToPass = {
                        currentFileName: state.currentFileName,
                        activeTab: state.activeTab,
                        showEmpty: state.showEmpty,
                        showImportant: state.showImportant,
                        searchOptions: engine.searchOptions
                    };
                    localStorage.setItem(`yumeshelf_popout_state_${gameKey}`, JSON.stringify(stateToPass));
                    
                    window.electronAPI.openSaveEditorWindow(gameKey);
                    close(true); // Force close without confirmation when opening in a popout window
                };
                popoutBtn.addEventListener('mouseenter', () => { popoutBtn.style.color = '#ffffff'; });
                popoutBtn.addEventListener('mouseleave', () => { popoutBtn.style.color = '#9ca3af'; });
            }
        }

        const sidebar = overlay.querySelector('.save-editor-sidebar');
        const content = overlay.querySelector('.save-editor-content');
        const tabsWrapper = overlay.querySelector('.save-editor-tabs-wrapper');
        const tabsContainer = overlay.querySelector('.save-editor-tabs');
        const searchInput = overlay.querySelector('.save-editor-search');
        const saveBtn = overlay.querySelector('.save-btn');

        const leftShadow = overlay.querySelector('.tabs-shadow-left');
        const rightShadow = overlay.querySelector('.tabs-shadow-right');

        const updateTabShadows = () => {
            if (!tabsContainer || !leftShadow || !rightShadow) return;
            const scrollLeft = tabsContainer.scrollLeft;
            const scrollWidth = tabsContainer.scrollWidth;
            const clientWidth = tabsContainer.clientWidth;
            
            if (scrollLeft > 2) {
                leftShadow.classList.add('visible');
            } else {
                leftShadow.classList.remove('visible');
            }
            
            if (scrollWidth - clientWidth - scrollLeft > 2) {
                rightShadow.classList.add('visible');
            } else {
                rightShadow.classList.remove('visible');
            }
        };

        if (tabsContainer) {
            tabsContainer.addEventListener('scroll', updateTabShadows);
            if (typeof ResizeObserver !== 'undefined') {
                const resizeObserver = new ResizeObserver(() => {
                    updateTabShadows();
                });
                resizeObserver.observe(tabsContainer);
            }
        }

        const storedPins = localStorage.getItem(`yumeshelf_pinned_${gameKey}`);
        let parsedPins = [];
        try {
            parsedPins = storedPins ? JSON.parse(storedPins) : [];
        } catch (e) {
            console.error('[SAVE-EDITOR] Failed to parse pinned variables:', e);
        }

        let popoutState = null;
        if (isStandalone) {
            const stateStr = localStorage.getItem(`yumeshelf_popout_state_${gameKey}`);
            if (stateStr) {
                try {
                    popoutState = JSON.parse(stateStr);
                    localStorage.removeItem(`yumeshelf_popout_state_${gameKey}`);
                } catch (e) {
                    console.error('[SAVE-EDITOR] Failed to parse popout state:', e);
                }
            }
        }

        // Central shared state context
        const state = {
            currentSaveData: null,
            currentMetadata: null,
            currentFileName: popoutState ? popoutState.currentFileName : null,
            originalSnapshot: null,
            activeTab: popoutState ? popoutState.activeTab : 'gold',
            showEmpty: popoutState && popoutState.showEmpty !== undefined ? popoutState.showEmpty : false,
            showImportant: popoutState && popoutState.showImportant !== undefined ? popoutState.showImportant : true,
            gameKey,
            isStandalone,
            d,
            pinnedVariables: new Set(parsedPins),
            savePinnedVariables: () => {
                try {
                    localStorage.setItem(`yumeshelf_pinned_${gameKey}`, JSON.stringify(Array.from(state.pinnedVariables)));
                } catch (e) {
                    console.error('[SAVE-EDITOR] Failed to save pinned variables:', e);
                }
            },
            hasUnsavedChanges: () => {
                if (!state.currentSaveData || !state.originalSnapshot) return false;
                return JSON.stringify(state.currentSaveData) !== JSON.stringify(state.originalSnapshot);
            }
        };

        const refs = {
            overlay,
            sidebar,
            content,
            tabsWrapper,
            tabsContainer,
            searchInput,
            saveBtn
        };

        // Initialize grid rendering module
        const { setupTabs, renderTabContent } = setupGridRenderer(refs, state, engine, translator);

        // Initialize search bar module
        setupSearchBar(refs, state, engine, renderTabContent);

        // Initialize sidebar module
        const { reloadFileList } = setupSidebar(refs, state, engine, translator, {
            onSaveLoaded: () => {
                setupTabs();
                renderTabContent();
                setTimeout(updateTabShadows, 50);
            }
        });

        if (popoutState && popoutState.searchOptions) {
            engine.setSearchOptions(popoutState.searchOptions);
            if (refs.searchInput) {
                refs.searchInput.value = popoutState.searchOptions.query || '';
            }
            const exactCheck = overlay.querySelector('.exact-match-check');
            if (exactCheck) exactCheck.checked = !!popoutState.searchOptions.exact;
            
            const searchNameCheck = overlay.querySelector('.search-name-check');
            if (searchNameCheck) searchNameCheck.checked = !!popoutState.searchOptions.searchName;

            const searchValueCheck = overlay.querySelector('.search-value-check');
            if (searchValueCheck) searchValueCheck.checked = !!popoutState.searchOptions.searchValue;
            
            const searchIndexCheck = overlay.querySelector('.search-index-check');
            if (searchIndexCheck) searchIndexCheck.checked = !!popoutState.searchOptions.searchIndex;
        }

        // Load initial file list
        reloadFileList(state.currentFileName);

        // Translation Button Trigger
        const translateBtn = overlay.querySelector('.translate-btn');
        translateBtn.onclick = () => {
            console.log('[SAVE-EDITOR] Starting translation of visible labels in background...');
            if (translator.isTranslating || !state.currentSaveData) {
                console.warn('[SAVE-EDITOR] Translation skipped: isTranslating=' + translator.isTranslating + ', hasData=' + !!state.currentSaveData);
                return;
            }
            
            const targetLang = translator.resolvedBcp47 || localStorage.getItem('yumeshelf_lang') || 'en';
            const labels = Array.from(content.querySelectorAll('.data-label'));
            console.log(`[SAVE-EDITOR] Found ${labels.length} labels to check for translation.`);

            translateBtn.classList.add('loading');
            const originalBtnText = translateBtn.querySelector('span').textContent;
            translateBtn.querySelector('span').textContent = 'Translating (0%)';
            const progressBar = translateBtn.querySelector('.translate-progress');
            progressBar.style.width = '0%';

            translator.translateLabels(labels, targetLang, (progress) => {
                progressBar.style.width = `${progress}%`;
                translateBtn.querySelector('span').textContent = `Translating (${progress}%)`;
            }).then(() => {
                console.log('[SAVE-EDITOR] Background translation complete successfully.');
            }).catch(err => {
                console.error('[SAVE-EDITOR] Background translation failed:', err);
            }).finally(() => {
                translateBtn.classList.remove('loading');
                translateBtn.querySelector('span').textContent = originalBtnText;
                setTimeout(() => { progressBar.style.width = '0%'; }, 500);
            });
        };

        // Save Button Trigger
        saveBtn.onclick = async () => {
            saveBtn.disabled = true;
            const originalText = saveBtn.textContent;
            saveBtn.textContent = 'Saving...';
            try {
                await window.electronAPI.writeSaveData({
                    gameKey,
                    fileName: state.currentFileName,
                    data: state.currentSaveData
                });
                
                state.originalSnapshot = JSON.parse(JSON.stringify(state.currentSaveData));
                renderTabContent(); // Re-render to clear deltas
                
                saveBtn.textContent = 'Saved!';
                setTimeout(() => { saveBtn.textContent = originalText; }, 2000);
            } catch (err) {
                alert('Failed to save: ' + err.message);
                saveBtn.textContent = originalText;
            } finally {
                saveBtn.disabled = false;
            }
        };
    };
}
