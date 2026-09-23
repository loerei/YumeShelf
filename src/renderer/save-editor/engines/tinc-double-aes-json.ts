// @ts-nocheck
import { PureJsonEngine } from './pure-json';

/**
 * TINC Double AES JSON Save Engine Strategy
 * Supports 2-tier AES-256-CBC encrypted JSON save files (e.g. Chrono Ecstasy / 314g-on)
 */
export class TincDoubleAesJsonEngine extends PureJsonEngine {
    /**
     * @param {any} saveData
     * @returns {boolean}
     */
    detect(saveData) {
        if (!saveData) return false;
        return saveData.$type === 'TincDoubleAesJsonSave';
    }

    /**
     * Recursively enumerates leaf paths, but strictly isolates root-level traversal
     * to properties prefixed with `data_`, preventing root metadata (creationDate,
     * creationUpdate, etc.) from leaking into editable UI variables/switches.
     * @param {any} obj
     * @param {string} [prefix]
     * @returns {string[]}
     */
    _getDeepPaths(obj, prefix = '') {
        if (prefix) {
            return super._getDeepPaths(obj, prefix);
        }
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
            return [];
        }

        /** @type {string[]} */
        let paths = [];
        for (const [key, val] of Object.entries(obj)) {
            if (key === '$type' || key === '_userMappings' || !key.startsWith('data_')) continue;

            if (typeof val === 'object' && val !== null) {
                paths = paths.concat(super._getDeepPaths(val, key));
            } else {
                paths.push(key);
            }
        }
        return paths;
    }

    /**
     * Scans data_* paths for variables (numeric/string) and switches (boolean).
     * @param {any} root
     * @param {any} d - Translations dictionary
     * @returns {Array<{ id: string; label: string; i18n?: string }> | null}
     */
    getTabs(root, d) {
        const tabs = [];
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
            tabs.push({ id: 'variables', label: d?.save_editor_variables || 'Variables', i18n: 'save_editor_variables' });
        }
        if (hasSwitches) {
            tabs.push({ id: 'switches', label: d?.save_editor_switches || 'Switches', i18n: 'save_editor_switches' });
        }

        return tabs;
    }

    /**
     * Returns a Proxy view delegating to super.getProp, which automatically
     * uses the overridden _getDeepPaths.
     * @param {any} obj
     * @param {string} prop
     * @returns {any}
     */
    getProp(obj, prop) {
        return super.getProp(obj, prop);
    }
}
