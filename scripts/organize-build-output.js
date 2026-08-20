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
    getUnpackedOutputDir,
    getPortableOutputDir,
    getPortableApplicationOutputDir,
    getPortableChecksumOutputDir
} = require('./release-artifacts');

const buildOutputDir = getBuildOutputDir();
const nsisOutputDir = getNsisOutputDir(buildOutputDir);
const nsisApplicationOutputDir = getNsisApplicationOutputDir(buildOutputDir);
const nsisBlockmapOutputDir = getNsisBlockmapOutputDir(buildOutputDir);
const nsisChecksumOutputDir = getNsisChecksumOutputDir(buildOutputDir);
const nsisFeedOutputDir = getNsisFeedOutputDir(buildOutputDir);
const linuxOutputDir = getLinuxOutputDir(buildOutputDir);
const linuxApplicationOutputDir = getLinuxApplicationOutputDir(buildOutputDir);
const linuxChecksumOutputDir = getLinuxChecksumOutputDir(buildOutputDir);
const linuxFeedOutputDir = getLinuxFeedOutputDir(buildOutputDir);
const unpackedOutputDir = getUnpackedOutputDir(buildOutputDir);
const portableOutputDir = getPortableOutputDir(buildOutputDir);
const portableApplicationOutputDir = getPortableApplicationOutputDir(buildOutputDir);
const portableChecksumOutputDir = getPortableChecksumOutputDir(buildOutputDir);
const metadataOutputDir = path.join(buildOutputDir, 'metadata');
const internalOutputDir = path.join(buildOutputDir, 'internal');
const reservedNames = new Set([
    path.basename(nsisOutputDir),
    path.basename(linuxOutputDir),
    path.basename(unpackedOutputDir),
    path.basename(portableOutputDir),
    path.basename(metadataOutputDir),
    path.basename(internalOutputDir)
]);

function ensureDir(dirPath) {
    fs.mkdirSync(dirPath, { recursive: true });
}

function moveEntry(entryName, destinationDir) {
    const sourcePath = path.join(buildOutputDir, entryName);
    const destinationPath = path.join(destinationDir, entryName);
    ensureDir(destinationDir);
    fs.rmSync(destinationPath, { recursive: true, force: true });
    fs.renameSync(sourcePath, destinationPath);
    console.log(`[organize-build-output] moved ${entryName} -> ${path.relative(buildOutputDir, destinationPath).replace(/\//g, '\\')}`);
}

function classifyEntry(entryName) {
    if (reservedNames.has(entryName)) {
        return null;
    }

    if (entryName === 'win-unpacked' || entryName === 'linux-unpacked') {
        return unpackedOutputDir;
    }

    if (entryName === 'latest.yml') {
        return nsisFeedOutputDir;
    }

    if (entryName === 'latest-linux.yml') {
        return linuxFeedOutputDir;
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

function classifyNsisNestedEntry(entryName) {
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

function classifyLinuxNestedEntry(entryName) {
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

function classifyPortableNestedEntry(entryName) {
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

function normalizeNestedEntries(parentDir, classifyNestedEntry) {
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
        ensureDir(destinationDir);
        fs.rmSync(destinationPath, { recursive: true, force: true });
        fs.renameSync(sourcePath, destinationPath);
        console.log(`[organize-build-output] moved ${path.relative(buildOutputDir, sourcePath).replace(/\//g, '\\')} -> ${path.relative(buildOutputDir, destinationPath).replace(/\//g, '\\')}`);
    }
}

function main() {
    if (!fs.existsSync(buildOutputDir)) {
        console.log('[organize-build-output] build_output does not exist, nothing to do.');
        return;
    }

    const entries = fs.readdirSync(buildOutputDir);
    for (const entryName of entries) {
        const destinationDir = classifyEntry(entryName);
        if (!destinationDir) {
            continue;
        }
        moveEntry(entryName, destinationDir);
    }

    normalizeNestedEntries(nsisOutputDir, classifyNsisNestedEntry);
    normalizeNestedEntries(linuxOutputDir, classifyLinuxNestedEntry);
    normalizeNestedEntries(portableOutputDir, classifyPortableNestedEntry);
}

main();
