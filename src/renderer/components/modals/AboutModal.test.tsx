import React, { useRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ElectronAPI } from '../../../shared/types/ipc';
import { AboutModal } from './AboutModal';

function createMockElectronAPI(overrides: Partial<ElectronAPI> = {}): ElectronAPI {
  return {
    getAppVersion: vi.fn().mockResolvedValue('2.3.0'),
    openExternalUrl: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as ElectronAPI;
}

describe('AboutModal', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders application metadata, version from prop or IPC, and binds canonical CSS selectors', async () => {
    const electronAPI = createMockElectronAPI({
      getAppVersion: vi.fn().mockResolvedValue('2.4.1'),
    });
    const onClose = vi.fn();

    const { rerender } = render(
      <AboutModal isOpen={true} onClose={onClose} electronAPI={electronAPI} />
    );

    const dialog = screen.getByRole('dialog', { name: 'About & Credits' });
    expect(dialog.className).toContain('about-panel');

    await waitFor(() => {
      expect(screen.getByText('Version 2.4.1')).toBeTruthy();
    });
    expect(document.querySelector('.about-version')?.textContent).toBe('Version 2.4.1');
    expect(document.querySelector('.about-icon')).toBeTruthy();
    expect(document.querySelector('.about-body')).toBeTruthy();
    expect(document.querySelector('.about-brand')).toBeTruthy();
    expect(document.querySelector('.about-brand-text')).toBeTruthy();
    expect(document.querySelector('.about-tagline')).toBeTruthy();
    expect(document.querySelector('.about-author')).toBeTruthy();
    expect(document.querySelector('.about-credits-section')).toBeTruthy();
    expect(document.querySelector('.about-credits-intro')).toBeTruthy();
    expect(document.querySelectorAll('.about-credit-card').length).toBeGreaterThan(0);
    expect(document.querySelector('.about-license-note')).toBeTruthy();

    rerender(
      <AboutModal isOpen={true} onClose={onClose} electronAPI={electronAPI} version="9.9.9" />
    );
    expect(screen.getByText('Version 9.9.9')).toBeTruthy();
  });

  it('logs structured warning to console.warn when getAppVersion rejects', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const electronAPI = createMockElectronAPI({
      getAppVersion: vi
        .fn()
        .mockRejectedValue(new Error("Cannot read 'C:\\Users\\John Doe\\package.json'")),
    });

    render(<AboutModal isOpen={true} onClose={vi.fn()} electronAPI={electronAPI} />);

    await waitFor(() => {
      expect(warnSpy).toHaveBeenCalled();
    });
    const logged = JSON.stringify(warnSpy.mock.calls[0]);
    expect(logged).toContain('[AboutModal]');
    expect(logged).not.toContain('John Doe');
    expect(screen.getByText('Desktop Library')).toBeTruthy();
  });

  it('intercepts external link clicks with preventDefault and delegates to openExternalUrl', () => {
    const electronAPI = createMockElectronAPI();
    render(
      <AboutModal isOpen={true} onClose={vi.fn()} electronAPI={electronAPI} version="2.2.9" />
    );

    const creditLink = screen.getByRole('link', { name: 'Detect-It-Easy / XPEViewer' }) as HTMLAnchorElement;
    expect(creditLink.getAttribute('rel')).toBe('noopener noreferrer');

    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    const preventSpy = vi.spyOn(event, 'preventDefault');
    creditLink.dispatchEvent(event);

    expect(preventSpy).toHaveBeenCalledTimes(1);
    expect(electronAPI.openExternalUrl).toHaveBeenCalledWith('https://github.com/horsicq/Detect-It-Easy');
  });

  it('catches openExternalUrl rejections and logs sanitized url, error, and stack to console.warn', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const rejectionErr = new Error("Failed to launch 'C:\\Users\\John Doe\\browser.exe'");
    const electronAPI = createMockElectronAPI({
      openExternalUrl: vi.fn().mockRejectedValue(rejectionErr),
    });

    render(
      <AboutModal isOpen={true} onClose={vi.fn()} electronAPI={electronAPI} version="2.2.9" />
    );

    fireEvent.click(screen.getByRole('link', { name: 'XUnity.AutoTranslator' }));

    await waitFor(() => {
      expect(warnSpy).toHaveBeenCalled();
    });
    const logged = JSON.stringify(warnSpy.mock.calls[0]);
    expect(logged).toContain('[AboutModal]');
    expect(logged).toContain('https://github.com/bbepis/XUnity.AutoTranslator');
    expect(logged).not.toContain('John Doe');
  });

  it('transfers focus to fallbackFocusRef when invoking trigger is disconnected on close', () => {
    const electronAPI = createMockElectronAPI();

    function Harness() {
      const [open, setOpen] = useState(false);
      const [showTrigger, setShowTrigger] = useState(true);
      const fallbackRef = useRef<HTMLButtonElement | null>(null);

      return (
        <div>
          <button ref={fallbackRef} type="button">
            Fallback Target
          </button>
          <button type="button" onClick={() => setShowTrigger(false)}>
            Disconnect Trigger
          </button>
          {showTrigger && (
            <button type="button" onClick={() => setOpen(true)}>
              Open About
            </button>
          )}
          <AboutModal
            isOpen={open}
            onClose={() => setOpen(false)}
            fallbackFocusRef={fallbackRef}
            electronAPI={electronAPI}
            version="2.2.9"
          />
        </div>
      );
    }

    render(<Harness />);
    const openBtn = screen.getByRole('button', { name: 'Open About' });
    openBtn.focus();
    fireEvent.click(openBtn);
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect Trigger' }));

    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Fallback Target' }));
  });
});
