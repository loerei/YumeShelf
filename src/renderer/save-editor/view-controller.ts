import { bindI18nStrings } from '../i18n-binder';
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

function createSVGIcon(pathD: string, width = 16, height = 16, viewBox = '0 0 24 24', strokeWidth = 2): SVGSVGElement {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', viewBox);
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', String(strokeWidth));
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathD);
    svg.appendChild(path);
    return svg;
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

    private createFilterLabel(i18nKey: string, text: string, className: string, checked = false, title = '', hide = false): HTMLLabelElement {
        const label = document.createElement('label');
        label.className = `save-editor-filter-check ${hide ? 'switch-filters-only' : ''}`.trim();
        if (title) label.title = title;
        if (hide) label.style.display = 'none';

        const input = document.createElement('input');
        input.type = 'checkbox';
        input.className = className;
        input.checked = checked;

        const span = document.createElement('span');
        span.setAttribute('data-i18n', i18nKey);
        span.textContent = text;

        label.appendChild(input);
        label.appendChild(span);
        return label;
    }

    private buildOverlayDOM(isStandalone: boolean): HTMLElement {
        const overlay = document.createElement('div');
        overlay.className = `save-editor-overlay ${isStandalone ? 'standalone' : ''}`;

        const panel = document.createElement('div');
        panel.className = 'save-editor-panel';

        // 1. Header
        const header = document.createElement('div');
        header.className = 'save-editor-header';

        const title = document.createElement('h2');
        title.setAttribute('data-i18n', 'action_save_editor');
        title.textContent = 'Save Editor';

        const headerActions = document.createElement('div');
        headerActions.style.cssText = 'display: flex; gap: 8px; align-items: center; margin-left: auto;';

        if (!isStandalone) {
            const popoutBtn = document.createElement('button');
            popoutBtn.className = 'save-editor-popout';
            popoutBtn.title = 'Open in separate window';
            popoutBtn.style.cssText = 'background: none; border: none; color: #9ca3af; font-size: 1.25em; cursor: pointer; padding: 4px; display: flex; align-items: center; justify-content: center; transition: color 0.2s;';
            popoutBtn.appendChild(createSVGIcon('M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6', 18, 18, '0 0 24 24', 2.2));
            headerActions.appendChild(popoutBtn);
        }

        const closeBtn = document.createElement('button');
        closeBtn.className = 'save-editor-close';
        closeBtn.textContent = '×';
        headerActions.appendChild(closeBtn);

        header.appendChild(title);
        header.appendChild(headerActions);

        // 2. Body
        const body = document.createElement('div');
        body.className = 'save-editor-body';

        const sidebar = document.createElement('div');
        sidebar.className = 'save-editor-sidebar';
        const loadingSidebar = document.createElement('div');
        loadingSidebar.className = 'save-editor-loading-sidebar';
        loadingSidebar.setAttribute('data-i18n', 'save_editor_loading');
        loadingSidebar.textContent = 'Loading...';
        sidebar.appendChild(loadingSidebar);

        const main = document.createElement('div');
        main.className = 'save-editor-main';

        const tabsWrapper = document.createElement('div');
        tabsWrapper.className = 'save-editor-tabs-wrapper';
        tabsWrapper.style.display = 'none';

        const tabsContainer = document.createElement('div');
        tabsContainer.className = 'save-editor-tabs-container';
        const tabs = document.createElement('div');
        tabs.className = 'save-editor-tabs';
        const leftShadow = document.createElement('div');
        leftShadow.className = 'tabs-shadow tabs-shadow-left';
        const rightShadow = document.createElement('div');
        rightShadow.className = 'tabs-shadow tabs-shadow-right';
        tabsContainer.appendChild(tabs);
        tabsContainer.appendChild(leftShadow);
        tabsContainer.appendChild(rightShadow);

        const actions = document.createElement('div');
        actions.className = 'save-editor-actions';

        const topBar = document.createElement('div');
        topBar.className = 'save-editor-top-bar';

        const searchWrapper = document.createElement('div');
        searchWrapper.className = 'save-editor-search-wrapper';
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.className = 'save-editor-search';
        searchInput.setAttribute('data-i18n-placeholder', 'save_editor_search_placeholder');
        searchInput.placeholder = 'Search...';
        searchWrapper.appendChild(searchInput);

        const refreshBtn = document.createElement('button');
        refreshBtn.className = 'refresh-save-btn';
        refreshBtn.title = 'Reload from disk';
        refreshBtn.appendChild(createSVGIcon('M23 4v6h-6M1 20v-6h6', 16, 16));

        const translateBtn = document.createElement('button');
        translateBtn.className = 'translate-btn';
        translateBtn.title = 'Translate to app language';
        translateBtn.appendChild(createSVGIcon('M5 8l6 6', 16, 16));
        const translateSpan = document.createElement('span');
        translateSpan.setAttribute('data-i18n', 'save_editor_translate');
        translateSpan.textContent = 'Translate';
        const translateProgress = document.createElement('div');
        translateProgress.className = 'translate-progress';
        translateBtn.appendChild(translateSpan);
        translateBtn.appendChild(translateProgress);

        topBar.appendChild(searchWrapper);
        topBar.appendChild(refreshBtn);
        topBar.appendChild(translateBtn);

        const filters = document.createElement('div');
        filters.className = 'save-editor-filters';
        filters.appendChild(this.createFilterLabel('save_editor_show_empty', 'Show empty', 'show-empty-check', false, 'Show all variables, including those with zero or no value'));
        filters.appendChild(this.createFilterLabel('save_editor_show_important', 'Show important', 'show-important-check', true, 'Always show important variables, even if they have zero or no value'));
        filters.appendChild(this.createFilterLabel('save_editor_exact', 'Exact', 'exact-match-check', false, 'Only show entries where the value matches your search exactly'));

        const divider1 = document.createElement('div');
        divider1.className = 'filter-divider';
        filters.appendChild(divider1);

        filters.appendChild(this.createFilterLabel('save_editor_search_name', 'Name', 'search-name-check', true, 'Search in names'));
        filters.appendChild(this.createFilterLabel('save_editor_search_value', 'Value', 'search-value-check', true, 'Search in values'));
        filters.appendChild(this.createFilterLabel('save_editor_search_index', 'Index', 'search-index-check', false, 'Search in index (ID)'));

        const divider2 = document.createElement('div');
        divider2.className = 'filter-divider switch-filters-only';
        divider2.style.display = 'none';
        filters.appendChild(divider2);

        filters.appendChild(this.createFilterLabel('save_editor_true_only', 'True only', 'switch-true-check', false, 'Only show switches that are ON', true));
        filters.appendChild(this.createFilterLabel('save_editor_false_only', 'False only', 'switch-false-check', false, 'Only show switches that are OFF', true));

        actions.appendChild(topBar);
        actions.appendChild(filters);

        tabsWrapper.appendChild(tabsContainer);
        tabsWrapper.appendChild(actions);

        const content = document.createElement('div');
        content.className = 'save-editor-content';
        const emptyState = document.createElement('div');
        emptyState.className = 'empty-state';
        emptyState.appendChild(createSVGIcon('M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z', 48, 48, '0 0 24 24', 1.5));
        const selectTitle = document.createElement('p');
        selectTitle.setAttribute('data-i18n', 'save_editor_select_title');
        selectTitle.textContent = 'Select a save file to start editing';
        emptyState.appendChild(selectTitle);
        content.appendChild(emptyState);

        main.appendChild(tabsWrapper);
        main.appendChild(content);

        body.appendChild(sidebar);
        body.appendChild(main);

        // 3. Footer
        const footer = document.createElement('div');
        footer.className = 'save-editor-footer';

        const mapBtn = document.createElement('button');
        mapBtn.className = 'secondary-btn map-variable-btn';
        mapBtn.style.display = 'none';
        mapBtn.setAttribute('data-i18n', 'save_editor_map');
        mapBtn.textContent = 'Map Variable';

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'secondary-btn cancel-btn';
        cancelBtn.setAttribute('data-i18n', 'save_editor_cancel');
        cancelBtn.textContent = 'Cancel';

        const saveBtn = document.createElement('button');
        saveBtn.className = 'primary-btn save-btn';
        saveBtn.style.display = 'none';
        saveBtn.setAttribute('data-i18n', 'save_editor_save');
        saveBtn.textContent = 'Save Changes';

        footer.appendChild(mapBtn);
        footer.appendChild(cancelBtn);
        footer.appendChild(saveBtn);

        panel.appendChild(header);
        panel.appendChild(body);
        panel.appendChild(footer);

        overlay.appendChild(panel);
        return overlay;
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

        const overlay = this.buildOverlayDOM(isStandalone);
        bindI18nStrings({ dictionary: d }, overlay);
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
