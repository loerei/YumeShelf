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

export type * from './types.js';
export { SaveCodecError } from './types.js';
export * from './pe/index.js';

export class YumeEngine {
  static async inspectExecutable(exePath: string, fs?: IFileSystem): Promise<GameEngineProfile> {
    const inspector = await PEInspector.fromPath(exePath, fs);
    const is64 = inspector.is64Bit;
    const arch = is64 ? 'x64' : (inspector.coffHeader.machine === 0x014c ? 'x86' : 'unknown');

    return {
      tag: 'Others',
      family: 'unknown',
      arch,
      runtime: 'native',
      saveStrategy: 'unknown',
      detectedBy: inspector.isValid ? 'PEInspector' : 'fallback',
    };
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
