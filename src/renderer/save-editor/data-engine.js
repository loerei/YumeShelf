/**
 * Save Editor Data Engine
 * Handles searching, filtering, and RPG Maker save data manipulation logic.
 */

export class DataEngine {
    constructor() {
        this.searchOptions = {
            query: '',
            exact: false,
            searchName: true,
            searchValue: true,
            searchIndex: false,
            switchOnlyTrue: false,
            switchOnlyFalse: false
        };
    }

    setSearchOptions(options) {
        this.searchOptions = { ...this.searchOptions, ...options };
    }

    /**
     * Centralized search helper to check if a record matches current filters
     */
    matchesQuery(id, value, label) {
        const { 
            query, exact, searchName, searchValue, searchIndex, 
            switchOnlyTrue, switchOnlyFalse 
        } = this.searchOptions;
        
        // Boolean filters for switches (AND logic)
        if (switchOnlyTrue && value !== true) return false;
        if (switchOnlyFalse && value !== false) return false;

        if (!query) return true;
        
        const q = query.toLowerCase();
        
        // Search by Index (ID)
        if (searchIndex) {
            const idStr = (id !== null && id !== undefined) ? id.toString() : '';
            if (exact) {
                if (idStr === query) return true;
            } else {
                if (idStr.includes(query)) return true;
            }
        }
        
        // Search by Value
        if (searchValue) {
            const valStr = (value !== null && value !== undefined) ? value.toString() : '';
            if (exact) {
                if (valStr === query) return true;
            } else {
                if (valStr.toLowerCase().includes(q)) return true;
            }
        }
        
        // Search by Name (Label)
        if (searchName) {
            const labStr = (label !== null && label !== undefined) ? label.toString() : '';
            if (labStr.toLowerCase().includes(q)) return true;
        }
        
        return false;
    }

    /**
     * Extracts the root object from various RPG Maker save formats
     */
    extractRoot(save) {
        if (!save) return null;
        if (save.contents && typeof save.contents === 'object') return save.contents;
        if (save.data && typeof save.data === 'object' && !save.data['@a']) return save.data;
        return save;
    }

    /**
     * Safely retrieves property, case and underscore insensitively
     */
    getProp(obj, prop) {
        if (!obj) return null;
        const p = prop.toLowerCase();
        const keys = Object.keys(obj);
        const match = keys.find(k => k === p || k === '_' + p || k.toLowerCase() === p || k.toLowerCase() === '_' + p);
        return match ? obj[match] : null;
    }

    /**
     * Resolves the location of gold inside the RPG Maker save root
     */
    findGold(root, party) {
        const targets = [party, root, root?.system, root?._system];
        for (const t of targets) {
            if (!t) continue;
            if (t._gold !== undefined) return { obj: t, key: '_gold', val: t._gold };
            if (t.gold !== undefined) return { obj: t, key: 'gold', val: t.gold };
        }
        return null;
    }

    /**
     * Unwraps RPG Maker data arrays/objects
     */
    extractData(obj) {
        if (!obj) return null;
        if (obj._data !== undefined) return this.extractData(obj._data);
        if (obj.data !== undefined) return this.extractData(obj.data);
        if (obj['@a'] !== undefined) return obj['@a'];
        return obj;
    }
}
