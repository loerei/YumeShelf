/// <reference types="node" />
/**
 * YumeEngine (@yumeshelf/engine)
 * Headless Game Engine Inspector, Save Resolver & Codec Core
 *
 * Derived from Detect-It-Easy & XPEViewer specifications by horsicq,
 * XUnity.AutoTranslator by bbepis, and BepInEx runtime hooking models.
 * MIT License - Copyright (c) horsicq, bbepis, BepInEx Contributors / YumeShelf Contributors
 */

import type {
  DirectorySizeResult,
  FileSystemProvider,
  GameEngineProfile,
  IFileSystem,
  ResolvedSaveLocation,
  SaveCodecContext,
} from './types.js';
import { SaveCodecError } from './types.js';
import { PEInspector } from './pe/pe-inspector.js';
import { defaultRuleRegistry } from './rules/engine-rule-registry.js';
import { formatEngineName } from './rules/engine-formatter.js';
import { resolveSaveDirectory, type ResolveSaveOptions } from './save-resolvers/index.js';
import { NodeFileSystemProvider } from './fs/node-fs-provider.js';
import { calculateDirectorySize } from './fs/directory-size.js';

import {
  decodeSaveFile,
  encodeSaveFile,
  detectSaveStrategy,
  isSupportedSaveFile,
  listSupportedSaveExtensions,
} from './save-codecs/index.js';

export type * from './types.js';
export { SaveCodecError } from './types.js';
export * from './pe/index.js';
export * from './binary/index.js';
export * from './rules/index.js';
export * from './save-resolvers/index.js';
export * from './save-codecs/index.js';
export * from './fs/index.js';
export * from './process/index.js';

export class YumeEngine {
  static async inspectExecutable(
    exePath: string,
    fs?: IFileSystem,
    parentFiles?: string[]
  ): Promise<GameEngineProfile> {
    const fileSystem = fs || new NodeFileSystemProvider();
    const inspector = await PEInspector.fromPath(exePath, fileSystem);
    let files = parentFiles;

    if (!files) {
      const normalized = exePath.replace(/\\/g, '/');
      const lastSlash = normalized.lastIndexOf('/');
      const dir = lastSlash !== -1 ? normalized.substring(0, lastSlash) : '.';
      try {
        files = await fileSystem.readdir(dir);
      } catch {
        files = [];
      }
    }

    return defaultRuleRegistry.resolve(inspector, exePath, files || [], fileSystem);
  }

  static formatEngineName(profile?: GameEngineProfile | null): string | undefined {
    return formatEngineName(profile);
  }

  static async calculateDirectorySize(
    dirPath: string,
    fs?: IFileSystem
  ): Promise<DirectorySizeResult> {
    return calculateDirectorySize(dirPath, fs);
  }

  static async resolveSaveDirectory(
    profile: GameEngineProfile | undefined,
    exePath: string,
    fs?: FileSystemProvider,
    options?: ResolveSaveOptions
  ): Promise<ResolvedSaveLocation | null> {
    const provider = fs || new NodeFileSystemProvider();
    return resolveSaveDirectory(profile, exePath, provider, options);
  }

  static detectSaveStrategy(fileName: string): string | null {
    return detectSaveStrategy(fileName);
  }

  static isSupportedSaveFile(fileName: string): boolean {
    return isSupportedSaveFile(fileName);
  }

  static listSupportedSaveExtensions(): string[] {
    return listSupportedSaveExtensions();
  }

  static async decodeSaveFile(
    strategy: string,
    rawBuffer: Buffer,
    context?: SaveCodecContext
  ): Promise<any> {
    return decodeSaveFile(strategy, rawBuffer, context);
  }

  static async encodeSaveFile(
    strategy: string,
    jsonData: any,
    context?: SaveCodecContext
  ): Promise<Buffer> {
    return encodeSaveFile(strategy, jsonData, context);
  }
}
