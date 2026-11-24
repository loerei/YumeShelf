import { describe, it, expect } from 'vitest';
import type { GameEntry } from '../types/game';
import { buildLibraryViewItems, type LibraryViewItem } from '../library-stacks';
import {
  getFolderBaseName,
  mapGameToRootFolder,
  normalizeLibraryPath,
  projectLibrarySections,
  selectFolderTabProjection,
} from './library-sections';

function makeGame(overrides: Partial<GameEntry> & { gameKey: string }): GameEntry {
  return {
    name: overrides.name ?? overrides.gameKey,
    ...overrides,
  };
}

function makeItems(games: readonly GameEntry[]): readonly LibraryViewItem[] {
  return buildLibraryViewItems(games, 'az').items;
}

describe('library-sections', () => {
  it('places favorited games in both favoritesSection and their owning folder section (dual placement)', () => {
    const games = [
      makeGame({ gameKey: 'g-fav', folderPath: 'C:/Games/FavGame', favorite: true }),
      makeGame({ gameKey: 'g-reg', folderPath: 'C:/Games/RegGame', favorite: false }),
    ];
    const items = makeItems(games);

    const projection = projectLibrarySections({
      items,
      currentSort: 'folder',
      activeTabId: 'all',
      rootPaths: ['C:/Games'],
      targetPlatform: 'win32',
    });

    expect(projection.effectiveTabId).toBe('all');
    expect(projection.favoritesSection?.map((i) => i.representativeKey)).toEqual(['g-fav']);
    expect(projection.folderSections).toHaveLength(1);
    expect(projection.folderSections?.[0].games.map((i) => i.representativeKey)).toEqual([
      'g-fav',
      'g-reg',
    ]);
    expect(projection.folderSections?.[0].isEmpty).toBe(false);
    expect(projection.folderSections?.[0].isCollapsible).toBe(true);
  });

  it('projects empty folder placeholders when a root folder has no games', () => {
    const items = makeItems([
      makeGame({ gameKey: 'g1', folderPath: 'C:/GamesA/Game1', favorite: false }),
    ]);

    const projection = projectLibrarySections({
      items,
      currentSort: 'folder',
      activeTabId: 'all',
      rootPaths: ['C:/GamesA', 'C:/GamesB'],
      targetPlatform: 'win32',
    });

    expect(projection.folderSections).toHaveLength(2);
    expect(projection.folderSections?.[0].isEmpty).toBe(false);
    expect(projection.folderSections?.[1]).toMatchObject({
      path: 'C:/GamesB',
      displayName: 'GamesB',
      games: [],
      isEmpty: true,
      isCollapsible: true,
    });
  });

  it('filters active tabs (all, fav, folder-id), retains allFolderSections, and handles fallbacks via selectFolderTabProjection', () => {
    const favGame = makeGame({ gameKey: 'g-fav', folderPath: 'C:/RootA/Fav', favorite: true });
    const regGame = makeGame({ gameKey: 'g-reg', folderPath: 'C:/RootB/Reg', favorite: false });
    const items = makeItems([favGame, regGame]);
    const rootPaths = ['C:/RootA', 'C:/RootB'];

    // 'fav' tab with favorites present
    const favProj = projectLibrarySections({
      items,
      currentSort: 'folder',
      activeTabId: 'fav',
      rootPaths,
      targetPlatform: 'win32',
    });
    expect(favProj.effectiveTabId).toBe('fav');
    expect(favProj.favoritesSection?.map((i) => i.representativeKey)).toEqual(['g-fav']);
    expect(favProj.folderSections).toBeUndefined();
    expect(favProj.allFolderSections).toHaveLength(2);

    // Individual folder tab
    const folderProj = projectLibrarySections({
      items,
      currentSort: 'folder',
      activeTabId: 'C:/RootB',
      rootPaths,
      targetPlatform: 'win32',
    });
    expect(folderProj.effectiveTabId).toBe('C:/RootB');
    expect(folderProj.folderSections).toHaveLength(1);
    expect(folderProj.folderSections?.[0].path).toBe('C:/RootB');
    expect(folderProj.folderSections?.[0].isCollapsible).toBe(false);
    expect(folderProj.allFolderSections).toHaveLength(2);

    // Invalid folder tab falls back to 'all'
    const invalidProj = projectLibrarySections({
      items,
      currentSort: 'folder',
      activeTabId: 'C:/NonExistent',
      rootPaths,
      targetPlatform: 'win32',
    });
    expect(invalidProj.effectiveTabId).toBe('all');
    expect(invalidProj.folderSections).toHaveLength(2);

    // Direct selectFolderTabProjection: 'fav' empty fallback & invalid folder fallback
    const noFavItems = makeItems([regGame]);
    const baseNoFav = projectLibrarySections({
      items: noFavItems,
      currentSort: 'folder',
      activeTabId: 'all',
      rootPaths,
      targetPlatform: 'win32',
    });
    const favFallback = selectFolderTabProjection(baseNoFav, 'fav', 'win32');
    expect(favFallback.effectiveTabId).toBe('all');
    expect(favFallback.folderSections).toHaveLength(2);

    const invalidFallback = selectFolderTabProjection(baseNoFav, 'C:/Missing', 'win32');
    expect(invalidFallback.effectiveTabId).toBe('all');
    expect(invalidFallback.folderSections).toHaveLength(2);
  });

  it('resolves folder displayName with folderAliases and falls back to getFolderBaseName for whitespace aliases and POSIX root', () => {
    const items = makeItems([
      makeGame({ gameKey: 'g1', folderPath: 'C:/Games/G1' }),
      makeGame({ gameKey: 'g2', folderPath: 'D:/VN/G2' }),
    ]);

    const projection = projectLibrarySections({
      items,
      currentSort: 'folder',
      activeTabId: 'all',
      rootPaths: ['C:/Games', 'D:/VN', '/'],
      folderAliases: {
        'C:/Games': '   ',
        'D:/VN': 'Visual Novels',
      },
      targetPlatform: 'win32',
    });

    expect(projection.folderSections?.[0].displayName).toBe('Games');
    expect(projection.folderSections?.[1].displayName).toBe('Visual Novels');
    expect(getFolderBaseName('C:/Games')).toBe('Games');
    expect(getFolderBaseName('/')).toBe('/');
  });

  it('maps games across Windows, Linux, and macOS paths in-memory', () => {
    const winGame = makeGame({ gameKey: 'w', folderPath: 'D:\\Library\\Sub\\GameW' });
    expect(mapGameToRootFolder(winGame, ['C:\\Other', 'D:\\Library'], 'win32')).toBe('D:\\Library');

    const linuxGame = makeGame({ gameKey: 'l', folderPath: '/home/user/Games/GameL' });
    expect(mapGameToRootFolder(linuxGame, ['/home/user/games', '/home/user/Games'], 'linux')).toBe(
      '/home/user/Games'
    );

    const macGame = makeGame({ gameKey: 'm', folderPath: '/Users/alice/Games/GameM' });
    expect(mapGameToRootFolder(macGame, ['/Users/Alice/Games'], 'darwin')).toBe(
      '/Users/Alice/Games'
    );

    // Multi-instance stack
    const stackItem = buildLibraryViewItems(
      [
        makeGame({
          gameKey: 'stack-root',
          instances: [
            makeGame({ gameKey: 's1', instanceId: 's1', folderPath: '/mnt/lib/GameS/v1', relativePath: 'b' }),
            makeGame({ gameKey: 's2', instanceId: 's2', folderPath: '/mnt/lib/GameS/v2', relativePath: 'a' }),
          ],
        }),
      ],
      'az'
    ).items[0];
    expect(mapGameToRootFolder(stackItem, ['/mnt/lib'], 'linux')).toBe('/mnt/lib');
  });

  it('aggregates subsumed child library paths under their ancestor root without orphan sections', () => {
    const items = makeItems([
      makeGame({ gameKey: 'g1', folderPath: 'C:/Games/RPG/Game1' }),
      makeGame({ gameKey: 'g2', folderPath: 'C:/Games/Game2' }),
    ]);

    const projection = projectLibrarySections({
      items,
      currentSort: 'folder',
      activeTabId: 'all',
      rootPaths: ['C:/Games/RPG', 'C:/Games'],
      targetPlatform: 'win32',
    });

    expect(projection.folderSections).toHaveLength(1);
    expect(projection.folderSections?.[0].path).toBe('C:/Games');
    expect(projection.folderSections?.[0].games.map((g) => g.representativeKey)).toEqual(['g1', 'g2']);
  });

  it('handles drive-root trailing separator boundary without double-separator distortion', () => {
    const slashGame = makeGame({ gameKey: 'g1', folderPath: 'C:/GameA' });
    const backslashGame = makeGame({ gameKey: 'g2', folderPath: 'C:\\GameA' });

    expect(mapGameToRootFolder(slashGame, ['C:/'], 'win32')).toBe('C:/');
    expect(mapGameToRootFolder(backslashGame, ['C:/'], 'win32')).toBe('C:/');
  });

  it('returns null for mascot cards and missing folderPath and keeps mascot cards in flat sorts', () => {
    const mascot = makeGame({ gameKey: 'mascot', folderPath: 'C:/Games/Mascot' }) as GameEntry & {
      isMascotCard: boolean;
    };
    mascot.isMascotCard = true;
    const noFolder = makeGame({ gameKey: 'no-folder', folderPath: undefined });

    expect(mapGameToRootFolder(mascot, ['C:/Games'], 'win32')).toBeNull();
    expect(mapGameToRootFolder(noFolder, ['C:/Games'], 'win32')).toBeNull();

    const flatItems = makeItems([mascot, noFolder]);
    const flatProjection = projectLibrarySections({
      items: flatItems,
      currentSort: 'az',
      activeTabId: 'all',
      rootPaths: ['C:/Games'],
      targetPlatform: 'win32',
    });
    expect(flatProjection.allGamesSection?.map((i) => i.representativeKey)).toEqual([
      'mascot',
      'no-folder',
    ]);
  });

  it('resolves case-variant, separator-variant activeTabId and prototype-key folderAliases safely', () => {
    const items = makeItems([makeGame({ gameKey: 'g1', folderPath: 'C:/Games/Game1' })]);

    const winProj = projectLibrarySections({
      items,
      currentSort: 'folder',
      activeTabId: 'C:\\Games\\',
      rootPaths: ['c:/games'],
      folderAliases: {
        constructor: 'Ignored',
        toString: 'Ignored',
        'C:\\GAMES': 'My Games',
      },
      targetPlatform: 'win32',
    });
    expect(winProj.effectiveTabId).toBe('c:/games');
    expect(winProj.folderSections?.[0].displayName).toBe('My Games');

    const linuxItems = makeItems([makeGame({ gameKey: 'g2', folderPath: '/home/Games/G2' })]);
    const linuxMismatch = projectLibrarySections({
      items: linuxItems,
      currentSort: 'folder',
      activeTabId: '/home/games',
      rootPaths: ['/home/Games'],
      targetPlatform: 'linux',
    });
    expect(linuxMismatch.effectiveTabId).toBe('all');
  });

  it('normalizes macOS Unicode NFC/NFD paths across mapGameToRootFolder, subsumeLibraryPaths, activeTabId, and folderAliases', () => {
    const nfcRoot = '/Users/me/Games/\u00e9';
    const nfdRoot = '/Users/me/Games/e\u0301';
    const nfdChildRoot = '/Users/me/Games/e\u0301/Sub';
    const nfdGame = makeGame({
      gameKey: 'mac-g1',
      folderPath: '/Users/me/Games/e\u0301/GameA',
    });

    expect(normalizeLibraryPath(nfdRoot, 'darwin')).toBe(normalizeLibraryPath(nfcRoot, 'darwin'));
    expect(mapGameToRootFolder(nfdGame, [nfcRoot], 'darwin')).toBe(nfcRoot);

    const items = makeItems([nfdGame]);
    const proj = projectLibrarySections({
      items,
      currentSort: 'folder',
      activeTabId: nfdRoot,
      rootPaths: [nfcRoot, nfdRoot, nfdChildRoot],
      folderAliases: {
        [nfdRoot]: 'Accented Games',
      },
      targetPlatform: 'darwin',
    });

    expect(proj.allFolderSections).toHaveLength(1);
    expect(proj.effectiveTabId).toBe(nfcRoot);
    expect(proj.folderSections).toHaveLength(1);
    expect(proj.folderSections?.[0].displayName).toBe('Accented Games');
    expect(proj.folderSections?.[0].games.map((g) => g.representativeKey)).toEqual(['mac-g1']);
  });
});
