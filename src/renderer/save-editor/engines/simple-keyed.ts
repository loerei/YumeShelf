// @ts-nocheck

/**
 * Simple Keyed JSON Save Engine Strategy
 * Supports flat or slightly nested JSON structures typically found in 
 * independent Unity or custom engine games using a keyed-Base64 scheme.
 */
export class SimpleKeyedEngine {
    /**
     * @param {any} saveData
     * @returns {boolean}
     */
    detect(saveData) {
        if (!saveData) return false;
        return saveData.$type === 'SimpleKeyedSave';
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
        if (!root) return tabs;

        // Common tabs for independent games
        tabs.push({ id: 'variables', label: d.save_editor_variables || 'Variables', i18n: 'save_editor_variables' });
        
        const hasSwitches = Object.values(root).some(v => typeof v === 'boolean');
        if (hasSwitches) {
            tabs.push({ id: 'switches', label: d.save_editor_switches || 'Switches', i18n: 'save_editor_switches' });
        }

        if (root.items && Array.isArray(root.items)) {
            tabs.push({ id: 'items', label: d.save_editor_items || 'Items', i18n: 'save_editor_items' });
        }

        return tabs;
    }

    /**
     * Adapts the flat JSON structure to section-based requests.
     * @param {any} obj
     * @param {string} prop
     * @returns {any}
     */
    getProp(obj, prop) {
        if (!obj) return null;

        if (prop === 'variables') {
            return new Proxy(obj, {
                get(target, key) {
                    if (key === 'toJSON' || typeof key === 'symbol') return target[key];
                    return target[key];
                },
                set(target, key, value) {
                    const current = target[key];
                    if (typeof current === 'number') {
                        target[key] = Number(value);
                    } else {
                        target[key] = value;
                    }
                    return true;
                },
                ownKeys(target) {
                    return Object.keys(target).filter(k => {
                        if (k.startsWith('$') || k === '_userMappings') return false;
                        const val = target[k];
                        return typeof val === 'number' || typeof val === 'string';
                    });
                },
                getOwnPropertyDescriptor(target, key) {
                    return { enumerable: true, configurable: true, writable: true };
                }
            });
        }

        if (prop === 'switches') {
            return new Proxy(obj, {
                get(target, key) {
                    return target[key];
                },
                set(target, key, value) {
                    target[key] = Boolean(value);
                    return true;
                },
                ownKeys(target) {
                    return Object.keys(target).filter(k => typeof target[k] === 'boolean');
                },
                getOwnPropertyDescriptor(target, key) {
                    return { enumerable: true, configurable: true, writable: true };
                }
            });
        }

        if (prop === 'items') {
            // Handle SweetDependency style items array: [{itemName: '...', quantity: 1}, ...]
            if (Array.isArray(obj.items)) {
                return new Proxy(obj.items, {
                    get(target, key) {
                        if (key === 'toJSON' || typeof key === 'symbol') return target[key];
                        // If key is a string (ID/ItemName), find it in array
                        const item = target.find(i => i.itemName === key);
                        return item ? item.quantity : undefined;
                    },
                    set(target, key, value) {
                        let item = target.find(i => i.itemName === key);
                        if (!item) {
                            item = { itemName: key, quantity: 0 };
                            target.push(item);
                        }
                        item.quantity = Number(value);
                        return true;
                    },
                    deleteProperty(target, key) {
                        const idx = target.findIndex(i => i.itemName === key);
                        if (idx !== -1) target.splice(idx, 1);
                        return true;
                    },
                    ownKeys(target) {
                        return target.map(i => i.itemName);
                    },
                    getOwnPropertyDescriptor(target, key) {
                        return { enumerable: true, configurable: true, writable: true };
                    }
                });
            }
            return obj.items || null;
        }

        return obj[prop];
    }

    /**
     * @param {any} root
     * @returns {{ obj: any; key: string; val: any } | null}
     */
    findGold(root) {
        if (!root) return null;
        const keys = ['money', 'gold', 'moneypoint', 'credit', 'credits'];
        for (const k of keys) {
            if (root[k] !== undefined) {
                return { obj: root, key: k, val: root[k] };
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
