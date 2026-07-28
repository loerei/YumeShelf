import { DataEngine } from './data-engine';
import { setupGridRenderer } from './grid-renderer';
import { setupSearchBar } from './search-bar';
import { setupSidebar } from './sidebar';
import { Translator } from './translator';

export interface SaveEditorOpenOptions {
    isStandaloneWindow?: boolean;
}

export interface SaveEditorState {
    currentSaveData: any;
    currentMetadata: any;
    currentFileName: string | null;
    originalSnapshot: any;
    activeTab: string;
    showEmpty: boolean;
    showImportant: boolean;
    gameKey: string;
    isStandalone: boolean;
    d: Record<string, string>;
    pinnedVariables: Set<string>;
    savePinnedVariables: () => void;
    hasUnsavedChanges: () => boolean;
}

export class SaveEditorViewController {
    private readonly engine: DataEngine;
    private readonly translator: Translator;
    private overlay: HTMLElement | null = null;
    private handleGlobalKeydown: ((e: KeyboardEvent) => void) | null = null;
    private activeControllerState: SaveEditorState | null = null;

    constructor() {
        this.engine = new DataEngine();
        this.translator = new Translator((window as any).electronAPI);
    }

    private buildOverlayHTML(d: Record<string, string>, isStandalone: boolean): string {
        const popoutBtnHTML = isStandalone ? '' : `
            <button class="save-editor-popout" title="Open in separate window" style="background: none; border: none; color: #9ca3af; font-size: 1.25em; cursor: pointer; padding: 4px; display: flex; align-items: center; justify-content: center; transition: color 0.2s;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="18" height="18">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                    <polyline points="15 3 21 3 21 9"/>
                    <line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
            </button>
        `;

        return `
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
    }

    private isUserTyping(): boolean {
        const activeElement = document.activeElement as HTMLElement | null;
        if (!activeElement) return false;
        return (
            (activeElement.tagName === 'INPUT' && ['text', 'search', 'number', 'password', 'email', 'tel', 'url'].includes((activeElement as HTMLInputElement).type)) ||
            activeElement.tagName === 'TEXTAREA' ||
            activeElement.isContentEditable
        );
    }

    private handleSingleKeyShortcut(key: string, overlay: HTMLElement, renderTabContent: () => void): void {
        if (key === 'e') {
            const chk = overlay.querySelector('.show-empty-check') as HTMLInputElement | null;
            if (chk && this.activeControllerState) {
                chk.checked = !chk.checked;
                this.activeControllerState.showEmpty = chk.checked;
                renderTabContent();
            }
        } else if (key === 'i') {
            const chk = overlay.querySelector('.show-important-check') as HTMLInputElement | null;
            if (chk && this.activeControllerState) {
                chk.checked = !chk.checked;
                this.activeControllerState.showImportant = chk.checked;
                renderTabContent();
            }
        } else if (key === 'x') {
            const chk = overlay.querySelector('.exact-match-check') as HTMLInputElement | null;
            if (chk) {
                chk.checked = !chk.checked;
                this.engine.setSearchOptions({ exact: chk.checked });
                renderTabContent();
            }
        }
    }

    private setupKeydownListener(overlay: HTMLElement, renderTabContent: () => void): (e: KeyboardEvent) => void {
        return (e: KeyboardEvent) => {
            if (this.isUserTyping()) return;

            if (e.shiftKey && e.key === 'Enter') {
                e.preventDefault();
                const saveBtn = overlay.querySelector('.save-btn') as HTMLButtonElement | null;
                if (saveBtn && saveBtn.style.display !== 'none' && !saveBtn.disabled) {
                    saveBtn.click();
                }
                return;
            }

            if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
            const key = e.key.toLowerCase();
            if (['e', 'i', 'x'].includes(key)) {
                e.preventDefault();
                this.handleSingleKeyShortcut(key, overlay, renderTabContent);
            }
        };
    }

    private setupTabShadows(tabsContainer: HTMLElement, leftShadow: HTMLElement | null, rightShadow: HTMLElement | null): void {
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

        tabsContainer.addEventListener('scroll', updateTabShadows);
        if (typeof ResizeObserver !== 'undefined') {
            const resizeObserver = new ResizeObserver(() => {
                updateTabShadows();
            });
            resizeObserver.observe(tabsContainer);
        }
    }

    private setupPopoutAction(overlay: HTMLElement, gameKey: string, isStandalone: boolean, d: Record<string, string>, close: (force?: boolean) => void): void {
        if (isStandalone) return;
        const popoutBtn = overlay.querySelector('.save-editor-popout') as HTMLElement | null;
        if (!popoutBtn) return;

        popoutBtn.onclick = () => {
            if (this.activeControllerState?.hasUnsavedChanges?.()) {
                if (!confirm(d.save_editor_unsaved_confirm || 'You have unsaved changes. Are you sure you want to open in a separate window and discard them?')) {
                    return;
                }
            }
            const stateToPass = {
                currentFileName: this.activeControllerState?.currentFileName,
                activeTab: this.activeControllerState?.activeTab,
                showEmpty: this.activeControllerState?.showEmpty,
                showImportant: this.activeControllerState?.showImportant,
                searchOptions: (this.engine as any).searchOptions
            };
            localStorage.setItem(`yumeshelf_popout_state_${gameKey}`, JSON.stringify(stateToPass));
            (window as any).electronAPI.openSaveEditorWindow(gameKey);
            close(true);
        };
        popoutBtn.addEventListener('mouseenter', () => { popoutBtn.style.color = '#ffffff'; });
        popoutBtn.addEventListener('mouseleave', () => { popoutBtn.style.color = '#9ca3af'; });
    }

    private parsePopoutState(gameKey: string, isStandalone: boolean): any {
        if (!isStandalone) return null;
        const stateStr = localStorage.getItem(`yumeshelf_popout_state_${gameKey}`);
        if (!stateStr) return null;
        try {
            const popoutState = JSON.parse(stateStr);
            localStorage.removeItem(`yumeshelf_popout_state_${gameKey}`);
            return popoutState;
        } catch (e) {
            console.error('[SAVE-EDITOR] Failed to parse popout state:', e);
            return null;
        }
    }

    private buildStateContext(gameKey: string, isStandalone: boolean, d: Record<string, string>, popoutState: any): SaveEditorState {
        const storedPins = localStorage.getItem(`yumeshelf_pinned_${gameKey}`);
        let parsedPins: string[] = [];
        try {
            parsedPins = storedPins ? JSON.parse(storedPins) : [];
        } catch (e) {
            console.error('[SAVE-EDITOR] Failed to parse pinned variables:', e);
        }

        const state: SaveEditorState = {
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

        return state;
    }

    private restorePopoutState(overlay: HTMLElement, popoutState: any): void {
        if (!popoutState?.searchOptions) return;
        this.engine.setSearchOptions(popoutState.searchOptions);
        const searchInput = overlay.querySelector('.save-editor-search') as HTMLInputElement | null;
        if (searchInput) {
            searchInput.value = popoutState.searchOptions.query || '';
        }
        const exactCheck = overlay.querySelector('.exact-match-check') as HTMLInputElement | null;
        if (exactCheck) exactCheck.checked = !!popoutState.searchOptions.exact;

        const searchNameCheck = overlay.querySelector('.search-name-check') as HTMLInputElement | null;
        if (searchNameCheck) searchNameCheck.checked = !!popoutState.searchOptions.searchName;

        const searchValueCheck = overlay.querySelector('.search-value-check') as HTMLInputElement | null;
        if (searchValueCheck) searchValueCheck.checked = !!popoutState.searchOptions.searchValue;

        const searchIndexCheck = overlay.querySelector('.search-index-check') as HTMLInputElement | null;
        if (searchIndexCheck) searchIndexCheck.checked = !!popoutState.searchOptions.searchIndex;
    }

    private setupTranslateAction(overlay: HTMLElement, content: HTMLElement): void {
        const translateBtn = overlay.querySelector('.translate-btn') as HTMLElement | null;
        if (!translateBtn) return;

        translateBtn.onclick = () => {
            const translatorAny = this.translator as any;
            if (translatorAny.isTranslating || !this.activeControllerState?.currentSaveData) {
                return;
            }

            const targetLang = translatorAny.resolvedBcp47 || localStorage.getItem('yumeshelf_lang') || 'en';
            const labels = Array.from(content.querySelectorAll('.data-label')) as HTMLElement[];

            translateBtn.classList.add('loading');
            const spanEl = translateBtn.querySelector('span');
            const originalBtnText = spanEl ? spanEl.textContent || 'Translate' : 'Translate';
            if (spanEl) spanEl.textContent = 'Translating (0%)';
            const progressBar = translateBtn.querySelector('.translate-progress') as HTMLElement;
            if (progressBar) progressBar.style.width = '0%';

            this.translator.translateLabels(labels, targetLang, (progress: number) => {
                if (progressBar) progressBar.style.width = `${progress}%`;
                if (spanEl) spanEl.textContent = `Translating (${progress}%)`;
            }).then(() => {
                console.log('[SAVE-EDITOR] Background translation complete successfully.');
            }).catch(err => {
                console.error('[SAVE-EDITOR] Background translation failed:', err);
            }).finally(() => {
                translateBtn.classList.remove('loading');
                if (spanEl) spanEl.textContent = originalBtnText;
                if (progressBar) {
                    setTimeout(() => { progressBar.style.width = '0%'; }, 500);
                }
            });
        };
    }

    private setupSaveAction(overlay: HTMLElement, gameKey: string, renderTabContent: () => void): void {
        const saveBtn = overlay.querySelector('.save-btn') as HTMLButtonElement | null;
        if (!saveBtn) return;

        saveBtn.onclick = async () => {
            if (!this.activeControllerState) return;
            saveBtn.disabled = true;
            const originalText = saveBtn.textContent;
            saveBtn.textContent = 'Saving...';
            try {
                await (window as any).electronAPI.writeSaveData({
                    gameKey,
                    fileName: this.activeControllerState.currentFileName,
                    data: this.activeControllerState.currentSaveData
                });

                this.activeControllerState.originalSnapshot = structuredClone(this.activeControllerState.currentSaveData);
                renderTabContent();

                saveBtn.textContent = 'Saved!';
                setTimeout(() => { saveBtn.textContent = originalText; }, 2000);
            } catch (err: any) {
                alert('Failed to save: ' + err.message);
                saveBtn.textContent = originalText;
            } finally {
                saveBtn.disabled = false;
            }
        };
    }

    public async open(gameKey: string, options: SaveEditorOpenOptions = {}): Promise<void> {
        await this.translator.initialize();
        const d = (window as any).currentUIStrings || {};
        const isStandalone = !!options.isStandaloneWindow;

        const overlay = document.createElement('div');
        overlay.className = `save-editor-overlay ${isStandalone ? 'standalone' : ''}`;
        overlay.innerHTML = this.buildOverlayHTML(d, isStandalone);
        this.overlay = overlay;

        document.body.appendChild(overlay);

        let renderTabContentFn: () => void = () => {};
        this.handleGlobalKeydown = this.setupKeydownListener(overlay, () => renderTabContentFn());
        document.addEventListener('keydown', this.handleGlobalKeydown);

        const close = (force = false) => {
            if (!force && this.activeControllerState?.hasUnsavedChanges?.()) {
                if (!confirm(d.save_editor_unsaved_confirm || 'You have unsaved changes. Are you sure you want to close and discard changes?')) {
                    return;
                }
            }
            this.destroy();
            if (isStandalone) {
                window.close();
            }
        };

        const closeBtn = overlay.querySelector('.save-editor-close') as HTMLElement | null;
        if (closeBtn) closeBtn.onclick = () => close(false);
        const cancelBtn = overlay.querySelector('.cancel-btn') as HTMLElement | null;
        if (cancelBtn) cancelBtn.onclick = () => close(false);

        this.setupPopoutAction(overlay, gameKey, isStandalone, d, close);

        const sidebar = overlay.querySelector('.save-editor-sidebar') as HTMLElement;
        const content = overlay.querySelector('.save-editor-content') as HTMLElement;
        const tabsWrapper = overlay.querySelector('.save-editor-tabs-wrapper') as HTMLElement;
        const tabsContainer = overlay.querySelector('.save-editor-tabs') as HTMLElement;
        const searchInput = overlay.querySelector('.save-editor-search') as HTMLInputElement;
        const saveBtn = overlay.querySelector('.save-btn') as HTMLButtonElement;

        const leftShadow = overlay.querySelector('.tabs-shadow-left') as HTMLElement | null;
        const rightShadow = overlay.querySelector('.tabs-shadow-right') as HTMLElement | null;

        if (tabsContainer) {
            this.setupTabShadows(tabsContainer, leftShadow, rightShadow);
        }

        const popoutState = this.parsePopoutState(gameKey, isStandalone);
        const state = this.buildStateContext(gameKey, isStandalone, d, popoutState);
        this.activeControllerState = state;

        const refs = {
            overlay,
            sidebar,
            content,
            tabsWrapper,
            tabsContainer,
            searchInput,
            saveBtn
        };

        const { setupTabs, renderTabContent } = setupGridRenderer(refs, state, this.engine, this.translator);
        renderTabContentFn = renderTabContent;

        setupSearchBar(refs, state, this.engine, renderTabContent);

        const { reloadFileList } = setupSidebar(refs, state, this.engine, this.translator, {
            onSaveLoaded: () => {
                setupTabs();
                renderTabContent();
            }
        });

        this.restorePopoutState(overlay, popoutState);
        reloadFileList(state.currentFileName);

        this.setupTranslateAction(overlay, content);
        this.setupSaveAction(overlay, gameKey, renderTabContent);
    }

    public destroy(): void {
        if (this.handleGlobalKeydown) {
            document.removeEventListener('keydown', this.handleGlobalKeydown);
            this.handleGlobalKeydown = null;
        }
        if (this.overlay) {
            this.overlay.remove();
            this.overlay = null;
        }
        this.activeControllerState = null;
    }
}
