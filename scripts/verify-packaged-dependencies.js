const path = require('path');
const fs = require('fs');

/**
 * Recursively find all production runtime .js files in a directory.
 */
function getFilesRecursively(dir, fileList = []) {
    if (!fs.existsSync(dir)) return fileList;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            getFilesRecursively(fullPath, fileList);
        } else if (
            entry.isFile() && 
            fullPath.endsWith('.js') && 
            !fullPath.endsWith('.test.js') && 
            !fullPath.endsWith('.spec.js')
        ) {
            fileList.push(fullPath);
        }
    }
    return fileList;
}

/**
 * Extract all non-relative require calls from a JS file.
 */
function extractExternalRequires(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    const requires = new Set();
    let match;
    while ((match = requireRegex.exec(content)) !== null) {
        const mod = match[1];
        // Ignore relative imports and node built-ins
        if (!mod.startsWith('.') && !mod.startsWith('node:') && !isNodeBuiltin(mod)) {
            // Extract package name (handling scoped packages like @types/foo)
            const parts = mod.split('/');
            const pkgName = mod.startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0];
            requires.add(pkgName);
        }
    }
    return Array.from(requires);
}

function isNodeBuiltin(modName) {
    const builtins = new Set([
        'assert', 'async_hooks', 'buffer', 'child_process', 'cluster', 'console',
        'constants', 'crypto', 'dgram', 'diagnostics_channel', 'dns', 'domain',
        'events', 'fs', 'http', 'http2', 'https', 'inspector', 'module', 'net',
        'os', 'path', 'perf_hooks', 'process', 'punycode', 'querystring', 'readline',
        'repl', 'stream', 'string_decoder', 'timers', 'tls', 'trace_events',
        'tty', 'url', 'util', 'v8', 'vm', 'wasi', 'worker_threads', 'zlib',
        'electron'
    ]);
    return builtins.has(modName);
}

/**
 * Recursively crawl the dependency tree of an npm package in node_modules.
 */
function crawlPackageDependencies(pkgName, startDir, visited = new Set(), results = []) {
    if (visited.has(pkgName) || isNodeBuiltin(pkgName)) return results;
    visited.add(pkgName);

    let pkgJsonPath = null;
    try {
        const resolvedMain = require.resolve(pkgName, { paths: [startDir] });
        let cur = path.dirname(resolvedMain);
        while (cur !== path.dirname(cur)) {
            const candidate = path.join(cur, 'package.json');
            if (fs.existsSync(candidate)) {
                try {
                    const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8'));
                    if (parsed.name === pkgName || !pkgJsonPath) {
                        pkgJsonPath = candidate;
                        if (parsed.name === pkgName) break;
                    }
                } catch {}
            }
            cur = path.dirname(cur);
        }
    } catch {
        results.push({ name: pkgName, status: 'MISSING', from: startDir });
        return results;
    }

    if (!pkgJsonPath) {
        results.push({ name: pkgName, status: 'NO_PKG_JSON', from: startDir });
        return results;
    }

    results.push({ name: pkgName, status: 'OK', path: pkgJsonPath });

    try {
        const pkgData = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
        const directDeps = Object.keys(pkgData.dependencies || {});
        const pkgDir = path.dirname(pkgJsonPath);

        for (const dep of directDeps) {
            crawlPackageDependencies(dep, pkgDir, visited, results);
        }
    } catch {}

    return results;
}

function verifyDynamicDependencies() {
    console.log('===============================================================');
    console.log('🔍 DYNAMIC DEPENDENCY VERIFIER (Automated Tree Crawler)         ');
    console.log('===============================================================\n');

    const projectRoot = path.resolve(__dirname, '..');
    const pkgPath = path.join(projectRoot, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const declaredProdDeps = Object.keys(pkg.dependencies || {});

    // Step 1: Scan compiled dist files for actual require calls
    const distFiles = getFilesRecursively(path.join(projectRoot, 'dist'));
    const codeRequires = new Set();
    distFiles.forEach(file => {
        extractExternalRequires(file).forEach(req => codeRequires.add(req));
    });

    console.log(`📂 Scanned ${distFiles.length} compiled production bundles in dist/`);
    console.log(`📦 Code directly requires: ${Array.from(codeRequires).join(', ') || '(none)'}`);
    console.log(`📦 Declared production dependencies in package.json: ${declaredProdDeps.length}\n`);

    // Combine all root seeds to verify
    const rootSeeds = Array.from(new Set([...declaredProdDeps, ...codeRequires]));

    const missing = [];
    const verifiedTree = new Set();

    console.log('🌳 Crawling Full Transitive Dependency Graph...');
    for (const seed of rootSeeds) {
        const crawlResults = crawlPackageDependencies(seed, projectRoot, verifiedTree);
        for (const item of crawlResults) {
            if (item.status === 'MISSING') {
                console.error(`   ❌ [MISSING] ${item.name.padEnd(28)} (Required by: ${item.from})`);
                missing.push(item.name);
            } else if (item.status === 'OK') {
                console.log(`   ✅ [RESOLVED] ${item.name.padEnd(28)} -> ${item.path}`);
            }
        }
    }

    // Step 2: Runtime Smoke Test (Attempt loading production modules)
    console.log('\n⚡ Performing Runtime Module Load Smoke Tests:');
    for (const dep of declaredProdDeps) {
        // Native Windows-only addons shouldn't fail the verification on non-windows
        if (dep === 'extract-file-icon' && process.platform !== 'win32') {
            console.log(`   ⏭️  [SKIPPED] ${dep} (Native Win32 addon - safely skipped on ${process.platform})`);
            continue;
        }

        try {
            require(require.resolve(dep, { paths: [projectRoot] }));
            console.log(`   ✅ [LOADED]   ${dep}`);
        } catch (err) {
            console.error(`   ❌ [LOAD_ERR] ${dep} -> ${err.message}`);
            missing.push(`${dep}:runtime-load`);
        }
    }

    console.log('\n===============================================================');
    if (missing.length > 0) {
        console.error(`❌ VERIFICATION FAILED: ${missing.length} missing/unresolved dependencies detected:`);
        console.error(`   ${Array.from(new Set(missing)).join(', ')}`);
        process.exit(1);
    } else {
        console.log(`🎉 100% GREEN: All ${verifiedTree.size} modules in transitive dependency graph verified!`);
        console.log('   (This dynamic crawler will automatically verify any future package updates)');
        console.log('===============================================================\n');
    }
}

verifyDynamicDependencies();
