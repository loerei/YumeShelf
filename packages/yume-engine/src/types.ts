/// <reference types="node" />
/**
 * Core types and interfaces for YumeEngine (@yumeshelf/engine)
 */

export type PlatformType = 'windows' | 'linux' | 'macos';

export interface MachOInspectionResult {
  magic: number;
  arch: 'x64' | 'arm64' | 'x86' | 'fat' | 'unknown';
  is64Bit: boolean;
  isLittleEndian: boolean;
  isFat: boolean;
  fatArchitectures?: Array<{ cputype: number; cpusubtype: number; offset: number; size: number }>;
}

export interface AppBundleInspectionResult {
  bundlePath: string;
  executablePath: string | null;
  executableName: string | null;
  bundleIdentifier: string | null;
  bundleName: string | null;
  displayName: string | null;
  profile?: GameEngineProfile;
}

export interface IFileHandle {
  read(offset: number, length: number): Promise<Buffer>;
  close(): Promise<void>;
}

export interface IFileSystem {
  open(path: string): Promise<IFileHandle>;
  readFile(path: string, encoding?: BufferEncoding): Promise<string | Buffer>;
  stat(path: string): Promise<{ size: number; isDirectory(): boolean; isFile(): boolean; mtimeMs?: number }>;
  readdir(path: string): Promise<string[]>;
  exists(path: string): Promise<boolean>;
}

export interface DirectorySizeResult {
  sizeBytes: number;
  fileCount: number;
  mtimeMs: number;
}

export interface IEnvironmentPaths {
  getHomeDir(): string;
  getAppData(): string;
  getLocalAppData(): string;
  getDocuments(): string;
  getSavedGames(): string;
  getWinePrefixes?(exeDir?: string): Promise<string[]> | string[];
  getAppSupportDir(): string;
  getCachesDir(): string;
  getPreferencesDir(): string;

  getAppDataPath(): string;
  getLocalAppDataPath(): string;
  getUserProfilePath(): string;
  getDocumentsPath(): string;
  getSavedGamesPath(): string;
  getWinePrefixRoots?(exeDir?: string): Promise<string[]> | string[];
  getWineAppDataPaths?(prefix: string, type?: 'Roaming' | 'Local' | 'LocalLow'): Promise<string[]> | string[];
  getXdgDataHome?(): string;
  getXdgConfigHome?(): string;
  getMacApplicationSupportHome?(): string;
  getMacPreferencesHome?(): string;
}

export interface FileSystemProvider extends IFileSystem, IEnvironmentPaths {}

export type F95EngineTag =
  | 'Unity'
  | 'RPGM'
  | "Ren'Py"
  | 'Wolf RPG'
  | 'Unreal Engine'
  | 'Godot'
  | 'Flash'
  | 'HTML'
  | 'Java'
  | 'QSP'
  | 'RAGS'
  | 'ADRIFT'
  | 'Tads'
  | 'Others';

export interface GameEngineProfile {
  tag: F95EngineTag;
  family:
    | 'unity'
    | 'rpg-maker'
    | 'wolf-rpg'
    | 'renpy'
    | 'godot'
    | 'unreal'
    | 'flash'
    | 'java'
    | 'qsp'
    | 'rags'
    | 'adrift'
    | 'tads'
    | 'html-webgl'
    | 'gamemaker'
    | 'kirikiri'
    | 'tyranobuilder'
    | 'bgi-ethornell'
    | 'catsystem'
    | 'siglus-reallive'
    | 'nitroplus'
    | 'majiro'
    | 'nscripter'
    | 'artemis'
    | 'lilim'
    | 'livemaker'
    | 'advplayer'
    | 'silky'
    | 'system-nnn'
    | 'circus'
    | 'emote'
    | 'native'
    | 'unknown';
  variant?: 'mono' | 'il2cpp' | 'mv' | 'mz' | 'vx-ace' | 'vx' | 'xp' | '2000-2003' | 'ue4-ue5' | 'studio' | 'xp3' | 'standard' | string;
  arch: 'x64' | 'arm64' | 'x86' | 'fat' | 'unknown';
  runtime:
    | 'native'
    | 'nwjs'
    | 'electron'
    | 'python'
    | 'mono'
    | 'flash'
    | 'jvm'
    | 'qsp-runtime'
    | 'dotnet-rags'
    | 'adrift-runner'
    | 'tads-vm'
    | 'webgl-browser';
  saveStrategy:
    | 'rpg-maker-mv-mz'
    | 'rpg-maker-rgss'
    | 'wolf-sav'
    | 'renpy-pickle'
    | 'godot'
    | 'unreal-sav'
    | 'gamemaker-appdata'
    | 'qsp-savedgame'
    | 'rags-save'
    | 'adrift-save'
    | 'tads-save'
    | 'unity-appsupport-playerprefs'
    | 'rpgmaker-bundle-data'
    | 'renpy-appsupport-saves'
    | 'godot-appsupport-user'
    | 'custom'
    | 'unknown';
  detectedBy: string;
}

export interface ResolvedSaveLocation {
  path: string | null;
  confidence: 'high' | 'medium' | 'low' | 'none';
  source: 'override' | 'deterministic' | 'heuristic' | 'appdata' | 'user-profile' | 'wine' | 'none';
  matchedStrategy?: string;
  files?: string[];
}

export type ProgressUnit = 'bytes' | 'items' | 'percent';

export interface CodecProgressUpdate {
  current: number;
  total: number;
  percent: number;
  unit: ProgressUnit | string;
  pos?: number;
  totalBytes?: number;
  iterations?: number;
}

export interface SaveCodecOptions {
  stalenessTimeoutMs?: number;
  stalenessTracker?: import('./save-codecs/staleness-tracker.js').StalenessTracker;
  earlyExit?: boolean;
  earlyExitRoots?: boolean;
  onProgress?: (progress: CodecProgressUpdate) => void;
  shouldCancel?: () => boolean;
  savePath?: string;
  originalBuffer?: Buffer;
  wrapInZip?: boolean;
  [key: string]: any;
}

export interface SaveCodecContext {
  fileName?: string;
  gameTitle?: string;
  gameKey?: string;
  options?: SaveCodecOptions;
  runner?: import('./process/types.js').IProcessRunner;
  assemblyPath?: string;
  converterPath?: string;
}

export type { StalenessTracker, StalenessTrackerOptions } from './save-codecs/staleness-tracker.js';
export type { SaveCodecErrorCode } from './saves/errors.js';
export { SaveCodecError } from './saves/errors.js';
export type {
  IProcessRunner,
  ProcessRunOptions,
  ProcessRunResult,
} from './process/types.js';
export {
  DEFAULT_PROCESS_TIMEOUT_MS,
  DEFAULT_GRACE_PERIOD_MS,
  DEFAULT_MAX_BUFFER_BYTES,
} from './process/types.js';

