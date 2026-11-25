import React, { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import * as localeStringsModule from '../i18n/locale-strings';
import jaLocale from '../../locales/builtins/ja.json';
import type { FolderSection } from '../library/library-sections';
import type { LibraryViewItem } from '../library-stacks';
import { ShelfTabs } from './ShelfTabs';

function makeGameItem(id: string): LibraryViewItem {
  return {
    id,
    name: `Game ${id}`,
    path: `/games/${id}/game.exe`,
    folderPath: `/games/${id}`,
    favorite: false,
    playCount: 0,
    lastPlayed: 0,
    addedAt: 0,
  } as unknown as LibraryViewItem;
}

function makeSection(path: string, displayName: string, count = 1): FolderSection {
  return {
    path,
    displayName,
    games: Array.from({ length: count }, (_, i) => makeGameItem(`${displayName}-${i}`)),
    isEmpty: count === 0,
    isCollapsible: true,
  };
}

describe('ShelfTabs', () => {
  const originalResizeObserver = globalThis.ResizeObserver;
  const originalScrollBy = Element.prototype.scrollBy;
  const originalScrollIntoView = Element.prototype.scrollIntoView;

  afterEach(() => {
    globalThis.ResizeObserver = originalResizeObserver;
    Element.prototype.scrollBy = originalScrollBy;
    Element.prototype.scrollIntoView = originalScrollIntoView;
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('renders localized All Folders, conditional Favorites, and folder tabs with counts', () => {
    const onTabSelect = vi.fn();
    const sections = [
      makeSection('D:/Games/VisualNovels', 'VisualNovels', 3),
      makeSection('D:/Games/RPG', 'RPG', 0),
    ];

    const { rerender } = render(
      <ShelfTabs
        sections={sections}
        activeTabId="all"
        favoritesCount={2}
        onTabSelect={onTabSelect}
      />
    );

    const tablist = screen.getByRole('tablist', { name: 'Library folders' });
    expect(tablist.classList.contains('shelf-tabs-list')).toBe(true);

    const allTab = document.getElementById('shelf-tab-all') as HTMLButtonElement;
    expect(allTab).toBeTruthy();
    expect(allTab.textContent).toBe('All Folders');
    expect(allTab.getAttribute('aria-selected')).toBe('true');
    expect(allTab.tabIndex).toBe(0);

    const favTab = document.getElementById('shelf-tab-fav') as HTMLButtonElement;
    expect(favTab).toBeTruthy();
    expect(favTab.textContent).toContain('Favorites');
    expect(favTab.querySelector('svg')).toBeTruthy();
    expect(favTab.getAttribute('aria-selected')).toBe('false');
    expect(favTab.tabIndex).toBe(-1);

    const tabs = screen.getAllByRole('tab');
    expect(tabs.length).toBe(4);
    expect(tabs[2].textContent).toContain('VisualNovels');
    expect(tabs[2].querySelector('.shelf-tab-count')?.textContent).toBe('3');
    expect(tabs[3].textContent).toContain('RPG');
    expect(tabs[3].querySelector('.shelf-tab-count')?.textContent).toBe('0');

    fireEvent.click(tabs[2]);
    expect(onTabSelect).toHaveBeenCalledWith('D:/Games/VisualNovels');

    rerender(
      <ShelfTabs
        sections={sections}
        activeTabId="all"
        favoritesCount={0}
        onTabSelect={onTabSelect}
      />
    );
    expect(document.getElementById('shelf-tab-fav')).toBeNull();
    expect(screen.getAllByRole('tab').length).toBe(3);
  });

  it('uses localized strings from useLocaleStrings() when language is ja', () => {
    vi.spyOn(localeStringsModule, 'useLocaleStrings').mockReturnValue(
      jaLocale.strings as unknown as localeStringsModule.LocaleStrings
    );
    const sections = [makeSection('D:/Games/VN', 'VN', 1)];

    render(
      <ShelfTabs
        sections={sections}
        activeTabId="all"
        favoritesCount={1}
        onTabSelect={vi.fn()}
      />
    );

    expect(screen.getByRole('tablist', { name: 'ライブラリフォルダ' })).toBeTruthy();
    expect(document.getElementById('shelf-tab-all')?.textContent).toBe('すべてのフォルダ');
    expect(screen.getByRole('button', { name: 'フォルダタブを左にスクロール' })).toBeTruthy();
  });

  it('handles zero-favorite fallback by focusing #shelf-tab-all only when focus dropped to body', () => {
    const onTabSelect = vi.fn();
    const sections = [makeSection('D:/Games/VN', 'VN', 1)];

    const { rerender } = render(
      <div>
        <ShelfTabs
          sections={sections}
          activeTabId="fav"
          favoritesCount={1}
          onTabSelect={onTabSelect}
        />
        <button type="button">External Filter</button>
      </div>
    );

    const favTab = document.getElementById('shelf-tab-fav') as HTMLButtonElement;
    favTab.focus();
    expect(document.activeElement).toBe(favTab);

    // Transition favoritesCount to 0 -> #shelf-tab-fav unmounts, activeElement falls back to body
    rerender(
      <div>
        <ShelfTabs
          sections={sections}
          activeTabId="fav"
          favoritesCount={0}
          onTabSelect={onTabSelect}
        />
        <button type="button">External Filter</button>
      </div>
    );

    expect(onTabSelect).toHaveBeenCalledWith('all');
    expect(document.activeElement).toBe(document.getElementById('shelf-tab-all'));

    // Now test when focus is on another interactive control
    const onTabSelect2 = vi.fn();
    const { rerender: rerender2 } = render(
      <div>
        <ShelfTabs
          sections={sections}
          activeTabId="fav"
          favoritesCount={1}
          onTabSelect={onTabSelect2}
        />
        <button type="button" data-testid="ext-btn">
          External Control
        </button>
      </div>
    );

    const extBtn = screen.getByTestId('ext-btn');
    extBtn.focus();
    expect(document.activeElement).toBe(extBtn);

    rerender2(
      <div>
        <ShelfTabs
          sections={sections}
          activeTabId="fav"
          favoritesCount={0}
          onTabSelect={onTabSelect2}
        />
        <button type="button" data-testid="ext-btn">
          External Control
        </button>
      </div>
    );

    expect(onTabSelect2).toHaveBeenCalledWith('all');
    expect(document.activeElement).toBe(extBtn);
  });

  it('falls back to #shelf-tab-all when activeTabId is invalid', () => {
    const sections = [makeSection('D:/Games/VN', 'VN', 1)];

    render(
      <ShelfTabs
        sections={sections}
        activeTabId="D:/NonExistent/Folder"
        favoritesCount={0}
        onTabSelect={vi.fn()}
      />
    );

    const allTab = document.getElementById('shelf-tab-all') as HTMLButtonElement;
    expect(allTab.getAttribute('aria-selected')).toBe('true');
    expect(allTab.tabIndex).toBe(0);
  });

  it('matches macOS NFD-decomposed activeTabId against NFC section.path with targetPlatform="darwin"', () => {
    const nfcPath = '/Users/me/Games/\u304c'; // が (NFC)
    const nfdPath = '/Users/me/Games/\u304b\u3099'; // か + ゙ (NFD)
    const sections = [makeSection(nfcPath, 'が', 2)];

    render(
      <ShelfTabs
        sections={sections}
        activeTabId={nfdPath}
        favoritesCount={0}
        targetPlatform="darwin"
        onTabSelect={vi.fn()}
      />
    );

    const folderTab = screen.getAllByRole('tab')[1];
    expect(folderTab.getAttribute('aria-selected')).toBe('true');
    expect(folderTab.tabIndex).toBe(0);
    expect(document.getElementById('shelf-tab-all')?.getAttribute('aria-selected')).toBe('false');
  });

  it('supports ArrowLeft, ArrowRight, Home, and End keyboard navigation with synchronized roving tabIndex', () => {
    const sections = [
      makeSection('D:/Games/A', 'A', 1),
      makeSection('D:/Games/B', 'B', 2),
    ];

    function ControlledWrapper() {
      const [activeTabId, setActiveTabId] = useState('all');
      return (
        <ShelfTabs
          sections={sections}
          activeTabId={activeTabId}
          favoritesCount={1}
          onTabSelect={setActiveTabId}
        />
      );
    }

    render(<ControlledWrapper />);
    const getTabs = () => screen.getAllByRole('tab') as HTMLButtonElement[];

    getTabs()[0].focus();
    fireEvent.keyDown(getTabs()[0], { key: 'ArrowRight' });
    expect(getTabs()[1].getAttribute('aria-selected')).toBe('true');
    expect(getTabs()[1].tabIndex).toBe(0);
    expect(getTabs()[0].tabIndex).toBe(-1);
    expect(document.activeElement).toBe(getTabs()[1]);

    fireEvent.keyDown(getTabs()[1], { key: 'End' });
    expect(getTabs()[3].getAttribute('aria-selected')).toBe('true');
    expect(getTabs()[3].tabIndex).toBe(0);
    expect(document.activeElement).toBe(getTabs()[3]);

    fireEvent.keyDown(getTabs()[3], { key: 'ArrowRight' });
    expect(getTabs()[0].getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(getTabs()[0]);

    fireEvent.keyDown(getTabs()[0], { key: 'ArrowLeft' });
    expect(getTabs()[3].getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(getTabs()[3]);

    fireEvent.keyDown(getTabs()[3], { key: 'Home' });
    expect(getTabs()[0].getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(getTabs()[0]);
  });

  it('manages horizontal overflow, ResizeObserver, post-commit sections updates, scroll events, and chevron buttons', () => {
    let resizeCallback: ResizeObserverCallback | null = null;
    const disconnectSpy = vi.fn();
    const observeSpy = vi.fn();

    class MockResizeObserver {
      constructor(cb: ResizeObserverCallback) {
        resizeCallback = cb;
      }
      observe = observeSpy;
      unobserve = vi.fn();
      disconnect = disconnectSpy;
    }
    globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

    const scrollBySpy = vi.fn();
    Element.prototype.scrollBy = scrollBySpy;

    const sections = [makeSection('D:/Games/A', 'A', 1)];
    const { rerender, unmount } = render(
      <ShelfTabs
        sections={sections}
        activeTabId="all"
        favoritesCount={0}
        onTabSelect={vi.fn()}
      />
    );

    const tablist = screen.getByRole('tablist') as HTMLDivElement;
    const leftBtn = screen.getByRole('button', { name: 'Scroll folder tabs left' });
    const rightBtn = screen.getByRole('button', { name: 'Scroll folder tabs right' });

    let mockScrollWidth = 300;
    let mockClientWidth = 300;
    let mockScrollLeft = 0;

    Object.defineProperty(tablist, 'scrollWidth', { configurable: true, get: () => mockScrollWidth });
    Object.defineProperty(tablist, 'clientWidth', { configurable: true, get: () => mockClientWidth });
    Object.defineProperty(tablist, 'scrollLeft', { configurable: true, get: () => mockScrollLeft });

    // Initially no overflow -> both chevrons disabled
    expect(leftBtn.getAttribute('aria-disabled')).toBe('true');
    expect(rightBtn.getAttribute('aria-disabled')).toBe('true');

    // Clicking disabled chevron is a no-op
    fireEvent.click(rightBtn);
    expect(scrollBySpy).not.toHaveBeenCalled();

    // Simulate overflow via ResizeObserver
    mockScrollWidth = 600;
    mockClientWidth = 200;
    mockScrollLeft = 0;
    act(() => {
      resizeCallback?.([], {} as ResizeObserver);
    });

    expect(leftBtn.getAttribute('aria-disabled')).toBe('true');
    expect(rightBtn.getAttribute('aria-disabled')).toBe('false');

    // Clicking enabled right chevron invokes scrollBy
    fireEvent.click(rightBtn);
    expect(scrollBySpy).toHaveBeenCalledWith({ left: 120, behavior: 'smooth' });

    // Simulate scroll event to middle without re-invoking ResizeObserver
    mockScrollLeft = 100;
    fireEvent.scroll(tablist);
    expect(leftBtn.getAttribute('aria-disabled')).toBe('false');
    expect(rightBtn.getAttribute('aria-disabled')).toBe('false');

    // Simulate scroll to right boundary
    mockScrollLeft = 400;
    fireEvent.scroll(tablist);
    expect(leftBtn.getAttribute('aria-disabled')).toBe('false');
    expect(rightBtn.getAttribute('aria-disabled')).toBe('true');

    // Clicking enabled left chevron invokes scrollBy
    fireEvent.click(leftBtn);
    expect(scrollBySpy).toHaveBeenCalledWith({ left: -120, behavior: 'smooth' });

    // Updating sections so scrollWidth grows updates aria-disabled without ResizeObserver or scroll event
    mockScrollWidth = 800;
    rerender(
      <ShelfTabs
        sections={[...sections, makeSection('D:/Games/B', 'B', 2)]}
        activeTabId="all"
        favoritesCount={0}
        onTabSelect={vi.fn()}
      />
    );
    expect(rightBtn.getAttribute('aria-disabled')).toBe('false');

    // Unmount disconnects ResizeObserver
    unmount();
    expect(disconnectSpy).toHaveBeenCalledTimes(1);
  });

  it('calls scrollIntoView with smooth nearest alignment when active tab changes', () => {
    const scrollIntoViewSpy = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoViewSpy;

    const sections = [makeSection('D:/Games/A', 'A', 1)];
    const { rerender } = render(
      <ShelfTabs
        sections={sections}
        activeTabId="all"
        favoritesCount={0}
        onTabSelect={vi.fn()}
      />
    );

    scrollIntoViewSpy.mockClear();

    rerender(
      <ShelfTabs
        sections={sections}
        activeTabId="D:/Games/A"
        favoritesCount={0}
        onTabSelect={vi.fn()}
      />
    );

    expect(scrollIntoViewSpy).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'nearest',
    });
  });
});
