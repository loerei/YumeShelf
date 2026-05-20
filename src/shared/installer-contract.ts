// @ts-nocheck
const fs = require('fs/promises');

function escapeIniValue(value) {
    return String(value ?? '').replace(/\r?\n/g, ' ').trim();
}

function parseInstallerContract(text) {
    const sections = {};
    let currentSection = null;
    const lines = String(text || '').split(/\r?\n/);
    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || line.startsWith(';') || line.startsWith('#')) {
            continue;
        }
        const sectionMatch = line.match(/^\[(.+?)\]$/);
        if (sectionMatch) {
            currentSection = sectionMatch[1];
            if (!sections[currentSection]) {
                sections[currentSection] = {};
            }
            continue;
        }
        const separatorIndex = line.indexOf('=');
        if (!currentSection || separatorIndex <= 0) {
            continue;
        }
        const key = line.slice(0, separatorIndex).trim();
        const value = line.slice(separatorIndex + 1).trim();
        sections[currentSection][key] = value;
    }
    return sections;
}

function serializeInstallerContract(sections) {
    const chunks = [];
    for (const [sectionName, sectionValues] of Object.entries(sections || {})) {
        chunks.push(`[${sectionName}]`);
        for (const [key, value] of Object.entries(sectionValues || {})) {
            chunks.push(`${key}=${escapeIniValue(value)}`);
        }
        chunks.push('');
    }
    return `${chunks.join('\n').trim()}\n`;
}

async function readInstallerContract(filePath) {
    const rawText = await fs.readFile(filePath, 'utf8');
    return parseInstallerContract(rawText);
}

async function writeInstallerContract(filePath, sections) {
    const output = serializeInstallerContract(sections);
    await fs.writeFile(filePath, output, 'utf8');
}

module.exports = {
    parseInstallerContract,
    readInstallerContract,
    serializeInstallerContract,
    writeInstallerContract
};
