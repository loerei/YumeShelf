const fs = require('fs');
const path = require('path');
const Parser = require('web-tree-sitter');
const { getConfig } = require('./config-helper.js');

function walkDir(dir, filterFn) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat && stat.isDirectory()) {
            results = results.concat(walkDir(filePath, filterFn));
        } else if (filterFn(filePath)) {
            results.push(filePath);
        }
    });
    return results;
}

function extractSignatures(parser, filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    let tree;
    try {
        tree = parser.parse(content);
    } catch (err) {
        console.error(`Error parsing ${filePath}:`, err);
        return [];
    }

    const signatures = [];

    function traverse(node, currentClass = null) {
        if (node.type === 'function_declaration') {
            const nameNode = node.childForFieldName('name');
            if (nameNode) {
                const line = node.startPosition.row + 1;
                signatures.push(`  - [Line ${line}] Function: ${nameNode.text}()`);
            }
        } else if (node.type === 'class_declaration') {
            const nameNode = node.childForFieldName('name');
            if (nameNode) {
                const className = nameNode.text;
                const line = node.startPosition.row + 1;
                signatures.push(`  - [Line ${line}] Class: ${className}`);
                
                // Traverse class children with class context to capture class methods
                for (let i = 0; i < node.childCount; i++) {
                    traverse(node.child(i), className);
                }
                return; // Prevent double traversal of class children
            }
        } else if (node.type === 'method_definition') {
            const nameNode = node.childForFieldName('name');
            if (nameNode) {
                const methodName = nameNode.text;
                const line = node.startPosition.row + 1;
                if (currentClass) {
                    signatures.push(`  - [Line ${line}] Method: ${currentClass}.${methodName}()`);
                } else {
                    signatures.push(`  - [Line ${line}] Method: ${methodName}()`);
                }
            }
        } else if (node.type === 'lexical_declaration' || node.type === 'variable_declaration') {
            // Find variable declarators inside
            for (let i = 0; i < node.childCount; i++) {
                const child = node.child(i);
                if (child.type === 'variable_declarator') {
                    const nameNode = child.childForFieldName('name');
                    const valueNode = child.childForFieldName('value');
                    if (nameNode && valueNode) {
                        const line = child.startPosition.row + 1;
                        if (valueNode.type === 'arrow_function') {
                            signatures.push(`  - [Line ${line}] ArrowFunc: ${nameNode.text}()`);
                        } else if (valueNode.type === 'function') {
                            signatures.push(`  - [Line ${line}] Function: ${nameNode.text}()`);
                        }
                    }
                }
            }
        }

        for (let i = 0; i < node.childCount; i++) {
            traverse(node.child(i), currentClass);
        }
    }

    traverse(tree.rootNode);
    return signatures;
}

async function run(args) {
    const config = getConfig();
    const mapConfig = config.tools.map;

    console.log('Initializing Tree-sitter parser for repo map generation...');
    await Parser.init();
    const parser = new Parser();

    const wasmPath = mapConfig.wasmPath;
    if (!fs.existsSync(wasmPath)) {
        const err = new Error(`WASM grammar file not found at: ${wasmPath}`);
        err.remediation = 'Ensure you have run the grammar compilation script first, or fetch tree-sitter-javascript.wasm into local/refs/grammars/.';
        throw err;
    }

    const Lang = await Parser.Language.load(wasmPath);
    parser.setLanguage(Lang);

    console.log('Generating Repository Structure Map...');
    const srcDir = mapConfig.srcDir;
    const outputFile = mapConfig.outputFile;
    const outputDir = path.dirname(outputFile);

    if (!fs.existsSync(srcDir)) {
        const err = new Error(`Source directory not found: ${srcDir}`);
        throw err;
    }
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const jsFiles = walkDir(srcDir, filePath => filePath.endsWith('.js'));
    let mapContent = `================ ${config.projectName.toUpperCase()} REPOSITORY STATIC MAP ================\n`;
    mapContent += `Generated At: ${new Date().toISOString()}\n\n`;

    jsFiles.forEach(file => {
        const relativePath = path.relative(process.cwd(), file).replace(/\\/g, '/');
        mapContent += `### File: ${relativePath}\n`;
        const sigs = extractSignatures(parser, file);
        if (sigs.length > 0) {
            mapContent += sigs.join('\n') + '\n';
        } else {
            mapContent += '  (No public signatures or methods found)\n';
        }
        mapContent += '\n';
    });

    fs.writeFileSync(outputFile, mapContent, 'utf8');
    return { status: 'success', outputFile, message: `Static Repo Map written to: ${outputFile}` };
}

module.exports = { run };
