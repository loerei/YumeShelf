/**
 * In-memory FileSystemProvider for headless tests
 */

import { Buffer } from 'node:buffer';
import type { FileSystemProvider, IFileHandle } from '../../src/types.js';

function normalizeLookupKey(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+/g, '/').toLowerCase();
}

function cleanPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+/g, '/');
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
  private files: Map<string, { originalPath: string; buffer: Buffer }> = new Map();
  private directories: Map<string, string> = new Map();

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

  public writeFile(path: string, content: string | Buffer = ''): void {
    const cleaned = cleanPath(path);
    const key = normalizeLookupKey(cleaned);
    const buf = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
    this.files.set(key, { originalPath: cleaned, buffer: buf });
    this.ensureParentDirectories(cleaned);
  }

  public mkdir(path: string): void {
    this.ensureDirectory(path);
  }

  public deleteFile(path: string): void {
    const key = normalizeLookupKey(path);
    this.files.delete(key);
  }

  private ensureDirectory(path: string): void {
    const cleaned = cleanPath(path);
    const parts = cleaned.split('/').filter(Boolean);
    let current = cleaned.startsWith('/') ? '' : '';
    for (const part of parts) {
      current = current ? `${current}/${part}` : (cleaned.startsWith('/') ? `/${part}` : part);
      this.directories.set(normalizeLookupKey(current), current);
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
    const key = normalizeLookupKey(path);
    const entry = this.files.get(key);
    if (!entry) {
      throw new Error(`ENOENT: no such file or directory, open '${path}'`);
    }

    const buf = entry.buffer;
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
    const key = normalizeLookupKey(path);
    const entry = this.files.get(key);
    if (!entry) {
      throw new Error(`ENOENT: no such file or directory, open '${path}'`);
    }
    if (encoding) {
      return entry.buffer.toString(encoding);
    }
    return Buffer.from(entry.buffer);
  }

  async stat(path: string): Promise<{ size: number; isDirectory(): boolean; isFile(): boolean; mtimeMs?: number }> {
    const key = normalizeLookupKey(path);
    if (this.files.has(key)) {
      const size = this.files.get(key)!.buffer.length;
      return {
        size,
        isDirectory: () => false,
        isFile: () => true,
        mtimeMs: 1700000000000,
      };
    }
    if (this.directories.has(key)) {
      return {
        size: 0,
        isDirectory: () => true,
        isFile: () => false,
        mtimeMs: 1700000000000,
      };
    }
    throw new Error(`ENOENT: no such file or directory, stat '${path}'`);
  }

  async readdir(path: string): Promise<string[]> {
    const cleaned = cleanPath(path).replace(/\/+$/, '');
    const key = normalizeLookupKey(cleaned);
    const prefix = key ? `${key}/` : '';
    const entries = new Map<string, string>(); // lowerName -> originalName

    for (const fileEntry of this.files.values()) {
      const fileKey = normalizeLookupKey(fileEntry.originalPath);
      if (fileKey.startsWith(prefix)) {
        const restKey = fileKey.slice(prefix.length);
        const restOrig = fileEntry.originalPath.slice(cleaned.length + (cleaned ? 1 : 0));
        const firstSegmentKey = restKey.split('/')[0];
        const firstSegmentOrig = restOrig.split('/')[0];
        if (firstSegmentKey && !entries.has(firstSegmentKey)) {
          entries.set(firstSegmentKey, firstSegmentOrig);
        }
      }
    }

    for (const [dirKey, dirOrig] of this.directories.entries()) {
      if (dirKey.startsWith(prefix) && dirKey !== key) {
        const restKey = dirKey.slice(prefix.length);
        const restOrig = dirOrig.slice(cleaned.length + (cleaned ? 1 : 0));
        const firstSegmentKey = restKey.split('/')[0];
        const firstSegmentOrig = restOrig.split('/')[0];
        if (firstSegmentKey && !entries.has(firstSegmentKey)) {
          entries.set(firstSegmentKey, firstSegmentOrig);
        }
      }
    }

    if (entries.size === 0 && !this.directories.has(key) && !this.files.has(key)) {
      throw new Error(`ENOENT: no such file or directory, scandir '${path}'`);
    }

    return Array.from(entries.values());
  }

  async exists(path: string): Promise<boolean> {
    const key = normalizeLookupKey(path);
    return this.files.has(key) || this.directories.has(key);
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

  getWineAppDataPaths(prefix?: string, type: 'Roaming' | 'Local' | 'LocalLow' = 'Roaming'): string[] {
    if (type === 'Local') {
      return this.wineAppDataPaths.map((p) => p.replace(/Roaming$/i, 'Local'));
    }
    if (type === 'LocalLow') {
      return this.wineAppDataPaths.map((p) => p.replace(/Roaming$/i, 'LocalLow'));
    }
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
