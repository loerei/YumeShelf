const path = require('path');
const fs = require('fs');

function verifyDependencies() {
    console.log('===============================================================');
    console.log('🔍 DEPENDENCY VERIFIER: Inspecting Runtime Modules             ');
    console.log('===============================================================\n');

    const pkgPath = path.resolve(__dirname, '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const dependencies = Object.keys(pkg.dependencies || {});

    console.log(`📦 Declared Production Dependencies (${dependencies.length}):`);
    dependencies.forEach(dep => console.log(`   • ${dep}`));

    console.log('\n🔎 Testing Module Resolution:');
    const missing = [];
    const criticalModules = [
        ...dependencies,
        'universalify',
        'graceful-fs',
        'jsonfile',
        'sax',
        'lazy-val',
        'builder-util-runtime',
        'semver',
        'tiny-typed-emitter',
        'debug',
        'ms',
        'lodash.escaperegexp',
        'lodash.isequal'
    ];

    const uniqueModules = Array.from(new Set(criticalModules));

    for (const mod of uniqueModules) {
        try {
            const resolvedPath = require.resolve(mod, { paths: [path.resolve(__dirname, '..')] });
            console.log(`   ✅ [RESOLVED] ${mod.padEnd(24)} -> ${resolvedPath}`);
        } catch (err) {
            console.error(`   ❌ [MISSING]  ${mod.padEnd(24)} -> Failed to resolve!`);
            missing.push(mod);
        }
    }

    // Also test loading electron-updater directly to verify its entire require stack
    console.log('\n⚡ Testing Full electron-updater Runtime Stack:');
    try {
        require('electron-updater');
        console.log('   ✅ electron-updater loaded without error (NsisUpdater available)');
    } catch (err) {
        console.error('   ❌ Failed to load electron-updater:', err.message);
        missing.push('electron-updater:runtime-load');
    }

    console.log('\n===============================================================');
    if (missing.length > 0) {
        console.error(`❌ VERIFICATION FAILED: ${missing.length} missing dependencies detected:`);
        console.error(`   ${missing.join(', ')}`);
        process.exit(1);
    } else {
        console.log('🎉 ALL DEPENDENCIES RESOLVED: Production bundle is 100% complete!');
        console.log('===============================================================\n');
    }
}

verifyDependencies();
