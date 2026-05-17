import { UIComponents } from './components.js';

export function setupGridRenderer(refs, state, engine, translator) {
    const { overlay, content, tabsContainer, tabsWrapper } = refs;

    // Save Editor Tooltip Controller (disabled globally by default)
    const enableSaveEditorTooltips = false;
    function attachSaveEditorTooltip(element, getContent) {
        if (!enableSaveEditorTooltips) return;
        if (typeof getContent === 'function') {
            const content = getContent();
            element.setAttribute('title', content.title || '');
        }
    }

    function setupTabs() {
        const d = state.d || {};
        tabsContainer.innerHTML = '';
        
        const root = engine.extractRoot(state.currentSaveData);
        const party = root ? (root.party || root._party || engine.getProp(root, 'party')) : null;
        const variables = root ? (root.variables || root._variables || engine.getProp(root, 'variables')) : null;
        const switches = root ? (root.switches || root._switches || engine.getProp(root, 'switches')) : null;

        const hasCategoryData = (tabId) => {
            if (!root) return false;
            if (tabId === 'gold') {
                return !!engine.findGold(root, party);
            }
            if (['items', 'weapons', 'armors'].includes(tabId)) {
                const target = party || root;
                if (!target) return false;
                const actualKey = target['_' + tabId] !== undefined ? '_' + tabId : tabId;
                const items = engine.extractData(target[actualKey]);
                if (!items || typeof items !== 'object') return false;
                return Object.keys(items).some(id => id !== '@c' && !id.startsWith('@'));
            }
            if (tabId === 'variables') {
                if (!variables) return false;
                const raw = engine.extractData(variables);
                if (!raw || typeof raw !== 'object') return false;
                return Object.keys(raw).some(id => id !== '@c' && !id.startsWith('@'));
            }
            if (tabId === 'switches') {
                if (!switches) return false;
                const raw = engine.extractData(switches);
                if (!raw || typeof raw !== 'object') return false;
                return Object.keys(raw).some(id => id !== '@c' && !id.startsWith('@'));
            }
            return false;
        };

        const tabs = [
            { id: 'gold', label: d.save_editor_gold || 'Gold', i18n: 'save_editor_gold' },
            { id: 'items', label: d.save_editor_items || 'Items', i18n: 'save_editor_items' },
            { id: 'weapons', label: d.save_editor_weapons || 'Weapons', i18n: 'save_editor_weapons' },
            { id: 'armors', label: d.save_editor_armors || 'Armors', i18n: 'save_editor_armors' },
            { id: 'variables', label: d.save_editor_variables || 'Variables', i18n: 'save_editor_variables' },
            { id: 'switches', label: d.save_editor_switches || 'Switches', i18n: 'save_editor_switches' }
        ];

        const visibleTabs = tabs.filter(tab => {
            const hasData = hasCategoryData(tab.id);
            if (!hasData) {
                console.log(`[SAVE-EDITOR] Tab '${tab.id}' has no data, hiding it.`);
            }
            return hasData;
        });

        // Adjust activeTab if the currently active one is now hidden
        if (visibleTabs.length > 0 && !visibleTabs.some(t => t.id === state.activeTab)) {
            console.log(`[SAVE-EDITOR] Current activeTab '${state.activeTab}' is hidden. Auto-switching to '${visibleTabs[0].id}'.`);
            state.activeTab = visibleTabs[0].id;
        }

        visibleTabs.forEach(tab => {
            const el = document.createElement('div');
            el.className = `save-tab ${state.activeTab === tab.id ? 'active' : ''}`;
            el.textContent = tab.label;
            el.setAttribute('data-i18n', tab.i18n);
            el.onclick = () => {
                state.activeTab = tab.id;
                overlay.querySelectorAll('.save-tab').forEach(t => t.classList.remove('active'));
                el.classList.add('active');
                
                // Logic to show Map button if we are in an engine that supports mapping
                const mapBtn = overlay.querySelector('.map-variable-btn');
                if (mapBtn) mapBtn.style.display = (tab.id === 'variables') ? 'block' : 'none';
                
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
        const d = state.d || {};
        const grid = document.createElement('div');
        grid.className = 'save-grid';
        
        const root = engine.extractRoot(state.currentSaveData);
        const party = root ? (root.party || root._party || engine.getProp(root, 'party')) : null;
        const variables = root ? (root.variables || root._variables || engine.getProp(root, 'variables')) : null;
        const switches = root ? (root.switches || root._switches || engine.getProp(root, 'switches')) : null;

        const originalRoot = state.originalSnapshot ? engine.extractRoot(state.originalSnapshot) : null;
        const originalParty = originalRoot ? (originalRoot.party || originalRoot._party || engine.getProp(originalRoot, 'party')) : null;
        const originalVariables = originalRoot ? (originalRoot.variables || originalRoot._variables || engine.getProp(originalRoot, 'variables')) : null;
        const originalSwitches = originalRoot ? (originalRoot.switches || originalRoot._switches || engine.getProp(originalRoot, 'switches')) : null;

        if (state.activeTab === 'gold' && root) {
            const goldInfo = engine.findGold(root, party);
            const origGoldInfo = originalRoot ? engine.findGold(originalRoot, originalParty) : null;
            const originalGoldVal = origGoldInfo ? origGoldInfo.val : undefined;
            
            if (goldInfo) {
                const row = UIComponents.createDataRow('GOLD', goldInfo.val, d.save_editor_gold || 'Gold', (val) => {
                    goldInfo.obj[goldInfo.key] = parseInt(val) || 0;
                }, originalGoldVal);
                row.style.gridColumn = '1 / -1';
                row.style.maxWidth = '300px';
                grid.appendChild(row);
            }
        } else if (['items', 'weapons', 'armors'].includes(state.activeTab) && root) {
            renderInventory(party || root, state.activeTab, state.currentMetadata[state.activeTab], grid, originalParty || originalRoot);
        } else if (state.activeTab === 'variables' && variables) {
            renderBitset(variables, state.currentMetadata.variables, grid, (id, val, newVal) => {
                const num = Number(newVal);
                variables[id] = isNaN(num) ? newVal : num;
            }, true, originalVariables);
        } else if (state.activeTab === 'switches' && switches) {
            renderBitset(switches, state.currentMetadata.switches, grid, (id, val, newVal) => {
                switches[id] = newVal;
            }, false, originalSwitches);
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

    function renderInventory(target, key, metaSource, grid, originalTarget) {
        const actualKey = target['_' + key] !== undefined ? '_' + key : key;
        const items = engine.extractData(target[actualKey]);
        const originalItems = originalTarget ? engine.extractData(originalTarget[actualKey]) : null;
        
        if (!items || typeof items !== 'object') return;

        // Collect all potential item IDs
        const allIds = new Set();
        
        // Add items currently in save
        Object.keys(items).forEach(id => {
            if (id.startsWith('@') || id === '@c') return;
            allIds.add(id);
        });

        // Add items from metadata database if showEmpty is checked
        if (state.showEmpty) {
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
            const originalVal = originalItems && originalItems[id] !== undefined ? originalItems[id] : undefined;
            
            // If showEmpty is unchecked, hide items with quantity <= 0
            if (!state.showEmpty && val <= 0) return;

            const meta = metaSource[id] || { name: `${key.slice(0,-1)} #${id}` };
            const translated = translator.translationCache[meta.name];
            
            if (!engine.matchesQuery(id, val, meta.name) && !engine.matchesQuery(id, val, translated)) return;

            const row = UIComponents.createDataRow(id, val, meta.name, (newVal) => {
                const parsedVal = parseInt(newVal) || 0;
                if (parsedVal === 0 && !state.showEmpty) {
                    delete items[id]; // Delete if value is 0 and showEmpty is false to keep save file clean
                } else {
                    items[id] = parsedVal;
                }
            }, originalVal);
            attachSaveEditorTooltip(row, () => ({ title: meta.name }));
            grid.appendChild(row);
        });
    }

    function renderBitset(data, metaSource, grid, onUpdate, isNumeric, originalData) {
        const raw = engine.extractData(data);
        const originalRaw = originalData ? engine.extractData(originalData) : null;
        
        const process = (id, val) => {
            if (id == 0 || id === '0' || id === '@c') return;
            const name = metaSource[id] || `ID #${id}`;
            const translated = translator.translationCache[name];
            
            const isNamed = metaSource[id] && metaSource[id].trim() !== '';
            const isUninitialized = val === undefined || val === null || val === '';
            const isZeroOrFalse = isNumeric ? val === 0 : val === false;

            // Important variables for specific games
            const isImportant = state.activeTab === 'variables' && [12, 15, 16, 17, 18, 19, 20, 21, 25, 26, 61, 62, 63, 64, 65, 66].includes(Number(id));

            if (!state.showEmpty) {
                // Always hide truly uninitialized/blank values if showEmpty is false,
                // UNLESS showImportant is enabled and the variable is marked important.
                if (isUninitialized) {
                    if (!state.showImportant || !isImportant) return;
                }
                // For zero/false values, hide them if they are not named.
                // If showImportant is enabled, we keep important zero/false values visible.
                const treatAsImportant = state.showImportant && isImportant;
                if (isZeroOrFalse && !isNamed && !treatAsImportant) return;
            }

            if (!engine.matchesQuery(id, val, name) && !engine.matchesQuery(id, val, translated)) return;

            const originalVal = originalRaw && originalRaw[id] !== undefined ? originalRaw[id] : undefined;

            if (isNumeric) {
                const row = UIComponents.createDataRow(id, val, name, (nv) => onUpdate(id, val, nv), originalVal);
                attachSaveEditorTooltip(row, () => ({ title: name }));
                grid.appendChild(row);
            } else {
                const row = document.createElement('div');
                row.className = 'data-row checkbox-row';
                
                let deltaHTML = '';
                if (originalVal !== undefined && originalVal !== val) {
                    deltaHTML = `<span class="data-delta" style="font-size:0.85em; font-weight:bold; color:#fbbf24; margin-left:auto;">(was: ${originalVal})</span>`;
                }
                
                row.innerHTML = `
                    <span class="data-id">#${id}</span>
                    <label class="data-label" title="${name}">${name}</label>
                    ${deltaHTML}
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

    return {
        setupTabs,
        renderTabContent
    };
}
