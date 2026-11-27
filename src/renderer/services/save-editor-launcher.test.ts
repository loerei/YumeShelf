import { act, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ElectronAPI } from '../../shared/types/ipc';
import { mountStandaloneSaveEditor } from '../../save-editor';
import { ElectronSaveEditorLauncher } from './save-editor-launcher';

describe('ElectronSaveEditorLauncher', () => {
  it('dispatches openSaveEditorWindow with trimmed gameKey', async () => {
    const openSaveEditorWindow = vi.fn().mockResolvedValue(undefined);
    const launcher = new ElectronSaveEditorLauncher({ openSaveEditorWindow });

    await launcher.open('  game-123  ');

    expect(openSaveEditorWindow).toHaveBeenCalledTimes(1);
    expect(openSaveEditorWindow).toHaveBeenCalledWith('game-123');
  });

  it('throws when IPC bridge is unavailable', async () => {
    const launcher = new ElectronSaveEditorLauncher(undefined);

    await expect(launcher.open('game-123')).rejects.toThrow('Save editor IPC bridge is unavailable');
  });

  it('throws when gameKey is empty or whitespace', async () => {
    const openSaveEditorWindow = vi.fn().mockResolvedValue(undefined);
    const launcher = new ElectronSaveEditorLauncher({ openSaveEditorWindow });

    await expect(launcher.open('   ')).rejects.toThrow('Missing required gameKey');
    expect(openSaveEditorWindow).not.toHaveBeenCalled();
  });

  it('surfaces IPC rejection errors when window launch fails', async () => {
    const openSaveEditorWindow = vi.fn().mockRejectedValue(new Error('Window spawn failed'));
    const launcher = new ElectronSaveEditorLauncher({ openSaveEditorWindow });

    await expect(launcher.open('game-123')).rejects.toThrow('Window spawn failed');
  });
});

describe('mountStandaloneSaveEditor', () => {
  afterEach(() => {
    delete (window as { __IS_STANDALONE_SAVE_EDITOR__?: unknown }).__IS_STANDALONE_SAVE_EDITOR__;
    document.body.classList.remove('standalone-save-editor');
    window.history.replaceState(null, '', '/');
    vi.restoreAllMocks();
  });

  it('throws when root container is missing before registering window listeners', async () => {
    const addListenerSpy = vi.spyOn(window, 'addEventListener');

    await expect(mountStandaloneSaveEditor(null, '?gameKey=my-game')).rejects.toThrow(
      'Failed to find #save-editor-root container'
    );

    expect(window.__IS_STANDALONE_SAVE_EDITOR__).toBeUndefined();
    expect(document.body.classList.contains('standalone-save-editor')).toBe(false);
    expect(addListenerSpy).not.toHaveBeenCalled();
  });

  it('sets __IS_STANDALONE_SAVE_EDITOR__, applies body class, mounts SaveEditorApp with injected electronAPI, and cleans up idempotently on dispose', async () => {
    const fakeRoot = document.createElement('div');
    fakeRoot.id = 'save-editor-root';
    document.body.appendChild(fakeRoot);

    const mockApi = {
      getSaveFolder: vi.fn().mockResolvedValue({ path: '/saves/my-game', engine: 'rpg-mv-mz', confidence: 'high', source: 'deterministic' }),
      listSaveFiles: vi.fn().mockResolvedValue(['save01.sav']),
      loadTranslations: vi.fn().mockResolvedValue({}),
      getAppVersion: vi.fn().mockResolvedValue('2.2.9'),
    } as unknown as ElectronAPI;

    const removeListenerSpy = vi.spyOn(window, 'removeEventListener');
    let cleanup!: () => void;

    await act(async () => {
      cleanup = await mountStandaloneSaveEditor(fakeRoot, '?gameKey=my-game', {
        electronAPI: mockApi,
      });
    });

    expect(window.__IS_STANDALONE_SAVE_EDITOR__).toBe(true);
    expect(document.body.classList.contains('standalone-save-editor')).toBe(true);
    await waitFor(() => {
      expect(within(fakeRoot).getByRole('button', { name: 'save01.sav' })).toBeInTheDocument();
    });
    expect(mockApi.getSaveFolder).toHaveBeenCalledWith('my-game');

    act(() => {
      cleanup();
    });

    expect(document.body.classList.contains('standalone-save-editor')).toBe(false);
    expect(fakeRoot.innerHTML).toBe('');
    expect(removeListenerSpy).toHaveBeenCalledWith('beforeunload', cleanup);
    expect(removeListenerSpy).toHaveBeenCalledWith('error', expect.any(Function));
    expect(removeListenerSpy).toHaveBeenCalledWith('unhandledrejection', expect.any(Function));

    const callsAfterFirstDispose = removeListenerSpy.mock.calls.length;
    expect(callsAfterFirstDispose).toBe(7);

    // Idempotent second cleanup
    act(() => {
      cleanup();
    });
    expect(removeListenerSpy).toHaveBeenCalledTimes(callsAfterFirstDispose);
  });

  it('renders .save-editor-error-banner when gameKey is missing or empty', async () => {
    const fakeRoot = document.createElement('div');
    fakeRoot.id = 'save-editor-root';
    document.body.appendChild(fakeRoot);

    let cleanup!: () => void;
    await act(async () => {
      cleanup = await mountStandaloneSaveEditor(fakeRoot, '?gameKey=   ');
    });

    const banner = fakeRoot.querySelector('.save-editor-error-banner');
    expect(banner).not.toBeNull();
    expect(banner).toHaveAttribute('role', 'alert');
    expect(banner?.textContent).toBe('Missing required gameKey parameter');

    act(() => {
      cleanup();
    });
  });

  it('registers global error sanitizer that redacts paths and detaches on cleanup', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fakeRoot = document.createElement('div');
    fakeRoot.id = 'save-editor-root';
    document.body.appendChild(fakeRoot);

    const mockApi = {
      getSaveFolder: vi.fn().mockResolvedValue({ path: '/saves/valid', engine: null, confidence: 'none' }),
      listSaveFiles: vi.fn().mockResolvedValue([]),
      loadTranslations: vi.fn().mockResolvedValue({}),
      getAppVersion: vi.fn().mockResolvedValue('2.2.9'),
    } as unknown as ElectronAPI;

    let cleanup!: () => void;
    await act(async () => {
      cleanup = await mountStandaloneSaveEditor(fakeRoot, '?gameKey=valid-game', {
        electronAPI: mockApi,
      });
    });

    const errEvent = new ErrorEvent('error', {
      message: 'Crash at C:\\Users\\Alice\\save.dat',
      filename: 'C:\\Users\\Alice\\renderer.js',
      lineno: 42,
      colno: 7,
      error: new Error('Boom at C:\\Users\\Alice\\save.dat'),
    });
    window.dispatchEvent(errEvent);

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const [prefix, payload] = consoleErrorSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(prefix).toBe('[SaveEditor] Uncaught error:');
    expect(JSON.stringify(payload)).toEqual(expect.not.stringContaining('Alice'));
    expect(payload.message).toBe('Crash at <USER_DIR>\\save.dat');

    act(() => {
      cleanup();
    });
    consoleErrorSpy.mockClear();

    window.dispatchEvent(
      new ErrorEvent('error', {
        message: 'After cleanup',
      })
    );
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});
