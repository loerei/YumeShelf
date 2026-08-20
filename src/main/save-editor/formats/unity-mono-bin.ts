import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFileSync } from 'node:child_process';

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

    getConverterExecutionConfig(): { executable: string; baseArgs: string[] } {
        const binDir = path.resolve(__dirname, '..', 'bin');
        const unpackedBinDir = binDir.includes('app.asar') ? binDir.replace('app.asar', 'app.asar.unpacked') : binDir;

        const nativeExeName = process.platform === 'win32' ? 'ModernSaveConverter.exe' : 'ModernSaveConverter';
        const candidateNativePaths = [
            path.join(unpackedBinDir, nativeExeName),
            path.join(unpackedBinDir, process.platform === 'win32' ? 'win-x64' : 'linux-x64', nativeExeName)
        ];

        for (const candidate of candidateNativePaths) {
            if (fsSync.existsSync(candidate)) {
                return { executable: candidate, baseArgs: [] };
            }
        }

        // Fallback to dotnet <dll>
        const dllPath = path.join(unpackedBinDir, 'ModernSaveConverter.dll');
        return { executable: 'dotnet', baseArgs: [dllPath] };
    }

    async decode(rawData: Buffer, paths: any, fileName: string): Promise<any> {
        const assemblyPath = await this.getAssemblyPath(paths);
        const { executable, baseArgs } = this.getConverterExecutionConfig();

        const tempIn = path.join(os.tmpdir(), `yumeshelf_dec_${Date.now()}_in.bin`);
        const tempOut = path.join(os.tmpdir(), `yumeshelf_dec_${Date.now()}_out.json`);

        try {
            await fs.writeFile(tempIn, rawData);

            const args = [...baseArgs, 'to-json', assemblyPath, tempIn, tempOut];
            console.log(`[SAVE-EDITOR-UNITY] Running decompress command: ${executable} ${args.join(' ')}`);
            execFileSync(executable, args, { windowsHide: true });

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
        const { executable, baseArgs } = this.getConverterExecutionConfig();

        const originalBin = path.join(paths.saveDir, fileName);
        const tempBin = path.join(os.tmpdir(), `yumeshelf_enc_${Date.now()}_out.bin`);
        const tempJson = path.join(os.tmpdir(), `yumeshelf_enc_${Date.now()}_in.json`);

        try {
            // Copy original binary to tempBin to serve as serialization base
            await fs.copyFile(originalBin, tempBin);
            await fs.writeFile(tempJson, JSON.stringify(jsonData, null, 2), 'utf8');

            const args = [...baseArgs, 'to-bin', assemblyPath, tempBin, tempJson];
            console.log(`[SAVE-EDITOR-UNITY] Running compress command: ${executable} ${args.join(' ')}`);
            execFileSync(executable, args, { windowsHide: true });

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
