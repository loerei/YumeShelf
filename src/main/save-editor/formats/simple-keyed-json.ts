// @ts-nocheck
const fs = require('fs/promises');
const path = require('path');

/**
 * Universal format handler for keyed/reversed Base64 JSON saves.
 * Commonly used by certain Unity and independent engine games.
 * Scheme: SecretKey + JSON -> Base64 -> Reverse String.
 */
class SimpleKeyedJsonFormat {
    constructor() {
        /** @type {Map<string, string>} */
        this.keyCache = new Map();
    }

    /**
     * Matches SaveData_XX.json or any JSON file that doesn't start with a brace.
     * @param {string} fileName 
     */
    match(fileName) {
        return fileName.toLowerCase().endsWith('.json') && fileName.toLowerCase().includes('savedata');
    }

    /**
     * @param {Buffer} rawData 
     * @param {import('../../../shared/types/save-editor').GamePaths} paths 
     * @param {string} fileName 
     */
    async decode(rawData, paths, fileName) {
        const str = rawData.toString('utf8').trim();
        
        // If it already looks like JSON, it's not our format
        if (str.startsWith('{')) {
            return JSON.parse(str);
        }

        // 1. Reverse the string
        const reversed = str.split('').reverse().join('');
        
        // 2. Base64 Decode
        let decoded;
        try {
            decoded = Buffer.from(reversed, 'base64').toString('utf8');
        } catch (e) {
            return JSON.parse(str);
        }

        // 3. Extract Key and JSON
        // The format can have the SecretKey at the start, the end, or both.
        // We extract everything between the first and last braces/brackets.
        const firstBrace = decoded.indexOf('{');
        const firstBracket = decoded.indexOf('[');
        let firstIndex = -1;
        let lastIndex = -1;

        if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
            firstIndex = firstBrace;
            lastIndex = decoded.lastIndexOf('}');
        } else if (firstBracket !== -1) {
            firstIndex = firstBracket;
            lastIndex = decoded.lastIndexOf(']');
        }

        if (firstIndex === -1 || lastIndex === -1 || firstIndex > lastIndex) {
            return JSON.parse(str);
        }

        const jsonPart = decoded.substring(firstIndex, lastIndex + 1);
        const secretKey = decoded.substring(0, firstIndex);

        if (secretKey) {
            this.keyCache.set(paths.exeDir, secretKey);
            console.log(`[KEYED-JSON] Detected secret key: "${secretKey}"`);
        }

        try {
            const json = JSON.parse(jsonPart);
            if (json && typeof json === 'object') {
                json.$type = 'SimpleKeyedSave';
            }
            return json;
        } catch (e) {
            console.warn(`[KEYED-JSON] JSON parse failed after extraction. Content: ${jsonPart.substring(0, 50)}...`);
            return JSON.parse(str);
        }
    }

    /**
     * @param {any} jsonData 
     * @param {import('../../../shared/types/save-editor').GamePaths} paths 
     * @param {string} fileName 
     */
    async encode(jsonData, paths, fileName) {
        let key = this.keyCache.get(paths.exeDir);
        
        // Universal key discovery from game files if not cached
        if (!key) {
            key = await this.discoverKeyFromGame(paths.exeDir);
        }

        // Fallback
        if (!key) {
            key = 'MyGameKey2025';
        }

        const jsonStr = JSON.stringify(jsonData);
        // We wrap the JSON in the key on both sides to be safe
        const payload = key + jsonStr + key;
        
        // 1. Base64 Encode
        const base64 = Buffer.from(payload, 'utf8').toString('base64');
        
        // 2. Reverse
        const final = base64.split('').reverse().join('');
        
        return Buffer.from(final, 'utf8');
    }

    /**
     * Attempts to find a secret key pattern from the game's assembly.
     * @param {string} exeDir 
     */
    async discoverKeyFromGame(exeDir) {
        try {
            const entries = await fs.readdir(exeDir);
            const dataDir = entries.find(e => e.toLowerCase().endsWith('_data'));
            if (!dataDir) return null;

            const dllPath = path.join(exeDir, dataDir, 'Managed', 'Assembly-CSharp.dll');
            try {
                await fs.access(dllPath);
                const buffer = await fs.readFile(dllPath);
                const content = buffer.toString('binary');
                
                // Search for "MyGameKey" style UTF-16 strings
                const match = content.match(/M\0y\0G\0a\0m\0e\0K\0e\0y\0[A-Za-z0-9\0]+/);
                if (match) {
                    return match[0].replace(/\0/g, '');
                }
            } catch (e) {
                // ignore
            }
        } catch (err) {
            console.warn('[KEYED-JSON] Key discovery failed:', err);
        }
        return null;
    }
}

module.exports = new SimpleKeyedJsonFormat();
