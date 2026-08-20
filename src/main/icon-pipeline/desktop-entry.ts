import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';

export function parseDesktopFileIcon(content: string): string | null {
    const lines = content.split(/\r?\n/);
    let inDesktopEntry = false;

    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === '[Desktop Entry]') {
            inDesktopEntry = true;
            continue;
        }
        if (trimmed.startsWith('[') && inDesktopEntry) {
            // Reached next section
            break;
        }
        if (inDesktopEntry) {
            const match = trimmed.match(/^Icon\s*=\s*(.+)$/i);
            if (match) {
                return match[1].trim();
            }
        }
    }

    // Fallback: search anywhere in file if no explicit [Desktop Entry] section was found
    const fallbackMatch = content.match(/^Icon\s*=\s*(.+)$/im);
    return fallbackMatch ? fallbackMatch[1].trim() : null;
}

export function resolveDesktopIconPath(iconVal: string, baseDir: string): string | null {
    if (!iconVal) return null;

    // 1. Direct absolute path
    if (path.isAbsolute(iconVal) && fsSync.existsSync(iconVal)) {
        return iconVal;
    }

    // 2. Relative to baseDir
    const relativeCandidates = [
        path.join(baseDir, iconVal),
        path.join(baseDir, `${iconVal}.png`),
        path.join(baseDir, `${iconVal}.svg`),
        path.join(baseDir, `${iconVal}.xpm`)
    ];

    for (const cand of relativeCandidates) {
        if (fsSync.existsSync(cand)) {
            return cand;
        }
    }

    // 3. Standard Linux XDG Icon paths
    const home = process.env.HOME || '';
    const xdgDataHome = process.env.XDG_DATA_HOME || (home ? path.join(home, '.local', 'share') : '');

    const standardSearchDirs = [
        path.join(xdgDataHome, 'icons', 'hicolor', '256x256', 'apps'),
        path.join(xdgDataHome, 'icons', 'hicolor', '128x128', 'apps'),
        path.join(xdgDataHome, 'icons', 'hicolor', 'scalable', 'apps'),
        path.join(xdgDataHome, 'pixmaps'),
        '/usr/share/icons/hicolor/256x256/apps',
        '/usr/share/icons/hicolor/128x128/apps',
        '/usr/share/icons/hicolor/scalable/apps',
        '/usr/share/pixmaps'
    ];

    for (const searchDir of standardSearchDirs) {
        const extensions = ['', '.png', '.svg', '.xpm'];
        for (const ext of extensions) {
            const cand = path.join(searchDir, `${iconVal}${ext}`);
            if (fsSync.existsSync(cand)) {
                return cand;
            }
        }
    }

    return null;
}

export function findDesktopEntryIcon(gameDirOrFile: string): string | null {
    try {
        let desktopFiles: string[] = [];

        if (fsSync.existsSync(gameDirOrFile)) {
            const stat = fsSync.statSync(gameDirOrFile);
            if (stat.isFile() && gameDirOrFile.toLowerCase().endsWith('.desktop')) {
                desktopFiles = [gameDirOrFile];
            } else if (stat.isDirectory()) {
                const entries = fsSync.readdirSync(gameDirOrFile);
                desktopFiles = entries
                    .filter((e) => e.toLowerCase().endsWith('.desktop'))
                    .map((e) => path.join(gameDirOrFile, e));
            } else if (stat.isFile()) {
                const parentDir = path.dirname(gameDirOrFile);
                const entries = fsSync.readdirSync(parentDir);
                desktopFiles = entries
                    .filter((e) => e.toLowerCase().endsWith('.desktop'))
                    .map((e) => path.join(parentDir, e));
            }
        }

        for (const desktopFile of desktopFiles) {
            try {
                const content = fsSync.readFileSync(desktopFile, 'utf8');
                const iconVal = parseDesktopFileIcon(content);
                if (iconVal) {
                    const resolved = resolveDesktopIconPath(iconVal, path.dirname(desktopFile));
                    if (resolved) {
                        return resolved;
                    }
                }
            } catch {
                continue;
            }
        }
    } catch {
        // ignore errors
    }

    return null;
}
