import { isSubsumedBy, type PlatformInput } from '../../shared/path-subsumption';
import { getGameKey } from '../library-order';
import { normalizeLibraryPath } from '../library/library-sections';
import type { LibraryViewItem } from '../library-stacks';
import type { GameEntry } from '../types/game';

export type GameDndContainerId = 'fav' | 'unfav' | string; // string = canonical section.path in folder sort

function isLibraryViewItem(item: GameEntry | LibraryViewItem): item is LibraryViewItem {
  return 'primaryGame' in item;
}

function collectCandidateKeys(item: GameEntry | LibraryViewItem): string[] {
  if (isLibraryViewItem(item)) {
    return [
      item.representativeKey,
      item.groupKey,
      getGameKey(item.primaryGame),
    ].filter((k): k is string => Boolean(k));
  }
  return [
    getGameKey(item),
    item.gameKey,
    item.gameId,
  ].filter((k): k is string => Boolean(k));
}

function isItemInFavorites(
  item: GameEntry | LibraryViewItem,
  favorites: readonly (GameEntry | LibraryViewItem)[]
): boolean {
  if ('favorite' in item && item.favorite) {
    return true;
  }
  const itemKeys = collectCandidateKeys(item);
  if (itemKeys.length === 0) return false;
  const itemKeySet = new Set(itemKeys);
  return favorites.some((fav) =>
    collectCandidateKeys(fav).some((k) => itemKeySet.has(k))
  );
}

/**
 * Evaluates the 5-scenario drop permission matrix for single GameCard and StackCard DnD.
 */
export function validateGameCardDrop(context: {
  sourceContainerId: GameDndContainerId;
  targetContainerId: GameDndContainerId;
  item: GameEntry | LibraryViewItem;
  currentSort: string;
  favorites: readonly (GameEntry | LibraryViewItem)[];
  targetPlatform?: PlatformInput;
}): boolean {
  const {
    sourceContainerId,
    targetContainerId,
    item,
    currentSort,
    favorites,
    targetPlatform,
  } = context;

  // Scenario 1: Same-container reordering is always allowed
  if (targetContainerId === sourceContainerId) {
    return true;
  }

  if (currentSort === 'folder') {
    // Scenario 2: Folder sort -> Drag into Favorites
    if (targetContainerId === 'fav') {
      return !isItemInFavorites(item, favorites);
    }

    // Scenario 3: Folder sort -> Drag out of Favorites into owning root folder
    if (sourceContainerId === 'fav') {
      const folderPath = isLibraryViewItem(item)
        ? item.primaryGame.folderPath
        : item.folderPath;
      if (!folderPath) return false;
      const normalizedFolderPath = normalizeLibraryPath(folderPath, targetPlatform);
      const normalizedTargetRootPath = normalizeLibraryPath(targetContainerId, targetPlatform);
      if (!normalizedFolderPath || !normalizedTargetRootPath) return false;
      return isSubsumedBy(normalizedFolderPath, normalizedTargetRootPath, targetPlatform);
    }

    // Scenario 4: Cross-folder drops are strictly rejected
    return false;
  }

  // Scenario 5: Flat sort modes (date, played, az, custom) -> cross-zone fav <-> unfav
  return (
    (sourceContainerId === 'fav' && targetContainerId === 'unfav') ||
    (sourceContainerId === 'unfav' && targetContainerId === 'fav')
  );
}
