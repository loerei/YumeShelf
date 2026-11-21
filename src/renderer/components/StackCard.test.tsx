import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LibraryViewItem } from '../library-stacks';
import type { GameEntry } from '../types/game';
import { StackCard } from './StackCard';

const GAME_1: GameEntry = {
  gameKey: 'main::rpg/alpha-v1',
  gameId: 'alpha-v1',
  name: 'Alpha Quest',
  folderName: 'Alpha v1',
  exePath: 'D:\\Games\\Alpha v1\\Game.exe',
  favorite: false,
  isRunning: false,
};

const GAME_2: GameEntry = {
  gameKey: 'main::rpg/alpha-v2',
  gameId: 'alpha-v2',
  name: 'Alpha Quest',
  folderName: 'Alpha v2',
  exePath: 'D:\\Games\\Alpha v2\\Game.exe',
  favorite: false,
  isRunning: true,
};

const SAMPLE_STACK: LibraryViewItem = {
  type: 'stack',
  isStack: true,
  groupKey: 'id:RJ123456',
  representativeKey: 'main::rpg/alpha-v1',
  favorite: false,
  primaryGame: GAME_1,
  games: [GAME_1, GAME_2],
  stackSize: 2,
};

describe('StackCard', () => {
  it('renders .game-card.stack-card, data attributes, role="region", aria-label, favorite classes, native buttons, and inline SVGs', () => {
    const ref = React.createRef<HTMLDivElement>();
    const { container, rerender } = render(
      <StackCard ref={ref} stack={SAMPLE_STACK} data-testid="stack-1" />
    );

    const card = screen.getByRole('region', { name: 'Game stack: Alpha Quest (2 instances)' });
    expect(ref.current).toBe(card);
    expect(card).toHaveClass('game-card', 'stack-card', 'running');
    expect(card).not.toHaveClass('favorited');
    expect(card).toHaveAttribute('data-group-key', 'id:RJ123456');
    expect(card).toHaveAttribute('data-game-key', 'main::rpg/alpha-v1');
    expect(card).toHaveAttribute('data-testid', 'stack-1');
    expect(card).toHaveAttribute('tabindex', '0');
    expect(card).not.toHaveAttribute('draggable');
    const chip = container.querySelector('.game-duplicate-chip');
    const title = container.querySelector('.game-title');
    expect(chip).toHaveTextContent('2x');
    expect(chip && title && Boolean(chip.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    expect(container.querySelector('.game-status')).toHaveTextContent('Playing');
    expect(container.querySelector('.game-playtime')).toHaveTextContent('0m');

    const favBtn = screen.getByRole('button', { name: 'Add to favorites' });
    expect(favBtn.tagName).toBe('BUTTON');
    expect(favBtn).toHaveAttribute('type', 'button');
    expect(favBtn).toHaveClass('fav-btn', 'stack-fav-indicator');
    expect(favBtn).not.toHaveClass('active');
    expect(favBtn).toHaveAttribute('aria-pressed', 'false');
    expect(favBtn).toHaveAttribute('title', 'Add to favorites');
    const favSvg = favBtn.querySelector('svg[aria-hidden="true"]');
    expect(favSvg).toBeInTheDocument();
    expect(favSvg).toHaveAttribute('fill', 'currentColor');
    expect(favSvg).not.toHaveAttribute('stroke');

    const menuBtn = screen.getByRole('button', { name: 'Stack options' });
    expect(menuBtn.tagName).toBe('BUTTON');
    expect(menuBtn).toHaveAttribute('type', 'button');
    expect(menuBtn).toHaveClass('menu-btn');
    expect(menuBtn).toHaveAttribute('aria-haspopup', 'menu');
    expect(menuBtn).toHaveAttribute('aria-expanded', 'false');
    const menuSvg = menuBtn.querySelector('svg[aria-hidden="true"]');
    expect(menuSvg).toBeInTheDocument();
    expect(menuSvg).toHaveAttribute('width', '18');
    expect(menuSvg).toHaveAttribute('height', '18');

    rerender(<StackCard ref={ref} stack={{ ...SAMPLE_STACK, favorite: true }} />);
    expect(card).toHaveClass('game-card', 'stack-card', 'favorited');
    const activeFavBtn = screen.getByRole('button', { name: 'Remove from favorites' });
    expect(activeFavBtn).toHaveClass('fav-btn', 'active');
    expect(activeFavBtn).toHaveAttribute('aria-pressed', 'true');
  });

  it('enforces preventable event contract on fav-btn without stopping propagation, and invokes onOpenStack on click and keyboard', () => {
    const onOpenStack = vi.fn();
    const onToggleFavorite = vi.fn();
    const docClickSpy = vi.fn();
    document.addEventListener('click', docClickSpy);

    try {
      render(
        <StackCard
          stack={SAMPLE_STACK}
          onOpenStack={onOpenStack}
          onToggleFavorite={onToggleFavorite}
        />
      );
      const card = screen.getByRole('region');
      const favBtn = screen.getByRole('button', { name: 'Add to favorites' });

      const favEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
      favBtn.dispatchEvent(favEvent);
      expect(favEvent.defaultPrevented).toBe(true);
      expect(onToggleFavorite).toHaveBeenCalledWith(SAMPLE_STACK);
      expect(onOpenStack).not.toHaveBeenCalled();
      expect(docClickSpy).toHaveBeenCalledTimes(1);

      fireEvent.click(card);
      expect(onOpenStack).toHaveBeenCalledWith(SAMPLE_STACK);

      fireEvent.keyDown(card, { key: 'Enter' });
      expect(onOpenStack).toHaveBeenCalledTimes(2);

      fireEvent.keyDown(card, { key: ' ' });
      expect(onOpenStack).toHaveBeenCalledTimes(3);
    } finally {
      document.removeEventListener('click', docClickSpy);
    }
  });

  it('opens dropdown menu with .show, supports inline stack rename, and dismisses on outside pointerdown or Escape', () => {
    const onMenuAction = vi.fn();
    const onOpenStack = vi.fn();
    render(
      <StackCard stack={SAMPLE_STACK} onMenuAction={onMenuAction} onOpenStack={onOpenStack} />
    );

    const menuBtn = screen.getByRole('button', { name: 'Stack options' });
    fireEvent.click(menuBtn);

    const menu = screen.getByRole('menu', { name: 'Stack options' });
    expect(menu).toHaveClass('dropdown-menu', 'show');
    const items = menu.querySelectorAll('.dropdown-item');
    items.forEach((item) => {
      expect(item.tagName).toBe('BUTTON');
      expect(item).toHaveAttribute('type', 'button');
    });

    // Escape dismisses and restores focus
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(menuBtn);

    // Inline rename
    fireEvent.click(menuBtn);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
    const input = screen.getByRole('textbox', { name: 'Rename stack title' }) as HTMLInputElement;
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(GAME_1.name.length);

    fireEvent.change(input, { target: { value: '  Alpha Definitive  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onMenuAction).toHaveBeenCalledWith('rename', GAME_1, { newName: 'Alpha Definitive' });
    expect(onOpenStack).not.toHaveBeenCalled();

    // Outside pointerdown dismisses menu
    fireEvent.click(menuBtn);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('memoizes cleanly: does not re-render with identical stack and callback references', () => {
    const onOpenStack = vi.fn();
    const onToggleFavorite = vi.fn();
    const onMenuAction = vi.fn();
    let renderCount = 0;

    const TrackedWrapper = ({
      stack,
      tick,
    }: {
      stack: LibraryViewItem;
      tick: number;
    }) => {
      renderCount += 1;
      return (
        <div data-tick={tick}>
          <StackCard
            stack={stack}
            onOpenStack={onOpenStack}
            onToggleFavorite={onToggleFavorite}
            onMenuAction={onMenuAction}
          />
        </div>
      );
    };

    const { rerender } = render(<TrackedWrapper stack={SAMPLE_STACK} tick={1} />);
    expect(renderCount).toBe(1);
    const firstNode = screen.getByRole('region');

    // Re-render parent with identical StackCard props
    rerender(<TrackedWrapper stack={SAMPLE_STACK} tick={2} />);
    expect(renderCount).toBe(2);
    expect(screen.getByRole('region')).toBe(firstNode);

    // Re-render with updated stack reference
    const updatedStack: LibraryViewItem = { ...SAMPLE_STACK, stackSize: 3 };
    rerender(<TrackedWrapper stack={updatedStack} tick={3} />);
    expect(screen.getByText('3x')).toBeInTheDocument();
  });

  it('toggles dropdown menu on stack right-click and preserves native context menu on rename input', () => {
    render(<StackCard stack={SAMPLE_STACK} />);
    const card = screen.getByRole('region', { name: 'Game stack: Alpha Quest (2 instances)' });

    const openEvent = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      button: 2,
    });
    expect(fireEvent(card, openEvent)).toBe(false);
    expect(openEvent.defaultPrevented).toBe(true);
    expect(screen.getByRole('menu', { name: 'Stack options' })).toHaveClass('dropdown-menu', 'show');

    // Second right-click (pointerdown button=2 then contextmenu) toggles menu closed
    fireEvent(
      card,
      new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 2 })
    );
    const closeEvent = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      button: 2,
    });
    expect(fireEvent(card, closeEvent)).toBe(false);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    // Right-click on rename input preserves native context menu
    fireEvent.contextMenu(card);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
    const renameInput = screen.getByRole('textbox', { name: 'Rename stack title' });
    const inputCtxEvent = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      button: 2,
    });
    expect(fireEvent(renameInput, inputCtxEvent)).toBe(true);
    expect(inputCtxEvent.defaultPrevented).toBe(false);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
