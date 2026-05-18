/**
 * Ren'Py Save Engine Strategy
 * Supports .save decoded state structures (dictionary of store.* variables)
 */
export class RenpyEngine {
    detect(saveData) {
        if (!saveData) return false;
        return saveData.$type === 'RenpySave';
    }

    extractRoot(save) {
        return save || null;
    }

    getTabs(root, d) {
        const tabs = [];
        
        // Always include Gold if available
        if (this.findGold(root)) {
            tabs.push({ id: 'gold', label: d.save_editor_gold || 'Gold', i18n: 'save_editor_gold' });
        }
        
        // Scan for prefixes
        const prefixes = this._getPrefixes(root);
        for (const prefix of prefixes) {
            tabs.push({ id: `prefix_${prefix}`, label: prefix });
        }
        
        // Always include general variables tab
        tabs.push({ id: 'variables', label: d.save_editor_variables || 'Variables', i18n: 'save_editor_variables' });
        
        return tabs;
    }

    _getPrefixes(root) {
        if (!root) return [];
        const counts = {};
        for (const key of Object.keys(root)) {
            if (!key.startsWith('store.') || key.startsWith('store._') || key === '$type') continue;
            const match = key.match(/^store\.([a-zA-Z0-9]+)_/);
            if (match) {
                const prefix = match[1];
                counts[prefix] = (counts[prefix] || 0) + 1;
            }
        }
        // Return prefixes with at least 3 occurrences
        return Object.keys(counts).filter(p => counts[p] >= 3).sort();
    }

    getProp(obj, prop) {
        if (!obj) return null;
        
        // Return a proxy that wraps variables when 'variables' is requested
        if (prop === 'variables') {
            const prefixes = this._getPrefixes(obj);
            return new Proxy(obj, {
                get(target, key) {
                    if (key === 'toJSON' || typeof key === 'symbol') return target[key];
                    return target[key];
                },
                set(target, key, value) {
                    target[key] = value;
                    return true;
                },
                ownKeys(target) {
                    // Filter out internal variables ($type, _userMappings, store._)
                    // and variables belonging to dynamic prefix tabs
                    return Object.keys(target).filter(k => {
                        if (!k.startsWith('store.') || k.startsWith('store._') || k === '$type') return false;
                        
                        // Exclude keys belonging to dynamic prefix tabs
                        const match = k.match(/^store\.([a-zA-Z0-9]+)_/);
                        if (match && prefixes.includes(match[1])) {
                            return false;
                        }
                        
                        return true;
                    });
                },
                getOwnPropertyDescriptor(target, key) {
                    return { enumerable: true, configurable: true, writable: true };
                }
            });
        }

        return null;
    }

    findGold(root) {
        if (!root) return null;
        // Search for typical currency keys in the store
        const currencyKeys = ['store.money', 'store.cash', 'store.gold', 'store.savings_account'];
        for (const key of currencyKeys) {
            if (root[key] !== undefined) {
                return { obj: root, key: key, val: root[key] };
            }
        }
        return null;
    }

    extractData(obj) {
        return obj || null;
    }
}
