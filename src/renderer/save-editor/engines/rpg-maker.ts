// @ts-nocheck

/**
 * RPG Maker Save Engine Strategy
 * Handles MV, MZ, VX Ace save formats.
 */
export class RpgMakerEngine {
    /**
     * @param {any} saveData
     * @returns {boolean}
     */
    detect(saveData) {
        if (!saveData) return false;

        // Sniff typical RPG Maker properties at top level or root contents
        if (saveData.contents && typeof saveData.contents === 'object') return true;
        if (saveData.data && typeof saveData.data === 'object') return true;
        if (saveData.actors || saveData._actors) return true;
        if (saveData.system || saveData._system) return true;

        return false;
    }

    /**
     * @param {any} save
     * @returns {any}
     */
    extractRoot(save) {
        if (!save) return null;
        if (save.contents && typeof save.contents === 'object') return save.contents;
        if (save.data && typeof save.data === 'object' && !save.data['@a']) return save.data;
        return save;
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
     * Retrieves a property from the save root, matching case-insensitively
     * and with or without a leading underscore.
     * @param {any} obj
     * @param {string} prop
     * @returns {any}
     */
    getProp(obj, prop) {
        if (!obj) return null;
        const p = prop.toLowerCase();
        const keys = Object.keys(obj);
        const match = keys.find(k => k === p || k === '_' + p || k.toLowerCase() === p || k.toLowerCase() === '_' + p);
        return match ? obj[match] : null;
    }

    /**
     * Resolves the location of gold in the save data.
     * @param {any} root
     * @param {any} [party]
     * @returns {{ obj: any; key: string; val: any } | null}
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
     * Recursively unwraps engine-specific data arrays from the save object.
     * @param {any} obj
     * @returns {any}
     */
    extractData(obj) {
        if (!obj) return null;
        if (obj._data !== undefined) return this.extractData(obj._data);
        if (obj.data !== undefined) return this.extractData(obj.data);
        if (obj['@a'] !== undefined) return obj['@a'];
        return obj;
    }
}
