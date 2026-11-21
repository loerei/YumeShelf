import React, { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MAX_DROPDOWN_RESULTS, SearchBar, type SearchBarGameItem } from './SearchBar';

function ControlledSearchHarness({
  initialQuery = '',
  games = [],
  debounceMs = 150,
  onSearch,
  onSelectGame = vi.fn(),
  placeholderList,
}: {
  initialQuery?: string;
  games?: readonly SearchBarGameItem[];
  debounceMs?: number;
  onSearch?: (q: string) => void;
  onSelectGame?: (gameKey: string) => void;
  placeholderList?: string[];
}) {
  const [query, setQuery] = useState(initialQuery);
  return (
    <SearchBar
      query={query}
      onQueryChange={setQuery}
      onSelectGame={onSelectGame}
      debounceMs={debounceMs}
      onSearch={onSearch}
      games={games}
      placeholderList={placeholderList}
    />
  );
}

describe('SearchBar', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('debounces query updates with fake timers and cancels pending timer on unmount', () => {
    vi.useFakeTimers();
    const onSearch = vi.fn();
    const games: SearchBarGameItem[] = [{ gameKey: 'g1', name: 'Clannad' }];

    const { unmount } = render(
      <ControlledSearchHarness games={games} debounceMs={150} onSearch={onSearch} />
    );

    const input = screen.getByRole('textbox', { name: 'Search library games' });
    fireEvent.change(input, { target: { value: 'clan' } });

    expect(onSearch).not.toHaveBeenCalled();
    expect(screen.queryByRole('list')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(149);
    });
    expect(onSearch).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith('clan');
    expect(screen.getByRole('list')).toBeTruthy();

    // Unmount before pending debounce fires
    fireEvent.change(input, { target: { value: 'clannad' } });
    unmount();
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(onSearch).toHaveBeenCalledTimes(1);
  });

  it('renders clear button inside .search-input-wrapper when query is non-empty, cancels debounce, and keeps focus', () => {
    vi.useFakeTimers();
    const onSearch = vi.fn();
    const games: SearchBarGameItem[] = [{ gameKey: 'g1', name: 'Clannad' }];

    const { container } = render(
      <ControlledSearchHarness games={games} debounceMs={150} onSearch={onSearch} />
    );

    expect(container.querySelector('.search-clear-btn')).toBeNull();

    const input = screen.getByRole('textbox', { name: 'Search library games' }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'cl' } });

    const wrapper = container.querySelector('.search-input-wrapper');
    const clearBtn = wrapper?.querySelector('button[type="button"].search-clear-btn') as HTMLButtonElement;
    expect(clearBtn).toBeTruthy();

    fireEvent.click(clearBtn);

    expect(input.value).toBe('');
    expect(document.activeElement).toBe(input);
    expect(screen.queryByRole('list')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(onSearch).not.toHaveBeenCalled();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('safely highlights matches without XSS, normalizes NFD/NFC Unicode, and handles trailing spaces and surrogate pairs', () => {
    vi.useFakeTimers();
    const xssTitle = '<script>alert("xss")</script> Game 🌟';
    // NFD decomposed kana: か + combining dakuten (\u304B\u3099)
    const nfdTitle = 'ゆめ\u304B\u3099たり';
    const games: SearchBarGameItem[] = [
      { gameKey: 'xss', name: xssTitle },
      { gameKey: 'unicode', name: nfdTitle },
    ];

    const { container } = render(<ControlledSearchHarness games={games} debounceMs={150} />);
    const input = screen.getByRole('textbox', { name: 'Search library games' });

    // Query with script tag and trailing whitespace
    fireEvent.change(input, { target: { value: '<script>  ' } });
    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(container.querySelector('script')).toBeNull();
    const marks = container.querySelectorAll('mark.search-match');
    expect(marks.length).toBe(1);
    expect(marks[0].textContent).toBe('<script>');
    expect((marks[0] as HTMLElement).style.background).toBe('transparent');

    // Query with NFC composed kana 'が' (\u304C) matching NFD game name
    fireEvent.change(input, { target: { value: 'が' } });
    act(() => {
      vi.advanceTimersByTime(150);
    });
    const unicodeMarks = container.querySelectorAll('mark.search-match');
    expect(unicodeMarks.length).toBe(1);
    expect(unicodeMarks[0].textContent).toBe('が');
  });

  it('caps rendered dropdown results to MAX_DROPDOWN_RESULTS = 50 and bounds ArrowDown/ArrowUp', () => {
    vi.useFakeTimers();
    const games: SearchBarGameItem[] = Array.from({ length: 200 }, (_, i) => ({
      gameKey: `game-${i}`,
      name: `Visual Novel ${i}`,
    }));

    render(<ControlledSearchHarness games={games} debounceMs={100} />);
    const input = screen.getByRole('textbox', { name: 'Search library games' });

    fireEvent.change(input, { target: { value: 'Visual' } });
    act(() => {
      vi.advanceTimersByTime(100);
    });

    const items = screen.getAllByRole('listitem');
    expect(items.length).toBe(MAX_DROPDOWN_RESULTS);
    expect(items.length).toBeLessThanOrEqual(50);

    // ArrowDown 60 times should clamp at index 49
    for (let i = 0; i < 60; i++) {
      fireEvent.keyDown(input, { key: 'ArrowDown' });
    }
    const updatedItems = screen.getAllByRole('listitem');
    expect(updatedItems[49].classList.contains('active')).toBe(true);

    // ArrowUp 60 times should clamp at index 0
    for (let i = 0; i < 60; i++) {
      fireEvent.keyDown(input, { key: 'ArrowUp' });
    }
    expect(screen.getAllByRole('listitem')[0].classList.contains('active')).toBe(true);
  });

  it('supports keyboard Enter, Escape, mouse click selection, outside click dismissal, and focus reopen', () => {
    vi.useFakeTimers();
    const onSelectGame = vi.fn();
    const games: SearchBarGameItem[] = [
      { gameKey: 'g1', name: 'Alpha' },
      { gameKey: 'g2', name: 'Alphabet' },
    ];

    const { container } = render(
      <div>
        <ControlledSearchHarness games={games} debounceMs={100} onSelectGame={onSelectGame} />
        <button type="button">Outside</button>
      </div>
    );

    const input = screen.getByRole('textbox', { name: 'Search library games' }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Alpha' } });
    act(() => {
      vi.advanceTimersByTime(100);
    });

    const dropdown = container.querySelector('.search-dropdown');
    expect(dropdown?.classList.contains('show')).toBe(true);

    // Outside click closes dropdown without stopping propagation
    const outsideBtn = screen.getByRole('button', { name: 'Outside' });
    fireEvent.pointerDown(outsideBtn);
    expect(container.querySelector('.search-dropdown')).toBeNull();

    // Focusing input re-opens dropdown
    fireEvent.focus(input);
    expect(container.querySelector('.search-dropdown.show')).toBeTruthy();

    // Escape closes dropdown and retains focus on input
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(container.querySelector('.search-dropdown')).toBeNull();
    expect(document.activeElement).toBe(input);

    // Re-focus, navigate ArrowDown twice -> index 1 ('Alphabet'), press Enter
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onSelectGame).toHaveBeenCalledWith('g2');
    expect(input.value).toBe('');
    expect(container.querySelector('.search-dropdown')).toBeNull();
    expect(document.activeElement).toBe(input);

    // Mouse click selection
    fireEvent.change(input, { target: { value: 'Alpha' } });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    const firstItem = screen.getAllByRole('listitem')[0];
    fireEvent.click(firstItem);

    expect(onSelectGame).toHaveBeenCalledWith('g1');
    expect(input.value).toBe('');
    expect(container.querySelector('.search-dropdown')).toBeNull();
    expect(document.activeElement).toBe(input);
  });

  it('renders accessible empty-search status when debounced query matches 0 games', () => {
    vi.useFakeTimers();
    const games: SearchBarGameItem[] = [{ gameKey: 'g1', name: 'Clannad' }];

    render(<ControlledSearchHarness games={games} debounceMs={100} />);
    const input = screen.getByRole('textbox', { name: 'Search library games' });

    fireEvent.change(input, { target: { value: 'NonExistentGame' } });
    act(() => {
      vi.advanceTimersByTime(100);
    });

    const status = screen.getByRole('status');
    expect(status.classList.contains('empty-search')).toBe(true);
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).toBe('No matching games found');
  });

  it('halts #search-placeholder rotation when prefers-reduced-motion: reduce is active', () => {
    vi.useFakeTimers();
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const { container } = render(
      <ControlledSearchHarness
        placeholderList={['Static Placeholder', 'Second Placeholder']}
      />
    );

    const placeholder = container.querySelector('#search-placeholder') as HTMLElement;
    expect(placeholder).toBeTruthy();
    expect(placeholder.classList.contains('search-placeholder')).toBe(true);
    expect(placeholder.textContent).toBe('Static Placeholder');

    act(() => {
      vi.advanceTimersByTime(10000);
    });

    expect(placeholder.textContent).toBe('Static Placeholder');
  });

  it('renders #search-placeholder bonk quote, fallback icon, data-tooltip, and .search-launch-icon-wrapper button', () => {
    vi.useFakeTimers();
    const onSelectGame = vi.fn();
    const onLocateGame = vi.fn();
    const games: SearchBarGameItem[] = [
      { gameKey: 'g1', name: 'Clannad', relativePathDisplay: 'VN/Clannad' },
    ];

    const { container } = render(
      <SearchBar
        query="clan"
        onQueryChange={vi.fn()}
        onSelectGame={onSelectGame}
        onLocateGame={onLocateGame}
        games={games}
        debounceMs={100}
      />
    );

    // Mascot bonk quote overrides placeholder when query is cleared
    act(() => {
      window.dispatchEvent(new CustomEvent('yumeshelf:mascot-bonk', { detail: { quote: 'OIIIIIIII!!!' } }));
    });
    const placeholder = container.querySelector('#search-placeholder') as HTMLElement;
    expect(placeholder.textContent).toBe('OIIIIIIII!!!');
    expect(placeholder.style.display).toBe('none');

    act(() => {
      vi.advanceTimersByTime(100);
    });

    const item = screen.getByRole('listitem');
    expect(item.getAttribute('data-tooltip')).toBe('Clannad');
    expect(item.getAttribute('data-tooltip-subtitle')).toBe('VN/Clannad');
    expect(item.querySelector('.search-item-icon')?.textContent).toBe('🎮');

    const locateBtn = item.querySelector('button.search-launch-icon-wrapper') as HTMLButtonElement;
    expect(locateBtn).toBeTruthy();
    expect(locateBtn.querySelector('.search-launch-icon')).toBeTruthy();

    fireEvent.click(locateBtn);
    expect(onLocateGame).toHaveBeenCalledWith('g1');
    expect(onSelectGame).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(new CustomEvent('yumeshelf:mascot-recover'));
    });
  });
});
