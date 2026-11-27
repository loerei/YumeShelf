import React, { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import * as localeStringsModule from '../i18n/locale-strings';
import enLocale from '../../locales/builtins/en.json';
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
    vi.useRealTimers();
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

  it('keeps #shelf-tab-fav mounted and activeTabId="fav" stable when favoritesCount is 0 and hasVirtualFavorite is true, then bounces when false', () => {
    const onTabSelect = vi.fn();
    const sections = [makeSection('D:/Games/VN', 'VN', 1)];

    const { rerender } = render(
      <ShelfTabs
        sections={sections}
        activeTabId="fav"
        favoritesCount={0}
        hasVirtualFavorite={true}
        onTabSelect={onTabSelect}
      />
    );

    const favTab = document.getElementById('shelf-tab-fav') as HTMLButtonElement;
    expect(favTab).toBeTruthy();
    expect(favTab.getAttribute('aria-selected')).toBe('true');
    expect(favTab.tabIndex).toBe(0);
    expect(onTabSelect).not.toHaveBeenCalled();

    rerender(
      <ShelfTabs
        sections={sections}
        activeTabId="fav"
        favoritesCount={0}
        hasVirtualFavorite={false}
        onTabSelect={onTabSelect}
      />
    );

    expect(document.getElementById('shelf-tab-fav')).toBeNull();
    expect(onTabSelect).toHaveBeenCalledWith('all');
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
    let tablistObserver: MockResizeObserver | null = null;
    const disconnectSpy = vi.fn();
    const observeSpy = vi.fn();

    class MockResizeObserver {
      private cb: ResizeObserverCallback;
      constructor(cb: ResizeObserverCallback) {
        this.cb = cb;
      }
      observe = (target: Element) => {
        observeSpy(target);
        if (target.classList?.contains('shelf-tabs-list')) {
          resizeCallback = this.cb;
          tablistObserver = this;
        }
      };
      unobserve = vi.fn();
      disconnect = () => {
        if (this === tablistObserver) {
          disconnectSpy();
        }
      };
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

  function mockTabRects() {
    vi.useFakeTimers();
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element
    ) {
      if (this.classList?.contains('shelf-tab') && !this.classList.contains('is-drag-overlay')) {
        const allTabs = Array.from(
          document.querySelectorAll('.shelf-tab:not(.is-drag-overlay)')
        );
        const idx = allTabs.indexOf(this);
        const left = (idx >= 0 ? idx : 0) * 120;
        return {
          left,
          right: left + 120,
          top: 0,
          bottom: 32,
          width: 120,
          height: 32,
          x: left,
          y: 0,
          toJSON: () => ({}),
        } as DOMRect;
      }
      if (
        this.classList?.contains('is-drag-overlay') ||
        this.firstElementChild?.classList?.contains('is-drag-overlay')
      ) {
        const label = this.textContent;
        const allTabs = Array.from(
          document.querySelectorAll('.shelf-tab:not(.is-drag-overlay)')
        );
        const matchIdx = allTabs.findIndex((t) => t.textContent === label);
        const baseLeft = (matchIdx >= 0 ? matchIdx : 0) * 120;
        const transformStr = (this as HTMLElement).style?.transform || '';
        const match = transformStr.match(/translate3d\(([-0-9.]+)px/);
        const tx = match ? parseFloat(match[1]) : 0;
        const left = baseLeft + tx;
        return {
          left,
          right: left + 120,
          top: 0,
          bottom: 32,
          width: 120,
          height: 32,
          x: left,
          y: 0,
          toJSON: () => ({}),
        } as DOMRect;
      }
      return {
        left: 0,
        right: 800,
        top: 0,
        bottom: 40,
        width: 800,
        height: 40,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect;
    });
  }

  it('reorders folder tabs horizontally via KeyboardSensor, suppresses roving onTabSelect during drag, and resumes navigation after drop', async () => {
    mockTabRects();
    const onTabSelect = vi.fn();
    const onTabReorder = vi.fn(async () => {});
    const sections = [
      makeSection('D:/Games/Alpha', 'Alpha', 1),
      makeSection('D:/Games/Beta', 'Beta', 2),
      makeSection('D:/Games/Gamma', 'Gamma', 3),
    ];

    render(
      <ShelfTabs
        sections={sections}
        activeTabId="all"
        favoritesCount={0}
        onTabSelect={onTabSelect}
        onTabReorder={onTabReorder}
      />
    );

    const alphaTab = document.getElementById('shelf-tab-folder-0') as HTMLButtonElement;
    expect(alphaTab.getAttribute('role')).toBe('tab');
    expect(alphaTab.tabIndex).toBe(-1);
    alphaTab.focus();
    expect(document.activeElement).toBe(alphaTab);

    // Start keyboard drag with Space
    await act(async () => {
      fireEvent.keyDown(alphaTab, { key: ' ', code: 'Space' });
      vi.advanceTimersByTime(0);
    });

    // DragOverlay renders active tab preview and source item dims to 0.4
    expect(document.querySelector('.shelf-tab.is-drag-overlay')?.textContent).toContain('Alpha');
    expect(alphaTab.style.opacity).toBe('0.4');

    // ArrowRight while dragging must NOT trigger roving onTabSelect
    await act(async () => {
      fireEvent.keyDown(alphaTab, { key: 'ArrowRight', code: 'ArrowRight' });
    });
    expect(onTabSelect).not.toHaveBeenCalled();

    // Drop with Space
    await act(async () => {
      fireEvent.keyDown(alphaTab, { key: ' ', code: 'Space' });
    });

    expect(onTabReorder).toHaveBeenCalledTimes(1);
    expect(onTabReorder).toHaveBeenCalledWith(
      ['D:/Games/Alpha', 'D:/Games/Beta', 'D:/Games/Gamma'],
      ['D:/Games/Beta', 'D:/Games/Alpha', 'D:/Games/Gamma'],
      'D:/Games/Alpha'
    );

    // DragOverlay cleared and opacity restored
    expect(document.querySelector('.shelf-tab.is-drag-overlay')).toBeNull();
    expect(alphaTab.style.opacity).toBe('');

    // Post-drop ArrowRight resumes roving tab navigation and moves focus synchronously
    const folderTabsAfter = screen.getAllByRole('tab') as HTMLButtonElement[];
    const alphaIndexAfter = folderTabsAfter.indexOf(alphaTab);
    expect(alphaIndexAfter).toBe(2); // All, Beta, Alpha, Gamma

    fireEvent.keyDown(alphaTab, { key: 'ArrowRight', code: 'ArrowRight' });
    expect(onTabSelect).toHaveBeenCalledWith('D:/Games/Gamma');
    expect(document.activeElement).toBe(folderTabsAfter[3]);
  });

  it('protects pinned tabs from dragging, handles Escape cancel as no-op, and resumes roving navigation after cancel', async () => {
    mockTabRects();
    const onTabSelect = vi.fn();
    const onTabReorder = vi.fn(async () => {});
    const sections = [
      makeSection('D:/Games/Alpha', 'Alpha', 1),
      makeSection('D:/Games/Beta', 'Beta', 2),
    ];

    const { rerender } = render(
      <ShelfTabs
        sections={sections}
        activeTabId="all"
        favoritesCount={1}
        onTabSelect={onTabSelect}
        onTabReorder={onTabReorder}
      />
    );

    // Pinned tabs cannot be dragged
    const allTab = document.getElementById('shelf-tab-all') as HTMLButtonElement;
    allTab.focus();
    await act(async () => {
      fireEvent.keyDown(allTab, { key: ' ', code: 'Space' });
    });
    expect(document.querySelector('.shelf-tab.is-drag-overlay')).toBeNull();

    // Start drag on Alpha, move right, then cancel with Escape
    const alphaTab = document.getElementById('shelf-tab-folder-0') as HTMLButtonElement;
    alphaTab.focus();
    await act(async () => {
      fireEvent.keyDown(alphaTab, { key: ' ', code: 'Space' });
      vi.advanceTimersByTime(0);
    });
    expect(document.querySelector('.shelf-tab.is-drag-overlay')).toBeTruthy();

    await act(async () => {
      fireEvent.keyDown(alphaTab, { key: 'ArrowRight', code: 'ArrowRight' });
    });
    expect(onTabSelect).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.keyDown(alphaTab, { key: 'Escape', code: 'Escape' });
    });
    expect(onTabReorder).not.toHaveBeenCalled();
    expect(document.querySelector('.shelf-tab.is-drag-overlay')).toBeNull();
    expect(alphaTab.style.opacity).toBe('');

    // Post-cancel ArrowRight resumes roving navigation
    fireEvent.keyDown(alphaTab, { key: 'ArrowRight', code: 'ArrowRight' });
    expect(onTabSelect).toHaveBeenCalledWith('D:/Games/Beta');
    expect(document.activeElement).toBe(document.getElementById('shelf-tab-folder-1'));

    // External sections prop updates sync cleanly
    rerender(
      <ShelfTabs
        sections={[sections[1], sections[0]]}
        activeTabId="all"
        favoritesCount={1}
        onTabSelect={onTabSelect}
        onTabReorder={onTabReorder}
      />
    );
    const tabs = screen.getAllByRole('tab');
    expect(tabs[2].textContent).toContain('Beta');
    expect(tabs[3].textContent).toContain('Alpha');
  });

  it('rolls back local tab order, shows toast, and logs sanitized console.error when onTabReorder rejects', async () => {
    mockTabRects();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onShowToast = vi.fn();
    const onTabReorder = vi.fn(async () => {
      throw new Error('Failed writing C:\\Users\\Alice\\Games\\config.json');
    });
    const sections = [
      makeSection('C:\\Users\\Alice\\Games\\Alpha', 'Alpha', 1),
      makeSection('C:\\Users\\Alice\\Games\\Beta', 'Beta', 2),
    ];

    render(
      <ShelfTabs
        sections={sections}
        activeTabId="all"
        favoritesCount={0}
        onTabSelect={vi.fn()}
        onTabReorder={onTabReorder}
        onShowToast={onShowToast}
      />
    );

    const alphaTab = document.getElementById('shelf-tab-folder-0') as HTMLButtonElement;
    alphaTab.focus();
    await act(async () => {
      fireEvent.keyDown(alphaTab, { key: ' ', code: 'Space' });
      vi.advanceTimersByTime(0);
    });
    await act(async () => {
      fireEvent.keyDown(alphaTab, { key: 'ArrowRight', code: 'ArrowRight' });
    });
    await act(async () => {
      fireEvent.keyDown(alphaTab, { key: ' ', code: 'Space' });
    });

    // Rolled back to Alpha, Beta
    const tabs = screen.getAllByRole('tab');
    expect(tabs[1].textContent).toContain('Alpha');
    expect(tabs[2].textContent).toContain('Beta');

    expect(onShowToast).toHaveBeenCalledWith(enLocale.strings.toast_tab_reorder_failed);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const loggedPayload = JSON.stringify(errorSpy.mock.calls[0]);
    expect(loggedPayload).not.toContain('Alice');
    expect(loggedPayload).toContain('<USER_DIR>');
  });

  it('preserves newer drag order and suppresses stale rollback/toast when superseded by a concurrent drag', async () => {
    mockTabRects();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const onShowToast = vi.fn();

    let rejectFirst!: (err: Error) => void;
    let resolveSecond!: () => void;
    const onTabReorder = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((_resolve, reject) => {
            rejectFirst = reject;
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveSecond = resolve;
          })
      );

    const sections = [
      makeSection('D:/Games/Alpha', 'Alpha', 1),
      makeSection('D:/Games/Beta', 'Beta', 2),
      makeSection('D:/Games/Gamma', 'Gamma', 3),
    ];

    render(
      <ShelfTabs
        sections={sections}
        activeTabId="all"
        favoritesCount={0}
        onTabSelect={vi.fn()}
        onTabReorder={onTabReorder}
        onShowToast={onShowToast}
      />
    );

    // Drag #1: Alpha -> right (Beta, Alpha, Gamma)
    const alphaTab = document.getElementById('shelf-tab-folder-0') as HTMLButtonElement;
    alphaTab.focus();
    await act(async () => {
      fireEvent.keyDown(alphaTab, { key: ' ', code: 'Space' });
      vi.advanceTimersByTime(0);
    });
    await act(async () => {
      fireEvent.keyDown(alphaTab, { key: 'ArrowRight', code: 'ArrowRight' });
    });
    await act(async () => {
      fireEvent.keyDown(alphaTab, { key: ' ', code: 'Space' });
    });

    // Drag #2: Alpha -> right again (Beta, Gamma, Alpha)
    alphaTab.focus();
    await act(async () => {
      fireEvent.keyDown(alphaTab, { key: ' ', code: 'Space' });
      vi.advanceTimersByTime(0);
    });
    await act(async () => {
      fireEvent.keyDown(alphaTab, { key: 'ArrowRight', code: 'ArrowRight' });
    });
    await act(async () => {
      fireEvent.keyDown(alphaTab, { key: ' ', code: 'Space' });
    });

    expect(onTabReorder).toHaveBeenCalledTimes(2);

    // Resolve Drag #2 first, then reject Drag #1
    await act(async () => {
      resolveSecond();
    });
    await act(async () => {
      rejectFirst(new Error('Stale drag #1 failed'));
    });

    // Drag #2 order [Beta, Gamma, Alpha] must be preserved and toast suppressed
    const tabsAfter = screen.getAllByRole('tab');
    expect(tabsAfter[1].textContent).toContain('Beta');
    expect(tabsAfter[2].textContent).toContain('Gamma');
    expect(tabsAfter[3].textContent).toContain('Alpha');
    expect(onShowToast).not.toHaveBeenCalled();
  });
});
