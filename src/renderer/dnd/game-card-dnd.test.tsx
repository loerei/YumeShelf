import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import enLocale from '../../locales/builtins/en.json';
import type { ElectronAPI } from '../../shared/types/ipc';
import { LibraryStateProvider } from '../context/LibraryStateContext';
import { GameCard, type GameCardProps } from '../components/GameCard';
import { StackCard, type StackCardProps } from '../components/StackCard';
import { SortableGameCard } from '../components/SortableGameCard';
import { LibraryGrid } from '../components/LibraryGrid';
import { FolderAccordion } from '../components/FolderAccordion';
import { FolderSection } from '../components/FolderSection';
import { useStableItemIds } from '../hooks/useStableItemIds';
import { readStoredCustomOrder, writeCustomOrder } from '../library-order';
import type { LibraryViewItem, SingleLibraryViewItem, StackLibraryViewItem } from '../library-stacks';
import type { LibrarySectionsProjection } from '../library/library-sections';
import { createUiRuntimeState, type UiStorageAdapter } from '../state/ui-runtime-state';
import type { GameEntry } from '../types/game';
import { validateGameCardDrop } from './card-drop-validator';
import { GameDndContext } from './GameDndContext';

function makeGame(overrides: Partial<GameEntry> = {}): GameEntry {
  const gameKey = overrides.gameKey ?? 'g1';
  return {
    gameId: overrides.gameId ?? gameKey,
    gameKey,
    name: overrides.name ?? `Game ${gameKey}`,
    title: overrides.title ?? `Game ${gameKey}`,
    folderName: overrides.folderName ?? gameKey,
    folderPath: overrides.folderPath ?? 'C:/Games/FolderA/g1',
    relativePath: overrides.relativePath ?? gameKey,
    favorite: overrides.favorite ?? false,
    dateAdded: overrides.dateAdded ?? 1000,
    lastPlayed: overrides.lastPlayed ?? 0,
    playtime: overrides.playtime ?? 0,
    ...overrides,
  };
}

function makeSingleItem(game: GameEntry): SingleLibraryViewItem {
  const key = game.gameKey || game.gameId || '';
  return {
    type: 'single',
    isStack: false,
    stackSize: 1,
    representativeKey: key,
    groupKey: `game:${key}`,
    favorite: Boolean(game.favorite),
    primaryGame: game,
    games: [game],
  };
}

function makeStackItem(games: readonly GameEntry[]): StackLibraryViewItem {
  const primary = games[0];
  const repKey = primary.gameKey || primary.gameId || '';
  const groupKey = primary.gameId?.startsWith('game:')
    ? primary.gameId
    : `game:${primary.gameId || repKey}`;
  return {
    type: 'stack',
    isStack: true,
    stackSize: games.length,
    representativeKey: repKey,
    groupKey,
    favorite: games.some((g) => Boolean(g.favorite)),
    primaryGame: primary,
    games,
  };
}

function createMemoryStorage(initial: Record<string, string> = {}): UiStorageAdapter {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

function makeRect(x: number, y: number, width = 160, height = 200): DOMRect {
  return {
    x,
    y,
    left: x,
    top: y,
    right: x + width,
    bottom: y + height,
    width,
    height,
    toJSON: () => ({}),
  } as DOMRect;
}

function mockElementRects(resolver: (el: Element) => DOMRect | null) {
  const orig = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function () {
    const res = resolver(this);
    return res ?? orig.call(this);
  };
}

async function performPointerDrag(
  sourceEl: Element,
  from: { x: number; y: number },
  to: { x: number; y: number }
) {
  await startPointerDrag(sourceEl, from, to);
  await act(async () => {
    fireEvent.pointerUp(document, {
      clientX: to.x,
      clientY: to.y,
      pointerId: 1,
    });
  });
  // @dnd-kit PointerSensor keeps a capture-phase document click stopper for 50ms after pointerup
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 60));
  });
}

async function startPointerDrag(
  sourceEl: Element,
  from: { x: number; y: number },
  overPos: { x: number; y: number }
) {
  await act(async () => {
    fireEvent.pointerDown(sourceEl, {
      clientX: from.x,
      clientY: from.y,
      button: 0,
      isPrimary: true,
      pointerId: 1,
    });
  });
  await act(async () => {
    fireEvent.pointerMove(document, {
      clientX: from.x + 10,
      clientY: from.y,
      pointerId: 1,
    });
  });
  await act(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });
  await act(async () => {
    fireEvent.pointerMove(document, {
      clientX: overPos.x,
      clientY: overPos.y,
      pointerId: 1,
    });
  });
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('validateGameCardDrop (5-scenario matrix)', () => {
  it('Scenario 1: always allows same-container reordering in folder and flat sorts', () => {
    const g1 = makeGame({ gameKey: 'g1', folderPath: 'C:/Games/A/g1' });
    expect(
      validateGameCardDrop({
        sourceContainerId: 'C:/Games/A',
        targetContainerId: 'C:/Games/A',
        item: g1,
        currentSort: 'folder',
        favorites: [],
        targetPlatform: 'win32',
      })
    ).toBe(true);
    expect(
      validateGameCardDrop({
        sourceContainerId: 'fav',
        targetContainerId: 'fav',
        item: makeSingleItem({ ...g1, favorite: true }),
        currentSort: 'folder',
        favorites: [g1],
        targetPlatform: 'win32',
      })
    ).toBe(true);
    expect(
      validateGameCardDrop({
        sourceContainerId: 'unfav',
        targetContainerId: 'unfav',
        item: g1,
        currentSort: 'date',
        favorites: [],
      })
    ).toBe(true);
  });

  it('Scenario 2: folder sort -> drag into fav allowed only when not already in favorites (GameEntry, SingleLibraryViewItem, StackLibraryViewItem)', () => {
    const g1 = makeGame({ gameKey: 'g1', favorite: false });
    const g1Fav = makeGame({ gameKey: 'g1', favorite: true });
    const singleNotFav = makeSingleItem(g1);
    const singleFav = makeSingleItem(g1Fav);
    const stackNotFav = makeStackItem([
      makeGame({ gameId: 's1', gameKey: 's1-a', favorite: false }),
      makeGame({ gameId: 's1', gameKey: 's1-b', favorite: false }),
    ]);
    const stackFav = makeStackItem([
      makeGame({ gameId: 's1', gameKey: 's1-a', favorite: true }),
      makeGame({ gameId: 's1', gameKey: 's1-b', favorite: false }),
    ]);

    expect(
      validateGameCardDrop({
        sourceContainerId: 'C:/Games/A',
        targetContainerId: 'fav',
        item: singleNotFav,
        currentSort: 'folder',
        favorites: [],
      })
    ).toBe(true);

    expect(
      validateGameCardDrop({
        sourceContainerId: 'C:/Games/A',
        targetContainerId: 'fav',
        item: singleFav,
        currentSort: 'folder',
        favorites: [],
      })
    ).toBe(false);

    expect(
      validateGameCardDrop({
        sourceContainerId: 'C:/Games/A',
        targetContainerId: 'fav',
        item: singleNotFav,
        currentSort: 'folder',
        favorites: [singleFav],
      })
    ).toBe(false);

    expect(
      validateGameCardDrop({
        sourceContainerId: 'C:/Games/A',
        targetContainerId: 'fav',
        item: stackNotFav,
        currentSort: 'folder',
        favorites: [],
      })
    ).toBe(true);

    expect(
      validateGameCardDrop({
        sourceContainerId: 'C:/Games/A',
        targetContainerId: 'fav',
        item: stackFav,
        currentSort: 'folder',
        favorites: [],
      })
    ).toBe(false);

    expect(
      validateGameCardDrop({
        sourceContainerId: 'C:/Games/A',
        targetContainerId: 'fav',
        item: stackNotFav,
        currentSort: 'folder',
        favorites: [stackFav],
      })
    ).toBe(false);
  });

  it('Scenario 3: folder sort -> drag out of fav allowed strictly into owning root folder (including trailing slash, whitespace, and macOS NFD/NFC)', () => {
    const winItem = makeSingleItem(
      makeGame({
        gameKey: 'g1',
        folderPath: '  C:\\Games\\Alpha\\Sub\\g1\\  ',
        favorite: true,
      })
    );

    expect(
      validateGameCardDrop({
        sourceContainerId: 'fav',
        targetContainerId: 'C:/Games/Alpha/',
        item: winItem,
        currentSort: 'folder',
        favorites: [winItem],
        targetPlatform: 'win32',
      })
    ).toBe(true);

    expect(
      validateGameCardDrop({
        sourceContainerId: 'fav',
        targetContainerId: 'C:/Games/Beta',
        item: winItem,
        currentSort: 'folder',
        favorites: [winItem],
        targetPlatform: 'win32',
      })
    ).toBe(false);

    const nfdFolder = '/Users/me/Games/Cafe\u0301/Sub/g2';
    const nfcRoot = '/Users/me/Games/Caf\u00e9/';
    const macStack = makeStackItem([
      makeGame({ gameId: 'mac1', gameKey: 'mac1-a', folderPath: nfdFolder, favorite: true }),
      makeGame({ gameId: 'mac1', gameKey: 'mac1-b', folderPath: '/Users/me/Games/Other/g2', favorite: true }),
    ]);

    expect(
      validateGameCardDrop({
        sourceContainerId: 'fav',
        targetContainerId: nfcRoot,
        item: macStack,
        currentSort: 'folder',
        favorites: [macStack],
        targetPlatform: 'darwin',
      })
    ).toBe(true);

    expect(
      validateGameCardDrop({
        sourceContainerId: 'fav',
        targetContainerId: '/Users/me/Games/Other',
        item: macStack,
        currentSort: 'folder',
        favorites: [macStack],
        targetPlatform: 'darwin',
      })
    ).toBe(false);
  });

  it('Scenario 4: rejects cross-folder drops in folder sort', () => {
    const g1 = makeSingleItem(makeGame({ gameKey: 'g1', folderPath: '/games/a/g1' }));
    expect(
      validateGameCardDrop({
        sourceContainerId: '/games/a',
        targetContainerId: '/games/b',
        item: g1,
        currentSort: 'folder',
        favorites: [],
        targetPlatform: 'linux',
      })
    ).toBe(false);
  });

  it('Scenario 5: flat sort modes (date, played, az, custom) allow fav <-> unfav unconditionally', () => {
    const item = makeSingleItem(makeGame({ gameKey: 'g1', favorite: false }));
    for (const sortMode of ['date', 'played', 'az', 'custom']) {
      expect(
        validateGameCardDrop({
          sourceContainerId: 'unfav',
          targetContainerId: 'fav',
          item,
          currentSort: sortMode,
          favorites: [],
        })
      ).toBe(true);
      expect(
        validateGameCardDrop({
          sourceContainerId: 'fav',
          targetContainerId: 'unfav',
          item: { ...item, favorite: true },
          currentSort: sortMode,
          favorites: [item],
        })
      ).toBe(true);
    }
  });
});

describe('GameDndContext, SortableGameCard & LibraryGrid DnD Integration', () => {
  const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;

  afterEach(() => {
    cleanup();
    Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('reorders cards in flat non-custom sort (seeding from live viewItems, preserving category-hidden & disconnected-drive keys) and switches to custom', async () => {
    const storage = createMemoryStorage();
    writeCustomOrder(['stale-g3', 'disconnected-drive-key', 'g2', 'g1'], storage);
    const store = createUiRuntimeState(storage);
    store.setCurrentSort('az');
    store.setAllGames([
      makeGame({ gameKey: 'g1', name: 'Alpha', title: 'Alpha', categoryIds: ['rpg'] }),
      makeGame({ gameKey: 'g2', name: 'Beta', title: 'Beta', categoryIds: ['rpg'] }),
      makeGame({ gameKey: 'hidden-g3', name: 'Gamma', title: 'Gamma', categoryIds: ['sim'] }),
    ]);
    store.setActiveCategoryId('rpg');

    mockElementRects((el) => {
      const key = el.getAttribute('data-game-key');
      if (key === 'g1') return makeRect(0, 0, 100, 100);
      if (key === 'g2') return makeRect(200, 0, 100, 100);
      if (el.id === 'unfav-grid') return makeRect(0, 0, 500, 200);
      return null;
    });

    render(
      <LibraryStateProvider store={store}>
        <LibraryGrid storage={storage} />
      </LibraryStateProvider>
    );

    const g1El = document.querySelector('[data-game-key="g1"]')!;
    await performPointerDrag(g1El, { x: 50, y: 50 }, { x: 250, y: 50 });

    expect(store.getSnapshot().currentSort).toBe('custom');
    // Seeded from live viewItems ([g1, g2]), then remaining from resolved/storedOrder, then reordered g1 after g2
    expect(readStoredCustomOrder(storage)).toEqual([
      'g2',
      'g1',
      'stale-g3',
      'disconnected-drive-key',
    ]);
  });

  it('preserves disconnected-drive keys on forward/backward custom & folder reorder and on failed cross-zone rollback', async () => {
    const storage = createMemoryStorage();
    writeCustomOrder(['disconnected-drive-key', 'g1', 'g2'], storage);
    const store = createUiRuntimeState(storage);
    store.setCurrentSort('custom');
    store.setAllGames([
      makeGame({ gameKey: 'g1', name: 'One', favorite: false }),
      makeGame({ gameKey: 'g2', name: 'Two', favorite: false }),
    ]);

    mockElementRects((el) => {
      const key = el.getAttribute('data-game-key');
      if (key === 'g1') return makeRect(0, 100, 100, 100);
      if (key === 'g2') return makeRect(200, 100, 100, 100);
      if (el.id === 'fav-grid') return makeRect(0, 0, 500, 80);
      if (el.id === 'unfav-grid') return makeRect(0, 100, 500, 200);
      return null;
    });

    const { unmount } = render(
      <LibraryStateProvider store={store}>
        <LibraryGrid storage={storage} />
      </LibraryStateProvider>
    );

    const g2El = document.querySelector('[data-game-key="g2"]')!;
    await performPointerDrag(g2El, { x: 250, y: 150 }, { x: 50, y: 150 });
    expect(readStoredCustomOrder(storage)).toEqual(['g2', 'g1', 'disconnected-drive-key']);
    unmount();

    // Now test rollback on failed cross-zone drag
    const storage2 = createMemoryStorage();
    writeCustomOrder(['disconnected-drive-key', 'g1', 'g2'], storage2);
    const store2 = createUiRuntimeState(storage2);
    store2.setCurrentSort('custom');
    store2.setAllGames([
      makeGame({ gameKey: 'g1', name: 'One', favorite: false }),
      makeGame({ gameKey: 'g2', name: 'Two', favorite: false }),
    ]);
    const toggleFavorite = vi.fn().mockRejectedValue(new Error('IPC failure'));
    const onShowToast = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <LibraryStateProvider store={store2}>
        <LibraryGrid
          storage={storage2}
          electronAPI={{ toggleFavorite } as unknown as ElectronAPI}
          onShowToast={onShowToast}
        />
      </LibraryStateProvider>
    );

    const g1Card = document.querySelector('[data-game-key="g1"]')!;
    await performPointerDrag(g1Card, { x: 50, y: 150 }, { x: 250, y: 40 });

    expect(readStoredCustomOrder(storage2)).toEqual(['disconnected-drive-key', 'g1', 'g2']);
    expect(onShowToast).toHaveBeenCalledWith(enLocale.strings.toast_favorite_update_failed);
    expect(store2.getSnapshot().allGames[0].favorite).toBe(false);
  });

  it('moves multi-key StackCard forward past a middle card onto a non-terminal card without splitting keys', async () => {
    const storage = createMemoryStorage();
    writeCustomOrder(['s1_a', 's1_b', 'g2', 'g3', 'g4'], storage);

    const s1 = makeStackItem([
      makeGame({ gameId: 's1', gameKey: 's1_a', name: 'Stack 1' }),
      makeGame({ gameId: 's1', gameKey: 's1_b', name: 'Stack 1' }),
    ]);
    const g2 = makeSingleItem(makeGame({ gameKey: 'g2', name: 'G2' }));
    const g3 = makeSingleItem(makeGame({ gameKey: 'g3', name: 'G3' }));
    const g4 = makeSingleItem(makeGame({ gameKey: 'g4', name: 'G4' }));
    const items: LibraryViewItem[] = [s1, g2, g3, g4];

    mockElementRects((el) => {
      const key = el.getAttribute('data-game-key');
      if (key === 's1_a') return makeRect(0, 0, 100, 100);
      if (key === 'g2') return makeRect(150, 0, 100, 100);
      if (key === 'g3') return makeRect(300, 0, 100, 100);
      if (key === 'g4') return makeRect(450, 0, 100, 100);
      return makeRect(0, 0, 600, 200);
    });

    render(
      <GameDndContext
        currentSort="custom"
        viewItems={items}
        favorites={[]}
        resolvedCustomOrder={['s1_a', 's1_b', 'g2', 'g3', 'g4']}
        knownContainerIds={['fav', 'unfav']}
        storage={storage}
        onCommitFavoriteToggle={vi.fn(async () => 'committed' as const)}
        onSetSort={vi.fn()}
      >
        {({ renderSectionContainer }) =>
          renderSectionContainer('unfav', items.map((i) => `unfav::${i.isStack ? i.groupKey : i.representativeKey}`), (ref) => (
            <div ref={ref} id="unfav-grid">
              {items.map((item) => (
                <SortableGameCard
                  key={item.isStack ? item.groupKey : item.representativeKey}
                  id={`unfav::${item.isStack ? item.groupKey : item.representativeKey}`}
                  item={item}
                  CardComponent={GameCard}
                  StackComponent={StackCard}
                />
              ))}
            </div>
          ))
        }
      </GameDndContext>
    );

    const s1El = document.querySelector('[data-game-key="s1_a"]')!;
    await performPointerDrag(s1El, { x: 50, y: 50 }, { x: 350, y: 50 });

    expect(readStoredCustomOrder(storage)).toEqual(['g2', 'g3', 's1_a', 's1_b', 'g4']);
  });

  it('handles folder sort drag into empty #fav-grid, empty FolderSection, dual-placed Scenario 3 drop, and rejects collapsed FolderSection', async () => {
    const storage = createMemoryStorage();
    const store = createUiRuntimeState(storage);
    store.setCurrentSort('folder');
    store.setCurrentLibraryConfig({
      libraryPath: '/games/alpha',
      libraryPaths: ['/games/alpha', '/games/beta', '/games/gamma'],
      folderAliases: {},
      exposeBetaOptions: false,
      maxDepth: 2,
      autoLaunch: false,
      minimizeToTray: false,
    });
    store.setAllGames([
      makeGame({
        gameKey: 'g1',
        name: 'Alpha Game',
        folderPath: '/games/alpha/g1',
        favorite: false,
      }),
    ]);

    const toggleFavorite = vi.fn(async (_key: string, fav: boolean) => fav);

    mockElementRects((el) => {
      if (el.id === 'fav-grid') return makeRect(0, 0, 500, 80);
      if (el.getAttribute('data-game-key') === 'g1') return makeRect(0, 120, 100, 100);
      if (el.classList.contains('drop-zone')) {
        // Collapsed or empty folder sections
        const section = el.closest('.folder-section');
        if (section?.classList.contains('is-collapsed')) {
          return makeRect(0, 400, 500, 80);
        }
        return makeRect(0, 120, 500, 100);
      }
      return null;
    });

    const { unmount } = render(
      <LibraryStateProvider store={store}>
        <LibraryGrid
          storage={storage}
          targetPlatform="linux"
          electronAPI={{ toggleFavorite } as unknown as ElectronAPI}
        />
      </LibraryStateProvider>
    );

    // Drag g1 into empty #fav-grid (which appears when drag starts)
    const g1El = document.querySelector('[data-game-key="g1"]')!;
    await startPointerDrag(g1El, { x: 50, y: 170 }, { x: 250, y: 40 });
    const favGridDuringDrag = document.getElementById('fav-grid');
    expect(favGridDuringDrag).toBeTruthy();
    expect(favGridDuringDrag?.classList.contains('drag-over')).toBe(true);

    await act(async () => {
      fireEvent.pointerUp(document, { clientX: 250, clientY: 40, pointerId: 1 });
    });

    expect(toggleFavorite).toHaveBeenCalledWith('g1', true);
    expect(store.getSnapshot().allGames[0].favorite).toBe(true);

    // Dual-placed Scenario 3 drop: drag fav::g1 onto /games/alpha::g1
    const favG1El = document.querySelector('#fav-grid [data-game-key="g1"]')!;
    const alphaG1El = document.querySelector('.folder-section [data-game-key="g1"]')!;
    expect(favG1El).toBeTruthy();
    expect(alphaG1El).toBeTruthy();

    mockElementRects((el) => {
      if (el === favG1El) return makeRect(0, 0, 100, 80);
      if (el === alphaG1El) return makeRect(0, 120, 100, 100);
      if (el.id === 'fav-grid') return makeRect(0, 0, 500, 80);
      return null;
    });

    await performPointerDrag(favG1El, { x: 50, y: 40 }, { x: 50, y: 170 });
    expect(toggleFavorite).toHaveBeenCalledWith('g1', false);
    expect(store.getSnapshot().allGames[0].favorite).toBe(false);

    unmount();

    // Now test collapsed section drop via GameDndContext directly
    const onCommit = vi.fn(async () => 'committed' as const);
    const projection: LibrarySectionsProjection = {
      effectiveTabId: 'all',
      favoritesSection: [makeSingleItem(makeGame({ gameKey: 'g1', folderPath: '/games/alpha/g1', favorite: true }))],
      folderSections: [
        {
          path: '/games/alpha',
          displayName: 'Alpha',
          games: [],
          isEmpty: true,
          isCollapsible: true,
        },
      ],
      allFolderSections: [],
    };
    const collapsedStorage = createMemoryStorage({
      yumeshelf_collapsed_folders: JSON.stringify({ schemaVersion: 1, collapsed: ['/games/alpha'] }),
    });

    render(
      <GameDndContext
        currentSort="folder"
        viewItems={projection.favoritesSection!}
        favorites={projection.favoritesSection!}
        resolvedCustomOrder={null}
        knownContainerIds={['fav', '/games/alpha']}
        storage={collapsedStorage}
        targetPlatform="linux"
        onCommitFavoriteToggle={onCommit}
        onSetSort={vi.fn()}
      >
        {({ renderSectionContainer }) => (
          <FolderAccordion
            projection={projection}
            storage={collapsedStorage}
            renderSectionContainer={renderSectionContainer}
            renderItem={(item, scope) => (
              <SortableGameCard
                key={item.representativeKey}
                id={`${scope}::${item.representativeKey}`}
                item={item}
                CardComponent={GameCard}
                StackComponent={StackCard}
              />
            )}
          />
        )}
      </GameDndContext>
    );

    const collapsedZone = document.querySelector('.folder-section.is-collapsed .drop-zone')!;
    const favCard = document.querySelector('#fav-grid [data-game-key="g1"]')!;
    mockElementRects((el) => {
      if (el === favCard) return makeRect(0, 0, 100, 80);
      if (el === collapsedZone) return makeRect(0, 300, 500, 100);
      return null;
    });

    await performPointerDrag(favCard, { x: 50, y: 40 }, { x: 50, y: 350 });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('treats self-drop and same-container background drop in date sort as no-ops and resets isDraggingCard', async () => {
    const storage = createMemoryStorage();
    const store = createUiRuntimeState(storage);
    store.setCurrentSort('date');
    store.setAllGames([makeGame({ gameKey: 'g1', name: 'One' })]);

    mockElementRects((el) => {
      if (el.getAttribute('data-game-key') === 'g1') return makeRect(0, 0, 100, 100);
      if (el.id === 'unfav-grid') return makeRect(0, 0, 500, 300);
      return null;
    });

    render(
      <LibraryStateProvider store={store}>
        <LibraryGrid storage={storage} />
      </LibraryStateProvider>
    );

    const g1El = document.querySelector('[data-game-key="g1"]')!;
    await performPointerDrag(g1El, { x: 50, y: 50 }, { x: 55, y: 55 });

    expect(store.getSnapshot().currentSort).toBe('date');
    expect(readStoredCustomOrder(storage)).toEqual([]);
  });

  it('preserves :: in folder section.path and gameKey during reorder and resolveConnectedCardElement focus handoff', async () => {
    const storage = createMemoryStorage();
    writeCustomOrder(['ns::game-1', 'other-game', 'ns::game-2'], storage);
    const store = createUiRuntimeState(storage);
    store.setCurrentSort('folder');
    store.setCurrentLibraryConfig({
      libraryPath: '/games/ns::v1',
      libraryPaths: ['/games/ns::v1', '/games/other'],
      folderAliases: {},
      exposeBetaOptions: false,
      maxDepth: 2,
      autoLaunch: false,
      minimizeToTray: false,
    });
    store.setAllGames([
      makeGame({ gameKey: 'ns::game-1', name: 'NS 1', folderPath: '/games/ns::v1/g1' }),
      makeGame({ gameKey: 'other-game', name: 'Other', folderPath: '/games/other/g' }),
      makeGame({ gameKey: 'ns::game-2', name: 'NS 2', folderPath: '/games/ns::v1/g2' }),
    ]);

    mockElementRects((el) => {
      const k = el.getAttribute('data-game-key');
      if (k === 'ns::game-1') return makeRect(0, 0, 100, 100);
      if (k === 'ns::game-2') return makeRect(200, 0, 100, 100);
      return null;
    });

    render(
      <LibraryStateProvider store={store}>
        <LibraryGrid storage={storage} targetPlatform="linux" />
      </LibraryStateProvider>
    );

    const ns1 = document.querySelector('[data-game-key="ns::game-1"]')!;
    await performPointerDrag(ns1, { x: 50, y: 50 }, { x: 250, y: 50 });

    expect(readStoredCustomOrder(storage)).toEqual(['other-game', 'ns::game-2', 'ns::game-1']);

    // Verify resolveConnectedCardElement focus handoff on favorite toggle for ns::game-1
    const favBtn = document.querySelector('[data-game-key="ns::game-1"] .fav-btn') as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(favBtn);
    });
    await waitFor(() => {
      expect(document.activeElement?.closest('[data-game-key]')?.getAttribute('data-game-key')).toBe('ns::game-1');
    });
  });

  it('handles in-flight lock contention (skipped) without toast, and rolls back LibraryStore + viewItems + toast on IPC failure', async () => {
    const storage = createMemoryStorage();
    writeCustomOrder(['g1', 'g2'], storage);
    const store = createUiRuntimeState(storage);
    store.setCurrentSort('custom');
    store.setAllGames([
      makeGame({ gameKey: 'g1', name: 'One', favorite: false }),
      makeGame({ gameKey: 'g2', name: 'Two', favorite: false }),
    ]);

    const inFlightRef = { current: new Set<string>(['game:g1']) };
    const onShowToast = vi.fn();

    mockElementRects((el) => {
      if (el.getAttribute('data-game-key') === 'g1') return makeRect(0, 100, 100, 100);
      if (el.id === 'fav-grid') return makeRect(0, 0, 500, 80);
      if (el.id === 'unfav-grid') return makeRect(0, 100, 500, 200);
      return null;
    });

    const { unmount } = render(
      <LibraryStateProvider store={store}>
        <LibraryGrid
          storage={storage}
          inFlightFavoriteKeysRef={inFlightRef}
          onShowToast={onShowToast}
        />
      </LibraryStateProvider>
    );

    const g1El = document.querySelector('[data-game-key="g1"]')!;
    await performPointerDrag(g1El, { x: 50, y: 150 }, { x: 50, y: 40 });
    expect(onShowToast).not.toHaveBeenCalled();
    expect(store.getSnapshot().allGames[0].favorite).toBe(false);
    unmount();

    // Backend desync ('failed') rolls back LibraryStore favorite, rendered zone, and shows toast
    const storage2 = createMemoryStorage();
    writeCustomOrder(['g1', 'g2'], storage2);
    const store2 = createUiRuntimeState(storage2);
    store2.setCurrentSort('custom');
    store2.setAllGames([
      makeGame({ gameKey: 'g1', name: 'One', favorite: false }),
      makeGame({ gameKey: 'g2', name: 'Two', favorite: false }),
    ]);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onShowToast2 = vi.fn();

    render(
      <LibraryStateProvider store={store2}>
        <LibraryGrid
          storage={storage2}
          electronAPI={{ toggleFavorite: vi.fn(async () => false) } as unknown as ElectronAPI}
          onShowToast={onShowToast2}
        />
      </LibraryStateProvider>
    );

    const g1El2 = document.querySelector('[data-game-key="g1"]')!;
    await performPointerDrag(g1El2, { x: 50, y: 150 }, { x: 250, y: 40 });
    expect(store2.getSnapshot().allGames[0].favorite).toBe(false);
    expect(document.querySelector('#unfav-grid [data-game-key="g1"]')).toBeTruthy();
    expect(document.querySelector('#fav-grid [data-game-key="g1"]')).toBeNull();
    expect(onShowToast2).toHaveBeenCalledWith(enLocale.strings.toast_favorite_update_failed);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('guards concurrent drags with deterministic deferred Promise: preserves Drag #2 customOrder/sort while rolling back Drag #1 LibraryStore favorite without stale toast', async () => {
    const storage = createMemoryStorage();
    writeCustomOrder(['g1', 'g2', 'g3'], storage);
    const store = createUiRuntimeState(storage);
    store.setCurrentSort('date');
    store.setAllGames([
      makeGame({ gameKey: 'g1', name: 'One', dateAdded: 300, favorite: false }),
      makeGame({ gameKey: 'g2', name: 'Two', dateAdded: 200, favorite: false }),
      makeGame({ gameKey: 'g3', name: 'Three', dateAdded: 100, favorite: false }),
    ]);

    const drag1Deferred = createDeferred<boolean>();
    const toggleFavorite = vi.fn().mockImplementation(() => drag1Deferred.promise);
    const onShowToast = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => {});

    mockElementRects((el) => {
      const k = el.getAttribute('data-game-key');
      if (k === 'g1') return makeRect(0, 100, 100, 100);
      if (k === 'g2') return makeRect(150, 100, 100, 100);
      if (k === 'g3') return makeRect(300, 100, 100, 100);
      if (el.id === 'fav-grid') return makeRect(0, 0, 500, 80);
      if (el.id === 'unfav-grid') return makeRect(0, 100, 500, 200);
      return null;
    });

    render(
      <LibraryStateProvider store={store}>
        <LibraryGrid
          storage={storage}
          electronAPI={{ toggleFavorite } as unknown as ElectronAPI}
          onShowToast={onShowToast}
        />
      </LibraryStateProvider>
    );

    // Drag #1: cross-zone g1 -> fav (pending IPC)
    const g1El = document.querySelector('[data-game-key="g1"]')!;
    await performPointerDrag(g1El, { x: 50, y: 150 }, { x: 250, y: 40 });
    expect(store.getSnapshot().currentSort).toBe('custom');
    expect(store.getSnapshot().allGames[0].favorite).toBe(true);

    // Drag #2: same-container reorder g3 -> g2 while Drag #1 is still pending
    const g3El = document.querySelector('[data-game-key="g3"]')!;
    await performPointerDrag(g3El, { x: 350, y: 150 }, { x: 200, y: 150 });
    const orderAfterDrag2 = readStoredCustomOrder(storage);
    expect(orderAfterDrag2).toEqual(['g1', 'g3', 'g2']);

    // Now reject Drag #1
    await act(async () => {
      drag1Deferred.reject(new Error('Network timeout'));
      await Promise.resolve();
    });

    // Drag #1's favorite rolls back in LibraryStore, but Drag #2's customOrder and sort are preserved, and stale toast is suppressed
    expect(store.getSnapshot().allGames[0].favorite).toBe(false);
    expect(readStoredCustomOrder(storage)).toEqual(['g1', 'g3', 'g2']);
    expect(store.getSnapshot().currentSort).toBe('custom');
    expect(onShowToast).not.toHaveBeenCalled();
  });

  it('suppresses drag on interactive descendants (.fav-btn, .menu-btn, .dropdown-item, inline rename <input>) and cleans up on mid-drag unmount', async () => {
    const onDragStateChange = vi.fn();
    const onToggleFav = vi.fn(async () => 'committed' as const);
    const items = [makeSingleItem(makeGame({ gameKey: 'g1', name: 'One' }))];

    const { container, rerender } = render(
      <GameDndContext
        currentSort="custom"
        viewItems={items}
        favorites={[]}
        resolvedCustomOrder={['g1']}
        knownContainerIds={['fav', 'unfav']}
        onDragStateChange={onDragStateChange}
        onCommitFavoriteToggle={onToggleFav}
        onSetSort={vi.fn()}
      >
        {({ renderSectionContainer }) =>
          renderSectionContainer('unfav', ['unfav::g1'], (ref) => (
            <div ref={ref} id="unfav-grid">
              <SortableGameCard
                id="unfav::g1"
                item={items[0]}
                CardComponent={GameCard}
                StackComponent={StackCard}
              />
            </div>
          ))
        }
      </GameDndContext>
    );

    const favBtn = document.querySelector('.fav-btn')!;
    await startPointerDrag(favBtn, { x: 10, y: 10 }, { x: 40, y: 10 });
    expect(onDragStateChange).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.pointerUp(document, { clientX: 40, clientY: 10, pointerId: 1 });
    });

    const menuBtn = screen.getByRole('button', { name: 'Game options' });
    await startPointerDrag(menuBtn, { x: 10, y: 10 }, { x: 40, y: 10 });
    expect(onDragStateChange).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.pointerUp(document, { clientX: 40, clientY: 10, pointerId: 1 });
    });

    // Open menu, test .dropdown-item, then trigger inline rename and test <input>
    await act(async () => {
      fireEvent.click(menuBtn);
    });
    await waitFor(() => {
      expect(container.querySelector('.dropdown-item.action-rename')).toBeTruthy();
    });
    const renameMenuItem = container.querySelector('.dropdown-item.action-rename')!;
    await startPointerDrag(renameMenuItem, { x: 10, y: 10 }, { x: 40, y: 10 });
    expect(onDragStateChange).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.pointerUp(document, { clientX: 40, clientY: 10, pointerId: 1 });
    });
    await act(async () => {
      fireEvent.click(renameMenuItem);
    });

    const renameInput = document.querySelector('input.rename-input')!;
    expect(renameInput).toBeTruthy();
    await startPointerDrag(renameInput, { x: 10, y: 10 }, { x: 40, y: 10 });
    expect(onDragStateChange).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.pointerUp(document, { clientX: 40, clientY: 10, pointerId: 1 });
    });
    fireEvent.keyDown(renameInput, { key: 'Escape' });

    // Start real drag on card body, inspect DragOverlay & source opacity, then unmount mid-drag
    const cardEl = document.querySelector('[data-game-key="g1"]') as HTMLElement;
    await startPointerDrag(cardEl, { x: 50, y: 50 }, { x: 80, y: 50 });
    expect(onDragStateChange).toHaveBeenCalledWith(true);
    expect(cardEl.style.opacity).toBe('0.4');
    expect(document.body.querySelectorAll('[data-game-key="g1"]').length).toBe(2);

    rerender(<div />);
    expect(onDragStateChange).toHaveBeenCalledWith(false);
    expect(document.body.querySelector('[data-game-key="g1"]')).toBeNull();
  });

  it('preserves role="article"/"region", tabIndex={0}, Enter/Space launch/open, and useStableItemIds Object.is stability', () => {
    const onLaunch = vi.fn();
    const onOpenStack = vi.fn();
    const single = makeSingleItem(makeGame({ gameKey: 'g1', name: 'Single' }));
    const stack = makeStackItem([
      makeGame({ gameId: 's1', gameKey: 's1-a', name: 'Stack' }),
      makeGame({ gameId: 's1', gameKey: 's1-b', name: 'Stack' }),
    ]);
    const items: LibraryViewItem[] = [single, stack];

    const { result, rerender } = renderHook(
      ({ list, scope }) => useStableItemIds(list, scope),
      { initialProps: { list: items, scope: 'unfav' } }
    );
    const firstIds = result.current;
    // Clone items array (simulating playtime tick)
    rerender({ list: [...items], scope: 'unfav' });
    expect(Object.is(result.current, firstIds)).toBe(true);
    // Scope change produces new array
    rerender({ list: [...items], scope: 'fav' });
    expect(Object.is(result.current, firstIds)).toBe(false);

    render(
      <GameDndContext
        currentSort="custom"
        viewItems={items}
        favorites={[]}
        resolvedCustomOrder={null}
        knownContainerIds={['fav', 'unfav']}
        onCommitFavoriteToggle={vi.fn(async () => 'committed' as const)}
        onSetSort={vi.fn()}
      >
        {({ renderSectionContainer }) =>
          renderSectionContainer('unfav', firstIds, (ref) => (
            <div ref={ref} id="unfav-grid">
              <SortableGameCard
                id="unfav::g1"
                item={single}
                CardComponent={GameCard}
                StackComponent={StackCard}
                onLaunch={onLaunch}
              />
              <SortableGameCard
                id="unfav::game:s1"
                item={stack}
                CardComponent={GameCard}
                StackComponent={StackCard}
                onOpenStack={onOpenStack}
              />
            </div>
          ))
        }
      </GameDndContext>
    );

    const article = screen.getByRole('article') as HTMLElement;
    const region = screen.getByRole('region') as HTMLElement;
    expect(article.tabIndex).toBe(0);
    expect(region.tabIndex).toBe(0);

    fireEvent.keyDown(article, { key: 'Enter' });
    fireEvent.keyDown(article, { key: ' ' });
    expect(onLaunch).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(region, { key: 'Enter' });
    fireEvent.keyDown(region, { key: ' ' });
    expect(onOpenStack).toHaveBeenCalledTimes(2);
  });
});
