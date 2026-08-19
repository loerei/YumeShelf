#!/usr/bin/env node

/**
 * Game Engine Asset & Static Icon Inspector
 *
 * Scans game engine directory structures (NW.js, RPG Maker MV/MZ, Ren'Py, Unity, Wolf RPG)
 * to locate packaged metadata (package.json), configured window icons, and static image assets.
 *
 * Usage:
 *   node .devutil/inspect-engine-icon.cjs "<path-to-game-directory>"
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const RPG_MAKER_DEFAULT_ICON_SHA1 = 'd7769fd67db920a430350d9f238ffe6043ef44a5';

const targetDir = process.argv[2];

if (!targetDir) {
    console.error('Error: Missing target game directory.');
    console.error('Usage: node .devutil/inspect-engine-icon.cjs "<path-to-game-directory>"');
    process.exit(1);
}

const resolvedDir = path.resolve(targetDir);
if (!fs.existsSync(resolvedDir)) {
    console.error(`Error: Directory does not exist: ${resolvedDir}`);
    process.exit(1);
}

function getPngDimensions(buffer) {
    if (buffer.length < 24) return null;
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
        const width = buffer.readUInt32BE(16);
        const height = buffer.readUInt32BE(20);
        return { width, height };
    }
    return null;
}

function scanImagesRecursively(dir, maxDepth = 3, currentDepth = 0) {
    if (currentDepth > maxDepth) return [];
    let results = [];
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isFile() && /\.(png|jpg|jpeg|webp|ico)$/i.test(entry.name)) {
                results.push(full);
            } else if (entry.isDirectory()) {
                results = results.concat(scanImagesRecursively(full, maxDepth, currentDepth + 1));
            }
        }
    } catch (_err) {}
    return results;
}

console.log('================================================================');
console.log(' Game Engine Asset & Static Icon Inspector');
console.log(` Target Directory: ${resolvedDir}`);
console.log('================================================================\n');

// 1. Check package.json (NW.js / Electron games)
const packageJsonPath = path.join(resolvedDir, 'package.json');
if (fs.existsSync(packageJsonPath)) {
    try {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        console.log('[1] NW.js / Electron Manifest (package.json):');
        console.log(`  - App Name     : ${pkg.name || 'unnamed'}`);
        console.log(`  - Window Title : ${pkg.window?.title || 'unspecified'}`);
        console.log(`  - Config Icon  : ${pkg.window?.icon || 'none'}`);
        if (pkg.window?.icon) {
            const iconPath = path.join(resolvedDir, pkg.window.icon);
            console.log(`  - File Exists  : ${fs.existsSync(iconPath)} (${iconPath})`);
        }
    } catch (err) {
        console.log(`[1] Failed to parse package.json: ${err.message}`);
    }
} else {
    console.log('[1] package.json not found in root directory.');
}

// 2. Scan Standard YumeShelf Branch A Candidates
console.log('\n[2] YumeShelf Branch A Candidate Verification:');
const candidateRelPaths = [
    'icon.png', 'cover.png', 'folder.png',
    'icon.jpg', 'cover.jpg', 'folder.jpg',
    'icon/icon.png', 'icon/cover.png',
    'www/icon/icon.png', 'www/icon/cover.png'
];

let foundCandidates = 0;
for (const rel of candidateRelPaths) {
    const full = path.join(resolvedDir, rel);
    if (fs.existsSync(full)) {
        foundCandidates++;
        const buf = fs.readFileSync(full);
        const hash = crypto.createHash('sha1').update(buf).digest('hex');
        const dims = getPngDimensions(buf);
        const isDefault = hash === RPG_MAKER_DEFAULT_ICON_SHA1;
        console.log(`  ✓ Found Candidate: ${rel.padEnd(20)} | ${(buf.length / 1024).toFixed(1)} KB | ${dims ? `${dims.width}x${dims.height}` : 'unknown dims'} | SHA-1: ${hash.slice(0, 8)}... ${isDefault ? '[DEFAULT RPG MAKER TEMPLATE]' : '[CUSTOM ARTWORK]'}`);
    }
}
if (foundCandidates === 0) {
    console.log('  (No standard root or nested icon candidates found)');
}

// 3. Broad Asset Survey
console.log('\n[3] In-Engine Graphic Assets (depth <= 3):');
const allImages = scanImagesRecursively(resolvedDir, 3);
const relevantImages = allImages.filter((p) => {
    const lower = p.toLowerCase();
    return lower.includes('icon') || lower.includes('cover') || lower.includes('title') || lower.includes('logo') || lower.includes('system');
});

console.log(`- Total Images Found: ${allImages.length} (Displaying top relevant matches: ${relevantImages.length})`);
for (const img of relevantImages.slice(0, 10)) {
    const rel = path.relative(resolvedDir, img);
    const stat = fs.statSync(img);
    console.log(`  * [${(stat.size / 1024).toFixed(1).padStart(7)} KB] ${rel}`);
}

console.log('\n================================================================\n');
