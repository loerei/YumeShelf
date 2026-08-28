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

export type * from './types.js';
export { SaveCodecError } from './types.js';
export * from './pe/index.js';
export * from './rules/index.js';

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
    profile: GameEngineProfile,
    exePath: string,
    fs?: FileSystemProvider
  ): Promise<ResolvedSaveLocation | null> {
    throw new Error('resolveSaveDirectory: Not yet implemented in scaffold stage');
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
