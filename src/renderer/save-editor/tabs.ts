// @ts-nocheck

export function setupTabs(context) {
    const { refs, state, engine } = context;
    const { overlay, content, tabsContainer } = refs;
    const d = state.d || {};
    tabsContainer.innerHTML = '';
    
    const root = engine.extractRoot(state.currentSaveData);
    const party = root ? (root.party || root._party || engine.getProp(root, 'party')) : null;
    const variables = root ? (root.variables || root._variables || engine.getProp(root, 'variables')) : null;
    const switches = root ? (root.switches || root._switches || engine.getProp(root, 'switches')) : null;

    /**
     * @param {string} tabId
     * @returns {boolean}
     */
    const hasCategoryData = (tabId) => {
        if (!root) return false;
        if (tabId === 'pinned') {
            return !!(state.pinnedVariables && state.pinnedVariables.size > 0);
        }
        if (tabId.startsWith('prefix_')) {
            return true;
        }
        if (tabId === 'gold') {
            return !!engine.findGold(root, party);
        }
        if (['items', 'weapons', 'armors'].includes(tabId)) {
            const target = party || root;
            if (!target) return false;
            const actualKey = target['_' + tabId] === undefined ? tabId : '_' + tabId;
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

    /** @type {Array<{ id: string; label: string; i18n?: string }> | null} */
    const rawTabs = engine.getTabs ? engine.getTabs(root, d) : null;
    /** @type {Array<{ id: string; label: string; i18n?: string }>} */
    let tabs;
    if (rawTabs) {
        tabs = rawTabs;
    } else {
        tabs = [
            { id: 'gold', label: d.save_editor_gold || 'Gold', i18n: 'save_editor_gold' },
            { id: 'items', label: d.save_editor_items || 'Items', i18n: 'save_editor_items' },
            { id: 'weapons', label: d.save_editor_weapons || 'Weapons', i18n: 'save_editor_weapons' },
            { id: 'armors', label: d.save_editor_armors || 'Armors', i18n: 'save_editor_armors' },
            { id: 'variables', label: d.save_editor_variables || 'Variables', i18n: 'save_editor_variables' },
            { id: 'switches', label: d.save_editor_switches || 'Switches', i18n: 'save_editor_switches' }
        ];
    }

    // Insert pinned tab if there are pinned variables, standing between 'all' and other tabs
    const hasPinned = state.pinnedVariables && state.pinnedVariables.size > 0;
    if (hasPinned) {
        tabs.unshift({ id: 'pinned', label: d.save_editor_pinned || 'Pinned', i18n: 'save_editor_pinned' });
    }

    // Unshift 'all' tab to the front
    tabs.unshift({ id: 'all', label: d.save_editor_all || 'All', i18n: 'save_editor_all' });

    const visibleTabs = tabs.filter(tab => {
        if (tab.id === 'all') return true;
        const hasData = hasCategoryData(tab.id);
        if (!hasData) {
            console.log(`[SAVE-EDITOR] Tab '${tab.id}' has no data, hiding it.`);
        }
        return hasData;
    });

    // Hide 'all' tab if no other categories have data
    const actualVisibleTabs = visibleTabs.filter(t => t.id !== 'all');
    context.activeVisibleTabs = actualVisibleTabs.length > 0 ? visibleTabs : [];

    // Adjust activeTab if the currently active one is now hidden
    if (context.activeVisibleTabs.length > 0 && !context.activeVisibleTabs.some(t => t.id === state.activeTab)) {
        console.log(`[SAVE-EDITOR] Current activeTab '${state.activeTab}' is hidden. Auto-switching to '${context.activeVisibleTabs[0].id}'.`);
        state.activeTab = context.activeVisibleTabs[0].id;
    }

    visibleTabs.forEach(tab => {
        const el = document.createElement('div');
        el.className = `save-tab ${state.activeTab === tab.id ? 'active' : ''}`;
        el.textContent = tab.label;
        el.setAttribute('data-i18n', tab.i18n ?? '');
        el.onclick = () => {
            state.activeTab = tab.id;
            overlay.querySelectorAll('.save-tab').forEach(t => t.classList.remove('active'));
            el.classList.add('active');
            
            // Logic to show Map button if we are in an engine that supports mapping
            const mapBtn = overlay.querySelector('.map-variable-btn');
            if (mapBtn) mapBtn.style.display = (tab.id === 'variables') ? 'block' : 'none';
            
            // Show/hide switch-only filters
            const switchFilters = overlay.querySelectorAll('.switch-filters-only');
            switchFilters.forEach(f => {
                f.style.display = (tab.id === 'switches') ? 'flex' : 'none';
            });
            if (tab.id !== 'switches') {
                // Reset switch filters when leaving the tab
                const sTrue = overlay.querySelector('.switch-true-check');
                if (sTrue) sTrue.checked = false;
                const sFalse = overlay.querySelector('.switch-false-check');
                if (sFalse) sFalse.checked = false;
                engine.setSearchOptions({ switchOnlyTrue: false, switchOnlyFalse: false });
            }

            content.scrollTop = 0;
            if (typeof context.renderTabContent === 'function') {
                context.renderTabContent();
            }
        };
        tabsContainer.appendChild(el);
    });
}
