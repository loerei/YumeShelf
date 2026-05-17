/**
 * RPG Maker Save Engine Strategy
 * Handles MV, MZ, VX Ace save formats.
 */
export class RpgMakerEngine {
    detect(saveData) {
        if (!saveData) return false;
        
        // Sniff typical RPG Maker properties at top level or root contents
        if (saveData.contents && typeof saveData.contents === 'object') return true;
        if (saveData.data && typeof saveData.data === 'object') return true;
        if (saveData.actors || saveData._actors) return true;
        if (saveData.system || saveData._system) return true;
        
        return false;
    }

    extractRoot(save) {
        if (!save) return null;
        if (save.contents && typeof save.contents === 'object') return save.contents;
        if (save.data && typeof save.data === 'object' && !save.data['@a']) return save.data;
        return save;
    }

    getProp(obj, prop) {
        if (!obj) return null;
        const p = prop.toLowerCase();
        const keys = Object.keys(obj);
        const match = keys.find(k => k === p || k === '_' + p || k.toLowerCase() === p || k.toLowerCase() === '_' + p);
        return match ? obj[match] : null;
    }

    findGold(root, party) {
        const targets = [party, root, root?.system, root?._system];
        for (const t of targets) {
            if (!t) continue;
            if (t._gold !== undefined) return { obj: t, key: '_gold', val: t._gold };
            if (t.gold !== undefined) return { obj: t, key: 'gold', val: t.gold };
        }
        return null;
    }

    extractData(obj) {
        if (!obj) return null;
        if (obj._data !== undefined) return this.extractData(obj._data);
        if (obj.data !== undefined) return this.extractData(obj.data);
        if (obj['@a'] !== undefined) return obj['@a'];
        return obj;
    }
}
