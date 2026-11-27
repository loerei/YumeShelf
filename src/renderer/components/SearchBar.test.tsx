import React, { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MAX_DROPDOWN_RESULTS, SearchBar, type SearchBarGameItem } from './SearchBar';
import {
  MascotProvider,
  useMascot,
  type MascotContextValue,
} from '../providers/MascotProvider';

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

  it('supports keyboard Enter, Escape, single-click selection feedback, double-click launch without closing, and outside click dismissal', () => {
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

    // Re-focus, navigate ArrowDown twice -> index 1 ('Alphabet'), press Enter (launches without closing dropdown)
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onSelectGame).toHaveBeenCalledTimes(1);
    expect(onSelectGame).toHaveBeenCalledWith('g2');
    expect(input.value).toBe('Alpha');
    expect(container.querySelector('.search-dropdown.show')).toBeTruthy();
    expect(document.activeElement).toBe(input);

    // Single click selects row and triggers tactile click animation without launching or closing
    const firstItem = screen.getAllByRole('listitem')[0];
    fireEvent.click(firstItem);
    expect(onSelectGame).toHaveBeenCalledTimes(1);
    expect(firstItem.classList.contains('active')).toBe(true);
    expect(firstItem.classList.contains('is-clicked')).toBe(true);
    const firstSeq = firstItem.getAttribute('data-click-seq');
    expect(firstSeq).toBeTruthy();
    expect(container.querySelector('.search-dropdown.show')).toBeTruthy();

    // Second rapid click replays click feedback (new seq) and double-click launches while keeping dropdown open
    fireEvent.click(firstItem);
    expect(firstItem.getAttribute('data-click-seq')).not.toBe(firstSeq);
    fireEvent.doubleClick(firstItem);

    expect(onSelectGame).toHaveBeenCalledTimes(2);
    expect(onSelectGame).toHaveBeenLastCalledWith('g1');
    expect(input.value).toBe('Alpha');
    expect(container.querySelector('.search-dropdown.show')).toBeTruthy();

    // Click pulse clears after timeout
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(firstItem.classList.contains('is-clicked')).toBe(false);

    // Clearing search closes dropdown
    const clearBtn = screen.getByRole('button', { name: 'Clear search input' });
    fireEvent.click(clearBtn);
    expect(input.value).toBe('');
    expect(container.querySelector('.search-dropdown')).toBeNull();
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
    expect(status.textContent).toBe('Nobody here but us chickens!');
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

    let mascotCtx!: MascotContextValue;
    const MascotProbe = () => {
      mascotCtx = useMascot();
      return null;
    };

    const { container } = render(
      <MascotProvider>
        <MascotProbe />
        <SearchBar
          query="clan"
          onQueryChange={vi.fn()}
          onSelectGame={onSelectGame}
          onLocateGame={onLocateGame}
          games={games}
          debounceMs={100}
        />
      </MascotProvider>
    );

    // Mascot bonk quote overrides placeholder when query is cleared
    act(() => {
      mascotCtx.bonk();
    });
    const placeholder = container.querySelector('#search-placeholder') as HTMLElement;
    expect(placeholder.textContent).toBeTruthy();
    expect(placeholder.textContent).toBe(mascotCtx.activeBonkQuote);
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
      vi.advanceTimersByTime(4000);
    });
    expect(mascotCtx.activeBonkQuote).toBeNull();
    expect(placeholder.textContent).not.toBe('');
  });

  it('matches games by folderName or relativePath, renders GameIcon, and attaches tooltip metadata', () => {
    vi.useFakeTimers();
    const games: SearchBarGameItem[] = [
      {
        gameKey: 'jp-1',
        name: 'すやすやエルフシミュレーション',
        folderName: 'suyasuya_elf',
        relativePath: 'RPG/suyasuya_elf',
        relativePathDisplay: 'RPG/suyasuya_elf',
        iconUrl: 'yume-icon://jp-1',
        engine: 'RPG Maker MV',
        sizeBytes: 1024 * 1024,
      },
    ];

    render(<ControlledSearchHarness games={games} debounceMs={100} />);
    const input = screen.getByRole('textbox', { name: 'Search library games' });

    fireEvent.change(input, { target: { value: 'elf' } });
    act(() => {
      vi.advanceTimersByTime(100);
    });

    const item = screen.getByRole('listitem');
    expect(item.getAttribute('data-tooltip')).toBe('すやすやエルフシミュレーション');
    expect(item.getAttribute('data-tooltip-meta')).toBe('RPG Maker MV • 1.00 MB');
    expect(item.getAttribute('data-tooltip-subtitle')).toBe('RPG/suyasuya_elf');
    const img = item.querySelector('.search-item-icon img') as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.getAttribute('src')).toBe('yume-icon://jp-1');
  });

  it('uses localized placeholders and no_results from language pack state and updates on language change', async () => {
    vi.useFakeTimers();
    window.localStorage.setItem('yumeshelf_lang', 'ja');
    (window as unknown as { electronAPI?: unknown }).electronAPI = {
      getLanguageState: vi.fn().mockResolvedValue({
        locales: {
          en: {
            no_results: 'Nobody here but us chickens!',
            placeholders: ['What are you looking for, Dummy?'],
          },
          ja: {
            no_results: 'なーにも見つからないわよ！',
            placeholders: ['早く入力しなさいよ！'],
          },
        },
      }),
    };

    const { container } = render(
      <ControlledSearchHarness games={[{ gameKey: 'g1', name: 'Clannad' }]} debounceMs={100} />
    );

    await act(async () => {
      await Promise.resolve();
    });

    const placeholder = container.querySelector('#search-placeholder') as HTMLElement;
    expect(placeholder.textContent).toBe('早く入力しなさいよ！');

    const input = screen.getByRole('textbox', { name: 'Search library games' });
    fireEvent.change(input, { target: { value: 'NoSuchGame' } });
    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(screen.getByRole('status').textContent).toBe('なーにも見つからないわよ！');

    await act(async () => {
      window.localStorage.setItem('yumeshelf_lang', 'en');
      window.dispatchEvent(new CustomEvent('yumeshelf:language-changed', { detail: { code: 'en' } }));
      await Promise.resolve();
    });

    expect(screen.getByRole('status').textContent).toBe('Nobody here but us chickens!');
    window.localStorage.removeItem('yumeshelf_lang');
    delete (window as unknown as { electronAPI?: unknown }).electronAPI;
  });

  it('focuses and selects #search-input on Ctrl+F / Cmd+F unless inside a dialog', () => {
    render(
      <ControlledSearchHarness games={[{ gameKey: 'g1', name: 'Clannad' }]} initialQuery="Clan" />
    );

    const input = screen.getByRole('textbox', {
      name: 'Search library games',
    }) as HTMLInputElement;

    (document.body as HTMLElement).focus();
    expect(document.activeElement).not.toBe(input);

    fireEvent.keyDown(document.body, { key: 'f', ctrlKey: true });
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(4);

    input.blur();
    (document.body as HTMLElement).focus();
    fireEvent.keyDown(document.body, { key: 'f', metaKey: true });
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(4);

    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    const dialogInput = document.createElement('input');
    dialog.appendChild(dialogInput);
    document.body.appendChild(dialog);
    try {
      dialogInput.focus();
      expect(document.activeElement).toBe(dialogInput);
      fireEvent.keyDown(dialogInput, { key: 'f', ctrlKey: true });
      expect(document.activeElement).toBe(dialogInput);
    } finally {
      dialog.remove();
    }
  });

  it('keeps dropdown mounted without flickering during transient IME 1 -> 0 -> 1 query flashes and closes only after genuine empty settle', () => {
    vi.useFakeTimers();
    const onSelectGame = vi.fn();
    const games: SearchBarGameItem[] = [{ gameKey: 'g1', name: 'Fallen Priestess' }];

    const { container } = render(
      <ControlledSearchHarness games={games} debounceMs={150} onSelectGame={onSelectGame} />
    );

    const input = screen.getByRole('textbox', { name: 'Search library games' }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'f' } });
    act(() => {
      vi.advanceTimersByTime(150);
    });
    const dropdownBefore = container.querySelector('.search-dropdown.show');
    expect(dropdownBefore).toBeTruthy();

    // Variant 1: active compositionStart -> empty -> restored -> Enter/Escape ignored while composing -> compositionEnd
    fireEvent.compositionStart(input);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelectGame).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '' } });
    expect(container.querySelector('.search-dropdown.show')).toBe(dropdownBefore);
    fireEvent.change(input, { target: { value: 'f' } });
    fireEvent.compositionEnd(input);
    expect(container.querySelector('.search-dropdown.show')).toBe(dropdownBefore);

    // Variant 2: Windows TSF post-composition 0 -> 1 flash within 11ms keeps exact same dropdown DOM node
    fireEvent.change(input, { target: { value: '' } });
    act(() => {
      vi.advanceTimersByTime(11);
    });
    expect(container.querySelector('.search-dropdown.show')).toBe(dropdownBefore);
    fireEvent.change(input, { target: { value: 'f' } });
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(container.querySelector('.search-dropdown.show')).toBe(dropdownBefore);

    // Clicking and double-clicking immediately succeeds without lost first click
    const item = screen.getByRole('listitem');
    fireEvent.click(item);
    expect(item.classList.contains('is-clicked')).toBe(true);
    fireEvent.doubleClick(item);
    expect(onSelectGame).toHaveBeenCalledWith('g1');

    // Genuine empty delete settles and closes dropdown after grace window
    fireEvent.change(input, { target: { value: '' } });
    act(() => {
      vi.advanceTimersByTime(60);
    });
    expect(container.querySelector('.search-dropdown')).toBeNull();

    // Variant 3: composition ends while input remains empty -> grace timer closes stale dropdown
    fireEvent.change(input, { target: { value: 'f' } });
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(container.querySelector('.search-dropdown.show')).toBeTruthy();
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: '' } });
    expect(container.querySelector('.search-dropdown.show')).toBeTruthy();
    fireEvent.compositionEnd(input);
    act(() => {
      vi.advanceTimersByTime(60);
    });
    expect(container.querySelector('.search-dropdown')).toBeNull();

    // Held Enter repeat events do not trigger duplicate launches
    fireEvent.change(input, { target: { value: 'f' } });
    act(() => {
      vi.advanceTimersByTime(150);
    });
    const prevCalls = onSelectGame.mock.calls.length;
    fireEvent.keyDown(input, { key: 'Enter', repeat: false });
    fireEvent.keyDown(input, { key: 'Enter', repeat: true });
    expect(onSelectGame).toHaveBeenCalledTimes(prevCalls + 1);
  });
});
