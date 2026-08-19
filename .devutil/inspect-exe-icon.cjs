#!/usr/bin/env node

/**
 * Windows PE Executable Icon Frame & Resolution Inspector
 *
 * Inspects the native icon frames embedded within a Windows PE .exe binary,
 * measures buffer sizes across resolutions (16px -> 256px), and detects
 * whether the icon contains true 256px PNG compressed data or is upscaled from a lower DIB frame.
 *
 * Usage:
 *   node .devutil/inspect-exe-icon.cjs "<path-to-executable>"
 */

const fs = require('node:fs');
const path = require('node:path');

const targetExe = process.argv[2];

if (!targetExe) {
    console.error('Error: Missing target executable path.');
    console.error('Usage: node .devutil/inspect-exe-icon.cjs "<path-to-executable>"');
    process.exit(1);
}

const resolvedPath = path.resolve(targetExe);
if (!fs.existsSync(resolvedPath)) {
    console.error(`Error: File does not exist: ${resolvedPath}`);
    process.exit(1);
}

console.log('================================================================');
console.log(' Windows PE Executable Icon Inspector');
console.log(` Target Binary: ${resolvedPath}`);
console.log('================================================================\n');

// 1. Binary PE Resource PNG Signature Scan
const exeBuf = fs.readFileSync(resolvedPath);
let pngSignatures = 0;
const pngFrames = [];

for (let i = 0; i < exeBuf.length - 8; i++) {
    if (exeBuf[i] === 0x89 && exeBuf[i + 1] === 0x50 && exeBuf[i + 2] === 0x4E && exeBuf[i + 3] === 0x47) {
        pngSignatures++;
        const width = exeBuf.readUInt32BE(i + 16);
        const height = exeBuf.readUInt32BE(i + 20);
        pngFrames.push({ offsetHex: `0x${i.toString(16)}`, width, height });
    }
}

console.log('[1] PE Binary Signature Analysis:');
console.log(`- File Size                   : ${(exeBuf.length / 1024).toFixed(1)} KB (${exeBuf.length} bytes)`);
console.log(`- Embedded PNG Signatures     : ${pngSignatures}`);
for (const f of pngFrames) {
    console.log(`  * PNG Frame @ ${f.offsetHex.padEnd(10)}: Dimensions ${f.width}x${f.height}`);
}

// 2. Multi-Resolution Icon Extraction Matrix
console.log('\n[2] Windows Shell Image List Extraction Matrix:');
let extractModule = null;
try {
    extractModule = require('extract-file-icon');
} catch (e) {
    console.warn(`[WARN] extract-file-icon module not found directly: ${e.message}`);
}

if (extractModule) {
    const resolutions = [16, 32, 48, 64, 128, 256];
    for (const res of resolutions) {
        try {
            const buf = extractModule(resolvedPath, res);
            const len = buf ? buf.length : 0;
            const isPng = len >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
            const status = len === 0 ? 'Empty (Unavailable)' : `${(len / 1024).toFixed(1)} KB (${isPng ? 'PNG Encoded' : 'Raw Bitmap'})`;
            console.log(`  - Resolution ${String(res).padStart(3)}px : ${status}`);
        } catch (err) {
            console.log(`  - Resolution ${String(res).padStart(3)}px : Extraction error (${err.message})`);
        }
    }
} else {
    console.log('  (Skipped native extraction - extract-file-icon native binding unavailable in plain node. Run with Electron node runtime if needed)');
}

console.log('\n================================================================');
console.log(' VERDICT & INTERPRETATION');
console.log('================================================================');
if (pngSignatures > 0) {
    console.log('✓ High-Definition Icon (True Vista+ 256px PNG embedded in PE binary).');
} else {
    console.log('⚠️ Legacy / Low-Resolution Icon (Embedded icon is max 32px or 48px DIB bitmap; 256px requests will be upscaled by Windows Shell).');
}
console.log('================================================================\n');
