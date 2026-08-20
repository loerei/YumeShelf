import * as path from 'node:path';

/**
 * Dynamic Directory Explorer
 * Collects candidate directories around exePath and folderPath without hardcoded folder names.
 * Traverses:
 * 1. Directory of exePath (the execution anchor)
 * 2. Ancestor chain climbing from exePath up to folderPath
 * 3. folderPath (the package root)
 * 4. Immediate child directories of folderPath (depth 1)
 */
export async function collectCandidateDirectories(
    folderPath: string,
    exePath: string | undefined,
    fs: any
): Promise<string[]> {
    const dirs = new Set<string>();
    const normalize = (p: string) => path.resolve(p).replace(/[\\/]+/g, '/');

    if (exePath) {
        let current = path.dirname(exePath);
        const normRoot = folderPath ? normalize(folderPath) : null;

        while (current) {
            dirs.add(normalize(current));
            if (!normRoot || normalize(current) === normRoot) break;
            const parent = path.dirname(current);
            if (parent === current) break;
            current = parent;
        }
    }

    if (folderPath) {
        const normFolder = normalize(folderPath);
        dirs.add(normFolder);
        try {
            const entries = await fs.readdir(folderPath);
            if (Array.isArray(entries)) {
                for (const entry of entries) {
                    const name = typeof entry === 'string' ? entry : entry?.name;
                    if (name) {
                        dirs.add(normalize(path.join(folderPath, name)));
                    }
                }
            }
        } catch {
            // Ignore if directory readdir fails
        }
    }

    return Array.from(dirs);
}
