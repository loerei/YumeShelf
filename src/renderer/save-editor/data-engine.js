/**
 * Save Editor Data Engine
 * Handles searching, filtering, and data manipulation logic.
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
     * Sorts and filters data based on the current state
     */
    filterData(data, metadata, type) {
        // This is a placeholder for more complex filtering if needed
        // For now, the UI handles the loop, but we can centralize it here later
        return data;
    }
}
