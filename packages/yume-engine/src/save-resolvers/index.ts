/**
 * Headless Save Folder Resolver
 * Deterministic, multi-OS save discovery using IFileSystem and IEnvironmentPaths
 */

import type {
  FileSystemProvider,
  GameEngineProfile,
  ResolvedSaveLocation,
} from '../types.js';
import { dirName, getExeStem } from './path-utils.js';
import { resolveBundleRoot } from '../bundle/app-bundle-inspector.js';
import {
  deepenSaveFolder,
  heuristicSaveScan,
  appDataFuzzyMatch,
  scanDirectoryForSaveFiles,
} from './heuristics.js';
import {
  resolveRpgMakerSave,
  resolveRenPySave,
  resolveUnitySave,
  resolveUnrealSave,
  resolveWolfRpgSave,
  resolveGodotSave,
  resolveFlashSave,
  resolveGameMakerSave,
  resolveTyranoBuilderSave,
  resolveBakinSave,
  resolveKirikiriSave,
  resolveUserProfileSave,
} from './engine-save-resolvers.js';

export * from './path-utils.js';
export * from './heuristics.js';
export * from './engine-save-resolvers.js';

export interface ResolveSaveOptions {
  saveFolderOverride?: string | null;
}

export async function resolveSaveDirectory(
  profile: GameEngineProfile | undefined,
  exePath: string,
  fs: FileSystemProvider,
  options?: ResolveSaveOptions
): Promise<ResolvedSaveLocation | null> {
  const saveFolderOverride = options?.saveFolderOverride;

  // 1. Check User Override
  if (saveFolderOverride && (await fs.exists(saveFolderOverride))) {
    const files = await scanDirectoryForSaveFiles(saveFolderOverride, fs);
    return {
      path: saveFolderOverride,
      confidence: 'high',
      source: 'override',
      matchedStrategy: profile?.saveStrategy || 'custom',
      files,
    };
  }

  const bundleRoot = resolveBundleRoot(exePath);
  const effectiveDir = bundleRoot || dirName(exePath);
  const exeStem = getExeStem(exePath, bundleRoot);
  let result: ResolvedSaveLocation | null = null;

  // 2. Deterministic Resolution by Engine Family / Save Strategy
  const family = profile?.family;
  const strategy = profile?.saveStrategy;

  if (family === 'rpg-maker' || strategy === 'rpg-maker-mv-mz' || strategy === 'rpg-maker-rgss') {
    result = await resolveRpgMakerSave(effectiveDir, profile, fs);
  } else if (family === 'renpy' || strategy === 'renpy-pickle') {
    result = await resolveRenPySave(effectiveDir, exeStem, fs);
  } else if (family === 'unity') {
    result = await resolveUnitySave(effectiveDir, exeStem, fs);
  } else if (family === 'unreal' || strategy === 'unreal-sav') {
    result = await resolveUnrealSave(effectiveDir, exeStem, fs);
  } else if (family === 'wolf-rpg' || strategy === 'wolf-sav') {
    result = await resolveWolfRpgSave(effectiveDir, fs);
  } else if (family === 'godot' || strategy === 'godot') {
    result = await resolveGodotSave(effectiveDir, exeStem, fs);
  } else if (family === 'flash') {
    result = await resolveFlashSave(effectiveDir, exeStem, fs);
  } else if (family === 'gamemaker' || strategy === 'gamemaker-appdata') {
    result = await resolveGameMakerSave(effectiveDir, exeStem, fs);
  } else if (family === 'tyranobuilder') {
    result = await resolveTyranoBuilderSave(effectiveDir, fs);
  } else if (family === 'kirikiri') {
    result = await resolveKirikiriSave(effectiveDir, exeStem, fs);
  }

  // 3. Check User Profile / Documents / Saved Games
  if (!result && exeStem && exeStem.length >= 3) {
    result = await resolveUserProfileSave(effectiveDir, exeStem, fs);
  }

  // 4. Heuristic File System Scan in Game Directory Fallback
  if (!result) {
    result = await heuristicSaveScan(effectiveDir, fs, 0);
  }

  // 5. AppData Fuzzy Matching Fallback
  if (!result) {
    result = await appDataFuzzyMatch(effectiveDir, exeStem, fs);
  }

  // 6. Deepen Folder Path if Found
  if (result?.path) {
    const deeper = await deepenSaveFolder(result.path, fs);
    if (deeper && deeper !== result.path) {
      const files = await scanDirectoryForSaveFiles(deeper, fs);
      result.path = deeper;
      result.files = files;
    }
    return result;
  }

  return {
    path: null,
    confidence: 'none',
    source: 'none',
    matchedStrategy: profile?.saveStrategy,
    files: [],
  };
}
