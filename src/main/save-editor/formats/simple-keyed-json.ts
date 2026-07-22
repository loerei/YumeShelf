import * as fs from 'node:fs/promises';
import * as path from 'node:path';

class SimpleKeyedJsonFormat {
    keyCache: Map<string, string>;

    constructor() {
        this.keyCache = new Map();
    }

    match(fileName: string): boolean {
        return fileName.toLowerCase().endsWith('.json') && fileName.toLowerCase().includes('savedata');
    }

    async decode(rawData: Buffer, paths: any, fileName: string): Promise<any> {
        const str = rawData.toString('utf8').trim();
        
        // If it already looks like JSON, it's not our format
        if (str.startsWith('{')) {
            return JSON.parse(str);
        }

        // 1. Reverse the string
        const reversed = str.split('').reverse().join('');
        
        // 2. Base64 Decode
        let decoded: string;
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
            console.log(`[KEYED-JSON] Detected secret key length: ${secretKey.length}`);
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

    async encode(jsonData: any, paths: any, fileName: string): Promise<Buffer> {
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

    async discoverKeyFromGame(exeDir: string): Promise<string | undefined> {
        try {
            const entries = await fs.readdir(exeDir);
            const dataDir = entries.find(e => e.toLowerCase().endsWith('_data'));
            if (!dataDir) return undefined;

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
        return undefined;
    }
}

const format = new SimpleKeyedJsonFormat();
export default format;
