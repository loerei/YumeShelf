import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Modal } from './Modal';

describe('Modal compound shell', () => {
  afterEach(() => {
    document.getElementById('portal-root')?.remove();
    vi.restoreAllMocks();
  });

  it('portals into #portal-root when present and falls back to document.body when absent', () => {
    const portalRoot = document.createElement('div');
    portalRoot.id = 'portal-root';
    document.body.appendChild(portalRoot);

    const { rerender, unmount } = render(
      <Modal isOpen={true} onClose={vi.fn()} id="test-modal" className="custom-backdrop" panelClassName="custom-panel">
        <Modal.Header title="Settings" />
        <Modal.Body>Body content</Modal.Body>
        <Modal.Footer>Footer content</Modal.Footer>
      </Modal>
    );

    const dialog = screen.getByRole('dialog');
    expect(portalRoot.contains(dialog)).toBe(true);
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('tabindex', '-1');
    expect(dialog).toHaveAttribute('aria-labelledby', 'test-modal-title');
    expect(dialog.className).toBe('modal-panel custom-panel');
    expect(dialog.parentElement?.className).toBe('modal-backdrop custom-backdrop');

    expect(dialog.querySelector('.modal-header')).not.toBeNull();
    expect(dialog.querySelector('.modal-body')).not.toBeNull();
    expect(dialog.querySelector('.modal-footer')).not.toBeNull();
    expect(document.getElementById('test-modal-title')).toHaveTextContent('Settings');

    unmount();
    portalRoot.remove();

    const { rerender: rerenderFallback } = render(
      <Modal isOpen={true} onClose={vi.fn()}>
        <Modal.Header>Fallback Portal</Modal.Header>
        <Modal.Body>Body</Modal.Body>
      </Modal>
    );

    const fallbackDialog = screen.getByRole('dialog');
    expect(document.body.contains(fallbackDialog)).toBe(true);
    rerenderFallback(
      <Modal isOpen={false} onClose={vi.fn()}>
        <Modal.Header>Fallback Portal</Modal.Header>
        <Modal.Body>Body</Modal.Body>
      </Modal>
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders accessible Modal.Header close button with vector SVG and invokes onClose', () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={onClose}>
        <Modal.Header title="Confirm Action" />
        <Modal.Body>Are you sure?</Modal.Body>
      </Modal>
    );

    const closeBtn = screen.getByRole('button', { name: 'Close dialog' });
    expect(closeBtn).toHaveAttribute('title', 'Close dialog');
    const svg = closeBtn.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('stroke', 'currentColor');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(closeBtn.textContent?.trim()).toBe('');

    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('traps Tab and Shift+Tab focus within the dialog container', () => {
    render(
      <Modal isOpen={true} onClose={vi.fn()}>
        <Modal.Header title="Focus Trap" />
        <Modal.Body>
          <input aria-label="First input" />
        </Modal.Body>
        <Modal.Footer>
          <button type="button">Confirm</button>
        </Modal.Footer>
      </Modal>
    );

    const dialog = screen.getByRole('dialog');
    expect(document.activeElement).toBe(dialog);

    const closeBtn = screen.getByRole('button', { name: 'Close dialog' });
    const confirmBtn = screen.getByRole('button', { name: 'Confirm' });

    // Shift+Tab from dialog root wraps to last focusable
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(confirmBtn);

    // Tab from last focusable wraps to first focusable (close button)
    fireEvent.keyDown(confirmBtn, { key: 'Tab' });
    expect(document.activeElement).toBe(closeBtn);

    // Shift+Tab from first focusable wraps to last focusable
    fireEvent.keyDown(closeBtn, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(confirmBtn);
  });

  it('does not steal focus on cold boot when isOpen is false', () => {
    const existingBtn = document.createElement('button');
    existingBtn.textContent = 'Existing';
    document.body.appendChild(existingBtn);
    existingBtn.focus();

    const fallbackRef = createRef<HTMLButtonElement>();
    render(
      <>
        <button type="button" ref={fallbackRef}>
          Fallback
        </button>
        <Modal isOpen={false} onClose={vi.fn()} fallbackFocusRef={fallbackRef}>
          <Modal.Header title="Closed" />
        </Modal>
      </>
    );

    expect(document.activeElement).toBe(existingBtn);
    existingBtn.remove();
  });

  it('restores focus to connected trigger on close, or fallbackFocusRef when trigger is disconnected or unmounted', () => {
    const triggerBtn = document.createElement('button');
    triggerBtn.textContent = 'Open Modal';
    document.body.appendChild(triggerBtn);
    triggerBtn.focus();

    const fallbackRef = createRef<HTMLButtonElement>();

    const { rerender, unmount } = render(
      <>
        <button type="button" ref={fallbackRef}>
          Fallback Anchor
        </button>
        <Modal isOpen={true} onClose={vi.fn()} fallbackFocusRef={fallbackRef}>
          <Modal.Header title="Dialog" />
        </Modal>
      </>
    );

    expect(document.activeElement).toBe(screen.getByRole('dialog'));

    // Close while trigger is connected -> restores to trigger
    rerender(
      <>
        <button type="button" ref={fallbackRef}>
          Fallback Anchor
        </button>
        <Modal isOpen={false} onClose={vi.fn()} fallbackFocusRef={fallbackRef}>
          <Modal.Header title="Dialog" />
        </Modal>
      </>
    );
    expect(document.activeElement).toBe(triggerBtn);

    // Reopen, then disconnect trigger before unmounting -> restores to fallbackFocusRef
    rerender(
      <>
        <button type="button" ref={fallbackRef}>
          Fallback Anchor
        </button>
        <Modal isOpen={true} onClose={vi.fn()} fallbackFocusRef={fallbackRef}>
          <Modal.Header title="Dialog" />
        </Modal>
      </>
    );
    triggerBtn.remove();

    rerender(
      <>
        <button type="button" ref={fallbackRef}>
          Fallback Anchor
        </button>
      </>
    );
    expect(document.activeElement).toBe(fallbackRef.current);
    unmount();
  });

  it('does not hijack focus if focus already moved to a surviving external element before unmount', () => {
    const externalBtn = document.createElement('button');
    externalBtn.textContent = 'External Target';
    document.body.appendChild(externalBtn);

    const fallbackRef = createRef<HTMLButtonElement>();

    const { unmount } = render(
      <>
        <button type="button" ref={fallbackRef}>
          Fallback Anchor
        </button>
        <Modal isOpen={true} onClose={vi.fn()} fallbackFocusRef={fallbackRef}>
          <Modal.Header title="Dialog" />
        </Modal>
      </>
    );

    externalBtn.focus();
    expect(document.activeElement).toBe(externalBtn);

    unmount();
    expect(document.activeElement).toBe(externalBtn);
    externalBtn.remove();
  });

  it('dismisses on backdrop click only when both mousedown and click originate on backdrop', () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={onClose}>
        <Modal.Header title="Backdrop Test" />
        <Modal.Body>Content</Modal.Body>
      </Modal>
    );

    const dialog = screen.getByRole('dialog');
    const backdrop = dialog.parentElement as HTMLElement;

    // Drag selection starting inside dialog and releasing on backdrop should NOT close
    fireEvent.mouseDown(dialog);
    fireEvent.click(backdrop);
    expect(onClose).not.toHaveBeenCalled();

    // Direct mousedown + click on backdrop SHOULD close
    fireEvent.mouseDown(backdrop);
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('handles local Escape key respecting defaultPrevented without registering global window listeners', () => {
    const addListenerSpy = vi.spyOn(window, 'addEventListener');
    const onClose = vi.fn();

    render(
      <Modal isOpen={true} onClose={onClose}>
        <Modal.Header title="Escape Test" />
        <Modal.Body>
          <input
            aria-label="Escape consumer"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
              }
            }}
          />
        </Modal.Body>
      </Modal>
    );

    // No global keydown listener attached by Modal
    const keydownCalls = addListenerSpy.mock.calls.filter(([type]) => type === 'keydown');
    expect(keydownCalls).toHaveLength(0);

    // Child consumes Escape via preventDefault -> Modal stays open
    const input = screen.getByLabelText('Escape consumer');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();

    // Escape directly on dialog calls preventDefault and invokes onClose
    const dialog = screen.getByRole('dialog');
    const escapeEvent = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    dialog.dispatchEvent(escapeEvent);
    expect(escapeEvent.defaultPrevented).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
