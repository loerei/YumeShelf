// @ts-nocheck

/**
 * Unity Mono Save Engine Strategy
 * Supports .bin decompiled state structures (001.bin, setting.bin, finfo.bin)
 * using dynamic ES6 Proxy wrappers.
 */
export class UnityMonoEngine {
    /**
     * @param {any} saveData
     * @returns {boolean}
     */
    detect(saveData) {
        if (!saveData) return false;

        // Sniff typical Unity Mono decrypted save signatures
        if (saveData.$type === 'GameStateMachineInfo') return true;
        if (saveData.$type === 'GameGflagMapInfo') return true;
        if (saveData.$type === 'GameSettingInfo') return true;
        if (saveData.bool_map || saveData.int_map || saveData.flag_map) return true;

        return false;
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
     * @param {any} [d]
     * @returns {Array<{ id: string; label: string; i18n?: string }> | null}
     */
    getTabs(root, d) {
        return null;
    }

    /**
     * Returns a Proxy view of the save object for the requested logical section
     * (variables, switches, or items), adapting the underlying Unity save
     * structure to a uniform key/value interface.
     * @param {any} obj
     * @param {string} prop
     * @returns {any}
     */
    getProp(obj, prop) {
        if (!obj) return null;

        // Handle variables request (Numeric settings + int_map + float_map)
        if (prop === 'variables') {
            if (obj.$type === 'GameSettingInfo') {
                return new Proxy(obj, {
                    get(target, key) {
                        if (target[key] !== undefined && typeof target[key] === 'number') return target[key];
                        if (target.int_map?.[key] !== undefined) return target.int_map[key];
                        if (target.float_map?.[key] !== undefined) return target.float_map[key];
                        return undefined;
                    },
                    set(target, key, value) {
                        if (target[key] !== undefined && typeof target[key] === 'number') {
                            target[key] = value;
                            return true;
                        }
                        if (target.int_map) {
                            target.int_map[key] = value;
                            return true;
                        }
                        return false;
                    },
                    ownKeys(target) {
                        /** @type {Set<string>} */
                        const keys = new Set();
                        for (const [k, v] of Object.entries(target)) {
                            if (typeof v === 'number') keys.add(k);
                        }
                        if (target.int_map) {
                            Object.keys(target.int_map).forEach(k => keys.add(k));
                        }
                        return Array.from(keys);
                    },
                    getOwnPropertyDescriptor(target, key) {
                        return { enumerable: true, configurable: true, writable: true };
                    }
                });
            }
            return obj.int_map || null;
        }

        // Handle switches request (bool_map or flag_map CGs array)
        if (prop === 'switches') {
            if (obj.$type === 'GameGflagMapInfo') {
                const targetArray = obj.flag_map || [];
                return new Proxy(targetArray, {
                    get(target, key) {
                        if (key === 'toJSON' || typeof key === 'symbol') return target[key];
                        if (typeof key === 'string') {
                            return target.includes(key);
                        }
                        return target[key];
                    },
                    set(target, key, value) {
                        if (typeof key === 'string') {
                            const idx = target.indexOf(key);
                            if (value) {
                                if (idx === -1) target.push(key);
                            } else {
                                if (idx !== -1) target.splice(idx, 1);
                            }
                            return true;
                        }
                        return false;
                    },
                    ownKeys(target) {
                        const flags = [...target];
                        // Auto-populate standard known gl/CG flags so they easily render in UI
                        for (let i = 1; i <= 34; i++) {
                            const f = `gl/CG${i}`;
                            const f2 = `gl/CG0${i}`;
                            if (!flags.includes(f)) flags.push(f);
                            if (i < 10 && !flags.includes(f2)) flags.push(f2);
                        }
                        return flags;
                    },
                    getOwnPropertyDescriptor(target, key) {
                        return { enumerable: true, configurable: true, writable: true };
                    }
                });
            }

            if (obj.$type === 'GameSettingInfo') {
                return new Proxy(obj, {
                    get(target, key) {
                        if (target[key] !== undefined && typeof target[key] === 'boolean') return target[key];
                        if (target.bool_map && target.bool_map[key] !== undefined) return target.bool_map[key];
                        return undefined;
                    },
                    set(target, key, value) {
                        if (target[key] !== undefined && typeof target[key] === 'boolean') {
                            target[key] = value;
                            return true;
                        }
                        if (target.bool_map) {
                            target.bool_map[key] = value;
                            return true;
                        }
                        return false;
                    },
                    ownKeys(target) {
                        /** @type {Set<string>} */
                        const keys = new Set();
                        for (const [k, v] of Object.entries(target)) {
                            if (typeof v === 'boolean') keys.add(k);
                        }
                        if (target.bool_map) {
                            Object.keys(target.bool_map).forEach(k => keys.add(k));
                        }
                        return Array.from(keys);
                    },
                    getOwnPropertyDescriptor(target, key) {
                        return { enumerable: true, configurable: true, writable: true };
                    }
                });
            }

            return obj.bool_map || null;
        }

        // Handle inventory items request (int_map items with inventory/ prefix)
        if (prop === 'items') {
            if (!obj.int_map) return null;
            return new Proxy(obj.int_map, {
                get(target, key) {
                    if (key === 'toJSON' || typeof key === 'symbol') return target[key];
                    return target[key];
                },
                set(target, key, value) {
                    target[key] = value;
                    return true;
                },
                deleteProperty(target, key) {
                    delete target[key];
                    return true;
                },
                ownKeys(target) {
                    return Object.keys(target).filter(k => k.startsWith('inventory/'));
                },
                getOwnPropertyDescriptor(target, key) {
                    return { enumerable: true, configurable: true, writable: true };
                }
            });
        }

        return obj[prop] || null;
    }

    /**
     * Searches for a gold/moneypoint field in the Unity save object.
     * @param {any} root
     * @param {any} [_party] - Unused; present for interface compatibility.
     * @returns {{ obj: any; key: string; val: any } | null}
     */
    findGold(root, _party) {
        if (!root) return null;
        const maps = [root.int_map, root];
        for (const m of maps) {
            if (!m) continue;
            if (m.moneypoint !== undefined) {
                return { obj: m, key: 'moneypoint', val: m.moneypoint };
            }
            if (m.gold !== undefined) {
                return { obj: m, key: 'gold', val: m.gold };
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

