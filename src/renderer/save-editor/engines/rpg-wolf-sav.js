/**
 * RPG/Wolf RPG .sav binary-inspection renderer strategy.
 *
 * This intentionally exposes inspection data only. The backend preserves raw
 * bytes for roundtrip writes, while semantic edit support can be added later
 * behind this isolated engine/format pair.
 */
export class RpgWolfSavEngine {
    detect(saveData) {
        return saveData?.$type === 'RpgWolfSavBinaryInspection';
    }

    extractRoot(save) {
        return save || null;
    }

    getProp(obj, prop) {
        if (!obj) return null;
        if (prop === 'variables') {
            const vars = obj.variables || {};
            // Inject user mappings if present
            if (obj._userMappings) {
                obj._userMappings.forEach(mapping => {
                    vars[mapping.offset] = obj[mapping.name] !== undefined ? obj[mapping.name] : 0;
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

    findGold() {
        return null;
    }

    extractData(obj) {
        return obj || null;
    }
}