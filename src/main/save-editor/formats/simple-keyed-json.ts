import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { YumeEngine } from '@yumeshelf/engine';

class SimpleKeyedJsonFormat {
    keyCache: Map<string, string>;

    constructor() {
        this.keyCache = new Map();
    }

    match(fileName: string): boolean {
        return fileName.toLowerCase().endsWith('.json') && fileName.toLowerCase().includes('savedata');
    }

    async decode(rawData: Buffer, paths: any, fileName: string): Promise<any> {
        return YumeEngine.decodeSaveFile('keyed-json', rawData, {
            fileName,
            options: { exeDir: paths?.exeDir }
        });
    }

    async encode(jsonData: any, paths: any, fileName: string): Promise<Buffer> {
        return YumeEngine.encodeSaveFile('keyed-json', jsonData, {
            fileName,
            options: { exeDir: paths?.exeDir }
        });
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
                    return match[0].replaceAll('\0', '');
                }
            } catch {
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
