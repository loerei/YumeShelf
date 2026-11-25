import type { GameEntry } from './types/game';
import { getGameKey, resolveCustomOrder } from './library-order';

export interface LibraryViewItemCommon {
  readonly representativeKey: string;
  readonly groupKey: string;
  readonly favorite: boolean;
  readonly isStack: boolean;
  readonly primaryGame: GameEntry;
  readonly games: readonly GameEntry[];
  readonly stackSize: number;
}

export interface SingleLibraryViewItem extends LibraryViewItemCommon {
  readonly type: 'single';
  readonly isStack: false;
  readonly stackSize: 1;
  readonly games: readonly [GameEntry];
}

export interface StackLibraryViewItem extends LibraryViewItemCommon {
  readonly type: 'stack';
  readonly isStack: true;
  readonly groupKey: string;
  readonly games: readonly GameEntry[];
  readonly stackSize: number;
}

export type LibraryViewItem = SingleLibraryViewItem | StackLibraryViewItem;

function compareByRelativePath(a: GameEntry, b: GameEntry): number {
  const depthA = (a.relativePath || '').split(/[\\/]+/).filter(Boolean).length;
  const depthB = (b.relativePath || '').split(/[\\/]+/).filter(Boolean).length;
  if (depthA !== depthB) return depthA - depthB;
  return (a.relativePath || '').localeCompare(b.relativePath || '');
}

function compareGames(
  a: GameEntry,
  b: GameEntry,
  type: string,
  orderIndex: ReadonlyMap<string, number> | null
): number {
  let result = 0;
  if ((type === 'custom' || type === 'folder') && orderIndex) {
    const indexA = orderIndex.get(getGameKey(a)) ?? Number.MAX_SAFE_INTEGER;
    const indexB = orderIndex.get(getGameKey(b)) ?? Number.MAX_SAFE_INTEGER;
    result = indexA - indexB;
  } else if (type === 'az') {
    result = (a.name || '').localeCompare(b.name || '');
  } else if (type === 'date') {
    result = (b.dateAdded || 0) - (a.dateAdded || 0);
  } else if (type === 'played') {
    result = (b.lastPlayed || 0) - (a.lastPlayed || 0);
  }

  if (result !== 0) return result;
  return compareByRelativePath(a, b);
}

export function findGameEntryByKey(games: readonly GameEntry[], targetKey: string): GameEntry | undefined {
  return games.find((g) => {
    const primary = getGameKey(g);
    if (
      primary === targetKey ||
      g.gameId === targetKey ||
      `game:${primary}` === targetKey ||
      (g.gameId && `game:${g.gameId}` === targetKey)
    ) {
      return true;
    }
    return (
      Array.isArray(g.instances) &&
      g.instances.some((inst) => getGameKey(inst) === targetKey || inst.instanceId === targetKey)
    );
  });
}

export function resolveFavoriteLockKey(targetKey: string, games: readonly GameEntry[]): string {
  const entry = findGameEntryByKey(games, targetKey);
  if (entry?.gameId) {
    return entry.gameId.startsWith('game:') ? entry.gameId : `game:${entry.gameId}`;
  }
  if (entry) return getGameKey(entry);
  return targetKey;
}

export function buildGroupKey(game: GameEntry): string {
  const key = getGameKey(game) || '';
  return key.startsWith('game:') ? key : `game:${key}`;
}

export function buildLibraryViewItems(
  games: readonly GameEntry[],
  type: string,
  customOrder?: readonly string[] | null
): {
  items: readonly LibraryViewItem[];
  customOrder?: readonly string[] | null;
} {
  const resolvedCustomOrder =
    type === 'custom' || type === 'folder'
      ? (Array.isArray(customOrder) ? customOrder : resolveCustomOrder(games))
      : null;
  const orderIndex = resolvedCustomOrder
    ? new Map<string, number>(resolvedCustomOrder.map((key, i) => [key, i]))
    : null;

  const sortedGames = [...games].sort((a, b) => compareGames(a, b, type, orderIndex));
  const grouped = new Map<string, GameEntry[]>();

  for (const game of sortedGames) {
    const groupKey = buildGroupKey(game);
    const nextGroup = grouped.get(groupKey) || [];
    nextGroup.push(game);
    grouped.set(groupKey, nextGroup);
  }

  const items: LibraryViewItem[] = [...grouped.entries()].map(([groupKey, groupGames]) => {
    const logicalGame = groupGames[0];
    const representativeKey = getGameKey(logicalGame);
    const favorite = !!logicalGame.favorite;

    if (Array.isArray(logicalGame.instances) && logicalGame.instances.length > 1) {
      const orderedGames = [...logicalGame.instances].sort(compareByRelativePath);
      const recents = orderedGames
        .filter((g) => (g.lastPlayed || 0) > 0)
        .sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0));
      const primaryGame = logicalGame.primaryInstance || (recents.length > 0 ? recents[0] : orderedGames[0]);

      return {
        type: 'stack',
        isStack: true,
        groupKey,
        favorite,
        primaryGame,
        games: orderedGames,
        representativeKey,
        stackSize: orderedGames.length,
      };
    }

    const singleGame =
      Array.isArray(logicalGame.instances) && logicalGame.instances.length === 1
        ? logicalGame.instances[0]
        : logicalGame;

    return {
      type: 'single',
      isStack: false,
      groupKey,
      favorite,
      primaryGame: logicalGame.primaryInstance || singleGame,
      games: [singleGame] as const,
      representativeKey,
      stackSize: 1,
    };
  });

  return {
    customOrder: resolvedCustomOrder,
    items,
  };
}

export function getGroupedKeysForGame(targetGame: GameEntry | LibraryViewItem): string[] {
  if (!targetGame) return [];
  const seen = new Set<string>();
  const addKey = (k: unknown) => {
    if (typeof k === 'string' && k.length > 0) {
      seen.add(k);
    }
  };

  if ('primaryGame' in targetGame && Array.isArray(targetGame.games)) {
    if (targetGame.representativeKey) {
      addKey(targetGame.representativeKey);
    }
    if (targetGame.primaryGame) {
      addKey(getGameKey(targetGame.primaryGame));
      addKey(targetGame.primaryGame.instanceId);
    }
    for (const g of targetGame.games) {
      addKey(getGameKey(g));
      addKey(g.instanceId);
    }
    return [...seen];
  }

  const entry = targetGame as GameEntry;
  addKey(getGameKey(entry));
  addKey(entry.instanceId);
  if (entry.primaryInstance) {
    addKey(getGameKey(entry.primaryInstance));
    addKey(entry.primaryInstance.instanceId);
  }
  if (Array.isArray(entry.instances)) {
    for (const inst of entry.instances) {
      addKey(getGameKey(inst));
      addKey(inst.instanceId);
    }
  }
  return [...seen];
}

export function resolveStackByGroupKey(
  games: readonly GameEntry[],
  groupKey: string
): StackLibraryViewItem | null {
  if (!groupKey) return null;

  const targetGame = games.find(
    (g) =>
      g.gameId === groupKey ||
      g.gameKey === groupKey ||
      buildGroupKey(g) === groupKey ||
      (Array.isArray(g.instances) &&
        g.instances.some((i) => i && (i.gameKey === groupKey || i.instanceId === groupKey)))
  );
  if (!targetGame) return null;

  const rawInstances = Array.isArray(targetGame.instances) ? targetGame.instances : [targetGame];
  if (rawInstances.length <= 1) return null;

  const orderedGames = [...rawInstances].sort(compareByRelativePath);

  const recents = orderedGames
    .filter((g) => (g.lastPlayed || 0) > 0)
    .sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0));
  const primaryGame = targetGame.primaryInstance || (recents.length > 0 ? recents[0] : orderedGames[0]);

  return {
    type: 'stack',
    isStack: true,
    groupKey: buildGroupKey(targetGame),
    favorite: !!targetGame.favorite,
    primaryGame,
    games: orderedGames,
    representativeKey: getGameKey(targetGame),
    stackSize: orderedGames.length,
  };
}

export function patchRunningGameViewItem(
  prevItems: readonly LibraryViewItem[],
  changedGame: GameEntry
): readonly LibraryViewItem[] {
  if (!changedGame) return prevItems;
  const changedKey = getGameKey(changedGame);
  if (!changedKey) return prevItems;
  const changedGroupKey = buildGroupKey(changedGame);
  let didMutate = false;

  const nextItems = prevItems.map((item) => {
    const matchesRepresentative = item.representativeKey === changedKey;
    const matchesGroup = item.groupKey === changedGroupKey;
    const matchesAnyChild = item.isStack && item.games.some((g) => getGameKey(g) === changedKey);

    if (!matchesRepresentative && !matchesGroup && !matchesAnyChild) {
      return item;
    }

    didMutate = true;
    if (item.type === 'single') {
      return {
        ...item,
        primaryGame: changedGame,
        games: [changedGame] as const,
      };
    }

    const instanceMap =
      Array.isArray(changedGame.instances) && changedGame.instances.length > 0
        ? new Map(changedGame.instances.map((inst) => [getGameKey(inst), inst]))
        : null;

    const nextGames = instanceMap
      ? item.games.map((g) => instanceMap.get(getGameKey(g)) ?? g)
      : item.games.map((g) => (getGameKey(g) === changedKey ? changedGame : g));

    const recents = nextGames
      .filter((g) => (g.lastPlayed || 0) > 0)
      .sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0));

    const explicitPrimaryKey = changedGame.primaryInstance ? getGameKey(changedGame.primaryInstance) : null;

    const primaryGame =
      (explicitPrimaryKey ? nextGames.find((g) => getGameKey(g) === explicitPrimaryKey) : null) ??
      (recents.length > 0 ? recents[0] : null) ??
      (item.primaryGame ? nextGames.find((g) => getGameKey(g) === getGameKey(item.primaryGame)) : null) ??
      nextGames[0];

    return {
      ...item,
      primaryGame,
      games: nextGames,
      stackSize: nextGames.length,
    };
  });

  return didMutate ? nextItems : prevItems;
}
