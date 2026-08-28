/**
 * In-memory FileSystemProvider for headless tests
 */

import { Buffer } from 'node:buffer';
import type { FileSystemProvider, IFileHandle } from '../../src/types.js';

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+/g, '/').toLowerCase();
}

export interface MockFileSystemOptions {
  appDataPath?: string;
  localAppDataPath?: string;
  userProfilePath?: string;
  documentsPath?: string;
  savedGamesPath?: string;
  winePrefixRoots?: string[];
  wineAppDataPaths?: string[];
  xdgDataHome?: string;
  xdgConfigHome?: string;
}

export class MockFileSystemProvider implements FileSystemProvider {
  private files: Map<string, Buffer> = new Map();
  private directories: Set<string> = new Set();

  private appDataPath: string;
  private localAppDataPath: string;
  private userProfilePath: string;
  private documentsPath: string;
  private savedGamesPath: string;
  private winePrefixRoots: string[];
  private wineAppDataPaths: string[];
  private xdgDataHome: string;
  private xdgConfigHome: string;

  constructor(options: MockFileSystemOptions = {}) {
    this.appDataPath = options.appDataPath ?? 'C:/Users/MockUser/AppData/Roaming';
    this.localAppDataPath = options.localAppDataPath ?? 'C:/Users/MockUser/AppData/Local';
    this.userProfilePath = options.userProfilePath ?? 'C:/Users/MockUser';
    this.documentsPath = options.documentsPath ?? 'C:/Users/MockUser/Documents';
    this.savedGamesPath = options.savedGamesPath ?? 'C:/Users/MockUser/Saved Games';
    this.winePrefixRoots = options.winePrefixRoots ?? ['/home/mockuser/.wine/drive_c'];
    this.wineAppDataPaths = options.wineAppDataPaths ?? ['/home/mockuser/.wine/drive_c/users/mockuser/AppData/Roaming'];
    this.xdgDataHome = options.xdgDataHome ?? '/home/mockuser/.local/share';
    this.xdgConfigHome = options.xdgConfigHome ?? '/home/mockuser/.config';

    this.ensureDirectory(this.appDataPath);
    this.ensureDirectory(this.localAppDataPath);
    this.ensureDirectory(this.userProfilePath);
    this.ensureDirectory(this.documentsPath);
    this.ensureDirectory(this.savedGamesPath);
  }

  // --- Test Setup Helpers ---

  public writeFile(path: string, content: string | Buffer): void {
    const norm = normalizePath(path);
    const buf = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
    this.files.set(norm, buf);
    this.ensureParentDirectories(norm);
  }

  public mkdir(path: string): void {
    this.ensureDirectory(path);
  }

  public deleteFile(path: string): void {
    const norm = normalizePath(path);
    this.files.delete(norm);
  }

  private ensureDirectory(path: string): void {
    const norm = normalizePath(path);
    const parts = norm.split('/').filter(Boolean);
    let current = norm.startsWith('/') ? '' : '';
    for (const part of parts) {
      current = current ? `${current}/${part}` : (norm.startsWith('/') ? `/${part}` : part);
      this.directories.add(current);
    }
  }

  private ensureParentDirectories(filePath: string): void {
    const idx = filePath.lastIndexOf('/');
    if (idx > 0) {
      this.ensureDirectory(filePath.substring(0, idx));
    }
  }

  // --- IFileSystem Implementation ---

  async open(path: string): Promise<IFileHandle> {
    const norm = normalizePath(path);
    const buf = this.files.get(norm);
    if (!buf) {
      throw new Error(`ENOENT: no such file or directory, open '${path}'`);
    }

    return {
      read: async (offset: number, length: number): Promise<Buffer> => {
        if (offset < 0 || offset >= buf.length) {
          return Buffer.alloc(0);
        }
        const end = Math.min(offset + length, buf.length);
        return Buffer.from(buf.subarray(offset, end));
      },
      close: async (): Promise<void> => {
        // No-op for in-memory buffers
      },
    };
  }

  async readFile(path: string, encoding?: BufferEncoding): Promise<string | Buffer> {
    const norm = normalizePath(path);
    const buf = this.files.get(norm);
    if (!buf) {
      throw new Error(`ENOENT: no such file or directory, open '${path}'`);
    }
    if (encoding) {
      return buf.toString(encoding);
    }
    return Buffer.from(buf);
  }

  async stat(path: string): Promise<{ size: number; isDirectory(): boolean; isFile(): boolean }> {
    const norm = normalizePath(path);
    if (this.files.has(norm)) {
      const size = this.files.get(norm)!.length;
      return {
        size,
        isDirectory: () => false,
        isFile: () => true,
      };
    }
    if (this.directories.has(norm)) {
      return {
        size: 0,
        isDirectory: () => true,
        isFile: () => false,
      };
    }
    throw new Error(`ENOENT: no such file or directory, stat '${path}'`);
  }

  async readdir(path: string): Promise<string[]> {
    const norm = normalizePath(path).replace(/\/+$/, '');
    const prefix = norm ? `${norm}/` : '';
    const entries = new Set<string>();

    for (const file of this.files.keys()) {
      if (file.startsWith(prefix)) {
        const rest = file.slice(prefix.length);
        const firstSegment = rest.split('/')[0];
        if (firstSegment) entries.add(firstSegment);
      }
    }

    for (const dir of this.directories) {
      if (dir.startsWith(prefix) && dir !== norm) {
        const rest = dir.slice(prefix.length);
        const firstSegment = rest.split('/')[0];
        if (firstSegment) entries.add(firstSegment);
      }
    }

    if (entries.size === 0 && !this.directories.has(norm) && !this.files.has(norm)) {
      throw new Error(`ENOENT: no such file or directory, scandir '${path}'`);
    }

    return Array.from(entries);
  }

  async exists(path: string): Promise<boolean> {
    const norm = normalizePath(path);
    return this.files.has(norm) || this.directories.has(norm);
  }

  // --- IEnvironmentPaths Implementation ---

  getAppDataPath(): string {
    return this.appDataPath;
  }

  setAppDataPath(p: string): void {
    this.appDataPath = p;
    this.ensureDirectory(p);
  }

  getLocalAppDataPath(): string {
    return this.localAppDataPath;
  }

  setLocalAppDataPath(p: string): void {
    this.localAppDataPath = p;
    this.ensureDirectory(p);
  }

  getUserProfilePath(): string {
    return this.userProfilePath;
  }

  setUserProfilePath(p: string): void {
    this.userProfilePath = p;
    this.ensureDirectory(p);
  }

  getDocumentsPath(): string {
    return this.documentsPath;
  }

  setDocumentsPath(p: string): void {
    this.documentsPath = p;
    this.ensureDirectory(p);
  }

  getSavedGamesPath(): string {
    return this.savedGamesPath;
  }

  setSavedGamesPath(p: string): void {
    this.savedGamesPath = p;
    this.ensureDirectory(p);
  }

  getWinePrefixRoots(): string[] {
    return this.winePrefixRoots;
  }

  setWinePrefixRoots(roots: string[]): void {
    this.winePrefixRoots = roots;
  }

  getWineAppDataPaths(): string[] {
    return this.wineAppDataPaths;
  }

  setWineAppDataPaths(paths: string[]): void {
    this.wineAppDataPaths = paths;
  }

  getXdgDataHome(): string {
    return this.xdgDataHome;
  }

  setXdgDataHome(p: string): void {
    this.xdgDataHome = p;
  }

  getXdgConfigHome(): string {
    return this.xdgConfigHome;
  }

  setXdgConfigHome(p: string): void {
    this.xdgConfigHome = p;
  }
}
