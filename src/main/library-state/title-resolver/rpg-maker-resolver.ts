import * as path from 'node:path';
import { isGenericOrEmptyTitle } from './blocklist';

function safeParseJson(raw: string): any {
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

export async function resolveRpgMakerTitle(
    candidateDirs: string[],
    preferredLocale: string | undefined,
    fs: any
): Promise<string | null> {
    const candidatePaths: string[] = [];

    const normLocale = preferredLocale ? preferredLocale.trim().toUpperCase() : null;

    for (const dir of candidateDirs) {
        // 1. Localized directories based on preferredLocale
        if (normLocale) {
            candidatePaths.push(
                path.join(dir, 'data', normLocale, 'System.json'),
                path.join(dir, 'www', 'data', normLocale, 'System.json')
            );
            if (normLocale === 'VI') {
                candidatePaths.push(
                    path.join(dir, 'data', 'VN', 'System.json'),
                    path.join(dir, 'www', 'data', 'VN', 'System.json')
                );
            } else if (normLocale === 'JA') {
                candidatePaths.push(
                    path.join(dir, 'data', 'JP', 'System.json'),
                    path.join(dir, 'www', 'data', 'JP', 'System.json')
                );
            } else if (normLocale === 'ZH') {
                candidatePaths.push(
                    path.join(dir, 'data', 'CN', 'System.json'),
                    path.join(dir, 'www', 'data', 'CN', 'System.json')
                );
            }
        }

        // 2. English fallback and default System.json (both upper/lower cases for Linux ext4/btrfs)
        candidatePaths.push(
            path.join(dir, 'data', 'EN', 'System.json'),
            path.join(dir, 'data', 'en', 'system.json'),
            path.join(dir, 'www', 'data', 'EN', 'System.json'),
            path.join(dir, 'www', 'data', 'en', 'system.json'),
            path.join(dir, 'data', 'System.json'),
            path.join(dir, 'data', 'system.json'),
            path.join(dir, 'Data', 'System.json'),
            path.join(dir, 'Data', 'system.json'),
            path.join(dir, 'www', 'data', 'System.json'),
            path.join(dir, 'www', 'data', 'system.json'),
            path.join(dir, 'www', 'Data', 'System.json'),
            path.join(dir, 'www', 'Data', 'system.json')
        );
    }

    for (const sysPath of candidatePaths) {
        try {
            const raw = await fs.readFile(sysPath, 'utf8');
            const data = safeParseJson(raw);
            if (data && typeof data.gameTitle === 'string' && !isGenericOrEmptyTitle(data.gameTitle)) {
                return data.gameTitle.trim();
            }
        } catch {
            // Continue
        }
    }

    // Fallback to package.json window.title across candidateDirs
    const pkgPaths: string[] = [];
    for (const dir of candidateDirs) {
        pkgPaths.push(
            path.join(dir, 'package.json'),
            path.join(dir, 'www', 'package.json')
        );
    }

    for (const pkgPath of pkgPaths) {
        try {
            const raw = await fs.readFile(pkgPath, 'utf8');
            const data = safeParseJson(raw);
            if (data) {
                const title = data.window?.title || data.title || data.name;
                if (typeof title === 'string' && !isGenericOrEmptyTitle(title)) {
                    return title.trim();
                }
            }
        } catch {
            // Continue
        }
    }

    return null;
}
