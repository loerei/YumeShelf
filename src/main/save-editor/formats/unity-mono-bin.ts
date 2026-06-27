import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';

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
        } catch (err) {
            console.warn(`[SAVE-EDITOR-UNITY] Directory read failed in ${dir}:`, err);
        }
        return null;
    }

    async getAssemblyPath(paths: any): Promise<string> {
        let assemblyPath = await this.findAssembly(paths.exeDir);
        if (assemblyPath) return assemblyPath;

        console.log(`[SAVE-EDITOR-UNITY] Assembly-CSharp.dll not found in ${paths.exeDir}. Searching library db fallback...`);
        
        // Search other games in library_db.json
        try {
            const appDataDir = process.env.APPDATA || '';
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
        
        // If still not found, search the parent VN folder of YumeShelf
        try {
            const vnDir = path.resolve(__dirname, '..', '..', '..', 'YumeShelf', 'VN');
            assemblyPath = await this.findAssembly(vnDir);
            if (assemblyPath) {
                console.log(`[SAVE-EDITOR-UNITY] Found fallback Assembly-CSharp.dll in VN folder: ${assemblyPath}`);
                return assemblyPath;
            }
        } catch (err) {
            console.error('[SAVE-EDITOR-UNITY] Fallback assembly search in VN folder failed:', err);
        }

        throw new Error(`Could not locate Assembly-CSharp.dll under: ${paths.exeDir} or any other game folders. Please make sure Sisters Connect or another Unity Hikari Sky game is installed/scanned.`);
    }

    async decode(rawData: Buffer, paths: any, fileName: string): Promise<any> {
        const assemblyPath = await this.getAssemblyPath(paths);

        const converterDll = path.resolve(__dirname, '..', 'bin', 'ModernSaveConverter.dll');
        const tempIn = path.join(os.tmpdir(), `yumeshelf_dec_${Date.now()}_in.bin`);
        const tempOut = path.join(os.tmpdir(), `yumeshelf_dec_${Date.now()}_out.json`);

        try {
            await fs.writeFile(tempIn, rawData);
            
            // Execute the compiled ModernSaveConverter DLL using dotnet CLI
            const cmd = `dotnet "${converterDll}" to-json "${assemblyPath}" "${tempIn}" "${tempOut}"`;
            console.log(`[SAVE-EDITOR-UNITY] Running decompress command: ${cmd}`);
            execSync(cmd, { windowsHide: true });

            const jsonStr = await fs.readFile(tempOut, 'utf8');
            return JSON.parse(jsonStr.replace(/^\uFEFF/, ''));
        } finally {
            // Cleanup temp files asynchronously
            fs.unlink(tempIn).catch(() => {});
            fs.unlink(tempOut).catch(() => {});
        }
    }

    async encode(jsonData: any, paths: any, fileName: string): Promise<Buffer> {
        const assemblyPath = await this.getAssemblyPath(paths);

        const originalBin = path.join(paths.saveDir, fileName);
        const converterDll = path.resolve(__dirname, '..', 'bin', 'ModernSaveConverter.dll');
        const tempBin = path.join(os.tmpdir(), `yumeshelf_enc_${Date.now()}_out.bin`);
        const tempJson = path.join(os.tmpdir(), `yumeshelf_enc_${Date.now()}_in.json`);

        try {
            // Copy original binary to tempBin to serve as serialization base
            await fs.copyFile(originalBin, tempBin);
            await fs.writeFile(tempJson, JSON.stringify(jsonData, null, 2), 'utf8');

            const cmd = `dotnet "${converterDll}" to-bin "${assemblyPath}" "${tempBin}" "${tempJson}"`;
            console.log(`[SAVE-EDITOR-UNITY] Running compress command: ${cmd}`);
            execSync(cmd, { windowsHide: true });

            const encodedBuffer = await fs.readFile(tempBin);
            return encodedBuffer;
        } finally {
            // Cleanup temp files asynchronously
            fs.unlink(tempBin).catch(() => {});
            fs.unlink(tempJson).catch(() => {});
        }
    }
}

const format = new UnityMonoBinFormat();
export default format;
