import { RpgMakerEngine } from './engines/rpg-maker.js';
import { UnityMonoEngine } from './engines/unity-mono.js';
import { RpgWolfSavEngine } from './engines/rpg-wolf-sav.js';
import { RenpyEngine } from './engines/renpy.js';

/**
 * Save Editor Data Engine Orchestrator
 * Detects the appropriate engine strategy and coordinates search, filter, and save data operations.
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

        // Registered engine strategies
        this.engines = [
            new RenpyEngine(),
            new RpgWolfSavEngine(),
            new RpgMakerEngine(),
            new UnityMonoEngine()
        ];

        // Fallback default strategy
        this.activeEngine = this.engines[0];
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
        
        // Relational numeric search support: e.g. ">170", ">=170", "<50", "=10", "!=0"
        const relMatch = query.trim().match(/^(>=|<=|>|<|==|=|!=)\s*(-?\d+(\.\d+)?)$/);
        if (relMatch) {
            const op = relMatch[1];
            const target = parseFloat(relMatch[2]);
            
            const compare = (val, op, targetVal) => {
                switch (op) {
                    case '>': return val > targetVal;
                    case '>=': return val >= targetVal;
                    case '<': return val < targetVal;
                    case '<=': return val <= targetVal;
                    case '=':
                    case '==': return val === targetVal;
                    case '!=': return val !== targetVal;
                    default: return false;
                }
            };

            // Evaluate on index
            if (searchIndex && id !== null && id !== undefined) {
                const numericId = Number(id);
                if (!isNaN(numericId) && compare(numericId, op, target)) {
                    return true;
                }
            }

            // Evaluate on value
            if (searchValue && value !== null && value !== undefined) {
                const numericVal = Number(value);
                if (!isNaN(numericVal) && compare(numericVal, op, target)) {
                    return true;
                }
            }

            return false;
        }

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
     * Auto-detects the engine strategy based on save data characteristics and extracts the root object
     */
        getTabs(root, d) {
        if (this.activeEngine && typeof this.activeEngine.getTabs === 'function') {
            return this.activeEngine.getTabs(root, d);
        }
        return null;
    }

extractRoot(save) {
        if (save) {
            const matched = this.engines.find(e => e.detect(save));
            if (matched) {
                this.activeEngine = matched;
            }
        }
        return this.activeEngine.extractRoot(save);
    }

    /**
     * Safely retrieves property case- and underscore-insensitively from the active engine
     */
    getProp(obj, prop) {
        return this.activeEngine.getProp(obj, prop);
    }

    /**
     * Resolves the location of gold inside the save root from the active engine
     */
    findGold(root, party) {
        return this.activeEngine.findGold(root, party);
    }

    /**
     * Unwraps engine-specific data arrays/objects from the active engine
     */
    extractData(obj) {
        return this.activeEngine.extractData(obj);
    }
}
