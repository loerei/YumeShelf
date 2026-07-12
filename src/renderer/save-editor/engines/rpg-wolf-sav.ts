// @ts-nocheck

/**
 * RPG/Wolf RPG .sav binary-inspection renderer strategy.
 *
 * This intentionally exposes inspection data only. The backend preserves raw
 * bytes for roundtrip writes, while semantic edit support can be added later
 * behind this isolated engine/format pair.
 */
export class RpgWolfSavEngine {
    /**
     * @param {any} saveData
     * @returns {boolean}
     */
    detect(saveData) {
        return saveData?.$type === 'RpgWolfSavBinaryInspection';
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
     * @param {any} obj
     * @param {string} prop
     * @returns {any}
     */
    getProp(obj, prop) {
        if (!obj) return null;
        if (prop === 'variables') {
            const vars = obj.variables || {};
            // Inject user mappings if present
            if (obj._userMappings) {
                /** @type {Array<{ offset: string; name: string }>} */
                const mappings = obj._userMappings;
                mappings.forEach(mapping => {
                    vars[mapping.offset] = obj[mapping.name] ?? 0;
                });
            }
            return vars;
        }
        if (prop === 'switches') return obj.switches || null;
        if (prop === 'items') return obj.items || null;
        if (prop === 'weapons') return obj.weapons || null;
        if (prop === 'armors') return obj.armors || null;
        return obj[prop] || null;
    }

    /**
     * Wolf RPG does not expose a gold field via this inspection path.
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
}