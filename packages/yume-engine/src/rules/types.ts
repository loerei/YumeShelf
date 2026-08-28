/// <reference types="node" />
/**
 * YumeEngine - Engine Rule Registry Types & Classification Context
 *
 * Derived from Detect-It-Easy & XPEViewer specifications by horsicq
 * MIT License - Copyright (c) horsicq / YumeShelf Contributors
 */

import type { GameEngineProfile, IFileSystem } from '../types.js';
import type { PEInspector } from '../pe/pe-inspector.js';

export interface ScanContext {
  /** Target executable path */
  exePath: string;
  /** Executable basename lowercased (e.g. "game.exe") */
  exeName: string;
  /** Directory containing the executable */
  parentDir: string;
  /** List of raw file names in parentDir */
  parentFiles: string[];
  /** Pre-indexed set of parent directory filenames lowercased for O(1) membership lookup */
  filesLowerSet: Set<string>;
  /** Pre-indexed set of file extensions lowercased (e.g. ".exe", ".pck") for O(1) membership lookup */
  extensionsSet: Set<string>;
  /** Parsed PE binary inspector */
  pe: PEInspector;
  /** Optional file system provider */
  fs?: IFileSystem;
}

export interface EngineClassificationRule {
  /** Unique name of the classification rule */
  name: string;
  /** Order priority: lower number evaluates earlier */
  priority: number;
  /** Evaluation predicate and profile generator. Returns GameEngineProfile if matched, or null/undefined if not */
  match(ctx: ScanContext): GameEngineProfile | null | undefined | Promise<GameEngineProfile | null | undefined>;
}
