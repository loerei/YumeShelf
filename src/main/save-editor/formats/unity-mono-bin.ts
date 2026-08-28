import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import { YumeEngine } from '@yumeshelf/engine';

class UnityMonoBinFormat {
    match(fileName: string): boolean {
        return fileName.endsWith('.bin');
    }

    async findAssembly(dir: string): Promise<string | null> {
        try {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            // Check files first in the current directory (for speed)
            for (const entry of entries) {
                if (entry.isFile() && entry.name === 'Assembly-CSharp.dll') {
                    return path.join(dir, entry.name);
                }
            }
            // Then recurse subdirectories
            for (const entry of entries) {
                if (entry.isDirectory() && entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
                    const res = await this.findAssembly(path.join(dir, entry.name));
                    if (res) return res;
                }
            }
        } catch {
            // Ignore directory read errors
        }
        return null;
    }

    async getAssemblyPath(paths: any): Promise<string> {
        let assemblyPath = await this.findAssembly(paths.exeDir);
        if (assemblyPath) return assemblyPath;

        console.log(`[SAVE-EDITOR-UNITY] Assembly-CSharp.dll not found in ${paths.exeDir}. Searching library db fallback...`);

        // Search other games in library_db.json
        try {
            const appDataDir = process.env.APPDATA || path.join(process.env.HOME || '', '.config');
            const dbPath = path.join(appDataDir, 'yumeshelf', 'library_db.json');
            const dbStr = await fs.readFile(dbPath, 'utf8');
            const db = JSON.parse(dbStr);
            for (const game of Object.values(db.games || {}) as any[]) {
                if (game.folderPath) {
                    const candidate = await this.findAssembly(game.folderPath);
                    if (candidate) {
                        console.log(`[SAVE-EDITOR-UNITY] Found fallback Assembly-CSharp.dll in other game: ${candidate}`);
                        return candidate;
                    }
                }
            }
        } catch (err) {
            console.error('[SAVE-EDITOR-UNITY] Fallback assembly search in DB failed:', err);
        }

        throw new Error(`Could not locate Assembly-CSharp.dll under: ${paths.exeDir} or any other game folders. Please make sure Sisters Connect or another Unity Hikari Sky game is installed/scanned.`);
    }

    async decode(rawData: Buffer, paths: any, fileName: string): Promise<any> {
        const assemblyPath = await this.getAssemblyPath(paths);
        return YumeEngine.decodeSaveFile('unity-binary-formatter', rawData, {
            fileName,
            assemblyPath
        });
    }

    async encode(jsonData: any, paths: any, fileName: string): Promise<Buffer> {
        const assemblyPath = await this.getAssemblyPath(paths);
        const originalBin = path.join(paths.saveDir, fileName);
        return YumeEngine.encodeSaveFile('unity-binary-formatter', jsonData, {
            fileName,
            assemblyPath,
            options: {
                originalSavePath: originalBin
            }
        });
    }
}

const format = new UnityMonoBinFormat();
export default format;
