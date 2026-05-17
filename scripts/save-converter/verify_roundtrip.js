const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const dllPath = `D:\\Games\\H Games\\YumeShelf\\YumeShelf\\VN\\[Ryuugames] RY-3991720_V26.01.06\\Sisters Connect\\imokone_Data\\Managed\\Assembly-CSharp.dll`;
const saveDir = `C:\\Users\\sayus\\AppData\\LocalLow\\Hikari Sky\\イモコネー届けたい恋心`;
const converterDll = path.resolve(__dirname, 'ModernSaveConverter', 'bin', 'Release', 'net8.0', 'ModernSaveConverter.dll');

const targets = ['setting.bin', 'tinfo.bin', 'finfo.bin', '001.bin'];

targets.forEach(target => {
    console.log(`\n========================================`);
    console.log(`[TEST] Verifying round-trip for ${target}...`);
    
    const originalBin = path.join(saveDir, target);
    const firstJson = path.resolve(__dirname, target + '_1.json');
    const roundtripBin = path.resolve(__dirname, target + '_roundtrip.bin');
    const secondJson = path.resolve(__dirname, target + '_2.json');

    try {
        // 1. Binary -> JSON 1
        execSync(`dotnet "${converterDll}" to-json "${dllPath}" "${originalBin}" "${firstJson}"`);
        console.log(`- Phase 1 (Bin -> JSON 1) completed.`);

        // 2. JSON 1 -> Binary (copied from original to reserve type info / memory allocations, then updated, then written)
        fs.copyFileSync(originalBin, roundtripBin);
        execSync(`dotnet "${converterDll}" to-bin "${dllPath}" "${roundtripBin}" "${firstJson}"`);
        console.log(`- Phase 2 (JSON 1 -> Bin) completed.`);

        // 3. Binary -> JSON 2
        execSync(`dotnet "${converterDll}" to-json "${dllPath}" "${roundtripBin}" "${secondJson}"`);
        console.log(`- Phase 3 (Bin -> JSON 2) completed.`);

        // 4. Compare JSON 1 and JSON 2
        const js1 = fs.readFileSync(firstJson, 'utf8').replace(/^\uFEFF/, '');
        const js2 = fs.readFileSync(secondJson, 'utf8').replace(/^\uFEFF/, '');

        if (js1 === js2) {
            console.log(`[SUCCESS] Round-trip matches perfectly for ${target}!`);
        } else {
            console.error(`[FAILURE] Round-trip mismatch for ${target}!`);
            // Write a diff or print lengths
            console.log(`JSON 1 length: ${js1.length}, JSON 2 length: ${js2.length}`);
        }
    } catch (e) {
        console.error(`[ERROR] Failed round-trip for ${target}:`, e.stdout || e.stderr || e.message);
    }
});
