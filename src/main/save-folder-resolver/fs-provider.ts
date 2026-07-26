import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { FileSystemProvider } from './types';

export class DefaultFileSystemProvider implements FileSystemProvider {
    async exists(target: string): Promise<boolean> {
        try {
            await fs.access(target);
            return true;
        } catch {
            return false;
        }
    }

    async isDirectory(target: string): Promise<boolean> {
        try {
            const stat = await fs.stat(target);
            return stat.isDirectory();
        } catch {
            return false;
        }
    }

    async readdir(dir: string): Promise<string[]> {
        try {
            return await fs.readdir(dir);
        } catch {
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
        } catch {
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
        return p.replaceAll('\\', '/').replace(/\/+$/, '');
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
}
