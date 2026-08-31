/// <reference types="node" />
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { FileSystemProvider, IFileHandle } from '../types.js';

export class NodeFileSystemProvider implements FileSystemProvider {
  async open(filePath: string): Promise<IFileHandle> {
    const handle = await fs.open(filePath, 'r');
    return {
      read: async (offset: number, length: number): Promise<Buffer> => {
        const buf = Buffer.alloc(length);
        const { bytesRead } = await handle.read(buf, 0, length, offset);
        return buf.subarray(0, bytesRead);
      },
      close: async (): Promise<void> => {
        await handle.close();
      },
    };
  }

  async readFile(filePath: string, encoding?: BufferEncoding): Promise<string | Buffer> {
    if (encoding) {
      return fs.readFile(filePath, { encoding });
    }
    return fs.readFile(filePath);
  }

  async stat(filePath: string): Promise<{ size: number; isDirectory(): boolean; isFile(): boolean; mtimeMs?: number }> {
    const s = await fs.stat(filePath);
    return {
      size: s.size,
      isDirectory: () => s.isDirectory(),
      isFile: () => s.isFile(),
      mtimeMs: s.mtimeMs,
    };
  }

  async readdir(dirPath: string): Promise<string[]> {
    return fs.readdir(dirPath);
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  getAppDataPath(): string {
    return process.env.APPDATA || (os.homedir() ? path.join(os.homedir(), '.config') : '');
  }

  getLocalAppDataPath(): string {
    return process.env.LOCALAPPDATA || (os.homedir() ? path.join(os.homedir(), '.local', 'share') : '');
  }

  getUserProfilePath(): string {
    return process.env.USERPROFILE || os.homedir() || '';
  }

  getDocumentsPath(): string {
    const base = process.env.USERPROFILE || os.homedir() || '';
    return base ? path.join(base, 'Documents') : '';
  }

  getSavedGamesPath(): string {
    const base = process.env.USERPROFILE || os.homedir() || '';
    return base ? path.join(base, 'Saved Games') : '';
  }

  getXdgDataHome(): string {
    return process.env.XDG_DATA_HOME || (os.homedir() ? path.join(os.homedir(), '.local', 'share') : '');
  }

  getXdgConfigHome(): string {
    return process.env.XDG_CONFIG_HOME || (os.homedir() ? path.join(os.homedir(), '.config') : '');
  }

  async getWinePrefixRoots(exeDir?: string): Promise<string[]> {
    const roots: string[] = [];
    const home = os.homedir();
    if (home) {
      const defaultWine = path.join(home, '.wine', 'drive_c');
      if (await this.exists(defaultWine)) {
        roots.push(defaultWine);
      }
    }
    return roots;
  }

  async getWineAppDataPaths(prefix: string, type: 'Roaming' | 'Local' | 'LocalLow' = 'Roaming'): Promise<string[]> {
    const paths: string[] = [];
    const usersDir = path.join(prefix, 'users');
    if (await this.exists(usersDir)) {
      try {
        const users = await this.readdir(usersDir);
        for (const u of users) {
          const appDataDir = path.join(usersDir, u, 'AppData', type);
          if (await this.exists(appDataDir)) {
            paths.push(appDataDir);
          }
        }
      } catch {
        // ignore
      }
    }
    return paths;
  }
}
