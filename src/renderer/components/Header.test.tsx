import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { LibraryStateProvider } from '../context/LibraryStateContext';
import { createUiRuntimeState } from '../state/ui-runtime-state';
import type { GameEntry } from '../types/game';
import { Header, HeaderView } from './Header';

describe('HeaderView (Controlled & Pure Presentational)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders sort trigger with #sort-active-label, .sort-caret, and native <button> .sort-item options', () => {
    const onSortChange = vi.fn();

    render(
      <div>
        <HeaderView currentSort="az" onSortChange={onSortChange} />
        <button type="button">Outside</button>
      </div>
    );

    const sortBtn = document.getElementById('sort-btn') as HTMLButtonElement;
    expect(sortBtn).toBeTruthy();
    expect(sortBtn.getAttribute('aria-label')).toBe('Sort library games');
    expect(sortBtn.getAttribute('title')).toBe('Sort library games');
    expect(sortBtn.getAttribute('aria-haspopup')).toBe('menu');
    expect(sortBtn.getAttribute('aria-expanded')).toBe('false');
    expect(document.getElementById('sort-active-label')?.textContent).toBe('Name A-Z');
    const caret = sortBtn.querySelector('.sort-caret');
    expect(caret).toBeTruthy();
    expect(caret?.tagName).toBe('SPAN');
    expect(caret?.textContent).toBe('▾');

    // Open sort menu
    fireEvent.click(sortBtn);
    expect(sortBtn.getAttribute('aria-expanded')).toBe('true');

    const menu = screen.getByRole('menu');
    expect(menu.classList.contains('sort-menu')).toBe(true);
    expect(menu.classList.contains('show')).toBe(true);

    const sortItems = screen.getAllByRole('menuitem');
    expect(sortItems.length).toBe(5);
    for (const item of sortItems) {
      expect(item.tagName).toBe('BUTTON');
      expect(item.getAttribute('type')).toBe('button');
      expect(item.classList.contains('sort-item')).toBe(true);
    }
    expect(screen.getByRole('menuitem', { name: 'By Folder' })).toBeTruthy();

    // Select 'Recently Played'
    const playedItem = screen.getByRole('menuitem', { name: 'Recently Played' });
    fireEvent.mouseDown(playedItem);
    fireEvent.click(playedItem);

    expect(onSortChange).toHaveBeenCalledWith('played');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(sortBtn);

    // Escape dismissal restores focus to sortBtn
    fireEvent.click(sortBtn);
    expect(screen.getByRole('menu')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(sortBtn);

    // Outside click closes menu
    fireEvent.click(sortBtn);
    expect(screen.getByRole('menu')).toBeTruthy();
    const outsideBtn = screen.getByRole('button', { name: 'Outside' });
    fireEvent.pointerDown(outsideBtn);
    expect(screen.queryByRole('menu')).toBeNull();

    // Blur outside sortContainerRef closes menu
    fireEvent.click(sortBtn);
    expect(screen.getByRole('menu')).toBeTruthy();
    fireEvent.blur(sortBtn, { relatedTarget: outsideBtn });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('triggers action callbacks and suppresses Refresh Library activation while isRefreshing is true', () => {
    const onRefreshLibrary = vi.fn();
    const onOpenSettings = vi.fn();

    const { rerender } = render(
      <HeaderView
        isRefreshing={false}
        onRefreshLibrary={onRefreshLibrary}
        onOpenSettings={onOpenSettings}
      />
    );

    const refreshBtn = screen.getByRole('button', { name: 'Refresh Library' });
    expect(refreshBtn.classList.contains('header-icon-btn')).toBe(true);
    expect(refreshBtn.classList.contains('refresh-library-btn')).toBe(true);
    expect(refreshBtn.querySelector('svg.icon-svg')).toBeTruthy();

    fireEvent.click(refreshBtn);
    expect(onRefreshLibrary).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);

    expect(screen.queryByRole('button', { name: /About/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Language/i })).toBeNull();

    // Re-render with isRefreshing={true}
    rerender(
      <HeaderView
        isRefreshing={true}
        onRefreshLibrary={onRefreshLibrary}
        onOpenSettings={onOpenSettings}
      />
    );

    expect(refreshBtn.classList.contains('is-refreshing')).toBe(true);
    expect(refreshBtn.getAttribute('aria-busy')).toBe('true');
    expect(refreshBtn.getAttribute('aria-disabled')).toBe('true');
    expect((refreshBtn as HTMLButtonElement).disabled).toBe(false);
    expect((refreshBtn as HTMLElement).style.pointerEvents).toBe('none');

    fireEvent.click(refreshBtn);
    fireEvent.keyDown(refreshBtn, { key: 'Enter' });
    fireEvent.keyDown(refreshBtn, { key: ' ' });
    expect(onRefreshLibrary).toHaveBeenCalledTimes(1);
  });

  it('supports uncontrolled search lifecycle and restores input focus after selecting a game', () => {
    vi.useFakeTimers();
    const onSelectGame = vi.fn();
    const games = [
      { gameKey: 'g1', name: 'Steins;Gate' },
      { gameKey: 'g2', name: 'Chaos;Child' },
    ];

    const { container } = render(<HeaderView games={games} onSelectGame={onSelectGame} />);
    const input = screen.getByRole('textbox', { name: 'Search library games' }) as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'Steins' } });
    expect(input.value).toBe('Steins');

    act(() => {
      vi.advanceTimersByTime(150);
    });

    const item = screen.getByRole('listitem');
    fireEvent.click(item);

    expect(onSelectGame).toHaveBeenCalledWith('g1');
    expect(input.value).toBe('');
    expect(container.querySelector('.search-dropdown')).toBeNull();
    expect(document.activeElement).toBe(input);
  });

  it('renders #quick-folder-container for 1 or more libraryPaths and opens path or menu', () => {
    const onOpenFolder = vi.fn();
    const { rerender } = render(<HeaderView libraryPaths={[]} onOpenFolder={onOpenFolder} />);
    expect(document.getElementById('quick-folder-container')).toBeNull();

    // Single path opens directly
    rerender(<HeaderView libraryPaths={['D:\\Games']} onOpenFolder={onOpenFolder} />);
    const singleBtn = document.getElementById('quick-folder-btn') as HTMLButtonElement;
    expect(singleBtn).toBeTruthy();
    fireEvent.click(singleBtn);
    expect(onOpenFolder).toHaveBeenCalledWith('D:\\Games');
    expect(document.getElementById('quick-folder-menu')).toBeNull();

    // Multiple paths opens #quick-folder-menu
    onOpenFolder.mockClear();
    rerender(
      <HeaderView libraryPaths={['D:\\Games', 'E:\\VN']} onOpenFolder={onOpenFolder} />
    );
    const multiBtn = document.getElementById('quick-folder-btn') as HTMLButtonElement;
    fireEvent.click(multiBtn);
    const folderMenu = document.getElementById('quick-folder-menu')!;
    expect(folderMenu).toBeTruthy();
    expect(folderMenu.classList.contains('sort-menu')).toBe(true);
    expect(folderMenu.classList.contains('quick-folder-menu')).toBe(true);
    expect(folderMenu.classList.contains('show')).toBe(true);

    const items = folderMenu.querySelectorAll('button.quick-folder-item');
    expect(items.length).toBe(2);
    expect(items[1].getAttribute('data-tooltip')).toBe('E:\\VN');
    fireEvent.click(items[1]);
    expect(onOpenFolder).toHaveBeenCalledWith('E:\\VN');
    expect(document.getElementById('quick-folder-menu')).toBeNull();
  });
});

describe('Header (Connected Container & Playtime Isolation)', () => {
  it('connects to LibraryStateProvider and causes 0 re-renders on store.updateGamePlaytime', () => {
    const store = createUiRuntimeState();
    const games: GameEntry[] = [
      {
        gameKey: 'g1',
        name: 'Tsukihime',
        exePath: 'C:/Games/Tsukihime/game.exe',
        playtime: 1000,
        lastPlayed: 0,
        favorite: false,
        categoryIds: [],
        runInBackground: false,
        autoTranslate: false,
        isRunning: true,
      },
    ];
    store.setAllGames(games);
    store.setCategoryTree([{ id: 'cat-1', name: 'Type-Moon' }]);

    let renderCount = 0;
    function RenderCountingHeader() {
      renderCount++;
      return <Header />;
    }

    render(
      <LibraryStateProvider store={store}>
        <RenderCountingHeader />
      </LibraryStateProvider>
    );

    const initialRenders = renderCount;
    expect(document.getElementById('sort-active-label')?.textContent).toBe('Newest');

    // Simulate periodic playtime ticks
    act(() => {
      store.updateGamePlaytime('g1', 5000);
      store.updateGamePlaytime('g1', 10000);
      store.updateGamePlaytime('g1', 15000);
    });

    expect(renderCount).toBe(initialRenders);

    // Verify connected sort dispatch
    fireEvent.click(document.getElementById('sort-btn')!);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Name A-Z' }));
    expect(store.getSnapshot().currentSort).toBe('az');
    expect(document.getElementById('sort-active-label')?.textContent).toBe('Name A-Z');

    // Verify connected category dispatch
    fireEvent.click(screen.getByRole('button', { name: 'Filter by category' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Type-Moon' }));
    expect(store.getSnapshot().activeCategoryId).toBe('cat-1');
  });
});

describe('Stylesheet Contract: src/styles/header-search.css', () => {
  it('enforces design tokens, restored z-index 1500, isolation, button resets, focus-visible, search clear padding, and reduced motion', () => {
    const cssPath = path.resolve(process.cwd(), 'src/styles/header-search.css');
    const css = fs.readFileSync(cssPath, 'utf-8').replace(/\r\n/g, '\n');

    expect(css).toContain('z-index: var(--zIndex-dropdown);');
    expect(css).toContain('z-index: 1500;');
    expect(css).toContain('isolation: isolate;');

    expect(css).toContain('.header-icon-btn[aria-disabled="true"]');
    expect(css).toContain('.category-filter-btn[aria-disabled="true"]');

    expect(css).toContain('.sort-item,\n.category-filter-item,\n.quick-folder-item');
    expect(css).toContain('width: 100%;');
    expect(css).toContain('background: transparent;');
    expect(css).toContain('border: none;');
    expect(css).toContain('font-family: inherit;');
    expect(css).toContain('text-align: left;');

    expect(css).toContain('.sort-item:focus-visible,\n.category-filter-item:focus-visible,\n.quick-folder-item:focus-visible');
    expect(css).toContain('outline: 2px solid var(--accent);');

    expect(css).toContain('box-sizing: border-box;');
    expect(css).toContain('padding: 8px 36px 8px 15px;');
    expect(css).toContain('.search-clear-btn');
    expect(css).toContain('position: absolute;');

    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\.refresh-library-btn\.is-refreshing\s+\.icon-svg\s*\{[\s\S]*?animation:\s*none;/);
  });
});
