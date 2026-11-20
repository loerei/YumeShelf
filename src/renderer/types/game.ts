export interface GameEntry {
  gameKey: string;
  gameId?: string;
  name: string;
  title?: string;
  exePath?: string;
  folderPath?: string;
  folderName?: string;
  relativePath?: string;
  instanceId?: string;
  primaryInstance?: GameEntry;
  favorite?: boolean;
  playtime?: number;
  basePlaytime?: number;
  lastPlayed?: number;
  dateAdded?: number;
  categoryIds?: string[];
  iconUrl?: string;
  isRunning?: boolean;
  runInBackground?: boolean;
  autoTranslate?: boolean;
  saveFolderOverride?: string | null;
  duplicateCount?: number;
  duplicateSignature?: string;
  instances?: GameEntry[];
  locationLabel?: string;
  parentLocationLabel?: string;
  relativePathDisplay?: string;
  fullLocationLabel?: string;
  relativePathFullDisplay?: string;
}

export interface LibraryPathConfig {
  libraryPaths?: string[];
  libraryPath?: string;
}

export type LibraryPathsInput = string | string[] | LibraryPathConfig;

export interface LibraryConfig extends LibraryPathConfig {
  libraryPaths: string[];
  libraryPath: string;
  maxDepth: number;
  autoLaunch: boolean | 'minimized';
  minimizeToTray: boolean;
  telemetryEnabled?: boolean;
  exposeBetaOptions?: boolean;
  titleDisplayMode?: 'metadata' | 'legacy_folder';
  displayProductCodes?: boolean;
  preferredLocale?: string;
  folderAliases?: Record<string, string>;
}
