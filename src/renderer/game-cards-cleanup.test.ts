import { describe, it, expect, vi } from 'vitest';
import { createGameCardFactory } from './game-cards';
import { createStackCardFactory } from './stack-cards';

describe('Frontend Tech Debt Cleanup: Cards & Drag Purge', () => {
  it('createCard produces a card without draggable attribute or native drag listeners, while preserving launch & favorite', () => {
    const onGameLaunched = vi.fn();
    const { createCard } = createGameCardFactory({
      attachTooltip: vi.fn(),
      electronAPI: {
        launchYume: vi.fn(),
        checkTranslationSupport: vi.fn().mockResolvedValue({ supported: false }),
      },
      getStrings: () => ({
        rename: 'Rename',
        open_folder: 'Open Folder',
        remove: 'Remove',
        duplicate_badge: 'Duplicate',
        playtime_prefix: 'Playtime:',
        last_played_prefix: 'Last played:',
      }),
      onCardDeleted: vi.fn(),
      onDragStateReset: vi.fn(),
      onDragStart: vi.fn(),
      onGameLaunched,
      onFavoriteToggled: vi.fn(),
      onRefreshRequested: vi.fn(),
      isBetaExposed: () => false,
    });

    const card = createCard({ key: 'game-1', name: 'Test Game', exePath: 'C:\\game.exe', favorite: false });

    expect(card.getAttribute('draggable')).toBeNull();
    expect(card.ondragstart).toBeUndefined();
    expect(card.ondragend).toBeUndefined();
    expect(card.ondragenter).toBeUndefined();
    expect(card.ondragleave).toBeUndefined();
    expect(card.ondragover).toBeUndefined();
    expect(card.ondrop).toBeUndefined();

    const favBtn = card.querySelector('.fav-btn') as HTMLElement;
    expect(favBtn.getAttribute('draggable')).toBeNull();

    card.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(onGameLaunched).toHaveBeenCalledTimes(1);
  });

  it('createStackCard produces a stack card without draggable attribute or native drag listeners, while preserving open', () => {
    const onOpenStack = vi.fn();
    const { createStackCard } = createStackCardFactory({
      attachTooltip: vi.fn(),
      electronAPI: {},
      getStrings: () => ({
        rename: 'Rename',
        open_folder: 'Open Folder',
        remove: 'Remove',
      }),
      onOpenStack,
      onDragStart: vi.fn(),
      onDragStateReset: vi.fn(),
      onFavoriteToggled: vi.fn(),
      onRefreshRequested: vi.fn(),
      onRenamed: vi.fn(),
    });

    const stackCard = createStackCard({
      representativeKey: 'stack-1',
      stackSize: 2,
      favorite: false,
      primaryGame: { key: 'g1', name: 'Stack Game', exePath: 'C:\\g1.exe', locationLabel: 'C:\\' },
      games: [{ key: 'g1', locationLabel: 'C:\\' }, { key: 'g2', locationLabel: 'D:\\' }],
    });

    expect(stackCard.getAttribute('draggable')).toBeNull();
    expect(stackCard.ondragstart).toBeUndefined();
    expect(stackCard.ondragend).toBeUndefined();
    expect(stackCard.ondragenter).toBeUndefined();
    expect(stackCard.ondragleave).toBeUndefined();
    expect(stackCard.ondragover).toBeUndefined();
    expect(stackCard.ondrop).toBeUndefined();

    stackCard.click();
    expect(onOpenStack).toHaveBeenCalledTimes(1);
  });
});
