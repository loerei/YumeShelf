/// <reference types="node" />
/**
 * YumeEngine (@yumeshelf/engine)
 * Headless Game Engine Inspector, Save Resolver & Codec Core
 */

import type {
  FileSystemProvider,
  GameEngineProfile,
  IFileSystem,
  ResolvedSaveLocation,
  SaveCodecContext,
} from './types.js';
import { SaveCodecError } from './types.js';
import { PEInspector } from './pe/pe-inspector.js';
import { defaultRuleRegistry } from './rules/engine-rule-registry.js';
import { resolveSaveDirectory, type ResolveSaveOptions } from './save-resolvers/index.js';
import { NodeFileSystemProvider } from './fs/node-fs-provider.js';

export type * from './types.js';
export { SaveCodecError } from './types.js';
export * from './pe/index.js';
export * from './rules/index.js';
export * from './save-resolvers/index.js';
export * from './fs/index.js';

export class YumeEngine {
  static async inspectExecutable(
    exePath: string,
    fs?: IFileSystem,
    parentFiles?: string[]
  ): Promise<GameEngineProfile> {
    const inspector = await PEInspector.fromPath(exePath, fs);
    let files = parentFiles;

    if (!files && fs) {
      const normalized = exePath.replace(/\\/g, '/');
      const dir = normalized.substring(0, normalized.lastIndexOf('/'));
      try {
        files = await fs.readdir(dir);
      } catch {
        files = [];
      }
    }

    return defaultRuleRegistry.resolve(inspector, exePath, files || [], fs);
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

  static async decodeSaveFile(
    strategy: string,
    rawBuffer: Buffer,
    context?: SaveCodecContext
  ): Promise<any> {
    throw new Error('decodeSaveFile: Not yet implemented in scaffold stage');
  }

  static async encodeSaveFile(
    strategy: string,
    jsonData: any,
    context?: SaveCodecContext
  ): Promise<Buffer> {
    throw new Error('encodeSaveFile: Not yet implemented in scaffold stage');
  }
}
