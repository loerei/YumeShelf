import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { OverlayProvider, useOverlay, type OverlayContextValue } from './OverlayProvider';

describe('OverlayProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createHarness() {
    let latest!: OverlayContextValue;
    function Consumer() {
      latest = useOverlay();
      return (
        <div>
          <div data-testid="active-modal">{latest.activeModal ?? 'none'}</div>
          <div data-testid="stack-length">{latest.modalStack.length}</div>
          <button type="button" onClick={() => latest.openModal('settings')}>
            Open Settings
          </button>
          <button type="button" onClick={() => latest.openModal('about')}>
            Open About
          </button>
          <button
            type="button"
            onClick={() => latest.openModal('duplicate-stack', { groupKey: 'game:dup-1' })}
          >
            Open Stack 1
          </button>
          <button
            type="button"
            onClick={() => latest.openModal('duplicate-stack', { groupKey: 'game:dup-2' })}
          >
            Open Stack 2
          </button>
          <button type="button" onClick={() => latest.closeModal()}>
            Close Top
          </button>
          <button type="button" onClick={() => latest.closeModal('settings')}>
            Close Settings
          </button>
        </div>
      );
    }

    const result = render(
      <OverlayProvider>
        <Consumer />
      </OverlayProvider>
    );
    return { ...result, getOverlay: () => latest };
  }

  it('pushes and pops modals in LIFO order with derived selectors and targeted closeModal(type)', () => {
    const { getOverlay } = createHarness();

    expect(getOverlay().modalStack).toEqual([]);
    expect(getOverlay().activeModalState).toEqual({ type: null });
    expect(getOverlay().activeModal).toBeNull();
    expect(getOverlay().isModalOpen('settings')).toBe(false);

    // Push settings
    fireEvent.click(screen.getByText('Open Settings'));
    expect(getOverlay().modalStack.length).toBe(1);
    expect(getOverlay().isModalOpen('settings')).toBe(true);
    expect(getOverlay().activeModalState.type).toBe('settings');

    // Push about on top of settings
    fireEvent.click(screen.getByText('Open About'));
    expect(getOverlay().modalStack.length).toBe(2);
    expect(getOverlay().isModalOpen('settings')).toBe(true);
    expect(getOverlay().isModalOpen('about')).toBe(true);
    expect(getOverlay().activeModalState.type).toBe('about');

    // Pop top modal via closeModal()
    fireEvent.click(screen.getByText('Close Top'));
    expect(getOverlay().modalStack.length).toBe(1);
    expect(getOverlay().isModalOpen('about')).toBe(false);
    expect(getOverlay().isModalOpen('settings')).toBe(true);
    expect(getOverlay().activeModalState.type).toBe('settings');

    // Targeted removal via closeModal('settings')
    fireEvent.click(screen.getByText('Close Settings'));
    expect(getOverlay().modalStack.length).toBe(0);
    expect(getOverlay().isModalOpen('settings')).toBe(false);
    expect(getOverlay().activeModal).toBeNull();
  });

  it('enforces consecutive activation deduplication and in-place payload updates', () => {
    const { getOverlay } = createHarness();

    fireEvent.click(screen.getByText('Open Stack 1'));
    const firstStackRef = getOverlay().modalStack;
    expect(getOverlay().modalStack.length).toBe(1);
    expect(getOverlay().getModalPayload('duplicate-stack')).toEqual({ groupKey: 'game:dup-1' });

    // Identical consecutive activation -> no duplicate entry, referentially unchanged
    fireEvent.click(screen.getByText('Open Stack 1'));
    expect(getOverlay().modalStack.length).toBe(1);
    expect(getOverlay().modalStack).toBe(firstStackRef);

    // Same topmost type with different payload -> updates top entry in-place
    fireEvent.click(screen.getByText('Open Stack 2'));
    expect(getOverlay().modalStack.length).toBe(1);
    expect(getOverlay().getModalPayload('duplicate-stack')).toEqual({ groupKey: 'game:dup-2' });
  });

  it('pops topmost modal on window Escape key, honors event.defaultPrevented, and detaches listener on unmount', () => {
    const removeWinSpy = vi.spyOn(window, 'removeEventListener');
    const { getOverlay, unmount } = createHarness();

    fireEvent.click(screen.getByText('Open Settings'));
    fireEvent.click(screen.getByText('Open About'));
    expect(getOverlay().modalStack.length).toBe(2);

    // Prevented Escape event -> ignored
    const preventedEvent = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    preventedEvent.preventDefault();
    window.dispatchEvent(preventedEvent);
    expect(getOverlay().modalStack.length).toBe(2);

    // Normal Escape event -> pops topmost modal ('about')
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    });
    expect(getOverlay().modalStack.length).toBe(1);
    expect(getOverlay().activeModal).toBe('settings');

    unmount();
    expect(removeWinSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
  });
});
