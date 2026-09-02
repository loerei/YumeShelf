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
  AppBundleInspectionResult,
  DirectorySizeResult,
  FileSystemProvider,
  GameEngineProfile,
  IFileHandle,
  IFileSystem,
  MachOInspectionResult,
  ResolvedSaveLocation,
  SaveCodecContext,
} from './types.js';
import { SaveCodecError } from './types.js';
import { PEInspector } from './pe/pe-inspector.js';
import {
  MachOInspector,
  MACHO_MAGIC_32_BE,
  MACHO_MAGIC_32_LE,
  MACHO_MAGIC_64_BE,
  MACHO_MAGIC_64_LE,
  FAT_MAGIC_32_BE,
  FAT_MAGIC_32_LE,
  FAT_MAGIC_64_BE,
  FAT_MAGIC_64_LE,
} from './binary/index.js';
import { AppBundleInspector, resolveBundleRoot, classifyAppBundle } from './bundle/index.js';
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
export * from './bundle/index.js';

const MACHO_MAGICS = new Set<number>([
  MACHO_MAGIC_32_BE,
  MACHO_MAGIC_32_LE,
  MACHO_MAGIC_64_BE,
  MACHO_MAGIC_64_LE,
  FAT_MAGIC_32_BE,
  FAT_MAGIC_32_LE,
  FAT_MAGIC_64_BE,
  FAT_MAGIC_64_LE,
]);

function isMachOMagic(buf: Buffer): boolean {
  if (!buf || buf.length < 4) {
    return false;
  }
  const magic = buf.readUInt32BE(0);
  return MACHO_MAGICS.has(magic);
}

async function readHeaderSlice(
  filePath: string,
  fs: IFileSystem,
  maxBytes = 4096
): Promise<Buffer | null> {
  let handle: IFileHandle | null = null;
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile() || stat.size < 4) {
      return null;
    }
    handle = await fs.open(filePath);
    const readLength = Math.min(stat.size, maxBytes);
    return await handle.read(0, readLength);
  } catch {
    return null;
  } finally {
    if (handle) {
      try {
        await handle.close();
      } catch {
        // ignore close error
      }
    }
  }
}

async function resolveParentFiles(
  exePath: string,
  parentFiles: string[] | undefined,
  fileSystem: IFileSystem
): Promise<string[]> {
  if (parentFiles) {
    return parentFiles;
  }
  const normalized = exePath.replace(/\\/g, '/');
  const lastSlash = normalized.lastIndexOf('/');
  const dir = lastSlash !== -1 ? normalized.substring(0, lastSlash) : '.';
  try {
    return await fileSystem.readdir(dir);
  } catch {
    return [];
  }
}

export class YumeEngine {
  static async inspectGame(
    targetPath: string,
    fs?: IFileSystem,
    parentFiles?: string[]
  ): Promise<GameEngineProfile> {
    return this.inspectExecutable(targetPath, fs, parentFiles);
  }

  static async inspectExecutable(
    exePath: string,
    fs?: IFileSystem,
    parentFiles?: string[]
  ): Promise<GameEngineProfile> {
    const fileSystem = fs || new NodeFileSystemProvider();

    const bundleRoot =
      resolveBundleRoot(exePath) ||
      (exePath.replace(/\\/g, '/').toLowerCase().endsWith('.app') ? exePath : null);

    if (bundleRoot) {
      const bundleInfo = await AppBundleInspector.fromPath(bundleRoot, fileSystem);
      return classifyAppBundle(bundleRoot, fileSystem, bundleInfo);
    }

    const isExe = exePath.toLowerCase().endsWith('.exe');

    if (isExe) {
      const inspector = await PEInspector.fromPath(exePath, fileSystem);
      if (inspector.isValid) {
        const files = await resolveParentFiles(exePath, parentFiles, fileSystem);
        return defaultRuleRegistry.resolve(inspector, exePath, files, fileSystem);
      }

      // PE magic failed on .exe -> check Mach-O fallback
      let isMachO = inspector.rawBuffer ? isMachOMagic(inspector.rawBuffer) : false;
      if (!isMachO) {
        const slice = await readHeaderSlice(exePath, fileSystem, 4096);
        if (slice && isMachOMagic(slice)) {
          isMachO = true;
        }
      }

      if (isMachO) {
        const macho = await MachOInspector.fromPath(exePath, fileSystem);
        return {
          tag: 'Others',
          family: 'native',
          variant: 'standard',
          arch: macho ? macho.arch : 'unknown',
          runtime: 'native',
          saveStrategy: 'unknown',
          detectedBy: 'Mach-O Binary',
        };
      }

      const files = await resolveParentFiles(exePath, parentFiles, fileSystem);
      return defaultRuleRegistry.resolve(inspector, exePath, files, fileSystem);
    }

    // Inspect initial header bytes (<= 4KB) for Mach-O magic
    const slice = await readHeaderSlice(exePath, fileSystem, 4096);
    if (slice && isMachOMagic(slice)) {
      const macho = await MachOInspector.fromPath(exePath, fileSystem);
      return {
        tag: 'Others',
        family: 'native',
        variant: 'standard',
        arch: macho ? macho.arch : 'unknown',
        runtime: 'native',
        saveStrategy: 'unknown',
        detectedBy: 'Mach-O Binary',
      };
    }

    // Fallback to PEInspector
    const inspector = await PEInspector.fromPath(exePath, fileSystem);
    const files = await resolveParentFiles(exePath, parentFiles, fileSystem);
    return defaultRuleRegistry.resolve(inspector, exePath, files, fileSystem);
  }

  static formatEngineName(profile?: GameEngineProfile | null): string | undefined {
    return formatEngineName(profile);
  }

  static async inspectMachOFile(
    filePath: string,
    fs?: IFileSystem
  ): Promise<MachOInspectionResult | null> {
    return MachOInspector.fromPath(filePath, fs);
  }

  static async inspectAppBundle(
    bundlePath: string,
    fs?: IFileSystem
  ): Promise<AppBundleInspectionResult | null> {
    const fileSystem = fs || new NodeFileSystemProvider();
    const result = await AppBundleInspector.fromPath(bundlePath, fileSystem);
    if (!result) {
      return null;
    }
    const profile = await classifyAppBundle(result.bundlePath, fileSystem, result);
    return new AppBundleInspector({
      ...result,
      profile,
    });
  }

  static async classifyAppBundle(
    bundlePath: string,
    fs?: IFileSystem,
    bundleInfo?: AppBundleInspectionResult | null
  ): Promise<GameEngineProfile> {
    return classifyAppBundle(bundlePath, fs, bundleInfo);
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
