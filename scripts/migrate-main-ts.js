const fs = require('node:fs');
const path = require('node:path');

function walk(dir, fileList = []) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
            walk(filePath, fileList);
        } else if (filePath.endsWith('.js')) {
            fileList.push(filePath);
        }
    }
    return fileList;
}

const rootDir = path.join(__dirname, '../src');
// Only walk main and shared
const dirsToWalk = [
    path.join(rootDir, 'main'),
    path.join(rootDir, 'shared')
];

let files = [];
for (const dir of dirsToWalk) {
    if (fs.existsSync(dir)) {
        files = walk(dir, files);
    }
}
// don't forget src/main.js
if (fs.existsSync(path.join(rootDir, 'main.js'))) {
    files.push(path.join(rootDir, 'main.js'));
}

let processedCount = 0;

for (const oldPath of files) {
    let content = fs.readFileSync(oldPath, 'utf8');
    
    // Replace .js imports/requires with extensionless (e.g. from './file.js' -> from './file' or require('./file.js'))
    content = content.replace(/(import\s+.*?from\s+['"]\..*?)\.js(['"])/g, '$1$2');
    content = content.replace(/(import\s*\(\s*['"]\..*?)\.js(['"]\s*\))/g, '$1$2');
    content = content.replace(/(require\s*\(\s*['"]\..*?)\.js(['"]\s*\))/g, '$1$2');

    // Handle TS checking
    if (content.includes('// @ts-check')) {
        // File was already typed in Phase 2/3. Remove JSDoc check.
        content = content.replace(/\/\/\s*@ts-check\r?\n/, '');
    } else if (!content.includes('// @ts-nocheck')) {
        // File is untyped. Add @ts-nocheck to bypass compiler errors initially.
        content = '// @ts-nocheck\n' + content;
    }

    const newPath = oldPath.slice(0, -3) + '.ts';
    
    // Write new TS file
    fs.writeFileSync(newPath, content, 'utf8');
    
    // Delete old JS file
    fs.unlinkSync(oldPath);
    processedCount++;
}

console.log(`Successfully migrated ${processedCount} files in src/main and src/shared to .ts`);
