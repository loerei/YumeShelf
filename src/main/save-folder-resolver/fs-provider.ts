import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { FileSystemProvider } from './types';

export class DefaultFileSystemProvider implements FileSystemProvider {
    async exists(target: string): Promise<boolean> {
        try {
            await fs.access(target);
            return true;
        } catch (err: any) {
            if (err?.code !== 'ENOENT') {
                console.warn(`[SAVE-RESOLVER][FS] Error checking existence for ${target}:`, err);
            }
            return false;
        }
    }

    async isDirectory(target: string): Promise<boolean> {
        try {
            const stat = await fs.stat(target);
            return stat.isDirectory();
        } catch (err: any) {
            if (err?.code !== 'ENOENT') {
                console.warn(`[SAVE-RESOLVER][FS] Error checking stat for ${target}:`, err);
            }
            return false;
        }
    }

    async readdir(dir: string): Promise<string[]> {
        try {
            return await fs.readdir(dir);
        } catch (err: any) {
            if (err?.code !== 'ENOENT') {
                console.warn(`[SAVE-RESOLVER][FS] Error reading directory ${dir}:`, err);
            }
            return [];
        }
    }

    async readFile(target: string, encoding: string): Promise<string> {
        return await fs.readFile(target, encoding as BufferEncoding);
    }

    async globMatch(dir: string, pattern: RegExp): Promise<boolean> {
        try {
            const entries = await fs.readdir(dir);
            return entries.some((entry) => pattern.test(entry));
        } catch (err: any) {
            if (err?.code !== 'ENOENT') {
                console.warn(`[SAVE-RESOLVER][FS] Error globbing directory ${dir}:`, err);
            }
            return false;
        }
    }

    getEnv(key: string): string | undefined {
        return process.env[key];
    }

    dirname(target: string): string {
        return path.dirname(target);
    }

    basename(target: string): string {
        return path.basename(target);
    }

    join(...paths: string[]): string {
        return path.join(...paths);
    }

    getHomeDir(): string {
        return process.env.HOME || process.env.USERPROFILE || '';
    }

    getXdgConfigHome(): string {
        return process.env.XDG_CONFIG_HOME || path.join(this.getHomeDir(), '.config');
    }

    getXdgDataHome(): string {
        return process.env.XDG_DATA_HOME || path.join(this.getHomeDir(), '.local', 'share');
    }

    async getWinePrefixRoots(exeDir?: string): Promise<string[]> {
        const roots = new Set<string>();

        // 1. Direct environment variable
        const envPrefix = process.env.WINEPREFIX;
        if (envPrefix && (await this.exists(envPrefix))) {
            roots.add(path.resolve(envPrefix));
        }

        // 2. Default ~/.wine prefix
        const homeDir = this.getHomeDir();
        if (homeDir) {
            const defaultWine = path.join(homeDir, '.wine');
            if (await this.exists(defaultWine)) {
                roots.add(defaultWine);
            }

            // 3. Steam Proton compatdata prefixes
            const steamCompatPaths = [
                path.join(homeDir, '.steam', 'steam', 'steamapps', 'compatdata'),
                path.join(homeDir, '.local', 'share', 'Steam', 'steamapps', 'compatdata'),
                path.join(homeDir, '.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'Steam', 'steamapps', 'compatdata')
            ];

            for (const compatRoot of steamCompatPaths) {
                if (await this.exists(compatRoot)) {
                    try {
                        const appDirs = await this.readdir(compatRoot);
                        for (const appDir of appDirs) {
                            const pfx = path.join(compatRoot, appDir, 'pfx');
                            if (await this.exists(pfx)) {
                                roots.add(pfx);
                            }
                        }
                    } catch {
                        // ignore
                    }
                }
            }
        }

        // 4. Ancestor drive_c prefix discovery if exeDir is inside a prefix
        if (exeDir) {
            const normalized = path.resolve(exeDir).replaceAll('\\', '/');
            const driveCIdx = normalized.toLowerCase().indexOf('/drive_c');
            if (driveCIdx > 0) {
                const candidatePrefix = normalized.substring(0, driveCIdx);
                if (await this.exists(candidatePrefix)) {
                    roots.add(path.resolve(candidatePrefix));
                }
            }
        }

        return Array.from(roots);
    }

    async getWineAppDataPaths(prefix: string, type: 'Roaming' | 'Local' | 'LocalLow'): Promise<string[]> {
        const usersDir = path.join(prefix, 'drive_c', 'users');
        if (!(await this.exists(usersDir))) return [];

        const results: string[] = [];
        try {
            const users = await this.readdir(usersDir);
            for (const user of users) {
                if (/^(public|default|all users|default user)$/i.test(user)) continue;
                let appDataSub = '';
                if (type === 'Roaming') {
                    appDataSub = path.join('AppData', 'Roaming');
                } else if (type === 'LocalLow') {
                    appDataSub = path.join('AppData', 'LocalLow');
                } else {
                    appDataSub = path.join('AppData', 'Local');
                }

                const targetDir = path.join(usersDir, user, appDataSub);
                if (await this.exists(targetDir)) {
                    results.push(targetDir);
                }
            }
        } catch {
            // ignore
        }
        return results;
    }
}

export class MockFileSystemProvider implements FileSystemProvider {
    private readonly files = new Map<string, string>();
    private readonly directories = new Set<string>();
    private readonly env = new Map<string, string>();

    constructor(initialEnv?: Record<string, string>) {
        if (initialEnv) {
            for (const [k, v] of Object.entries(initialEnv)) {
                this.env.set(k, v);
            }
        }
    }

    setEnv(key: string, value: string): void {
        this.env.set(key, value);
    }

    getEnv(key: string): string | undefined {
        return this.env.get(key);
    }

    addFile(filePath: string, content = ''): void {
        const normalized = this.normalize(filePath);
        this.files.set(normalized, content);
        let parent = this.dirname(normalized);
        while (parent && parent !== normalized) {
            this.directories.add(parent);
            const nextParent = this.dirname(parent);
            if (nextParent === parent) break;
            parent = nextParent;
        }
    }

    addDirectory(dirPath: string): void {
        const normalized = this.normalize(dirPath);
        this.directories.add(normalized);
        let parent = this.dirname(normalized);
        while (parent && parent !== normalized) {
            this.directories.add(parent);
            const nextParent = this.dirname(parent);
            if (nextParent === parent) break;
            parent = nextParent;
        }
    }

    private normalize(p: string): string {
        let norm = p.replaceAll('\\', '/');
        while (norm.length > 1 && norm.endsWith('/')) {
            norm = norm.slice(0, -1);
        }
        return norm;
    }

    async exists(target: string): Promise<boolean> {
        const norm = this.normalize(target);
        return this.files.has(norm) || this.directories.has(norm);
    }

    async isDirectory(target: string): Promise<boolean> {
        const norm = this.normalize(target);
        return this.directories.has(norm);
    }

    async readdir(dir: string): Promise<string[]> {
        const norm = this.normalize(dir);
        if (!this.directories.has(norm)) return [];
        const prefix = norm ? `${norm}/` : '';
        const results = new Set<string>();

        for (const f of this.files.keys()) {
            if (f.startsWith(prefix)) {
                const rest = f.slice(prefix.length);
                const firstPart = rest.split('/')[0];
                if (firstPart) results.add(firstPart);
            }
        }

        for (const d of this.directories) {
            if (d.startsWith(prefix) && d !== norm) {
                const rest = d.slice(prefix.length);
                const firstPart = rest.split('/')[0];
                if (firstPart) results.add(firstPart);
            }
        }

        return Array.from(results);
    }

    async readFile(target: string): Promise<string> {
        const norm = this.normalize(target);
        const content = this.files.get(norm);
        if (content === undefined) throw new Error(`File not found: ${target}`);
        return content;
    }

    async globMatch(dir: string, pattern: RegExp): Promise<boolean> {
        const entries = await this.readdir(dir);
        return entries.some((entry) => pattern.test(entry));
    }

    dirname(target: string): string {
        const norm = this.normalize(target);
        const idx = norm.lastIndexOf('/');
        if (idx === -1) return '.';
        if (idx === 0) return '/';
        return norm.substring(0, idx);
    }

    basename(target: string): string {
        const norm = this.normalize(target);
        const idx = norm.lastIndexOf('/');
        if (idx === -1) return norm;
        return norm.substring(idx + 1);
    }

    join(...paths: string[]): string {
        const joined = paths.join('/').replaceAll('\\', '/');
        const parts = joined.split('/').filter(Boolean);
        const isAbsolute = joined.startsWith('/') || /^[a-zA-Z]:/.test(joined);
        const resultParts: string[] = [];
        for (const part of parts) {
            if (part === '.') continue;
            if (part === '..') {
                resultParts.pop();
            } else {
                resultParts.push(part);
            }
        }
        if (/^[a-zA-Z]:/.test(paths[0] || '')) {
            const drive = paths[0].substring(0, 2);
            return `${drive}/${resultParts.slice(1).join('/')}`;
        }
        return (isAbsolute ? '/' : '') + resultParts.join('/');
    }

    getHomeDir(): string {
        return this.env.get('HOME') || this.env.get('USERPROFILE') || '/home/user';
    }

    getXdgConfigHome(): string {
        return this.env.get('XDG_CONFIG_HOME') || this.join(this.getHomeDir(), '.config');
    }

    getXdgDataHome(): string {
        return this.env.get('XDG_DATA_HOME') || this.join(this.getHomeDir(), '.local', 'share');
    }

    async getWinePrefixRoots(exeDir?: string): Promise<string[]> {
        const roots = new Set<string>();
        const envPrefix = this.env.get('WINEPREFIX');
        if (envPrefix && (await this.exists(envPrefix))) {
            roots.add(this.normalize(envPrefix));
        }

        const homeDir = this.getHomeDir();
        if (homeDir) {
            const defaultWine = this.join(homeDir, '.wine');
            if (await this.exists(defaultWine)) {
                roots.add(this.normalize(defaultWine));
            }

            const steamCompatPaths = [
                this.join(homeDir, '.steam', 'steam', 'steamapps', 'compatdata'),
                this.join(homeDir, '.local', 'share', 'Steam', 'steamapps', 'compatdata')
            ];

            for (const compatRoot of steamCompatPaths) {
                if (await this.exists(compatRoot)) {
                    const appDirs = await this.readdir(compatRoot);
                    for (const appDir of appDirs) {
                        const pfx = this.join(compatRoot, appDir, 'pfx');
                        if (await this.exists(pfx)) {
                            roots.add(this.normalize(pfx));
                        }
                    }
                }
            }
        }

        if (exeDir) {
            const normalized = this.normalize(exeDir);
            const driveCIdx = normalized.toLowerCase().indexOf('/drive_c');
            if (driveCIdx > 0) {
                const candidatePrefix = normalized.substring(0, driveCIdx);
                if (await this.exists(candidatePrefix)) {
                    roots.add(this.normalize(candidatePrefix));
                }
            }
        }

        return Array.from(roots);
    }

    async getWineAppDataPaths(prefix: string, type: 'Roaming' | 'Local' | 'LocalLow'): Promise<string[]> {
        const usersDir = this.join(prefix, 'drive_c', 'users');
        if (!(await this.exists(usersDir))) return [];

        const results: string[] = [];
        const users = await this.readdir(usersDir);
        for (const user of users) {
            if (/^(public|default|all users|default user)$/i.test(user)) continue;
            let appDataSub = '';
            if (type === 'Roaming') {
                appDataSub = this.join('AppData', 'Roaming');
            } else if (type === 'LocalLow') {
                appDataSub = this.join('AppData', 'LocalLow');
            } else {
                appDataSub = this.join('AppData', 'Local');
            }

            const targetDir = this.join(usersDir, user, appDataSub);
            if (await this.exists(targetDir)) {
                results.push(this.normalize(targetDir));
            }
        }
        return results;
    }
}
