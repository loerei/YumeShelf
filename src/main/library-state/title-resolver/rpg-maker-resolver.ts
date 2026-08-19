import * as path from 'path';
import { isGenericOrEmptyTitle } from './blocklist';

function safeParseJson(raw: string): any {
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

export async function resolveRpgMakerTitle(
    folderPath: string,
    preferredLocale: string | undefined,
    fs: any
): Promise<string | null> {
    const candidatePaths: string[] = [];

    // Localized directories based on preferredLocale
    if (preferredLocale) {
        const normLocale = preferredLocale.trim().toUpperCase();
        candidatePaths.push(
            path.join(folderPath, 'data', normLocale, 'System.json'),
            path.join(folderPath, 'www', 'data', normLocale, 'System.json')
        );
        if (normLocale === 'VI') {
            candidatePaths.push(
                path.join(folderPath, 'data', 'VN', 'System.json'),
                path.join(folderPath, 'www', 'data', 'VN', 'System.json')
            );
        } else if (normLocale === 'JA') {
            candidatePaths.push(
                path.join(folderPath, 'data', 'JP', 'System.json'),
                path.join(folderPath, 'www', 'data', 'JP', 'System.json')
            );
        } else if (normLocale === 'ZH') {
            candidatePaths.push(
                path.join(folderPath, 'data', 'CN', 'System.json'),
                path.join(folderPath, 'www', 'data', 'CN', 'System.json')
            );
        }
    }

    // English fallback
    candidatePaths.push(
        path.join(folderPath, 'data', 'EN', 'System.json'),
        path.join(folderPath, 'www', 'data', 'EN', 'System.json')
    );

    // Default System.json
    candidatePaths.push(
        path.join(folderPath, 'data', 'System.json'),
        path.join(folderPath, 'www', 'data', 'System.json')
    );

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

    // Fallback to package.json window.title
    const pkgPaths = [
        path.join(folderPath, 'package.json'),
        path.join(folderPath, 'www', 'package.json')
    ];
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
