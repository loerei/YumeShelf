const { execSync } = require('child_process');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');

class RenpyFormat {
    match(fileName) {
        return fileName.toLowerCase().endsWith('.save');
    }

    async decode(rawData, paths, fileName) {
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

    async encode(jsonData, paths, fileName) {
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

    async metadata(jsonData, paths, fileName) {
        // Return blank standard structure to bypass RPG Maker metadata loader
        return {
            variables: {},
            switches: {},
            items: {},
            weapons: {},
            armors: {},
            gameTitle: 'Ren\'Py Game'
        };
    }
}

module.exports = new RenpyFormat();
