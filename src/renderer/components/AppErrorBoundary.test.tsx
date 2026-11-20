import React, { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ElectronAPI } from '../../shared/types/ipc';
import { AppErrorBoundary } from './AppErrorBoundary';

function ThrowError({ error }: { error: unknown }): React.ReactElement {
  throw error;
}

describe('AppErrorBoundary', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it('renders children when no error occurs', () => {
    render(
      <AppErrorBoundary>
        <div>Healthy Content</div>
      </AppErrorBoundary>
    );
    expect(screen.getByText('Healthy Content')).toBeTruthy();
  });

  it('catches render errors, sanitizes Windows and POSIX paths in UI and console.error, and includes causeChain', () => {
    const rootCause = new Error('ENOENT: /home/janedoe/games/save.dat');
    const err = new Error('Failed reading C:\\Users\\JaneDoe\\Games\\Yume\\data.json', {
      cause: rootCause,
    });
    err.stack = 'Error: Failed reading C:\\Users\\JaneDoe\\Games\\Yume\\data.json\n    at C:\\Users\\JaneDoe\\app\\renderer.js:10:5';

    render(
      <AppErrorBoundary>
        <ThrowError error={err} />
      </AppErrorBoundary>
    );

    const alertEl = screen.getByRole('alert');
    expect(alertEl).toBeTruthy();
    expect(alertEl.className).toContain('app-error-boundary-fallback');
    expect(alertEl.textContent).toContain('<USER_DIR>');
    expect(alertEl.textContent).not.toContain('JaneDoe');
    expect(alertEl.textContent).not.toContain('janedoe');

    const detailsEl = screen.getByLabelText('Diagnostic error details');
    expect(detailsEl.className).toContain('app-error-boundary-details');
    expect(detailsEl.textContent).toContain('<USER_DIR>');
    expect(detailsEl.textContent).not.toContain('JaneDoe');

    const boundaryLogCall = consoleErrorSpy.mock.calls.find(
      (call: unknown[]) => call[0] === '[AppErrorBoundary] Uncaught renderer error:'
    );
    expect(boundaryLogCall).toBeDefined();
    const payload = boundaryLogCall?.[1] as Record<string, unknown>;
    expect(String(payload.message)).toContain('<USER_DIR>');
    expect(String(payload.message)).not.toContain('JaneDoe');
    expect(String(payload.stack)).toContain('<USER_DIR>');
    expect(String(payload.stack)).not.toContain('JaneDoe');
    expect(Array.isArray(payload.causeChain)).toBe(true);
    expect(JSON.stringify(payload.causeChain)).toContain('<USER_DIR>');
    expect(JSON.stringify(payload.causeChain)).not.toContain('janedoe');
  });

  it('normalizes non-Error thrown values cleanly', () => {
    render(
      <AppErrorBoundary>
        <ThrowError error="string-failure-at-/Users/Alice/app" />
      </AppErrorBoundary>
    );

    const alertEl = screen.getByRole('alert');
    expect(alertEl.textContent).toContain('<USER_DIR>');
    expect(alertEl.textContent).not.toContain('Alice');
  });

  it('resolves appVersion asynchronously via injected electronAPI and tolerates rejection', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    const mockApi = {
      getAppVersion: vi.fn().mockResolvedValue('2.4.1'),
    } as unknown as ElectronAPI;

    render(
      <AppErrorBoundary electronAPI={mockApi}>
        <ThrowError error={new Error('Boom at C:\\Users\\John Doe\\file.txt')} />
      </AppErrorBoundary>
    );

    await waitFor(() => {
      expect(mockApi.getAppVersion).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy Error' }));
    });

    expect(writeText).toHaveBeenCalledTimes(1);
    const reportText = writeText.mock.calls[0][0] as string;
    const parsed = JSON.parse(reportText);
    expect(parsed.appVersion).toBe('2.4.1');
    expect(parsed.timestamp).toBeTruthy();
    expect(reportText).toContain('<USER_DIR>');
    expect(reportText).not.toContain('John Doe');
    expect(screen.getByRole('button', { name: 'Copied to Clipboard!' })).toBeTruthy();
  });

  it('tolerates getAppVersion rejection without crashing', async () => {
    const mockApi = {
      getAppVersion: vi.fn().mockRejectedValue(new Error('IPC down at /home/bob/app')),
    } as unknown as ElectronAPI;

    render(
      <AppErrorBoundary electronAPI={mockApi}>
        <div>Still OK</div>
      </AppErrorBoundary>
    );

    await waitFor(() => {
      expect(consoleWarnSpy).toHaveBeenCalled();
    });
    expect(screen.getByText('Still OK')).toBeTruthy();
    const warnArgs = consoleWarnSpy.mock.calls.find(
      (c: unknown[]) => c[0] === '[AppErrorBoundary] Failed to resolve app version:'
    );
    expect(warnArgs).toBeDefined();
    expect(String(warnArgs?.[1])).toContain('<USER_DIR>');
    expect(String(warnArgs?.[1])).not.toContain('bob');
  });

  it('transitions copy button feedback deterministically with timers and handles clipboard failure', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('Denied'));
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    render(
      <AppErrorBoundary appVersion="1.0.0">
        <ThrowError error={new Error('Crash')} />
      </AppErrorBoundary>
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy Error' }));
    });
    expect(screen.getByRole('button', { name: 'Copied to Clipboard!' })).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByRole('button', { name: 'Copy Error' })).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy Error' }));
    });
    expect(screen.getByRole('button', { name: 'Clipboard Access Denied (Select Text Below)' })).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByRole('button', { name: 'Copy Error' })).toBeTruthy();
  });

  it('resets error state on Retry and restores focus to #react-root', () => {
    const rootDiv = document.createElement('div');
    rootDiv.id = 'react-root';
    rootDiv.tabIndex = -1;
    document.body.appendChild(rootDiv);

    const onReset = vi.fn();
    function Harness() {
      const [shouldThrow, setShouldThrow] = useState(true);
      return (
        <AppErrorBoundary
          onReset={() => {
            setShouldThrow(false);
            onReset();
          }}
        >
          {shouldThrow ? <ThrowError error={new Error('Temporary crash')} /> : <div>Recovered UI</div>}
        </AppErrorBoundary>
      );
    }

    render(<Harness />, { container: rootDiv });
    expect(screen.getByRole('alert')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Recovered UI')).toBeTruthy();
    expect(document.activeElement).toBe(rootDiv);

    document.body.removeChild(rootDiv);
  });
});
