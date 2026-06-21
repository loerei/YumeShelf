import { execSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

class RenpyFormat {
    match(fileName: string): boolean {
        return fileName.toLowerCase().endsWith('.save');
    }

    async decode(rawData: Buffer, paths: any, fileName: string): Promise<any> {
        const savePath = path.join(paths.saveDir, fileName);
        const tempJson = path.join(os.tmpdir(), `renpy_save_${Date.now()}.json`);
        const converterPy = path.resolve(__dirname, '..', 'bin', 'renpy_save_converter.py');
        
        try {
            const cmd = `python "${converterPy}" to-json "${savePath}" "${tempJson}"`;
            console.log(`[SAVE-EDITOR-RENPY] Running decode command: ${cmd}`);
            execSync(cmd, { windowsHide: true });
            
            const jsonStr = await fs.readFile(tempJson, 'utf8');
            const data = JSON.parse(jsonStr);
            
            // Add metadata tag for renderer engine detection
            data.$type = 'RenpySave';
            
            return data;
        } catch (err) {
            console.error(`[SAVE-EDITOR-RENPY] Decode failed:`, err);
            throw err;
        } finally {
            try {
                await fs.unlink(tempJson);
            } catch {}
        }
    }

    async encode(jsonData: any, paths: any, fileName: string): Promise<Buffer> {
        const savePath = path.join(paths.saveDir, fileName);
        const tempJson = path.join(os.tmpdir(), `renpy_save_${Date.now()}.json`);
        const tempSave = path.join(os.tmpdir(), `renpy_save_mod_${Date.now()}.save`);
        const converterPy = path.resolve(__dirname, '..', 'bin', 'renpy_save_converter.py');
        
        try {
            // Strip metadata fields before pickling back
            const cleanData = { ...jsonData };
            delete cleanData.$type;
            delete cleanData._userMappings;
            
            await fs.writeFile(tempJson, JSON.stringify(cleanData), 'utf8');
            
            const cmd = `python "${converterPy}" to-save "${savePath}" "${tempJson}" "${tempSave}"`;
            console.log(`[SAVE-EDITOR-RENPY] Running encode command: ${cmd}`);
            execSync(cmd, { windowsHide: true });
            
            const outputBuffer = await fs.readFile(tempSave);
            return outputBuffer;
        } catch (err) {
            console.error(`[SAVE-EDITOR-RENPY] Encode failed:`, err);
            throw err;
        } finally {
            try {
                await fs.unlink(tempJson);
            } catch {}
            try {
                await fs.unlink(tempSave);
            } catch {}
        }
    }

    async metadata(jsonData: any, paths: any, fileName: string): Promise<any> {
        // Return blank standard structure to bypass RPG Maker metadata loader
        return {
            variables: [],
            switches: [],
            items: {},
            weapons: {},
            armors: {},
            gameTitle: 'Ren\'Py Game'
        };
    }
}

const format = new RenpyFormat();
export default format;
