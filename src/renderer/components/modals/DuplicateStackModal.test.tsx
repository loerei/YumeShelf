import { act, fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LibraryStateProvider } from '../../context/LibraryStateContext';
import { createUiRuntimeState } from '../../state/ui-runtime-state';
import type { GameEntry } from '../../types/game';
import { DuplicateStackModal } from './DuplicateStackModal';

function makeInstance(overrides: Partial<GameEntry> & { gameKey: string; name: string }): GameEntry {
  return {
    gameId: overrides.gameKey,
    exePath: `C:/Games/${overrides.gameKey}/game.exe`,
    folderPath: `C:/Games/${overrides.gameKey}`,
    favorite: false,
    playtime: 0,
    ...overrides,
  };
}

function makeStackParent(groupKey: string, name: string, instances: GameEntry[]): GameEntry {
  return {
    gameId: groupKey,
    gameKey: groupKey,
    name,
    exePath: instances[0]?.exePath ?? `C:/Games/${groupKey}/game.exe`,
    folderPath: instances[0]?.folderPath ?? `C:/Games/${groupKey}`,
    favorite: instances.some((i) => i.favorite),
    playtime: 0,
    instances,
    primaryInstance: instances[0],
  };
}

describe('DuplicateStackModal', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null when isOpen is false without subscribing to store updates, and returns null when stack and groupKey are unresolvable', () => {
    const store = createUiRuntimeState();
    const subscribeSpy = vi.spyOn(store, 'subscribe');
    const onClose = vi.fn();

    const { rerender } = render(
      <LibraryStateProvider store={store}>
        <DuplicateStackModal isOpen={false} groupKey="missing-group" onClose={onClose} />
      </LibraryStateProvider>
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(subscribeSpy).not.toHaveBeenCalled();

    rerender(
      <LibraryStateProvider store={store}>
        <DuplicateStackModal isOpen={true} groupKey="missing-group" onClose={onClose} />
      </LibraryStateProvider>
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onClose).toHaveBeenCalledWith(undefined);
  });

  it('resolves live stack from store, renders phrasing-only heading spans, attaches containerRef, and forwards callbacks', () => {
    const inst1 = makeInstance({ gameKey: 'inst-1', name: 'My Game (v1.0)' });
    const inst2 = makeInstance({ gameKey: 'inst-2', name: 'My Game (v2.0)' });
    const parent = makeStackParent('stack-a', 'My Game', [inst1, inst2]);

    const store = createUiRuntimeState();
    store.setAllGames([parent]);

    const containerRef = createRef<HTMLDivElement>();
    const onClose = vi.fn();
    const onLaunch = vi.fn();
    const onToggleFavorite = vi.fn();

    render(
      <LibraryStateProvider store={store}>
        <DuplicateStackModal
          isOpen={true}
          groupKey="stack-a"
          containerRef={containerRef}
          onClose={onClose}
          onLaunch={onLaunch}
          onToggleFavorite={onToggleFavorite}
        />
      </LibraryStateProvider>
    );

    const dialog = screen.getByRole('dialog');
    const labelledById = dialog.getAttribute('aria-labelledby');
    expect(labelledById).toBeTruthy();

    const modalTitle = document.getElementById(labelledById!)!;
    expect(modalTitle).not.toBeNull();
    expect(modalTitle.querySelector('div')).toBeNull();
    const spans = Array.from(modalTitle.children);
    expect(spans).toHaveLength(2);
    expect(spans.every((el) => el.tagName === 'SPAN')).toBe(true);
    expect(spans[0]).toHaveTextContent('My Game (v1.0)');
    expect(spans[1]).toHaveClass('duplicate-stack-count');
    expect(spans[1]).toHaveTextContent('2 versions installed');

    expect(containerRef.current).toHaveClass('duplicate-stack-dialog');
    expect(screen.getAllByText('My Game (v1.0)').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('My Game (v2.0)')).toBeInTheDocument();

    // Close button triggers onClose
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('transfers focus to sibling focusTargetKey when a 3-instance stack shrinks to 2 instances', () => {
    const inst1 = makeInstance({ gameKey: 'inst-1', name: 'Game v1' });
    const inst2 = makeInstance({ gameKey: 'inst-2', name: 'Game v2' });
    const inst3 = makeInstance({ gameKey: 'inst-3', name: 'Game v3' });
    const parent = makeStackParent('stack-3', 'Game', [inst1, inst2, inst3]);

    const store = createUiRuntimeState();
    store.setAllGames([parent]);

    const onFocusHandled = vi.fn();

    const { rerender } = render(
      <LibraryStateProvider store={store}>
        <DuplicateStackModal
          isOpen={true}
          groupKey="stack-3"
          focusTargetKey={null}
          onFocusHandled={onFocusHandled}
          onClose={vi.fn()}
        />
      </LibraryStateProvider>
    );

    // Delete inst-2 -> 2 instances remain
    act(() => {
      store.setAllGames([makeStackParent('stack-3', 'Game', [inst1, inst3])]);
    });

    rerender(
      <LibraryStateProvider store={store}>
        <DuplicateStackModal
          isOpen={true}
          groupKey="stack-3"
          focusTargetKey="inst-3"
          onFocusHandled={onFocusHandled}
          onClose={vi.fn()}
        />
      </LibraryStateProvider>
    );

    expect(onFocusHandled).toHaveBeenCalledTimes(1);
    expect(document.activeElement?.textContent).toContain('Game v3');
  });

  it('invokes onClose(survivingKey) when 2-instance stack dissolves to 1 instance and clears knownInstanceKeysRef across groupKey transitions', () => {
    const instA1 = makeInstance({ gameKey: 'a-1', name: 'Stack A v1' });
    const instA2 = makeInstance({ gameKey: 'a-2', name: 'Stack A v2' });
    const stackA = makeStackParent('stack-a', 'Stack A', [instA1, instA2]);

    const instB1 = makeInstance({ gameKey: 'b-1', name: 'Stack B v1' });
    const instB2 = makeInstance({ gameKey: 'b-2', name: 'Stack B v2' });
    const stackB = makeStackParent('stack-b', 'Stack B', [instB1, instB2]);

    const store = createUiRuntimeState();
    store.setAllGames([stackA, stackB]);

    const onClose = vi.fn();
    const fallbackRef = createRef<HTMLButtonElement>();

    const { rerender } = render(
      <LibraryStateProvider store={store}>
        <button type="button" ref={fallbackRef}>
          Fallback Target
        </button>
        <DuplicateStackModal
          isOpen={true}
          groupKey="stack-a"
          fallbackFocusRef={fallbackRef}
          onClose={onClose}
        />
      </LibraryStateProvider>
    );

    // Switch in-place from Stack A to Stack B -> clears Stack A known keys
    rerender(
      <LibraryStateProvider store={store}>
        <button type="button" ref={fallbackRef}>
          Fallback Target
        </button>
        <DuplicateStackModal
          isOpen={true}
          groupKey="stack-b"
          fallbackFocusRef={fallbackRef}
          onClose={onClose}
        />
      </LibraryStateProvider>
    );

    expect(screen.getAllByText('Stack B v1').length).toBeGreaterThanOrEqual(2);

    // Dissolve Stack B down to single surviving instB2 (Stack A still exists in store)
    act(() => {
      store.setAllGames([stackA, instB2]);
    });

    // Must resolve to 'b-2', NOT any key from Stack A
    expect(onClose).toHaveBeenCalledWith('b-2');
  });
});
