import * as path from 'path';
import { isGenericOrEmptyTitle } from './blocklist';

export async function resolveUnityTitle(candidateFolders: string[], fs: any): Promise<string | null> {
    if (!Array.isArray(candidateFolders) || candidateFolders.length === 0) return null;

    for (const targetDir of candidateFolders) {
        try {
            const entries = await fs.readdir(targetDir);
            if (!Array.isArray(entries)) continue;
            const dataDirName = entries.find((e: any) => {
                const name = typeof e === 'string' ? e : e?.name;
                const lower = String(name || '').toLowerCase();
                return lower.endsWith('_data') && lower !== 'data';
            });

            if (!dataDirName) continue;
            const dirNameStr = typeof dataDirName === 'string' ? dataDirName : dataDirName.name;

            const appInfoPath = path.join(targetDir, dirNameStr, 'app.info');
            const content = await fs.readFile(appInfoPath, 'utf8');
            const lines = content.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);

            if (lines.length >= 2) {
                const productName = lines[1];
                if (!isGenericOrEmptyTitle(productName)) {
                    return productName;
                }
            }
            if (lines.length >= 1 && !isGenericOrEmptyTitle(lines[0])) {
                return lines[0];
            }
        } catch {
            // Directory does not exist or cannot be read, continue
        }
    }

    return null;
}
