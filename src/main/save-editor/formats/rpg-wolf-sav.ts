import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { YumeEngine } from '@yumeshelf/engine';

const metadataCache = new Map<string, { dbFile: string | null; mtime: number; customNames: Record<number, string> }>();

class RpgWolfSavFormat {
    match(fileName: string): boolean {
        return YumeEngine.detectSaveStrategy(fileName) === 'wolf-sav';
    }

    async decode(rawData: Buffer, paths: any, fileName: string): Promise<any> {
        console.log(`[WOLF-SAV] decode called for file: ${fileName}, length: ${rawData.length}`);
        const result = await YumeEngine.decodeSaveFile('wolf-sav', rawData, { fileName });
        if (result) {
            result.fileName = fileName;
        }
        return result;
    }

    async encode(jsonData: any): Promise<Buffer> {
        console.log(`[WOLF-SAV] encode called for file: ${jsonData?.fileName}`);
        return YumeEngine.encodeSaveFile('wolf-sav', jsonData);
    }

    async metadata(jsonData: any, paths: any, fileName: string): Promise<any> {
        const metadata: any = {
            variables: {},
            switches: {},
            items: {},
            weapons: {},
            armors: {},
            gameTitle: jsonData?.gameTitle || 'WOLF RPG Game'
        };

        if (!paths?.exeDir) return metadata;
        
        try {
            const dataDir = path.join(paths.exeDir, 'Data', 'BasicData');
            
            async function exists(p: string) { try { await fs.access(p); return true; } catch { return false; } }

            let dbFile: string | null = path.join(dataDir, 'SysDatabase.project');
            if (!(await exists(dbFile))) dbFile = path.join(dataDir, 'SysDataBase.project');
            if (!(await exists(dbFile))) dbFile = path.join(dataDir, 'SysDatabase.dat');
            if (!(await exists(dbFile))) dbFile = path.join(dataDir, 'SysDataBase.dat');
            if (!(await exists(dbFile))) dbFile = null;

            if (dbFile) {
                const stat = await fs.stat(dbFile);
                const currentMtime = stat.mtimeMs;
                const cached = metadataCache.get(paths.exeDir);

                if (cached?.dbFile === dbFile && cached.mtime === currentMtime) {
                    console.log(`[WOLF-SAV] metadata cache hit for: ${paths.exeDir} (${Object.keys(cached.customNames).length} custom names)`);
                    metadata.variables = { ...cached.customNames };
                    return metadata;
                }

                console.log(`[WOLF-SAV] extracting fresh metadata from: ${dbFile}`);
                const buffer = await fs.readFile(dbFile);
                
                // Robust heuristic string extraction
                const strings: string[] = [];
                let currentStr: number[] = [];
                for (const b of buffer) {
                    if ((b >= 0x20 && b <= 0x7E) || b >= 0x80) {
                        currentStr.push(b);
                    } else {
                        if (currentStr.length >= 2) {
                            try {
                                const s = Buffer.from(currentStr).toString('utf8');
                                if (/[^\x00-\x7F]/.test(s) || /[a-zA-Z0-9]/.test(s)) {
                                    strings.push(s);
                                }
                            } catch {}
                        }
                        currentStr = [];
                    }
                }

                // Look for '通常変数名' (Normal Variable Names)
                const customNames: Record<number, string> = {};
                const markerIndex = strings.findIndex(s => s.includes('通常変数名'));
                if (markerIndex !== -1) {
                    for (let i = 0; i < 800; i++) {
                        if (markerIndex + 1 + i < strings.length) {
                            let name = strings[markerIndex + 1 + i];
                            if (name && !name.includes('<なし>') && !name.includes('<変化なし>')) {
                                customNames[i] = name.replaceAll('\0', '').trim();
                            }
                        }
                    }
                }

                metadataCache.set(paths.exeDir, {
                    dbFile,
                    mtime: currentMtime,
                    customNames
                });
                metadata.variables = { ...customNames };
            }
        } catch (e) {
            console.warn('[SAVE-EDITOR] Failed to parse WOLF RPG SysDatabase:', e);
        }

        return metadata;
    }
}

const format = new RpgWolfSavFormat();
export default format;