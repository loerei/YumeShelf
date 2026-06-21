import * as fs from 'node:fs/promises';

export function escapeIniValue(value: any): string {
    return String(value ?? '').replace(/\r?\n/g, ' ').trim();
}

export function parseInstallerContract(text: string | null | undefined): Record<string, Record<string, string>> {
    const sections: Record<string, Record<string, string>> = {};
    let currentSection: string | null = null;
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

export function serializeInstallerContract(sections: Record<string, Record<string, any>>): string {
    const chunks: string[] = [];
    for (const [sectionName, sectionValues] of Object.entries(sections || {})) {
        chunks.push(`[${sectionName}]`);
        for (const [key, value] of Object.entries(sectionValues || {})) {
            chunks.push(`${key}=${escapeIniValue(value)}`);
        }
        chunks.push('');
    }
    return `${chunks.join('\n').trim()}\n`;
}

export async function readInstallerContract(filePath: string): Promise<Record<string, Record<string, string>>> {
    const rawText = await fs.readFile(filePath, 'utf8');
    return parseInstallerContract(rawText);
}

export async function writeInstallerContract(filePath: string, sections: Record<string, Record<string, any>>): Promise<void> {
    const output = serializeInstallerContract(sections);
    await fs.writeFile(filePath, output, 'utf8');
}
