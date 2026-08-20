import * as path from 'node:path';
import { isGenericOrEmptyTitle } from './blocklist';

export async function resolveUnityTitle(folderPath: string, fs: any): Promise<string | null> {
    if (!folderPath) return null;

    const candidateFolders = [
        folderPath,
        path.dirname(folderPath)
    ];

    for (const targetDir of candidateFolders) {
        try {
            const entries = await fs.readdir(targetDir);
            const dataDirName = entries.find((e: string) => {
                const lower = String(e || '').toLowerCase();
                return lower.endsWith('_data') && lower !== 'data';
            });

            if (!dataDirName) continue;

            const appInfoPath = path.join(targetDir, dataDirName, 'app.info');
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
