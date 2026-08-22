# Reference: Package Scripts & Build Gateways

---

## 1. The 7 Essential Script Repertoires

| Category | Typical Commands | Primary Responsibility & Failure Mode Prevented |
| :--- | :--- | :--- |
| **1. Preflight & Auditing** | `verify:deps`, `sync:deps`, `typecheck`, `lint` | **Fail-Fast Gates**: Prevents starting heavy multi-minute builds when runtime dependencies or type contracts are broken. |
| **2. Native & Asset Setup** | `ensure:bins`, `copy:assets` | **Idempotent Asset Preparation**: Pre-compiles Rust/C++ binaries, downloads platform drivers, and copies runtime shims into `dist/`. |
| **3. Core Compilation** | `build:main`, `build:preload`, `build:vite` | **Tiered Compilation**: Converts TypeScript sources and bundles renderer assets with deterministic sourcemaps. |
| **4. Testing & Verification** | `test`, `test:vitest`, `test:node`, `test:e2e` | **Regression Defense**: Runs in-memory unit tests, domain simulations, and cross-platform compatibility suites. |
| **5. Packaging & Distribution** | `build:win`, `build:linux`, `build:fast` | **Heavy Packaging**: Executes electron-builder/docker. Always preceded by preflight and followed by output organization. |
| **6. Output Organization** | `organize:build-output` | **Asset Hygiene**: Sorts raw build dumps into structured subdirectories (`application/`, `feed/`, `metadata/`, `unpacked/`). |
| **7. Health & Maintenance** | `doctor`, `clean`, `clean:all` | **Environment & Cache Reset**: Diagnoses local toolchain discrepancies and clears ghost build caches. |

---

## 2. Reference Script Implementations

### A. Dynamic Dependency Verifier & Crawler (`verify-packaged-dependencies.js`)

```javascript
const path = require('node:path');
const fs = require('node:fs');

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
        if (!mod.startsWith('.') && !mod.startsWith('node:') && !isNodeBuiltin(mod)) {
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

function main() {
    const isFixMode = process.argv.includes('--fix') || process.argv.includes('--sync');
    const projectRoot = path.resolve(__dirname, '..');
    const pkgPath = path.join(projectRoot, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const declaredProdDeps = Object.keys(pkg.dependencies || {});

    const distFiles = getFilesRecursively(path.join(projectRoot, 'dist'));
    const codeRequires = new Set();
    distFiles.forEach(file => {
        extractExternalRequires(file).forEach(req => codeRequires.add(req));
    });

    const rootSeeds = Array.from(new Set([...declaredProdDeps, ...codeRequires]));
    const missing = [];
    const verifiedTree = new Set();

    for (const seed of rootSeeds) {
        const crawlResults = crawlPackageDependencies(seed, projectRoot, verifiedTree);
        for (const item of crawlResults) {
            if (item.status === 'MISSING') {
                missing.push(item.name);
            }
        }
    }

    if (missing.length > 0) {
        if (isFixMode) {
            console.log(`🔧 Auto-syncing ${missing.length} missing dependencies into package.json...`);
            pkg.dependencies = pkg.dependencies || {};
            missing.forEach(dep => {
                pkg.dependencies[dep] = 'latest';
            });
            fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
            console.log('✅ package.json updated. Run pnpm install to finalize.');
            process.exit(0);
        } else {
            console.error(`❌ VERIFICATION FAILED: Missing dependencies: ${missing.join(', ')}`);
            console.error('👉 Run `pnpm run sync:deps` to automatically add them.');
            process.exit(1);
        }
    }

    console.log(`🎉 100% GREEN: All ${verifiedTree.size} modules verified.`);
}

main();
```

---

### B. Post-Build Asset Organizer (`organize-build-output.js`)

```javascript
const path = require('node:path');
const fs = require('node:fs');

const OUTPUT_DIR = path.resolve(__dirname, '..', 'build_output');

const FOLDER_MAP = {
    application: ['.exe', '.appimage', '.dmg', '.deb', '.rpm', '.tar.gz', '.zip'],
    feed: ['.yml', '.yaml', '.blockmap'],
    metadata: ['builder-debug.yml', 'builder-effective-config.yaml'],
    unpacked: ['win-unpacked', 'linux-unpacked', 'mac']
};

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function organize() {
    if (!fs.existsSync(OUTPUT_DIR)) return;

    const entries = fs.readdirSync(OUTPUT_DIR, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(OUTPUT_DIR, entry.name);
        if (entry.isDirectory()) {
            if (FOLDER_MAP.unpacked.includes(entry.name)) {
                const target = path.join(OUTPUT_DIR, 'unpacked', entry.name);
                ensureDir(path.dirname(target));
                fs.renameSync(fullPath, target);
            }
            continue;
        }

        const ext = path.extname(entry.name).toLowerCase();
        let targetCategory = null;

        if (FOLDER_MAP.metadata.includes(entry.name)) {
            targetCategory = 'metadata';
        } else if (FOLDER_MAP.feed.includes(ext) || entry.name.endsWith('.blockmap')) {
            targetCategory = process.platform === 'win32' ? 'win/feed' : 'linux/feed';
        } else if (FOLDER_MAP.application.includes(ext)) {
            targetCategory = process.platform === 'win32' ? 'win/application' : 'linux/application';
        }

        if (targetCategory) {
            const targetDir = path.join(OUTPUT_DIR, targetCategory);
            ensureDir(targetDir);
            fs.renameSync(fullPath, path.join(targetDir, entry.name));
        }
    }
}

organize();
```

---

### C. Deep Project Sanitizer (`clean.js`)

```javascript
const path = require('node:path');
const fs = require('node:fs');

const DIRS_TO_CLEAN = ['dist', 'build_output', '.scratch', 'temp'];
const DEEP_CLEAN_DIRS = ['node_modules', '.turbo', '.parcel-cache', '.vite'];

function clean() {
    const isAll = process.argv.includes('--all');
    const root = path.resolve(__dirname, '..');

    const targets = isAll ? [...DIRS_TO_CLEAN, ...DEEP_CLEAN_DIRS] : DIRS_TO_CLEAN;

    for (const dir of targets) {
        const fullPath = path.join(root, dir);
        if (fs.existsSync(fullPath)) {
            console.log(`🧹 Removing ${dir}...`);
            fs.rmSync(fullPath, { recursive: true, force: true });
        }
    }

    console.log('✨ Project directory cleaned successfully.');
}

clean();
```

---

### D. System & Toolchain Doctor (`doctor.js`)

```javascript
const { execSync } = require('node:child_process');

function checkTool(name, command, versionRegex) {
    try {
        const output = execSync(command, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
        const match = output.match(versionRegex);
        console.log(`  ✅ ${name.padEnd(16)}: ${match ? match[0] : 'Installed'}`);
        return true;
    } catch {
        console.error(`  ❌ ${name.padEnd(16)}: NOT FOUND (Required for development)`);
        return false;
    }
}

function doctor() {
    console.log('🩺 System & Toolchain Diagnostics:');
    let ok = true;
    ok = checkTool('Node.js', 'node -v', /v[\d.]+/) && ok;
    ok = checkTool('PNPM', 'pnpm -v', /[\d.]+/) && ok;
    ok = checkTool('Git', 'git --version', /[\d.]+/) && ok;
    ok = checkTool('Rust (Cargo)', 'cargo --version', /[\d.]+/) && ok;
    ok = checkTool('Docker', 'docker --version', /[\d.]+/) && ok;

    if (!ok) {
        console.error('\n⚠️ Some required toolchain dependencies are missing!');
        process.exit(1);
    } else {
        console.log('\n🎉 Environment is fully configured for all build targets.');
    }
}

doctor();
```
