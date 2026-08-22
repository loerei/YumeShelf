// @ts-nocheck

/**
 * Ren'Py Save Engine Strategy
 * Supports .save decoded state structures (dictionary of store.* variables)
 */
export class RenpyEngine {
    /**
     * @param {any} saveData
     * @returns {boolean}
     */
    detect(saveData) {
        if (!saveData) return false;
        return saveData.$type === 'RenpySave';
    }

    /**
     * @param {any} save
     * @returns {any}
     */
    extractRoot(save) {
        return save || null;
    }

    /**
     * @param {any} root
     * @param {any} d - Translations dictionary
     * @returns {Array<{ id: string; label: string; i18n?: string }> | null}
     */
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

    /**
     * Scans store keys for common prefixes (e.g. `store.prefix_varname`) that
     * appear ≥3 times, to group them into dedicated tabs.
     * @param {any} root
     * @returns {string[]}
     */
    _getPrefixes(root) {
        if (!root) return [];
        /** @type {Record<string, number>} */
        const counts = {};
        for (const key of Object.keys(root)) {
            if (!key.startsWith('store.') || key.startsWith('store._') || key === '$type') continue;
            const match = /^store\.([a-zA-Z0-9]+)_/.exec(key);
            if (match) {
                const prefix = match[1];
                counts[prefix] = (counts[prefix] || 0) + 1;
            }
        }
        // Return prefixes with at least 3 occurrences
        return Object.keys(counts).filter(p => counts[p] >= 3).sort((a, b) => a.localeCompare(b));
    }

    /**
     * Returns a Proxy over the root object that exposes store keys filtered to
     * the requested logical group (`variables` or a prefix tab id).
     * @param {any} obj
     * @param {string} prop
     * @returns {any}
     */
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
                        const match = /^store\.([a-zA-Z0-9]+)_/.exec(k);
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

        if (typeof prop === 'string' && prop.startsWith('prefix_')) {
            const prefix = prop.substring(7);
            const prefixPattern = new RegExp(`^store\\.${prefix}_`);
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
                    return Object.keys(target).filter(k => prefixPattern.test(k));
                },
                getOwnPropertyDescriptor(target, key) {
                    return { enumerable: true, configurable: true, writable: true };
                }
            });
        }

        return null;
    }

    /**
     * Searches for a common currency key in the Ren'Py store namespace.
     * @param {any} root
     * @param {any} [_party] - Unused in Ren'Py engine; present for interface compatibility.
     * @returns {{ obj: any; key: string; val: any } | null}
     */
    findGold(root, _party) {
        if (!root) return null;
        // Search for typical currency keys in the store
        const currencyKeys = [
            'store.money',
            'store.cash',
            'store.gold',
            'store.yen',
            'store.coins',
            'store.points',
            'store.savings_account',
            'store.wallet',
            'store.credits'
        ];
        for (const key of currencyKeys) {
            if (root[key] !== undefined) {
                return { obj: root, key, val: root[key] };
            }
        }
        return null;
    }

    /**
     * @param {any} obj
     * @returns {any}
     */
    extractData(obj) {
        return obj || null;
    }
}
