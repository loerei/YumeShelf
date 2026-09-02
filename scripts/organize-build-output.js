const fs = require('fs');
const path = require('path');
const {
    getBuildOutputDir,
    getNsisOutputDir,
    getNsisApplicationOutputDir,
    getNsisBlockmapOutputDir,
    getNsisChecksumOutputDir,
    getNsisFeedOutputDir,
    getLinuxOutputDir,
    getLinuxApplicationOutputDir,
    getLinuxChecksumOutputDir,
    getLinuxFeedOutputDir,
    getMacOutputDir,
    getMacApplicationOutputDir,
    getMacBlockmapOutputDir,
    getMacChecksumOutputDir,
    getMacFeedOutputDir,
    getUnpackedOutputDir,
    getPortableOutputDir,
    getPortableApplicationOutputDir,
    getPortableChecksumOutputDir
} = require('./release-artifacts');

function ensureDir(dirPath) {
    fs.mkdirSync(dirPath, { recursive: true });
}

function isMacCategorizedDir(dirPath) {
    if (!fs.existsSync(dirPath)) return false;
    try {
        const stat = fs.statSync(dirPath);
        if (!stat.isDirectory()) return false;
        const children = fs.readdirSync(dirPath);
        return children.some((c) => ['application', 'blockmap', 'sha256', 'feed'].includes(c));
    } catch {
        return false;
    }
}

function moveEntry(entryName, destinationDir, buildOutputDir = getBuildOutputDir()) {
    const sourcePath = path.join(buildOutputDir, entryName);
    let destinationPath;
    if (path.basename(destinationDir) === 'mac-unpacked' && entryName !== 'mac-unpacked') {
        destinationPath = destinationDir;
    } else {
        destinationPath = path.join(destinationDir, entryName);
    }
    if (sourcePath === destinationPath) {
        return;
    }
    ensureDir(path.dirname(destinationPath));
    fs.rmSync(destinationPath, { recursive: true, force: true });
    fs.renameSync(sourcePath, destinationPath);
    console.log(`[organize-build-output] moved ${entryName} -> ${path.relative(buildOutputDir, destinationPath).replace(/\//g, '\\')}`);
}

function classifyEntry(entryName, buildOutputDir = getBuildOutputDir()) {
    const unpackedOutputDir = getUnpackedOutputDir(buildOutputDir);
    const nsisFeedOutputDir = getNsisFeedOutputDir(buildOutputDir);
    const nsisBlockmapOutputDir = getNsisBlockmapOutputDir(buildOutputDir);
    const nsisChecksumOutputDir = getNsisChecksumOutputDir(buildOutputDir);
    const nsisApplicationOutputDir = getNsisApplicationOutputDir(buildOutputDir);
    const linuxFeedOutputDir = getLinuxFeedOutputDir(buildOutputDir);
    const linuxChecksumOutputDir = getLinuxChecksumOutputDir(buildOutputDir);
    const linuxApplicationOutputDir = getLinuxApplicationOutputDir(buildOutputDir);
    const macFeedOutputDir = getMacFeedOutputDir(buildOutputDir);
    const macBlockmapOutputDir = getMacBlockmapOutputDir(buildOutputDir);
    const macChecksumOutputDir = getMacChecksumOutputDir(buildOutputDir);
    const macApplicationOutputDir = getMacApplicationOutputDir(buildOutputDir);
    const portableChecksumOutputDir = getPortableChecksumOutputDir(buildOutputDir);
    const portableApplicationOutputDir = getPortableApplicationOutputDir(buildOutputDir);
    const metadataOutputDir = path.join(buildOutputDir, 'metadata');
    const internalOutputDir = path.join(buildOutputDir, 'internal');

    // Intercept unpacked macOS directories before evaluating reservedNames
    if (entryName === 'mac-arm64' || entryName === 'mac-universal' || entryName === 'mac-unpacked') {
        return path.join(unpackedOutputDir, 'mac-unpacked');
    }

    if (entryName === 'mac') {
        const targetPath = path.join(buildOutputDir, 'mac');
        if (isMacCategorizedDir(targetPath)) {
            return null;
        }
        return path.join(unpackedOutputDir, 'mac-unpacked');
    }

    if (entryName === 'win-unpacked' || entryName === 'linux-unpacked') {
        return unpackedOutputDir;
    }

    const reservedNames = new Set([
        path.basename(getNsisOutputDir(buildOutputDir)),
        path.basename(getLinuxOutputDir(buildOutputDir)),
        path.basename(getMacOutputDir(buildOutputDir)),
        path.basename(unpackedOutputDir),
        path.basename(getPortableOutputDir(buildOutputDir)),
        path.basename(metadataOutputDir),
        path.basename(internalOutputDir)
    ]);

    if (reservedNames.has(entryName)) {
        return null;
    }

    if (entryName === 'latest.yml') {
        return nsisFeedOutputDir;
    }

    if (entryName === 'latest-linux.yml') {
        return linuxFeedOutputDir;
    }

    if (entryName === 'latest-mac.yml') {
        return macFeedOutputDir;
    }

    if (/^YumeShelf(?:-| )Setup[ -].+\.exe\.blockmap$/i.test(entryName)) {
        return nsisBlockmapOutputDir;
    }

    if (/^YumeShelf(?:-| )Setup[ -].+\.exe\.sha256$/i.test(entryName)) {
        return nsisChecksumOutputDir;
    }

    if (/^YumeShelf(?:-| )Setup[ -].+\.exe$/i.test(entryName)) {
        return nsisApplicationOutputDir;
    }

    if (/^YumeShelf(?:[ .-]|\b).+\.dmg\.blockmap$/i.test(entryName)) {
        return macBlockmapOutputDir;
    }

    if (/^YumeShelf(?:[ .-]|\b).+\.(?:dmg|zip)\.sha256$/i.test(entryName)) {
        return macChecksumOutputDir;
    }

    if (/^YumeShelf(?:[ .-]|\b).+\.(?:dmg|zip)$/i.test(entryName)) {
        return macApplicationOutputDir;
    }

    if (/^YumeShelf(?:[ .-]|\b).+\.(?:AppImage|tar\.gz)\.sha256$/i.test(entryName)) {
        return linuxChecksumOutputDir;
    }

    if (/^YumeShelf(?:[ .-]|\b).+\.(?:AppImage|tar\.gz)$/i.test(entryName)) {
        return linuxApplicationOutputDir;
    }

    if (/^YumeShelf(?:[ .])\d.+\.exe\.sha256$/i.test(entryName)) {
        return portableChecksumOutputDir;
    }

    if (/^YumeShelf(?:[ .])\d.+\.exe$/i.test(entryName)) {
        return portableApplicationOutputDir;
    }

    if (/^builder-(?:debug\.yml|effective-config\.yaml)$/i.test(entryName)) {
        return metadataOutputDir;
    }

    if (entryName === '.icon-ico' || entryName === 'release-recreate') {
        return internalOutputDir;
    }

    return null;
}

function classifyNsisNestedEntry(entryName, buildOutputDir = getBuildOutputDir()) {
    const nsisFeedOutputDir = getNsisFeedOutputDir(buildOutputDir);
    const nsisBlockmapOutputDir = getNsisBlockmapOutputDir(buildOutputDir);
    const nsisChecksumOutputDir = getNsisChecksumOutputDir(buildOutputDir);
    const nsisApplicationOutputDir = getNsisApplicationOutputDir(buildOutputDir);

    if (['application', 'blockmap', 'sha256', 'feed'].includes(entryName)) {
        return null;
    }

    if (entryName === 'latest.yml') {
        return nsisFeedOutputDir;
    }

    if (/^YumeShelf(?:-| )Setup[ -].+\.exe\.blockmap$/i.test(entryName)) {
        return nsisBlockmapOutputDir;
    }

    if (/^YumeShelf(?:-| )Setup[ -].+\.exe\.sha256$/i.test(entryName)) {
        return nsisChecksumOutputDir;
    }

    if (/^YumeShelf(?:-| )Setup[ -].+\.exe$/i.test(entryName)) {
        return nsisApplicationOutputDir;
    }

    return null;
}

function classifyLinuxNestedEntry(entryName, buildOutputDir = getBuildOutputDir()) {
    const linuxFeedOutputDir = getLinuxFeedOutputDir(buildOutputDir);
    const linuxChecksumOutputDir = getLinuxChecksumOutputDir(buildOutputDir);
    const linuxApplicationOutputDir = getLinuxApplicationOutputDir(buildOutputDir);

    if (['application', 'sha256', 'feed'].includes(entryName)) {
        return null;
    }

    if (entryName === 'latest-linux.yml') {
        return linuxFeedOutputDir;
    }

    if (/^YumeShelf(?:[ .-]|\b).+\.(?:AppImage|tar\.gz)\.sha256$/i.test(entryName)) {
        return linuxChecksumOutputDir;
    }

    if (/^YumeShelf(?:[ .-]|\b).+\.(?:AppImage|tar\.gz)$/i.test(entryName)) {
        return linuxApplicationOutputDir;
    }

    return null;
}

function classifyMacNestedEntry(entryName, buildOutputDir = getBuildOutputDir()) {
    const macFeedOutputDir = getMacFeedOutputDir(buildOutputDir);
    const macBlockmapOutputDir = getMacBlockmapOutputDir(buildOutputDir);
    const macChecksumOutputDir = getMacChecksumOutputDir(buildOutputDir);
    const macApplicationOutputDir = getMacApplicationOutputDir(buildOutputDir);

    if (['application', 'blockmap', 'sha256', 'feed'].includes(entryName)) {
        return null;
    }

    if (entryName === 'latest-mac.yml') {
        return macFeedOutputDir;
    }

    if (/^YumeShelf(?:[ .-]|\b).+\.dmg\.blockmap$/i.test(entryName)) {
        return macBlockmapOutputDir;
    }

    if (/^YumeShelf(?:[ .-]|\b).+\.(?:dmg|zip)\.sha256$/i.test(entryName)) {
        return macChecksumOutputDir;
    }

    if (/^YumeShelf(?:[ .-]|\b).+\.(?:dmg|zip)$/i.test(entryName)) {
        return macApplicationOutputDir;
    }

    return null;
}

function classifyPortableNestedEntry(entryName, buildOutputDir = getBuildOutputDir()) {
    const portableChecksumOutputDir = getPortableChecksumOutputDir(buildOutputDir);
    const portableApplicationOutputDir = getPortableApplicationOutputDir(buildOutputDir);

    if (['application', 'sha256'].includes(entryName)) {
        return null;
    }

    if (/^YumeShelf(?:[ .])\d.+\.exe\.sha256$/i.test(entryName)) {
        return portableChecksumOutputDir;
    }

    if (/^YumeShelf(?:[ .])\d.+\.exe$/i.test(entryName)) {
        return portableApplicationOutputDir;
    }

    return null;
}

function normalizeNestedEntries(parentDir, classifyNestedEntry, buildOutputDir = getBuildOutputDir()) {
    if (!fs.existsSync(parentDir)) {
        return;
    }

    const entries = fs.readdirSync(parentDir);
    for (const entryName of entries) {
        const sourcePath = path.join(parentDir, entryName);
        const destinationDir = classifyNestedEntry(entryName);
        if (!destinationDir) {
            continue;
        }
        const destinationPath = path.join(destinationDir, entryName);
        if (sourcePath === destinationPath) {
            continue;
        }
        ensureDir(destinationDir);
        fs.rmSync(destinationPath, { recursive: true, force: true });
        fs.renameSync(sourcePath, destinationPath);
        console.log(`[organize-build-output] moved ${path.relative(buildOutputDir, sourcePath).replace(/\//g, '\\')} -> ${path.relative(buildOutputDir, destinationPath).replace(/\//g, '\\')}`);
    }
}

function main(buildOutputDir = getBuildOutputDir()) {
    if (!fs.existsSync(buildOutputDir)) {
        console.log('[organize-build-output] build_output does not exist, nothing to do.');
        return;
    }

    const nsisOutputDir = getNsisOutputDir(buildOutputDir);
    const linuxOutputDir = getLinuxOutputDir(buildOutputDir);
    const macOutputDir = getMacOutputDir(buildOutputDir);
    const portableOutputDir = getPortableOutputDir(buildOutputDir);

    // Step 1: Move unpacked directories first so they do not collide with categorized category directories
    const unpackedDirNames = ['mac', 'mac-arm64', 'mac-universal', 'mac-unpacked', 'win-unpacked', 'linux-unpacked'];
    for (const unpackedName of unpackedDirNames) {
        const fullPath = path.join(buildOutputDir, unpackedName);
        if (fs.existsSync(fullPath)) {
            const destinationDir = classifyEntry(unpackedName, buildOutputDir);
            if (destinationDir) {
                moveEntry(unpackedName, destinationDir, buildOutputDir);
            }
        }
    }

    // Step 2: Classify and move remaining build output entries
    const entries = fs.readdirSync(buildOutputDir);
    for (const entryName of entries) {
        if (unpackedDirNames.includes(entryName)) {
            continue;
        }
        const destinationDir = classifyEntry(entryName, buildOutputDir);
        if (!destinationDir) {
            continue;
        }
        moveEntry(entryName, destinationDir, buildOutputDir);
    }

    normalizeNestedEntries(nsisOutputDir, (entry) => classifyNsisNestedEntry(entry, buildOutputDir), buildOutputDir);
    normalizeNestedEntries(linuxOutputDir, (entry) => classifyLinuxNestedEntry(entry, buildOutputDir), buildOutputDir);
    normalizeNestedEntries(macOutputDir, (entry) => classifyMacNestedEntry(entry, buildOutputDir), buildOutputDir);
    normalizeNestedEntries(portableOutputDir, (entry) => classifyPortableNestedEntry(entry, buildOutputDir), buildOutputDir);
}

if (require.main === module) {
    main();
}

module.exports = {
    classifyEntry,
    normalizeNestedEntries,
    moveEntry,
    organizeBuildOutput: main,
    classifyNsisNestedEntry,
    classifyLinuxNestedEntry,
    classifyMacNestedEntry,
    classifyPortableNestedEntry
};