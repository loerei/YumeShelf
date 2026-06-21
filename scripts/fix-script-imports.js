const fs = require('node:fs');
const path = require('node:path');

function walk(dir, fileList = []) {
    if (!fs.existsSync(dir)) return fileList;
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
            if (!['node_modules', 'src', 'dist', '.git', 'assets', 'locales'].includes(file)) {
                walk(filePath, fileList);
            }
        } else if (filePath.endsWith('.js')) {
            fileList.push(filePath);
        }
    }
    return fileList;
}

const rootDir = path.resolve(__dirname, '..');
const allJsFiles = walk(rootDir);

let fixCount = 0;

for (const filePath of allJsFiles) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // We are looking for require( ... '.../src/...' )
    // E.g. require('../dist/main/save-editor-service')
    // We replace '.../src/' with '.../dist/'
    const originalContent = content;
    
    // Replace requires pointing to src with dist
    content = content.replace(/(require\s*\(\s*['"].*?\/)src(\/.*?['"]\s*\))/g, '$1dist$2');

    if (content !== originalContent) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Fixed imports in: ${path.relative(rootDir, filePath)}`);
        fixCount++;
    }
}

console.log(`Successfully fixed src imports in ${fixCount} scripts.`);
