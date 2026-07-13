// @ts-nocheck
import { DataEngine } from './save-editor/data-engine';
import { Translator } from './save-editor/translator';
import { setupSidebar } from './save-editor/sidebar';
import { setupGridRenderer } from './save-editor/grid-renderer';
import { setupSearchBar } from './save-editor/search-bar';

function handleTranslate(translateBtn, translator, state, content) {
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
}

export function initSaveEditorUI() {
    globalThis.showSaveEditor = async (gameKey, options = {}) => {
        const engine = new DataEngine();
        const translator = new Translator(globalThis.electronAPI);
        await translator.initialize();
        const d = globalThis.currentUIStrings || {};
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

        overlay.innerHTML = getPanelHTML(d, popoutBtnHTML);
        document.body.appendChild(overlay);
        
        const localKeydownHandler = (e) => handleGlobalKeydown(e, overlay, state, engine, renderTabContent);
        document.addEventListener('keydown', localKeydownHandler);

        const close = (force = false) => {
            if (!force && state.hasUnsavedChanges?.()) {
                if (!confirm(d.save_editor_unsaved_confirm || 'You have unsaved changes. Are you sure you want to close and discard changes?')) {
                    return;
                }
            }
            document.removeEventListener('keydown', localKeydownHandler);
            if (isStandalone) {
                globalThis.close();
            } else {
                overlay.remove();
            }
        };
        overlay.querySelector('.save-editor-close').onclick = () => close(false);
        overlay.querySelector('.cancel-btn').onclick = () => close(false);

        if (!isStandalone) {
            const popoutBtn = overlay.querySelector('.save-editor-popout');
            if (popoutBtn) {
                popoutBtn.onclick = () => {
                    if (state.hasUnsavedChanges?.()) {
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
                    
                    globalThis.electronAPI.send('open-save-editor-window', gameKey);
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

        const tabShadowUpdater = () => updateTabShadows(tabsContainer, leftShadow, rightShadow);

        if (tabsContainer) {
            tabsContainer.addEventListener('scroll', tabShadowUpdater);
            if (typeof ResizeObserver !== 'undefined') {
                const resizeObserver = new ResizeObserver(() => {
                    tabShadowUpdater();
                });
                resizeObserver.observe(tabsContainer);
            }
        }

        const storedPins = localStorage.getItem(`yumeshelf_pinned_${gameKey}`);
        let parsedPins = [];
        try {
            parsedPins = storedPins ? JSON.parse(storedPins) : [];
        } catch (e) {
            console.error('[SAVE-EDITOR] Failed to save pinned variables:', e);
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
            showEmpty: popoutState?.showEmpty ?? false,
            showImportant: popoutState?.showImportant ?? true,
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
                setTimeout(tabShadowUpdater, 50);
            }
        });

        if (popoutState?.searchOptions) {
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
        translateBtn.onclick = () => handleTranslate(translateBtn, translator, state, content);

        // Save Button Trigger
        saveBtn.onclick = async () => {
            saveBtn.disabled = true;
            const originalText = saveBtn.textContent;
            saveBtn.textContent = 'Saving...';
            try {
                await globalThis.electronAPI.invoke('save-editor:write-data', {
                    gameKey,
                    fileName: state.currentFileName,
                    data: state.currentSaveData
                });
                
                state.originalSnapshot = structuredClone(state.currentSaveData);
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
