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
        let translationCache = {};
        try {
            translationCache = JSON.parse(localStorage.getItem('yumeshelf_translation_cache') || '{}') || {};
        } catch (e) {
            translationCache = {};
        }
        let isTranslating = false;

        function saveTranslations() {
            localStorage.setItem('yumeshelf_translation_cache', JSON.stringify(translationCache));
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
                // Uncheck the other one
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
                // Uncheck the other one
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

        async function translateVisibleLabels() {
            console.log('[SAVE-EDITOR] Starting translation of visible labels...');
            if (isTranslating || !currentSaveData) {
                console.warn('[SAVE-EDITOR] Translation skipped: isTranslating=' + isTranslating + ', hasData=' + !!currentSaveData);
                return;
            }
            
            const targetLang = (window.appConfig?.language || 'en').split('-')[0];
            const labels = Array.from(content.querySelectorAll('.data-label'));
            console.log(`[SAVE-EDITOR] Found ${labels.length} labels to check for translation.`);
            
            const textsToTranslate = [];
            const labelMap = [];

            labels.forEach(label => {
                const originalName = label.getAttribute('title') || label.textContent;
                if (!originalName || /^\d+$/.test(originalName) || originalName.length < 2) return;
                
                if (translationCache[originalName]) {
                    label.textContent = translationCache[originalName];
                    label.classList.add('is-translated');
                } else {
                    textsToTranslate.push(originalName);
                    labelMap.push({ el: label, original: originalName });
                }
            });

            const uniqueTexts = [...new Set(textsToTranslate)];
            console.log(`[SAVE-EDITOR] ${uniqueTexts.length} unique labels require external translation.`);
            
            if (uniqueTexts.length === 0) {
                console.log('[SAVE-EDITOR] No new labels to translate.');
                return;
            }

            isTranslating = true;
            translateBtn.classList.add('loading');
            const originalBtnText = translateBtn.querySelector('span').textContent;
            translateBtn.querySelector('span').textContent = '...';
            const progressBar = translateBtn.querySelector('.translate-progress');
            progressBar.style.width = '0%';

            try {
                const batchSize = 15; 
                for (let i = 0; i < uniqueTexts.length; i += batchSize) {
                    const chunk = uniqueTexts.slice(i, i + batchSize);
                    const combined = chunk.join('\n');
                    console.log(`[SAVE-EDITOR] Translating batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(uniqueTexts.length/batchSize)}...`);
                    
                    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(combined)}`;
                    
                    const response = await fetch(url);
                    if (!response.ok) {
                        console.error(`[SAVE-EDITOR] Translation API error: ${response.status} ${response.statusText}`);
                        continue;
                    }
                    const result = await response.json();
                    
                    if (result && result[0]) {
                        let translatedFull = "";
                        result[0].forEach(part => {
                            if (part[0]) translatedFull += part[0];
                        });
                        
                        const translatedLines = translatedFull.split('\n');
                        chunk.forEach((original, idx) => {
                            if (translatedLines[idx]) {
                                const translatedText = translatedLines[idx].trim();
                                translationCache[original] = translatedText;
                                console.log(`[SAVE-EDITOR] Translated: "${original}" -> "${translatedText}"`);
                            }
                        });
                    }

                    const progress = Math.round(((i + chunk.length) / uniqueTexts.length) * 100);
                    progressBar.style.width = `${progress}%`;
                }
                saveTranslations();

                labelMap.forEach(item => {
                    if (translationCache[item.original]) {
                        item.el.textContent = translationCache[item.original];
                        item.el.classList.add('is-translated');
                    }
                });
                console.log('[SAVE-EDITOR] Translation complete.');
            } catch (err) {
                console.error('[SAVE-EDITOR] Translation failed:', err);
            } finally {
                isTranslating = false;
                translateBtn.classList.remove('loading');
                translateBtn.querySelector('span').textContent = originalBtnText;
                setTimeout(() => { progressBar.style.width = '0%'; }, 500);
            }
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
            // Buffer rendering to prevent flicker
            const grid = document.createElement('div');
            grid.className = 'save-grid';
            
            const root = extractRoot(currentSaveData);
            const party = root.party || root._party || getProp(root, 'party');
            const variables = root.variables || root._variables || getProp(root, 'variables');
            const switches = root.switches || root._switches || getProp(root, 'switches');

            if (activeTab === 'gold') {
                const goldInfo = findGold(root, party);
                if (goldInfo) {
                    const row = UIComponents.createDataRow('GOLD', goldInfo.val, d.save_editor_gold || 'Gold', (val) => {
                        goldInfo.obj[goldInfo.key] = parseInt(val) || 0;
                    });
                    row.style.gridColumn = '1 / -1';
                    row.style.maxWidth = '300px';
                    grid.appendChild(row);
                }
            } else if (['items', 'weapons', 'armors'].includes(activeTab)) {
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
                applyCachedLabels(content);
            }
        }

        // --- Helpers ---

        function extractRoot(save) {
            if (save.contents && typeof save.contents === 'object') return save.contents;
            if (save.data && typeof save.data === 'object' && !save.data['@a']) return save.data;
            return save;
        }

        function getProp(obj, prop) {
            const p = prop.toLowerCase();
            const keys = Object.keys(obj);
            const match = keys.find(k => k === p || k === '_' + p || k.toLowerCase() === p || k.toLowerCase() === '_' + p);
            return match ? obj[match] : null;
        }

        function findGold(root, party) {
            const targets = [party, root, root.system, root._system];
            for (const t of targets) {
                if (!t) continue;
                if (t._gold !== undefined) return { obj: t, key: '_gold', val: t._gold };
                if (t.gold !== undefined) return { obj: t, key: 'gold', val: t.gold };
            }
            return null;
        }

        function renderInventory(target, key, metaSource, grid) {
            const actualKey = target['_' + key] !== undefined ? '_' + key : key;
            const items = extractData(target[actualKey]);
            if (!items || typeof items !== 'object') return;

            Object.entries(items).forEach(([id, val]) => {
                if (id.startsWith('@') || id === '@c') return;
                const meta = metaSource[id] || { name: `${key.slice(0,-1)} #${id}` };
                const translated = translationCache[meta.name];
                
                if (!engine.matchesQuery(id, val, meta.name) && !engine.matchesQuery(id, val, translated)) return;

                grid.appendChild(UIComponents.createDataRow(id, val, meta.name, (newVal) => {
                    items[id] = parseInt(newVal) || 0;
                }));
            });
        }

        function renderBitset(data, metaSource, grid, onUpdate, isNumeric) {
            const raw = extractData(data);
            const process = (id, val) => {
                if (id == 0 || id === '0' || id === '@c') return;
                const name = metaSource[id] || `ID #${id}`;
                const translated = translationCache[name];
                
                const isNamed = metaSource[id] && metaSource[id].trim() !== '';
                const isEmpty = isNumeric ? (val === 0 || val === "" || val === null) : !val;

                // Important variables for specific games (like Fallen Priestess)
                const isImportant = activeTab === 'variables' && [12, 15, 16, 17, 18, 19, 20, 21, 25, 26, 61, 62, 63, 64, 65, 66].includes(Number(id));

                if (!showEmpty && !isImportant && !isNamed && isEmpty) return;
                if (!engine.matchesQuery(id, val, name) && !engine.matchesQuery(id, val, translated)) return;

                if (isNumeric) {
                    grid.appendChild(UIComponents.createDataRow(id, val, name, (nv) => onUpdate(id, val, nv)));
                } else {
                    // For switches, we use a simple checkbox wrapper
                    const row = document.createElement('div');
                    row.className = 'data-row checkbox-row';
                    row.innerHTML = `
                        <span class="data-id">#${id}</span>
                        <label class="data-label" title="${name}">${name}</label>
                        <input type="checkbox" ${val ? 'checked' : ''}>
                    `;
                    row.querySelector('input').onchange = (e) => onUpdate(id, val, e.target.checked);
                    grid.appendChild(row);
                }
            };

            if (Array.isArray(raw)) raw.forEach((val, id) => process(id, val));
            else if (typeof raw === 'object') Object.entries(raw).forEach(([id, val]) => process(id, val));
        }

        function extractData(obj) {
            if (!obj) return null;
            if (obj._data !== undefined) return extractData(obj._data);
            if (obj.data !== undefined) return extractData(obj.data);
            if (obj['@a'] !== undefined) return obj['@a'];
            return obj;
        }

        function applyCachedLabels(container) {
            const labels = container.querySelectorAll('.data-label');
            labels.forEach(label => {
                const fullText = label.getAttribute('title') || label.textContent;
                if (translationCache[fullText]) {
                    label.textContent = translationCache[fullText];
                    label.classList.add('is-translated');
                }
            });
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
