/// <reference types="node" />
/**
 * Main Process Backward Compatibility Adapter - Linux Desktop Entry (.desktop)
 *
 * Delegates Linux .desktop parsing and icon resolution to @yumeshelf/engine,
 * applying cross-platform path normalization for Main process callers.
 */

import * as path from 'node:path';
import {
  resolveDesktopIconPathSync as engineResolveDesktopIconPathSync,
  resolveDesktopIconPath as engineResolveDesktopIconPath,
  findDesktopEntryIconSync as engineFindDesktopEntryIconSync,
  findDesktopEntryIcon as engineFindDesktopEntryIcon,
  type DesktopEntryOptions
} from '@yumeshelf/engine';

export { parseDesktopFileIcon, type DesktopEntryOptions } from '@yumeshelf/engine';

export function resolveDesktopIconPath(
  iconVal: string,
  baseDir?: string,
  options?: Omit<DesktopEntryOptions, 'fs'>
): string | null {
  const resolved = engineResolveDesktopIconPathSync(iconVal, baseDir, options);
  return resolved ? path.normalize(resolved) : null;
}

export function findDesktopEntryIcon(
  gameDirOrFile: string,
  options?: Omit<DesktopEntryOptions, 'fs'>
): string | null {
  const resolved = engineFindDesktopEntryIconSync(gameDirOrFile, options);
  return resolved ? path.normalize(resolved) : null;
}

export async function resolveDesktopIconPathAsync(
  iconVal: string,
  baseDir?: string,
  options?: DesktopEntryOptions
): Promise<string | null> {
  const resolved = await engineResolveDesktopIconPath(iconVal, baseDir, options);
  return resolved ? path.normalize(resolved) : null;
}

export async function findDesktopEntryIconAsync(
  gameDirOrFile: string,
  options?: DesktopEntryOptions
): Promise<string | null> {
  const resolved = await engineFindDesktopEntryIcon(gameDirOrFile, options);
  return resolved ? path.normalize(resolved) : null;
}
