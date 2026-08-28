/// <reference types="node" />
/**
 * Core types and interfaces for YumeEngine (@yumeshelf/engine)
 */

export interface IFileHandle {
  read(offset: number, length: number): Promise<Buffer>;
  close(): Promise<void>;
}

export interface IFileSystem {
  open(path: string): Promise<IFileHandle>;
  readFile(path: string, encoding?: BufferEncoding): Promise<string | Buffer>;
  stat(path: string): Promise<{ size: number; isDirectory(): boolean; isFile(): boolean }>;
  readdir(path: string): Promise<string[]>;
  exists(path: string): Promise<boolean>;
}

export interface IEnvironmentPaths {
  getAppDataPath(): string;
  getLocalAppDataPath(): string;
  getUserProfilePath(): string;
  getDocumentsPath(): string;
  getSavedGamesPath(): string;
  getWinePrefixRoots?(exeDir?: string): Promise<string[]> | string[];
  getWineAppDataPaths?(prefix: string, type?: 'Roaming' | 'Local' | 'LocalLow'): Promise<string[]> | string[];
  getXdgDataHome?(): string;
  getXdgConfigHome?(): string;
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
  arch: 'x64' | 'x86' | 'unknown';
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

export interface SaveCodecContext {
  fileName?: string;
  gameTitle?: string;
  gameKey?: string;
  options?: Record<string, any>;
}

export type SaveCodecErrorCode =
  | 'CHECKSUM_FAILED'
  | 'DECOMPRESSION_FAILED'
  | 'PARSE_FAILED'
  | 'UNSUPPORTED_FORMAT';

export class SaveCodecError extends Error {
  readonly code: SaveCodecErrorCode;

  constructor(message: string, code: SaveCodecErrorCode) {
    super(message);
    this.name = 'SaveCodecError';
    this.code = code;
  }
}

export interface IProcessRunner {
  run(
    command: string,
    args: string[],
    options?: {
      cwd?: string;
      timeout?: number;
      env?: Record<string, string>;
    }
  ): Promise<{ exitCode: number; stdout: string; stderr: string }>;
}
