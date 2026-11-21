import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { TooltipProvider, Tooltip } from './TooltipProvider';

describe('TooltipProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('gracefully degrades <Tooltip> outside <TooltipProvider> by rendering children directly', () => {
    render(
      <Tooltip content="Standalone tooltip">
        <button type="button">Standalone Button</button>
      </Tooltip>
    );

    expect(screen.getByRole('button', { name: 'Standalone Button' })).toBeTruthy();
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('handles focusin with Element narrowing, migrates native title to data-tooltip, shows .app-tooltip.show after 300ms, honors internal focusout, and hides on external focusout or Escape', async () => {
    render(
      <TooltipProvider>
        <div data-testid="trigger-wrapper" title="Native Title Tooltip" tabIndex={0}>
          <button type="button">Inner Button</button>
        </div>
        <button type="button">Outside Button</button>
      </TooltipProvider>
    );

    const trigger = screen.getByTestId('trigger-wrapper');
    const innerBtn = screen.getByRole('button', { name: 'Inner Button' });
    const outsideBtn = screen.getByRole('button', { name: 'Outside Button' });

    // Non-Element target should not throw
    fireEvent(document, new FocusEvent('focusin', { bubbles: true }));

    // Focus trigger -> migrates title to data-tooltip
    fireEvent.focusIn(trigger);
    expect(trigger.getAttribute('title')).toBeNull();
    expect(trigger.getAttribute('data-tooltip')).toBe('Native Title Tooltip');

    // Before 300ms delay -> not shown yet
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(screen.queryByRole('tooltip')).toBeNull();

    // After 300ms delay -> .app-tooltip mounts, then .show is added on next animation frame
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    const tooltipBeforeRaf = screen.getByRole('tooltip');
    expect(tooltipBeforeRaf.classList.contains('app-tooltip')).toBe(true);
    expect(tooltipBeforeRaf.classList.contains('show')).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip.classList.contains('app-tooltip')).toBe(true);
    expect(tooltip.classList.contains('show')).toBe(true);
    expect(tooltip.textContent).toContain('Native Title Tooltip');

    // Internal focusout (relatedTarget inside trigger) -> stays visible
    fireEvent.focusOut(trigger, { relatedTarget: innerBtn });
    expect(screen.getByRole('tooltip')).toBeTruthy();

    // External focusout -> hides immediately
    fireEvent.focusOut(trigger, { relatedTarget: outsideBtn });
    expect(screen.queryByRole('tooltip')).toBeNull();

    // Re-show and dismiss via Escape
    fireEvent.focusIn(trigger);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(320);
    });
    expect(screen.getByRole('tooltip')).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('suppresses tooltip activation if trigger disconnects during the 300ms delay', async () => {
    const { rerender } = render(
      <TooltipProvider>
        <button type="button" data-tooltip="Ephemeral Tooltip">
          Ephemeral
        </button>
      </TooltipProvider>
    );

    const btn = screen.getByRole('button', { name: 'Ephemeral' });
    fireEvent.focusIn(btn);

    // Unmount trigger before 300ms elapses
    rerender(
      <TooltipProvider>
        <div>Gone</div>
      </TooltipProvider>
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('suppresses tooltip activation on focusin when .dropdown-menu.show is active', async () => {
    render(
      <TooltipProvider>
        <div className="dropdown-menu show" />
        <button type="button" data-tooltip="Suppressed Tooltip">
          Action
        </button>
      </TooltipProvider>
    );

    fireEvent.focusIn(screen.getByRole('button', { name: 'Action' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('removes all delegated listeners and clears pending timers on unmount', async () => {
    const removeDocSpy = vi.spyOn(document, 'removeEventListener');
    const removeWinSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = render(
      <TooltipProvider>
        <button type="button" data-tooltip="Cleanup Tooltip">
          Hover Me
        </button>
      </TooltipProvider>
    );

    fireEvent.mouseOver(screen.getByRole('button', { name: 'Hover Me' }));
    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(screen.queryByRole('tooltip')).toBeNull();

    const removedDocEvents = removeDocSpy.mock.calls.map(([event]) => event);
    expect(removedDocEvents).toEqual(
      expect.arrayContaining([
        'mouseover',
        'mousemove',
        'mouseout',
        'pointerdown',
        'scroll',
        'focusin',
        'focusout',
        'keydown',
      ])
    );
    const removedWinEvents = removeWinSpy.mock.calls.map(([event]) => event);
    expect(removedWinEvents).toEqual(expect.arrayContaining(['blur', 'resize']));
  });

  it('renders structured .app-tooltip-engine, .app-tooltip-dot, and .app-tooltip-size inside .app-tooltip-meta-line and positions with live getBoundingClientRect() + offset 16', async () => {
    const origRect = HTMLElement.prototype.getBoundingClientRect;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.classList?.contains('app-tooltip')) {
        return {
          width: 180,
          height: 60,
          top: 0,
          left: 0,
          right: 180,
          bottom: 60,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        } as DOMRect;
      }
      return origRect.call(this);
    });

    render(
      <TooltipProvider>
        <div
          data-testid="game-card-trigger"
          data-tooltip="Alpha Quest"
          data-tooltip-meta="RPG Maker MV • 1.25 GB"
          data-tooltip-subtitle="/Games/Alpha"
        >
          Alpha
        </div>
      </TooltipProvider>
    );

    const trigger = screen.getByTestId('game-card-trigger');
    fireEvent.mouseOver(trigger, { clientX: 100, clientY: 120 });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(320);
    });

    const tooltip = screen.getByRole('tooltip');
    expect(tooltip.querySelector('.app-tooltip-engine')).toHaveTextContent('RPG Maker MV');
    expect(tooltip.querySelector('.app-tooltip-dot')).toHaveTextContent('•');
    expect(tooltip.querySelector('.app-tooltip-size')).toHaveTextContent('1.25 GB');
    expect(tooltip.querySelector('.app-tooltip-subtitle')).toHaveTextContent('/Games/Alpha');
    expect(tooltip.style.left).toBe('116px');
    expect(tooltip.style.top).toBe('136px');
  });
});
