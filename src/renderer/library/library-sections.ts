import type { GameEntry } from '../types/game';
import type { LibraryViewItem } from '../library-stacks';
import {
  getFolderBaseName,
  normalizePathForPlatform,
  resolvePlatform,
  subsumeLibraryPaths,
  type PlatformInput,
} from '../../shared/path-subsumption';

export { getFolderBaseName };

export interface FolderSection {
  readonly path: string;
  readonly displayName: string;
  readonly games: readonly LibraryViewItem[];
  readonly isEmpty: boolean;
  readonly isCollapsible: boolean;
}

export interface ProjectLibrarySectionsParams {
  readonly items: readonly LibraryViewItem[];
  readonly currentSort: string;
  readonly activeTabId: string;
  readonly rootPaths: readonly string[];
  readonly folderAliases?: Readonly<Record<string, string>>;
  readonly targetPlatform?: PlatformInput;
}

export interface LibrarySectionsProjection {
  readonly effectiveTabId: string;
  readonly favoritesSection?: readonly LibraryViewItem[];
  readonly allGamesSection?: readonly LibraryViewItem[];
  readonly folderSections?: readonly FolderSection[];
  readonly allFolderSections?: readonly FolderSection[];
}

type MascotAwareGameEntry = GameEntry & { readonly isMascotCard?: boolean };

interface NormalizedRootEntry {
  readonly rawRoot: string;
  readonly normRoot: string;
  readonly prefix: string;
}

/**
 * Normalizes a library path using platform semantics, applying Unicode NFC normalization
 * on macOS (darwin) so NFD APFS/HFS+ paths match NFC-encoded configuration paths.
 */
export function normalizeLibraryPath(p: string, targetPlatform?: PlatformInput): string {
  if (typeof p !== 'string') return '';
  const input = resolvePlatform(targetPlatform) === 'darwin' ? p.normalize('NFC') : p;
  return normalizePathForPlatform(input, targetPlatform);
}

function getCanonicalRoots(rootPaths: readonly string[], targetPlatform?: PlatformInput): string[] {
  const platform = resolvePlatform(targetPlatform);
  const normalizedInputs =
    platform === 'darwin'
      ? rootPaths.map((p) => (typeof p === 'string' ? p.normalize('NFC') : p))
      : [...rootPaths];
  return subsumeLibraryPaths(normalizedInputs, targetPlatform);
}

function prepareNormalizedRoots(
  canonicalRoots: readonly string[],
  targetPlatform?: PlatformInput
): readonly NormalizedRootEntry[] {
  const entries: NormalizedRootEntry[] = [];
  for (const rawRoot of canonicalRoots) {
    const normRoot = normalizeLibraryPath(rawRoot, targetPlatform);
    if (!normRoot) continue;
    const prefix = normRoot.endsWith('/') ? normRoot : `${normRoot}/`;
    entries.push({ rawRoot, normRoot, prefix });
  }
  return entries;
}

function matchNormalizedRoot(
  rawFolderPath: string,
  normalizedRoots: readonly NormalizedRootEntry[],
  targetPlatform?: PlatformInput
): string | null {
  const normGame = normalizeLibraryPath(rawFolderPath, targetPlatform);
  if (!normGame) return null;
  for (const entry of normalizedRoots) {
    if (normGame === entry.normRoot || normGame.startsWith(entry.prefix)) {
      return entry.rawRoot;
    }
  }
  return null;
}

/**
 * Maps a single game or stacked view item to its owning canonical root folder path.
 * Returns null for mascot cards, missing folderPath, or unmatched roots.
 */
export function mapGameToRootFolder(
  game: GameEntry | LibraryViewItem,
  rootPathsOrCanonicalRoots: readonly string[],
  targetPlatform?: PlatformInput
): string | null {
  const targetGame: MascotAwareGameEntry | undefined =
    'primaryGame' in game ? game.primaryGame : game;
  if (!targetGame || targetGame.isMascotCard || !targetGame.folderPath) {
    return null;
  }

  const canonicalRoots = getCanonicalRoots(rootPathsOrCanonicalRoots, targetPlatform);
  const normGame = normalizeLibraryPath(targetGame.folderPath, targetPlatform);
  if (!normGame) return null;

  for (const rawRoot of canonicalRoots) {
    const normRoot = normalizeLibraryPath(rawRoot, targetPlatform);
    if (!normRoot) continue;
    const rootWithSep = normRoot.endsWith('/') ? normRoot : `${normRoot}/`;
    if (normGame === normRoot || normGame.startsWith(rootWithSep)) {
      return rawRoot;
    }
  }

  return null;
}

/**
 * Projects a base 'all'-tab folder projection onto the requested activeTabId ('all', 'fav', or '<folder-id>'),
 * falling back cleanly to baseProjection when 'fav' is empty or '<folder-id>' does not match any canonical root.
 */
export function selectFolderTabProjection(
  baseProjection: LibrarySectionsProjection,
  activeTabId: string,
  targetPlatform?: PlatformInput,
  options?: { readonly allowEmptyFavoritesTab?: boolean }
): LibrarySectionsProjection {
  const allFolders = baseProjection.allFolderSections ?? baseProjection.folderSections ?? [];
  const favoritesSection = baseProjection.favoritesSection;

  if (activeTabId === 'all') {
    return {
      effectiveTabId: 'all',
      favoritesSection,
      folderSections: allFolders,
      allFolderSections: allFolders,
    };
  }

  if (activeTabId === 'fav') {
    if ((!favoritesSection || favoritesSection.length === 0) && options?.allowEmptyFavoritesTab !== true) {
      return baseProjection;
    }
    return {
      effectiveTabId: 'fav',
      favoritesSection,
      allFolderSections: allFolders,
    };
  }

  const normActive = normalizeLibraryPath(activeTabId, targetPlatform);
  if (!normActive) {
    return baseProjection;
  }

  const matched = allFolders.find(
    (folder) => normalizeLibraryPath(folder.path, targetPlatform) === normActive
  );
  if (!matched) {
    return baseProjection;
  }

  return {
    effectiveTabId: matched.path,
    favoritesSection,
    folderSections: [{ ...matched, isCollapsible: false }],
    allFolderSections: allFolders,
  };
}

/**
 * Projects library view items into flat or folder-grouped sections depending on sort mode and active shelf tab.
 */
export function projectLibrarySections(
  params: ProjectLibrarySectionsParams
): LibrarySectionsProjection {
  const favoritesSection = params.items.filter((item) => item.favorite);

  if (params.currentSort !== 'folder') {
    const allGamesSection = params.items.filter((item) => !item.favorite);
    return {
      effectiveTabId: params.activeTabId,
      favoritesSection,
      allGamesSection,
    };
  }

  const canonicalRoots = getCanonicalRoots(params.rootPaths, params.targetPlatform);
  const normalizedRoots = prepareNormalizedRoots(canonicalRoots, params.targetPlatform);

  const aliasMap = new Map<string, string>();
  if (params.folderAliases) {
    for (const [rawKey, rawVal] of Object.entries(params.folderAliases)) {
      if (typeof rawVal !== 'string' || rawVal.trim() === '') continue;
      const normKey = normalizeLibraryPath(rawKey, params.targetPlatform);
      if (normKey) {
        aliasMap.set(normKey, rawVal);
      }
    }
  }

  const grouped = new Map<string, LibraryViewItem[]>();
  for (const root of canonicalRoots) {
    grouped.set(root, []);
  }

  for (const item of params.items) {
    const targetGame: MascotAwareGameEntry | undefined = item.primaryGame;
    if (!targetGame || targetGame.isMascotCard || !targetGame.folderPath) {
      continue;
    }
    const matchedRoot = matchNormalizedRoot(
      targetGame.folderPath,
      normalizedRoots,
      params.targetPlatform
    );
    if (matchedRoot) {
      grouped.get(matchedRoot)?.push(item);
    }
  }

  const allFolderSections: FolderSection[] = canonicalRoots.map((rootPath) => {
    const normRoot = normalizeLibraryPath(rootPath, params.targetPlatform);
    const alias = normRoot ? aliasMap.get(normRoot) : undefined;
    const displayName = alias && alias.trim() !== '' ? alias : getFolderBaseName(rootPath);
    const games = grouped.get(rootPath) ?? [];
    return {
      path: rootPath,
      displayName,
      games,
      isEmpty: games.length === 0,
      isCollapsible: true,
    };
  });

  const baseProjection: LibrarySectionsProjection = {
    effectiveTabId: 'all',
    favoritesSection,
    folderSections: allFolderSections,
    allFolderSections,
  };

  return selectFolderTabProjection(baseProjection, params.activeTabId, params.targetPlatform);
}
