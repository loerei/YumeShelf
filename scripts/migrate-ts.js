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

const rendererDir = path.join(__dirname, '../src/renderer');
const files = walk(rendererDir);

let processedCount = 0;

for (const oldPath of files) {
    let content = fs.readFileSync(oldPath, 'utf8');
    
    // Replace .js imports with extensionless imports (e.g. from './file.js' -> from './file')
    content = content.replace(/(import\s+.*?from\s+['"]\..*?)\.js(['"])/g, '$1$2');
    content = content.replace(/(import\s*\(\s*['"]\..*?)\.js(['"]\s*\))/g, '$1$2');

    // Handle TS checking
    if (content.includes('// @ts-check')) {
        // File was already typed in Phase 2/3. Just remove the JSDoc check flag since it's TS now.
        content = content.replace(/\/\/\s*@ts-check\r?\n/, '');
    } else {
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

console.log(`Successfully migrated ${processedCount} files in src/renderer to .ts`);

// Update index.html
const indexHtmlPath = path.join(__dirname, '../src/index.html');
let indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
indexHtml = indexHtml.replace('src="renderer.js"', 'src="renderer.ts"');
fs.writeFileSync(indexHtmlPath, indexHtml, 'utf8');
console.log('Updated src/index.html to point to renderer.ts');
