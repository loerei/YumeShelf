const fs = require('fs');
const path = require('path');
const Parser = require('web-tree-sitter');
const { getConfig } = require('./config-helper.js');

// Helper to recursively walk a directory
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

// Extract require and import strings using Tree-sitter AST parsing
function extractImports(parser, filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    let tree;
    try {
        tree = parser.parse(content);
    } catch (err) {
        console.error(`Error parsing ${filePath}:`, err);
        return [];
    }

    const imports = [];

    function traverse(node) {
        if (node.type === 'import_statement') {
            for (let i = 0; i < node.childCount; i++) {
                const child = node.child(i);
                if (child.type === 'string') {
                    const rawVal = child.text;
                    const val = rawVal.substring(1, rawVal.length - 1);
                    imports.push(val);
                }
            }
        } else if (node.type === 'call_expression') {
            const fnNode = node.childForFieldName('function');
            if (fnNode && fnNode.text === 'require') {
                const argsNode = node.childForFieldName('arguments');
                if (argsNode) {
                    for (let i = 0; i < argsNode.childCount; i++) {
                        const child = argsNode.child(i);
                        if (child.type === 'string') {
                            const rawVal = child.text;
                            const val = rawVal.substring(1, rawVal.length - 1);
                            imports.push(val);
                        }
                    }
                }
            }
        } else if (node.type === 'import_expression') {
            for (let i = 0; i < node.childCount; i++) {
                const child = node.child(i);
                if (child.type === 'string') {
                    const rawVal = child.text;
                    const val = rawVal.substring(1, rawVal.length - 1);
                    imports.push(val);
                }
            }
        }

        for (let i = 0; i < node.childCount; i++) {
            traverse(node.child(i));
        }
    }

    traverse(tree.rootNode);
    // De-duplicate imports raw strings
    return [...new Set(imports)];
}

// Resolve import strings to repository-relative file paths
function resolveImportPath(sourceFile, importString, srcDir) {
    if (importString.startsWith('.')) {
        const sourceDir = path.dirname(sourceFile);
        const resolvedBase = path.resolve(sourceDir, importString);

        // Check ordered resolution priorities (exact file, .js, directory index.js, .json)
        const candidates = [
            resolvedBase,
            resolvedBase + '.js',
            path.join(resolvedBase, 'index.js'),
            resolvedBase + '.json'
        ];

        for (const candidate of candidates) {
            if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
                return path.relative(process.cwd(), candidate).replace(/\\/g, '/');
            }
        }
        
        // Return standard path approximation as relative if it exists inside project root
        return path.relative(process.cwd(), resolvedBase).replace(/\\/g, '/');
    }

    // Returns null to denote external/built-in package
    return null;
}

// DFS-based circular dependency tracker with cyclic normalization to avoid duplicates
function findCircularDependencies(graph) {
    const visited = {}; // filePath -> 0 (unvisited), 1 (visiting), 2 (visited)
    const pathStack = [];
    const cycles = [];
    const seenCycleKeys = new Set();

    Object.keys(graph).forEach(file => {
        visited[file] = 0;
    });

    function getCycleKey(pathArr) {
        // Exclude the closing duplicate node at the end
        const elements = pathArr.slice(0, -1);
        const sorted = [...elements].sort();
        const minIndex = elements.indexOf(sorted[0]);
        const normalized = [...elements.slice(minIndex), ...elements.slice(0, minIndex)];
        return normalized.join(' -> ');
    }

    function dfs(node) {
        visited[node] = 1;
        pathStack.push(node);

        const imports = graph[node] ? graph[node].imports : [];
        for (const neighbor of imports) {
            if (!graph[neighbor]) {
                continue;
            }
            if (visited[neighbor] === 1) {
                const cycleStartIndex = pathStack.indexOf(neighbor);
                if (cycleStartIndex !== -1) {
                    const cyclePath = pathStack.slice(cycleStartIndex);
                    cyclePath.push(neighbor); // Close the cycle visually

                    const key = getCycleKey(cyclePath);
                    if (!seenCycleKeys.has(key)) {
                        seenCycleKeys.add(key);
                        cycles.push(cyclePath);
                    }
                }
            } else if (visited[neighbor] === 0) {
                dfs(neighbor);
            }
        }

        pathStack.pop();
        visited[node] = 2;
    }

    Object.keys(graph).forEach(file => {
        if (visited[file] === 0) {
            dfs(file);
        }
    });

    return cycles;
}

async function run(args) {
    const config = getConfig();
    const mapConfig = config.tools.map; // Re-use the existing core path configuration
    const srcDir = mapConfig.srcDir;
    const wasmPath = mapConfig.wasmPath;

    // Use output path local/refs/dependency-graph.json by default
    const outputDir = path.dirname(mapConfig.outputFile);
    const graphFile = path.join(outputDir, 'dependency-graph.json');

    const cmd = args[0] || 'help';

    if (cmd === 'help') {
        return {
            status: 'help',
            message: 'SOP Dependency Manager CLI Usage:',
            commands: {
                'scan': 'Analyze imports & write full graph to local/refs/dependency-graph.json',
                'query <file>': 'Query dynamic dependencies, dependents, and circular paths for a specific file',
                'circular': 'Detect and output all cyclic dependency loops in the workspace'
            }
        };
    }

    if (cmd === 'scan') {
        console.log('Initializing Tree-sitter parser for dependency mapping...');
        await Parser.init();
        const parser = new Parser();

        if (!fs.existsSync(wasmPath)) {
            const err = new Error(`WASM grammar file not found at: ${wasmPath}`);
            err.remediation = 'Ensure you have run the grammar compilation script first, or fetch tree-sitter-javascript.wasm into local/refs/grammars/.';
            throw err;
        }

        const Lang = await Parser.Language.load(wasmPath);
        parser.setLanguage(Lang);

        console.log('Scanning codebase directory paths...');
        if (!fs.existsSync(srcDir)) {
            const err = new Error(`Source directory not found: ${srcDir}`);
            throw err;
        }

        const jsFiles = walkDir(srcDir, filePath => filePath.endsWith('.js'));
        const graph = {};

        // Pass 1: Parse AST and build basic graph mapping imports and externals
        jsFiles.forEach(file => {
            const repoPath = path.relative(process.cwd(), file).replace(/\\/g, '/');
            const rawImports = extractImports(parser, file);

            const imports = [];
            const externals = [];

            rawImports.forEach(imp => {
                const resolved = resolveImportPath(file, imp, srcDir);
                if (resolved) {
                    imports.push(resolved);
                } else {
                    externals.push(imp);
                }
            });

            graph[repoPath] = {
                imports: [...new Set(imports)],
                importedBy: [],
                externals: [...new Set(externals)]
            };
        });

        // Pass 2: Populate dynamic dependents (importedBy)
        Object.keys(graph).forEach(file => {
            const info = graph[file];
            info.imports.forEach(imp => {
                if (graph[imp]) {
                    graph[imp].importedBy.push(file);
                }
            });
        });

        // Calculate and run final structural summaries
        const circularLoops = findCircularDependencies(graph);
        let relationCount = 0;
        const externalSet = new Set();

        Object.keys(graph).forEach(f => {
            relationCount += graph[f].imports.length;
            graph[f].externals.forEach(ext => externalSet.add(ext));
        });

        const graphData = {
            projectName: config.projectName,
            generatedAt: new Date().toISOString(),
            summary: {
                totalFiles: Object.keys(graph).length,
                internalRelations: relationCount,
                externalPackages: externalSet.size,
                circularLoops: circularLoops.length
            },
            graph
        };

        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        fs.writeFileSync(graphFile, JSON.stringify(graphData, null, 2), 'utf8');

        return {
            status: 'success',
            action: 'scan',
            outputFile: path.relative(process.cwd(), graphFile).replace(/\\/g, '/'),
            summary: graphData.summary
        };
    }

    // Read saved cache check
    if (!fs.existsSync(graphFile)) {
        const err = new Error(`Dependency graph cache file not found at: ${graphFile}`);
        err.remediation = 'Please run "node SOP/cli.js dep scan" first to initialize the dependency graph.';
        throw err;
    }

    let graphData;
    try {
        graphData = JSON.parse(fs.readFileSync(graphFile, 'utf8'));
    } catch (e) {
        const err = new Error(`Corrupted dependency graph JSON at ${graphFile}: ${e.message}`);
        err.remediation = 'Re-run "node SOP/cli.js dep scan" to re-generate.';
        throw err;
    }

    if (cmd === 'query') {
        const target = args[1];
        if (!target) {
            const err = new Error('Missing file argument for dependency query.');
            err.remediation = 'Usage: node SOP/cli.js dep query <file>';
            throw err;
        }

        // Fuzzy match resolved keys
        let matchedFile = target.replace(/\\/g, '/');
        if (!graphData.graph[matchedFile]) {
            const lowerTarget = matchedFile.toLowerCase();
            const keys = Object.keys(graphData.graph);
            const found = keys.find(k => k.toLowerCase().endsWith(lowerTarget));
            if (found) {
                matchedFile = found;
            } else {
                const err = new Error(`File not found in dependency graph: ${target}`);
                err.remediation = 'Ensure the file exists within the scanned source directory, or run "scan" first.';
                throw err;
            }
        }

        const fileData = graphData.graph[matchedFile];
        const allCycles = findCircularDependencies(graphData.graph);
        const fileCycles = allCycles.filter(cycle => cycle.includes(matchedFile));

        return {
            status: 'success',
            action: 'query',
            file: matchedFile,
            imports: fileData.imports,
            importedBy: fileData.importedBy,
            externals: fileData.externals,
            circular: fileCycles
        };
    }

    if (cmd === 'circular') {
        const allCycles = findCircularDependencies(graphData.graph);
        return {
            status: 'success',
            action: 'circular',
            totalLoops: allCycles.length,
            loops: allCycles
        };
    }

    const err = new Error(`Unknown dependency manager command: ${cmd}`);
    err.remediation = 'Supported commands: scan, query, circular. Use "node SOP/cli.js dep" for details.';
    throw err;
}

module.exports = { run };
