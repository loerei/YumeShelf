/// <reference types="node" />
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import type { IEnvironmentPaths } from '../types.js';

export type { IEnvironmentPaths };

export interface StandardEnvironmentPathsOptions {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
}

export class StandardEnvironmentPaths implements IEnvironmentPaths {
  private readonly platform: NodeJS.Platform;
  private readonly env: NodeJS.ProcessEnv;
  private readonly homeDirOverride?: string;

  constructor(options?: StandardEnvironmentPathsOptions) {
    this.platform = options?.platform ?? process.platform;
    this.env = options?.env ?? process.env;
    this.homeDirOverride = options?.homeDir;
  }

  getHomeDir(): string {
    if (this.homeDirOverride !== undefined) {
      return this.homeDirOverride;
    }
    const envHome = this.env.HOME || this.env.USERPROFILE;
    if (envHome) {
      return envHome;
    }
    try {
      return os.homedir() || '';
    } catch {
      return '';
    }
  }

  getAppData(): string {
    const home = this.getHomeDir();
    if (this.platform === 'win32') {
      return this.env.APPDATA || (home ? path.join(home, 'AppData', 'Roaming') : '');
    }
    if (this.platform === 'darwin') {
      return this.getAppSupportDir();
    }
    return this.env.XDG_CONFIG_HOME || (home ? path.join(home, '.config') : '');
  }

  getLocalAppData(): string {
    const home = this.getHomeDir();
    if (this.platform === 'win32') {
      return this.env.LOCALAPPDATA || (home ? path.join(home, 'AppData', 'Local') : '');
    }
    if (this.platform === 'darwin') {
      return this.getCachesDir();
    }
    return this.env.XDG_DATA_HOME || (home ? path.join(home, '.local', 'share') : '');
  }

  getDocuments(): string {
    const home = this.getHomeDir();
    return home ? path.join(home, 'Documents') : '';
  }

  getSavedGames(): string {
    const home = this.getHomeDir();
    return home ? path.join(home, 'Saved Games') : '';
  }

  async getWinePrefixes(exeDir?: string): Promise<string[]> {
    const roots = new Set<string>();
    const envPrefix = this.env.WINEPREFIX;
    if (envPrefix) {
      try {
        await fs.access(envPrefix);
        roots.add(path.resolve(envPrefix));
      } catch {
        // ignore
      }
    }

    const home = this.getHomeDir();
    if (home) {
      const defaultWine = path.join(home, '.wine', 'drive_c');
      try {
        await fs.access(defaultWine);
        roots.add(defaultWine);
      } catch {
        // ignore
      }

      const defaultWineRoot = path.join(home, '.wine');
      try {
        await fs.access(defaultWineRoot);
        roots.add(defaultWineRoot);
      } catch {
        // ignore
      }
    }

    if (exeDir) {
      const normalized = path.resolve(exeDir).replace(/\\/g, '/');
      const driveCIdx = normalized.toLowerCase().indexOf('/drive_c');
      if (driveCIdx > 0) {
        const candidate = normalized.substring(0, driveCIdx + 8);
        try {
          await fs.access(candidate);
          roots.add(path.resolve(candidate));
        } catch {
          // ignore
        }
      }
    }

    return Array.from(roots);
  }

  getAppSupportDir(): string {
    const home = this.getHomeDir();
    return home ? path.join(home, 'Library', 'Application Support') : '';
  }

  getCachesDir(): string {
    const home = this.getHomeDir();
    return home ? path.join(home, 'Library', 'Caches') : '';
  }

  getPreferencesDir(): string {
    const home = this.getHomeDir();
    return home ? path.join(home, 'Library', 'Preferences') : '';
  }

  getAppDataPath(): string {
    return this.getAppData();
  }

  getLocalAppDataPath(): string {
    return this.getLocalAppData();
  }

  getUserProfilePath(): string {
    return this.getHomeDir();
  }

  getDocumentsPath(): string {
    return this.getDocuments();
  }

  getSavedGamesPath(): string {
    return this.getSavedGames();
  }

  getXdgDataHome(): string {
    const home = this.getHomeDir();
    return this.env.XDG_DATA_HOME || (home ? path.join(home, '.local', 'share') : '');
  }

  getXdgConfigHome(): string {
    const home = this.getHomeDir();
    return this.env.XDG_CONFIG_HOME || (home ? path.join(home, '.config') : '');
  }

  getMacApplicationSupportHome(): string {
    return this.getAppSupportDir();
  }

  getMacPreferencesHome(): string {
    return this.getPreferencesDir();
  }

  async getWinePrefixRoots(exeDir?: string): Promise<string[]> {
    return this.getWinePrefixes(exeDir);
  }

  async getWineAppDataPaths(prefix: string, type: 'Roaming' | 'Local' | 'LocalLow' = 'Roaming'): Promise<string[]> {
    const paths: string[] = [];
    const usersDir = path.join(prefix, 'users');
    try {
      await fs.access(usersDir);
      const users = await fs.readdir(usersDir);
      for (const u of users) {
        const appDataDir = path.join(usersDir, u, 'AppData', type);
        try {
          await fs.access(appDataDir);
          paths.push(appDataDir);
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }
    return paths;
  }
}
