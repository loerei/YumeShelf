import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { GameEntry } from '../types/game';
import { GameCard } from './GameCard';

const BASE_GAME: GameEntry = {
  gameKey: 'main::rpg/alpha',
  gameId: 'alpha-id',
  name: 'Alpha Quest',
  folderName: 'Alpha',
  relativePath: 'RPG/Alpha',
  relativePathDisplay: '/Games/RPG',
  exePath: 'D:\\Games\\RPG\\Alpha\\Game.exe',
  favorite: false,
  playtime: 7500000,
};

describe('GameCard', () => {
  it('renders data-game-key, title, favorite classes, native buttons, inline SVGs, and forwards ref/rest attributes', () => {
    const ref = React.createRef<HTMLDivElement>();
    const { container, rerender } = render(
      <GameCard
        ref={ref}
        game={BASE_GAME}
        showPath
        data-testid="custom-card"
        aria-describedby="desc-1"
      />
    );

    const card = screen.getByRole('article');
    expect(ref.current).toBe(card);
    expect(card).toHaveAttribute('data-game-key', 'main::rpg/alpha');
    expect(card).toHaveAttribute('data-testid', 'custom-card');
    expect(card).toHaveAttribute('aria-describedby', 'desc-1');
    expect(card).toHaveAttribute('tabindex', '0');
    expect(card).not.toHaveAttribute('draggable');
    expect(card).toHaveClass('game-card');
    expect(card).not.toHaveClass('favorited');

    const favBtn = screen.getByRole('button', { name: 'Add to favorites' });
    expect(favBtn.tagName).toBe('BUTTON');
    expect(favBtn).toHaveAttribute('type', 'button');
    expect(favBtn).toHaveClass('fav-btn');
    expect(favBtn).not.toHaveClass('active');
    expect(favBtn).toHaveAttribute('aria-pressed', 'false');
    expect(favBtn).toHaveAttribute('title', 'Add to favorites');
    expect(favBtn.querySelector('svg[aria-hidden="true"]')).toBeInTheDocument();

    const menuBtn = screen.getByRole('button', { name: 'Game options' });
    expect(menuBtn.tagName).toBe('BUTTON');
    expect(menuBtn).toHaveAttribute('type', 'button');
    expect(menuBtn).toHaveClass('menu-btn');
    expect(menuBtn).toHaveAttribute('aria-haspopup', 'menu');
    expect(menuBtn).toHaveAttribute('aria-expanded', 'false');
    expect(menuBtn).toHaveAttribute('title', 'Game options');
    expect(menuBtn.querySelector('svg[aria-hidden="true"]')).toBeInTheDocument();

    expect(container.querySelector('.game-title')).toHaveTextContent('Alpha Quest');
    expect(container.querySelector('.game-status')).toHaveTextContent('Never played');
    expect(container.querySelector('.game-playtime')).toHaveTextContent('2h 5m');
    expect(container.querySelector('.game-path')).toHaveTextContent('/Games/RPG');

    rerender(<GameCard ref={ref} game={{ ...BASE_GAME, favorite: true }} />);
    expect(card).toHaveClass('game-card', 'favorited');
    const activeFavBtn = screen.getByRole('button', { name: 'Remove from favorites' });
    expect(activeFavBtn).toHaveClass('fav-btn', 'active');
    expect(activeFavBtn).toHaveAttribute('aria-pressed', 'true');
    expect(activeFavBtn).toHaveAttribute('title', 'Remove from favorites');
  });

  it('enforces preventable event contract on fav-btn and menu-btn without stopping propagation, and launches on card click/keyboard', () => {
    const onLaunch = vi.fn();
    const onToggleFavorite = vi.fn();
    const docClickSpy = vi.fn();
    document.addEventListener('click', docClickSpy);

    try {
      render(<GameCard game={BASE_GAME} onLaunch={onLaunch} onToggleFavorite={onToggleFavorite} />);
      const card = screen.getByRole('article');
      const favBtn = screen.getByRole('button', { name: 'Add to favorites' });

      const favEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
      favBtn.dispatchEvent(favEvent);
      expect(favEvent.defaultPrevented).toBe(true);
      expect(onToggleFavorite).toHaveBeenCalledWith(BASE_GAME);
      expect(onLaunch).not.toHaveBeenCalled();
      expect(docClickSpy).toHaveBeenCalledTimes(1);

      fireEvent.click(card);
      expect(onLaunch).toHaveBeenCalledTimes(1);

      fireEvent.keyDown(card, { key: 'Enter' });
      expect(onLaunch).toHaveBeenCalledTimes(2);

      fireEvent.keyDown(card, { key: ' ' });
      expect(onLaunch).toHaveBeenCalledTimes(3);
    } finally {
      document.removeEventListener('click', docClickSpy);
    }
  });

  it('opens dropdown menu with .show, renders native button items, supports conditional reset-save-folder, and dismisses on outside pointerdown or Escape', () => {
    const onMenuAction = vi.fn();
    const onOpenSaveEditor = vi.fn();
    const { container, rerender } = render(
      <GameCard
        game={BASE_GAME}
        onMenuAction={onMenuAction}
        onOpenSaveEditor={onOpenSaveEditor}
      />
    );

    const menuBtn = screen.getByRole('button', { name: 'Game options' });
    fireEvent.click(menuBtn);

    const menu = screen.getByRole('menu', { name: 'Game options' });
    expect(menu).toHaveClass('dropdown-menu', 'show');
    expect(menuBtn).toHaveAttribute('aria-expanded', 'true');
    expect(container.querySelector('.action-reset-save-folder')).not.toBeInTheDocument();

    const items = menu.querySelectorAll('.dropdown-item:not(.has-submenu)');
    expect(items.length).toBeGreaterThan(0);
    items.forEach((item) => {
      expect(item.tagName).toBe('BUTTON');
      expect(item).toHaveAttribute('type', 'button');
    });
    const submenus = menu.querySelectorAll('.dropdown-item.has-submenu');
    expect(submenus).toHaveLength(2);
    submenus.forEach((submenu) => {
      expect(submenu).toHaveAttribute('role', 'menuitem');
      expect(submenu).toHaveAttribute('aria-haspopup', 'menu');
    });

    // Escape dismisses and restores focus to menuBtn
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(menuBtn);

    // Re-open with saveFolderOverride present
    rerender(
      <GameCard
        game={{ ...BASE_GAME, saveFolderOverride: 'D:\\CustomSaves' }}
        onMenuAction={onMenuAction}
        onOpenSaveEditor={onOpenSaveEditor}
      />
    );
    fireEvent.click(menuBtn);
    const resetItem = container.querySelector('.action-reset-save-folder') as HTMLButtonElement;
    expect(resetItem).toBeInTheDocument();
    fireEvent.click(resetItem);
    expect(onMenuAction).toHaveBeenCalledWith(
      'reset-save-folder',
      expect.objectContaining({ gameKey: 'main::rpg/alpha' }),
      undefined
    );
    expect(document.activeElement).toBe(menuBtn);

    // Open Save Editor restores focus and invokes callback
    fireEvent.click(menuBtn);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open Save Editor' }));
    expect(onOpenSaveEditor).toHaveBeenCalledWith('main::rpg/alpha');
    expect(document.activeElement).toBe(menuBtn);

    // Outside pointerdown dismisses menu
    fireEvent.click(menuBtn);
    expect(screen.getByRole('menu', { name: 'Game options' })).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('handles inline rename lifecycle: focus+select, Enter commit without duplicate blur, Escape cancel, and external blur without focus hijacking', () => {
    const onMenuAction = vi.fn();
    const onLaunch = vi.fn();
    render(
      <div>
        <GameCard game={BASE_GAME} onMenuAction={onMenuAction} onLaunch={onLaunch} />
        <button type="button" data-testid="external-btn">
          External
        </button>
      </div>
    );

    const card = screen.getByRole('article');
    const menuBtn = screen.getByRole('button', { name: 'Game options' });

    // Start rename
    fireEvent.click(menuBtn);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));

    const input = screen.getByRole('textbox', { name: 'Rename game title' }) as HTMLInputElement;
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(BASE_GAME.name.length);

    // Clicking inside input does not launch card
    fireEvent.click(input);
    expect(onLaunch).not.toHaveBeenCalled();

    // Commit via Enter trims whitespace and dispatches once
    fireEvent.change(input, { target: { value: '  Alpha Reloaded  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.blur(input);
    expect(onMenuAction).toHaveBeenCalledTimes(1);
    expect(onMenuAction).toHaveBeenCalledWith('rename', BASE_GAME, { newName: 'Alpha Reloaded' });
    expect(document.activeElement).toBe(card);

    // Escape cancels without dispatching and restores focus to menuBtn
    onMenuAction.mockClear();
    fireEvent.click(menuBtn);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
    const input2 = screen.getByRole('textbox', { name: 'Rename game title' });
    fireEvent.change(input2, { target: { value: 'Cancelled Name' } });
    fireEvent.keyDown(input2, { key: 'Escape' });
    fireEvent.blur(input2);
    expect(onMenuAction).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(menuBtn);

    // Blur to external interactive target commits without stealing focus
    fireEvent.click(menuBtn);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
    const input3 = screen.getByRole('textbox', { name: 'Rename game title' });
    const externalBtn = screen.getByTestId('external-btn');
    fireEvent.change(input3, { target: { value: 'Beta Name' } });
    externalBtn.focus();
    fireEvent.blur(input3, { relatedTarget: externalBtn });
    expect(onMenuAction).toHaveBeenCalledWith('rename', BASE_GAME, { newName: 'Beta Name' });
    expect(document.activeElement).toBe(externalBtn);
  });

  it('satisfies stylesheet contracts in menus-tooltips.css and game-cards.css', () => {
    const rootDir = path.resolve(__dirname, '../../..');
    const menusCss = fs.readFileSync(path.join(rootDir, 'src/styles/menus-tooltips.css'), 'utf8');
    const cardsCss = fs.readFileSync(path.join(rootDir, 'src/styles/game-cards.css'), 'utf8');

    expect(menusCss).toContain('width: 100%');
    expect(menusCss).toContain('background: transparent');
    expect(menusCss).toContain('border: none');
    expect(menusCss).toContain('font-family: inherit');
    expect(menusCss).toContain('text-align: left');
    expect(menusCss).toMatch(/\.dropdown-item:focus-visible[\s\S]*?outline:\s*2px solid var\(--accent\)/);

    expect(cardsCss).toMatch(/\.game-card:focus-within\s+\.menu-btn[\s\S]*?opacity:\s*1/);
    expect(cardsCss).toMatch(/\.fav-btn,\s*\.menu-btn[\s\S]*?border:\s*none[\s\S]*?padding:\s*0[\s\S]*?font-family:\s*inherit/);
    expect(cardsCss).toMatch(/\.fav-btn:focus-visible,\s*\.menu-btn:focus-visible[\s\S]*?outline:\s*2px solid var\(--accent\)[\s\S]*?opacity:\s*1/);
  });

  it('resolves dataUrl icon payloads returned by window.electronAPI.getIcon, respects iconFit, fades in, and falls back to 🎮', async () => {
    const getIcon = vi.fn().mockResolvedValue({
      dataUrl: 'data:image/png;base64,QUJD',
      fit: 'cover',
      source: 'pe-icon',
    });
    const prevApi = window.electronAPI;
    window.electronAPI = { ...prevApi, getIcon } as typeof window.electronAPI;
    try {
      const { container, rerender } = render(
        <GameCard game={{ ...BASE_GAME, exePath: 'C:/Games/Test/Game.exe' }} />
      );
      await waitFor(() => {
        const img = container.querySelector('.game-icon img') as HTMLImageElement | null;
        expect(img).toBeTruthy();
        expect(img?.getAttribute('src')).toBe('data:image/png;base64,QUJD');
        expect(img?.getAttribute('data-icon-fit')).toBe('cover');
        expect(img?.style.objectFit).toBe('cover');
        expect(img).toHaveClass('fade-in-icon');
      });

      const img = container.querySelector('.game-icon img') as HTMLImageElement;
      fireEvent.load(img);
      expect(img).toHaveClass('fade-in-icon', 'loaded');

      fireEvent.error(img);
      expect(container.querySelector('.game-icon-fallback')).toHaveTextContent('🎮');

      rerender(<GameCard game={{ ...BASE_GAME, exePath: undefined }} />);
      expect(container.querySelector('.game-icon-fallback')).toHaveTextContent('🎮');
    } finally {
      window.electronAPI = prevApi;
    }
  });

  it('places .game-duplicate-chip before .game-title, gates Pre-Translate on isBetaExposed, and disables translation items when unsupported', async () => {
    const checkTranslationSupport = vi.fn().mockResolvedValue({ supported: false });
    const prevApi = window.electronAPI;
    window.electronAPI = { ...prevApi, checkTranslationSupport } as typeof window.electronAPI;
    try {
      const { container, rerender } = render(
        <GameCard
          game={{ ...BASE_GAME, duplicateCount: 2, autoTranslate: true }}
          showDuplicateChip
          isBetaExposed={false}
        />
      );

      const chip = container.querySelector('.game-duplicate-chip');
      const title = container.querySelector('.game-title');
      expect(chip).toHaveTextContent('2x');
      expect(chip && title && Boolean(chip.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);

      fireEvent.click(screen.getByRole('button', { name: 'Game options' }));
      expect(container.querySelector('.action-pre-translate')).not.toBeInTheDocument();

      rerender(
        <GameCard
          game={{ ...BASE_GAME, duplicateCount: 2, autoTranslate: true }}
          showDuplicateChip
          isBetaExposed={true}
        />
      );

      await waitFor(() => {
        expect(checkTranslationSupport).toHaveBeenCalledWith('main::rpg/alpha');
        const liveBtn = container.querySelector('.action-live-translate') as HTMLButtonElement;
        const preBtn = container.querySelector('.action-pre-translate') as HTMLButtonElement;
        expect(liveBtn).toBeDisabled();
        expect(liveBtn).toHaveTextContent('Not yet supported');
        expect(preBtn).toBeDisabled();
        expect(preBtn).toHaveTextContent('Not yet supported');
        // checkbox-on includes both polyline and outer box path
        expect(liveBtn.querySelector('svg path')).toBeInTheDocument();
      });
    } finally {
      window.electronAPI = prevApi;
    }
  });
});
