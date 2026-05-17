import { DataEngine } from './save-editor/data-engine.js';
import { UIComponents } from './save-editor/components.js';
import { Translator } from './save-editor/translator.js';

export function initSaveEditorUI() {
    window.showSaveEditor = async (gameKey) => {
        const d = window.currentUIStrings || {};
        const engine = new DataEngine();
        const translator = new Translator(window.electronAPI);
        
        const overlay = document.createElement('div');
        overlay.className = 'save-editor-overlay';
        overlay.innerHTML = `
            <div class="save-editor-panel">
                <div class="save-editor-header">
                    <h2 data-i18n="action_save_editor">${d.action_save_editor || 'Save Editor'}</h2>
                    <button class="save-editor-close">×</button>
                </div>
                <div class="save-editor-body">
                    <div class="save-editor-sidebar">
                        <div class="save-editor-loading-sidebar" data-i18n="save_editor_loading">${d.save_editor_loading || 'Loading...'}</div>
                    </div>
                    <div class="save-editor-main">
                        <div class="save-editor-tabs-wrapper" style="display: none;">
                            <div class="save-editor-tabs"></div>
                            <div class="save-editor-actions">
                                <div class="save-editor-top-bar">
                                    <div class="save-editor-search-wrapper">
                                        <input type="text" class="save-editor-search" data-i18n-placeholder="save_editor_search_placeholder" placeholder="${d.save_editor_search_placeholder || 'Search...'}">
                                    </div>
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
                    <button class="secondary-btn cancel-btn" data-i18n="save_editor_cancel">${d.save_editor_cancel || 'Cancel'}</button>
                    <button class="primary-btn save-btn" style="display: none;" data-i18n="save_editor_save">${d.save_editor_save || 'Save Changes'}</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        const close = () => document.body.removeChild(overlay);
        overlay.querySelector('.save-editor-close').onclick = close;
        overlay.querySelector('.cancel-btn').onclick = close;

        const sidebar = overlay.querySelector('.save-editor-sidebar');
        const content = overlay.querySelector('.save-editor-content');
        const tabsWrapper = overlay.querySelector('.save-editor-tabs-wrapper');
        const tabsContainer = overlay.querySelector('.save-editor-tabs');
        const searchInput = overlay.querySelector('.save-editor-search');
        const saveBtn = overlay.querySelector('.save-btn');

        let currentSaveData = null;
        let currentMetadata = null;
        let currentFileName = null;
        let activeTab = 'gold';
        let showEmpty = false;
        let showImportant = true;

        // Save Editor Tooltip Controller (disabled globally by default)
        const enableSaveEditorTooltips = false;
        function attachSaveEditorTooltip(element, getContent) {
            if (!enableSaveEditorTooltips) return;
            
            // To enable in the future, set enableSaveEditorTooltips to true.
            // You can easily plug in the main app's tooltipController,
            // or bind custom hover listeners to show a tooltip element.
            if (typeof getContent === 'function') {
                const content = getContent();
                element.setAttribute('title', content.title || '');
            }
        }

        // Initialize engine options from UI defaults
        engine.setSearchOptions({
            query: '',
            exact: false,
            searchName: true,
            searchValue: true,
            searchIndex: false
        });

        // Search Input with Debounce
        let searchDebounce = null;
        searchInput.oninput = (e) => {
            clearTimeout(searchDebounce);
            searchDebounce = setTimeout(() => {
                engine.setSearchOptions({ query: e.target.value });
                renderTabContent();
            }, 150);
        };

        // Filter Toggles
        overlay.querySelector('.show-empty-check').onchange = (e) => {
            showEmpty = e.target.checked;
            renderTabContent();
        };

        overlay.querySelector('.show-important-check').onchange = (e) => {
            showImportant = e.target.checked;
            renderTabContent();
        };

        overlay.querySelector('.exact-match-check').onchange = (e) => {
            engine.setSearchOptions({ exact: e.target.checked });
            renderTabContent();
        };

        overlay.querySelector('.search-name-check').onchange = (e) => {
            engine.setSearchOptions({ searchName: e.target.checked });
            renderTabContent();
        };

        overlay.querySelector('.search-value-check').onchange = (e) => {
            engine.setSearchOptions({ searchValue: e.target.checked });
            renderTabContent();
        };

        overlay.querySelector('.search-index-check').onchange = (e) => {
            engine.setSearchOptions({ searchIndex: e.target.checked });
            renderTabContent();
        };

        overlay.querySelector('.switch-true-check').onchange = (e) => {
            engine.setSearchOptions({ switchOnlyTrue: e.target.checked });
            if (e.target.checked) {
                const other = overlay.querySelector('.switch-false-check');
                if (other.checked) {
                    other.checked = false;
                    engine.setSearchOptions({ switchOnlyFalse: false });
                }
            }
            renderTabContent();
        };

        overlay.querySelector('.switch-false-check').onchange = (e) => {
            engine.setSearchOptions({ switchOnlyFalse: e.target.checked });
            if (e.target.checked) {
                const other = overlay.querySelector('.switch-true-check');
                if (other.checked) {
                    other.checked = false;
                    engine.setSearchOptions({ switchOnlyTrue: false });
                }
            }
            renderTabContent();
        };

        // Translation Button
        const translateBtn = overlay.querySelector('.translate-btn');
        translateBtn.onclick = translateVisibleLabels;

        function translateVisibleLabels() {
            console.log('[SAVE-EDITOR] Starting translation of visible labels in background...');
            if (translator.isTranslating || !currentSaveData) {
                console.warn('[SAVE-EDITOR] Translation skipped: isTranslating=' + translator.isTranslating + ', hasData=' + !!currentSaveData);
                return;
            }
            
            const targetLang = (window.appConfig?.language || 'en').split('-')[0];
            const labels = Array.from(content.querySelectorAll('.data-label'));
            console.log(`[SAVE-EDITOR] Found ${labels.length} labels to check for translation.`);

            translateBtn.classList.add('loading');
            const originalBtnText = translateBtn.querySelector('span').textContent;
            translateBtn.querySelector('span').textContent = 'Translating (0%)';
            const progressBar = translateBtn.querySelector('.translate-progress');
            progressBar.style.width = '0%';

            // Trigger translation asynchronously in background
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

        // Load file list
        try {
            const files = await window.electronAPI.listSaveFiles(gameKey);
            sidebar.innerHTML = '';
            if (files.length === 0) {
                sidebar.innerHTML = `<div class="save-editor-empty" data-i18n="save_editor_no_saves">${d.save_editor_no_saves || 'No saves found'}</div>`;
            } else {
                files.forEach(file => {
                    const item = document.createElement('div');
                    item.className = 'save-file-item';
                    item.textContent = file;
                    item.title = file;
                    item.onclick = () => loadSave(file, item);
                    sidebar.appendChild(item);
                });
            }
        } catch (err) {
            sidebar.innerHTML = `<div class="error">Failed to list saves</div>`;
        }

        async function loadSave(fileName, element) {
            content.innerHTML = `<div class="loading" data-i18n="save_editor_loading">${d.save_editor_loading || 'Loading save data...'}</div>`;
            overlay.querySelectorAll('.save-file-item').forEach(el => el.classList.remove('active'));
            element.classList.add('active');
            tabsWrapper.style.display = 'none';
            searchInput.value = '';
            engine.setSearchOptions({ query: '' });
            
            try {
                const { data, metadata } = await window.electronAPI.loadSaveData({ gameKey, fileName });
                currentSaveData = data;
                currentMetadata = metadata;
                currentFileName = fileName;
                
                setupTabs();
                renderTabContent();
                
                tabsWrapper.style.display = 'flex';
                saveBtn.style.display = 'block';
            } catch (err) {
                content.innerHTML = `<div class="error">Failed to load save: ${err.message}</div>`;
            }
        }

        function setupTabs() {
            tabsContainer.innerHTML = '';
            const tabs = [
                { id: 'gold', label: d.save_editor_gold || 'Gold', i18n: 'save_editor_gold' },
                { id: 'items', label: d.save_editor_items || 'Items', i18n: 'save_editor_items' },
                { id: 'weapons', label: d.save_editor_weapons || 'Weapons', i18n: 'save_editor_weapons' },
                { id: 'armors', label: d.save_editor_armors || 'Armors', i18n: 'save_editor_armors' },
                { id: 'variables', label: d.save_editor_variables || 'Variables', i18n: 'save_editor_variables' },
                { id: 'switches', label: d.save_editor_switches || 'Switches', i18n: 'save_editor_switches' }
            ];

            tabs.forEach(tab => {
                const el = document.createElement('div');
                el.className = `save-tab ${activeTab === tab.id ? 'active' : ''}`;
                el.textContent = tab.label;
                el.setAttribute('data-i18n', tab.i18n);
                el.onclick = () => {
                    activeTab = tab.id;
                    overlay.querySelectorAll('.save-tab').forEach(t => t.classList.remove('active'));
                    el.classList.add('active');
                    
                    // Show/hide switch-only filters
                    const switchFilters = overlay.querySelectorAll('.switch-filters-only');
                    switchFilters.forEach(f => f.style.display = (tab.id === 'switches') ? 'flex' : 'none');
                    if (tab.id !== 'switches') {
                        // Reset switch filters when leaving the tab
                        overlay.querySelector('.switch-true-check').checked = false;
                        overlay.querySelector('.switch-false-check').checked = false;
                        engine.setSearchOptions({ switchOnlyTrue: false, switchOnlyFalse: false });
                    }

                    content.scrollTop = 0;
                    renderTabContent();
                };
                tabsContainer.appendChild(el);
            });
        }

        function renderTabContent() {
            const grid = document.createElement('div');
            grid.className = 'save-grid';
            
            const root = engine.extractRoot(currentSaveData);
            const party = root ? (root.party || root._party || engine.getProp(root, 'party')) : null;
            const variables = root ? (root.variables || root._variables || engine.getProp(root, 'variables')) : null;
            const switches = root ? (root.switches || root._switches || engine.getProp(root, 'switches')) : null;

            if (activeTab === 'gold' && root) {
                const goldInfo = engine.findGold(root, party);
                if (goldInfo) {
                    const row = UIComponents.createDataRow('GOLD', goldInfo.val, d.save_editor_gold || 'Gold', (val) => {
                        goldInfo.obj[goldInfo.key] = parseInt(val) || 0;
                    });
                    row.style.gridColumn = '1 / -1';
                    row.style.maxWidth = '300px';
                    grid.appendChild(row);
                }
            } else if (['items', 'weapons', 'armors'].includes(activeTab) && root) {
                renderInventory(party || root, activeTab, currentMetadata[activeTab], grid);
            } else if (activeTab === 'variables' && variables) {
                renderBitset(variables, currentMetadata.variables, grid, (id, val, newVal) => {
                    const num = Number(newVal);
                    variables[id] = isNaN(num) ? newVal : num;
                }, true);
            } else if (activeTab === 'switches' && switches) {
                renderBitset(switches, currentMetadata.switches, grid, (id, val, newVal) => {
                    switches[id] = newVal;
                }, false);
            }

            content.innerHTML = '';
            if (grid.children.length === 0) {
                const msg = engine.searchOptions.query ? 'No results found' : 'No data found in this category';
                content.innerHTML = `<div class="empty-state"><p>${msg}</p></div>`;
            } else {
                content.appendChild(grid);
                // Apply UI-level translations
                translator.applyTranslations(content);
                // Apply cached translations for labels
                translator.applyCachedLabels(content);
            }
        }

        function renderInventory(target, key, metaSource, grid) {
            const actualKey = target['_' + key] !== undefined ? '_' + key : key;
            const items = engine.extractData(target[actualKey]);
            if (!items || typeof items !== 'object') return;

            // Collect all potential item IDs
            const allIds = new Set();
            
            // Add items currently in save
            Object.keys(items).forEach(id => {
                if (id.startsWith('@') || id === '@c') return;
                allIds.add(id);
            });

            // Add items from metadata database if showEmpty is checked
            if (showEmpty) {
                Object.keys(metaSource).forEach(id => {
                    if (id == 0 || id === '0') return;
                    const meta = metaSource[id];
                    if (meta && meta.name && meta.name.trim() !== '') {
                        allIds.add(id);
                    }
                });
            }

            // Sort IDs numerically for a neat, sequential experience!
            const sortedIds = Array.from(allIds).sort((a, b) => Number(a) - Number(b));

            sortedIds.forEach(id => {
                const val = items[id] !== undefined ? items[id] : 0;
                
                // If showEmpty is unchecked, hide items with quantity <= 0
                if (!showEmpty && val <= 0) return;

                const meta = metaSource[id] || { name: `${key.slice(0,-1)} #${id}` };
                const translated = translator.translationCache[meta.name];
                
                if (!engine.matchesQuery(id, val, meta.name) && !engine.matchesQuery(id, val, translated)) return;

                const row = UIComponents.createDataRow(id, val, meta.name, (newVal) => {
                    const parsedVal = parseInt(newVal) || 0;
                    if (parsedVal === 0 && !showEmpty) {
                        delete items[id]; // Delete if value is 0 and showEmpty is false to keep save file clean
                    } else {
                        items[id] = parsedVal;
                    }
                });
                attachSaveEditorTooltip(row, () => ({ title: meta.name }));
                grid.appendChild(row);
            });
        }

        function renderBitset(data, metaSource, grid, onUpdate, isNumeric) {
            const raw = engine.extractData(data);
            const process = (id, val) => {
                if (id == 0 || id === '0' || id === '@c') return;
                const name = metaSource[id] || `ID #${id}`;
                const translated = translator.translationCache[name];
                
                const isNamed = metaSource[id] && metaSource[id].trim() !== '';
                const isUninitialized = val === undefined || val === null || val === '';
                const isZeroOrFalse = isNumeric ? val === 0 : val === false;

                // Important variables for specific games
                const isImportant = activeTab === 'variables' && [12, 15, 16, 17, 18, 19, 20, 21, 25, 26, 61, 62, 63, 64, 65, 66].includes(Number(id));

                if (!showEmpty) {
                    // Always hide truly uninitialized/blank values if showEmpty is false,
                    // UNLESS showImportant is enabled and the variable is marked important.
                    if (isUninitialized) {
                        if (!showImportant || !isImportant) return;
                    }
                    // For zero/false values, hide them if they are not named.
                    // If showImportant is enabled, we keep important zero/false values visible.
                    const treatAsImportant = showImportant && isImportant;
                    if (isZeroOrFalse && !isNamed && !treatAsImportant) return;
                }

                if (!engine.matchesQuery(id, val, name) && !engine.matchesQuery(id, val, translated)) return;

                if (isNumeric) {
                    const row = UIComponents.createDataRow(id, val, name, (nv) => onUpdate(id, val, nv));
                    attachSaveEditorTooltip(row, () => ({ title: name }));
                    grid.appendChild(row);
                } else {
                    const row = document.createElement('div');
                    row.className = 'data-row checkbox-row';
                    row.innerHTML = `
                        <span class="data-id">#${id}</span>
                        <label class="data-label" title="${name}">${name}</label>
                        <input type="checkbox" ${val ? 'checked' : ''}>
                    `;
                    row.querySelector('input').onchange = (e) => onUpdate(id, val, e.target.checked);
                    attachSaveEditorTooltip(row, () => ({ title: name }));
                    grid.appendChild(row);
                }
            };

            if (Array.isArray(raw)) raw.forEach((val, id) => process(id, val));
            else if (typeof raw === 'object') Object.entries(raw).forEach(([id, val]) => process(id, val));
        }

        saveBtn.onclick = async () => {
            saveBtn.disabled = true;
            const originalText = saveBtn.textContent;
            saveBtn.textContent = 'Saving...';
            try {
                await window.electronAPI.writeSaveData({
                    gameKey,
                    fileName: currentFileName,
                    data: currentSaveData
                });
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
