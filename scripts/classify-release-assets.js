const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const MIN_SIZE_THRESHOLDS = {
    'primary-installer': 1024,
    archive: 1024,
    delta: 512,
    blockmap: 64,
    'updater-manifest': 10,
    checksum: 32,
    metadata: 10,
    unknown: 1
};

const PLATFORM_PATTERNS = {
    windows: {
        installer: /^YumeShelf(?:-| )Setup[ -].+\.exe$/i,
        portable: /^YumeShelf(?:[ .])\d.+\.exe$/i,
        delta: /^YumeShelf(?:-| )Setup[ -].+\.nsis\.7z$/i,
        blockmap: /^YumeShelf(?:-| )Setup[ -].+\.exe\.blockmap$/i,
        manifest: /^latest\.yml$/i,
        checksum: /^YumeShelf(?:-| |[ .]\d).+\.exe\.(?:sha256|sha512)$/i
    },
    linux: {
        appImage: /^YumeShelf(?:[ .-]|\b).+\.AppImage$/i,
        deb: /^YumeShelf(?:[ .-]|\b).+\.deb$/i,
        tarball: /^YumeShelf(?:[ .-]|\b).+\.tar\.gz$/i,
        manifest: /^latest-linux\.yml$/i,
        checksum: /^YumeShelf(?:[ .-]|\b).+\.(?:AppImage|deb|tar\.gz)\.(?:sha256|sha512)$/i
    },
    macos: {
        dmg: /^YumeShelf(?:[ .-]|\b).+\.dmg$/i,
        zip: /^YumeShelf(?:[ .-]|\b).+\.zip$/i,
        blockmap: /^YumeShelf(?:[ .-]|\b).+\.dmg\.blockmap$/i,
        manifest: /^latest-mac\.yml$/i,
        checksum: /^YumeShelf(?:[ .-]|\b).+\.(?:dmg|zip)\.(?:sha256|sha512)$/i
    }
};

function detectPlatform(fileName) {
    const base = path.basename(fileName);

    if (PLATFORM_PATTERNS.windows.installer.test(base) ||
        PLATFORM_PATTERNS.windows.portable.test(base) ||
        PLATFORM_PATTERNS.windows.delta.test(base) ||
        PLATFORM_PATTERNS.windows.blockmap.test(base) ||
        PLATFORM_PATTERNS.windows.manifest.test(base) ||
        PLATFORM_PATTERNS.windows.checksum.test(base) ||
        base.endsWith('.exe') ||
        base.endsWith('.nsis.7z')) {
        return 'windows';
    }

    if (PLATFORM_PATTERNS.linux.appImage.test(base) ||
        PLATFORM_PATTERNS.linux.deb.test(base) ||
        PLATFORM_PATTERNS.linux.tarball.test(base) ||
        PLATFORM_PATTERNS.linux.manifest.test(base) ||
        PLATFORM_PATTERNS.linux.checksum.test(base) ||
        base.endsWith('.AppImage') ||
        base.endsWith('.deb') ||
        base.endsWith('.tar.gz')) {
        return 'linux';
    }

    if (PLATFORM_PATTERNS.macos.dmg.test(base) ||
        PLATFORM_PATTERNS.macos.zip.test(base) ||
        PLATFORM_PATTERNS.macos.blockmap.test(base) ||
        PLATFORM_PATTERNS.macos.manifest.test(base) ||
        PLATFORM_PATTERNS.macos.checksum.test(base) ||
        base.endsWith('.dmg') ||
        base.endsWith('.dmg.blockmap')) {
        return 'macos';
    }

    if (/^builder-(?:debug\.yml|effective-config\.yaml)$/i.test(base)) {
        return 'cross-platform';
    }

    return 'unknown';
}

function detectAssetRole(fileName) {
    const base = path.basename(fileName);

    if (base.endsWith('.sha256') || base.endsWith('.sha512')) {
        return 'checksum';
    }

    if (base.endsWith('.blockmap')) {
        return 'blockmap';
    }

    if (base.endsWith('.nsis.7z') || base.endsWith('.7z')) {
        return 'delta';
    }

    if (/^latest(?:-linux|-mac)?\.yml$/i.test(base)) {
        return 'updater-manifest';
    }

    if (/^builder-(?:debug\.yml|effective-config\.yaml)$/i.test(base)) {
        return 'metadata';
    }

    if (PLATFORM_PATTERNS.windows.installer.test(base) ||
        PLATFORM_PATTERNS.linux.appImage.test(base) ||
        PLATFORM_PATTERNS.linux.deb.test(base) ||
        PLATFORM_PATTERNS.macos.dmg.test(base)) {
        return 'primary-installer';
    }

    if (PLATFORM_PATTERNS.windows.portable.test(base) ||
        PLATFORM_PATTERNS.linux.tarball.test(base) ||
        PLATFORM_PATTERNS.macos.zip.test(base)) {
        return 'archive';
    }

    return 'unknown';
}

function computeDigests(source, algorithms = ['sha256', 'sha512']) {
    let buffer;
    if (Buffer.isBuffer(source)) {
        buffer = source;
    } else if (typeof source === 'string') {
        if (fs.existsSync(source)) {
            buffer = fs.readFileSync(source);
        } else {
            buffer = Buffer.from(source, 'utf8');
        }
    } else {
        throw new TypeError('Source must be a Buffer, string content, or existing file path.');
    }

    const digests = {};
    for (const algo of algorithms) {
        digests[algo] = crypto.createHash(algo).update(buffer).digest('hex');
    }
    return digests;
}

function validateAssetIntegrity(assetInfo) {
    const errors = [];
    const warnings = [];

    const fileName = assetInfo.fileName || (assetInfo.filePath ? path.basename(assetInfo.filePath) : '');
    const role = assetInfo.role || detectAssetRole(fileName);
    const platform = assetInfo.platform || detectPlatform(fileName);
    const size = typeof assetInfo.size === 'number' ? assetInfo.size : (assetInfo.filePath && fs.existsSync(assetInfo.filePath) ? fs.statSync(assetInfo.filePath).size : null);

    if (!fileName) {
        errors.push('Missing asset filename.');
        return { valid: false, errors, warnings };
    }

    if (platform === 'unknown') {
        warnings.push(`Unrecognized platform for asset: ${fileName}`);
    }

    if (role === 'unknown') {
        warnings.push(`Unrecognized role for asset: ${fileName}`);
    }

    const minSize = MIN_SIZE_THRESHOLDS[role] || 1;
    if (size !== null) {
        if (size <= 0) {
            errors.push(`Asset ${fileName} is empty (0 bytes).`);
        } else if (size < minSize) {
            warnings.push(`Asset ${fileName} size (${size} bytes) is below recommended threshold (${minSize} bytes) for role "${role}".`);
        }
    }

    if (role === 'primary-installer') {
        const isRecognizedPattern = PLATFORM_PATTERNS.windows.installer.test(fileName) ||
            PLATFORM_PATTERNS.linux.appImage.test(fileName) ||
            PLATFORM_PATTERNS.linux.deb.test(fileName) ||
            PLATFORM_PATTERNS.macos.dmg.test(fileName);
        if (!isRecognizedPattern) {
            warnings.push(`Installer ${fileName} does not follow standard naming pattern.`);
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}

function classifyAsset(filePathOrName, options = {}) {
    const isPath = fs.existsSync(filePathOrName);
    const fileName = path.basename(filePathOrName);
    const platform = detectPlatform(fileName);
    const role = detectAssetRole(fileName);

    let size = null;
    let digests = null;

    if (isPath) {
        const stat = fs.statSync(filePathOrName);
        if (stat.isFile()) {
            size = stat.size;
            if (options.computeDigests !== false) {
                digests = computeDigests(filePathOrName, options.algorithms || ['sha256', 'sha512']);
            }
        }
    } else if (options.size !== undefined) {
        size = options.size;
    }

    const asset = {
        fileName,
        filePath: isPath ? path.resolve(filePathOrName) : null,
        platform,
        role,
        size,
        digests: digests || options.digests || null
    };

    const integrity = validateAssetIntegrity(asset);
    asset.valid = integrity.valid;
    asset.errors = integrity.errors;
    asset.warnings = integrity.warnings;

    return asset;
}

function classifyReleaseAssets(targetDirOrFiles, options = {}) {
    let filePaths = [];

    if (Array.isArray(targetDirOrFiles)) {
        filePaths = targetDirOrFiles;
    } else if (typeof targetDirOrFiles === 'string') {
        if (fs.existsSync(targetDirOrFiles)) {
            const stat = fs.statSync(targetDirOrFiles);
            if (stat.isDirectory()) {
                const scan = (dir) => {
                    const entries = fs.readdirSync(dir);
                    for (const entry of entries) {
                        const full = path.join(dir, entry);
                        const s = fs.statSync(full);
                        if (s.isDirectory()) {
                            scan(full);
                        } else if (s.isFile()) {
                            filePaths.push(full);
                        }
                    }
                };
                scan(targetDirOrFiles);
            } else {
                filePaths.push(targetDirOrFiles);
            }
        } else {
            filePaths.push(targetDirOrFiles);
        }
    }

    const classified = filePaths.map((fp) => classifyAsset(fp, options));

    const byPlatform = {
        windows: classified.filter((a) => a.platform === 'windows'),
        linux: classified.filter((a) => a.platform === 'linux'),
        macos: classified.filter((a) => a.platform === 'macos'),
        'cross-platform': classified.filter((a) => a.platform === 'cross-platform'),
        unknown: classified.filter((a) => a.platform === 'unknown')
    };

    const byRole = {
        'primary-installer': classified.filter((a) => a.role === 'primary-installer'),
        archive: classified.filter((a) => a.role === 'archive'),
        delta: classified.filter((a) => a.role === 'delta'),
        blockmap: classified.filter((a) => a.role === 'blockmap'),
        'updater-manifest': classified.filter((a) => a.role === 'updater-manifest'),
        checksum: classified.filter((a) => a.role === 'checksum'),
        metadata: classified.filter((a) => a.role === 'metadata'),
        unknown: classified.filter((a) => a.role === 'unknown')
    };

    return {
        total: classified.length,
        assets: classified,
        byPlatform,
        byRole,
        allValid: classified.every((a) => a.valid)
    };
}

function generateReleaseManifest(targetDirOrFiles, options = {}) {
    const classification = classifyReleaseAssets(targetDirOrFiles, {
        computeDigests: true,
        algorithms: ['sha256', 'sha512'],
        ...options
    });

    const manifest = {
        generatedAt: new Date().toISOString(),
        totalAssets: classification.total,
        allValid: classification.allValid,
        platforms: {},
        assets: classification.assets.map((a) => ({
            fileName: a.fileName,
            platform: a.platform,
            role: a.role,
            size: a.size,
            sha256: a.digests?.sha256 || null,
            sha512: a.digests?.sha512 || null,
            valid: a.valid
        }))
    };

    for (const [platform, items] of Object.entries(classification.byPlatform)) {
        if (items.length > 0) {
            manifest.platforms[platform] = {
                count: items.length,
                primaryInstaller: items.find((i) => i.role === 'primary-installer')?.fileName || null,
                manifest: items.find((i) => i.role === 'updater-manifest')?.fileName || null,
                files: items.map((i) => i.fileName)
            };
        }
    }

    return manifest;
}

function runSelfTest() {
    const assert = require('assert');
    console.log('[classify-release-assets] Running self-test...');

    // Test Windows assets
    const winExe = classifyAsset('YumeShelf-Setup-2.1.2.exe', { size: 50000000 });
    assert.strictEqual(winExe.platform, 'windows');
    assert.strictEqual(winExe.role, 'primary-installer');
    assert.strictEqual(winExe.valid, true);

    const winDelta = classifyAsset('YumeShelf-Setup-2.1.2.nsis.7z', { size: 30000000 });
    assert.strictEqual(winDelta.platform, 'windows');
    assert.strictEqual(winDelta.role, 'delta');

    const winManifest = classifyAsset('latest.yml', { size: 500 });
    assert.strictEqual(winManifest.platform, 'windows');
    assert.strictEqual(winManifest.role, 'updater-manifest');

    // Test Linux assets
    const linuxApp = classifyAsset('YumeShelf-2.1.2.AppImage', { size: 60000000 });
    assert.strictEqual(linuxApp.platform, 'linux');
    assert.strictEqual(linuxApp.role, 'primary-installer');

    const linuxDeb = classifyAsset('YumeShelf-2.1.2.deb', { size: 55000000 });
    assert.strictEqual(linuxDeb.platform, 'linux');
    assert.strictEqual(linuxDeb.role, 'primary-installer');

    const linuxManifest = classifyAsset('latest-linux.yml', { size: 500 });
    assert.strictEqual(linuxManifest.platform, 'linux');
    assert.strictEqual(linuxManifest.role, 'updater-manifest');

    // Test macOS assets
    const macDmg = classifyAsset('YumeShelf-2.1.2.dmg', { size: 70000000 });
    assert.strictEqual(macDmg.platform, 'macos');
    assert.strictEqual(macDmg.role, 'primary-installer');

    const macZip = classifyAsset('YumeShelf-2.1.2.zip', { size: 65000000 });
    assert.strictEqual(macZip.platform, 'macos');
    assert.strictEqual(macZip.role, 'archive');

    const macManifest = classifyAsset('latest-mac.yml', { size: 500 });
    assert.strictEqual(macManifest.platform, 'macos');
    assert.strictEqual(macManifest.role, 'updater-manifest');

    // Test Digests
    const sample = Buffer.from('hello yumeshelf');
    const digests = computeDigests(sample);
    assert.strictEqual(digests.sha256, crypto.createHash('sha256').update(sample).digest('hex'));
    assert.strictEqual(digests.sha512, crypto.createHash('sha512').update(sample).digest('hex'));

    console.log('[classify-release-assets] All self-tests passed successfully.');
}

function main() {
    const args = process.argv.slice(2);
    if (args.includes('--test')) {
        runSelfTest();
        return;
    }

    const targetDir = args[0] || path.resolve(__dirname, '..', 'build_output');
    if (!fs.existsSync(targetDir)) {
        console.log(`[classify-release-assets] Directory not found: ${targetDir}`);
        return;
    }

    const manifest = generateReleaseManifest(targetDir);
    console.log(JSON.stringify(manifest, null, 2));
}

if (require.main === module) {
    main();
}

module.exports = {
    detectPlatform,
    detectAssetRole,
    computeDigests,
    validateAssetIntegrity,
    classifyAsset,
    classifyReleaseAssets,
    generateReleaseManifest,
    runSelfTest,
    MIN_SIZE_THRESHOLDS,
    PLATFORM_PATTERNS
};