const fs = require('fs');
const path = require('path');

function getConfig() {
    const cwd = process.cwd();
    const configPath = path.resolve(cwd, 'sop.config.json');
    let config = {};

    if (fs.existsSync(configPath)) {
        try {
            config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        } catch (e) {
            // Ignore parse errors
        }
    }

    // Dynamic defaults mapping
    const pkgPath = path.resolve(cwd, 'package.json');
    let pkg = {};
    if (fs.existsSync(pkgPath)) {
        try {
            pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        } catch (e) {}
    }

    // Extract product/app name if possible
    const pkgProductName = pkg.build ? pkg.build.productName : null;
    const projectName = config.projectName || pkgProductName || pkg.name || path.basename(cwd);
    
    // Default tool values
    const tools = config.tools || {};
    const mapConfig = tools.map || {};

    const srcDir = mapConfig.srcDir || (fs.existsSync(path.resolve(cwd, 'src')) ? 'src' : '.');
    const outputDir = fs.existsSync(path.resolve(cwd, 'local/refs')) ? 'local/refs' : '.sop';
    const outputFile = mapConfig.outputFile || path.join(outputDir, 'repo-map.txt');
    
    // Wasm location fallbacks
    let wasmPath = mapConfig.wasmPath;
    if (!wasmPath) {
        const pathsToCheck = [
            path.join(cwd, 'local/refs/grammars/tree-sitter-javascript.wasm'),
            path.join(cwd, '.sop/grammars/tree-sitter-javascript.wasm'),
            path.join(cwd, 'node_modules/tree-sitter-javascript/tree-sitter-javascript.wasm')
        ];
        wasmPath = pathsToCheck.find(p => fs.existsSync(p)) || pathsToCheck[0];
    }

    return {
        projectName,
        tools: {
            map: {
                srcDir: path.resolve(cwd, srcDir),
                outputFile: path.resolve(cwd, outputFile),
                wasmPath: path.resolve(cwd, wasmPath)
            }
        }
    };
}

module.exports = { getConfig };
