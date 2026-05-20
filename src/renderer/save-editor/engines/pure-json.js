// @ts-check

/**
 * Pure JSON Save Engine Strategy
 * Supports raw .json save files (e.g. Living with a Little Fox Girl)
 */
export class PureJsonEngine {
    /**
     * @param {any} saveData
     * @returns {boolean}
     */
    detect(saveData) {
        if (!saveData) return false;
        return saveData.$type === 'PureJsonSave';
    }

    /**
     * @param {any} save
     * @returns {any}
     */
    extractRoot(save) {
        return save || null;
    }

    /**
     * Scans the root for numeric/string and boolean values to determine which
     * tabs to offer (Variables and/or Switches).
     * @param {any} root
     * @param {any} d - Translations dictionary
     * @returns {Array<{ id: string; label: string; i18n?: string }> | null}
     */
    getTabs(root, d) {
        const tabs = [];

        // Scan keys to see if switches or variables exist
        let hasVariables = false;
        let hasSwitches = false;

        if (root) {
            const paths = this._getDeepPaths(root);
            for (const path of paths) {
                const val = this._getDeep(root, path);
                if (typeof val === 'boolean') {
                    hasSwitches = true;
                } else if (typeof val === 'number' || typeof val === 'string') {
                    hasVariables = true;
                }
            }
        }

        if (hasVariables) {
            tabs.push({ id: 'variables', label: d.save_editor_variables || 'Variables', i18n: 'save_editor_variables' });
        }
        if (hasSwitches) {
            tabs.push({ id: 'switches', label: d.save_editor_switches || 'Switches', i18n: 'save_editor_switches' });
        }

        return tabs;
    }

    /**
     * Returns a Proxy view of the root object filtered to the logical section
     * requested (`variables` — numerics/strings, or `switches` — booleans).
     * @param {any} obj
     * @param {string} prop
     * @returns {any}
     */
    getProp(obj, prop) {
        if (!obj) return null;
        const self = this;

        if (prop === 'variables') {
            return new Proxy(obj, {
                get(target, key) {
                    if (key === 'toJSON' || typeof key === 'symbol') return target[key];
                    return self._getDeep(target, /** @type {string} */(key));
                },
                set(target, key, value) {
                    const currentVal = self._getDeep(target, /** @type {string} */(key));
                    if (typeof currentVal === 'number') {
                        const num = Number(value);
                        self._setDeep(target, /** @type {string} */(key), isNaN(num) ? value : num);
                    } else {
                        self._setDeep(target, /** @type {string} */(key), value);
                    }
                    return true;
                },
                ownKeys(target) {
                    return self._getDeepPaths(target).filter(key => {
                        const val = self._getDeep(target, key);
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
                    if (key === 'toJSON' || typeof key === 'symbol') return target[key];
                    return self._getDeep(target, /** @type {string} */(key));
                },
                set(target, key, value) {
                    self._setDeep(target, /** @type {string} */(key), Boolean(value));
                    return true;
                },
                ownKeys(target) {
                    return self._getDeepPaths(target).filter(key => {
                        const val = self._getDeep(target, key);
                        return typeof val === 'boolean';
                    });
                },
                getOwnPropertyDescriptor(target, key) {
                    return { enumerable: true, configurable: true, writable: true };
                }
            });
        }

        return null;
    }

    /**
     * Pure JSON does not have a gold concept.
     * @returns {null}
     */
    findGold() {
        return null;
    }

    /**
     * @param {any} obj
     * @returns {any}
     */
    extractData(obj) {
        return obj || null;
    }

    /**
     * Traverses a dot-notation path into a nested object.
     * @param {any} obj
     * @param {string} path - Dot-separated key path (e.g. `"a.b.0"`)
     * @returns {any}
     */
    _getDeep(obj, path) {
        const parts = path.split('.');
        let current = obj;
        for (const part of parts) {
            if (current === null || current === undefined) return undefined;
            current = current[part];
        }
        return current;
    }

    /**
     * Writes a value into a nested object at the given dot-notation path,
     * creating missing intermediate nodes as needed.
     * @param {any} obj
     * @param {string} path - Dot-separated key path
     * @param {any} value
     * @returns {boolean}
     */
    _setDeep(obj, path, value) {
        const parts = path.split('.');
        let current = obj;
        for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i];
            if (current[part] === undefined || current[part] === null) {
                const nextPart = parts[i + 1];
                current[part] = /^\d+$/.test(nextPart) ? [] : {};
            }
            current = current[part];
        }
        const lastPart = parts[parts.length - 1];
        current[lastPart] = value;
        return true;
    }

    /**
     * Recursively enumerates all leaf paths in a nested object, returning an
     * array of dot-separated path strings.
     * @param {any} obj
     * @param {string} [prefix]
     * @returns {string[]}
     */
    _getDeepPaths(obj, prefix = '') {
        /** @type {string[]} */
        let paths = [];
        if (obj === null || obj === undefined) return paths;

        if (Array.isArray(obj)) {
            obj.forEach((val, idx) => {
                const path = prefix ? `${prefix}.${idx}` : `${idx}`;
                if (typeof val === 'object' && val !== null) {
                    paths = paths.concat(this._getDeepPaths(val, path));
                } else {
                    paths.push(path);
                }
            });
        } else if (typeof obj === 'object') {
            for (const [key, val] of Object.entries(obj)) {
                if (key === '$type' || key === '_userMappings') continue;
                const path = prefix ? `${prefix}.${key}` : key;
                if (typeof val === 'object' && val !== null) {
                    paths = paths.concat(this._getDeepPaths(val, path));
                } else {
                    paths.push(path);
                }
            }
        }
        return paths;
    }
}

