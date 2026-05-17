const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const dllPath = `D:\\Games\\H Games\\YumeShelf\\YumeShelf\\VN\\[Ryuugames] RY-3991720_V26.01.06\\Sisters Connect\\imokone_Data\\Managed\\Assembly-CSharp.dll`;
const saveDir = `C:\\Users\\sayus\\AppData\\LocalLow\\Hikari Sky\\イモコネー届けたい恋心`;
const converterDll = path.resolve(__dirname, 'ModernSaveConverter', 'bin', 'Release', 'net8.0', 'ModernSaveConverter.dll');

const targets = ['setting.bin', 'tinfo.bin', 'finfo.bin', '001.bin'];

targets.forEach(target => {
    const binPath = path.join(saveDir, target);
    const jsonPath = path.resolve(__dirname, target + '.json');
    console.log(`[CONVERT] Converting ${target} to JSON...`);
    try {
        const cmd = `dotnet "${converterDll}" to-json "${dllPath}" "${binPath}" "${jsonPath}"`;
        const out = execSync(cmd, { encoding: 'utf8' });
        console.log(out.trim());
        
        // Print size of JSON file and a snippet
        if (fs.existsSync(jsonPath)) {
            const size = fs.statSync(jsonPath).size;
            console.log(`[SUCCESS] Produced ${target}.json (${size} bytes)`);
            const content = fs.readFileSync(jsonPath, 'utf8').replace(/^\uFEFF/, '');
            console.log(`[SNIPPET] First 300 chars:`, content.substring(0, 300));
        }
    } catch (e) {
        console.error(`[ERROR] Failed for ${target}:`, e.stdout || e.stderr || e.message);
    }
});
